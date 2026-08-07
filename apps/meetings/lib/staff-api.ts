import { NextResponse } from 'next/server'
import { getUserFromHeaders } from '@/lib/user'
import { prisma, EngineError, engineErrorHttpStatus, isWbrStaff } from '@conference/db'

/**
 * WBR-staff gate for the meeting-engine console API. The operator role is the
 * WBR tier (WBR/ORGANIZER/ADMIN/STAFF) — the wbr@test.com account is ORGANIZER.
 * Returns the user on success, or a NextResponse to short-circuit the handler.
 *
 * ── The role is read from the database, not from the session token ───────────
 *
 * It used to come from the middleware-forwarded header, which is filled from the
 * token. A token is issued at sign-in and does not change afterwards, so an
 * account whose role was revoked kept its operator powers until it signed in
 * again — up to the session's lifetime. Every one of these addresses reads or
 * writes the whole event's schedule, so that is the wrong direction to be wrong
 * in.
 *
 * Found by adversarial review of the onboarding-gate change, which made the
 * disagreement visible: the gate beside this file already reads role from the
 * database, so a demoted account was blocked from every participant screen and
 * address while still assigning meetings through these. Recorded as UF-31.
 *
 * FAIL CLOSED when the row is gone, for the same reason the gate does: a token
 * whose account was deleted still decodes, and reseeding deletes user rows as a
 * matter of course.
 *
 * The cost is one indexed lookup per staff request, on the console's own
 * addresses rather than on a participant's page load.
 */
export async function requireStaff(): Promise<{ user: { id: string; role: string; sponsorId: string | null } } | { error: NextResponse }> {
  const user = await getUserFromHeaders()
  if (!user.id) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  })
  if (!account) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isWbrStaff(account.role)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  return { user: { ...user, role: account.role } }
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
