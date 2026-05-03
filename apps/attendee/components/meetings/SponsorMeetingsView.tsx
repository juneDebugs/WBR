'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const tierColors: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700',
  GOLD: 'bg-amber-100 text-amber-700',
  SILVER: 'bg-gray-100 text-gray-600',
  BRONZE: 'bg-orange-100 text-orange-700',
}

type Person = { id: string; name: string | null; image: string | null; company: string | null; jobTitle: string | null }

type SponsorMeetingItem = {
  id: string
  startsAt: string
  endsAt: string
  location: string | null
  notes: string | null
  attendee: Person
}

type InboundRequest = {
  id: string
  status: string
  message: string | null
  requester: Person
  timeBlock: { startsAt: string; endsAt: string; location: string | null } | null
}

interface Props {
  sponsor: { id: string; name: string; logoUrl: string | null; tier: string }
  upcoming: SponsorMeetingItem[]
  past: SponsorMeetingItem[]
  inboundRequests: InboundRequest[]
  tab: string
}

export function SponsorMeetingsView({ sponsor, upcoming, past, inboundRequests, tab }: Props) {
  const now = new Date()
  const router = useRouter()
  const activeList = tab === 'past' ? past : upcoming

  const tabs = [
    { key: 'upcoming', label: 'Upcoming', count: upcoming.length },
    { key: 'past', label: 'Past', count: past.length },
    { key: 'requests', label: 'Requests', count: inboundRequests.length, highlight: inboundRequests.length > 0 },
  ]

  async function openDm(attendeeId: string) {
    const res = await fetch('/api/chat/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: attendeeId }),
    })
    const room = await res.json()
    router.push(`/chat/${room.id}`)
  }

  return (
    <div className="page-container">
      {/* Sponsor header */}
      <div className="flex items-center gap-3 mb-5">
        {sponsor.logoUrl ? (
          <Image src={sponsor.logoUrl} alt={sponsor.name} width={40} height={40} className="w-10 h-10 rounded-xl object-contain bg-white border border-gray-100 p-1 flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <span className="font-bold text-amber-600 text-sm">{sponsor.name[0]}</span>
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900 leading-tight">{sponsor.name}</h1>
          <span className={`badge text-[10px] ${tierColors[sponsor.tier] ?? 'bg-gray-100 text-gray-500'}`}>
            {sponsor.tier.charAt(0) + sponsor.tier.slice(1).toLowerCase()} Sponsor
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Upcoming', value: upcoming.length, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Completed', value: past.length, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Requests', value: inboundRequests.length, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

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

      {/* Upcoming / Past meetings */}
      {tab !== 'requests' && (
        <>
          {activeList.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No {tab} meetings</p>
              {tab === 'upcoming' && <p className="text-gray-400 text-sm mt-1">Your booth meetings will appear here once scheduled.</p>}
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
                  <SponsorMeetingCard
                    key={meeting.id}
                    meeting={meeting}
                    isNext={isNext}
                    countdown={countdown}
                    onMessage={() => openDm(meeting.attendee.id)}
                  />
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Inbound requests */}
      {tab === 'requests' && (
        <>
          {inboundRequests.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">No pending requests</p>
              <p className="text-gray-400 text-sm mt-1">Attendees who request a meeting with you will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inboundRequests.map(req => (
                <div key={req.id} className="rounded-2xl border border-amber-100 overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)' }}>
                  <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Meeting Request</span>
                    <span className={`badge ${req.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {req.status === 'APPROVED' ? 'Approved — scheduling' : 'Pending review'}
                    </span>
                  </div>
                  <div className="px-4 pb-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-amber-100 flex items-center justify-center mt-1">
                      {req.requester.image
                        ? <img src={req.requester.image} alt={req.requester.name ?? ''} loading="lazy" className="w-10 h-10 rounded-full object-cover" />
                        : <span className="text-amber-700 font-bold text-sm">{(req.requester.name ?? '?')[0]}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900">{req.requester.name ?? 'Attendee'}</p>
                      {(req.requester.jobTitle || req.requester.company) && (
                        <p className="text-xs text-gray-500">{[req.requester.jobTitle, req.requester.company].filter(Boolean).join(' · ')}</p>
                      )}
                      {req.message && (
                        <p className="text-xs text-gray-600 italic mt-2 bg-white/60 rounded-lg px-2.5 py-1.5">
                          "{req.message}"
                        </p>
                      )}
                      {req.timeBlock && (
                        <p className="text-xs text-amber-700 font-medium mt-2">
                          📅 {format(new Date(req.timeBlock.startsAt), 'MMM d, h:mm a')} – {format(new Date(req.timeBlock.endsAt), 'h:mm a')}
                          {req.timeBlock.location ? ` · ${req.timeBlock.location}` : ''}
                        </p>
                      )}
                      <button
                        onClick={() => openDm(req.requester.id)}
                        className="mt-2.5 text-xs font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-full transition-colors"
                      >
                        Message Attendee
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SponsorMeetingCard({
  meeting, isNext, countdown, onMessage,
}: {
  meeting: SponsorMeetingItem
  isNext: boolean
  countdown: string | null
  onMessage: () => void
}) {
  const [msgLoading, setMsgLoading] = useState(false)

  return (
    <div className={`rounded-2xl overflow-hidden shadow-sm border border-amber-100 ${isNext ? 'ring-2 ring-amber-200' : ''}`}
      style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)' }}>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isNext && <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Next Up</span>}
          {!isNext && <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Booth Meeting</span>}
          {countdown && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{countdown}</span>
          )}
        </div>
        <button
          onClick={async () => { setMsgLoading(true); await onMessage() }}
          disabled={msgLoading}
          className="text-[10px] font-semibold text-amber-700 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
        >
          {msgLoading ? '…' : 'Message'}
        </button>
      </div>
      <div className="px-4 pb-4 flex items-start gap-4">
        {/* Time column */}
        <div className="flex-shrink-0 text-center pt-0.5 w-10">
          <p className="text-lg font-bold text-amber-700 leading-none">{format(new Date(meeting.startsAt), 'h:mm')}</p>
          <p className="text-[10px] text-amber-500 font-medium">{format(new Date(meeting.startsAt), 'a')}</p>
          <div className="w-px h-4 bg-amber-200 mx-auto my-1" />
          <p className="text-xs text-amber-400">{format(new Date(meeting.endsAt), 'h:mm')}</p>
        </div>
        {/* Attendee info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-amber-100 flex items-center justify-center">
              {meeting.attendee.image
                ? <img src={meeting.attendee.image} alt={meeting.attendee.name ?? ''} loading="lazy" className="w-9 h-9 rounded-full object-cover" />
                : <span className="text-amber-700 font-bold text-sm">{(meeting.attendee.name ?? '?')[0]}</span>}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 leading-snug truncate">{meeting.attendee.name ?? 'Attendee'}</p>
              {(meeting.attendee.jobTitle || meeting.attendee.company) && (
                <p className="text-xs text-gray-500 truncate">
                  {[meeting.attendee.jobTitle, meeting.attendee.company].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          {meeting.location && (
            <div className="flex items-center gap-1 mt-1">
              <svg className="w-3 h-3 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-xs text-gray-400">{meeting.location}</p>
            </div>
          )}
          {meeting.notes && <p className="text-xs text-gray-400 italic mt-1">{meeting.notes}</p>}
        </div>
      </div>
    </div>
  )
}
