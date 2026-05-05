import { SessionProvider } from '../session-provider'
import { QueryProvider } from '@/lib/query-client'
import { getSession } from '@/lib/session'

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  return (
    <SessionProvider session={session}>
      <QueryProvider>{children}</QueryProvider>
    </SessionProvider>
  )
}
