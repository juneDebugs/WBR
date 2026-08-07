import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { requireCompleteProfile } from '@/lib/require-complete-profile'
import { getDashboardData } from '@/lib/dashboard-data'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({}, { status: 401 })
  // The onboarding gate for request handlers. See lib/require-complete-profile.ts.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const data = await getDashboardData(user.id, user.sponsorId, user.role)
  return NextResponse.json(data)
}
