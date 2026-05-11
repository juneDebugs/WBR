import { AdminHeader } from '@/components/AdminHeader'
import { OverviewClient } from '@/components/OverviewClient'

export default function DashboardPage() {
  return (
    <>
      <AdminHeader title="Overview" />
      <main className="flex-1 p-6">
        <OverviewClient />
      </main>
    </>
  )
}
