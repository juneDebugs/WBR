import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { prisma, isRequiredSetComplete, isWbrStaff, DELEGATE_REQUIRED_SELECT } from '@conference/db'
import { authOptions } from '@/lib/auth'
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist'

// Mirrors the gate: the completeness read must never come from a cached
// render, or a just-completed profile would still look incomplete here.
export const dynamic = 'force-dynamic'

/**
 * The onboarding checklist.
 *
 * Sits inside (authenticated) — so it gets the session and query providers —
 * but outside the (app) route group, so the gate in
 * app/(authenticated)/(app)/layout.tsx does not redirect this page to itself.
 * Being outside (app) also means no bottom nav renders, which is what stops a
 * blocked attendee from tabbing into the app around the gate.
 *
 * An attendee who is already complete has no business here, so they are sent
 * on to the app. That is what makes completing the required set release someone
 * in a single hop rather than leaving them on a checklist with nothing left to
 * fill in.
 */
export default async function OnboardingPage() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id
  if (!userId) redirect('/login')

  const account = await prisma.user.findUnique({
    where: { id: userId },
    // `image` is not part of the required set and is read anyway: it is what a
    // LinkedIn sign-in pre-fills, and the checklist shows it so the pre-fill is
    // visible rather than only stored (Phase 12, FP 10). Nothing about the gate
    // consults it.
    select: { role: true, image: true, ...DELEGATE_REQUIRED_SELECT },
  })
  if (!account) redirect('/login')

  // Beyond the two enforcement points, but for the same reason: an organizer,
  // admin or staff account is never gated, so it has no required set to
  // complete and must not be shown a checklist for one. Without this, typing
  // /onboarding directly would put a form in front of someone the gate has
  // already released — asking them for a delegate's details to reach an app
  // they were never blocked from.
  if (isWbrStaff(account.role)) redirect('/home')

  if (isRequiredSetComplete('delegate', account)) redirect('/home')

  return <OnboardingChecklist profile={account} image={account.image} />
}
