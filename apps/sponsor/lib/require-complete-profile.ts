import { NextResponse } from 'next/server'
import {
  prisma,
  isRequiredSetComplete,
  isWbrStaff,
  SPONSOR_REQUIRED_SELECT,
} from '@conference/db'
import { getSession } from '@/lib/session'

/**
 * The onboarding gate for THIS APP'S request handlers.
 *
 * Why this exists separately from lib/onboarding-gate.ts: that one redirects a
 * browser to the checklist and runs inside the `(portal)` route-group layout.
 * Request handlers are not rendered inside any layout, so that gate never runs
 * for them. Phase 5 shipped the screen gate alone and said so in writing: an
 * incomplete representative was stopped at all six portal screens while every
 * one of this app's 21 request handlers still served them. This closes that.
 *
 * The shape here is the attendee app's request guard, deliberately, down to the
 * file name and the function name: see apps/attendee/lib/require-complete-profile.ts.
 * Same order of questions, same fail direction, same reasons. The screen gate
 * follows the same rule for the same reason.
 *
 * Usage — place it AFTER the handler's own session check, so a signed-out caller
 * still gets 401 rather than a confusing 403 about profile completeness:
 *
 *   const blocked = await requireCompleteProfile()
 *   if (blocked) return blocked
 *
 * DELIBERATELY NOT APPLIED TO (three addresses, all verified by reading them):
 *   - PATCH /api/profile — the checklist itself saves through it. Guarding it
 *     would make the required items impossible to fill in, permanently trapping
 *     every incomplete representative behind the gate. Asserted in both
 *     directions by this phase's script, so a later change cannot quietly
 *     reintroduce the trap.
 *   - POST /api/login — this app's hand-written sign-in address. It mints the
 *     session cookie itself, so no session exists when it runs.
 *   - GET/POST /api/auth/[...nextauth] — the NextAuth sign-in address, same
 *     reason. It publishes its handlers as `export { handler as GET, handler as
 *     POST }`, so a search for `export async function` does not find it. An
 *     enumeration trusting that search alone reports a complete list while
 *     missing a live address.
 *
 * APPLIED TO POST /api/profile/teammates/register, which the plan left open.
 * Settled the way the plan required — by reading its caller, not by judgement.
 * Its only caller is components/RegisterTeammate.tsx, whose only render site is
 * app/(authenticated)/(portal)/submissions/page.tsx. That page is inside
 * `(portal)`, the route group Phase 5 gates, so an incomplete representative
 * cannot reach the screen that calls this address. Guarding it therefore takes
 * nothing away from anybody who could otherwise have used it, and leaving it
 * open would let a blocked representative create accounts for colleagues.
 *
 * THE COMPANY IS READ FROM THE DATABASE, NOT FROM THE SESSION TOKEN. This is
 * the same correction Phase 5 had to make to PATCH /api/profile, and the reason
 * is recorded at length there. A token is issued at sign-in and never changes,
 * while this app can move a person between companies mid-session:
 * POST /api/profile/teammates sets another user's sponsorId to the caller's,
 * and DELETE sets it to null. A guard reading the token would measure whichever
 * company the representative belonged to when they last signed in.
 *
 * Note that most handlers in this app still read `user.sponsorId` off the token
 * for their own work. That is pre-existing and is not changed here — see the
 * residual recorded in docs/smoketests/phase-6-sponsor-request-guard.md.
 *
 * ADDING A NEW REQUEST HANDLER? Call this from it. Nothing at the framework
 * level will remind you, which is exactly how the attendee app's reading side
 * stayed open for a whole phase (FP finding F-4).
 */
