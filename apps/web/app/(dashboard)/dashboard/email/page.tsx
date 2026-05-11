import { AdminHeader } from '@/components/AdminHeader'
import { EmailPageClient } from '@/components/EmailPageClient'

export default function EmailPage() {
  return (
    <>
      <AdminHeader title="Email" />
      <main className="flex-1 p-6">
        <EmailPageClient />
      </main>
    </>
  )
}
