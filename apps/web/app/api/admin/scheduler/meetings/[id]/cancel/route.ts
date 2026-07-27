import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, cancelMeeting } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Cancel a confirmed meeting.
//   POST { preserveRequest?: boolean, reason?: string, notes?: string }
//     → { meeting, preserved, requestUpdated }
// preserveRequest defaults to true: the linked request returns to the bank
// (APPROVED); false removes it entirely (CANCELLED → shows under Declined).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  const body = await req.json().catch(() => ({}))
  const { preserveRequest, reason, notes } = body ?? {}
  if (preserveRequest !== undefined && typeof preserveRequest !== 'boolean') {
    return NextResponse.json({ error: 'preserveRequest must be a boolean' }, { status: 400 })
  }
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    return NextResponse.json({ error: 'reason must be a string' }, { status: 400 })
  }
  if (notes !== undefined && notes !== null && typeof notes !== 'string') {
    return NextResponse.json({ error: 'notes must be a string' }, { status: 400 })
  }

  try {
    const result = await cancelMeeting(prisma, {
      sponsorMeetingId: id,
      preserveRequest: preserveRequest ?? true,
      reason: reason ?? null,
      notes: notes ?? null,
    })
    revalidateTag('meetings')
    return NextResponse.json(result)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
