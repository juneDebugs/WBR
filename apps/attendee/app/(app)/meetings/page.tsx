import { prisma } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { format } from 'date-fns'
import Link from 'next/link'
import { redirect } from 'next/navigation'

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-500',
}

export default async function MeetingsPage() {
  const authSession = await getServerSession(authOptions)
  if (!authSession?.user?.id) redirect('/login')

  const userId = authSession.user.id

  const meetings = await prisma.meeting.findMany({
    where: {
      OR: [{ attendeeAId: userId }, { attendeeBId: userId }],
    },
    include: {
      timeBlock: true,
      attendeeA: true,
      attendeeB: true,
    },
    orderBy: { timeBlock: { startsAt: 'asc' } },
  })

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold mb-6">My Meetings</h1>

      {meetings.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">No meetings scheduled</p>
          <p className="text-gray-400 text-sm mt-1">Your 1-1 meetings will appear here.</p>
        </div>
      )}

      <div className="space-y-3">
        {meetings.map((meeting) => {
          const other = meeting.attendeeAId === userId ? meeting.attendeeB : meeting.attendeeA
          return (
            <Link key={meeting.id} href={`/meetings/${meeting.id}`}
              className="card block active:scale-[0.99] transition-transform">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {other.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={other.image} alt={other.name ?? ''} className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <span className="text-primary font-bold">{(other.name ?? '?')[0]}</span>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{other.name ?? 'Unknown'}</p>
                    {other.company && <p className="text-xs text-gray-500">{other.company}</p>}
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {format(meeting.timeBlock.startsAt, 'MMM d, h:mm a')} – {format(meeting.timeBlock.endsAt, 'h:mm a')}
                    </div>
                    {meeting.timeBlock.location && (
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        {meeting.timeBlock.location}
                      </div>
                    )}
                  </div>
                </div>
                <span className={`badge flex-shrink-0 ${statusColors[meeting.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
