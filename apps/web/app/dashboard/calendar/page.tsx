export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { CalendarClient } from '@/components/CalendarClient'

export default async function CalendarPage() {
  const [sessions, timeBlocks, meetings] = await Promise.all([
    prisma.confSession.findMany({
      orderBy: { startsAt: 'asc' },
      include: { speaker: { select: { name: true } } },
    }),
    prisma.timeBlock.findMany({
      orderBy: { startsAt: 'asc' },
      include: { _count: { select: { meetings: true } } },
    }),
    prisma.meeting.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        timeBlock: true,
        attendeeA: { select: { name: true, image: true } },
        attendeeB: { select: { name: true, image: true } },
      },
    }),
  ])

  const events = [
    ...sessions.map(s => ({
      id: s.id,
      kind: 'session' as const,
      title: s.title,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      meta: [s.type, s.track, s.room].filter(Boolean).join(' · '),
      sub: s.speaker?.name ?? null,
    })),
    ...timeBlocks.map(b => ({
      id: b.id,
      kind: 'timeblock' as const,
      title: `Meeting Slot${b._count.meetings > 0 ? ` (${b._count.meetings} booked)` : ''}`,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      meta: b.location ?? null,
      sub: null,
    })),
    ...meetings.map(m => ({
      id: m.id,
      kind: 'meeting' as const,
      title: `${m.attendeeA.name ?? '?'} & ${m.attendeeB.name ?? '?'}`,
      startsAt: m.timeBlock.startsAt.toISOString(),
      endsAt: m.timeBlock.endsAt.toISOString(),
      meta: m.status,
      sub: null,
    })),
  ]

  return (
    <>
      <AdminHeader title="Calendar" />
      <main className="flex-1 p-6">
        <CalendarClient events={events} />
      </main>
    </>
  )
}
