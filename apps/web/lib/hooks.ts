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
