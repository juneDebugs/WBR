import { AdminHeader } from '@/components/AdminHeader'
import { AttendeesTable } from '@/components/AttendeesTable'

export default function AttendeesPage() {
  return (
    <>
      <AdminHeader title="Attendees" />
      <main className="flex-1 p-6">
        <AttendeesTable />
      </main>
    </>
  )
}
