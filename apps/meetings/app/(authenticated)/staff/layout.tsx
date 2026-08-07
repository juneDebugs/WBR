import { enforceOnboardingGate } from '@/lib/onboarding-gate'

/**
 * The staff area's layout, which exists for one reason: to call the onboarding
 * gate.
 *
 * This is the portal's SECOND authenticated route group. Until this file existed
 * the group had no layout at all, so a gate placed only on `(portal)` would have
 * left /staff open — the same defect finding F-3 recorded in the participant
 * app, where one of two route groups was left ungated and a person blocked from
 * every visible section could still reach a chat room.
 *
 * In practice a blocked delegate is turned away twice over: page.tsx already
 * sends anyone who is not WBR-side to /browse. That is not a reason to leave the
 * gate off. The redirect in page.tsx is about who operates the meeting engine,
 * not about onboarding, and a screen added beside it tomorrow would inherit
 * nothing from it. The gate belongs on the group.
 *
 * No markup of its own: the staff console renders full-width and this layout
 * must not introduce a wrapper that changes it.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await enforceOnboardingGate()
  return <>{children}</>
}
