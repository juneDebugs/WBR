'use client'

import { useMemo } from 'react'
import { useSessions } from '@/lib/hooks'
import { format } from 'date-fns'
import Link from 'next/link'

const typeColors: Record<string, string> = {
  KEYNOTE: 'bg-brand-50 text-brand-700',
  TALK: 'bg-brand-100 text-brand-800',
  WORKSHOP: 'bg-warning-soft text-warning-ink',
  PANEL: 'bg-success-soft text-success-ink',
  BREAK: 'bg-fill text-ink-2',
}

export default function SessionsPageClient() {
  const { data, isLoading } = useSessions()

  const sessions = data?.sessions ?? []
  const conflicts = data?.conflicts ?? []

  const conflictedSessionIds = useMemo(
    () => new Set(conflicts.flatMap((c: any) => [c.sessionA.id, c.sessionB.id])),
    [conflicts],
  )

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-24 bg-fill-2 rounded animate-pulse" />
          <div className="h-8 w-28 bg-fill-2 rounded animate-pulse" />
        </div>
        <div className="bg-white border border-hairline rounded-xl overflow-hidden">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-hairline">
              <div className="h-4 w-48 bg-fill rounded animate-pulse" />
              <div className="h-4 w-24 bg-fill rounded animate-pulse" />
              <div className="h-4 w-32 bg-fill rounded animate-pulse" />
              <div className="h-4 w-16 bg-fill rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Conflict banner */}
      {conflicts.length > 0 && (
        <div className="mb-6 rounded-xl border border-danger/30 bg-danger-soft px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-danger-soft flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-danger-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-danger-ink">
                {conflicts.length} Scheduling Conflict{conflicts.length !== 1 ? 's' : ''} Detected
              </p>
              <p className="text-xs text-danger-ink mt-0.5 mb-3">
                The following presenters are double-booked in overlapping sessions. Edit the sessions below to resolve.
              </p>
              <div className="space-y-2">
                {conflicts.map((c: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-danger-ink bg-white rounded-lg px-3 py-2 border border-danger/30">
                    <svg className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>
                      <span className="font-semibold">{c.speakerName}</span>
                      {' '}is booked for{' '}
                      <Link href={`/dashboard/sessions/${c.sessionA.id}`} className="underline font-medium hover:text-danger-ink">
                        {c.sessionA.title}
                      </Link>
                      {' '}({format(new Date(c.sessionA.startsAt), 'h:mm a')}{'\u2013'}{format(new Date(c.sessionA.endsAt), 'h:mm a')})
                      {' '}and{' '}
                      <Link href={`/dashboard/sessions/${c.sessionB.id}`} className="underline font-medium hover:text-danger-ink">
                        {c.sessionB.title}
                      </Link>
                      {' '}({format(new Date(c.sessionB.startsAt), 'h:mm a')}{'\u2013'}{format(new Date(c.sessionB.endsAt), 'h:mm a')})
                      {' '}at the same time.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-2">{sessions.length} sessions total</p>
        <Link href="/dashboard/sessions/new" className="btn-primary text-sm">
          + New Session
        </Link>
      </div>

      <div className="bg-white border border-hairline rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-fill border-b border-hairline">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Session</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Speaker</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Time</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Room</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {sessions.map((session: any) => {
              const hasConflict = conflictedSessionIds.has(session.id)
              return (
                <tr key={session.id} className={`hover:bg-fill ${hasConflict ? 'bg-danger-soft/40' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {hasConflict && (
                        <svg className="w-3.5 h-3.5 text-danger flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                      <p className="font-medium text-ink line-clamp-1">{session.title}</p>
                    </div>
                    {session.track && <p className="text-xs text-ink-2">{session.track}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{session.speaker?.name ?? '\u2014'}</td>
                  <td className="px-4 py-3 text-ink-2 whitespace-nowrap">
                    {format(new Date(session.startsAt), 'MMM d, h:mm a')}
                  </td>
                  <td className="px-4 py-3 text-ink-2">{session.room ?? '\u2014'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[session.type] ?? 'bg-fill text-ink-2'}`}>
                      {session.type.charAt(0) + session.type.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/sessions/${session.id}`}
                      className="text-primary hover:underline text-xs font-medium">
                      Edit
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sessions.length === 0 && (
          <p className="text-center text-ink-2 py-12">No sessions yet. Create one to get started.</p>
        )}
      </div>
    </>
  )
}
