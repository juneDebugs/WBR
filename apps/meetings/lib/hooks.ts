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

// ── Dashboard ────────────────────────────────────────────────────────
export function useDashboard() {
  return useQuery<any>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard')
      if (!res.ok) throw new Error('Failed to fetch dashboard')
      return res.json()
    },
    staleTime: 60 * 1000,
  })
}

export function useRecommendations() {
  return useQuery<{ heading: string; subheading: string; matches: any[] }>({
    queryKey: ['dashboard-recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/recommendations')
      if (!res.ok) throw new Error('Failed to fetch recommendations')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── My Requests page ─────────────────────────────────────────────────
export function useRequests() {
  return useQuery<any[]>({
    queryKey: ['requests'],
    queryFn: async () => {
      const res = await fetch('/api/requests')
      if (!res.ok) throw new Error('Failed to fetch requests')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Meetings page ────────────────────────────────────────────────────
export function useMeetings() {
  return useQuery<{ requests: any[]; sponsorMeetings: any[]; conflicts: any[] }>({
    queryKey: ['meetings'],
    queryFn: async () => {
      const res = await fetch('/api/meetings')
      if (!res.ok) throw new Error('Failed to fetch meetings')
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
