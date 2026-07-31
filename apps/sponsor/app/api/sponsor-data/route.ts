import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { fetchSponsorData } from '@/lib/server-data'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const data = await fetchSponsorData(user.id, user.sponsorId)
  return NextResponse.json(data)
}
