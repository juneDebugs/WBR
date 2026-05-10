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

const typeConfig: Record<string, { color: string; gradient: string; tint: string; label: string; icon: string }> = {
  KEYNOTE:  { color: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b, #f97316, #ef4444)', tint: 'rgba(245,158,11,0.04)',  label: 'Keynote',       icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  TALK:     { color: '#007aff', gradient: 'linear-gradient(135deg, #007aff, #5856d6)',          tint: 'rgba(0,122,255,0.03)',   label: 'Session',       icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
  WORKSHOP: { color: '#34c759', gradient: 'linear-gradient(135deg, #34c759, #30d158, #00c7be)', tint: 'rgba(52,199,89,0.03)',   label: 'Workshop',      icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  PANEL:    { color: '#ff2d55', gradient: 'linear-gradient(135deg, #ff2d55, #ff6482)',          tint: 'rgba(255,45,85,0.03)',   label: 'Fireside Chat', icon: 'M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z' },
  BREAK:    { color: '#8e8e93', gradient: 'linear-gradient(135deg, #8e8e93, #aeaeb2)',          tint: 'rgba(142,142,147,0.05)', label: 'Break',         icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
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
      setOptimistic(null)
      onBookmarkChange?.(session.id, data.bookmarked)
    } else {
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

  const borderWidth = isKeynote ? 2 : 1.5
  const conflictGradient = 'linear-gradient(135deg, #ff6b6b, #ee5a24)'

  return (
    <Link
      href={`/schedule/${session.id}`}
      className="block active:scale-[0.98] transition-all"
      style={{ position: 'relative' }}
    >
      {/* Gradient border wrapper */}
      <div
        style={{
          borderRadius: 18,
          padding: borderWidth,
          background: hasConflict ? conflictGradient : config.gradient,
        }}
      >
        {/* Inner card */}
        <div
          style={{
            borderRadius: 18 - borderWidth,
            background: hasConflict ? '#fffbfb' : '#fff',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle gradient wash at top */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: isKeynote ? 80 : 60,
              background: `linear-gradient(180deg, ${config.tint}, transparent)`,
              pointerEvents: 'none',
            }}
          />

          {/* ── Type tab ── */}
          <div className="flex items-center justify-between px-4 pt-3">
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full"
              style={{ background: config.gradient, boxShadow: `0 2px 8px ${config.color}30` }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                {config.label}
              </span>
            </div>
            <button
              onClick={toggleBookmark}
              disabled={loading}
              className="flex-shrink-0 p-1.5 rounded-full transition-all"
              style={{ background: bookmarked ? 'rgba(255,45,85,0.1)' : 'rgba(0,0,0,0.03)' }}
              aria-label={bookmarked ? 'Remove from schedule' : 'Save to schedule'}
            >
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill={bookmarked ? '#ff2d55' : 'none'} stroke={bookmarked ? '#ff2d55' : '#c7c7cc'} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </button>
          </div>

          {hasConflict && (
            <div className="flex items-center gap-1.5 px-4 pt-2">
              <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
              </svg>
              <p className="text-[11px] font-medium text-red-400">Scheduling conflict</p>
            </div>
          )}

          {isKeynote ? (
            /* ── Keynote extended layout ── */
            <div className="px-4 pt-3 pb-4">
              {/* Title */}
              <h3 className="text-[17px] font-bold text-gray-900 leading-snug mb-2.5">{session.title}</h3>

              {/* Speaker row */}
              {session.speaker && (
                <div className="flex items-center gap-3 mb-3">
                  {session.speaker.photoUrl ? (
                    <div className="flex-shrink-0" style={{ borderRadius: 14, padding: 1.5, background: config.gradient }}>
                      <img
                        src={optimizePhoto(session.speaker.photoUrl, 100)!}
                        alt={session.speaker.name}
                        loading="lazy"
                        className="w-10 h-10 object-cover"
                        style={{ borderRadius: 12.5, display: 'block', ...photoStyle(session.speaker.photoPosition) }}
                      />
                    </div>
                  ) : (
                    (() => {
                      const [ag1, ag2] = avatarGradient(session.speaker.name)
                      return (
                        <div
                          className="w-[43px] h-[43px] flex-shrink-0 flex items-center justify-center"
                          style={{ borderRadius: 14, background: `linear-gradient(135deg, ${ag1}, ${ag2})` }}
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

              {/* Description */}
              {session.description && (
                <p className="text-[12px] leading-relaxed text-gray-400 mb-3 line-clamp-3">{session.description}</p>
              )}

              {/* Bottom row: time + room + availability */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.03)' }}>
                  <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[11px] font-medium text-gray-500">
                    {format(session.startsAt, 'h:mm')}–{format(session.endsAt, 'h:mm a')}
                  </span>
                </div>
                {session.room && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.03)' }}>
                    <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-[11px] font-medium text-gray-500">{session.room}</span>
                  </div>
                )}
                {!saved && (
                  <div className="flex items-center gap-1.5 ml-auto">
                    {conflictingBookmark ? (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ff9500' }} />
                        <span className="text-[11px] text-amber-500 font-medium truncate">Busy</span>
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
            <div className="px-4 pt-2.5 pb-4 flex gap-3.5">
              {/* Speaker photo or type icon */}
              <div className="flex-shrink-0 pt-0.5">
                {session.speaker?.photoUrl ? (
                  <div style={{ borderRadius: 14, padding: 1.5, background: config.gradient }}>
                    <img
                      src={optimizePhoto(session.speaker.photoUrl, 100)!}
                      alt={session.speaker.name}
                      loading="lazy"
                      className="w-11 h-11 object-cover"
                      style={{ borderRadius: 12.5, display: 'block', ...photoStyle(session.speaker.photoPosition) }}
                    />
                  </div>
                ) : session.speaker ? (
                  (() => {
                    const [ag1, ag2] = avatarGradient(session.speaker.name)
                    return (
                      <div
                        className="w-[47px] h-[47px] flex items-center justify-center"
                        style={{ borderRadius: 14, background: `linear-gradient(135deg, ${ag1}, ${ag2})` }}
                      >
                        <span className="text-white font-bold text-base">{session.speaker.name[0]}</span>
                      </div>
                    )
                  })()
                ) : (
                  <div className="w-[47px] h-[47px] flex items-center justify-center" style={{ borderRadius: 14, background: config.gradient }}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
                    </svg>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Time */}
                <span className="text-[11px] font-medium text-gray-400">
                  {format(session.startsAt, 'h:mm')}–{format(session.endsAt, 'h:mm a')}
                </span>

                {/* Title */}
                <h3 className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2 mt-0.5">{session.title}</h3>

                {/* Speaker */}
                {session.speaker && (
                  <p className="text-[13px] text-gray-500 mt-1">
                    {session.speaker.name}
                    {session.speaker.company && <span className="text-gray-300"> · {session.speaker.company}</span>}
                  </p>
                )}

                {/* Room + availability */}
                <div className="flex items-center gap-3 mt-2">
                  {session.room && (
                    <div className="flex items-center gap-1">
                      <svg className="w-3 h-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                          <span className="text-[11px] text-amber-500 font-medium truncate">Busy · {conflictingBookmark}</span>
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

                {/* Description */}
                {session.description && (
                  <p className="text-[12px] leading-relaxed text-gray-400 mt-2 line-clamp-2">{session.description}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
