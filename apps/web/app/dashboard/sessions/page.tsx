import { unstable_cache } from 'next/cache'
import { prisma, getActiveConflicts } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'
import Link from 'next/link'

const typeColors: Record<string, string> = {
  KEYNOTE: 'bg-purple-100 text-purple-700',
  TALK: 'bg-blue-100 text-blue-700',
  WORKSHOP: 'bg-green-100 text-green-700',
  PANEL: 'bg-orange-100 text-orange-700',
  BREAK: 'bg-gray-100 text-gray-500',
}

const getCachedSessions = unstable_cache(
  async () => prisma.confSession.findMany({ include: { speaker: true }, orderBy: { startsAt: 'asc' } }),
  ['web-sessions'],
  { revalidate: 60, tags: ['sessions'] },
)

const getCachedConflicts = unstable_cache(
  async () => getActiveConflicts(prisma),
  ['web-conflicts'],
  { revalidate: 120, tags: ['conflicts'] },
)

export default async function SessionsPage() {
  const [sessions, conflicts] = await Promise.all([
    getCachedSessions(),
    getCachedConflicts(),
  ])

  // Build a set of session IDs involved in any conflict
  const conflictedSessionIds = new Set(conflicts.flatMap(c => [c.sessionA.id, c.sessionB.id]))

  return (
    <>
      <AdminHeader title="Agenda" />
      <main className="flex-1 p-6">

        {/* Conflict banner */}
        {conflicts.length > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-red-800">
                  {conflicts.length} Scheduling Conflict{conflicts.length !== 1 ? 's' : ''} Detected
                </p>
                <p className="text-xs text-red-600 mt-0.5 mb-3">
                  The following presenters are double-booked in overlapping sessions. Edit the sessions below to resolve.
                </p>
                <div className="space-y-2">
                  {conflicts.map((c, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-red-700 bg-white rounded-lg px-3 py-2 border border-red-100">
                      <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>
                        <span className="font-semibold">{c.speakerName}</span>
                        {' '}is booked for{' '}
                        <Link href={`/dashboard/sessions/${c.sessionA.id}`} className="underline font-medium hover:text-red-900">
                          {c.sessionA.title}
                        </Link>
                        {' '}({format(c.sessionA.startsAt, 'h:mm a')}–{format(c.sessionA.endsAt, 'h:mm a')})
                        {' '}and{' '}
                        <Link href={`/dashboard/sessions/${c.sessionB.id}`} className="underline font-medium hover:text-red-900">
                          {c.sessionB.title}
                        </Link>
                        {' '}({format(c.sessionB.startsAt, 'h:mm a')}–{format(c.sessionB.endsAt, 'h:mm a')})
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
          <p className="text-sm text-gray-500">{sessions.length} sessions total</p>
          <Link href="/dashboard/sessions/new" className="btn-primary text-sm">
            + New Session
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Session</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Speaker</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Room</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sessions.map((session) => {
                const hasConflict = conflictedSessionIds.has(session.id)
                return (
                  <tr key={session.id} className={`hover:bg-gray-50 ${hasConflict ? 'bg-red-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {hasConflict && (
                          <svg className="w-3.5 h-3.5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        )}
                        <p className="font-medium text-gray-900 line-clamp-1">{session.title}</p>
                      </div>
                      {session.track && <p className="text-xs text-gray-400">{session.track}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{session.speaker?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {format(session.startsAt, 'MMM d, h:mm a')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{session.room ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[session.type] ?? 'bg-gray-100 text-gray-600'}`}>
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
            <p className="text-center text-gray-400 py-12">No sessions yet. Create one to get started.</p>
          )}
        </div>
      </main>
    </>
  )
}
