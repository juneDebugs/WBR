import { getUserFromHeaders } from '@/lib/user'
import { redirect } from 'next/navigation'
import { isWbrStaff } from '@conference/db'
import { MeetingEngineConsole } from '@/components/engine/MeetingEngineConsole'

export const dynamic = 'force-dynamic'

// WBR-staff company-centric meeting engine (replaces the flat request queue).
// Gated on the WBR staff/organizer tier (wbr@test.com is ORGANIZER). Data is
// loaded client-side from /api/staff/* so mutations can refetch without a full
// navigation. See docs/prd/meeting-engine.md.
export default async function StaffPage() {
  const user = await getUserFromHeaders()
  if (!isWbrStaff(user.role)) redirect('/browse')
  return <MeetingEngineConsole />
}
