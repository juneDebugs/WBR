import { NextResponse } from 'next/server'
import { getCachedMeetingsLog } from '@/lib/scheduler-cache'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Consolidated internal-notes feed for the admin Meetings → Log tab.
//   GET → MeetingLog ({ entries newest-first, counts per kind }) aggregating
//   every meeting note, floor note, cancellation reason and request message.
export async function GET() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    const log = await getCachedMeetingsLog()
    return NextResponse.json(log)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
