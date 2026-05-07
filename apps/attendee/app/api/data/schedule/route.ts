import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchScheduleData } from '@/lib/schedule-data'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id as string
  const data = await fetchScheduleData(userId)
  return NextResponse.json(data)
}
