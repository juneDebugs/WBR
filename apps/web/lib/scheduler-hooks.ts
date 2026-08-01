'use client'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { DirectoryRow, ScheduleMatrix, CheckInBoard, AutoMatchBoard, MeetingRequirementSettings, TableBoard, SponsorTableBoard, MeetingLog } from '@conference/db'

// React Query hooks for the admin Companies scheduler tab. Both throw on
// non-2xx so an error-shaped body (e.g. a 401 after the JWT expires) surfaces
// as a query error instead of resolving as data and crashing the render.
export function useCompanyDirectory() {
  return useQuery<DirectoryRow[]>({
    queryKey: ['scheduler', 'companies'],
    queryFn: async () => {
      const r = await fetch('/api/admin/scheduler/companies')
      if (!r.ok) throw new Error(`Company directory request failed: ${r.status}`)
      return r.json()
    },
    staleTime: 30_000,
  })
}

export function useCompanySchedule(sponsorId: string) {
  return useQuery<ScheduleMatrix>({
    queryKey: ['scheduler', 'matrix', sponsorId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/scheduler/companies/${encodeURIComponent(sponsorId)}`)
      if (!r.ok) throw new Error(`Company schedule request failed: ${r.status}`)
      return r.json()
    },
    staleTime: 15_000,
  })
}

// On-site floor check-in board. Short staleTime + refetchInterval: several
// floor managers tick arrivals concurrently, so the grid should converge
// without manual refreshes while staying cheap (one aggregate query).
export function useCheckInBoard(enabled = true) {
  return useQuery<CheckInBoard>({
    queryKey: ['scheduler', 'checkin'],
    queryFn: async () => {
      const r = await fetch('/api/admin/scheduler/checkin')
      if (!r.ok) throw new Error(`Check-in board request failed: ${r.status}`)
      return r.json()
    },
    enabled,
    staleTime: 5_000,
    refetchInterval: 30_000,
  })
}

// Mutual Best Fit auto-matches. Picks land from two different portals, so the
// board polls on the check-in cadence to surface new matches without reloads.
export function useAutoMatchBoard() {
  return useQuery<AutoMatchBoard>({
    queryKey: ['scheduler', 'auto'],
    queryFn: async () => {
      const r = await fetch('/api/admin/scheduler/auto')
      if (!r.ok) throw new Error(`Auto-match board request failed: ${r.status}`)
      return r.json()
    },
    staleTime: 5_000,
    refetchInterval: 30_000,
  })
}

// Admin-configurable meeting requirements plus the sponsor roster the Settings
// panel needs for its per-company override rows.
export type SettingsSponsor = { id: string; name: string; logoUrl: string | null; tier: string }
export type MeetingRequirementView = MeetingRequirementSettings & { sponsors: SettingsSponsor[] }

export function useMeetingRequirementSettings() {
  return useQuery<MeetingRequirementView>({
    queryKey: ['scheduler', 'settings'],
    queryFn: async () => {
      const r = await fetch('/api/admin/scheduler/settings')
      if (!r.ok) throw new Error(`Meeting requirement settings request failed: ${r.status}`)
      return r.json()
    },
    staleTime: 30_000,
  })
}

// Meeting-table inventory + conference-wide assignment board for the Meeting
// Tables section of Meetings → Settings.
export function useTableBoard() {
  return useQuery<TableBoard>({
    queryKey: ['scheduler', 'tables'],
    queryFn: async () => {
      const r = await fetch('/api/admin/scheduler/tables')
      if (!r.ok) throw new Error(`Meeting tables request failed: ${r.status}`)
      return r.json()
    },
    staleTime: 15_000,
  })
}

// Per-sponsor meeting-table board for the Meeting Tables section of Meetings →
// Settings — one slot per sponsor with its logo, name and unique table number.
export function useSponsorTables() {
  return useQuery<SponsorTableBoard>({
    queryKey: ['scheduler', 'sponsor-tables'],
    queryFn: async () => {
      const r = await fetch('/api/admin/scheduler/sponsor-tables')
      if (!r.ok) throw new Error(`Sponsor tables request failed: ${r.status}`)
      return r.json()
    },
    staleTime: 15_000,
  })
}

// Consolidated internal-notes feed (Meetings → Log). Notes land from several
// portals (admin edits, floor check-in, cross-app request messages), so the
// feed polls on the shared board cadence to surface new notes without reloads.
export function useMeetingsLog(enabled = true) {
  return useQuery<MeetingLog>({
    queryKey: ['scheduler', 'log'],
    queryFn: async () => {
      const r = await fetch('/api/admin/scheduler/log')
      if (!r.ok) throw new Error(`Meetings log request failed: ${r.status}`)
      return r.json()
    },
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
}

// Invalidate everything the scheduler mutations can affect: the whole
// ['scheduler'] tree (directory + every matrix + requirement settings) and the
// Meetings tab data.
export function invalidateScheduler(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['scheduler'] })
  queryClient.invalidateQueries({ queryKey: ['meetings'] })
}
