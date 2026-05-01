export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { CalendarClient } from '@/components/CalendarClient'

export default async function CalendarPage() {
  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { startDate: true, endDate: true },
  })

  const [sessions, timeBlocks, meetingRequests] = await Promise.all([
    prisma.confSession.findMany({
      orderBy: { startsAt: 'asc' },
      include: { speaker: { select: { name: true } } },
    }),
    prisma.timeBlock.findMany({
      orderBy: { startsAt: 'asc' },
      include: { _count: { select: { meetingRequests: { where: { status: 'CONFIRMED' } } } } },
    }),
    prisma.meetingRequest.findMany({
      where: { status: 'CONFIRMED', timeBlockId: { not: null } },
      orderBy: { createdAt: 'asc' },
      include: {
        timeBlock: true,
        requester: { select: { name: true } },
        targetUser: { select: { name: true } },
        targetSponsor: { select: { name: true } },
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
      title: `Meeting Slot${b._count.meetingRequests > 0 ? ` (${b._count.meetingRequests} booked)` : ''}`,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      meta: b.location ?? null,
      sub: null,
    })),
    ...meetingRequests.map(m => ({
      id: m.id,
      kind: 'meeting' as const,
      title: `${m.requester.name ?? '?'} & ${m.targetUser?.name ?? m.targetSponsor?.name ?? '?'}`,
      startsAt: m.timeBlock!.startsAt.toISOString(),
      endsAt: m.timeBlock!.endsAt.toISOString(),
      meta: m.status,
      sub: null,
    })),
  ]

  return (
    <>
      <AdminHeader title="Calendar" />
      <main className="flex-1 p-6">
        <CalendarClient
          events={events}
          confStartDate={conference?.startDate.toISOString() ?? null}
          confEndDate={conference?.endDate.toISOString() ?? null}
        />
      </main>
    </>
  )
}
