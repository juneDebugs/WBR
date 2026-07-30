import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma, resolveParties, syncAutoMatches, assertBlockOpen, EngineError, engineErrorHttpStatus } from '@conference/db'
import { invalidate } from '@/lib/mem-cache'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUserFromHeaders()
  if (!user.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = user.role

  const body = await req.json()
  const { status, timeBlockId, priority } = body

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

  // Only STAFF can approve/reject/confirm/re-tier
  if (role !== 'STAFF') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Confirming into a slot must respect the engine invariants (exclusive
  // slots: one meeting per sponsor per block, attendee free at the block, one
  // confirmed meeting per pair) — this path used to create SponsorMeetings
  // unguarded, which is how double-booked slots got into the DB. The SAME
  // resolved pair is guarded and booked, so the checked party is always the
  // booked party.
  let parties: ReturnType<typeof resolveParties> = null
  if (status === 'CONFIRMED' && timeBlockId) {
    const current = await prisma.meetingRequest.findUnique({
      where: { id },
      select: {
        requesterId: true, targetUserId: true, targetSponsorId: true,
        requester: { select: { sponsorId: true } },
      },
    })
    if (!current) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    parties = resolveParties(current)
    if (parties) {
      const pairExisting = await prisma.sponsorMeeting.findFirst({
        where: { sponsorId: parties.sponsorId, userId: parties.userId, status: 'CONFIRMED' },
        select: { id: true },
      })
      if (pairExisting) {
        return NextResponse.json({ error: 'This attendee already has a confirmed meeting with this company', code: 'ALREADY_SCHEDULED' }, { status: 409 })
      }
      try {
        await assertBlockOpen(prisma, parties.sponsorId, parties.userId, timeBlockId)
      } catch (e) {
        if (e instanceof EngineError) {
          return NextResponse.json({ error: e.message, code: e.code }, { status: engineErrorHttpStatus(e.code) })
        }
        throw e
      }
    }
  }

  // The status update and the booking commit together — a crash between the
  // two can never leave a CONFIRMED request with no meeting behind it.
  const ops: any[] = [
    prisma.meetingRequest.update({
      where: { id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(timeBlockId ? { timeBlockId } : {}),
      },
      include: { requester: true, targetUser: true, targetSponsor: true, timeBlock: true },
    }),
  ]
  if (status === 'CONFIRMED' && timeBlockId && parties) {
    ops.push(prisma.sponsorMeeting.create({
      data: { sponsorId: parties.sponsorId, userId: parties.userId, repId: parties.repId, timeBlockId, status: 'CONFIRMED' },
    }))
  }
  const [updated] = await prisma.$transaction(ops)

  // A staff re-tier to Best Fit can complete a mutual match, which schedules
  // the meeting immediately. Idempotent sweep; never fails the update itself.
  if (priority === 'BEST_FIT') await syncAutoMatches(prisma).catch(() => {})

  // Invalidate in-memory cache for affected users
  invalidate(updated.requesterId)
  if (updated.targetUserId) invalidate(updated.targetUserId)

  revalidateTag('meeting-requests')
  revalidateTag(`meetings-user-${updated.requesterId}`)
  if (updated.targetUserId) revalidateTag(`meetings-user-${updated.targetUserId}`)
  return NextResponse.json(updated)
}
