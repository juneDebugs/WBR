'use client'
import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

async function safeFetch(url: string) {
  const r = await fetch(url)
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`${url} ${r.status}: ${body.slice(0, 200)}`)
  }
  return r.json()
}

export function useHomeData() {
  return useQuery({ queryKey: ['home-data'], queryFn: () => safeFetch('/api/data/home'), staleTime: 30_000 })
}
export function useSpeakersData(initialData?: { speakers: any[]; count: number }) {
  return useQuery<{ speakers: any[]; count: number }>({
    queryKey: ['speakers-data'],
    queryFn: () => safeFetch('/api/data/speakers'),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    ...(initialData && { initialData, initialDataUpdatedAt: Date.now() }),
  })
}
export function useScheduleData() {
  return useQuery({ queryKey: ['schedule-data'], queryFn: () => safeFetch('/api/data/schedule'), staleTime: 300_000 })
}
export function useMeetingsData() {
  return useQuery({ queryKey: ['meetings-data'], queryFn: () => safeFetch('/api/data/meetings'), staleTime: 30_000 })
}
export function usePeopleData() {
  return useQuery({ queryKey: ['people-data'], queryFn: () => safeFetch('/api/data/people'), staleTime: 30_000 })
}
export function useChatData() {
  return useQuery({ queryKey: ['chat-data'], queryFn: () => safeFetch('/api/data/chat'), staleTime: 30_000 })
}
export function useMyScheduleData() {
  return useQuery({ queryKey: ['my-schedule-data'], queryFn: () => safeFetch('/api/data/my-schedule'), staleTime: 30_000 })
}
export function useSetupData() {
  return useQuery({ queryKey: ['setup-data'], queryFn: () => safeFetch('/api/data/setup'), staleTime: 60_000 })
}

export function usePrefetchAll() {
  const qc = useQueryClient()
  useEffect(() => {
    qc.prefetchQuery({ queryKey: ['meetings-data'], queryFn: () => safeFetch('/api/data/meetings'), staleTime: 30_000 })
    qc.prefetchQuery({ queryKey: ['home-data'], queryFn: () => safeFetch('/api/data/home'), staleTime: 30_000 })
    qc.prefetchQuery({ queryKey: ['schedule-data'], queryFn: () => safeFetch('/api/data/schedule'), staleTime: 300_000 })
    qc.prefetchQuery({ queryKey: ['speakers-data'], queryFn: () => safeFetch('/api/data/speakers'), staleTime: 5_000 })
    qc.prefetchQuery({ queryKey: ['people-data'], queryFn: () => safeFetch('/api/data/people'), staleTime: 30_000 })
    qc.prefetchQuery({ queryKey: ['chat-data'], queryFn: () => safeFetch('/api/data/chat'), staleTime: 30_000 })
    qc.prefetchQuery({ queryKey: ['my-schedule-data'], queryFn: () => safeFetch('/api/data/my-schedule'), staleTime: 30_000 })
    qc.prefetchQuery({ queryKey: ['setup-data'], queryFn: () => safeFetch('/api/data/setup'), staleTime: 60_000 })
  }, [qc])
}
