import { unstable_cache } from 'next/cache'
import { prisma, groupSessionsByDay, getActiveConflicts, type SessionWithSpeaker } from '@conference/db'
import { getSession } from '@/lib/session'
import { ScheduleView } from '@/components/schedule/ScheduleView'

const getCachedConference = unstable_cache(
  async () => prisma.conference.findFirst({ where: { active: true } }),
  ['attendee-conference'],
  { revalidate: 300, tags: ['conference'] },
)

const getCachedAllSessions = unstable_cache(
  async () =>
    prisma.confSession.findMany({
      include: { speaker: true },
      orderBy: { startsAt: 'asc' },
    }),
  ['attendee-all-sessions'],
  { revalidate: 300, tags: ['sessions'] },
)

const getCachedConflicts = unstable_cache(
  async () => getActiveConflicts(prisma),
  ['attendee-conflicts'],
  { revalidate: 120, tags: ['conflicts'] },
)

function getCachedBookmarks(userId: string) {
  return unstable_cache(
    async () =>
      prisma.sessionBookmark.findMany({
        where: { userId },
        select: { sessionId: true },
      }),
    ['attendee-user-bookmarks', userId],
    { revalidate: 30, tags: [`user-bookmarks-${userId}`] },
  )()
}

export default async function SchedulePage() {
  const session = await getSession()

  const [conference, allSessions, bookmarks, conflicts] = await Promise.all([
    getCachedConference(),
    getCachedAllSessions(),
    session?.user?.id
      ? getCachedBookmarks(session.user.id)
      : Promise.resolve([]),
    getCachedConflicts(),
  ])

  if (!conference) {
    return (
      <div className="page-container flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-gray-500">No active conference found.</p>
      </div>
    )
  }

  // unstable_cache serialises Dates to strings; reconstitute them for groupSessionsByDay
  const sessions = allSessions
    .filter(s => s.conferenceId === conference.id)
    .map(s => ({
      ...s,
      startsAt: new Date(s.startsAt),
      endsAt: new Date(s.endsAt),
      createdAt: new Date(s.createdAt),
    })) as unknown as SessionWithSpeaker[]

  const days = groupSessionsByDay(sessions)
  const savedIds = new Set(bookmarks.map((b: { sessionId: string }) => b.sessionId))
  const conflictedIds = new Set(conflicts.flatMap(c => [c.sessionA.id, c.sessionB.id]))

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold mb-1">{conference.name}</h1>
      {conference.venue && <p className="text-sm text-gray-500 mb-6">{conference.venue}</p>}
      <ScheduleView days={days} savedIds={savedIds} conflictedIds={conflictedIds} />
    </div>
  )
}
