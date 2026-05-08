import { redirect } from 'next/navigation'
import { getUserFromHeaders } from '@/lib/user'
import { NavBar } from '@/components/NavBar'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders()
  if (!user.id) redirect('/login')
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar sponsorName={user.sponsorName} role={user.role} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
