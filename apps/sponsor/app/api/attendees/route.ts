import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getCachedAttendees } from '@/lib/server-data'

export async function GET() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const people = await getCachedAttendees()
  return NextResponse.json(people, {
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
    },
  })
}
