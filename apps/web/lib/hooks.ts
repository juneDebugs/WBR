'use client'
import { useQuery } from '@tanstack/react-query'
import type { AttendeesPage } from './attendees-query'

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
export function useAccessData(initialData?: any) {
  return useQuery({ queryKey: ['access'], queryFn: () => fetch('/api/data/access').then(r => r.json()), staleTime: 60_000, initialData })
}
