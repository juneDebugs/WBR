'use client'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

export function useHomeData() {
  return useQuery({ queryKey: ['home-data'], queryFn: () => fetch('/api/data/home').then(r => r.json()), staleTime: 30_000 })
}
export function useSpeakersData(initialData?: { speakers: any[]; count: number }) {
  return useQuery<{ speakers: any[]; count: number }>({
    queryKey: ['speakers-data'],
    queryFn: () => fetch('/api/data/speakers').then(r => r.json()),
    staleTime: 5_000,
    ...(initialData && { initialData, initialDataUpdatedAt: Date.now() }),
  })
}
export function useScheduleData() {
  return useQuery({ queryKey: ['schedule-data'], queryFn: () => fetch('/api/data/schedule').then(r => r.json()), staleTime: 300_000 })
}
export function useMeetingsData() {
  return useQuery({ queryKey: ['meetings-data'], queryFn: () => fetch('/api/data/meetings').then(r => r.json()), staleTime: 30_000 })
}

export function usePrefetchMeetings() {
  const qc = useQueryClient()
  useEffect(() => {
    qc.prefetchQuery({ queryKey: ['meetings-data'], queryFn: () => fetch('/api/data/meetings').then(r => r.json()), staleTime: 30_000 })
  }, [qc])
}
