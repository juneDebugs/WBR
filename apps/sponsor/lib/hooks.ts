'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'

// ── Attendees (browse page + recommendations) ──────────────────────────
export function useAttendees() {
  return useQuery<any[]>({
    queryKey: ['attendees'],
    queryFn: async () => {
      const res = await fetch('/api/attendees')
      if (!res.ok) throw new Error('Failed to fetch attendees')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Meetings data (meetings page + schedule + dashboard) ───────────────
export function useMeetingsData() {
  return useQuery<{
    inbound: any[]
    outbound: any[]
    sponsorMeetings: any[]
  }>({
    queryKey: ['meetings-data'],
    queryFn: async () => {
      const res = await fetch('/api/meetings-data')
      if (!res.ok) throw new Error('Failed to fetch meetings')
      return res.json()
    },
    staleTime: 30 * 1000, // 30s — meetings change more often
    refetchInterval: 60 * 1000, // Auto-refresh every 60s
    refetchIntervalInBackground: false, // Only when tab visible
  })
}

// ── Sponsor data (dashboard + profile) ─────────────────────────────────
export function useSponsorData() {
  return useQuery<{
    sponsor: any
    stats: { pendingCount: number; confirmedCount: number; totalMeetings: number } | null
    conflicts: any[]
    requestedIds: string[]
  }>({
    queryKey: ['sponsor-data'],
    queryFn: async () => {
      const res = await fetch('/api/sponsor-data')
      if (!res.ok) throw new Error('Failed to fetch sponsor data')
      return res.json()
    },
    staleTime: 60 * 1000,
  })
}

// ── Submission forms (submissions page) ───────────────────────────────
export function useSubmissionForms() {
  return useQuery<any[]>({
    queryKey: ['submission-forms'],
    queryFn: async () => {
      const res = await fetch('/api/submissions')
      if (!res.ok) throw new Error('Failed to fetch forms')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Teammates (submissions page) ──────────────────────────────────────
export function useTeammates() {
  return useQuery<any[]>({
    queryKey: ['teammates'],
    queryFn: async () => {
      const res = await fetch('/api/profile/teammates')
      if (!res.ok) throw new Error('Failed to fetch teammates')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ── Invalidation helpers ───────────────────────────────────────────────
export function useInvalidate() {
  const qc = useQueryClient()
  return {
    meetings: () => qc.invalidateQueries({ queryKey: ['meetings-data'] }),
    sponsor: () => qc.invalidateQueries({ queryKey: ['sponsor-data'] }),
    attendees: () => qc.invalidateQueries({ queryKey: ['attendees'] }),
    all: () => qc.invalidateQueries(),
  }
}
