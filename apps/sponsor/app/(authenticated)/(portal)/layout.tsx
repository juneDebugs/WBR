import { NavBar } from '@/components/NavBar'
import { BackgroundPrefetch } from '@/components/BackgroundPrefetch'
import { enforceOnboardingGate } from '@/lib/onboarding-gate'

// Do NOT add blocking server-side fetches here — it causes white screen delays.
// User info is available client-side via useUser() hook (reads from NextAuth session).
//
// ONE DELIBERATE EXCEPTION TO THE LINE ABOVE: the onboarding gate below. It is a
// blocking server-side read and it is here on purpose, because a gate that does
// not run before the navigation bar renders is not a gate — it would let a
// blocked representative see and use the portal's own navigation. Its cost is
// held to a single database round trip fetching only the columns the required
// items read, and the measured page-load figure is recorded in
// docs/smoketests/phase-5-sponsor-screen-gate.md. The reasoning, including what
// to do if that figure stops being acceptable, is at the gate's definition in
// lib/onboarding-gate.ts. Do not remove the line above on account of this — it
// is still the rule for everything else in this file.
//
// This layout must not be statically rendered: the gate has to ask the database
// on each request rather than replay a cached render from whenever the last
// person's profile happened to be complete.
export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  await enforceOnboardingGate()

  return (
    <>
      <link rel="preload" href="/api/attendees" as="fetch" crossOrigin="anonymous" />
      <div className="min-h-screen flex flex-col">
        <BackgroundPrefetch />
        <NavBar />
        <main className="flex-1">{children}</main>
      </div>
    </>
  )
}
