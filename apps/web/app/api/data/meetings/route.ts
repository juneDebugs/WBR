import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { unstable_cache, revalidateTag } from 'next/cache'
import { prisma, requestBoardWhere, syncAutoMatchesOnRead } from '@conference/db'

const getCachedMeetingsData = unstable_cache(
  async () => {
    // Only these four TimeBlock fields are read client-side (id/startsAt/endsAt/
    // location), so select them explicitly instead of `timeBlock: true` — no
    // reason to ship conferenceId/capacity/createdAt on every row.
    const timeBlockSelect = { id: true, startsAt: true, endsAt: true, location: true } as const
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
          timeBlock: { select: timeBlockSelect },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // No DB-side `orderBy: { timeBlock: { startsAt } }`: ordering by a nested
      // to-one relation panics the libSQL query engine once the parent set
      // reaches ~1000 rows (documented engine limitation), and the client
      // re-sorts the confirmed schedule by startsAt anyway. Sort in JS instead.
      prisma.sponsorMeeting.findMany({
        include: {
          sponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
          user:    { select: { id: true, name: true, email: true, company: true, role: true } },
          timeBlock: { select: timeBlockSelect },
        },
      }),
      prisma.sessionBookmark.groupBy({
        by: ['userId'],
        _count: { _all: true },
      }),
    ])
    sponsorMeetings.sort((a, b) => {
      const ta = a.timeBlock?.startsAt.getTime() ?? Infinity
      const tb = b.timeBlock?.startsAt.getTime() ?? Infinity
      return ta - tb
    })
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
  const sweep = await syncAutoMatchesOnRead(prisma).catch(() => null)
  if (sweep && sweep.scheduled.length > 0) revalidateTag('meetings')
  const data = await getCachedMeetingsData()
  // `getCachedMeetingsData` already returns JSON-safe values (unstable_cache
  // serializes Dates to ISO strings on the way out), so `NextResponse.json`
  // can serialize `data` directly — the old JSON.parse(JSON.stringify(...))
  // was a redundant full extra pass over the whole payload on every request.
  return NextResponse.json(data)
}
