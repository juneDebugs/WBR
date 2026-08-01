import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { fetchMeetingsData } from '@/lib/server-data'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Company from the database, not the session token: a representative moved
  // between companies mid-session was shown the meetings of the company they
  // had left. Phase 6.5.
  const { refused, companyId } = await requireCompleteProfile()
  if (refused) return refused

  const data = await fetchMeetingsData(companyId)
  return NextResponse.json(data)
}
