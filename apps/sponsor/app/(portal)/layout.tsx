import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { NavBar } from '@/components/NavBar'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const user = session.user as any
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar sponsorName={user.sponsorName} role={user.role} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
