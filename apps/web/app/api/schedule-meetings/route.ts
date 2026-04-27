import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

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
    const approved = await prisma.meetingRequest.findMany({
      where: { status: 'APPROVED', timeBlockId: null },
      include: {
        requester: true,
        targetSponsor: true,
        targetUser: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    // Build a real-time map of occupied slots as we schedule
    const occupiedByUser = new Map<string, Set<string>>()      // userId → Set<timeBlockId>
    const occupiedBySponsor = new Map<string, Set<string>>()   // sponsorId → Set<timeBlockId>

    // Pre-load already confirmed meetings
    const existingConfirmed = await prisma.meetingRequest.findMany({
      where: { status: 'CONFIRMED', timeBlockId: { not: null } },
      select: { requesterId: true, targetUserId: true, targetSponsorId: true, timeBlockId: true },
    })
    const existingSponsorMeetings = await prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED' },
      select: { userId: true, sponsorId: true, timeBlockId: true },
    })

    for (const r of existingConfirmed) {
      if (r.timeBlockId) {
        addOccupied(occupiedByUser, r.requesterId, r.timeBlockId)
        if (r.targetUserId) addOccupied(occupiedByUser, r.targetUserId, r.timeBlockId)
        if (r.targetSponsorId) addOccupied(occupiedBySponsor, r.targetSponsorId, r.timeBlockId)
      }
    }
    for (const sm of existingSponsorMeetings) {
      addOccupied(occupiedByUser, sm.userId, sm.timeBlockId)
      addOccupied(occupiedBySponsor, sm.sponsorId, sm.timeBlockId)
    }

    const allTimeBlocks = await prisma.timeBlock.findMany({
      where: { conferenceId },
      orderBy: { startsAt: 'asc' },
    })

    let scheduled = 0
    let skipped = 0
    const results: { requestId: string; timeBlockId: string | null; reason?: string }[] = []

    for (const request of approved) {
      const requesterOccupied = occupiedByUser.get(request.requesterId) ?? new Set()
      const targetOccupied = request.targetUserId
        ? (occupiedByUser.get(request.targetUserId) ?? new Set())
        : request.targetSponsorId
        ? (occupiedBySponsor.get(request.targetSponsorId) ?? new Set())
        : new Set<string>()

      const available = allTimeBlocks.find(tb =>
        !requesterOccupied.has(tb.id) && !targetOccupied.has(tb.id)
      )

      if (!available) {
        skipped++
        results.push({ requestId: request.id, timeBlockId: null, reason: 'No mutual availability' })
        continue
      }

      await prisma.meetingRequest.update({
        where: { id: request.id },
        data: { status: 'CONFIRMED', timeBlockId: available.id },
      })

      // Create SponsorMeeting if applicable
      const sponsorId = request.targetSponsorId ?? (request.requester as any).sponsorId ?? null
      const attendeeId = request.targetUserId ?? (sponsorId ? request.requesterId : null)
      if (sponsorId && attendeeId) {
        const existing = await prisma.sponsorMeeting.findFirst({
          where: { sponsorId, userId: attendeeId, timeBlockId: available.id },
        })
        if (!existing) {
          await prisma.sponsorMeeting.create({
            data: { sponsorId, userId: attendeeId, timeBlockId: available.id, status: 'CONFIRMED' },
          })
        }
      }

      // Mark slot as occupied for next iterations
      addOccupied(occupiedByUser, request.requesterId, available.id)
      if (request.targetUserId) addOccupied(occupiedByUser, request.targetUserId, available.id)
      if (request.targetSponsorId) addOccupied(occupiedBySponsor, request.targetSponsorId, available.id)

      scheduled++
      results.push({ requestId: request.id, timeBlockId: available.id })
    }

    return NextResponse.json({ scheduled, skipped, results })
  }

  // ── Get available slots for a specific request ────────────────────────────
  const { requestId } = body
  if (!requestId) return NextResponse.json({ error: 'requestId required' }, { status: 400 })

  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
    include: { requester: true, targetUser: true, targetSponsor: true },
  })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Find all occupied slots for requester
  const [requesterMeetings, targetUserMeetings, targetSponsorMeetings] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: { status: 'CONFIRMED', timeBlockId: { not: null }, requesterId: request.requesterId },
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

  const busyRequester = new Set(requesterMeetings.map(m => m.timeBlockId!))
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

function addOccupied(map: Map<string, Set<string>>, key: string, value: string) {
  if (!map.has(key)) map.set(key, new Set())
  map.get(key)!.add(value)
}
