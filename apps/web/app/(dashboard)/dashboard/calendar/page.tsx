import { unstable_cache } from 'next/cache'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { CalendarPageClient } from '@/components/CalendarPageClient'
import { permissionDenied } from '@/lib/require-permission'

function toISO(d: Date | string): string {
  return typeof d === 'string' ? d : d.toISOString()
}

const getCachedCalendarData = unstable_cache(
  async () => {
    const [conference, sessions, timeBlocks, meetingRequests] = await Promise.all([
      prisma.conference.findFirst({ where: { active: true }, select: { startDate: true, endDate: true } }),
      prisma.confSession.findMany({ orderBy: { startsAt: 'asc' }, include: { speaker: { select: { name: true } } } }),
      prisma.timeBlock.findMany({ orderBy: { startsAt: 'asc' }, include: { _count: { select: { meetingRequests: { where: { status: 'CONFIRMED' } } } } } }),
      prisma.meetingRequest.findMany({
        where: { status: 'CONFIRMED', timeBlockId: { not: null } },
        orderBy: { createdAt: 'asc' },
        include: { timeBlock: true, requester: { select: { name: true } }, targetUser: { select: { name: true } }, targetSponsor: { select: { name: true } } },
      }),
    ])
    const events = [
      ...sessions.map(s => ({ id: s.id, kind: 'session' as const, title: s.title, startsAt: toISO(s.startsAt), endsAt: toISO(s.endsAt), meta: [s.type, s.track, s.room].filter(Boolean).join(' · '), sub: s.speaker?.name ?? null })),
      ...timeBlocks.map(b => ({ id: b.id, kind: 'timeblock' as const, title: `Meeting Slot${b._count.meetingRequests > 0 ? ` (${b._count.meetingRequests} booked)` : ''}`, startsAt: toISO(b.startsAt), endsAt: toISO(b.endsAt), meta: b.location ?? null, sub: null })),
      ...meetingRequests.map(m => ({ id: m.id, kind: 'meeting' as const, title: `${m.requester.name ?? '?'} & ${m.targetUser?.name ?? m.targetSponsor?.name ?? '?'}`, startsAt: toISO(m.timeBlock!.startsAt), endsAt: toISO(m.timeBlock!.endsAt), meta: m.status, sub: null })),
    ]
    return { events, confStartDate: conference ? toISO(conference.startDate) : null, confEndDate: conference ? toISO(conference.endDate) : null }
  },
  ['web-calendar-data'],
  { revalidate: 120, tags: ['sessions', 'meetings', 'time-blocks'] },
)

export default async function CalendarPage() {
  const denied = await permissionDenied('calendar', 'Calendar')
  if (denied) return denied

  const data = await getCachedCalendarData()
  return (
    <>
      <AdminHeader title="Calendar" />
      <main className="flex-1 p-6">
        <CalendarPageClient initialData={data} />
      </main>
    </>
  )
}
