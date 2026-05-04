import { AdminHeader } from '@/components/AdminHeader'
import SponsorsPageClient from '@/components/SponsorsPageClient'

export default function SponsorsPage() {
  return (
    <>
      <AdminHeader title="Sponsors" />
      <main className="flex-1 p-6 space-y-10">
        <SponsorsPageClient />
      </main>
    </>
  )
}
