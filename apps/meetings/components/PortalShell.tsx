'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { PortalNavContext } from '@/lib/portal-nav'
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

const BROWSE_PATH = '/browse'

// Prefetch helpers — fire-and-forget fetches to warm React Query cache
const PREFETCH_QUERIES = [
  { queryKey: ['dashboard'], url: '/api/dashboard', staleTime: 60_000 },
  { queryKey: ['dashboard-recommendations'], url: '/api/dashboard/recommendations', staleTime: 5 * 60_000 },
  { queryKey: ['requests'], url: '/api/requests', staleTime: 5 * 60_000 },
  { queryKey: ['meetings'], url: '/api/meetings', staleTime: 5 * 60_000 },
]

export function PortalShell({ role, userId, sponsorId, children }: {
  role: string
  userId: string
  sponsorId: string | null
  children: React.ReactNode
}) {
  const nextPathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [currentPath, setCurrentPath] = useState(nextPathname)
  const prevNextPathname = useRef(nextPathname)

  // Eagerly prefetch ALL section data on mount so navigation is always instant
  useEffect(() => {
    for (const { queryKey, url, staleTime } of PREFETCH_QUERIES) {
      queryClient.prefetchQuery({
        queryKey,
        queryFn: async () => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`Failed to fetch ${url}`)
          return res.json()
        },
        staleTime,
      })
    }
  }, [queryClient])

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
    <PortalNavContext.Provider value={{ currentPath, navigate, userId, sponsorId }}>
      <div className="min-h-screen flex flex-col">
        <NavBar role={role} />
        <main className="flex-1">
          {content}
        </main>
      </div>
    </PortalNavContext.Provider>
  )
}
