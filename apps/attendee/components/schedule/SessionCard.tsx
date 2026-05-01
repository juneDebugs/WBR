'use client'

import Link from 'next/link'
import { useState } from 'react'
import { format } from 'date-fns'
import type { SessionWithSpeaker } from '@conference/db'

const typeConfig: Record<string, { bg: string; label: string; text: string; icon: string }> = {
  KEYNOTE:  { bg: '#5856d6', label: 'Keynote',  text: '#fff', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  TALK:     { bg: '#007aff', label: 'Session',  text: '#fff', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
  WORKSHOP: { bg: '#34c759', label: 'Workshop', text: '#fff', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  PANEL:    { bg: '#ff2d55', label: 'Welcome & Closing', text: '#fff', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
  BREAK:    { bg: '#8e8e93', label: 'Break',    text: '#fff', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
}

interface Props {
  session: SessionWithSpeaker
  saved?: boolean
  hasConflict?: boolean
  onBookmarkChange?: (sessionId: string, bookmarked: boolean) => void
}

export function SessionCard({ session, saved = false, hasConflict = false, onBookmarkChange }: Props) {
  const [bookmarked, setBookmarked] = useState(saved)
  const [loading, setLoading] = useState(false)
  const isBreak = session.type === 'BREAK'
  const config = typeConfig[session.type] ?? typeConfig.TALK
  const typeLabel = config.label

  async function toggleBookmark(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (loading) return
    setLoading(true)
    const res = await fetch(`/api/sessions/${session.id}/bookmark`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setBookmarked(data.bookmarked)
      onBookmarkChange?.(session.id, data.bookmarked)
    }
    setLoading(false)
  }

  if (isBreak) {
    return (
      <div className="flex items-center gap-3 py-3 px-4" style={{ background: 'rgba(142,142,147,0.08)', borderRadius: 12 }}>
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(142,142,147,0.12)' }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="#8e8e93" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={typeConfig.BREAK.icon} />
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
      className="block active:scale-[0.98] transition-all"
      style={{
        background: hasConflict ? '#fff5f5' : '#fff',
        borderRadius: 16,
        border: hasConflict ? '1px solid #fed7d7' : '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
      }}
    >
      {hasConflict && (
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
          <svg className="w-3 h-3 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
          </svg>
          <p className="text-[11px] font-medium text-red-400">Scheduling conflict</p>
        </div>
      )}

      <div className="p-4 flex gap-3.5">
        {/* Speaker photo or type icon */}
        <div className="flex-shrink-0 pt-0.5">
          {session.speaker?.photoUrl ? (
            <img
              src={session.speaker.photoUrl.replace(/w=\d+/, 'w=100').replace(/q=\d+/, 'q=70')}
              alt={session.speaker.name}
              loading="lazy"
              className="w-10 h-10 rounded-xl object-cover"
              style={{ border: `2px solid ${config.bg}` }}
            />
          ) : (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: config.bg }}>
              <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke={config.text} strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
              </svg>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Time + type */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold" style={{ color: config.bg }}>
              {format(session.startsAt, 'h:mm')}–{format(session.endsAt, 'h:mm a')}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: config.bg, opacity: 0.6 }}>
              {typeLabel}
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
              <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[12px] text-gray-400">{session.room}</span>
            </div>
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
    </Link>
  )
}
