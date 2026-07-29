import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, rescheduleAutoMatchMeeting } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Reschedule an auto-matched meeting to a different slot and/or room.
//   PATCH { timeBlockId, room } → SponsorMeeting
// Same contract as /api/admin/scheduler/meetings/[id], plus a RESCHEDULED
// entry in the auto-match audit log. Slot options come from the shared
// /api/admin/scheduler/meetings/[id]/availability endpoint.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  const body = await req.json().catch(() => ({}))
  const { timeBlockId, room } = body ?? {}
  if (typeof timeBlockId !== 'string' || typeof room !== 'string') {
    return NextResponse.json({ error: 'timeBlockId and room are required' }, { status: 400 })
  }

  try {
    const meeting = await rescheduleAutoMatchMeeting(prisma, { sponsorMeetingId: id, timeBlockId, room })
    revalidateTag('meetings')
    return NextResponse.json(meeting)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
