'use client'

import Link from 'next/link'
import { useState } from 'react'
import { format } from 'date-fns'
import type { SessionWithSpeaker } from '@conference/db'

// ─── Photo helpers (shared logic with SpeakersClient) ─────────────────────────

function parsePhotoPos(pos: string | null | undefined) {
  const parts = (pos ?? '50% 50%').trim().split(/\s+/)
  return {
    position: `${parts[0] ?? '50%'} ${parts[1] ?? '50%'}`,
    scale: parts.length >= 3 ? parseFloat(parts[2]) || 1 : 1,
  }
}

function photoStyle(pos: string | null | undefined) {
  const { position, scale } = parsePhotoPos(pos)
  return {
    objectPosition: position,
    ...(scale !== 1 && { transform: `scale(${scale})`, transformOrigin: position }),
  }
}

function optimizePhoto(url: string | null, width: number): string | null {
  if (!url) return null
  if (!url.startsWith('https://images.unsplash.com')) return url
  let optimized = url.replace(/w=\d+/, `w=${width}`).replace(/q=\d+/, `q=${width > 600 ? 85 : 70}`)
  if (!optimized.includes('sharp=')) optimized += '&sharp=15'
  return optimized
}

const AVATAR_GRADIENTS: [string, string][] = [
  ['#7c3aed', '#6366f1'],
  ['#6366f1', '#3b82f6'],
  ['#ec4899', '#f43f5e'],
  ['#f59e0b', '#f97316'],
  ['#14b8a6', '#06b6d4'],
  ['#10b981', '#14b8a6'],
  ['#d946ef', '#ec4899'],
  ['#38bdf8', '#818cf8'],
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[hash(name) % AVATAR_GRADIENTS.length]
}

// ─── Session type config ──────────────────────────────────────────────────────

