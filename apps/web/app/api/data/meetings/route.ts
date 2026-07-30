import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache, revalidateTag } from 'next/cache'
import { prisma, requestBoardWhere, syncAutoMatches } from '@conference/db'

const getCachedMeetingsData = unstable_cache(
  async () => {
    const [allMeetingRequests, sponsorMeetings, bookmarkCounts] = await Promise.all([
      // The requests board never carries the Auto lane: sponsor↔attendee
      // Best Fit picks live on Meetings → Auto (mutual pairs auto-schedule,
      // one-sided picks await reciprocation there).
      prisma.meetingRequest.findMany({
        where: requestBoardWhere,
        include: {
          requester: { select: { id: true, name: true, email: true, company: true, role: true, image: true } },
          targetUser: { select: { id: true, name: true, email: true, company: true, role: true, image: true } },
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
  { revalidate: 60, tags: ['meetings'] },
)

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request })
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Self-healing sweep, same as the Auto board read: any mutual Best Fit pair
  // that formed since the last view (seeds, direct DB writes, an admin
  // re-tier) is scheduled before the board is read, so it can never sit in
  // the review queue. A sweep failure must not blank the page.
  const sweep = await syncAutoMatches(prisma).catch(() => null)
  if (sweep && sweep.scheduled.length > 0) revalidateTag('meetings')
  const data = await getCachedMeetingsData()
  return NextResponse.json(JSON.parse(JSON.stringify(data)))
}
