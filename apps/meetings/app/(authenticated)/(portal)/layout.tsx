import { redirect } from 'next/navigation'
import { getUserFromHeaders } from '@/lib/user'
import { enforceOnboardingGate } from '@/lib/onboarding-gate'
import { NavBar } from '@/components/NavBar'
import { DataPrefetch } from '@/components/DataPrefetch'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders()
  if (!user.id) redirect('/login')
  // The onboarding gate, one of this portal's two call sites — the other is
  // app/(authenticated)/staff/layout.tsx. A delegate whose required fields are
  // empty is sent to /onboarding from here; WBR-side people pass through
  // untouched. See lib/onboarding-gate.ts.
  await enforceOnboardingGate()
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar role={user.role} />
      <DataPrefetch />
      <main className="flex-1">{children}</main>
    </div>
  )
}
