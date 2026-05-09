'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Non-blocking prefetch: fires on portal mount, warms React Query cache
 * for meetings data so navigating to Meetings/Requests is instant.
 * Does NOT block page rendering — runs in the background.
 */
export function DataPrefetch() {
  const qc = useQueryClient()
  useEffect(() => {
    qc.prefetchQuery({
      queryKey: ['meetings'],
      queryFn: () => fetch('/api/meetings').then(r => r.json()),
      staleTime: 5 * 60 * 1000,
    })
  }, [qc])
  return null
}
