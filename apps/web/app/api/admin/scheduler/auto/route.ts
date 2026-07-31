import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, syncAutoMatchesOnRead } from '@conference/db'
import { getCachedAutoMatchBoard } from '@/lib/scheduler-cache'
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
    // Self-heal sweep first (throttled per-process so the 30s poll doesn't
    // re-scan every time). If it actually scheduled a meeting, bust the cached
    // board so the next read reflects it; otherwise the cached board is served.
    const sweep = await syncAutoMatchesOnRead(prisma).catch(() => null)
    if (sweep && sweep.scheduled.length > 0) revalidateTag('meetings')
    const board = await getCachedAutoMatchBoard()
    return NextResponse.json(board)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
