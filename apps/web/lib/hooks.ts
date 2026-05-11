'use client'
import { useQuery } from '@tanstack/react-query'

export function useSessions(initialData?: any) {
  return useQuery({ queryKey: ['sessions'], queryFn: () => fetch('/api/data/sessions').then(r => r.json()), staleTime: 60_000, initialData })
}
export function useSpeakers(initialData?: any) {
  return useQuery({ queryKey: ['speakers'], queryFn: () => fetch('/api/data/speakers').then(r => r.json()), staleTime: 60_000, initialData })
}
export function useSponsors(initialData?: any) {
  return useQuery({ queryKey: ['sponsors'], queryFn: () => fetch('/api/data/sponsors').then(r => r.json()), staleTime: 60_000, initialData })
}
export function useAttendees(initialData?: any) {
  return useQuery({ queryKey: ['attendees'], queryFn: () => fetch('/api/data/attendees').then(r => r.json()), staleTime: 300_000, initialData })
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
