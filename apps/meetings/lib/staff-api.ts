import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { EngineError, isWbrStaff, type EngineErrorCode } from '@conference/db'

// WBR-staff gate for the meeting-engine console API. The operator role is the
// WBR tier (WBR/ORGANIZER/ADMIN/STAFF) — the wbr@test.com account is ORGANIZER.
// Returns the user on success, or a NextResponse to short-circuit the handler.
export async function requireStaff(): Promise<{ user: { id: string; role: string; sponsorId: string | null } } | { error: NextResponse }> {
  const user = await getUserFromHeaders()
  if (!user.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isWbrStaff(user.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

// Map typed EngineError codes to HTTP responses.
const CONFLICT_CODES: EngineErrorCode[] = ['CANDIDATE_BUSY', 'ROOM_CONFLICT', 'SPONSOR_FULL', 'ALREADY_SCHEDULED']
const NOT_FOUND_CODES: EngineErrorCode[] = ['REQUEST_NOT_FOUND', 'MEETING_NOT_FOUND']

export function engineErrorResponse(err: unknown): NextResponse {
  if (err instanceof EngineError) {
    const status = NOT_FOUND_CODES.includes(err.code) ? 404
      : CONFLICT_CODES.includes(err.code) ? 409
      : 400
    return NextResponse.json({ error: err.message, code: err.code }, { status })
  }
  console.error('[staff-api] unexpected error', err)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
