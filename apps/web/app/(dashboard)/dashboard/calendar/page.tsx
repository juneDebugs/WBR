import { AdminHeader } from '@/components/AdminHeader'
import { CalendarPageClient } from '@/components/CalendarPageClient'

export default function CalendarPage() {
  return (
    <>
      <AdminHeader title="Calendar" />
      <main className="flex-1 p-6">
        <CalendarPageClient />
      </main>
    </>
  )
}
