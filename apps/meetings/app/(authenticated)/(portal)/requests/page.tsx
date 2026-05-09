import { QueryClient, HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { getUserFromHeaders } from '@/lib/user'
import { getMeetingsData } from '@/lib/meetings-data'
import { RequestsList } from '@/components/RequestsList'

export default async function RequestsPage() {
  const user = await getUserFromHeaders()

  const queryClient = new QueryClient()
  await queryClient.prefetchQuery({
    queryKey: ['meetings'],
    queryFn: () => getMeetingsData(user.id, user.sponsorId),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RequestsList currentUserId={user.id} />
    </HydrationBoundary>
  )
}
