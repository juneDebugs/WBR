import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { getCachedAttendees } from '@/lib/server-data'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const people = await getCachedAttendees()
  return NextResponse.json(people, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
    },
  })
}
