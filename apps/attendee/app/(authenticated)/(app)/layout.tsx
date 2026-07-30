import { enforceOnboardingGate } from '@/lib/onboarding-gate'
import { BottomNav } from '@/components/BottomNav'
import { PushNotificationSetup } from '@/components/PushNotificationSetup'
import { BackgroundPrefetch } from '@/components/BackgroundPrefetch'

// The gate must read the database rather than a cached render of this layout.
export const dynamic = 'force-dynamic'

/**
 * Attendee app shell, for every tabbed section: home, schedule, speakers,
 * people, meetings, chat, my-schedule, setup.
 *
 * The onboarding gate runs here, but note it is NOT unique to this group —
 * `(fullscreen)` calls it too. See lib/onboarding-gate.ts.
 *
 * The checklist at /onboarding deliberately sits outside this route group: if it
 * lived inside, the gate would redirect it to itself forever, and it would
 * render a bottom nav that let a blocked attendee tab away.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await enforceOnboardingGate()

  return (
    <div className="flex flex-col h-[100dvh]">
      <PushNotificationSetup />
      <BackgroundPrefetch />
      <main className="flex-1 overflow-y-auto overscroll-contain">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
