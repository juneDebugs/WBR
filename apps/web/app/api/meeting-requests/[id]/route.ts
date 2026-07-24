import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { status, timeBlockId, priority } = body

  // Priority-only edits are allowed (admin re-tiering a request in place); a
  // status, when present, must be valid.
  const VALID_STATUSES = ['PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED', 'CANCELLED']
  const VALID_PRIORITIES = ['BEST_FIT', 'MED', 'LOW']
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }
  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
  }
  if (status === undefined && priority === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const updated = await prisma.meetingRequest.update({
    where: { id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(timeBlockId !== undefined ? { timeBlockId: timeBlockId || null } : {}),
    },
    include: {
      requester: { select: { id: true, name: true, email: true, company: true, role: true, sponsorId: true } },
      targetUser: { select: { id: true, name: true, email: true, company: true, role: true } },
      targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
      timeBlock: true,
    },
  })

  // When confirmed with a time block + involves a sponsor, create SponsorMeeting
  if (status === 'CONFIRMED' && timeBlockId) {
    const sponsorId = updated.targetSponsorId ?? (updated.requester as any).sponsorId ?? null
    const attendeeId = updated.targetUserId ?? (sponsorId ? updated.requesterId : null)

    if (sponsorId && attendeeId) {
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

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: requestId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  if (!['STAFF', 'ORGANIZER', 'ADMIN'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Also delete any associated SponsorMeeting created when this was confirmed
  const request = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
    select: { requesterId: true, targetSponsorId: true, targetUserId: true, timeBlockId: true },
  })

  if (request?.targetSponsorId && request.timeBlockId) {
    const attendeeId = request.targetUserId ?? request.requesterId
    await prisma.sponsorMeeting.deleteMany({
      where: { sponsorId: request.targetSponsorId, userId: attendeeId, timeBlockId: request.timeBlockId },
    })
  }

  await prisma.meetingRequest.delete({ where: { id: requestId } })
  return NextResponse.json({ ok: true })
}
