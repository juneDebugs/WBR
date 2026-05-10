'use client'

import { usePrefetchAll } from '@/lib/hooks'

export function BackgroundPrefetch() {
  usePrefetchAll()
  return null
}
