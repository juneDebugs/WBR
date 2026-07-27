import { NextResponse } from 'next/server'
import { prisma, getCandidateAvailability } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Slot/room availability for assigning an unscheduled request.
//   GET ?requestId=X → CandidateAvailability (per-day slots with room occupancy)
export async function GET(req: Request) {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  const requestId = new URL(req.url).searchParams.get('requestId')
  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 })
  }

  try {
    const availability = await getCandidateAvailability(prisma, requestId)
    return NextResponse.json(availability)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
