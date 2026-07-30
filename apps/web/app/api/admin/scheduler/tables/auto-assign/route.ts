import { NextResponse } from 'next/server'
import { prisma, autoAssignTables, getTableBoard } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Fill tables for every confirmed meeting that needs one (optionally also
// moving over-capacity conflicts). Responds with the placement summary plus
// the fresh board.
export async function POST(req: Request) {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  let includeConflicts = false
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if (body.includeConflicts !== undefined && typeof body.includeConflicts !== 'boolean') {
        return NextResponse.json({ error: 'includeConflicts must be a boolean' }, { status: 400 })
      }
      includeConflicts = body.includeConflicts === true
    }
  } catch {
    // Empty body is fine — defaults apply.
  }

  try {
    const result = await autoAssignTables(prisma, { includeConflicts })
    return NextResponse.json({ ...result, board: await getTableBoard(prisma) })
  } catch (err) {
    return engineErrorResponse(err)
  }
}