export async function requireCompleteProfile(): Promise<NextResponse | null> {
  const session = await getSession()
  const userId = (session?.user as { id?: string } | undefined)?.id

  // No session is the caller's own concern — middleware.ts and each handler's
  // own session check already cover it. Returning null keeps 401 the answer for
  // an anonymous caller instead of masking it as a completeness problem.
  if (!userId) return null

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      // `role` is read from the database rather than off the session, even
      // though middleware.ts forwards it as an x-user-role header and the
      // session carries it too. A session token is issued at sign-in and never
      // changes afterwards, so an account whose role was revoked would keep its
      // exemption until it signed in again — the wrong direction to be wrong
      // in. Same reasoning, same query, as lib/onboarding-gate.ts.
      role: true,
      sponsor: {
        select: {
          // Derived from the policy via SPONSOR_REQUIRED_SELECT, never listed
          // by hand. A column named by a required item but not fetched here
          // would read as absent and refuse a complete company.
          ...SPONSOR_REQUIRED_SELECT,
          // Fetched even though no REQUIRED item reads it today: "assign at
          // least one team member" is one of the three items the reminder email
          // chases and the gate does not block on. Fetching it means the subject
          // handed to the policy is the whole thing the policy documents, so
          // flipping that item to required later cannot silently refuse every
          // representative — an absent count reads as zero, and zero fails
          // closed. Same reasoning as the screen gate.
          _count: { select: { users: true } },
        },
      },
    },
  })

  // FAIL CLOSED when the session points at a row that is not there.
  //
  // middleware.ts checks only that a session token decodes, not that the account
  // behind it still exists, so a token issued before the row was deleted still
  // reaches this guard. Reseeding deletes thousands of user rows, so this is an
  // ordinary consequence of ordinary work rather than a hypothetical.
  //
  // FP finding F-6 measured the opposite choice as wrong in the attendee app: a
  // guard that allowed on a missing row let a session pointing at a deleted
  // person create records against real participants, because several handlers
  // create a minimal row before acting.
  if (!account) return refusal()

  // THE EXEMPTION IS ABOUT WHO THE PERSON IS, NOT WHICH APP THEY ARE IN.
  //
  // Organizers, admins and WBR staff operate the event rather than exhibit at
  // it, so they are released here exactly as they are by the screen gate and in
  // the attendee app. Recorded as a decision in
  // docs/adr/0008-onboarding-gate-is-about-the-person-not-the-app.md.
  //
  // Reuses isWbrStaff() from packages/db/src/app-access.ts, the module that
  // already decides which role may sign in to which app. There is deliberately
  // no second list of roles here to drift out of step with it.
  //
  // ORDER MATTERS, in two directions at once:
  //   - AFTER the missing-row refusal above. A session pointing at a deleted row
  //     has no role to read, so it cannot be exempted; it is refused, which is
  //     the direction already measured as correct.
  //   - BEFORE the no-company refusal below. The primary demonstration login
  //     wbr@test.com holds the organizer role and has no exhibiting company, and
  //     APP_ALLOWED_ROLES admits it to this portal. Checking for a company first
  //     would refuse it at every address in the app.
  if (isWbrStaff(account.role)) return null

  // No exhibiting company, and not an event-operating role: refuse.
  //
  // This is the fail-closed direction for a representative whose company link is
  // genuinely absent, and it is what OE 23 asks for — a missing company link is
  // never the fail-open direction. Note the schema shape: User.sponsor is
  // declared `onDelete: SetNull`, so a deleted company leaves sponsorId null
  // rather than dangling, and "company row deleted" and "no company ever linked"
  // arrive here as the same state. One branch covers both.
  //
  // PHASE 7 OWNS THE SCREEN SIDE of this case — the short explanation naming the
  // organizer, in place of a checklist that cannot save. The refusal here is the
  // data side and does not wait for it.
  if (!account.sponsor) return refusal()

  const { _count, ...company } = account.sponsor
  const subject = { ...company, attachedUserCount: _count.users }

  // Reads SPONSOR_REQUIRED_ITEMS through the shared policy rather than any
  // stored "onboarded" marker, so an item cleared later refuses again instead of
  // being waved through by a one-time flag. This file defines no completeness
  // rule of its own; a sponsor rule written here would be the sixth competing
  // answer to "is this profile complete", which is the problem the shared policy
  // exists to remove.
  if (!isRequiredSetComplete('sponsor', subject)) return refusal()

  return null
}

/**
 * The one refusal, for reading and changing requests alike.
 *
 * Status and keys match the attendee app's request guard exactly, so a client, a
 * script or a future maintainer has one refusal to recognise across both apps —
 * `onboardingRequired: true` is the machine-readable marker either app's caller
 * tests. A 200 carrying emptied contents was rejected by decision: it would make
 * a refusal indistinguishable from an empty event and invisible to any assertion
 * on status.
 *
 * The human sentence differs from the attendee app's by one word, deliberately:
 * what a representative must complete is their exhibiting COMPANY'S profile, not
 * their own personal one, and the checklist they are sent to says so. The shape
 * a caller depends on is identical; only the copy is specific.
 */
function refusal(): NextResponse {
  return NextResponse.json(
    { error: 'Complete your company profile before using the portal', onboardingRequired: true },
    { status: 403 },
  )
}
