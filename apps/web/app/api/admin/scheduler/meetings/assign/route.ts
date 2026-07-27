import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, assignMeeting } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Assign an approved/pending request to a slot + room, creating the meeting.
//   POST { requestId, timeBlockId, room } → SponsorMeeting
// Conflicts (CANDIDATE_BUSY, ROOM_CONFLICT, SPONSOR_FULL, ALREADY_SCHEDULED) → 409.
export async function POST(req: Request) {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  const body = await req.json().catch(() => ({}))
  const { requestId, timeBlockId, room } = body ?? {}
  if (typeof requestId !== 'string' || typeof timeBlockId !== 'string' || typeof room !== 'string') {
    return NextResponse.json({ error: 'requestId, timeBlockId and room are required' }, { status: 400 })
  }

  try {
    const meeting = await assignMeeting(prisma, { requestId, timeBlockId, room })
    revalidateTag('meetings')
    return NextResponse.json(meeting)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
