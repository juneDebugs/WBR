import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'
import Link from 'next/link'

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-500',
}

export default async function MeetingsPage({ searchParams }: { searchParams: { status?: string } }) {
  const statusFilter = searchParams.status?.toUpperCase()
  const validStatuses = ['PENDING', 'CONFIRMED', 'CANCELLED']

  const meetings = await prisma.meeting.findMany({
    where: validStatuses.includes(statusFilter ?? '')
      ? { status: statusFilter }
      : undefined,
    include: {
      timeBlock: true,
      attendeeA: true,
      attendeeB: true,
    },
    orderBy: { timeBlock: { startsAt: 'asc' } },
  })

  return (
    <>
      <AdminHeader title="Meetings" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            {[undefined, 'PENDING', 'CONFIRMED', 'CANCELLED'].map((s) => (
              <Link key={s ?? 'all'} href={s ? `?status=${s.toLowerCase()}` : '/dashboard/meetings'}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  (statusFilter ?? undefined) === s
                    ? 'bg-primary text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                {s ? s.charAt(0) + s.slice(1).toLowerCase() : 'All'}
              </Link>
            ))}
          </div>
          <Link href="/dashboard/meetings/new" className="btn-primary text-sm">
            + New Meeting
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee A</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee B</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {meetings.map((meeting) => (
                <tr key={meeting.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{meeting.attendeeA.name ?? '—'}</p>
                    {meeting.attendeeA.company && <p className="text-xs text-gray-400">{meeting.attendeeA.company}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{meeting.attendeeB.name ?? '—'}</p>
                    {meeting.attendeeB.company && <p className="text-xs text-gray-400">{meeting.attendeeB.company}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {format(meeting.timeBlock.startsAt, 'MMM d, h:mm a')}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{meeting.timeBlock.location ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[meeting.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/meetings/${meeting.id}`}
                      className="text-primary hover:underline text-xs font-medium">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meetings.length === 0 && (
            <p className="text-center text-gray-400 py-12">No meetings found.</p>
          )}
        </div>
      </main>
    </>
  )
}
