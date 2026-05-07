import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchHomeData } from '@/lib/home-data'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as any).id as string
  const sponsorId = (session.user as any).sponsorId as string | null

  const data = await fetchHomeData(userId, sponsorId)
  return NextResponse.json(data)
}
