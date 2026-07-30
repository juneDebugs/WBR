import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { prisma } from '@conference/db'
import { authOptions } from '@/lib/auth'
import { isComplete, REQUIRED_FIELD_SELECT } from '@/lib/profile-completeness'
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

  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: REQUIRED_FIELD_SELECT,
  })
  if (!profile) redirect('/login')
  if (isComplete(profile)) redirect('/home')

  return <OnboardingChecklist profile={profile} />
}
