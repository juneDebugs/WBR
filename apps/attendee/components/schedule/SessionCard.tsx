'use client'

import Link from 'next/link'
import { useState } from 'react'
import { format } from 'date-fns'
import type { SessionWithSpeaker } from '@conference/db'

const typeColors: Record<string, string> = {
  KEYNOTE:  'bg-blue-100 text-blue-700',
  TALK:     'bg-blue-100 text-blue-700',
  WORKSHOP: 'bg-blue-100 text-blue-700',
  PANEL:    'bg-blue-100 text-blue-700',
  BREAK:    'bg-gray-100 text-gray-500',
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
  const typeLabel = session.type.charAt(0) + session.type.slice(1).toLowerCase()

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
      <div className="flex items-center gap-3 py-2 px-4 bg-gray-50 rounded-xl">
        <span className="text-xs text-gray-400 w-16 flex-shrink-0">
          {format(session.startsAt, 'h:mm a')}
        </span>
        <span className="text-sm text-gray-400 font-medium">{session.title}</span>
      </div>
    )
  }

  return (
    <Link href={`/schedule/${session.id}`} className={`card block active:scale-[0.99] transition-transform ${hasConflict ? 'border-red-200 bg-red-50/30' : ''}`}>
      {hasConflict && (
        <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg bg-red-50 border border-red-100">
          <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-[11px] font-semibold text-red-600">Scheduling conflict — presenter double-booked</p>
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="text-xs text-gray-500 w-16 flex-shrink-0 pt-0.5">
          <div>{format(session.startsAt, 'h:mm a')}</div>
          <div className="text-gray-400">{format(session.endsAt, 'h:mm a')}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{session.title}</h3>
            <span className={`badge flex-shrink-0 ${typeColors[session.type] ?? 'bg-gray-100 text-gray-600'}`}>
              {typeLabel}
            </span>
          </div>
          {session.speaker && (
            <p className="text-xs text-gray-500">
              {[session.speaker.name, session.speaker.company].filter(Boolean).join(' · ')}
            </p>
          )}
          {session.room && (
            <p className="text-xs text-gray-400 mt-0.5">{session.room}</p>
          )}
          {session.description && (
            <p className="text-xs text-gray-400 mt-1.5 leading-relaxed line-clamp-3">{session.description}</p>
          )}
        </div>
        <button
          onClick={toggleBookmark}
          disabled={loading}
          className="flex-shrink-0 p-1 -mr-1 rounded-lg transition-colors hover:bg-gray-100"
          aria-label={bookmarked ? 'Remove from my schedule' : 'Add to my schedule'}
        >
          <svg
            className="w-5 h-5 text-pink-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
          >
            {/* Outer rectangle */}
            <path
              strokeLinecap="round" strokeLinejoin="round"
              stroke="currentColor"
              fill={bookmarked ? 'currentColor' : 'none'}
              d="M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
            {/* Pin holes and grid line */}
            <path
              strokeLinecap="round" strokeLinejoin="round"
              stroke={bookmarked ? 'white' : 'currentColor'}
              d="M8 7V3m8 4V3m-9 8h10"
            />
          </svg>
        </button>
      </div>
    </Link>
  )
}
