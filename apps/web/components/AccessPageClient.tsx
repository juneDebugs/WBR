'use client'

import { useAccessData } from '@/lib/hooks'
import { AccessClient } from '@/components/AccessClient'

export function AccessPageClient() {
  const { data, isLoading } = useAccessData()

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-48 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-9 h-9 bg-gray-100 rounded-full animate-pulse" />
              <div className="flex-1 space-y-1">
                <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
                <div className="h-3 w-24 bg-gray-50 rounded animate-pulse" />
              </div>
              <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return <AccessClient users={data} />
}
