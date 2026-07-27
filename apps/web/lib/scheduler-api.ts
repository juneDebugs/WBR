import 'server-only'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { roleHasPermission } from '@/lib/api-permission'
import { EngineError, engineErrorHttpStatus } from '@conference/db'

// Session + permission gate for the admin Companies scheduler API. Every route
// under /api/admin/scheduler requires a signed-in session whose role holds the
// 'meetings' permission — the same key that gates the Meetings dashboard page.
// Returns the caller's role on success, or a NextResponse to short-circuit.
export async function requireSchedulerAccess(): Promise<{ role: string } | { error: NextResponse }> {
  const session = await getServerSession(authOptions)
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = (session.user as any).role
  if (!(await roleHasPermission(role, 'meetings'))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { role }
}

// Map typed EngineError codes to HTTP responses. The code→status
// classification lives with the engine itself so this app and the staff
// console in apps/meetings can never drift apart.
export function engineErrorResponse(err: unknown): NextResponse {
  if (err instanceof EngineError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: engineErrorHttpStatus(err.code) })
  }
  console.error('[scheduler-api] unexpected error', err)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
