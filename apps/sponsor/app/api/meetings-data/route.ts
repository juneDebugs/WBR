import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { fetchMeetingsData } from '@/lib/server-data'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const data = await fetchMeetingsData(user.sponsorId)
  return NextResponse.json(data)
}
