import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ sponsorIds: [], userIds: [] }, { status: 401 })

  const userId = (session.user as any).id as string

  const rows = await prisma.meetingRequest.findMany({
    where: { requesterId: userId, status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
    select: { targetSponsorId: true, targetUserId: true },
  })

  return NextResponse.json({
    sponsorIds: [...new Set(rows.map(r => r.targetSponsorId).filter(Boolean) as string[])],
    userIds: [...new Set(rows.map(r => r.targetUserId).filter(Boolean) as string[])],
  })
}
