import { NextResponse } from 'next/server'
import { getCachedCompanyDirectory } from '@/lib/scheduler-cache'
import { requireSchedulerAccess, engineErrorResponse } from '@/lib/scheduler-api'

// Company directory for the admin Companies scheduler tab.
//   GET → DirectoryRow[] (one row per sponsor: request/meeting counts + fill rate)
export async function GET() {
  const gate = await requireSchedulerAccess()
  if ('error' in gate) return gate.error

  try {
    const rows = await getCachedCompanyDirectory()
    return NextResponse.json(rows)
  } catch (err) {
    return engineErrorResponse(err)
  }
}
