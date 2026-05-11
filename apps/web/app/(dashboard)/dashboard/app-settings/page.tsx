import { AdminHeader } from '@/components/AdminHeader'
import { AppSettingsPageClient } from '@/components/AppSettingsPageClient'

export default function AppSettingsPage() {
  return (
    <>
      <AdminHeader title="App Settings" />
      <main className="flex-1 p-6 max-w-3xl">
        <AppSettingsPageClient />
      </main>
    </>
  )
}
