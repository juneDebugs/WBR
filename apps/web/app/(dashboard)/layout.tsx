import { SessionProvider } from '../session-provider'
import { QueryProvider } from '@/lib/query-provider'

// Force all dashboard pages to render at request time, never at build time.
// Build-time rendering uses the local dev.db which has stale seed data —
// the admin's live changes are in the production Turso database.
export const dynamic = 'force-dynamic'

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>{children}</QueryProvider>
    </SessionProvider>
  )
}
