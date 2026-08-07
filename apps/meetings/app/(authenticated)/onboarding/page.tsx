import { redirect } from 'next/navigation'
import { prisma, isRequiredSetComplete, isWbrStaff, DELEGATE_REQUIRED_SELECT } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist'

// Mirrors the gate: the completeness read must never come from a cached render,
// or a just-completed profile would still look incomplete here.
export const dynamic = 'force-dynamic'

/**
 * The onboarding checklist route for the meetings portal.
 *
 * WHERE THIS SITS AND WHY. Inside `(authenticated)`, so it receives the session
 * and query providers — but outside BOTH gated route groups, `(portal)` and
 * `staff`, for two separate reasons, each already paid for once in the other two
 * applications:
 *
 *   1. The gate is called from those layouts. A checklist inside one of them
 *      would be redirected to itself forever.
 *   2. The `(portal)` layout renders the navigation bar. A checklist inside it
 *      would hand a blocked person the portal's own links and let them click
 *      straight around the gate.
 *
 * A person who is already complete has no business here, so they are sent on to
 * the portal. That is what makes filling in the last field release someone in a
 * single hop rather than leaving them on a checklist with nothing left to do.
 */
export default async function OnboardingPage() {
  const user = await getUserFromHeaders()
  if (!user.id) redirect('/login')

  const account = await prisma.user.findUnique({
    where: { id: user.id },
    // `image` is not part of the required set and is read anyway, so the
    // checklist shows the picture already on the account rather than looking
    // like a stranger's screen. Nothing about the gate consults it.
    select: { role: true, image: true, ...DELEGATE_REQUIRED_SELECT },
  })

  // Same fail-closed reasoning and the same query marker as the gate. A token
  // whose user row was deleted still decodes, and middleware.ts would bounce a
  // bare /login redirect straight back here. See lib/onboarding-gate.ts.
  if (!account) redirect('/login?session=invalid')

  // Beyond the two enforcement points, but for the same reason: a WBR-side
  // account is never gated, so it has no required set to complete and must not
  // be shown a checklist for one. Without this, typing /onboarding directly
  // would put a delegate's form in front of somebody the gate has already
  // released — and this portal's staff queue is exactly who that is.
  if (isWbrStaff(account.role)) redirect('/')

  if (isRequiredSetComplete('delegate', account)) redirect('/')

  return <OnboardingChecklist profile={account} image={account.image} />
}
