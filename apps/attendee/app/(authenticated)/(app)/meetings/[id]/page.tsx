'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { format } from 'date-fns'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MeetingActions } from '@/components/meetings/MeetingActions'

const statusColors: Record<string, string> = {
  CONFIRMED: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  CANCELLED: 'bg-red-100 text-red-500',
}

type MeetingDetail = {
  id: string
  status: string
  notes: string | null
  startsAt: string
  endsAt: string
  location: string | null
  other: { id: string; name: string | null; image: string | null; company: string | null; jobTitle: string | null; bio: string | null }
}

function DetailSkeleton() {
  return (
    <div className="page-container space-y-4 animate-pulse">
      <div className="h-4 w-20 bg-gray-200 rounded" />
      <div className="card">
        <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
        <div className="space-y-3">
          <div className="h-12 bg-gray-200 rounded" />
          <div className="h-12 bg-gray-200 rounded" />
        </div>
      </div>
      <div className="card">
        <div className="h-4 w-24 bg-gray-200 rounded mb-3" />
        <div className="flex gap-4">
          <div className="w-14 h-14 bg-gray-200 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-32 bg-gray-200 rounded" />
            <div className="h-4 w-24 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>()
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)

  useEffect(() => {
    fetch(`/api/meetings/${params.id}`)
      .then(r => {
        if (!r.ok) { setNotFoundState(true); return null }
        return r.json()
      })
      .then(data => { if (data) setMeeting(data) })
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <DetailSkeleton />
  if (notFoundState || !meeting) return notFound()

  const other = meeting.other

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
                {format(new Date(meeting.startsAt), 'EEEE, MMMM d, yyyy')}
              </p>
              <p className="text-sm text-gray-600">
                {format(new Date(meeting.startsAt), 'h:mm a')} – {format(new Date(meeting.endsAt), 'h:mm a')}
              </p>
            </div>
          </div>

          {meeting.location && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Location</p>
                <p className="text-sm text-gray-900 font-semibold mt-0.5">{meeting.location}</p>
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
              ? <img src={other.image} alt={other.name ?? ''} loading="lazy" className="w-14 h-14 rounded-full object-cover" />
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
        startsAt={meeting.startsAt}
        endsAt={meeting.endsAt}
        location={meeting.location}
      />
    </div>
  )
}
