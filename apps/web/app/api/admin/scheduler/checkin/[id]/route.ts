import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, setMeetingCheckIn } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Check-off / note update for one confirmed SponsorMeeting.
//   PATCH { sponsorArrived?: boolean, buyerArrived?: boolean, notes?: string | null }
//   Fields left undefined are untouched (a checkbox tick never clobbers a note edit).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  const { id } = await params
  let body: { sponsorArrived?: unknown; buyerArrived?: unknown; notes?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const update: { sponsorMeetingId: string; sponsorArrived?: boolean; buyerArrived?: boolean; notes?: string | null } = {
    sponsorMeetingId: id,
  }
  if (body.sponsorArrived !== undefined) {
    if (typeof body.sponsorArrived !== 'boolean') return NextResponse.json({ error: 'sponsorArrived must be a boolean' }, { status: 400 })
    update.sponsorArrived = body.sponsorArrived
  }
  if (body.buyerArrived !== undefined) {
    if (typeof body.buyerArrived !== 'boolean') return NextResponse.json({ error: 'buyerArrived must be a boolean' }, { status: 400 })
    update.buyerArrived = body.buyerArrived
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && typeof body.notes !== 'string') return NextResponse.json({ error: 'notes must be a string or null' }, { status: 400 })
    update.notes = body.notes as string | null
  }
  if (update.sponsorArrived === undefined && update.buyerArrived === undefined && update.notes === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  try {
    const result = await setMeetingCheckIn(prisma, update)
    // A tick only changes arrival flags + the note, so bust only the boards that
    // read them — the check-in board and the log — not the whole `meetings` tag.
    // This keeps the expensive directory/matrix/tables/auto caches warm through
    // the busiest ticking period; assign/cancel/reschedule still bust `meetings`.
    revalidateTag('checkin')
    revalidateTag('meetings-log')
    return NextResponse.json(result)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
