import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@conference/db'
import { authOptions } from '@/lib/auth'
import { isComplete, REQUIRED_FIELD_SELECT } from '@/lib/profile-completeness'

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
 * Read-only endpoints are also not guarded. An incomplete attendee can still
 * read conference content (attendee list, schedule) via GET. That is a narrower
 * concern than acting as a half-registered attendee, and gating every read is a
 * much wider change; it is recorded as a follow-up rather than silently skipped.
 * See the Phase 1 smoketest doc.
 */
export async function requireCompleteProfile(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id

  // No session is the caller's own concern — middleware.ts and each handler's
  // session check already cover it. Returning null keeps 401 the answer for
  // anonymous callers instead of masking it as a completeness problem.
  if (!userId) return null

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: REQUIRED_FIELD_SELECT,
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
  if (!profile) {
    return NextResponse.json(
      { error: 'Complete your profile before using the app', onboardingRequired: true },
      { status: 403 },
    )
  }

  if (!isComplete(profile)) {
    return NextResponse.json(
      { error: 'Complete your profile before using the app', onboardingRequired: true },
      { status: 403 },
    )
  }

  return null
}
