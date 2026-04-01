import { prisma } from '@conference/db'
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

export default async function SessionsPage() {
  const sessions = await prisma.confSession.findMany({
    include: { speaker: true },
    orderBy: { startsAt: 'asc' },
  })

  return (
    <>
      <AdminHeader title="Sessions" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
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
              {sessions.map((session) => (
                <tr key={session.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 line-clamp-1">{session.title}</p>
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
              ))}
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
