import { unstable_cache } from 'next/cache'
import { prisma, groupSessionsByDay, getActiveConflicts, type SessionWithSpeaker } from '@conference/db'

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

export async function fetchScheduleData(userId: string) {
  const [conference, allSessions, bookmarks, conflicts] = await Promise.all([
    getCachedConference(),
    getCachedAllSessions(),
    getCachedBookmarks(userId),
    getCachedConflicts(),
  ])

  if (!conference) {
    return { conference: null, days: [], savedIds: [], conflictedIds: [] }
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

  const days = groupSessionsByDay(sessions, conference.venueTimezone)
  const savedIds = bookmarks.map((b: { sessionId: string }) => b.sessionId)
  const conflictedIds = conflicts.flatMap(c => [c.sessionA.id, c.sessionB.id])

  // Serialize the days (dates become strings in JSON anyway, but be explicit)
  const serializedDays = JSON.parse(JSON.stringify(days))

  return {
    conference: { name: conference.name, venue: conference.venue },
    days: serializedDays,
    savedIds,
    conflictedIds,
  }
}
