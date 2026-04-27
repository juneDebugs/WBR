export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import Image from 'next/image'
import Link from 'next/link'

export default async function SpeakersPage() {
  const speakers = await prisma.speaker.findMany({
    include: { _count: { select: { confSessions: true } } },
    orderBy: { name: 'asc' },
  })

  return (
    <>
      <AdminHeader title="Speakers" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-gray-500">{speakers.length} speakers total</p>
          <Link href="/dashboard/speakers/new" className="btn-primary text-sm">
            + New Speaker
          </Link>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Speaker</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sessions</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {speakers.map((speaker) => (
                <tr key={speaker.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {speaker.photoUrl ? (
                        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                          <Image src={speaker.photoUrl} alt={speaker.name} width={40} height={40}
                            className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-primary font-semibold text-sm">{speaker.name[0]}</span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{speaker.name}</p>
                        {speaker.jobTitle && <p className="text-xs text-gray-400">{speaker.jobTitle}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{speaker.company ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{speaker._count.confSessions}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/dashboard/speakers/${speaker.id}`}
                      className="text-primary hover:underline text-xs font-medium">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {speakers.length === 0 && (
            <p className="text-center text-gray-400 py-12">No speakers yet.</p>
          )}
        </div>
      </main>
    </>
  )
}
