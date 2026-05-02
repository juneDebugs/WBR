import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { NavBar } from '@/components/NavBar'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar role={(session.user as any).role} />
      <main className="flex-1">
        {children}
      </main>
    </div>
  )
}
