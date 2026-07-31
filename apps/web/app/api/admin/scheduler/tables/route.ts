import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, getTableBoard, saveMeetingTables, type MeetingTableOp } from '@conference/db'
import { getCachedTableBoard } from '@/lib/scheduler-cache'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Meeting-table inventory + conference-wide assignment board for the admin
// Meetings → Settings → Meeting Tables section.
//   GET → TableBoard { tables, days, totals }
//   PUT → apply one inventory op { op: 'add'|'update'|'remove', ... },
//         respond with the fresh board (same shape as GET)
export async function GET() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    return NextResponse.json(await getCachedTableBoard())
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

  const { op, name, newName, capacity } = body as {
    op?: unknown; name?: unknown; newName?: unknown; capacity?: unknown
  }
  if (op !== 'add' && op !== 'update' && op !== 'remove') {
    return NextResponse.json({ error: "op must be 'add', 'update', or 'remove'" }, { status: 400 })
  }
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
  }
  if (newName !== undefined && typeof newName !== 'string') {
    return NextResponse.json({ error: 'newName must be a string' }, { status: 400 })
  }
  if (capacity !== undefined && typeof capacity !== 'number') {
    return NextResponse.json({ error: 'capacity must be a number' }, { status: 400 })
  }

  const tableOp: MeetingTableOp =
    op === 'add'
      ? { op, name, ...(capacity !== undefined ? { capacity } : {}) }
      : op === 'update'
        ? {
            op, name,
            ...(newName !== undefined ? { newName } : {}),
            ...(capacity !== undefined ? { capacity } : {}),
          }
        : { op, name }

  try {
    await saveMeetingTables(prisma, tableOp)
    // Renames migrate SponsorMeeting.location and the inventory drives every
    // rooms consumer, so bust the shared cache (table board, per-company
    // matrices, /api/data/meetings) — then return the fresh board directly.
    revalidateTag('meetings')
    return NextResponse.json(await getTableBoard(prisma))
  } catch (err) {
    return engineErrorResponse(err)
  }
}
