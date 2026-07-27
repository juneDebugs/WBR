import { NextResponse } from 'next/server'
import { prisma, getSponsorScheduleMatrix } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Per-company schedule matrix for the admin Companies scheduler.
//   GET → ScheduleMatrix (bank, pending, scheduled, misc, day/slot grid)
// 404 when the sponsor does not exist (via engineErrorResponse).
export async function GET(_req: Request, { params }: { params: Promise<{ sponsorId: string }> }) {
  const { sponsorId } = await params
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    const matrix = await getSponsorScheduleMatrix(prisma, sponsorId)
    return NextResponse.json(matrix)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
