import { redirect } from 'next/navigation'
import { prisma, isRequiredSetComplete, isWbrStaff, DELEGATE_REQUIRED_SELECT } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'

/**
 * The onboarding gate: send a delegate with an incomplete profile to the
 * checklist, and let everyone else through.
 *
 * The third copy of a shape that already exists in the participant app
 * (apps/attendee/lib/onboarding-gate.ts) and the sponsor portal
 * (apps/sponsor/lib/onboarding-gate.ts). It measures the SAME six delegate
 * fields as the participant app, from the same single source of truth in
 * packages/db/src/onboarding-policy.ts, because a person admitted here who is
 * not WBR-side is a delegate and the required set follows the person rather
 * than the app. A portal-specific list would give one person two definitions of
 * "complete" depending on which app they opened, which is the outcome
 * docs/adr/0008-onboarding-gate-is-about-the-person-not-the-app.md exists to
 * prevent.
 *
 * Call this from the layout of EVERY authenticated route group, with one
 * deliberate exception — the checklist at /onboarding itself, which would
 * otherwise redirect to itself forever.
 *
 * **This portal has two of them:** app/(authenticated)/(portal) and
 * app/(authenticated)/staff. Gating only the first repeats finding F-3 from the
 * onboarding work, where one of the participant app's two route groups was left
 * open and a blocked person could still reach a chat room. **Adding a third?
 * Call this from its layout.** Nothing at the framework level will remind you.
 *
 * The check reads the required-set policy rather than any stored "onboarded"
 * flag, so a required field cleared later re-blocks instead of being waved
 * through by a one-time marker.
 *
 * ── The screens are half of it ───────────────────────────────────────────────
 *
 * Route handlers are not rendered inside any layout, so this never runs for
 * them. They carry their own guard — see lib/require-complete-profile.ts beside
 * this file. Screens alone is a known-defective state, not a smaller version of
 * the same thing: a person blocked from every screen could still ask this
 * portal's addresses for the attendee directory and post a meeting request.
 */
export async function enforceOnboardingGate(): Promise<void> {
  const user = await getUserFromHeaders()

  // No session is an auth concern, not a completeness one — middleware.ts
  // already sends anonymous requests to /login. Note the empty-string case:
  // getUserFromHeaders reads a header middleware writes as '' when there is no
  // token, so this is not the same test as a missing property.
  if (!user.id) return

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    // `role` comes from the database rather than from the header middleware
    // forwarded, even though that header carries it. The header is filled from
    // the session token, which is issued at sign-in and never changes, so an
    // account whose role was revoked would keep its exemption until it signed
    // in again — the wrong direction to be wrong in. This costs no extra query:
    // the completeness check needs the row anyway.
    select: { role: true, ...DELEGATE_REQUIRED_SELECT },
  })

  // FAIL CLOSED when the session points at a row that is not there.
  //
  // Middleware only checks that a session token decodes, not that the account
  // behind it still exists, and reseeding this project deletes thousands of user
  // rows — so a live session pointing at a deleted person is an ordinary
  // consequence of ordinary work rather than a hypothetical. The same reasoning,
  // and the same measurement, as the participant app's gate.
  //
  // /login rather than /onboarding: there is no profile to complete.
  //
  // THE QUERY MARKER MATTERS — do not drop it. middleware.ts bounces any request
  // to /login that carries a token back to the portal, so a bare
  // redirect('/login') here produces an endless / → /login → / loop: the token
  // still decodes, only the row behind it is gone. middleware.ts skips its
  // bounce when this marker is present, which is the one case where a
  // token-holder genuinely does need the sign-in form.
  if (!account) redirect('/login?session=invalid')

  // THE EXEMPTION IS ABOUT WHO THE PERSON IS, NOT WHICH APP THEY ARE IN.
  //
  // WBR staff and organizers operate the event rather than participate in it, so
  // they are released here exactly as they are in the other two apps, and this
  // is what keeps the staff queue at /staff reachable without an exception being
  // written for it. There is deliberately no second list of roles: this is the
  // isWbrStaff() test from packages/db/src/app-access.ts that already decides
  // which role may sign in to which app.
  //
  // Placed AFTER the missing-row refusal above and BEFORE the completeness check
  // below. A session pointing at a deleted row has no role to read, so it cannot
  // be exempted — it is refused, which is the direction already measured as
  // correct in the participant app.
  if (isWbrStaff(account.role)) return

  if (!isRequiredSetComplete('delegate', account)) redirect('/onboarding')
}
