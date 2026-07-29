import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, getAutoMatchBoard, syncAutoMatches } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Mutual Best Fit auto-matches (admin Meetings → Auto tab).
//   GET → AutoMatchBoard (pairs where the sponsor and the attendee each picked
//   the other as Best Fit, with fit score, scheduled state, and the audit log).
//
// The GET first runs the self-healing sweep: any mutual pick that formed since
// the last view is scheduled and logged before the board is read (the same
// read-path dispatch pattern as scheduled broadcasts). Picks normally schedule
// at pick time in the portals; this catches seeds, direct DB writes, and pairs
// that were unschedulable earlier but have a free slot now. A sweep failure
// must not blank the board — the log just catches up on the next request.
export async function GET() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    const sweep = await syncAutoMatches(prisma).catch(() => null)
    if (sweep && sweep.scheduled.length > 0) revalidateTag('meetings')
    const board = await getAutoMatchBoard(prisma)
    return NextResponse.json(board)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
