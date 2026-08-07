import { getUserFromHeaders } from '@/lib/user'
import { redirect } from 'next/navigation'
import { prisma, isWbrStaff } from '@conference/db'
import { MeetingEngineConsole } from '@/components/engine/MeetingEngineConsole'

export const dynamic = 'force-dynamic'

// WBR-staff company-centric meeting engine (replaces the flat request queue).
// Gated on the WBR staff/organizer tier (wbr@test.com is ORGANIZER). Data is
// loaded client-side from /api/staff/* so mutations can refetch without a full
// navigation. See docs/prd/meeting-engine.md.
//
// The role is read from the database rather than from the middleware-forwarded
// header, so this screen and the addresses behind it answer the same question
// the same way — see the note in lib/staff-api.ts (UF-31). A screen that
// rendered for a revoked operator while every address it calls answered 403
// would be a console full of error states rather than a refusal.
export default async function StaffPage() {
  const user = await getUserFromHeaders()
  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (!isWbrStaff(account?.role)) redirect('/browse')
  return <MeetingEngineConsole />
}
