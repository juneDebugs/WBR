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

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,      // 5 minutes — data considered fresh
        gcTime: 30 * 60 * 1000,         // 30 minutes — keep in cache
        refetchOnWindowFocus: true,      // Refresh when user returns to tab
        refetchOnReconnect: true,        // Refresh when network returns
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
