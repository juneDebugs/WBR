import { NextResponse } from 'next/server'
import { prisma, setMeetingTable, getTableBoard } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Assign (or clear, with table: null) one confirmed meeting's table from the
// Meeting Tables board. Responds with the fresh board so the client can swap
// its cache in one round trip.
export async function PUT(req: Request) {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { sponsorMeetingId, table } = (body ?? {}) as { sponsorMeetingId?: unknown; table?: unknown }
  if (typeof sponsorMeetingId !== 'string' || !sponsorMeetingId) {
    return NextResponse.json({ error: 'sponsorMeetingId must be a non-empty string' }, { status: 400 })
  }
  if (table !== null && typeof table !== 'string') {
    return NextResponse.json({ error: 'table must be a string or null' }, { status: 400 })
  }

  try {
    await setMeetingTable(prisma, { sponsorMeetingId, table })
    return NextResponse.json(await getTableBoard(prisma))
  } catch (err) {
    return engineErrorResponse(err)
  }
}
