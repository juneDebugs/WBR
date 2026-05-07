import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!user.sponsorId && user.role !== 'STAFF') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await req.json()
  if (!['APPROVED', 'REJECTED', 'CONFIRMED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const request = await prisma.meetingRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Ensure the request belongs to this sponsor (unless staff)
  if (user.role !== 'STAFF' && request.targetSponsorId !== user.sponsorId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // If confirming or approving, auto-assign a time block and create SponsorMeeting
  let timeBlockId = request.timeBlockId
  if ((status === 'CONFIRMED' || status === 'APPROVED') && !timeBlockId) {
    // Find occupied time blocks for both the requester and the sponsor
    const [requesterBusy, sponsorBusy] = await Promise.all([
      prisma.meetingRequest.findMany({
        where: { OR: [{ requesterId: request.requesterId }, { targetUserId: request.requesterId }], timeBlockId: { not: null }, status: { in: ['CONFIRMED', 'APPROVED'] } },
        select: { timeBlockId: true },
      }),
      prisma.sponsorMeeting.findMany({
        where: { sponsorId: request.targetSponsorId ?? user.sponsorId },
        select: { timeBlockId: true },
      }),
    ])

    const busySet = new Set([
      ...requesterBusy.map(r => r.timeBlockId).filter(Boolean),
      ...sponsorBusy.map(r => r.timeBlockId),
    ])

    // Find first available time block
    const available = await prisma.timeBlock.findFirst({
      where: { id: { notIn: [...busySet] as string[] } },
      orderBy: { startsAt: 'asc' },
    })

    if (available) {
      timeBlockId = available.id
    }
  }

  const updated = await prisma.meetingRequest.update({
    where: { id },
    data: { status, ...(timeBlockId ? { timeBlockId } : {}) },
  })

  // Create SponsorMeeting if confirmed/approved with a time block and involves a sponsor
  if ((status === 'CONFIRMED' || status === 'APPROVED') && timeBlockId) {
    const sponsorId = request.targetSponsorId ?? user.sponsorId
    const attendeeId = request.requesterId

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

  const sponsorId = request.targetSponsorId ?? user.sponsorId
  if (sponsorId) revalidateTag(`meetings-${sponsorId}`)

  return NextResponse.json(updated)
}
