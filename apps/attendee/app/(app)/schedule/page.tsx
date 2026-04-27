export const dynamic = 'force-dynamic'
import { prisma, groupSessionsByDay, getActiveConflicts } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ScheduleView } from '@/components/schedule/ScheduleView'

export default async function SchedulePage() {
  const [conference, session] = await Promise.all([
    prisma.conference.findFirst({ where: { active: true } }),
    getServerSession(authOptions),
  ])

  if (!conference) {
    return (
      <div className="page-container flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-gray-500">No active conference found.</p>
      </div>
    )
  }

  const [sessions, bookmarks, conflicts] = await Promise.all([
    prisma.confSession.findMany({
      where: { conferenceId: conference.id },
      include: { speaker: true },
      orderBy: { startsAt: 'asc' },
    }),
    session?.user?.id
      ? prisma.sessionBookmark.findMany({
          where: { userId: session.user.id },
          select: { sessionId: true },
        })
      : [],
    getActiveConflicts(prisma),
  ])

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
