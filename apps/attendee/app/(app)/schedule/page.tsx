import { prisma, groupSessionsByDay } from '@conference/db'
import { ScheduleView } from '@/components/schedule/ScheduleView'

export default async function SchedulePage() {
  const conference = await prisma.conference.findFirst({
    where: { active: true },
  })

  if (!conference) {
    return (
      <div className="page-container flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-gray-500">No active conference found.</p>
      </div>
    )
  }

  const sessions = await prisma.confSession.findMany({
    where: { conferenceId: conference.id },
    include: { speaker: true },
    orderBy: { startsAt: 'asc' },
  })

  const days = groupSessionsByDay(sessions)

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold mb-1">{conference.name}</h1>
      {conference.venue && <p className="text-sm text-gray-500 mb-6">{conference.venue}</p>}
      <ScheduleView days={days} />
    </div>
  )
}
