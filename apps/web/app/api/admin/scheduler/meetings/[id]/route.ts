import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, rescheduleMeeting } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Move a confirmed meeting to a different slot and/or room.
//   PATCH { timeBlockId, room } → SponsorMeeting
// The linked MeetingRequest's timeBlockId is kept in sync by the engine.
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
    const meeting = await rescheduleMeeting(prisma, { sponsorMeetingId: id, timeBlockId, room })
    revalidateTag('meetings')
    return NextResponse.json(meeting)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
