import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, autoPopulateSponsorTables } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Give every still-unassigned sponsor the lowest free table number (existing
// assignments preserved). Responds with the count assigned plus the fresh board.
export async function POST() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    const result = await autoPopulateSponsorTables(prisma)
    if (result.assigned > 0) revalidateTag('meetings')
    return NextResponse.json(result)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
