'use client'
import { useQuery } from '@tanstack/react-query'

export function useSessions() {
  return useQuery({ queryKey: ['sessions'], queryFn: () => fetch('/api/data/sessions').then(r => r.json()), staleTime: 60_000 })
}
export function useSpeakers() {
  return useQuery({ queryKey: ['speakers'], queryFn: () => fetch('/api/data/speakers').then(r => r.json()), staleTime: 60_000 })
}
export function useSponsors() {
  return useQuery({ queryKey: ['sponsors'], queryFn: () => fetch('/api/data/sponsors').then(r => r.json()), staleTime: 60_000 })
}
export function useAttendees() {
  return useQuery({ queryKey: ['attendees'], queryFn: () => fetch('/api/data/attendees').then(r => r.json()), staleTime: 300_000 })
}
export function useMeetingsData() {
  return useQuery({ queryKey: ['meetings'], queryFn: () => fetch('/api/data/meetings').then(r => r.json()), staleTime: 60_000 })
}
export function useDashboardStats() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => fetch('/api/data/dashboard').then(r => r.json()), staleTime: 120_000 })
}
export function useCalendarData() {
  return useQuery({ queryKey: ['calendar'], queryFn: () => fetch('/api/data/calendar').then(r => r.json()), staleTime: 120_000 })
}
export function useChatData() {
  return useQuery({ queryKey: ['chat'], queryFn: () => fetch('/api/data/chat').then(r => r.json()), staleTime: 120_000 })
}
export function useEmailData() {
  return useQuery({ queryKey: ['email'], queryFn: () => fetch('/api/data/email').then(r => r.json()), staleTime: 60_000 })
}
export function useAccessData() {
  return useQuery({ queryKey: ['access'], queryFn: () => fetch('/api/data/access').then(r => r.json()), staleTime: 60_000 })
}
