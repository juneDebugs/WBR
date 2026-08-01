import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchFloorPlanData } from '@/lib/floor-plan-data'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reading is gated too, the same as every other data address in this app. A
  // delegate blocked from every screen who can still read the venue's maps is
  // not blocked. See lib/require-complete-profile.ts.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const data = await fetchFloorPlanData()
  return NextResponse.json(data)
}
