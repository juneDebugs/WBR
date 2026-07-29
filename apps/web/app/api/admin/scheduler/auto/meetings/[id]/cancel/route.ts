import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { prisma, cancelAutoMatchMeeting } from '@conference/db'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Cancel an auto-matched meeting AND dissolve the match.
//   POST { reason?: string } → { meeting, preserved, requestUpdated }
// Every live Best Fit pick between the pair is withdrawn with the meeting —
// otherwise the next sweep would re-schedule it — and a CANCELLED entry lands
// in the auto-match audit log. A fresh mutual pick re-creates the match.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  const body = await req.json().catch(() => ({}))
  const { reason } = body ?? {}
  if (reason !== undefined && reason !== null && typeof reason !== 'string') {
    return NextResponse.json({ error: 'reason must be a string' }, { status: 400 })
  }

  try {
    const result = await cancelAutoMatchMeeting(prisma, { sponsorMeetingId: id, reason: reason ?? null })
    revalidateTag('meetings')
    return NextResponse.json(result)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
