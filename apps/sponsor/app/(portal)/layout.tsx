import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { NavBar } from '@/components/NavBar'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  const user = session.user as any
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar sponsorName={user.sponsorName} role={user.role} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
