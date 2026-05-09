import { redirect } from 'next/navigation'
import { getUserFromHeaders } from '@/lib/user'
import { NavBar } from '@/components/NavBar'
import { DataPrefetch } from '@/components/DataPrefetch'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getUserFromHeaders()
  if (!user.id) redirect('/login')
  return (
    <div className="min-h-screen flex flex-col">
      <NavBar role={user.role} />
      <DataPrefetch />
      <main className="flex-1">{children}</main>
    </div>
  )
}
