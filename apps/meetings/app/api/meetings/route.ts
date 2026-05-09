import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { getMeetingsData } from '@/lib/meetings-data'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({}, { status: 401 })

  const data = await getMeetingsData(user.id, user.sponsorId)
  return NextResponse.json(data)
}
