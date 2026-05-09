import { QueryClient, HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { getUserFromHeaders } from '@/lib/user'
import { getMeetingsData } from '@/lib/meetings-data'
import { MeetingsView } from '@/components/MeetingsView'

export default async function MeetingsPage() {
  const user = await getUserFromHeaders()

  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: ['meetings'],
    queryFn: () => getMeetingsData(user.id, user.sponsorId),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MeetingsView
        currentUserId={user.id}
        currentSponsorId={user.sponsorId}
      />
    </HydrationBoundary>
  )
}
