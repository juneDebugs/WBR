import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getSession } from '@/lib/session'
import { DashboardView } from '@/components/DashboardView'
import { fetchSponsorData, fetchMeetingsData, getCachedAttendees } from '@/lib/server-data'

export default async function DashboardPage() {
  const session = await getSession()
  const user = session!.user as any
  const sponsorId = user.sponsorId ?? null

  const queryClient = new QueryClient()
  const [sponsorData, meetingsData, attendees] = await Promise.all([
    fetchSponsorData(user.id, sponsorId),
    fetchMeetingsData(sponsorId),
    getCachedAttendees(),
  ])
  queryClient.setQueryData(['sponsor-data'], sponsorData)
  queryClient.setQueryData(['meetings-data'], meetingsData)
  queryClient.setQueryData(['attendees'], attendees)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardView
        userName={user.name ?? 'Sponsor'}
        userRole={user.role}
        sponsorId={sponsorId}
      />
    </HydrationBoundary>
  )
}
