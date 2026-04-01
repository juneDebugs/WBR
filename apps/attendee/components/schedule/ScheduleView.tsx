'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import type { DaySchedule } from '@conference/db'
import { SessionCard } from './SessionCard'

interface Props {
  days: DaySchedule[]
}

export function ScheduleView({ days }: Props) {
  const [selectedDay, setSelectedDay] = useState(0)
  const [trackFilter, setTrackFilter] = useState<string | null>(null)

  const currentDay = days[selectedDay]
  const tracks = Array.from(new Set(days.flatMap(d => d.sessions.map(s => s.track).filter(Boolean)))) as string[]
  const filtered = trackFilter
    ? currentDay?.sessions.filter(s => s.track === trackFilter)
    : currentDay?.sessions

  return (
    <div>
      {days.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2 -mx-1 px-1">
          {days.map((day, i) => (
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
      )}

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
          <SessionCard key={session.id} session={session} />
        ))}
        {(filtered ?? []).length === 0 && (
          <p className="text-center text-gray-400 py-8">No sessions for this day.</p>
        )}
      </div>
    </div>
  )
}
