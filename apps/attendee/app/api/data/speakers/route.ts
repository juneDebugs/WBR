import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchSpeakersData } from '@/lib/speakers-data'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reading is gated too: a delegate whose required set is incomplete is
  // refused here, not only at the screens. Blocking every screen while
  // leaving the data behind them readable is not a block.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const data = await fetchSpeakersData()
  return NextResponse.json(data)
}
