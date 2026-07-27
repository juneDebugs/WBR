import { NextResponse } from 'next/server'
import { prisma, getMeetingRescheduleAvailability } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Slot/room availability for RESCHEDULING an existing meeting: excludes the
// meeting being moved so its current slot reads as free, and returns it.
//   GET → RescheduleAvailability
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    const availability = await getMeetingRescheduleAvailability(prisma, id)
    return NextResponse.json(availability)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
