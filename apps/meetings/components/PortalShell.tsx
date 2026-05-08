'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { NavBar } from '@/components/NavBar'
import { DashboardView } from '@/components/DashboardView'
import { RequestsList } from '@/components/RequestsList'
import { MeetingsView } from '@/components/MeetingsView'
import { BrowseView } from '@/components/BrowseView'

// Routes handled entirely client-side (no server round-trip)
const SHELL_ROUTES: Record<string, React.ComponentType> = {
  '/': DashboardView,
  '/requests': RequestsList,
  '/meetings': MeetingsView,
}

// Browse needs a prop, handle separately
const BROWSE_PATH = '/browse'

interface PortalNavContextValue {
  currentPath: string
  navigate: (path: string) => void
}

const PortalNavContext = createContext<PortalNavContextValue>({
  currentPath: '/',
  navigate: () => {},
})

export function usePortalNav() {
  return useContext(PortalNavContext)
}

export function PortalShell({ role, children }: { role: string; children: React.ReactNode }) {
  const nextPathname = usePathname()
  const router = useRouter()
  const [currentPath, setCurrentPath] = useState(nextPathname)
  const prevNextPathname = useRef(nextPathname)

  // Sync when Next.js does a real navigation (e.g., to /profile or /staff)
  useEffect(() => {
    if (nextPathname !== prevNextPathname.current) {
      prevNextPathname.current = nextPathname
      setCurrentPath(nextPathname)
    }
  }, [nextPathname])

  // Handle browser back/forward
  useEffect(() => {
    const handler = () => setCurrentPath(window.location.pathname)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const navigate = useCallback((path: string) => {
    const isShellRoute = path in SHELL_ROUTES || path === BROWSE_PATH
    if (isShellRoute) {
      // Client-side only — no server round-trip
      window.history.pushState(null, '', path)
      setCurrentPath(path)
    } else {
      // Real Next.js navigation for non-shell routes (profile, staff, etc.)
      router.push(path)
    }
  }, [router])

  // Determine what to render
  let content: React.ReactNode
  const ShellComponent = SHELL_ROUTES[currentPath]
  if (ShellComponent) {
    content = <ShellComponent />
  } else if (currentPath === BROWSE_PATH) {
    content = <BrowseView mode="attendee-browsing-sponsors" />
  } else {
    content = children
  }

  return (
    <PortalNavContext.Provider value={{ currentPath, navigate }}>
      <div className="min-h-screen flex flex-col">
        <NavBar role={role} />
        <main className="flex-1">
          {content}
        </main>
      </div>
    </PortalNavContext.Provider>
  )
}
