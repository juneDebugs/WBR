import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, rescheduleMeeting } from '@conference/db'
import { requireStaff, engineErrorResponse } from '@/lib/staff-api'
import { invalidate } from '@/lib/mem-cache'

// PATCH — reschedule a confirmed meeting to a new time block / room.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body?.timeBlockId || !body?.room) {
    return NextResponse.json({ error: 'timeBlockId and room are required' }, { status: 400 })
  }
  try {
    const meeting = await rescheduleMeeting(prisma, {
      sponsorMeetingId: id,
      timeBlockId: body.timeBlockId,
      room: body.room,
    })
    invalidate(meeting.userId)
    revalidateTag('meetings')
    return NextResponse.json({ ok: true, meeting })
  } catch (err) {
    return engineErrorResponse(err)
  }
}
