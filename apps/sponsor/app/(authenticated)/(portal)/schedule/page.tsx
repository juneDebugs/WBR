import { QueryClient, dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { getSession } from '@/lib/session'
import { ScheduleView } from '@/components/ScheduleView'
import { fetchMeetingsData } from '@/lib/server-data'

export default async function SchedulePage() {
  const session = await getSession()
  const user = session!.user as any

  const queryClient = new QueryClient()
  const meetingsData = await fetchMeetingsData(user.sponsorId ?? null)
  queryClient.setQueryData(['meetings-data'], meetingsData)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ScheduleView />
    </HydrationBoundary>
  )
}
