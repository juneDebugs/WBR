import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { getMeetingsData } from '@/lib/meetings-data'
import { getDashboardData } from '@/lib/dashboard-data'

/**
 * Single consolidated endpoint that returns ALL portal data in one request.
 * Eliminates the waterfall of multiple API calls on page load.
 */
export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({}, { status: 401 })

  const [dashboard, meetings] = await Promise.all([
    getDashboardData(user.id, user.sponsorId, user.role),
    getMeetingsData(user.id, user.sponsorId),
  ])

  return NextResponse.json({ dashboard, meetings })
}
