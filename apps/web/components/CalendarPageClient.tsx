'use client'

import { useCalendarData } from '@/lib/hooks'
import { CalendarClient } from '@/components/CalendarClient'

export function CalendarPageClient({ initialData }: { initialData?: any }) {
  const { data, isLoading } = useCalendarData(initialData)

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-9 w-28 bg-gray-200 rounded-lg animate-pulse" />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 h-[600px] animate-pulse bg-gray-50" />
      </div>
    )
  }

  return (
    <CalendarClient
      events={data.events}
      confStartDate={data.confStartDate}
      confEndDate={data.confEndDate}
    />
  )
}
