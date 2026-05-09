export const revalidate = 120
import { prisma } from '@conference/db'
import { unstable_cache } from 'next/cache'
import { AdminHeader } from '@/components/AdminHeader'
import { CalendarClient } from '@/components/CalendarClient'

const getCachedCalendarData = unstable_cache(
  async () => {
    const [conference, sessions, timeBlocks, meetingRequests] = await Promise.all([
      prisma.conference.findFirst({
        where: { active: true },
        select: { startDate: true, endDate: true },
      }),
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
    return { conference, sessions, timeBlocks, meetingRequests }
  },
  ['web-calendar-data'],
  { revalidate: 120, tags: ['sessions', 'meetings', 'time-blocks'] },
)

function toISO(d: Date | string): string {
  return typeof d === 'string' ? d : d.toISOString()
}

export default async function CalendarPage() {
  const { conference, sessions, timeBlocks, meetingRequests } = await getCachedCalendarData()

  const events = [
    ...sessions.map(s => ({
      id: s.id,
      kind: 'session' as const,
      title: s.title,
      startsAt: toISO(s.startsAt),
      endsAt: toISO(s.endsAt),
      meta: [s.type, s.track, s.room].filter(Boolean).join(' · '),
      sub: s.speaker?.name ?? null,
    })),
    ...timeBlocks.map(b => ({
      id: b.id,
      kind: 'timeblock' as const,
      title: `Meeting Slot${b._count.meetingRequests > 0 ? ` (${b._count.meetingRequests} booked)` : ''}`,
      startsAt: toISO(b.startsAt),
      endsAt: toISO(b.endsAt),
      meta: b.location ?? null,
      sub: null,
    })),
    ...meetingRequests.map(m => ({
      id: m.id,
      kind: 'meeting' as const,
      title: `${m.requester.name ?? '?'} & ${m.targetUser?.name ?? m.targetSponsor?.name ?? '?'}`,
      startsAt: toISO(m.timeBlock!.startsAt),
      endsAt: toISO(m.timeBlock!.endsAt),
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
          confStartDate={conference ? toISO(conference.startDate) : null}
          confEndDate={conference ? toISO(conference.endDate) : null}
        />
      </main>
    </>
  )
}
