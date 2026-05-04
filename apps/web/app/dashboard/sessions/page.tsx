import { AdminHeader } from '@/components/AdminHeader'
import SessionsPageClient from '@/components/SessionsPageClient'

export default function SessionsPage() {
  return (
    <>
      <AdminHeader title="Agenda" />
      <main className="flex-1 p-6">
        <SessionsPageClient />
      </main>
    </>
  )
}
