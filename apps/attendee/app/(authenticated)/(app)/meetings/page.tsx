'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useMeetingsData } from '@/lib/hooks'
import { AttendeesMeetingsView } from '@/components/meetings/AttendeesMeetingsView'
import { SponsorMeetingsView } from '@/components/meetings/SponsorMeetingsView'
import MeetingsLoading from './loading'

function MeetingsContent() {
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') ?? 'upcoming'
  const { data, isLoading } = useMeetingsData()
  const queryClient = useQueryClient()

  if (isLoading || !data) return <MeetingsLoading />

  async function handleDecline(id: string) {
    await fetch('/api/meeting-requests/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    queryClient.invalidateQueries({ queryKey: ['meetings-data'] })
  }

  if (data.role === 'SPONSOR') {
    if (data.noSponsor) {
      return (
        <div className="page-container">
          <h1 className="text-2xl font-bold mb-2">Meetings</h1>
          <p className="text-sm text-gray-500">Your account isn't linked to a sponsor yet. Contact the organiser.</p>
        </div>
      )
    }

    return (
      <SponsorMeetingsView
        sponsor={data.sponsor}
        upcoming={data.upcoming}
        past={data.past}
        inboundRequests={data.inboundRequests}
        tab={tab}
      />
    )
  }

  return (
    <AttendeesMeetingsView
      upcoming={data.upcoming}
      past={data.past}
      incomingRequests={data.incomingRequests}
      tab={tab}
      onDecline={handleDecline}
    />
  )
}

export default function MeetingsPage() {
  return (
    <Suspense fallback={<MeetingsLoading />}>
      <MeetingsContent />
    </Suspense>
  )
}
