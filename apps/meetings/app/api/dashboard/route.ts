import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { format } from 'date-fns'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({}, { status: 401 })

  const user = session.user as any
  const userId = user.id as string
  const sponsorId = (user.sponsorId ?? null) as string | null
  const isStaff = user.role === 'STAFF'

  if (isStaff) {
    const [
      totalRequests, pendingRequests, approvedRequests, confirmedRequests, rejectedRequests,
      totalAttendees, totalSponsors, totalTimeBlocks, usedTimeBlocks, recentRequests,
    ] = await Promise.all([
      prisma.meetingRequest.count(),
      prisma.meetingRequest.count({ where: { status: 'PENDING' } }),
      prisma.meetingRequest.count({ where: { status: 'APPROVED' } }),
      prisma.meetingRequest.count({ where: { status: 'CONFIRMED' } }),
      prisma.meetingRequest.count({ where: { status: 'REJECTED' } }),
      prisma.user.count({ where: { role: { in: ['ATTENDEE', 'SPEAKER'] } } }),
      prisma.sponsor.count(),
      prisma.timeBlock.count(),
      prisma.meetingRequest.count({ where: { timeBlockId: { not: null } } }),
      prisma.meetingRequest.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          requester: { select: { name: true, company: true, image: true } },
          targetUser: { select: { name: true, company: true } },
          targetSponsor: { select: { name: true } },
        },
      }),
    ])
    return NextResponse.json({
      isStaff: true,
      totalRequests, pendingRequests, approvedRequests, confirmedRequests, rejectedRequests,
      totalAttendees, totalSponsors, totalTimeBlocks, usedTimeBlocks, recentRequests,
    })
  }

  // ── User dashboard ──
  const now = new Date()

  const reqCountsP = prisma.meetingRequest.groupBy({
    by: ['status'],
    where: { requesterId: userId },
    _count: true,
  })
  const targetCountsP = prisma.meetingRequest.groupBy({
    by: ['status'],
    where: { targetUserId: userId },
    _count: true,
  })

  const [
    reqCounts, targetCounts,
    myRequests,
    inboundByUser, inboundBySponsor,
    profileUser,
    meetingsAsRequester, meetingsAsTarget,
    sponsorWithTeam,
  ] = await Promise.all([
    reqCountsP,
    targetCountsP,
    prisma.meetingRequest.findMany({
      where: { requesterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 4,
      include: {
        targetUser: { select: { name: true, company: true, image: true } },
        targetSponsor: { select: { name: true, logoUrl: true } },
      },
    }),
    prisma.meetingRequest.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        requester: { select: { name: true, image: true, jobTitle: true, company: true } },
      },
    }),
    sponsorId
      ? prisma.meetingRequest.findMany({
          where: { targetSponsorId: sponsorId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            requester: { select: { name: true, image: true, jobTitle: true, company: true } },
          },
        })
      : Promise.resolve([]),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, image: true, bio: true, company: true, jobTitle: true, website: true, solutionsSeeking: true, solutionsOffering: true, companySize: true, annualRevenue: true, sponsorId: true },
    }),
    prisma.meetingRequest.findMany({
      where: { requesterId: userId, status: 'CONFIRMED', timeBlockId: { not: null }, timeBlock: { startsAt: { gte: now } } },
      orderBy: { timeBlock: { startsAt: 'asc' } },
      take: 5,
      include: {
        requester: { select: { name: true, image: true, jobTitle: true, company: true } },
        targetUser: { select: { name: true, image: true, jobTitle: true, company: true } },
        targetSponsor: { select: { name: true } },
        timeBlock: true,
      },
    }),
    prisma.meetingRequest.findMany({
      where: { targetUserId: userId, status: 'CONFIRMED', timeBlockId: { not: null }, timeBlock: { startsAt: { gte: now } } },
      orderBy: { timeBlock: { startsAt: 'asc' } },
      take: 5,
      include: {
        requester: { select: { name: true, image: true, jobTitle: true, company: true } },
        targetUser: { select: { name: true, image: true, jobTitle: true, company: true } },
        targetSponsor: { select: { name: true } },
        timeBlock: true,
      },
    }),
    sponsorId
      ? prisma.sponsor.findUnique({
          where: { id: sponsorId },
          include: { users: { select: { id: true, name: true, image: true, jobTitle: true, email: true, role: true } } },
        })
      : Promise.resolve(null),
  ])

  const countMap: Record<string, number> = {}
  for (const row of reqCounts) countMap[row.status] = (countMap[row.status] ?? 0) + row._count
  for (const row of targetCounts) countMap[row.status] = (countMap[row.status] ?? 0) + row._count
  const totalRequests = Object.values(countMap).reduce((a, b) => a + b, 0)

  const inboundSeen = new Set<string>()
  const inboundRequests = [...inboundByUser, ...inboundBySponsor]
    .filter(r => { if (inboundSeen.has(r.id)) return false; inboundSeen.add(r.id); return true })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5)

  const meetingSeen = new Set<string>()
  const myMeetings = [...meetingsAsRequester, ...meetingsAsTarget]
    .filter(r => { if (meetingSeen.has(r.id)) return false; meetingSeen.add(r.id); return true })
    .sort((a, b) => new Date(a.timeBlock!.startsAt).getTime() - new Date(b.timeBlock!.startsAt).getTime())
    .slice(0, 5)

  return NextResponse.json({
    isStaff: false,
    isSponsor: !!sponsorId,
    userName: user.name,
    totalRequests,
    pendingRequests: countMap['PENDING'] ?? 0,
    approvedRequests: countMap['APPROVED'] ?? 0,
    confirmedRequests: countMap['CONFIRMED'] ?? 0,
    rejectedRequests: countMap['REJECTED'] ?? 0,
    myRequests,
    inboundRequests,
    profileUser,
    myMeetings,
    sponsorWithTeam,
  })
}
