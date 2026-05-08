'use client'

import { useQuery } from '@tanstack/react-query'

// ── Browse: sponsors list ─────────────────────────────────────────────
export function useBrowseSponsors() {
  return useQuery<any[]>({
    queryKey: ['browse-sponsors'],
    queryFn: async () => {
      const res = await fetch('/api/browse/sponsors')
      if (!res.ok) throw new Error('Failed to fetch sponsors')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Browse: people list ───────────────────────────────────────────────
export function useBrowsePeople() {
  return useQuery<any[]>({
    queryKey: ['browse-people'],
    queryFn: async () => {
      const res = await fetch('/api/browse/people')
      if (!res.ok) throw new Error('Failed to fetch people')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Browse: user's existing meeting requests ──────────────────────────
export function useBrowseRequests() {
  return useQuery<{ sponsorIds: string[]; userIds: string[] }>({
    queryKey: ['browse-requests'],
    queryFn: async () => {
      const res = await fetch('/api/browse/requests')
      if (!res.ok) throw new Error('Failed to fetch requests')
      return res.json()
    },
    staleTime: 30 * 1000,
  })
}
