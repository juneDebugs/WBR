import { NextResponse } from 'next/server'
import { prisma, getMeetingRescheduleAvailability } from '@conference/db'
import { requireStaff, engineErrorResponse } from '@/lib/staff-api'

export const dynamic = 'force-dynamic'

// Availability for rescheduling an existing meeting (excludes the meeting itself).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { id } = await params
  try {
    const availability = await getMeetingRescheduleAvailability(prisma, id)
    return NextResponse.json(availability)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
