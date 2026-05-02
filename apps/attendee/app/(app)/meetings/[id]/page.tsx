export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { format } from 'date-fns'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { MeetingActions } from '@/components/meetings/MeetingActions'

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-500',
}

export default async function MeetingDetailPage({ params }: { params: { id: string } }) {
  const authSession = (await getSession())!

  const userId = authSession.user.id

  const meeting = await prisma.meeting.findUnique({
    where: { id: params.id },
    include: {
      timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
      attendeeA: { select: { id: true, name: true, image: true, company: true, jobTitle: true, bio: true } },
      attendeeB: { select: { id: true, name: true, image: true, company: true, jobTitle: true, bio: true } },
    },
  })

  if (!meeting) notFound()
  if (meeting.attendeeAId !== userId && meeting.attendeeBId !== userId) notFound()

  const other = meeting.attendeeAId === userId ? meeting.attendeeB : meeting.attendeeA

  return (
    <div className="page-container space-y-4">
      <Link href="/meetings" className="flex items-center gap-1 text-primary text-sm">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Meetings
      </Link>

      {/* Meeting info */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold text-gray-900">1-1 Meeting</h1>
          <span className={`badge ${statusColors[meeting.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {meeting.status.charAt(0) + meeting.status.slice(1).toLowerCase()}
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Date & Time</p>
              <p className="text-sm text-gray-900 font-semibold mt-0.5">
                {format(meeting.timeBlock.startsAt, 'EEEE, MMMM d, yyyy')}
              </p>
              <p className="text-sm text-gray-600">
                {format(meeting.timeBlock.startsAt, 'h:mm a')} – {format(meeting.timeBlock.endsAt, 'h:mm a')}
              </p>
            </div>
          </div>

          {meeting.timeBlock.location && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Location</p>
                <p className="text-sm text-gray-900 font-semibold mt-0.5">{meeting.timeBlock.location}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Meeting partner */}
      <div className="card">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Meeting With</h2>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full flex-shrink-0 overflow-hidden bg-primary/10 flex items-center justify-center">
            {other.image
              ? <img src={other.image} alt={other.name ?? ''} className="w-14 h-14 rounded-full object-cover" />
              : <span className="text-primary font-bold text-xl">{(other.name ?? '?')[0]}</span>}
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{other.name ?? 'Unknown'}</h3>
            {other.jobTitle && <p className="text-sm text-gray-600">{other.jobTitle}</p>}
            {other.company && <p className="text-sm text-primary font-medium">{other.company}</p>}
            {other.bio && <p className="text-sm text-gray-500 mt-2 leading-relaxed line-clamp-3">{other.bio}</p>}
          </div>
        </div>
      </div>

      {/* Actions: notes, DM, iCal, cancel */}
      <MeetingActions
        meetingId={meeting.id}
        otherUserId={other.id}
        otherName={other.name ?? 'Attendee'}
        status={meeting.status}
        notes={meeting.notes}
        startsAt={meeting.timeBlock.startsAt.toISOString()}
        endsAt={meeting.timeBlock.endsAt.toISOString()}
        location={meeting.timeBlock.location}
      />
    </div>
  )
}
