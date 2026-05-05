import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getUserFromHeaders } from '@/lib/user'
import { getAttendeeMeetings, getSponsorMeetings } from '@/lib/meetings-data'
import MeetingsClient from './MeetingsClient'

async function fetchMeetingsData(user: { id: string; role: string; sponsorId: string | null }) {
  if (user.role === 'SPONSOR' && user.sponsorId) return getSponsorMeetings(user.sponsorId)
  if (user.role === 'SPONSOR') return { role: 'SPONSOR' as const, noSponsor: true as const }
  return getAttendeeMeetings(user.id)
}

export default async function MeetingsPage() {
  const queryClient = new QueryClient()
  const user = await getUserFromHeaders()

  if (user) {
    const data = await fetchMeetingsData(user)
    queryClient.setQueryData(['meetings-data'], data)
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MeetingsClient />
    </HydrationBoundary>
  )
}
