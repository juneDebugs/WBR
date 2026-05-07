import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchMeetingsData } from '@/lib/server-data'

export async function GET() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user as any
  const data = await fetchMeetingsData(user.sponsorId ?? null)
  return NextResponse.json(data)
}
