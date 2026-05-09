import { redirect } from 'next/navigation'
import { QueryClient, HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { getUserFromHeaders } from '@/lib/user'
import { getMeetingsData } from '@/lib/meetings-data'
import { NavBar } from '@/components/NavBar'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders()
  if (!user.id) redirect('/login')

  const queryClient = new QueryClient()
  const data = await getMeetingsData(user.id, user.sponsorId)
  queryClient.setQueryData(['meetings'], data)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="min-h-screen flex flex-col">
        <NavBar role={user.role} />
        <main className="flex-1">{children}</main>
      </div>
    </HydrationBoundary>
  )
}
