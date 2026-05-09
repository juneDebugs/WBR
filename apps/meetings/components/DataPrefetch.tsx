'use client'

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'

/**
 * Fires ONE request on portal mount that loads ALL data for the app.
 * Populates dashboard + meetings caches in a single roundtrip.
 * Non-blocking — runs in background, doesn't delay page render.
 */
export function DataPrefetch() {
  const qc = useQueryClient()
  useEffect(() => {
    // Skip if both caches already have fresh data
    const hasDashboard = qc.getQueryData(['dashboard'])
    const hasMeetings = qc.getQueryData(['meetings'])
    if (hasDashboard && hasMeetings) return

    fetch('/api/bootstrap')
      .then(r => r.json())
      .then(({ dashboard, meetings }) => {
        if (dashboard) qc.setQueryData(['dashboard'], dashboard)
        if (meetings) qc.setQueryData(['meetings'], meetings)
      })
      .catch(() => {}) // silent — individual hooks will fetch on their own if this fails
  }, [qc])
  return null
}
