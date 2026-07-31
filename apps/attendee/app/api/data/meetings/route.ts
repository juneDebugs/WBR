import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { getAttendeeMeetings, getSponsorMeetings } from '@/lib/meetings-data'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reading is gated too: a delegate whose required set is incomplete is
  // refused here, not only at the screens. Blocking every screen while
  // leaving the data behind them readable is not a block.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const { id: userId, role, sponsorId } = user

  if (role === 'SPONSOR' && sponsorId) {
    const data = await unstable_cache(
      () => getSponsorMeetings(sponsorId),
      ['sponsor-meetings', sponsorId],
      { revalidate: 30, tags: [`sponsor-meetings-${sponsorId}`] },
    )()
    return NextResponse.json(data)
  }

  if (role === 'SPONSOR') {
    return NextResponse.json({ role: 'SPONSOR', noSponsor: true })
  }

  const data = await unstable_cache(
    () => getAttendeeMeetings(userId),
    ['attendee-meetings', userId],
    { revalidate: 30, tags: [`meetings-${userId}`] },
  )()
  return NextResponse.json(data)
}
