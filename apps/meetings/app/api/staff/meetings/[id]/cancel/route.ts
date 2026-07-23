import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, cancelMeeting } from '@conference/db'
import { requireStaff, engineErrorResponse } from '@/lib/staff-api'
import { invalidate } from '@/lib/mem-cache'

// POST — cancel a meeting. preserveRequest=true returns the request to the bank;
// false removes it entirely. Optional reason + notes recorded on the meeting.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff()
  if ('error' in gate) return gate.error
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  try {
    const result = await cancelMeeting(prisma, {
      sponsorMeetingId: id,
      preserveRequest: body?.preserveRequest !== false, // default: preserve (safer)
      reason: body?.reason ?? null,
      notes: body?.notes ?? null,
    })
    invalidate(result.meeting.userId)
    revalidateTag('meetings')
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return engineErrorResponse(err)
  }
}
