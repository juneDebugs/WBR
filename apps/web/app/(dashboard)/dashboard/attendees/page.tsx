import { AdminHeader } from '@/components/AdminHeader'
import { AttendeesTable } from '@/components/AttendeesTable'
import { fetchAttendeesPage } from '@/lib/attendees-query'

export default async function AttendeesPage() {
  const firstPage = await fetchAttendeesPage({ page: 0 })
  return (
    <>
      <AdminHeader title="Attendees" />
      <main className="flex-1 p-6">
        <AttendeesTable initialData={firstPage} />
      </main>
    </>
  )
}
