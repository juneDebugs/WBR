import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { fetchSpeakersData } from '@/lib/speakers-data'

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const data = await fetchSpeakersData()
  return NextResponse.json(data)
}
