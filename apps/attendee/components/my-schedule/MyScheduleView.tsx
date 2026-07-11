'use client'

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import Link from 'next/link'


type SessionItem = {
  id: string
  type: 'session'
  title: string
  track: string | null
  room: string | null
  sessionType: string
  startsAt: string
  endsAt: string
  speaker: { name: string; company: string | null } | null
}

type SponsorItem = {
  id: string
  type: 'sponsor'
  title: string
  sponsorName: string
  sponsorTier: string
  notes: string | null
  location: string | null
  startsAt: string
  endsAt: string
}

type PeerItem = {
  id: string
  type: 'peer'
  title: string
  otherId: string | null
  otherName: string
  otherCompany: string | null
  otherJobTitle: string | null
  otherImage: string | null
  notes: string | null
  location: string | null
  startsAt: string
  endsAt: string
}

type ScheduleItem = SessionItem | SponsorItem | PeerItem

interface Props {
  items: ScheduleItem[]
}

const tierColors: Record<string, string> = {
  PLATINUM: 'badge-neutral',
  GOLD: 'badge-warning',
  SILVER: 'badge-neutral',
  BRONZE: 'badge-warning',
}

const sessionTypeColors: Record<string, string> = {
  KEYNOTE: 'badge-warning',
  TALK: 'badge-brand',
  WORKSHOP: 'badge-success',
  PANEL: 'badge-danger',
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  return now
}

