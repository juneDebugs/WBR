import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, resolveParties, syncAutoMatches, assertBlockOpen, EngineError, engineErrorHttpStatus } from '@conference/db'
import { requireSchedulerAccess } from '@/lib/scheduler-api'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Gated by the 'meetings' permission so the Roles & Permissions editor
  // governs this route the same way it governs /api/admin/scheduler/*.
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

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

  // Confirming into a slot runs the SAME engine guard as every other write
  // path — one confirmed meeting per pair, attendee free at the block
  // (meetings, peer meetings, blackouts), and an OPEN slot (exclusive: one
  // meeting per sponsor per block) — so this legacy path cannot create
  // bookings the engine (and its availability math) considers impossible.
  // The resolved pair is both guarded and booked, so the checked party is
  // always the booked party.
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
        ...(timeBlockId !== undefined ? { timeBlockId: timeBlockId || null } : {}),
      },
      include: {
        requester: { select: { id: true, name: true, email: true, company: true, role: true, sponsorId: true } },
        targetUser: { select: { id: true, name: true, email: true, company: true, role: true } },
        targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
        timeBlock: true,
      },
    }),
  ]
  if (status === 'CONFIRMED' && timeBlockId && parties) {
    ops.push(prisma.sponsorMeeting.create({
      data: { sponsorId: parties.sponsorId, userId: parties.userId, repId: parties.repId, timeBlockId, status: 'CONFIRMED' },
    }))
  }
  const [updated] = await prisma.$transaction(ops)

  // Re-tiering a request to Best Fit hands it to the Auto lane: run the
  // auto-match sweep immediately so a pair this pick completes is scheduled
  // right now, not on the next Auto board view.
  if (priority === 'BEST_FIT') await syncAutoMatches(prisma).catch(() => {})
  revalidateTag('meetings')

  return NextResponse.json(updated)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: requestId } = await params
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

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
  revalidateTag('meetings')
  return NextResponse.json({ ok: true })
}