const typeConfig: Record<string, { color: string; tint: string; label: string; icon: string }> = {
  KEYNOTE:  { color: '#f59e0b', tint: 'rgba(245,158,11,0.08)',  label: 'Keynote',         icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  TALK:     { color: '#007aff', tint: 'rgba(0,122,255,0.06)',   label: 'Session',         icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
  WORKSHOP: { color: '#34c759', tint: 'rgba(52,199,89,0.06)',   label: 'Workshop',        icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  PANEL:    { color: '#ff2d55', tint: 'rgba(255,45,85,0.06)',   label: 'Fireside Chat',   icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  BREAK:    { color: '#8e8e93', tint: 'rgba(142,142,147,0.08)', label: 'Break',           icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
}

interface Props {
  session: SessionWithSpeaker
  saved?: boolean
  hasConflict?: boolean
  /** Title of a bookmarked session that overlaps this one's time slot */
  conflictingBookmark?: string
  onBookmarkChange?: (sessionId: string, bookmarked: boolean) => void
}

export function SessionCard({ session, saved = false, hasConflict = false, conflictingBookmark, onBookmarkChange }: Props) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const bookmarked = optimistic ?? saved
  const [loading, setLoading] = useState(false)
  const isBreak = session.type === 'BREAK'
  const isKeynote = session.type === 'KEYNOTE'
  const config = typeConfig[session.type] ?? typeConfig.TALK

  async function toggleBookmark(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    setOptimistic(!bookmarked)
    onBookmarkChange?.(session.id, !bookmarked)
    const res = await fetch(`/api/sessions/${session.id}/bookmark`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setOptimistic(null) // clear optimistic, trust server savedIds going forward
      onBookmarkChange?.(session.id, data.bookmarked)
    } else {
      // Revert on failure
      setOptimistic(null)
      onBookmarkChange?.(session.id, bookmarked)
    }
    setLoading(false)
  }

  if (isBreak) {
    return (
      <div className="flex items-center gap-3 py-3 px-4" style={{ background: config.tint, borderRadius: 14 }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(142,142,147,0.12)' }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="#8e8e93" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
          </svg>
        </div>
        <span className="text-[13px] text-gray-400 flex-1">{session.title}</span>
        <span className="text-[12px] text-gray-300">{format(session.startsAt, 'h:mm a')}</span>
      </div>
    )
  }

  return (
    <Link
      href={`/schedule/${session.id}`}
      className="block active:scale-[0.98] transition-all overflow-hidden"
      style={{
        background: hasConflict ? '#fff5f5' : isKeynote ? 'rgba(245,158,11,0.06)' : config.tint,
        borderRadius: 16,
        border: hasConflict
          ? '1px solid #fed7d7'
          : isKeynote
            ? `2.5px solid ${config.color}`
            : `1px solid ${config.color}18`,
      }}
    >
      {/* Color accent bar at top */}
      <div style={{ height: isKeynote ? 4 : 3, background: isKeynote ? `linear-gradient(90deg, ${config.color}, #f97316)` : config.color }} />

      {hasConflict && (
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
          <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
          </svg>
          <p className="text-[11px] font-medium text-red-400">Scheduling conflict</p>
        </div>
      )}

      {isKeynote ? (
        /* ── Keynote extended layout ── */
        <div className="p-4">
          {/* Top row: badge + time + bookmark */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full flex items-center gap-1"
                style={{ background: config.color, color: '#fff' }}
              >
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d={config.icon} />
                </svg>
                {config.label}
              </span>
              <span className="text-[11px] font-medium text-gray-400">
                {format(session.startsAt, 'h:mm')}–{format(session.endsAt, 'h:mm a')}
              </span>
            </div>
            <button
              onClick={toggleBookmark}
              disabled={loading}
              className="flex-shrink-0 p-1.5 -mr-1 rounded-full transition-all"
              style={{ background: bookmarked ? 'rgba(255,45,85,0.1)' : 'transparent' }}
              aria-label={bookmarked ? 'Remove from schedule' : 'Save to schedule'}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill={bookmarked ? '#ff2d55' : 'none'} stroke={bookmarked ? '#ff2d55' : '#c7c7cc'} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          </div>

          {/* Title – larger for keynotes */}
          <h3 className="text-[17px] font-bold text-gray-900 leading-snug mb-2">{session.title}</h3>

          {/* Speaker row */}
          {session.speaker && (
            <div className="flex items-center gap-3 mb-2">
              {session.speaker.photoUrl ? (
                <img
                  src={optimizePhoto(session.speaker.photoUrl, 100)!}
                  alt={session.speaker.name}
                  loading="lazy"
                  className="w-10 h-10 rounded-full object-cover"
                  style={{ border: `2px solid ${config.color}`, ...photoStyle(session.speaker.photoPosition) }}
                />
              ) : (
                (() => {
                  const [ag1, ag2] = avatarGradient(session.speaker.name)
                  return (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${ag1}, ${ag2})`, border: `2px solid ${config.color}` }}
                    >
                      <span className="text-white font-bold text-sm">{session.speaker.name[0]}</span>
                    </div>
                  )
                })()
              )}
              <div>
                <p className="text-[14px] font-semibold text-gray-800">{session.speaker.name}</p>
                {session.speaker.company && (
                  <p className="text-[12px] text-gray-400">{session.speaker.company}</p>
                )}
              </div>
            </div>
          )}

          {/* Description – show more lines for keynotes */}
          {session.description && (
            <p className="text-[12px] leading-relaxed text-gray-500 mt-1 line-clamp-3">{session.description}</p>
          )}

          {/* Room + availability */}
          <div className="flex items-center gap-3 mt-2.5">
            {session.room && (
              <div className="flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke={config.color} strokeWidth={2} style={{ opacity: 0.5 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[12px] text-gray-400">{session.room}</span>
              </div>
            )}
            {!saved && (
              <div className="flex items-center gap-1.5">
                {conflictingBookmark ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ff9500' }} />
                    <span className="text-[11px] text-amber-500 font-medium truncate">
                      Busy · {conflictingBookmark}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#34c759' }} />
                    <span className="text-[11px] text-emerald-500 font-medium">Free</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Standard card layout ── */
        <div className="p-4 flex gap-3.5">
          {/* Speaker photo or type icon */}
          <div className="flex-shrink-0 pt-0.5">
            {session.speaker?.photoUrl ? (
              <img
                src={optimizePhoto(session.speaker.photoUrl, 100)!}
                alt={session.speaker.name}
                loading="lazy"
                className="w-11 h-11 rounded-2xl object-cover"
                style={{ border: `2.5px solid ${config.color}`, ...photoStyle(session.speaker.photoPosition) }}
              />
            ) : session.speaker ? (
              (() => {
                const [ag1, ag2] = avatarGradient(session.speaker.name)
                return (
                  <div
                    className="w-11 h-11 rounded-2xl flex items-center justify-center"
                    style={{ background: `linear-gradient(135deg, ${ag1}, ${ag2})`, border: `2.5px solid ${config.color}` }}
                  >
                    <span className="text-white font-bold text-base">{session.speaker.name[0]}</span>
                  </div>
                )
              })()
            ) : (
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: config.color }}>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
                </svg>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Type badge + time */}
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{ background: config.color, color: '#fff' }}
              >
                {config.label}
              </span>
              <span className="text-[11px] font-medium text-gray-400">
                {format(session.startsAt, 'h:mm')}–{format(session.endsAt, 'h:mm a')}
              </span>
            </div>

            {/* Title */}
            <h3 className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2">{session.title}</h3>

            {/* Speaker */}
            {session.speaker && (
              <p className="text-[13px] text-gray-500 mt-1">
                {session.speaker.name}
                {session.speaker.company && <span className="text-gray-300"> · {session.speaker.company}</span>}
              </p>
            )}

            {/* Room */}
            {session.room && (
              <div className="flex items-center gap-1 mt-1.5">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke={config.color} strokeWidth={2} style={{ opacity: 0.5 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[12px] text-gray-400">{session.room}</span>
              </div>
            )}

            {/* Availability indicator */}
            {!saved && session.type !== 'BREAK' && (
              <div className="flex items-center gap-1.5 mt-2">
                {conflictingBookmark ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ff9500' }} />
                    <span className="text-[11px] text-amber-500 font-medium truncate">
                      Busy · {conflictingBookmark}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#34c759' }} />
                    <span className="text-[11px] text-emerald-500 font-medium">Free</span>
                  </>
                )}
              </div>
            )}

            {/* About this session */}
            {session.description && (
              <p className="text-[12px] leading-relaxed text-gray-400 mt-2 line-clamp-2">{session.description}</p>
            )}
          </div>

          {/* Bookmark */}
          <button
            onClick={toggleBookmark}
            disabled={loading}
            className="flex-shrink-0 self-start p-1.5 -mr-1 rounded-full transition-all"
            style={{ background: bookmarked ? 'rgba(255,45,85,0.1)' : 'transparent' }}
            aria-label={bookmarked ? 'Remove from schedule' : 'Save to schedule'}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill={bookmarked ? '#ff2d55' : 'none'} stroke={bookmarked ? '#ff2d55' : '#c7c7cc'} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>
      )}
    </Link>
  )
}
