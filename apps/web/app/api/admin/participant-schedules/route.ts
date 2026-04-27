import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

// GET /api/admin/participant-schedules?requesterId=&targetUserId=&targetSponsorId=
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const requesterId = searchParams.get('requesterId')
  const targetUserId = searchParams.get('targetUserId') || null
  const targetSponsorId = searchParams.get('targetSponsorId') || null

  if (!requesterId) return NextResponse.json({ error: 'requesterId required' }, { status: 400 })

  const [timeBlocks, requesterUser, targetUser, targetSponsor,
    requesterMeetings, requesterSponsorMeetings,
    targetUserMeetings, targetSponsorMeetings] = await Promise.all([
    // All time blocks
    prisma.timeBlock.findMany({ orderBy: { startsAt: 'asc' } }),

    // Requester details
    prisma.user.findUnique({
      where: { id: requesterId },
      select: { id: true, name: true, image: true, company: true, jobTitle: true },
    }),

    // Target user details
    targetUserId ? prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, image: true, company: true, jobTitle: true },
    }) : Promise.resolve(null),

    // Target sponsor details
    targetSponsorId ? prisma.sponsor.findUnique({
      where: { id: targetSponsorId },
      select: { id: true, name: true, logoUrl: true, tier: true },
    }) : Promise.resolve(null),

    // Requester's confirmed meeting requests (as requester)
    prisma.meetingRequest.findMany({
      where: { requesterId, status: 'CONFIRMED', timeBlockId: { not: null } },
      select: {
        timeBlockId: true,
        targetUser: { select: { name: true } },
        targetSponsor: { select: { name: true } },
      },
    }),

    // Requester's sponsor meetings
    prisma.sponsorMeeting.findMany({
      where: { userId: requesterId, status: 'CONFIRMED' },
      select: { timeBlockId: true, sponsor: { select: { name: true } } },
    }),

    // Target user's confirmed meetings (if peer)
    targetUserId ? prisma.meetingRequest.findMany({
      where: {
        status: 'CONFIRMED', timeBlockId: { not: null },
        OR: [{ requesterId: targetUserId }, { targetUserId }],
      },
      select: {
        timeBlockId: true,
        requester: { select: { name: true } },
        targetUser: { select: { name: true } },
        targetSponsor: { select: { name: true } },
        requesterId: true,
      },
    }) : Promise.resolve([]),

    // Target sponsor's confirmed meetings (if sponsor)
    targetSponsorId ? prisma.sponsorMeeting.findMany({
      where: { sponsorId: targetSponsorId, status: 'CONFIRMED' },
      select: { timeBlockId: true, user: { select: { name: true } } },
    }) : Promise.resolve([]),
  ])

  // Build requester's busy map: timeBlockId → name of who they're meeting
  const requesterBusy = new Map<string, string>()
  for (const m of requesterMeetings) {
    if (m.timeBlockId) {
      requesterBusy.set(m.timeBlockId, m.targetSponsor?.name ?? m.targetUser?.name ?? 'Meeting')
    }
  }
  for (const m of requesterSponsorMeetings) {
    requesterBusy.set(m.timeBlockId, m.sponsor.name)
  }

  // Build target's busy map
  const targetBusy = new Map<string, string>()
  if (targetUserId) {
    for (const m of targetUserMeetings) {
      if (m.timeBlockId) {
        const withName = m.requesterId === targetUserId
          ? (m.targetSponsor?.name ?? m.targetUser?.name ?? 'Meeting')
          : (m.requester?.name ?? 'Meeting')
        targetBusy.set(m.timeBlockId, withName)
      }
    }
  }
  if (targetSponsorId) {
    for (const m of targetSponsorMeetings) {
      targetBusy.set(m.timeBlockId, m.user.name ?? 'Attendee')
    }
  }

  const blocks = timeBlocks.map(tb => ({
    id: tb.id,
    startsAt: tb.startsAt.toISOString(),
    endsAt: tb.endsAt.toISOString(),
    location: tb.location,
    requesterWith: requesterBusy.get(tb.id) ?? null,
    targetWith: targetBusy.get(tb.id) ?? null,
  }))

  return NextResponse.json({
    requester: requesterUser,
    target: targetUser ?? (targetSponsor ? { ...targetSponsor, isSponsor: true } : null),
    blocks,
  })
}
