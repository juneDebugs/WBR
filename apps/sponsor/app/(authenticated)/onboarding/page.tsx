import { redirect } from 'next/navigation'
import {
  prisma,
  isRequiredSetComplete,
  isWbrStaff,
  SPONSOR_REQUIRED_SELECT,
} from '@conference/db'
import { getSession } from '@/lib/session'
import { SponsorOnboardingChecklist } from '@/components/onboarding/SponsorOnboardingChecklist'

// Mirrors the gate: the completeness read must never come from a cached render,
// or a company whose profile was just finished would still look incomplete here.
export const dynamic = 'force-dynamic'

/**
 * The sponsor onboarding checklist route.
 *
 * WHERE THIS SITS AND WHY. Inside `(authenticated)`, so it receives the session
 * and query providers — but OUTSIDE `(portal)`, for two separate reasons, both
 * of which have already been paid for once in the attendee app:
 *
 *   1. The gate lives in the `(portal)` layout. A checklist inside that group
 *      would be redirected to itself forever.
 *   2. The `(portal)` layout renders the navigation bar. A checklist inside it
 *      would hand a blocked representative the portal's own links and let them
 *      click straight around the gate.
 *
 * A representative who is already complete has no business here, so they are
 * sent on to the portal. That is what makes finishing the six items release
 * someone in a single hop rather than leaving them on a checklist with nothing
 * left to fill in.
 */
export default async function SponsorOnboardingPage() {
  const session = await getSession()
  const userId = (session?.user as { id?: string } | undefined)?.id
  if (!userId) redirect('/login')

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      sponsor: {
        select: {
          name: true,
          ...SPONSOR_REQUIRED_SELECT,
          _count: { select: { users: true } },
        },
      },
    },
  })

  // Same fail-closed reasoning and the same query marker as the gate. A token
  // whose user row was deleted still decodes, and middleware.ts would bounce a
  // bare /login redirect straight back here. See lib/onboarding-gate.ts.
  if (!account) redirect('/login?session=invalid')

  // Beyond the two enforcement points, but for the same reason: an organizer,
  // admin or staff account is never gated, so it has no required set to complete
  // and must not be shown a checklist for one. Without this, typing /onboarding
  // directly would put a form in front of someone the gate has already released
  // — and for wbr@test.com, which has no exhibiting company at all, a form whose
  // save address refuses it outright.
  if (isWbrStaff(account.role)) redirect('/dashboard')

  // NO EXHIBITING COMPANY. The save address at /api/profile refuses this account
  // with "No sponsor linked", so a checklist here would be a form that cannot
  // save — the exact trap the requirements document rejects by name.
  //
  // What renders below is the minimum that avoids shipping that trap. PHASE 7
  // OWNS THIS CASE and completes it: refusing the sponsor data addresses for
  // such an account too, and verifying the whole path against a throwaway
  // account, since no seeded account is in this state. Treat the wording here as
  // provisional and Phase 7's acceptance criteria as the specification.
  if (!account.sponsor) {
    return (
      <div className="max-w-2xl mx-auto p-6" data-testid="sponsor-onboarding-no-company">
        <div className="card p-6 space-y-3">
          <h1 className="text-xl font-bold text-ink">No exhibiting company is linked to your account</h1>
          <p className="text-sm text-ink-2">
            The sponsor portal shows a company&apos;s profile, meetings and buyer matches, and your
            account is not attached to one yet. There is nothing here for you to fill in — this has
            to be linked by the event organizer.
          </p>
          <p className="text-sm text-ink-2">
            Contact the WBR event organizer and ask them to attach your account to your company.
            Once they have, sign in again and the portal will open.
          </p>
        </div>
      </div>
    )
  }

  const { _count, name, ...columns } = account.sponsor
  const company = { ...columns, attachedUserCount: _count.users }

  if (isRequiredSetComplete('sponsor', company)) redirect('/dashboard')

  return <SponsorOnboardingChecklist company={company} companyName={name ?? 'your company'} />
}
