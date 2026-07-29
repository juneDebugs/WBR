import { AdminHeader } from '@/components/AdminHeader'
import { CheckInBoard } from '@/components/CheckInBoard'
import { permissionDenied } from '@/lib/require-permission'

export default async function CheckInPage() {
  const denied = await permissionDenied('meetings', 'Check-In')
  if (denied) return denied

  // The Check-In floor grid needs the full viewport width (no reading cap).
  return (
    <>
      <AdminHeader title="Check-In" />
      <main className="flex-1 p-6">
        <CheckInBoard />
      </main>
    </>
  )
}
