import { NextResponse } from 'next/server'
import { prisma, getCheckInBoard } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// On-site floor check-in board.
//   GET → CheckInBoard (days → chronological slots → meetings alphabetical by
//   sponsor, with arrival flags, notes and completion tallies)
export async function GET() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    const board = await getCheckInBoard(prisma)
    return NextResponse.json(board)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