function getCountdown(startsAt: string, now: Date): string | null {
  const diff = new Date(startsAt).getTime() - now.getTime()
  if (diff <= 0 || diff > 48 * 3_600_000) return null
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h === 0 && m === 0) return 'Starting now'
  return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`
}

export function MyScheduleView({ items }: Props) {
  const now = useNow()
  const [showPast, setShowPast] = useState(false)

  const sorted = [...items].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  )

  const upcoming = sorted.filter(i => new Date(i.endsAt) > now)
  const past = sorted.filter(i => new Date(i.endsAt) <= now)

  const upcomingGrouped = upcoming.reduce<Record<string, ScheduleItem[]>>((acc, item) => {
    const day = item.startsAt.slice(0, 10)
    if (!acc[day]) acc[day] = []
    acc[day].push(item)
    return acc
  }, {})

  const pastGrouped = past.reduce<Record<string, ScheduleItem[]>>((acc, item) => {
    const day = item.startsAt.slice(0, 10)
    if (!acc[day]) acc[day] = []
    acc[day].push(item)
    return acc
  }, {})

  const upcomingDays = Object.keys(upcomingGrouped).sort()
  const pastDays = Object.keys(pastGrouped).sort().reverse()

  // First upcoming item gets a countdown
  const nextItem = upcoming[0]

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="font-semibold text-ink mb-1">Nothing here yet</p>
        <p className="text-sm text-ink-3 max-w-xs">
          Bookmark sessions from the Agenda tab or get added to sponsor 1-1 meetings.
        </p>
        <Link href="/schedule" className="mt-4 text-sm text-primary font-medium hover:underline">
          Browse Agenda →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Upcoming */}
      {upcomingDays.length > 0 && upcomingDays.map(day => (
        <div key={day}>
          <p className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-3">
            {format(new Date(day + 'T00:00:00'), 'EEEE, MMMM d')}
          </p>
          <div className="space-y-3">
            {upcomingGrouped[day].map(item => {
              const isNext = nextItem?.id === item.id
              const countdown = isNext ? getCountdown(item.startsAt, now) : null
              if (item.type === 'session') return <SessionCard key={item.id} item={item} isNext={isNext} countdown={countdown} />
              if (item.type === 'sponsor') return <SponsorCard key={item.id} item={item} isNext={isNext} countdown={countdown} />
              return <PeerCard key={item.id} item={item} isNext={isNext} countdown={countdown} />
            })}
          </div>
        </div>
      ))}

      {upcoming.length === 0 && (
        <div className="card text-center py-6">
          <p className="text-sm text-ink-3">No upcoming items — check the Agenda to bookmark sessions.</p>
        </div>
      )}

      {/* Past toggle */}
      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast(v => !v)}
            className="flex items-center gap-2 text-xs font-semibold text-ink-3 uppercase tracking-widest mb-3 hover:text-ink transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${showPast ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {past.length} Past Item{past.length !== 1 ? 's' : ''}
          </button>

          {showPast && (
            <div className="space-y-6 opacity-60">
              {pastDays.map(day => (
                <div key={day}>
                  <p className="text-xs font-semibold text-ink-3 uppercase tracking-widest mb-3">
                    {format(new Date(day + 'T00:00:00'), 'EEEE, MMMM d')}
                  </p>
                  <div className="space-y-3">
                    {pastGrouped[day].map(item => {
                      if (item.type === 'session') return <SessionCard key={item.id} item={item} />
                      if (item.type === 'sponsor') return <SponsorCard key={item.id} item={item} />
                      return <PeerCard key={item.id} item={item} />
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SessionCard({ item, isNext, countdown }: { item: SessionItem; isNext?: boolean; countdown?: string | null }) {
  const typeLabel = item.sessionType.charAt(0) + item.sessionType.slice(1).toLowerCase()
  return (
    <Link href={`/schedule/${item.id}`} className={`card block active:scale-[0.99] transition-transform ${isNext ? 'ring-2 ring-primary/20' : ''}`}>
      <div className="flex gap-3">
        <div className="flex-shrink-0 w-1 rounded-full bg-primary self-stretch" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-semibold text-ink text-sm leading-snug line-clamp-2">{item.title}</p>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className={`badge ${sessionTypeColors[item.sessionType] ?? 'badge-neutral'}`}>
                {typeLabel}
              </span>
              {countdown && (
                <span className="text-[10px] font-bold text-brand bg-brand-50 px-2 py-0.5 rounded-full">{countdown}</span>
              )}
            </div>
          </div>
          <p className="text-xs text-ink-2 mb-1">
            {format(new Date(item.startsAt), 'h:mm a')} – {format(new Date(item.endsAt), 'h:mm a')}
            {item.room ? ` · ${item.room}` : ''}
          </p>
          {item.speaker && (
            <p className="text-xs text-ink-3">
              {[item.speaker.name, item.speaker.company].filter(Boolean).join(' · ')}
            </p>
          )}
          {item.track && (
            <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-fill text-ink-2 font-medium">
              {item.track}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}

function SponsorCard({ item, isNext, countdown }: { item: SponsorItem; isNext?: boolean; countdown?: string | null }) {
  return (
    <div className={`rounded-2xl overflow-hidden shadow-card border border-warning/25 bg-warning-soft ${isNext ? 'ring-2 ring-warning/40' : ''}`}>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-warning-ink">1-1 Meeting</span>
          {countdown && (
            <span className="text-[10px] font-bold text-warning-ink bg-warning/20 px-2 py-0.5 rounded-full">{countdown}</span>
          )}
        </div>
        <span className={`badge flex-shrink-0 ${tierColors[item.sponsorTier] ?? 'badge-neutral'}`}>
          {item.sponsorTier.charAt(0) + item.sponsorTier.slice(1).toLowerCase()}
        </span>
      </div>
      <div className="px-4 pb-4 flex items-start gap-4">
        <div className="flex-shrink-0 text-center pt-0.5 w-10">
          <p className="text-lg font-bold text-warning-ink leading-none">{format(new Date(item.startsAt), 'h:mm')}</p>
          <p className="text-[10px] text-warning-ink font-medium">{format(new Date(item.startsAt), 'a')}</p>
          <div className="w-px h-4 bg-warning/30 mx-auto my-1" />
          <p className="text-xs text-warning-ink">{format(new Date(item.endsAt), 'h:mm')}</p>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink text-base leading-snug">{item.sponsorName}</p>
          <p className="text-sm text-ink-2 mt-0.5">{item.title}</p>
          {item.location && (
            <div className="flex items-center gap-1 mt-1.5">
              <svg className="w-3 h-3 text-warning-ink flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-xs text-ink-3">{item.location}</p>
            </div>
          )}
          {item.notes && <p className="text-xs text-ink-3 italic mt-1">{item.notes}</p>}
        </div>
      </div>
    </div>
  )
}

function PeerCard({ item, isNext, countdown }: { item: PeerItem; isNext?: boolean; countdown?: string | null }) {
  const router = useRouter()
  const [dmLoading, setDmLoading] = useState(false)

  async function openDm(e: React.MouseEvent) {
    e.stopPropagation()
    if (!item.otherId) return
    setDmLoading(true)
    const res = await fetch('/api/chat/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: item.otherId }),
    })
    if (!res.ok) {
      // New DM rooms require friendship — send the user to the profile,
      // where the friend-request tile lives (mirrors chat/dm/[userId]).
      const body = await res.json().catch(() => null)
      setDmLoading(false)
      if (body?.code === 'NOT_FRIENDS') router.push(`/people/${item.otherId}`)
      return
    }
    const room = await res.json()
    router.push(`/chat/${room.id}`)
  }

  return (
    <div className={`rounded-2xl overflow-hidden shadow-card border border-brand/20 bg-brand-50 ${isNext ? 'ring-2 ring-brand/30' : ''}`}>
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-700">1-1 Meeting</span>
          {countdown && (
            <span className="text-[10px] font-bold text-brand-700 bg-brand-100 px-2 py-0.5 rounded-full">{countdown}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {item.otherId && (
            <button
              onClick={openDm}
              disabled={dmLoading}
              className="text-[10px] font-semibold text-brand-700 bg-brand-100 hover:bg-brand-200 px-2 py-0.5 rounded-full transition-colors disabled:opacity-60"
            >
              {dmLoading ? '…' : 'Message'}
            </button>
          )}
          <span className="badge bg-brand-100 text-brand-700">Peer</span>
        </div>
      </div>
      <div className="px-4 pb-4 flex items-start gap-4">
        <div className="flex-shrink-0 text-center pt-0.5 w-10">
          <p className="text-lg font-bold text-brand-700 leading-none">{format(new Date(item.startsAt), 'h:mm')}</p>
          <p className="text-[10px] text-brand-400 font-medium">{format(new Date(item.startsAt), 'a')}</p>
          <div className="w-px h-4 bg-brand-200 mx-auto my-1" />
          <p className="text-xs text-brand-300">{format(new Date(item.endsAt), 'h:mm')}</p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-1.5">
            {item.otherImage ? (
              <img src={item.otherImage} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover flex-shrink-0 ring-2 ring-brand/30 shadow-sm" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-brand-200 flex items-center justify-center flex-shrink-0 ring-2 ring-brand/20">
                <span className="text-brand-700 font-bold text-sm">{(item.otherName ?? '?')[0]}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-ink text-base leading-snug truncate">{item.otherName}</p>
              {(item.otherJobTitle || item.otherCompany) && (
                <p className="text-xs text-ink-2 truncate">
                  {[item.otherJobTitle, item.otherCompany].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          </div>
          {item.location && (
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-brand-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-xs text-ink-3">{item.location}</p>
            </div>
          )}
          {item.notes && <p className="text-xs text-ink-3 italic mt-0.5">{item.notes}</p>}
        </div>
      </div>
    </div>
  )
}
