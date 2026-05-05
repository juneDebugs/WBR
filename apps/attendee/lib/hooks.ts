'use client'
import { useQuery } from '@tanstack/react-query'

export function useHomeData() {
  return useQuery({ queryKey: ['home-data'], queryFn: () => fetch('/api/data/home').then(r => r.json()), staleTime: 30_000 })
}
export function useSpeakersData() {
  return useQuery({ queryKey: ['speakers-data'], queryFn: () => fetch('/api/data/speakers').then(r => r.json()), staleTime: 60_000 })
}
export function useScheduleData() {
  return useQuery({ queryKey: ['schedule-data'], queryFn: () => fetch('/api/data/schedule').then(r => r.json()), staleTime: 300_000 })
}
export function useMeetingsData() {
  return useQuery({ queryKey: ['meetings-data'], queryFn: () => fetch('/api/data/meetings').then(r => r.json()), staleTime: 30_000 })
}
