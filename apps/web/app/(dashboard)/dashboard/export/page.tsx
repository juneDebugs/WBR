import { AdminHeader } from '@/components/AdminHeader'
import { ExportClient } from '@/components/ExportClient'
import { permissionDenied } from '@/lib/require-permission'

export default async function ExportPage() {
  const denied = await permissionDenied('export', 'Export')
  if (denied) return denied
  return (
    <>
      <AdminHeader title="Export" />
      <main className="flex-1 p-6">
        <ExportClient />
      </main>
    </>
  )
}
