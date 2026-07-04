'use client'
import { useQuery } from '@tanstack/react-query'
import type { AttendeesPage } from './attendees-query'
import type { AccessData } from './access-query'
import type { StaffPage } from './staff-query'

export function useSessions(initialData?: any) {
  return useQuery({ queryKey: ['sessions'], queryFn: () => fetch('/api/data/sessions').then(r => r.json()), staleTime: 60_000, initialData })
}
export function useSpeakers(initialData?: any) {
  return useQuery({ queryKey: ['speakers'], queryFn: () => fetch('/api/data/speakers').then(r => r.json()), staleTime: 60_000, initialData })
}
export function useSponsors(initialData?: any) {
  return useQuery({ queryKey: ['sponsors'], queryFn: () => fetch('/api/data/sponsors').then(r => r.json()), staleTime: 60_000, initialData })
}
export type AttendeesPageParams = { page: number; q: string; role: string }
export function useAttendeesPage(params: AttendeesPageParams, initialData?: AttendeesPage) {
  const search = new URLSearchParams()
  search.set('page', String(params.page))
  if (params.q) search.set('q', params.q)
  if (params.role) search.set('role', params.role)
  return useQuery<AttendeesPage>({
    queryKey: ['attendees', params],
    queryFn: () => fetch(`/api/data/attendees?${search.toString()}`).then(r => r.json()),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    ...(initialData && { initialData, initialDataUpdatedAt: Date.now() }),
  })
}
export function useMeetingsData(initialData?: any) {
  return useQuery({ queryKey: ['meetings'], queryFn: () => fetch('/api/data/meetings').then(r => r.json()), staleTime: 60_000, initialData })
}
export function useDashboardStats(initialData?: any) {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => fetch('/api/data/dashboard').then(r => r.json()), staleTime: 120_000, initialData })
}
export function useCalendarData(initialData?: any) {
  return useQuery({ queryKey: ['calendar'], queryFn: () => fetch('/api/data/calendar').then(r => r.json()), staleTime: 120_000, initialData })
}
export function useChatData(initialData?: any) {
  return useQuery({ queryKey: ['chat'], queryFn: () => fetch('/api/data/chat').then(r => r.json()), staleTime: 120_000, initialData })
}
export function useEmailData(initialData?: any) {
  return useQuery({ queryKey: ['email'], queryFn: () => fetch('/api/data/email').then(r => r.json()), staleTime: 60_000, initialData })
}
export type AccessDataParams = { page: number; q: string; scope: 'all' | 'admins' }
export function useAccessData(params: AccessDataParams, initialData?: AccessData) {
  const search = new URLSearchParams()
  search.set('page', String(params.page))
  if (params.q) search.set('q', params.q)
  if (params.scope !== 'all') search.set('scope', params.scope)
  return useQuery<AccessData>({
    queryKey: ['access', params],
    // Throw on non-2xx so an error-shaped body (e.g. a 401 after the JWT
    // expires) surfaces as a query error instead of resolving as data and
    // crashing the render when code reads `data.users.rows`.
    queryFn: async () => {
      const r = await fetch(`/api/data/access?${search.toString()}`)
      if (!r.ok) throw new Error(`Access data request failed: ${r.status}`)
      return r.json()
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    ...(initialData && { initialData, initialDataUpdatedAt: Date.now() }),
  })
}
export type StaffDataParams = { page: number; q: string }
export function useStaffData(params: StaffDataParams, initialData?: StaffPage) {
  const search = new URLSearchParams()
  search.set('page', String(params.page))
  if (params.q) search.set('q', params.q)
  return useQuery<StaffPage>({
    queryKey: ['staff', params],
    // Throw on non-2xx so an error body (e.g. a 401 after the JWT expires)
    // surfaces as a query error instead of crashing the render that reads rows.
    queryFn: async () => {
      const r = await fetch(`/api/data/staff?${search.toString()}`)
      if (!r.ok) throw new Error(`Staff data request failed: ${r.status}`)
      return r.json()
    },
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    ...(initialData && { initialData, initialDataUpdatedAt: Date.now() }),
  })
}
