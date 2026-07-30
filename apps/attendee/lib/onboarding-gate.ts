import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { prisma } from '@conference/db'
import { authOptions } from '@/lib/auth'
import { isComplete, REQUIRED_FIELD_SELECT } from '@/lib/profile-completeness'

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

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: REQUIRED_FIELD_SELECT,
  })

  // Likewise a missing row: leave it to middleware rather than bouncing the
  // person into a checklist that cannot save.
  if (profile && !isComplete(profile)) redirect('/onboarding')
}
