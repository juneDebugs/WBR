'use client'

import Link from 'next/link'
import { useDashboardStats } from '@/lib/hooks'
import { ConferenceBanner } from '@/components/ConferenceBanner'
import { SponsorReadinessClient } from '@/components/SponsorReadinessClient'

export function OverviewClient() {
  const { data, isLoading } = useDashboardStats()

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="w-10 h-10 bg-gray-100 rounded-lg animate-pulse mb-3" />
              <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-48 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    )
  }

  const stats = [
    { label: 'Sessions', value: data.sessionCount, color: 'text-blue-600', bg: 'bg-blue-50', href: '/dashboard/sessions' },
    { label: 'Speakers', value: data.speakerCount, color: 'text-purple-600', bg: 'bg-purple-50', href: '/dashboard/speakers' },
    { label: 'Pending Meetings', value: data.pendingMeetings, color: 'text-yellow-600', bg: 'bg-yellow-50', href: '/dashboard/meetings' },
    { label: 'Attendees', value: data.attendeeCount, color: 'text-green-600', bg: 'bg-green-50', href: '/dashboard/attendees' },
  ]

  return (
    <>
      {data.conference && (
        <ConferenceBanner
          id={data.conference.id}
          name={data.conference.name}
          venue={data.conference.venue}
          startDate={data.conference.startDate}
          endDate={data.conference.endDate}
        />
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-primary/40 transition-colors">
            <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center mb-3`}>
              <span className={`text-lg font-bold ${stat.color}`}>{stat.value}</span>
            </div>
            <p className="text-sm text-gray-600">{stat.label}</p>
          </Link>
        ))}
      </div>

      {data.sponsorReadiness && (
        <div className="mt-6">
          <SponsorReadinessClient
            sponsors={data.sponsorReadiness.sponsors}
            metrics={data.sponsorReadiness.metrics}
          />
        </div>
      )}
    </>
  )
}
