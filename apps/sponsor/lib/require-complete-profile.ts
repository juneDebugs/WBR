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
 * Phase 6 left a residual here and Phase 6.5 closed it: at that point most
 * handlers still read `user.sponsorId` off the token for their own work, so the
 * guard and the handler it guarded could consult two different companies and
 * disagree. They now all read the value this function returns. See below.
 *
 * ADDING A NEW REQUEST HANDLER? Call this from it. Nothing at the framework
 * level will remind you, which is exactly how the attendee app's reading side
 * stayed open for a whole phase (FP finding F-4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT ALSO RETURNS WHO THE CALLER IS ACTING FOR. Phase 6.5, 2026-08-01.
 *
 * This function already read the caller's account from the database on every
 * request and then threw away the company it had read, while twelve handlers
 * went on reading that same company off the session token — a value written once
 * at sign-in and never updated, in an app that can move a person between
 * companies mid-session. Returning what was already fetched gives every handler
 * a database-backed company at NO ADDITIONAL DATABASE READ. `sponsorId` is added
 * to the existing select; no second query is issued anywhere.
 *
 * This is also why `apps/sponsor/lib/caller-company.ts` no longer exists. That
 * helper answered the same question for four addresses and was deleted here:
 * two answers to one question is the exact problem the shared completeness
 * policy exists to prevent.
 *
 * WHY THE SHAPE CHANGED from `NextResponse | null` to an object. A caller has to
 * be able to tell "refused" from "allowed, and here is the company", and an
 * object carrying a company is truthy — so the old `if (blocked) return blocked`
 * would have silently refused every request while looking correct. Forcing every
 * one of the nineteen call sites to be rewritten is deliberate: a type error at
 * each one is what guarantees none was missed.
 *
 *   const caller = await requireCompleteProfile()
 *   if (caller.refused) return caller.refused
 *   // caller.companyId — from the database, may be null for a WBR-side account
 *   // caller.role      — from the database, for handlers that admit staff
 */

/** What the guard hands back. Exactly one of the two shapes. */
export type Caller =
  | { refused: NextResponse; companyId?: undefined; role?: undefined }
  | { refused: null; companyId: string | null; role: string | null }

export async function requireCompleteProfile(): Promise<Caller> {
  const session = await getSession()
  const userId = (session?.user as { id?: string } | undefined)?.id

  // No session is the caller's own concern — middleware.ts and each handler's
  // own session check already cover it. Not refusing here keeps 401 the answer
  // for an anonymous caller instead of masking it as a completeness problem.
  //
  // Every one of the nineteen handlers checks its session BEFORE calling this,
  // so no handler reaches the branch below with a null company from here. It is
  // defensive, and it stays defensive: a future handler that forgets its own
  // session check gets a null company rather than somebody else's.
  if (!userId) return { refused: null, companyId: null, role: null }

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      // THE VALUE THE HANDLERS AUTHORIZE AGAINST. Added by Phase 6.5. It costs
      // nothing — this query already runs on every guarded request, and reading
      // one more column of a row already being fetched issues no second read.
      sponsorId: true,
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
  if (!account) return { refused: refusal() }

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
  //
  // THEY STILL GET A COMPANY BACK, and it is whatever the database says — which
  // for the two known WBR-side accounts is null. A handler that admits staff
  // must therefore decide what a null company means for it; the ones that do
  // (PATCH /api/meetings/[id]) already had that branch before this phase and
  // keep it, now reading the role from here rather than off the token.
  if (isWbrStaff(account.role)) {
    return { refused: null, companyId: account.sponsorId, role: account.role }
  }

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
  if (!account.sponsor) return { refused: refusal() }

  const { _count, ...company } = account.sponsor
  const subject = { ...company, attachedUserCount: _count.users }

  // Reads SPONSOR_REQUIRED_ITEMS through the shared policy rather than any
  // stored "onboarded" marker, so an item cleared later refuses again instead of
  // being waved through by a one-time flag. This file defines no completeness
  // rule of its own; a sponsor rule written here would be the sixth competing
  // answer to "is this profile complete", which is the problem the shared policy
  // exists to remove.
  if (!isRequiredSetComplete('sponsor', subject)) return { refused: refusal() }

  // Allowed, and acting for this company. `account.sponsorId` is non-null here:
  // the branch above returned when `account.sponsor` was absent, and the schema
  // declares `User.sponsor` with `onDelete: SetNull`, so the relation and the
  // column cannot disagree.
  return { refused: null, companyId: account.sponsorId, role: account.role }
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
