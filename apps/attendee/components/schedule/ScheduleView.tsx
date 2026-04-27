'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { DaySchedule } from '@conference/db'
import { SessionCard } from './SessionCard'

interface Props {
  days: DaySchedule[]
  savedIds: Set<string>
  conflictedIds?: Set<string>
}

export function ScheduleView({ days, savedIds: initialSavedIds, conflictedIds = new Set() }: Props) {
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState(0)
  const [trackFilter, setTrackFilter] = useState<string | null>(null)
  const [savedIds, setSavedIds] = useState<Set<string>>(initialSavedIds)

  const currentDay = days[selectedDay]
  const tracks = Array.from(new Set(days.flatMap(d => d.sessions.map(s => s.track).filter(Boolean)))) as string[]

  const filtered = trackFilter
    ? currentDay?.sessions.filter(s => s.track === trackFilter)
    : currentDay?.sessions

  function handleBookmarkChange(sessionId: string, bookmarked: boolean) {
    setSavedIds(prev => {
      const next = new Set(prev)
      if (bookmarked) next.add(sessionId)
      else next.delete(sessionId)
      return next
    })
  }

  return (
    <div>
      {/* My Schedule toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {days.length > 1 && days.map((day, i) => (
            <button
              key={day.date}
              onClick={() => setSelectedDay(i)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                selectedDay === i
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {format(new Date(day.date + 'T00:00:00'), 'EEE MMM d')}
            </button>
          ))}
        </div>
        <button
          onClick={() => router.push('/my-schedule')}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors ml-2 bg-white text-gray-600 border border-gray-200"
        >
          <svg className="w-4 h-4 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          My Schedule
        </button>
      </div>

      {tracks.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-1 px-1">
          <button
            onClick={() => setTrackFilter(null)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              !trackFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            All
          </button>
          {tracks.map(track => (
            <button
              key={track}
              onClick={() => setTrackFilter(trackFilter === track ? null : track)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                trackFilter === track ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {track}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {(filtered ?? []).map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            saved={savedIds.has(session.id)}
            hasConflict={conflictedIds.has(session.id)}
            onBookmarkChange={handleBookmarkChange}
          />
        ))}
        {(filtered ?? []).length === 0 && (
          <p className="text-center text-gray-400 py-8">
            No sessions for this day.
          </p>
        )}
      </div>
    </div>
  )
}
