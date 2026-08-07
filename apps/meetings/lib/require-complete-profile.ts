import { NextResponse } from 'next/server'
import { prisma, isRequiredSetComplete, isWbrStaff, DELEGATE_REQUIRED_SELECT } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'

/**
 * The onboarding gate for this portal's route handlers.
 *
 * Why this exists separately from lib/onboarding-gate.ts: that one redirects a
 * browser to the checklist and runs inside a route-group layout. Route handlers
 * are not rendered inside any layout, so the layout gate never runs for them.
 * Measured in the participant app before its equivalent was written — a person
 * with an empty required field was redirected away from every page, yet the same
 * session cookie could still call the addresses behind those pages and act on
 * other people. Blocked from every screen, still able to read the directory and
 * make requests.
 *
 * Returns a 403 response to return as-is, or null to continue:
 *
 *   const blocked = await requireCompleteProfile()
 *   if (blocked) return blocked
 *
 * Place it AFTER the handler's own session check, so a signed-out caller still
 * gets 401 rather than a confusing 403 about profile completeness.
 *
 * READING IS GUARDED AS WELL AS WRITING. The requirements call of record for the
 * onboarding work asked what a person should be stopped from doing before
 * completing their profile, and the answer named both making meeting requests
 * and seeing the people at the event. In this portal that means the browse
 * addresses and the dashboard, not only the request handlers.
 *
 * DELIBERATELY NOT APPLIED TO:
 *   - PATCH /api/profile — the checklist itself saves through it. Guarding the
 *     address the checklist writes through traps every incomplete person
 *     permanently.
 *   - POST /api/login and /api/auth/* — no session exists yet.
 *   - /api/staff/* — every one of those already refuses anyone who is not
 *     WBR-side, through requireStaff() in lib/staff-api.ts, and WBR-side people
 *     are exempt from this check. Adding it there would be a second refusal that
 *     can never fire.
 *
 * ADDING A NEW REQUEST HANDLER? Call this from it. Nothing at the framework
 * level will remind you, which is exactly how the participant app's reading side
 * stayed open through a whole phase.
 */
export async function requireCompleteProfile(): Promise<NextResponse | null> {
  const user = await getUserFromHeaders()

  // No session is the caller's own concern — middleware.ts and each handler's
  // own check already cover it. Returning null keeps 401 the answer for
  // anonymous callers instead of masking it as a completeness problem.
  if (!user.id) return null

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    // Read `role` from the database, not from the forwarded header. See the note
    // in lib/onboarding-gate.ts: the header is filled from a session token that
    // keeps whatever role it was issued with, so a revoked role would keep its
    // exemption until the next sign-in.
    select: { role: true, ...DELEGATE_REQUIRED_SELECT },
  })

  // FAIL CLOSED when there is no row for a session that claims one.
  //
  // Carried over from the participant app, where returning null here was
  // measured to be wrong: several handlers create a minimal user before acting,
  // so a still-valid cookie whose row had been deleted sailed past the guard,
  // had an incomplete person recreated for it, and successfully acted against
  // real attendees. If completeness cannot be established, refuse.
  if (!account) {
    return NextResponse.json(
      { error: 'Complete your profile before using the portal', onboardingRequired: true },
      { status: 403 },
    )
  }

  // Released by role, not by profile — the same isWbrStaff() test the screen
  // gate uses, and the same one that decides app access. No second role list.
  if (isWbrStaff(account.role)) return null

  if (!isRequiredSetComplete('delegate', account)) {
    return NextResponse.json(
      { error: 'Complete your profile before using the portal', onboardingRequired: true },
      { status: 403 },
    )
  }

  return null
}
