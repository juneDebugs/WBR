import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { EngineError, engineErrorHttpStatus, isWbrStaff } from '@conference/db'

// WBR-staff gate for the meeting-engine console API. The operator role is the
// WBR tier (WBR/ORGANIZER/ADMIN/STAFF) — the wbr@test.com account is ORGANIZER.
// Returns the user on success, or a NextResponse to short-circuit the handler.
export async function requireStaff(): Promise<{ user: { id: string; role: string; sponsorId: string | null } } | { error: NextResponse }> {
  const user = await getUserFromHeaders()
  if (!user.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isWbrStaff(user.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

// Map typed EngineError codes to HTTP responses. The code→status
// classification is exported by the engine so this console and the admin
// scheduler API in apps/web stay in lockstep as codes are added.
export function engineErrorResponse(err: unknown): NextResponse {
  if (err instanceof EngineError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: engineErrorHttpStatus(err.code) })
  }
  console.error('[staff-api] unexpected error', err)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
