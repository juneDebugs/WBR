import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { authOptions } from '@/lib/auth'
import { prisma, findFirstOpenSlot, assertBlockOpen, commitOrConflict, engineErrorHttpStatus, EngineError, getMeetingTables, getSponsorFixedTableLabel } from '@conference/db'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Approving, rejecting and confirming meetings (OE 19). The STAFF allowance
  // below stays as it is: the guard already releases every event-operating role
  // before it asks any completeness question, so a staff caller reaches the same
  // branch it reached before this phase.
  // THE ADDRESS THE ORIGINAL DEFECT WAS MEASURED ON. Reproduced during Phase 6:
  // a representative the database placed at company B set a meeting request
  // addressed to company A from PENDING to APPROVED, because the guard consulted
  // B and allowed it while the handler consulted A — off the session token — and
  // acted. Both now read the same database-backed value, so they cannot disagree.
  //
  // `role` comes from the guard too, and therefore from the database. Read off
  // the token it would keep a revoked staff role alive until the next sign-in,
  // which is the wrong direction to be wrong in — the same reasoning already
  // recorded at the guard's own role lookup.
  const { refused, companyId, role } = await requireCompleteProfile()
  if (refused) return refused

  const isStaff = role === 'STAFF'
  if (!companyId && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await req.json()
  if (!['APPROVED', 'REJECTED', 'CONFIRMED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const request = await prisma.meetingRequest.findUnique({ where: { id } })
  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Ensure the request belongs to this sponsor (unless staff).
  //
  // THIS IS THE LINE THE DEFECT WAS MEASURED ON. `companyId` is the database's
  // answer; `user.sponsorId` was the token's. A representative moved from
  // company A to company B passed this check for A's meeting requests until
  // they signed out and back in.
  if (!isStaff && request.targetSponsorId !== companyId) {
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
  // Falls back to the caller's own company only when the request names none.
  // Database-backed, so a staff caller with no company yields null here and the
  // booking below is skipped, exactly as it was when this read the token.
  const sponsorId = request.targetSponsorId ?? companyId
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
        if (storedStillOpen) { timeBlockId = request.timeBlockId; room = (await getMeetingTables(prisma))[0].name }
      }
      if (!timeBlockId) {
        const slot = await findFirstOpenSlot(prisma, sponsorId, attendeeId)
        if (slot) { timeBlockId = slot.timeBlockId; room = slot.room }
      }
    }
    // A sponsor with a fixed meeting table always meets there — its number wins
    // over the first-open-slot's default room so the booking shows the sponsor's
    // table everywhere it is displayed.
    if (timeBlockId) {
      const fixedTable = await getSponsorFixedTableLabel(prisma, sponsorId)
      if (fixedTable) room = fixedTable
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

  if (sponsorId) revalidateTag(`meetings-${sponsorId}`)

  return NextResponse.json(updated)
}
