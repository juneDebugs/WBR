import { AdminHeader } from '@/components/AdminHeader'
import MeetingsLog from '@/components/MeetingsLog'
import { permissionDenied } from '@/lib/require-permission'

export default async function MeetingsLogPage() {
  const denied = await permissionDenied('meetings', 'Log')
  if (denied) return denied

  return (
    <>
      <AdminHeader title="Log" />
      <main className="flex-1 p-6">
        <MeetingsLog />
      </main>
    </>
  )
}
