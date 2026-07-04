'use client'

import { useState } from 'react'
import { format, isToday as isTodayFn, isTomorrow } from 'date-fns'
import Link from 'next/link'


const statusColors: Record<string, string> = {
  CONFIRMED: 'badge-success',
  PENDING: 'badge-warning',
  CANCELLED: 'badge-danger',
}

type Person = { id: string; name: string | null; image: string | null; company: string | null; jobTitle: string | null }

type UpcomingMeeting = {
  id: string; status: string; startsAt: string; endsAt: string; location: string | null; other: Person
}

type IncomingRequest = {
  id: string; message: string | null; requester: Person
}

interface Props {
  upcoming: UpcomingMeeting[]
  past: UpcomingMeeting[]
  incomingRequests: IncomingRequest[]
  tab: string
  onTabChange: (tab: string) => void
  onDecline: (id: string) => Promise<void>
}

export function AttendeesMeetingsView({ upcoming, past, incomingRequests, tab, onTabChange, onDecline }: Props) {
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const now = new Date()
  const activeList = tab === 'past' ? past : upcoming

  // Group meetings by date
  const grouped = activeList.reduce<Record<string, UpcomingMeeting[]>>((acc, meeting) => {
    const dateKey = format(new Date(meeting.startsAt), 'yyyy-MM-dd')
    ;(acc[dateKey] ??= []).push(meeting)
    return acc
  }, {})
  const dateKeys = Object.keys(grouped)

  function dateLabel(key: string) {
    const d = new Date(key + 'T00:00:00')
    if (isTodayFn(d)) return 'Today'
    if (isTomorrow(d)) return 'Tomorrow'
    return format(d, 'EEEE, MMMM d')
  }

  const tabs = [
    { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { key: 'past', label: 'Past', count: past.length },
    { key: 'requests', label: 'Requests', count: incomingRequests.length, highlight: incomingRequests.length > 0 },
  ]

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold mb-5">My Meetings</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => onTabChange(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-primary text-white' : 'bg-fill text-ink-2 hover:bg-fill-2'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.key ? 'bg-white/25 text-white'
                  : t.highlight ? 'bg-danger-soft text-danger-ink' : 'bg-fill-2 text-ink-2'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Upcoming / Past */}
      {tab !== 'requests' && (
        <>
          {activeList.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-fill rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-ink-2 font-medium">No {tab} meetings</p>
              {tab === 'upcoming' && <p className="text-ink-3 text-sm mt-1">Your scheduled 1-1s will appear here.</p>}
            </div>
          ) : (
            <div className="space-y-5">
              {dateKeys.map((dateKey, gi) => {
                const meetings = grouped[dateKey]
                return (
                  <div key={dateKey}>
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2">{dateLabel(dateKey)}</p>
                    <div className="space-y-3">
                      {meetings.map((meeting, i) => {
                        const diffMs = new Date(meeting.startsAt).getTime() - now.getTime()
                        const meetingIsToday = diffMs > 0 && diffMs < 24 * 3_600_000
                        const h = Math.floor(diffMs / 3_600_000)
                        const m = Math.floor((diffMs % 3_600_000) / 60_000)
                        const countdown = meetingIsToday ? (h > 0 ? `in ${h}h ${m}m` : `in ${m}m`) : null
                        const isNext = tab === 'upcoming' && gi === 0 && i === 0

                        return (
                          <Link key={meeting.id} href={`/meetings/${meeting.id}`}
                            className={`card block active:scale-[0.99] transition-transform ${isNext ? 'ring-2 ring-primary/20' : ''}`}>
                            {isNext && (
                              <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Next Up</p>
                            )}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-primary/10 flex items-center justify-center">
                                  {meeting.other.image
                                    ? <img src={meeting.other.image} alt={meeting.other.name ?? ''} loading="lazy" className="w-10 h-10 rounded-full object-cover" />
                                    : <span className="text-primary font-bold">{(meeting.other.name ?? '?')[0]}</span>}
                                </div>
                                <div>
                                  <p className="font-semibold text-ink text-sm">{meeting.other.name ?? 'Unknown'}</p>
                                  {(meeting.other.jobTitle || meeting.other.company) && (
                                    <p className="text-xs text-ink-2">{[meeting.other.jobTitle, meeting.other.company].filter(Boolean).join(' · ')}</p>
                                  )}
                                  <div className="flex items-center gap-1 mt-1.5 text-xs text-ink-2">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {format(new Date(meeting.startsAt), 'h:mm a')} – {format(new Date(meeting.endsAt), 'h:mm a')}
                                  </div>
                                  {meeting.location && (
                                    <div className="flex items-center gap-1 mt-0.5 text-xs text-ink-3">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      </svg>
                                      {meeting.location}
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                <span className={`badge ${statusColors[meeting.status] ?? 'badge-neutral'}`}>
                                  {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
                                </span>
                                {countdown && (
                                  <span className="text-[10px] font-bold text-brand bg-brand-50 px-2 py-0.5 rounded-full">
                                    {countdown}
                                  </span>
                                )}
                              </div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Requests tab */}
      {tab === 'requests' && (
        <>
          {incomingRequests.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-fill rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-ink-2 font-medium">No pending requests</p>
              <p className="text-ink-3 text-sm mt-1">Meeting requests from other attendees will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomingRequests.map(req => (
                <div key={req.id} className="card space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-primary/10 flex items-center justify-center">
                      {req.requester.image
                        ? <img src={req.requester.image} alt={req.requester.name ?? ''} loading="lazy" className="w-10 h-10 rounded-full object-cover" />
                        : <span className="text-primary font-bold">{(req.requester.name ?? '?')[0]}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm">{req.requester.name ?? 'Someone'}</p>
                      {(req.requester.jobTitle || req.requester.company) && (
                        <p className="text-xs text-ink-2">{[req.requester.jobTitle, req.requester.company].filter(Boolean).join(' · ')}</p>
                      )}
                      {req.message && (
                        <p className="text-xs text-ink-2 italic mt-1.5 bg-fill rounded-lg px-2.5 py-1.5">
                          "{req.message}"
                        </p>
                      )}
                      <p className="text-[10px] text-ink-3 mt-1.5">Pending admin scheduling · decline if not interested</p>
                    </div>
                    <span className="badge badge-warning flex-shrink-0">Pending</span>
                  </div>
                  <button
                    type="button"
                    disabled={decliningId === req.id}
                    onClick={async () => { setDecliningId(req.id); await onDecline(req.id); setDecliningId(null) }}
                    className="w-full py-2 text-xs font-semibold text-danger hover:text-danger-ink hover:bg-danger-soft rounded-xl border border-danger/20 transition-colors disabled:opacity-50">
                    {decliningId === req.id ? 'Declining…' : 'Decline Request'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
