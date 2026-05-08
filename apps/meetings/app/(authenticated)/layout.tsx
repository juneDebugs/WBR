import { SessionProvider } from '../session-provider'
import { QueryProvider } from '@/lib/query-client'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>{children}</QueryProvider>
    </SessionProvider>
  )
}
