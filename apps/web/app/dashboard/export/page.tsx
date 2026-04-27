import { AdminHeader } from '@/components/AdminHeader'
import { ExportClient } from '@/components/ExportClient'

export default function ExportPage() {
  return (
    <>
      <AdminHeader title="Export" />
      <main className="flex-1 p-6">
        <ExportClient />
      </main>
    </>
  )
}
