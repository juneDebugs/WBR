import { AdminHeader } from '@/components/AdminHeader'
import { AttendeesTable } from '@/components/AttendeesTable'
import { fetchAttendeesPage } from '@/lib/attendees-query'
import { permissionDenied } from '@/lib/require-permission'

export default async function AttendeesPage() {
  const denied = await permissionDenied('attendees', 'Attendees')
  if (denied) return denied

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
