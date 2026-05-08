import { redirect } from 'next/navigation'
import { getUserFromHeaders } from '@/lib/user'
import { PortalShell } from '@/components/PortalShell'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders()
  if (!user.id) redirect('/login')
  return (
    <PortalShell role={user.role} userId={user.id} sponsorId={user.sponsorId}>
      {children}
    </PortalShell>
  )
}
