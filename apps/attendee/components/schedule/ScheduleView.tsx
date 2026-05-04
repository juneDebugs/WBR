'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { DaySchedule } from '@conference/db'
import { SessionCard } from './SessionCard'
import { useScheduleData } from '@/lib/hooks'

interface Props {
  days: DaySchedule[]
  savedIds: Set<string>
  conflictedIds?: Set<string>
}

export function ScheduleView({ days: propDays, savedIds: propSavedIds, conflictedIds: propConflictedIds = new Set() }: Props) {
  const { data: hookData, isLoading } = useScheduleData()
  const router = useRouter()
  const [selectedDay, setSelectedDay] = useState(0)
  const [trackFilter, setTrackFilter] = useState<string | null>(null)

  const days: DaySchedule[] = hookData?.days ?? propDays
  const initialSavedIds = useMemo(
    () => hookData?.savedIds ? new Set<string>(hookData.savedIds) : propSavedIds,
    [hookData?.savedIds, propSavedIds]
  )
  const conflictedIds = useMemo(
    () => hookData?.conflictedIds ? new Set<string>(hookData.conflictedIds) : propConflictedIds,
    [hookData?.conflictedIds, propConflictedIds]
  )
  const conference = hookData?.conference ?? null

  const [savedIds, setSavedIds] = useState<Set<string>>(initialSavedIds)

  // Update savedIds when hook data arrives
  const [lastHookSavedIds, setLastHookSavedIds] = useState<string[] | null>(null)
  if (hookData?.savedIds && hookData.savedIds !== lastHookSavedIds) {
    setLastHookSavedIds(hookData.savedIds)
    setSavedIds(new Set<string>(hookData.savedIds))
  }

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

  if (isLoading && days.length === 0) {
    return (
      <div className="animate-pulse">
        <div className="h-7 w-48 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-32 bg-gray-200 rounded mb-6" />
        <div className="flex gap-2 mb-4">
          <div className="h-9 w-20 bg-gray-200 rounded-full" />
          <div className="h-9 w-20 bg-gray-200 rounded-full" />
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 bg-gray-200 rounded-2xl mb-3" />
        ))}
      </div>
    )
  }

  if (days.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <p className="text-gray-500">No active conference found.</p>
      </div>
    )
  }

  return (
    <div>
      {conference && (
        <>
          <h1 className="text-2xl font-bold mb-1">{conference.name}</h1>
          {conference.venue && <p className="text-sm text-gray-500 mb-6">{conference.venue}</p>}
        </>
      )}
      {/* iOS-style segmented control for days + My Schedule */}
      <div className="flex items-center gap-2.5 mb-4">
        {days.length > 1 && (
          <div className="flex-1 flex p-1 rounded-xl" style={{ background: 'rgba(118,118,128,0.12)' }}>
            {days.map((day, i) => (
              <button
                key={day.date}
                onClick={() => setSelectedDay(i)}
                className="flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all"
                style={{
                  background: selectedDay === i ? '#fff' : 'transparent',
                  color: selectedDay === i ? '#000' : '#8e8e93',
                  boxShadow: selectedDay === i ? '0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}
              >
                {format(new Date(day.date + 'T00:00:00'), 'EEE d')}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => router.push('/my-schedule')}
          className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold transition-colors"
          style={{ background: 'rgba(255,45,85,0.1)', color: '#ff2d55' }}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
          Saved
        </button>
      </div>

      {/* Track filter pills — iOS style */}
      {tracks.length > 0 && (
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setTrackFilter(null)}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all"
            style={{
              background: !trackFilter ? '#000' : 'rgba(118,118,128,0.12)',
              color: !trackFilter ? '#fff' : '#3c3c43',
            }}
          >
            All
          </button>
          {tracks.map(track => (
            <button
              key={track}
              onClick={() => setTrackFilter(trackFilter === track ? null : track)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all"
              style={{
                background: trackFilter === track ? '#000' : 'rgba(118,118,128,0.12)',
                color: trackFilter === track ? '#fff' : '#3c3c43',
              }}
            >
              {track}
            </button>
          ))}
        </div>
      )}

      {/* Session count */}
      <p className="text-[12px] text-gray-400 mb-3 px-0.5">
        {(filtered ?? []).length} session{(filtered ?? []).length !== 1 ? 's' : ''}
      </p>

      {/* Session cards */}
      <div className="space-y-2.5">
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
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(118,118,128,0.08)' }}>
              <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-gray-400">No sessions</p>
            <p className="text-[13px] text-gray-300 mt-1">Try a different day or track</p>
          </div>
        )}
      </div>
    </div>
  )
}
