import { AdminHeader } from '@/components/AdminHeader'
import SponsorsPageClient from '@/components/SponsorsPageClient'
import { permissionDenied } from '@/lib/require-permission'

export default async function SponsorsPage() {
  const denied = await permissionDenied('sponsors', 'Sponsors')
  if (denied) return denied

  return (
    <>
      <AdminHeader title="Sponsors" />
      <main className="flex-1 p-6 space-y-10">
        <SponsorsPageClient />
      </main>
    </>
  )
}
