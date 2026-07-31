import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma, isRequiredSetComplete, isWbrStaff, DELEGATE_REQUIRED_SELECT } from '@conference/db'
import { authOptions } from '@/lib/auth'

/**
 * The onboarding gate for API route handlers that CHANGE data.
 *
 * Why this exists separately from lib/onboarding-gate.ts: that one redirects a
 * browser to the checklist, and it runs inside a route-group layout. Route
 * handlers are not rendered inside any layout, so the layout gate never runs
 * for them. Measured before this was added — an attendee with an empty required
 * field was redirected away from every page, yet the same session cookie could
 * still call POST /api/friend/<id> and get 200 with a pending friend request
 * created against another attendee. Blocked from every screen, still able to act
 * on other people.
 *
 * Returns a 403 response to return as-is, or null to continue:
 *
 *   const blocked = await requireCompleteProfile()
 *   if (blocked) return blocked
 *
 * Place it AFTER the handler's own session check, so a signed-out caller still
 * gets 401 rather than a confusing 403 about profile completeness.
 *
 * DELIBERATELY NOT APPLIED TO:
 *   - PATCH /api/profile — the checklist itself saves through it. Guarding that
 *     route would make the required set impossible to fill in, permanently
 *     trapping every incomplete attendee behind the gate.
 *   - POST /api/login — no session exists yet.
 *   - POST /api/revalidate — authenticated by a shared secret, not a user
 *     session; there is no profile to check.
 *
 * READING IS GUARDED TOO, as of Phase 4. It was not at first: the original cut
 * guarded only the handlers that change data, and recorded the reading side as
 * a follow-up. The requirements call of record then showed it was not a
 * follow-up at all — asked what a person should be stopped from doing before
 * completing their profile, the customer named making meeting requests AND
 * seeing all of the attendees at the event. The first was closed; the second
 * was open, and a delegate sitting on the checklist unable to reach a single
 * screen could still retrieve the whole attendee directory, the agenda, and the
 * messages inside a chat room by asking for those addresses directly.
 *
 * All fifteen reading handlers now call this. A sixteenth — a diagnostic
 * endpoint that reported to any signed-in caller whether an arbitrary email and
 * password combination was valid — was deleted rather than guarded.
 *
 * ADDING A NEW REQUEST HANDLER? Call this from it. Nothing at the framework
 * level will remind you, which is exactly how the reading side stayed open.
 */
export async function requireCompleteProfile(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id

  // No session is the caller's own concern — middleware.ts and each handler's
  // session check already cover it. Returning null keeps 401 the answer for
  // anonymous callers instead of masking it as a completeness problem.
  if (!userId) return null

  const account = await prisma.user.findUnique({
    where: { id: userId },
    // Read `role` from the database, not from the session. See the note in
    // lib/onboarding-gate.ts: a session token keeps whatever role it was issued
    // with, so a revoked role would keep its exemption until the next sign-in.
    select: { role: true, ...DELEGATE_REQUIRED_SELECT },
  })

  // FAIL CLOSED when there is no row for a session that claims one.
  //
  // The first version of this guard returned null here, reasoning that a missing
  // row is an auth concern rather than a completeness one. That was wrong, and
  // measured: several handlers (friend, setup/blackout, setup/meeting) upsert a
  // minimal user before acting. So a still-valid session cookie whose user row
  // had been deleted sailed past this guard, had an incomplete user recreated
  // for it, and successfully created a friend request against another attendee.
  //
  // That is not hypothetical in this project — the seed script deletes thousands
  // of users, so live sessions pointing at deleted rows are an ordinary
  // consequence of reseeding.
  //
  // If completeness cannot be established, refuse. A genuine signed-in attendee
  // always has a row; anyone who does not has nothing legitimate to do here.
  if (!account) {
    return NextResponse.json(
      { error: 'Complete your profile before using the app', onboardingRequired: true },
      { status: 403 },
    )
  }

  // Released by role, not by profile — see the long note in
  // lib/onboarding-gate.ts. The exemption is about who the person is, not which
  // app they are in, and it reuses isWbrStaff() rather than introducing a
  // second list of roles.
  //
  // Placed AFTER the missing-row refusal above and BEFORE the completeness
  // check below, deliberately. A session pointing at a deleted row has no role
  // to read, so it cannot be exempted — it is refused, which is the direction
  // that was already measured as correct.
  if (isWbrStaff(account.role)) return null

  if (!isRequiredSetComplete('delegate', account)) {
    return NextResponse.json(
      { error: 'Complete your profile before using the app', onboardingRequired: true },
      { status: 403 },
    )
  }

  return null
}
