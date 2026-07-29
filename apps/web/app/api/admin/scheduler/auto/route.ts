import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, getAutoMatchBoard, scheduleAutoMatches } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Mutual Best Fit auto-matches (admin Meetings → Auto tab).
//   GET  → AutoMatchBoard (pairs where the sponsor and the attendee each picked
//          the other as Best Fit, with fit score and scheduled state)
//   POST { dryRun?: boolean } → schedule every ready match; dryRun previews
//          the plan without writing.
export async function GET() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    const board = await getAutoMatchBoard(prisma)
    return NextResponse.json(board)
  } catch (err) {
    return engineErrorResponse(err)
  }
}

export async function POST(req: Request) {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  let body: { dryRun?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (body.dryRun !== undefined && typeof body.dryRun !== 'boolean') {
    return NextResponse.json({ error: 'dryRun must be a boolean' }, { status: 400 })
  }

  try {
    const result = await scheduleAutoMatches(prisma, { dryRun: body.dryRun })
    if (!result.dryRun && result.scheduled.length > 0) revalidateTag('meetings')
    return NextResponse.json(result)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
