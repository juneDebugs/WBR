import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getUserFromHeaders } from '@/lib/user'
import { prisma, resolveParties, assertBlockOpen, commitOrConflict, EngineError, engineErrorHttpStatus, isWbrStaff } from '@conference/db'
import { triggerAutoMatchForPick } from '@/lib/auto-match'

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

  // Authorization. The WBR-staff tier (WBR/ORGANIZER/ADMIN/STAFF) keeps full
  // power — any status, timeBlockId, priority — matching lib/staff-api.ts. A
  // non-staff user may only approve/reject an inbound request that targets them
  // (never re-tier or schedule). The old `role !== 'STAFF'` check both 403'd the
  // portal's Approve/Decline buttons for their intended recipients and locked
  // out ORGANIZER/ADMIN/WBR staff accounts.
  if (!isWbrStaff(role)) {
    const target = await prisma.meetingRequest.findUnique({
      where: { id },
      select: { targetUserId: true, targetSponsorId: true },
    })
    if (!target) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    const isRecipient =
      user.id === target.targetUserId ||
      (!!user.sponsorId && user.sponsorId === target.targetSponsorId)
    if (
      !isRecipient ||
      (status !== 'APPROVED' && status !== 'REJECTED') ||
      priority !== undefined ||
      timeBlockId !== undefined
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

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
      include: {
        requester: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, role: true } },
        targetUser: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, role: true } },
        targetSponsor: true,
        timeBlock: true,
      },
    }),
  ]
  if (status === 'CONFIRMED' && timeBlockId && parties) {
    ops.push(prisma.sponsorMeeting.create({
      data: { sponsorId: parties.sponsorId, userId: parties.userId, repId: parties.repId, timeBlockId, status: 'CONFIRMED' },
    }))
  }
  let updated
  try {
    // commitOrConflict maps the DB exclusive-slot index (the backstop for a
    // true concurrent write that slips past the guard above) to a typed 409.
    ;[updated] = await commitOrConflict(() => prisma.$transaction(ops))
  } catch (e) {
    if (e instanceof EngineError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: engineErrorHttpStatus(e.code) })
    }
    throw e
  }

  // A staff re-tier to Best Fit can complete a mutual match, which schedules
  // the meeting immediately. Only pay the full sweep synchronously when a
  // reciprocal live pick actually exists; otherwise defer it (see auto-match).
  if (priority === 'BEST_FIT') {
    let requesterSponsorId: string | null = null
    if (updated.targetUserId && !updated.targetSponsorId) {
      const r = await prisma.user.findUnique({ where: { id: updated.requesterId }, select: { sponsorId: true } })
      requesterSponsorId = r?.sponsorId ?? null
    }
    await triggerAutoMatchForPick({
      requesterId: updated.requesterId,
      requesterSponsorId,
      targetUserId: updated.targetUserId,
      targetSponsorId: updated.targetSponsorId,
    })
  }

  revalidateTag(`meetings-user-${updated.requesterId}`)
  if (updated.targetUserId) revalidateTag(`meetings-user-${updated.targetUserId}`)
  return NextResponse.json(updated)
}
