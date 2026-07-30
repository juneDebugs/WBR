import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma, findFirstOpenSlot, assertBlockOpen, EngineError, MEETING_ROOMS } from '@conference/db'

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

  // On approve/confirm, book the FIRST time block that is OPEN for the
  // sponsor and free for the requester — the same exclusive-slot rule the
  // admin Companies scheduler enforces (blackouts and peer meetings included).
  // A stored request block is used when it is still open; when it has gone
  // stale (someone else took it) we fall back to the next open slot instead
  // of dead-ending. No open slot at all → the status still updates and the
  // request stays blockless for the admin scheduler to place later. A pair
  // that already has a confirmed meeting keeps it — no second meeting.
  const sponsorId = request.targetSponsorId ?? user.sponsorId
  const attendeeId = request.requesterId
  let timeBlockId: string | null = null
  let room: string | null = null
  if ((status === 'CONFIRMED' || status === 'APPROVED') && sponsorId) {
    const pairMeeting = await prisma.sponsorMeeting.findFirst({
      where: { sponsorId, userId: attendeeId, status: 'CONFIRMED' },
      select: { id: true },
    })
    if (!pairMeeting) {
      if (request.timeBlockId) {
        const storedStillOpen = await assertBlockOpen(prisma, sponsorId, attendeeId, request.timeBlockId)
          .then(() => true)
          .catch(e => { if (e instanceof EngineError) return false; throw e })
        if (storedStillOpen) { timeBlockId = request.timeBlockId; room = MEETING_ROOMS[0].name }
      }
      if (!timeBlockId) {
        const slot = await findFirstOpenSlot(prisma, sponsorId, attendeeId)
        if (slot) { timeBlockId = slot.timeBlockId; room = slot.room }
      }
    }
  }

  // The status update and the booking commit together — a crash between the
  // two can never leave a CONFIRMED request with no meeting behind it.
  const ops: any[] = [
    prisma.meetingRequest.update({
      where: { id },
      data: { status, ...(timeBlockId ? { timeBlockId } : {}) },
    }),
  ]
  if (timeBlockId && sponsorId) {
    ops.push(prisma.sponsorMeeting.create({
      data: { sponsorId, userId: attendeeId, timeBlockId, location: room, status: 'CONFIRMED' },
    }))
  }
  const [updated] = await prisma.$transaction(ops)

  if (sponsorId) revalidateTag(`meetings-${sponsorId}`)

  return NextResponse.json(updated)
}
