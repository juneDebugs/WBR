import { redirect } from 'next/navigation'
import {
  prisma,
  isRequiredSetComplete,
  isWbrStaff,
  SPONSOR_REQUIRED_SELECT,
} from '@conference/db'
import { getSession } from '@/lib/session'

/**
 * The sponsor onboarding gate: send a representative whose exhibiting company
 * is missing a required item to the checklist, and let everyone else through.
 *
 * Call this from the layout of EVERY authenticated route group in this app,
 * with one deliberate exception — the checklist at /onboarding, which would
 * otherwise redirect to itself forever. Today `(portal)` is the only gated
 * group; see the residual note at the bottom of this comment.
 *
 * The shape here is the attendee app's gate, deliberately: see
 * apps/attendee/lib/onboarding-gate.ts. Same order of questions, same fail
 * direction, same reasons. Two gates that answer the same question in two
 * different orders are two gates to reason about.
 *
 * WHAT IT DOES NOT DECIDE. The six required items live in
 * packages/db/src/onboarding-policy.ts as SPONSOR_REQUIRED_ITEMS, with every
 * exclusion and its reason recorded at the definition. This file reads them and
 * defines nothing. A sponsor completeness rule written here would be the sixth
 * competing answer to "is this profile complete", which is the exact problem
 * the shared policy exists to remove.
 *
 * The check reads the policy rather than any stored "onboarded" flag, so a
 * required item cleared later re-blocks instead of being waved through by a
 * one-time marker.
 *
 * PERFORMANCE — A DELIBERATE EXCEPTION, NOT AN OVERSIGHT. The layout that calls
 * this carries the comment `Do NOT add blocking server-side fetches here — it
 * causes white screen delays`, added when blocking fetches were removed from
 * that file on purpose. This is a blocking server-side read and it goes there
 * anyway, because a gate that does not run is not a gate. Three things keep the
 * cost to the minimum the feature allows:
 *
 *   - One database round trip, not two. Role, company columns and the team
 *     count come back in a single query.
 *   - Only the columns the required items read, derived from the policy via
 *     SPONSOR_REQUIRED_SELECT rather than listed here by hand. A column named
 *     here and not fetched would read as absent and block a complete company.
 *   - It returns before any completeness work for the accounts that operate the
 *     event, which are the accounts most likely to be clicking around fast.
 *
 * There is no loading.tsx at the `(portal)` or `(authenticated)` level, so the
 * time this adds is time on a blank screen. The measured cost is recorded in
 * docs/smoketests/phase-5-sponsor-screen-gate.md. If that number ever stops
 * being acceptable, the fix is a cheaper gate, not a missing one.
 *
 * RESIDUAL, STATED RATHER THAN PAPERED OVER. Nothing at the framework level
 * forces a new child of `(authenticated)` to call this. Two children exist
 * today: `(portal)`, which calls it, and `/onboarding`, which must not. A third
 * added without the call reopens exactly the hole FP finding F-3 recorded in
 * the attendee app, where one of two route groups was gated and a person
 * blocked from every visible section could still open a chat room.
 *
 * **Adding a new authenticated route group? Call this from its layout.**
 */
export async function enforceOnboardingGate(): Promise<void> {
  const session = await getSession()
  const userId = (session?.user as { id?: string } | undefined)?.id

  // No session is an authentication concern, not a completeness one —
  // middleware.ts already sends anonymous requests to /login.
  if (!userId) return

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      // `role` is read from the database rather than off the session, even
      // though middleware.ts forwards it as an x-user-role header and the
      // session carries it too. A session token is issued at sign-in and never
      // changes afterwards, so an account whose role was revoked would keep its
      // exemption until it signed in again — the wrong direction to be wrong
      // in. Same reasoning as the attendee gate. It costs no extra query.
      role: true,
      // The company link is read the same way and for the same reason: a
      // representative moved between companies carries the old sponsorId in
      // their token until they sign in again.
      sponsor: {
        select: {
          // Derived from the policy, never hand-listed. See sponsorReadinessSelect().
          ...SPONSOR_REQUIRED_SELECT,
          // The team count is fetched even though no REQUIRED item reads it
          // today — "assign at least one team member" is one of the three
          // items the reminder chases and the gate does not block on. It is
          // fetched so the subject handed to the policy is the whole thing the
          // policy documents. Without it, flipping that item to required would
          // silently block every representative, because an absent count reads
          // as zero and zero fails closed.
          _count: { select: { users: true } },
        },
      },
    },
  })

  // FAIL CLOSED when the session points at a row that is not there.
  //
  // middleware.ts checks only that a session token decodes, not that the
  // account behind it still exists, so a token issued before the row was
  // deleted still reaches this layout. Reseeding deletes thousands of user
  // rows, so this is an ordinary consequence of ordinary work rather than a
  // hypothetical. FP finding F-6 measured the opposite choice as wrong.
  //
  // THE QUERY MARKER MATTERS — do not drop it. middleware.ts bounces any
  // request to /login that carries a session token straight to /dashboard, so a
  // bare redirect('/login') here produces an endless /dashboard → /login →
  // /dashboard loop: the token still decodes, only the row behind it is gone.
  // That exact loop was measured in the attendee app and cost a session's worth
  // of time; middleware.ts here now skips its bounce when this marker is
  // present, which is the one case where a token-holder genuinely does need the
  // sign-in form. See the matching comment in middleware.ts.
  if (!account) redirect('/login?session=invalid')

  // THE EXEMPTION IS ABOUT WHO THE PERSON IS, NOT WHICH APP THEY ARE IN.
  //
  // Organizers, admins and WBR staff operate the event rather than exhibit at
  // it, so they are released here exactly as they are in the attendee app. They
  // are not asked to complete an exhibiting company's profile in order to
  // operate the portal on an exhibitor's behalf.
  //
  // This is the load-bearing reason the rule is stated as a kind of person. The
  // earlier wording named two never-gated apps, neither of them this one, which
  // would have trapped the primary demonstration login: wbr@test.com holds the
  // organizer role, has no exhibiting company, is admitted to this portal by
  // APP_ALLOWED_ROLES in packages/db/src/app-access.ts, and would be sent to a
  // checklist whose save address refuses it outright with "No sponsor linked".
  // A checklist it could never complete, in front of a customer.
  //
  // Reuses isWbrStaff() from packages/db/src/app-access.ts, the module that
  // already decides which role may sign in to which app. There is deliberately
  // no second list of roles here to drift out of step with it. Recorded as a
  // decision in docs/adr/0008-onboarding-gate-is-about-the-person.md.
  if (isWbrStaff(account.role)) return

  // No exhibiting company, and not an event-operating role. Nothing to
  // complete: the save address at /api/profile refuses this account with "No
  // sponsor linked", so a checklist would be a form that cannot save.
  //
  // Note the schema shape — User.sponsor is declared `onDelete: SetNull`, so a
  // deleted company leaves sponsorId null rather than dangling. "Company row
  // missing" and "no company ever linked" arrive here as the same state, which
  // is why one branch covers both.
  //
  // Phase 5 sends them to /onboarding, which renders a short explanation rather
  // than the form. PHASE 7 OWNS THIS CASE and completes it: refusing the data
  // addresses too, and verifying against a throwaway account, since no seeded
  // account is in this state. What is here is the minimum that avoids shipping
  // a form that cannot save.
  if (!account.sponsor) redirect('/onboarding')

  const { _count, ...company } = account.sponsor
  const subject = { ...company, attachedUserCount: _count.users }

  if (!isRequiredSetComplete('sponsor', subject)) redirect('/onboarding')
}
