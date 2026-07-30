import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, autoScheduleByPriority, REQUEST_BOARD_PRIORITIES } from '@conference/db'

// POST /api/schedule-meetings
// Body: { requestId } — returns available time blocks for both parties
// Body: { autoScheduleAll: true } — bulk-assigns all APPROVED requests

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Resolve the active conference ID
  const activeConf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const conferenceId = activeConf?.id ?? process.env.CONFERENCE_ID
  if (!conferenceId) return NextResponse.json({ error: 'No active conference' }, { status: 400 })

  // ── Auto-schedule all approved requests ──────────────────────────────────
  if (body.autoScheduleAll) {
    // One scheduler for every bulk pass: the shared engine enforces exclusive
    // slots (one meeting per sponsor per block, attendee free at the block,
    // blackouts, commit-time revalidation). Scoped to the requests board's
    // tiers — Auto-lane Best Fit picks are scheduled mutually by the
    // auto-match sweep, never by this bulk pass.
    const result = await autoScheduleByPriority(prisma, {
      conferenceId, statuses: ['APPROVED'], priorities: REQUEST_BOARD_PRIORITIES,
    })

    // Peer-to-peer requests (attendee ↔ attendee, no sponsor on either side)
    // have no booth and no Auto lane, so the engine cannot resolve them —
    // schedule them here under the same exclusive rule: the first block where
    // BOTH attendees are free (meetings, confirmed request holds, blackouts).
    const peers = await prisma.meetingRequest.findMany({
      where: {
        status: 'APPROVED', timeBlockId: null,
        targetSponsorId: null, targetUserId: { not: null },
        requester: { sponsorId: null },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, requesterId: true, targetUserId: true },
    })
    const peerResults: { requestId: string; timeBlockId: string | null; reason?: string }[] = []
    let peerScheduled = 0
    if (peers.length) {
      const userIds = [...new Set(peers.flatMap(p => [p.requesterId, p.targetUserId!]))]
      const [timeBlocks, sponsorMtgs, peerMtgs, confirmedReqs, blackouts] = await Promise.all([
        prisma.timeBlock.findMany({ where: { conferenceId }, orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true, endsAt: true } }),
        prisma.sponsorMeeting.findMany({ where: { status: 'CONFIRMED', userId: { in: userIds } }, select: { userId: true, timeBlockId: true } }),
        prisma.meeting.findMany({
          where: { status: { in: ['PENDING', 'CONFIRMED'] }, OR: [{ attendeeAId: { in: userIds } }, { attendeeBId: { in: userIds } }] },
          select: { attendeeAId: true, attendeeBId: true, timeBlockId: true },
        }),
        prisma.meetingRequest.findMany({
          where: { status: 'CONFIRMED', timeBlockId: { not: null }, OR: [{ requesterId: { in: userIds } }, { targetUserId: { in: userIds } }] },
          select: { requesterId: true, targetUserId: true, timeBlockId: true },
        }),
        prisma.blackoutTime.findMany({ where: { userId: { in: userIds } }, select: { userId: true, startsAt: true, endsAt: true } }),
      ])
      const busy = new Map<string, Set<string>>()
      const mark = (u: string | null, b: string | null) => {
        if (!u || !b) return
        let s = busy.get(u); if (!s) { s = new Set(); busy.set(u, s) }
        s.add(b)
      }
      for (const m of sponsorMtgs) mark(m.userId, m.timeBlockId)
      for (const m of peerMtgs) { mark(m.attendeeAId, m.timeBlockId); mark(m.attendeeBId, m.timeBlockId) }
      for (const r of confirmedReqs) { mark(r.requesterId, r.timeBlockId); mark(r.targetUserId, r.timeBlockId) }
      const blocked = (u: string, tb: { startsAt: Date; endsAt: Date }) =>
        blackouts.some(b => b.userId === u && b.startsAt < tb.endsAt && tb.startsAt < b.endsAt)
      const writes = []
      for (const p of peers) {
        const a = p.requesterId, z = p.targetUserId!
        const slot = timeBlocks.find(tb =>
          !busy.get(a)?.has(tb.id) && !busy.get(z)?.has(tb.id) && !blocked(a, tb) && !blocked(z, tb))
        if (!slot) { peerResults.push({ requestId: p.id, timeBlockId: null, reason: 'No open slot that works for both sides' }); continue }
        mark(a, slot.id); mark(z, slot.id)
        peerScheduled++
        peerResults.push({ requestId: p.id, timeBlockId: slot.id })
        writes.push(prisma.meetingRequest.update({ where: { id: p.id }, data: { status: 'CONFIRMED', timeBlockId: slot.id } }))
      }
      if (writes.length) await prisma.$transaction(writes)
    }

    if (result.scheduled.length + peerScheduled > 0) revalidateTag('meetings')
    return NextResponse.json({
      scheduled: result.scheduled.length + peerScheduled,
      skipped: result.skipped.length + (peerResults.length - peerScheduled),
      results: [
        ...result.scheduled.map(s => ({ requestId: s.requestId, timeBlockId: s.timeBlockId })),
        ...result.skipped.map(s => ({ requestId: s.requestId, timeBlockId: null, reason: s.reason })),
        ...peerResults,
      ],
    })
  }

  // ── Get available slots for a specific request ────────────────────────────
  const { requestId } = body
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
    include: { requester: true, targetUser: true, targetSponsor: true },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find all occupied slots for requester (their requests AND their booked
  // sponsor meetings — a slot with either is not available)
  const [requesterMeetings, requesterSponsorMtgs, targetUserMeetings, targetSponsorMeetings] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: { status: 'CONFIRMED', timeBlockId: { not: null }, requesterId: request.requesterId },
      select: { timeBlockId: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED', userId: request.requesterId },
      select: { timeBlockId: true },
    }),
    request.targetUserId ? prisma.meetingRequest.findMany({
      where: {
        status: 'CONFIRMED', timeBlockId: { not: null },
        OR: [{ requesterId: request.targetUserId }, { targetUserId: request.targetUserId }],
      },
      select: { timeBlockId: true },
    }) : Promise.resolve([]),
    request.targetSponsorId ? prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED', sponsorId: request.targetSponsorId },
      select: { timeBlockId: true },
    }) : Promise.resolve([]),
  ])

  const busyRequester = new Set([
    ...requesterMeetings.map(m => m.timeBlockId!),
    ...requesterSponsorMtgs.map(m => m.timeBlockId),
  ])
  const busyTarget = new Set([
    ...targetUserMeetings.map(m => m.timeBlockId!),
    ...targetSponsorMeetings.map(m => m.timeBlockId),
  ])

  const allTimeBlocks = await prisma.timeBlock.findMany({
    where: { conferenceId },
    orderBy: { startsAt: 'asc' },
  })

  const availableSlots = allTimeBlocks.map(tb => ({
    id: tb.id,
    startsAt: tb.startsAt.toISOString(),
    endsAt: tb.endsAt.toISOString(),
    location: tb.location,
    requesterFree: !busyRequester.has(tb.id),
    targetFree: !busyTarget.has(tb.id),
    bothFree: !busyRequester.has(tb.id) && !busyTarget.has(tb.id),
  }))

  const firstAvailable = availableSlots.find(s => s.bothFree)

  return NextResponse.json({ availableSlots, firstAvailable })
}
