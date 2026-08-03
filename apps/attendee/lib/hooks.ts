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
/**
 * The venue's maps and their markers.
 *
 * ── Why the five-minute stale time went ──────────────────────────────────────
 *
 * It used to be 300_000, with the note "a floor plan changes when an organizer
 * edits it, which is rare, and never on its own". That was correct when it was
 * written: at the end of Phase 8 the maps were seeded, nothing in the product
 * could write them, and the organizer's tools did not exist.
 *
 * Two changes removed that premise. Phase 9 moved each exhibiting company's
 * tagline, website, logo, stand number and offerings into this payload, so it
 * now carries data a representative edits from the sponsor portal — finding
 * F-13. Phase 10 gives organizers upload, reorder and delete. The map went from
 * unable-to-change to one of the more frequently written things in the system,
 * and this number never followed.
 *
 * ── Three settings, doing three different jobs ───────────────────────────────
 *
 * staleTime 30_000 — opening the screen after half a minute fetches fresh data
 * rather than showing a copy up to five minutes old.
 *
 * refetchOnWindowFocus — the app disables this globally in query-provider.tsx.
 * Overridden here alone, so a delegate returning to the app sees the current map
 * instead of what was true when they left it.
 *
 * refetchInterval 30_000 — the safety net, and it is deliberately slow. The fast
 * path is the push in useFloorPlanLiveUpdates below; this only covers a phone
 * that never heard it, which happens when the hosting platform runs more than
 * one copy of the participant app and the notification reached a different one.
 * See lib/floor-plan-events.ts for why that is not fixable inside this app.
 *
 * The cost is affordable only because of Phase 10 itself: the map response is
 * 6,678 bytes measured, down from 44,696 with one uploaded map, because F-14
 * moved the pictures to their own address. Refetching a few kilobytes on a
 * screen a delegate opens occasionally is not worth economising on.
 */
export function useFloorPlanData() {
  return useQuery({
    queryKey: ['map-data'],
    queryFn: () => safeFetch('/api/data/map'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  })
}

/**
 * Listen for the server saying the venue map changed, and refetch when it does.
 *
 * The phone holds one connection open to /api/data/map/stream and waits. When an
 * organizer uploads, reorders or deletes a map — or a company edits details that
 * appear on a booth card — the server writes a line down it and this refetches.
 * The delegate does nothing and the map updates in front of them.
 *
 * Only the fact of a change crosses the connection, never the data. The refetch
 * goes through the same gated, cached address the screen always uses, so there
 * is no second place deciding what a delegate may see.
 *
 * EventSource reconnects by itself when a connection drops, so there is no
 * reconnection logic here. A refetch on reconnect is deliberate: whatever was
 * missed while it was disconnected is picked up immediately rather than waiting
 * for the timer above.
 *
 * Call this from the map screen only. Mounting it elsewhere would hold a
 * connection open for a delegate who is not looking at a map.
 */
export function useFloorPlanLiveUpdates() {
  const qc = useQueryClient()
  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return

    const source = new EventSource('/api/data/map/stream')

    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['map-data'] })
    }

    source.addEventListener('floor-plan', refresh)

    // `open` fires on the first connection and on every reconnection after a
    // drop. Refetching here closes the window where a change happened while the
    // phone was asleep, in a tunnel, or between networks.
    source.addEventListener('open', refresh)

    // No handler for 'error': EventSource retries on its own, and logging every
    // transient network blip would fill the console on a conference wireless
    // network without anybody being able to act on it. A connection that stays
    // down is covered by refetchInterval above.

    return () => {
      source.removeEventListener('floor-plan', refresh)
      source.removeEventListener('open', refresh)
      source.close()
    }
  }, [qc])
}

export function usePrefetchAll() {
  const qc = useQueryClient()
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Defer fan-out until after the browser's `load` event so the nine
    // prefetches don't compete with the current page's critical query for
    // bandwidth or Prisma connection during the LCP window. After load,
    // schedule via `requestIdleCallback` (or fall back to setTimeout for
    // Safari < 16.4) so the work runs when the main thread is genuinely idle.
    const run = () => {
      qc.prefetchQuery({ queryKey: ['meetings-data'], queryFn: () => safeFetch('/api/data/meetings'), staleTime: 30_000 })
      qc.prefetchQuery({ queryKey: ['home-data'], queryFn: () => safeFetch('/api/data/home'), staleTime: 30_000 })
      qc.prefetchQuery({ queryKey: ['schedule-data'], queryFn: () => safeFetch('/api/data/schedule'), staleTime: 300_000 })
      qc.prefetchQuery({ queryKey: ['speakers-data'], queryFn: () => safeFetch('/api/data/speakers'), staleTime: 5_000 })
      qc.prefetchQuery({ queryKey: ['people-data'], queryFn: () => safeFetch('/api/data/people'), staleTime: 30_000 })
      qc.prefetchQuery({ queryKey: ['chat-data'], queryFn: () => safeFetch('/api/data/chat'), staleTime: 30_000 })
      qc.prefetchQuery({ queryKey: ['my-schedule-data'], queryFn: () => safeFetch('/api/data/my-schedule'), staleTime: 30_000 })
      qc.prefetchQuery({ queryKey: ['setup-data'], queryFn: () => safeFetch('/api/data/setup'), staleTime: 60_000 })
      qc.prefetchQuery({ queryKey: ['map-data'], queryFn: () => safeFetch('/api/data/map'), staleTime: 300_000 })
    }

    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (typeof window.requestIdleCallback === 'function') {
        // 10s timeout is a safety net for pages that never reach true idle
        // (e.g. polling background work). Still well outside the LCP window.
        idleId = window.requestIdleCallback(run, { timeout: 10_000 })
      } else {
        timeoutId = setTimeout(run, 0)
      }
    }

    let onLoad: (() => void) | undefined
    if (document.readyState === 'complete') {
      schedule()
    } else {
      onLoad = () => schedule()
      window.addEventListener('load', onLoad, { once: true })
    }

    return () => {
      if (onLoad) window.removeEventListener('load', onLoad)
      if (idleId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }, [qc])
}
