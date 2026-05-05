'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import Link from 'next/link'


const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-500',
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
  onDecline: (id: string) => Promise<void>
}

export function AttendeesMeetingsView({ upcoming, past, incomingRequests, tab, onDecline }: Props) {
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const now = new Date()
  const activeList = tab === 'past' ? past : upcoming

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
          <Link key={t.key} href={`?tab=${t.key}`}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              tab === t.key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {t.label}
            {t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                tab === t.key ? 'bg-white/25 text-white'
                  : t.highlight ? 'bg-rose-100 text-rose-600' : 'bg-gray-200 text-gray-500'
              }`}>{t.count}</span>
            )}
          </Link>
        ))}
      </div>

      {/* Upcoming / Past */}
      {tab !== 'requests' && (
        <>
          {activeList.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No {tab} meetings</p>
              {tab === 'upcoming' && <p className="text-gray-400 text-sm mt-1">Your scheduled 1-1s will appear here.</p>}
            </div>
          ) : (
            <div className="space-y-3">
              {activeList.map((meeting, i) => {
                const diffMs = new Date(meeting.startsAt).getTime() - now.getTime()
                const isToday = diffMs > 0 && diffMs < 24 * 3_600_000
                const h = Math.floor(diffMs / 3_600_000)
                const m = Math.floor((diffMs % 3_600_000) / 60_000)
                const countdown = isToday ? (h > 0 ? `in ${h}h ${m}m` : `in ${m}m`) : null
                const isNext = tab === 'upcoming' && i === 0

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
                          <p className="font-semibold text-gray-900 text-sm">{meeting.other.name ?? 'Unknown'}</p>
                          {(meeting.other.jobTitle || meeting.other.company) && (
                            <p className="text-xs text-gray-500">{[meeting.other.jobTitle, meeting.other.company].filter(Boolean).join(' · ')}</p>
                          )}
                          <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {format(new Date(meeting.startsAt), 'MMM d, h:mm a')} – {format(new Date(meeting.endsAt), 'h:mm a')}
                          </div>
                          {meeting.location && (
                            <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
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
                        <span className={`badge ${statusColors[meeting.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
                        </span>
                        {countdown && (
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                            {countdown}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
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
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No pending requests</p>
              <p className="text-gray-400 text-sm mt-1">Meeting requests from other attendees will appear here.</p>
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
                      <p className="font-semibold text-gray-900 text-sm">{req.requester.name ?? 'Someone'}</p>
                      {(req.requester.jobTitle || req.requester.company) && (
                        <p className="text-xs text-gray-500">{[req.requester.jobTitle, req.requester.company].filter(Boolean).join(' · ')}</p>
                      )}
                      {req.message && (
                        <p className="text-xs text-gray-600 italic mt-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
                          "{req.message}"
                        </p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1.5">Pending admin scheduling · decline if not interested</p>
                    </div>
                    <span className="badge bg-yellow-100 text-yellow-700 flex-shrink-0">Pending</span>
                  </div>
                  <button
                    type="button"
                    disabled={decliningId === req.id}
                    onClick={async () => { setDecliningId(req.id); await onDecline(req.id); setDecliningId(null) }}
                    className="w-full py-2 text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl border border-red-100 transition-colors disabled:opacity-50">
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
