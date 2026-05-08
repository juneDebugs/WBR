import { getSession } from '@/lib/session'
import { DashboardView } from '@/components/DashboardView'

export default async function DashboardPage() {
  const session = await getSession()
  const user = session!.user as any
  return (
    <DashboardView
      userName={user.name ?? 'there'}
      isSponsor={!!user.sponsorId}
      userId={user.id}
    />
  )
}
