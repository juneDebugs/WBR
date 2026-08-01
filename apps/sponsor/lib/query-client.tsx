'use client'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { get, set, del } from 'idb-keyval'
import { useState } from 'react'

// Custom persister using IndexedDB for larger storage and non-blocking I/O
function createIdbPersister() {
  return {
    persistClient: async (client: any) => {
      await set('sponsor-query-cache', client)
    },
    restoreClient: async () => {
      return await get('sponsor-query-cache')
    },
    removeClient: async () => {
      await del('sponsor-query-cache')
    },
  }
}

const persister = createIdbPersister()

/**
 * Erase the persisted copy of everything this portal has fetched.
 *
 * WHY THIS EXISTS AND WHO CALLS IT. `persistClient` above writes the whole query
 * cache — the buyer directory included — into the browser's own IndexedDB under
 * one fixed key, so a return visit renders without refetching. Until Phase 13
 * nothing ever called `removeClient`, so that copy outlived the session that
 * produced it. Measured during Phase 6: 985,857 characters of one company's data
 * still present after the representative pressed the real Sign out button,
 * readable through developer tools by anyone with the browser profile on a shared
 * machine. Reproduction in docs/smoketests/phase-6-sponsor-request-guard.md
 * finding 4.
 *
 * Its one caller is the Sign out button in components/NavBar.tsx, which is the
 * only sign-out control in this app. ADDING A SECOND WAY TO SIGN OUT? Call this
 * from it. Nothing at the framework level will remind you, and the failure is
 * silent — the person appears signed out and their company's data is still there.
 *
 * WHAT THIS IS NOT. Phase 6's review round originally reported this as one
 * company's representative being shown another's data. That was measured across
 * five screens and did not reproduce: the next representative's data overwrote
 * the previous one's rather than being served to them. What is fixed here is data
 * left at rest on the client, not a display leak.
 *
 * ORDER MATTERS AT THE CALL SITE, and the reason is not obvious. The provider
 * writes on a throttle after any cache change, so a delete on its own can be
 * followed a moment later by a write of whatever is still in memory. The caller
 * therefore empties the in-memory cache FIRST and deletes SECOND: the worst a
 * late write can then store is an empty cache.
 */
export async function clearPersistedQueryCache(): Promise<void> {
  await persister.removeClient()
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,      // 5 minutes — data considered fresh
        gcTime: 30 * 60 * 1000,         // 30 minutes — keep in cache
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  }))

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: 30 * 60 * 1000 }}>
      {children}
    </PersistQueryClientProvider>
  )
}
