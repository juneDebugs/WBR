'use client'

import Link from 'next/link'
import { useMyScheduleData } from '@/lib/hooks'
import { MyScheduleView } from './MyScheduleView'
import MyScheduleLoading from '@/app/(authenticated)/(app)/my-schedule/loading'

export function MyScheduleClient() {
  const { data, isLoading } = useMyScheduleData()

  if (isLoading || !data) return <MyScheduleLoading />

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-1">
        <Link
          href="/schedule"
          className="w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center flex-shrink-0 shadow-sm"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold">My Schedule</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-11">Your saved sessions and confirmed meetings</p>
      <MyScheduleView items={data.items} />
    </div>
  )
}
