import { redirect } from 'next/navigation'
import { AdminHeader } from '@/components/AdminHeader'
import MeetingsPageClient from '@/components/MeetingsPageClient'
import { permissionDenied } from '@/lib/require-permission'

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; type?: string; company?: string; view?: string }> }) {
  const denied = await permissionDenied('meetings', 'Meetings')
  if (denied) return denied

  const params = await searchParams
  // Check-In graduated to its own sidebar page; keep old tab links working.
  if (params.tab === 'checkin') redirect('/dashboard/meetings/check-in')

  return (
    <>
      <AdminHeader title="Meetings" />
      <main className="flex-1 p-6">
        <MeetingsPageClient tab={params.tab} status={params.status} type={params.type} company={params.company} view={params.view} />
      </main>
    </>
  )
}
