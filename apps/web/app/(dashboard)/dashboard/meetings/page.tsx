import { AdminHeader } from '@/components/AdminHeader'
import MeetingsPageClient from '@/components/MeetingsPageClient'
import { permissionDenied } from '@/lib/require-permission'

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; type?: string; company?: string }> }) {
  const denied = await permissionDenied('meetings', 'Meetings')
  if (denied) return denied

  const params = await searchParams
  // The Companies scheduler (bank sidebar + slot grid) and the Check-In floor
  // grid need the full viewport width; the other tabs keep the reading cap.
  return (
    <>
      <AdminHeader title="Meetings" />
      <main className={`flex-1 p-6 ${params.tab === 'companies' || params.tab === 'checkin' ? '' : 'max-w-6xl'}`}>
        <MeetingsPageClient tab={params.tab} status={params.status} type={params.type} company={params.company} />
      </main>
    </>
  )
}
