import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { invalidate } from '@/lib/mem-cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
    where: { id },
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

  // Invalidate in-memory cache for affected users
  invalidate(updated.requesterId)
  if (updated.targetUserId) invalidate(updated.targetUserId)

  revalidateTag('meeting-requests')
  revalidateTag(`meetings-user-${updated.requesterId}`)
  if (updated.targetUserId) revalidateTag(`meetings-user-${updated.targetUserId}`)
  return NextResponse.json(updated)
}
