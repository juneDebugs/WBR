import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'
import Link from 'next/link'

export default async function TimeBlocksPage() {
  const timeBlocks = await prisma.timeBlock.findMany({
    include: { _count: { select: { meetings: true } } },
    orderBy: { startsAt: 'asc' },
  })

  return (
    <>
      <AdminHeader title="Time Blocks" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{timeBlocks.length} time blocks total</p>
          <Link href="/dashboard/time-blocks/new" className="btn-primary text-sm">
            + New Time Block
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Meetings</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Capacity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {timeBlocks.map((tb) => {
                const full = tb._count.meetings >= tb.capacity
                return (
                  <tr key={tb.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{format(tb.startsAt, 'EEE, MMM d')}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {format(tb.startsAt, 'h:mm a')} – {format(tb.endsAt, 'h:mm a')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{tb.location ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-medium ${full ? 'text-red-600' : 'text-gray-900'}`}>
                        {tb._count.meetings} / {tb.capacity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        full ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {full ? 'Full' : 'Available'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {timeBlocks.length === 0 && (
            <p className="text-center text-gray-400 py-12">No time blocks yet.</p>
          )}
        </div>
      </main>
    </>
  )
}
