import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

const getCachedMeetingsData = unstable_cache(
  async () => {
    const [allMeetingRequests, sponsorMeetings, bookmarkCounts] = await Promise.all([
      prisma.meetingRequest.findMany({
        include: {
          requester: { select: { id: true, name: true, email: true, company: true, role: true } },
          targetUser: { select: { id: true, name: true, email: true, company: true, role: true } },
          targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
          timeBlock: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.sponsorMeeting.findMany({
        include: {
          sponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
          user:    { select: { id: true, name: true, email: true, company: true, role: true } },
          timeBlock: true,
        },
        orderBy: { timeBlock: { startsAt: 'asc' } },
      }),
      prisma.sessionBookmark.groupBy({
        by: ['userId'],
        _count: { _all: true },
      }),
    ])
    return { allMeetingRequests, sponsorMeetings, bookmarkCounts }
  },
  ['web-meetings-data'],
  { revalidate: 15, tags: ['meetings'] },
)

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await getCachedMeetingsData()
  return NextResponse.json(JSON.parse(JSON.stringify(data)))
}
