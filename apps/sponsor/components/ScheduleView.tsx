'use client'

import { useMemo } from 'react'
import { useMeetingsData } from '@/lib/hooks'

function formatSlot(start: string, end: string) {
  const s = new Date(start)
  const e = new Date(end)
  return {
    date: s.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    time: `${s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} – ${e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`,
  }
}

type MeetingItem = {
  id: string; startsAt: string; endsAt: string; location: string | null;
  person: { name: string | null; image: string | null; company: string | null; jobTitle: string | null };
  source: 'request' | 'admin';
}

export function ScheduleView() {
  const { data, isLoading } = useMeetingsData()

  const { allItems, byDate } = useMemo(() => {
    if (!data) return { allItems: [], byDate: new Map<string, MeetingItem[]>() }

    const confirmedRequests = [...data.inbound, ...data.outbound].filter(
      (r: any) => (r.status === 'CONFIRMED' || r.status === 'APPROVED') && r.timeBlock
    )

    const items: MeetingItem[] = [
      ...confirmedRequests.map((r: any) => ({
        id: r.id,
        startsAt: r.timeBlock.startsAt,
        endsAt: r.timeBlock.endsAt,
        location: r.timeBlock.location,
        person: r.requester ?? r.targetUser,
        source: 'request' as const,
      })),
      ...data.sponsorMeetings
        .filter((m: any) => m.status === 'CONFIRMED' && m.timeBlock)
        .map((m: any) => ({
          id: m.id,
          startsAt: m.timeBlock.startsAt,
          endsAt: m.timeBlock.endsAt,
          location: m.timeBlock.location,
          person: m.user,
          source: 'admin' as const,
        })),
    ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())

    const grouped = new Map<string, MeetingItem[]>()
    for (const item of items) {
      const key = new Date(item.startsAt).toDateString()
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(item)
    }

    return { allItems: items, byDate: grouped }
  }, [data])

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <div><div className="skeleton h-7 w-48" /><div className="skeleton h-4 w-32 mt-2" /></div>
        {[1, 2, 3].map(i => (
          <div key={i} className="card p-5 flex items-center gap-4">
            <div className="w-16 space-y-1"><div className="skeleton h-3" /><div className="skeleton h-3" /></div>
            <div className="w-px h-12 bg-hairline" />
            <div className="skeleton w-10 h-10 rounded-full" />
            <div className="flex-1 space-y-1"><div className="skeleton h-4 w-28" /><div className="skeleton h-3 w-40" /></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Meeting Schedule</h1>
        <p className="text-sm text-ink-2 mt-1">{allItems.length} confirmed meeting{allItems.length !== 1 ? 's' : ''} at WBR</p>
      </div>

      {allItems.length === 0 ? (
        <div className="card p-12 text-center text-ink-3">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p>No confirmed meetings yet.</p>
          <p className="text-sm mt-1">Approve meeting requests to add them to your schedule.</p>
        </div>
      ) : (
        Array.from(byDate.entries()).map(([dateKey, items]) => {
          const slot = formatSlot(items[0].startsAt, items[0].endsAt)
          return (
            <div key={dateKey} className="space-y-3">
              <h2 className="font-semibold text-ink-2 text-sm uppercase tracking-wide border-b border-hairline pb-2">{slot.date}</h2>
              {items.map(item => {
                const s = formatSlot(item.startsAt, item.endsAt)
                return (
                  <div key={item.id} className="card p-5 flex items-center gap-4">
                    <div className="flex-shrink-0 text-center w-16">
                      <div className="text-xs text-ink-3 leading-tight">{s.time.split('–')[0].trim()}</div>
                      <div className="text-xs text-ink-3">–</div>
                      <div className="text-xs text-ink-3 leading-tight">{s.time.split('–')[1]?.trim()}</div>
                    </div>
                    <div className="w-px bg-hairline self-stretch" />
                    {item.person?.image ? (
                      <img src={item.person.image} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-primary">{item.person?.name?.[0] ?? '?'}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ink">{item.person?.name}</p>
                      <p className="text-sm text-ink-2">{item.person?.jobTitle}{item.person?.company ? ` · ${item.person.company}` : ''}</p>
                      {item.location && (
                        <p className="text-xs text-ink-3 mt-0.5 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {item.location}
                        </p>
                      )}
                    </div>
                    <span className={`badge flex-shrink-0 ${item.source === 'admin' ? 'badge-brand' : 'badge-success'}`}>
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
