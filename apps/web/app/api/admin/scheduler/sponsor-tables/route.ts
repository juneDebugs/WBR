import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, getSponsorTables, assignSponsorTable } from '@conference/db'
import { getCachedSponsorTables } from '@/lib/scheduler-cache'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Per-sponsor meeting-table board for the admin Meetings → Settings → Meeting
// Tables section. Each sponsor owns one uniquely-numbered physical table.
//   GET → SponsorTableBoard { entries: {sponsor, logo, tier, tableNumber, meetingCount}[], totals }
//   PUT → assign/clear one sponsor's number { sponsorId, tableNumber: number|null },
//         respond with the fresh board (same shape as GET)
export async function GET() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    return NextResponse.json(await getCachedSponsorTables())
  } catch (err) {
    return engineErrorResponse(err)
  }
}

export async function PUT(req: Request) {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 })
  }

  const { sponsorId, tableNumber } = body as { sponsorId?: unknown; tableNumber?: unknown }
  if (typeof sponsorId !== 'string' || !sponsorId.trim()) {
    return NextResponse.json({ error: 'sponsorId must be a non-empty string' }, { status: 400 })
  }
  // null clears the assignment; a number sets it; anything else is rejected here
  // so the engine only ever sees a clean number|null.
  if (tableNumber !== null && typeof tableNumber !== 'number') {
    return NextResponse.json({ error: 'tableNumber must be a number or null' }, { status: 400 })
  }

  try {
    // Assigning a number re-points that sponsor's meetings' location, so bust the
    // shared cache (board, per-company matrices, /api/data/meetings) — then
    // return the fresh board directly.
    const board = await assignSponsorTable(prisma, { sponsorId, tableNumber })
    revalidateTag('meetings')
    return NextResponse.json(board)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
