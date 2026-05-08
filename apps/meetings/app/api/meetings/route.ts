import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma, getActiveConflicts } from '@conference/db'

const INCLUDE = {
  requester: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true } },
  targetUser: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true } },
  targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true, website: true } },
  timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } },
} as const

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({}, { status: 401 })

  const userId = (session.user as any).id as string
  const sponsorId = (session.user as any).sponsorId as string | null

  const [byRequester, byTarget, bySponsor, sponsorMeetings, conflicts] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: { requesterId: userId },
      include: INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    prisma.meetingRequest.findMany({
      where: { targetUserId: userId },
      include: INCLUDE,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    }),
    sponsorId
      ? prisma.meetingRequest.findMany({
          where: { targetSponsorId: sponsorId },
          include: INCLUDE,
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 200,
        })
      : Promise.resolve([]),
    sponsorId
      ? prisma.sponsorMeeting.findMany({
          where: { sponsorId, status: 'CONFIRMED' },
          include: {
            user: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
            timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } },
            sponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
          },
          orderBy: { timeBlock: { startsAt: 'asc' } },
          take: 100,
        })
      : Promise.resolve([]),
    getActiveConflicts(prisma),
  ])

  const seen = new Set<string>()
  const requests = [...byRequester, ...byTarget, ...bySponsor].filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })
  requests.sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return NextResponse.json({
    requests: requests.slice(0, 200),
    sponsorMeetings,
    conflicts,
  })
}
