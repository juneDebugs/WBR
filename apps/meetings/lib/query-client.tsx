'use client'

import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { get, set, del } from 'idb-keyval'
import { useState } from 'react'

function createIdbPersister() {
  return {
    persistClient: async (client: any) => {
      await set('meetings-query-cache', client)
    },
    restoreClient: async () => {
      return await get('meetings-query-cache')
    },
    removeClient: async () => {
      await del('meetings-query-cache')
    },
  }
}

const persister = createIdbPersister()

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
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
