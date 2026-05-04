import { NextResponse } from 'next/server'
import { prisma, getActiveConflicts } from '@conference/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user as any
  if (!user.sponsorId) {
    return NextResponse.json({ sponsor: null, stats: null, conflicts: [], requestedIds: [] })
  }

  const [sponsor, pendingCount, confirmedCount, totalRequestCount, sponsorMeetingsCount, conflicts, requestedIds] = await Promise.all([
    prisma.sponsor.findUnique({
      where: { id: user.sponsorId },
      include: { users: { select: { id: true, name: true, image: true, jobTitle: true, email: true, role: true } } },
    }),
    prisma.meetingRequest.count({
      where: {
        status: 'PENDING',
        OR: [
          { targetSponsorId: user.sponsorId },
          { requester: { sponsorId: user.sponsorId }, targetSponsorId: null },
        ],
      },
    }),
    prisma.meetingRequest.count({
      where: {
        status: { in: ['CONFIRMED', 'APPROVED'] },
        OR: [
          { targetSponsorId: user.sponsorId },
          { requester: { sponsorId: user.sponsorId }, targetSponsorId: null },
        ],
      },
    }),
    prisma.meetingRequest.count({
      where: {
        OR: [
          { targetSponsorId: user.sponsorId },
          { requester: { sponsorId: user.sponsorId }, targetSponsorId: null },
        ],
      },
    }),
    prisma.sponsorMeeting.count({ where: { sponsorId: user.sponsorId } }),
    getActiveConflicts(prisma),
    prisma.meetingRequest.findMany({
      where: { requesterId: user.id },
      select: { targetUserId: true },
    }),
  ])

  return NextResponse.json({
    sponsor: JSON.parse(JSON.stringify(sponsor)),
    stats: {
      pendingCount,
      confirmedCount,
      totalMeetings: totalRequestCount + sponsorMeetingsCount,
    },
    conflicts,
    requestedIds: requestedIds.map(r => r.targetUserId).filter(Boolean),
  })
}
