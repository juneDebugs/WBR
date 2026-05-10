import { NavBar } from '@/components/NavBar'
import { BackgroundPrefetch } from '@/components/BackgroundPrefetch'

// Do NOT add blocking server-side fetches here — it causes white screen delays.
// User info is available client-side via useUser() hook (reads from NextAuth session).
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <BackgroundPrefetch />
      <NavBar />
      <main className="flex-1">{children}</main>
    </div>
  )
}
