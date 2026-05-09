import { QueryClient, HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { getUserFromHeaders } from '@/lib/user'
import { getDashboardData } from '@/lib/dashboard-data'
import { getMeetingsData } from '@/lib/meetings-data'
import { DashboardView } from '@/components/DashboardView'

export default async function DashboardPage() {
  const user = await getUserFromHeaders()

  const queryClient = new QueryClient()

  // Prefetch dashboard AND meetings data in parallel on the server.
  // Meetings data is pre-warmed so navigating to /meetings or /requests is instant.
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: ['dashboard'],
      queryFn: () => getDashboardData(user.id, user.sponsorId, user.role),
    }),
    queryClient.prefetchQuery({
      queryKey: ['meetings'],
      queryFn: () => getMeetingsData(user.id, user.sponsorId),
    }),
  ])

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardView
        isSponsor={!!user.sponsorId}
        userId={user.id}
      />
    </HydrationBoundary>
  )
}
