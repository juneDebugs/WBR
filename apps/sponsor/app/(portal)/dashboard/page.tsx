import { getSession } from '@/lib/session'
import { DashboardView } from '@/components/DashboardView'

export default async function DashboardPage() {
  const session = await getSession()
  const user = session!.user as any

  return (
    <DashboardView
      userName={user.name ?? 'Sponsor'}
      userRole={user.role}
      sponsorId={user.sponsorId ?? null}
    />
  )
}
