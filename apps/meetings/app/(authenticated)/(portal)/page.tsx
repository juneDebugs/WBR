import { getUserFromHeaders } from '@/lib/user'
import { DashboardView } from '@/components/DashboardView'

export default async function DashboardPage() {
  const user = await getUserFromHeaders()
  return (
    <DashboardView
      isSponsor={!!user.sponsorId}
      userId={user.id}
    />
  )
}
