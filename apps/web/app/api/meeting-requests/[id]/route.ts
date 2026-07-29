import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, resolveParties, syncAutoMatches, totalRoomCapacity } from '@conference/db'
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

  // Confirming into a slot must respect the same invariants the engine-guarded
  // Companies scheduler enforces — one confirmed meeting per pair, an attendee
  // free at the block, and booth capacity — so this legacy path cannot create
  // bookings the engine (and its availability math) considers impossible.
  if (status === 'CONFIRMED' && timeBlockId) {
    const current = await prisma.meetingRequest.findUnique({
      where: { id },
      select: {
        requesterId: true, targetUserId: true, targetSponsorId: true,
        requester: { select: { sponsorId: true } },
      },
    })
    if (!current) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    const parties = resolveParties(current)
    if (parties) {
      const [pairExisting, boothCount, candidateBusy] = await Promise.all([
        prisma.sponsorMeeting.findFirst({
          where: { sponsorId: parties.sponsorId, userId: parties.userId, status: 'CONFIRMED' },
          select: { id: true },
        }),
        prisma.sponsorMeeting.count({
          where: { sponsorId: parties.sponsorId, timeBlockId, status: 'CONFIRMED' },
        }),
        prisma.sponsorMeeting.findFirst({
          where: { userId: parties.userId, timeBlockId, status: 'CONFIRMED' },
          select: { id: true },
        }),
      ])
      if (pairExisting) {
        return NextResponse.json({ error: 'This attendee already has a confirmed meeting with this company', code: 'ALREADY_SCHEDULED' }, { status: 409 })
      }
      if (candidateBusy) {
        return NextResponse.json({ error: 'The attendee already has a meeting in this time slot', code: 'CANDIDATE_BUSY' }, { status: 409 })
      }
      if (boothCount >= totalRoomCapacity) {
        return NextResponse.json({ error: 'All tables for this company are booked in this time slot', code: 'SPONSOR_FULL' }, { status: 409 })
      }
    }
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
