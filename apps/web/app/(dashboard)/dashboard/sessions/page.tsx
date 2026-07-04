import { AdminHeader } from '@/components/AdminHeader'
import SessionsPageClient from '@/components/SessionsPageClient'
import { permissionDenied } from '@/lib/require-permission'

export default async function SessionsPage() {
  const denied = await permissionDenied('agenda', 'Agenda')
  if (denied) return denied

  return (
    <>
      <AdminHeader title="Agenda" />
      <main className="flex-1 p-6">
        <SessionsPageClient />
      </main>
    </>
  )
}
