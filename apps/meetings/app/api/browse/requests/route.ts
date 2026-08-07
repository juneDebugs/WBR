import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { requireCompleteProfile } from '@/lib/require-complete-profile'
import { prisma } from '@conference/db'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({ sponsorIds: [], userIds: [] }, { status: 401 })
  // The onboarding gate for request handlers. See lib/require-complete-profile.ts.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const rows = await prisma.meetingRequest.findMany({
    where: { requesterId: user.id, status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
    select: { targetSponsorId: true, targetUserId: true },
  })

  return NextResponse.json({
    sponsorIds: [...new Set(rows.map(r => r.targetSponsorId).filter(Boolean) as string[])],
    userIds: [...new Set(rows.map(r => r.targetUserId).filter(Boolean) as string[])],
  })
}
