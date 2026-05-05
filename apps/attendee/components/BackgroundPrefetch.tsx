'use client'

import { usePrefetchMeetings } from '@/lib/hooks'

export function BackgroundPrefetch() {
  usePrefetchMeetings()
  return null
}
