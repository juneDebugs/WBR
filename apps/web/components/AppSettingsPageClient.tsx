'use client'

import { useQuery } from '@tanstack/react-query'
import { AppSettingsForm } from '@/components/AppSettingsForm'

export function AppSettingsPageClient({ initialData }: { initialData?: any }) {
  const { data, isLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: () => fetch('/api/data/app-settings').then(r => r.json()),
    staleTime: 60_000,
    initialData,
  })

  if (isLoading || data === undefined) {
    return (
      <div className="max-w-3xl space-y-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-full bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  if (!data) {
    return <p className="text-gray-500">No active conference found.</p>
  }

  return <AppSettingsForm conference={data} />
}
