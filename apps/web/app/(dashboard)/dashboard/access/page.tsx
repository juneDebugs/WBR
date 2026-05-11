import { AdminHeader } from '@/components/AdminHeader'
import { AccessPageClient } from '@/components/AccessPageClient'

export default function AccessPage() {
  return (
    <>
      <AdminHeader title="Access & Roles" />
      <main className="flex-1 p-6">
        <AccessPageClient />
      </main>
    </>
  )
}
