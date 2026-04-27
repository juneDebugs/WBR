import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role as string

  const body = await req.json()
  const { status, timeBlockId } = body

  const VALID_STATUSES = ['PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED', 'CANCELLED']
  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // Only STAFF can approve/reject/confirm
  if (role !== 'STAFF') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const updated = await prisma.meetingRequest.update({
    where: { id: params.id },
    data: { status, ...(timeBlockId ? { timeBlockId } : {}) },
    include: { requester: true, targetUser: true, targetSponsor: true, timeBlock: true },
  })

  // If confirmed with a time block and involves a sponsor, create SponsorMeeting
  if (status === 'CONFIRMED' && timeBlockId) {
    const sponsorId = updated.targetSponsorId ?? updated.requester?.sponsorId ?? null
    const attendeeId = updated.targetUserId ?? (updated.requester?.sponsorId ? null : updated.requesterId)

    if (sponsorId && attendeeId) {
      // Check not already created
      const existing = await prisma.sponsorMeeting.findFirst({
        where: { sponsorId, userId: attendeeId, timeBlockId },
      })
      if (!existing) {
        await prisma.sponsorMeeting.create({
          data: { sponsorId, userId: attendeeId, timeBlockId, status: 'CONFIRMED' },
        })
      }
    }
  }

  return NextResponse.json(updated)
}
