import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

function formatSlot(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  return {
    date: s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    time: `${s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} – ${e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
  }
}

export default async function SchedulePage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const user = session.user as any

  let confirmedRequests: any[] = []
  let sponsorMeetings: any[] = []

  if (user.sponsorId) {
    ;[confirmedRequests, sponsorMeetings] = await Promise.all([
      prisma.meetingRequest.findMany({
        where: {
          targetSponsorId: user.sponsorId,
          status: { in: ['CONFIRMED', 'APPROVED'] },
          timeBlockId: { not: null },
        },
        include: {
          requester: { select: { name: true, image: true, company: true, jobTitle: true } },
          timeBlock: true,
        },
        orderBy: { timeBlock: { startsAt: 'asc' } },
      }),
      prisma.sponsorMeeting.findMany({
        where: { sponsorId: user.sponsorId, status: 'CONFIRMED' },
        include: {
          user: { select: { name: true, image: true, company: true, jobTitle: true } },
          timeBlock: true,
        },
        orderBy: { timeBlock: { startsAt: 'asc' } },
      }),
    ])
  }

  // Merge and sort all meetings chronologically
  type MeetingItem = {
    id: string; startsAt: Date; endsAt: Date; location: string | null;
    person: { name: string | null; image: string | null; company: string | null; jobTitle: string | null };
    source: 'request' | 'admin';
  }

  const allItems: MeetingItem[] = [
    ...confirmedRequests
      .filter(r => r.timeBlock)
      .map(r => ({
        id: r.id,
        startsAt: new Date(r.timeBlock.startsAt),
        endsAt: new Date(r.timeBlock.endsAt),
        location: r.timeBlock.location,
        person: r.requester,
        source: 'request' as const,
      })),
    ...sponsorMeetings
      .filter(m => m.timeBlock)
      .map(m => ({
        id: m.id,
        startsAt: new Date(m.timeBlock.startsAt),
        endsAt: new Date(m.timeBlock.endsAt),
        location: m.timeBlock.location,
        person: m.user,
        source: 'admin' as const,
      })),
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

  // Group by date
  const byDate = new Map<string, MeetingItem[]>()
  for (const item of allItems) {
    const key = item.startsAt.toDateString()
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(item)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meeting Schedule</h1>
        <p className="text-sm text-gray-500 mt-1">
          {allItems.length} confirmed meeting{allItems.length !== 1 ? 's' : ''} at WBR
        </p>
      </div>

      {allItems.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>No confirmed meetings yet.</p>
          <p className="text-sm mt-1">Approve meeting requests to add them to your schedule.</p>
        </div>
      ) : (
        Array.from(byDate.entries()).map(([dateKey, items]) => {
          const slot = formatSlot(items[0].startsAt.toISOString(), items[0].endsAt.toISOString())
          return (
            <div key={dateKey} className="space-y-3">
              <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide border-b border-gray-100 pb-2">
                {slot.date}
              </h2>
              {items.map(item => {
                const s = formatSlot(item.startsAt.toISOString(), item.endsAt.toISOString())
                return (
                  <div key={item.id} className="card p-5 flex items-center gap-4">
                    <div className="flex-shrink-0 text-center w-16">
                      <div className="text-xs text-gray-400 leading-tight">
                        {s.time.split('–')[0].trim()}
                      </div>
                      <div className="text-xs text-gray-300">–</div>
                      <div className="text-xs text-gray-400 leading-tight">
                        {s.time.split('–')[1]?.trim()}
                      </div>
                    </div>
                    <div className="w-px bg-gray-100 self-stretch" />
                    {item.person.image ? (
                      <img src={item.person.image} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">{item.person.name?.[0] ?? '?'}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{item.person.name}</p>
                      <p className="text-sm text-gray-500">
                        {item.person.jobTitle}{item.person.company ? ` · ${item.person.company}` : ''}
                      </p>
                      {item.location && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {item.location}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs flex-shrink-0 px-2 py-1 rounded-full font-medium ${
                      item.source === 'admin' ? 'bg-primary/10 text-primary' : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {item.source === 'admin' ? 'Scheduled' : 'Confirmed'}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}
