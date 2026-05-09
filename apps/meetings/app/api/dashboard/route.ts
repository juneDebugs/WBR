import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { getDashboardData } from '@/lib/dashboard-data'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({}, { status: 401 })

  const data = await getDashboardData(user.id, user.sponsorId, user.role)
  return NextResponse.json(data)
}
