import { getUserFromHeaders } from '@/lib/user'
import { DashboardView } from '@/components/DashboardView'

export default async function DashboardPage() {
  const user = await getUserFromHeaders()
  return (
    <DashboardView
      userName={user.name || 'Sponsor'}
      userRole={user.role}
      sponsorId={user.sponsorId}
    />
  )
}
