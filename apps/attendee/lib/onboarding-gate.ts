import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { prisma, isRequiredSetComplete, isWbrStaff, DELEGATE_REQUIRED_SELECT } from '@conference/db'
import { authOptions } from '@/lib/auth'

/**
 * The onboarding gate: send an attendee with an incomplete profile to the
 * checklist, and let everyone else through.
 *
 * Call this from the layout of EVERY authenticated route group that an
 * attendee can reach, with one deliberate exception — the checklist at
 * /onboarding itself, which would otherwise redirect to itself forever.
 *
 * It lives in its own function rather than inline in a layout because the
 * attendee app has more than one authenticated route group, and the first cut
 * of this feature guarded only `(app)`. That left `(fullscreen)/chat/[roomId]`
 * wide open: an attendee with an empty required field was blocked from every
 * section yet could still open a chat room and post in it. Adversarial review
 * caught it; a smoketest that only exercised `/chat` did not. One function with
 * several call sites is harder to half-apply than a check copied per layout.
 *
 * **Adding a new authenticated route group? Call this from its layout.** There
 * is no framework-level enforcement that you have.
 *
 * The check reads the required-set policy rather than any stored "onboarded"
 * flag, so a required field cleared later re-blocks instead of being waved
 * through by a one-time marker. It assumes nothing about how the person signed
 * in — email and password alone reaches and passes it.
 *
 * Known scope limit, measured rather than assumed: this is a server-side check,
 * so it does not fire on in-app navigation to a section already visited within
 * the browser's page-cache window (`experimental.staleTimes.dynamic = 300` in
 * next.config.js). That is closed at the only in-app place a required field can
 * be cleared — the settings screen calls router.refresh() after saving. See
 * components/setup/SetupClient.tsx.
 */
export async function enforceOnboardingGate(): Promise<void> {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id

  // No session is an auth concern, not a completeness one — middleware.ts
  // already sends anonymous requests to /login.
  if (!userId) return

  const account = await prisma.user.findUnique({
    where: { id: userId },
    // `role` is fetched from the database rather than read off the session,
    // even though the session carries it. A session token is issued at sign-in
    // and does not change afterwards, so an account whose role was revoked
    // would keep its exemption until it signed in again — the wrong direction
    // to be wrong in. This costs no extra query.
    select: { role: true, ...DELEGATE_REQUIRED_SELECT },
  })

  // FAIL CLOSED when the session points at a row that is not there.
  //
  // This used to return, on the reasoning that a missing row is an
  // authentication concern for middleware rather than a completeness one. That
  // was wrong, and measured: middleware only checks that a session token
  // decodes, not that the account still exists, so a token issued before the
  // row was deleted still rendered /home, /people, /chat/new, /speakers and
  // /schedule with a 200. Reseeding deletes thousands of rows, so sessions
  // pointing at deleted people are an ordinary consequence of ordinary work,
  // not a hypothetical.
  //
  // What saved it from being a data leak was the request guard beside this
  // file, which already fails closed — the screens rendered their shell and
  // every /api/data/* call behind them returned 403, so no attendee's details
  // appeared. That is defence in depth doing its job, not a reason to leave
  // this open: a page that queried on the server rather than through those
  // addresses would have leaked.
  //
  // /login rather than /onboarding: there is no profile to complete, and the
  // checklist's save address refuses a session with no row.
  //
  // THE QUERY MARKER MATTERS — do not drop it. middleware.ts bounces
  // any request to /login that carries a session token straight back to /home,
  // so a bare redirect('/login') here produces an endless /home → /login →
  // /home loop: the token still decodes, only the row behind it is gone. That
  // loop was measured, not imagined — it was the first version of this fix.
  // middleware.ts skips its bounce when this marker is present, which is the
  // one case where a token-holder genuinely does need the sign-in form.
  if (!account) redirect('/login?session=invalid')

  // THE EXEMPTION IS ABOUT WHO THE PERSON IS, NOT WHICH APP THEY ARE IN.
  //
  // Organizers, admins and WBR staff operate the event rather than participate
  // in it, so they are released everywhere — here, in the request guard beside
  // this file, and in the sponsor portal. They are not asked to complete a
  // delegate profile in order to see what delegates see.
  //
  // Stated as a kind of person rather than as a list of app names on purpose.
  // The earlier wording named two never-gated apps, which left an organizer
  // inside THIS app gated exactly like a delegate, and would have trapped the
  // primary demonstration account in the sponsor portal: it holds the organizer
  // role, has no exhibiting company, and the profile-save address refuses it
  // outright with "No sponsor linked" — a checklist it could never complete.
  // A fifth app would inherit the same hole. A kind of person does not.
  //
  // This reuses isWbrStaff() from packages/db/src/app-access.ts, the module
  // that already decides which role may sign in to which app. There is
  // deliberately no second list of roles to drift out of step with it.
  if (isWbrStaff(account.role)) return

  if (!isRequiredSetComplete('delegate', account)) redirect('/onboarding')
}
