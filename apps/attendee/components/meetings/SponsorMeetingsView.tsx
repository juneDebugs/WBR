'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

const tierColors: Record<string, string> = {
  PLATINUM: 'badge-neutral',
  GOLD: 'badge-warning',
  SILVER: 'badge-neutral',
  BRONZE: 'badge-warning',
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
  onTabChange: (tab: string) => void
}

export function SponsorMeetingsView({ sponsor, upcoming, past, inboundRequests, tab, onTabChange }: Props) {
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
    if (!res.ok) {
      // New DM rooms require friendship — send the user to the profile,
      // where the friend-request tile lives (mirrors chat/dm/[userId]).
      const body = await res.json().catch(() => null)
      if (body?.code === 'NOT_FRIENDS') router.push(`/people/${attendeeId}`)
      return
    }
    const room = await res.json()
    router.push(`/chat/${room.id}`)
  }

  return (
    <div className="page-container">
      {/* Sponsor header */}
      <div className="flex items-center gap-3 mb-5">
        {sponsor.logoUrl ? (
          <Image src={sponsor.logoUrl} alt={sponsor.name} width={40} height={40} className="w-10 h-10 rounded-xl object-contain bg-white border border-hairline p-1 flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-warning-soft flex items-center justify-center flex-shrink-0">
            <span className="font-bold text-warning-ink text-sm">{sponsor.name[0]}</span>
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-ink leading-tight">{sponsor.name}</h1>
          <span className={`badge text-[10px] ${tierColors[sponsor.tier] ?? 'badge-neutral'}`}>
            {sponsor.tier.charAt(0) + sponsor.tier.slice(1).toLowerCase()} Sponsor
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Upcoming', value: upcoming.length, color: 'text-brand', bg: 'bg-brand-50' },
          { label: 'Completed', value: past.length, color: 'text-success-ink', bg: 'bg-success-soft' },
          { label: 'Requests', value: inboundRequests.length, color: 'text-warning-ink', bg: 'bg-warning-soft' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-ink-2 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

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

      {/* Upcoming / Past meetings */}
      {tab !== 'requests' && (
        <>
          {activeList.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 bg-warning-soft rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-warning-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-ink-2 font-medium">No {tab} meetings</p>
              {tab === 'upcoming' && <p className="text-ink-3 text-sm mt-1">Your booth meetings will appear here once scheduled.</p>}
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
              <div className="w-14 h-14 bg-fill rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-ink-2 font-medium">No pending requests</p>
              <p className="text-ink-3 text-sm mt-1">Attendees who request a meeting with you will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inboundRequests.map(req => (
                <div key={req.id} className="rounded-2xl border border-warning/25 overflow-hidden bg-warning-soft">
                  <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-warning-ink">Meeting Request</span>
                    <span className={`badge ${req.status === 'APPROVED' ? 'badge-brand' : 'badge-warning'}`}>
                      {req.status === 'APPROVED' ? 'Approved — scheduling' : 'Pending review'}
                    </span>
                  </div>
                  <div className="px-4 pb-4 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 overflow-hidden bg-warning/20 flex items-center justify-center mt-1">
                      {req.requester.image
                        ? <img src={req.requester.image} alt={req.requester.name ?? ''} loading="lazy" className="w-10 h-10 rounded-full object-cover" />
                        : <span className="text-warning-ink font-bold text-sm">{(req.requester.name ?? '?')[0]}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink">{req.requester.name ?? 'Attendee'}</p>
                      {(req.requester.jobTitle || req.requester.company) && (
                        <p className="text-xs text-ink-2">{[req.requester.jobTitle, req.requester.company].filter(Boolean).join(' · ')}</p>
                      )}
                      {req.message && (
                        <p className="text-xs text-ink-2 italic mt-2 bg-white/60 rounded-lg px-2.5 py-1.5">
                          "{req.message}"
                        </p>
                      )}
                      {req.timeBlock && (
                        <p className="text-xs text-warning-ink font-medium mt-2">
                          📅 {format(new Date(req.timeBlock.startsAt), 'MMM d, h:mm a')} – {format(new Date(req.timeBlock.endsAt), 'h:mm a')}
                          {req.timeBlock.location ? ` · ${req.timeBlock.location}` : ''}
                        </p>
                      )}
                      <button
                        onClick={() => openDm(req.requester.id)}
                        className="mt-2.5 text-xs font-semibold text-warning-ink bg-warning/20 hover:bg-warning/30 px-3 py-1.5 rounded-full transition-colors"
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
    <div className={`rounded-2xl overflow-hidden shadow-card border border-warning/25 bg-warning-soft ${isNext ? 'ring-2 ring-warning/40' : ''}`}>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isNext && <span className="text-[10px] font-bold uppercase tracking-widest text-warning-ink">Next Up</span>}
          {!isNext && <span className="text-[10px] font-bold uppercase tracking-widest text-warning-ink">Booth Meeting</span>}
          {countdown && (
            <span className="text-[10px] font-bold text-warning-ink bg-warning/20 px-2 py-0.5 rounded-full">{countdown}</span>
          )}
        </div>
        <button
          onClick={async () => { setMsgLoading(true); await onMessage() }}
          disabled={msgLoading}
          className="text-[10px] font-semibold text-warning-ink bg-warning/20 hover:bg-warning/30 px-2.5 py-1 rounded-full transition-colors disabled:opacity-60"
        >
          {msgLoading ? '…' : 'Message'}
        </button>
      </div>
      <div className="px-4 pb-4 flex items-start gap-4">
        {/* Time column */}
        <div className="flex-shrink-0 text-center pt-0.5 w-10">
          <p className="text-lg font-bold text-warning-ink leading-none">{format(new Date(meeting.startsAt), 'h:mm')}</p>
          <p className="text-[10px] text-warning-ink font-medium">{format(new Date(meeting.startsAt), 'a')}</p>
          <div className="w-px h-4 bg-warning/30 mx-auto my-1" />
          <p className="text-xs text-warning-ink">{format(new Date(meeting.endsAt), 'h:mm')}</p>
        </div>
        {/* Attendee info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-warning/20 flex items-center justify-center">
              {meeting.attendee.image
                ? <img src={meeting.attendee.image} alt={meeting.attendee.name ?? ''} loading="lazy" className="w-9 h-9 rounded-full object-cover" />
                : <span className="text-warning-ink font-bold text-sm">{(meeting.attendee.name ?? '?')[0]}</span>}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-ink leading-snug truncate">{meeting.attendee.name ?? 'Attendee'}</p>
              {(meeting.attendee.jobTitle || meeting.attendee.company) && (
                <p className="text-xs text-ink-2 truncate">
                  {[meeting.attendee.jobTitle, meeting.attendee.company].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          {meeting.location && (
            <div className="flex items-center gap-1 mt-1">
              <svg className="w-3 h-3 text-warning-ink flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-xs text-ink-3">{meeting.location}</p>
            </div>
          )}
          {meeting.notes && <p className="text-xs text-ink-3 italic mt-1">{meeting.notes}</p>}
        </div>
      </div>
    </div>
  )
}
