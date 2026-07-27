'use client'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import type { DirectoryRow, ScheduleMatrix } from '@conference/db'

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

// Invalidate everything the scheduler mutations can affect: the whole
// ['scheduler'] tree (directory + every matrix) and the Meetings tab data.
export function invalidateScheduler(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['scheduler'] })
  queryClient.invalidateQueries({ queryKey: ['meetings'] })
}
