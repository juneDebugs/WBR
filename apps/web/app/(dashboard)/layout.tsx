import { SessionProvider } from '../session-provider'
import { QueryProvider } from '@/lib/query-provider'

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>{children}</QueryProvider>
    </SessionProvider>
  )
}
