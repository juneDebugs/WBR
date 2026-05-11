import { SessionProvider } from '../session-provider'
import { QueryProvider } from '@/lib/query-provider'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider>{children}</SessionProvider>
    </QueryProvider>
  )
}
