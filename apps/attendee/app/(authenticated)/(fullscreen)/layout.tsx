import { enforceOnboardingGate } from '@/lib/onboarding-gate'

// The gate must read the database rather than a cached render of this layout.
export const dynamic = 'force-dynamic'

/**
 * Full-screen authenticated shell — no bottom nav; currently just the chat room
 * at /chat/[roomId].
 *
 * The onboarding gate runs here for the same reason it runs on the tabbed shell.
 * This group was missed by the first cut of the gate, which left an attendee with
 * an incomplete profile blocked from every section yet still able to open a chat
 * room and post in it. See lib/onboarding-gate.ts.
 */
export default async function FullscreenLayout({ children }: { children: React.ReactNode }) {
  await enforceOnboardingGate()

  return (
    <div className="min-h-screen">
      {children}
    </div>
  )
}
