'use client'

import Link from 'next/link'
import { useDashboardStats } from '@/lib/hooks'
import { ConferenceBanner } from '@/components/ConferenceBanner'
import { SponsorReadinessClient } from '@/components/SponsorReadinessClient'

export function OverviewClient({ initialData }: { initialData?: any }) {
  const { data, isLoading } = useDashboardStats(initialData)

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-24 bg-fill rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white border border-hairline rounded-xl p-5">
              <div className="w-10 h-10 bg-fill rounded-lg animate-pulse mb-3" />
              <div className="h-4 w-20 bg-fill rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-48 bg-fill rounded-xl animate-pulse" />
      </div>
    )
  }

  const stats = [
    { label: 'Sessions', value: data.sessionCount, color: 'text-brand-700', bg: 'bg-brand-50', href: '/dashboard/sessions' },
    { label: 'Speakers', value: data.speakerCount, color: 'text-brand-700', bg: 'bg-brand-50', href: '/dashboard/speakers' },
    { label: 'Pending Meetings', value: data.pendingMeetings, color: 'text-warning-ink', bg: 'bg-warning-soft', href: '/dashboard/meetings' },
    { label: 'Attendees', value: data.attendeeCount, color: 'text-success-ink', bg: 'bg-success-soft', href: '/dashboard/attendees' },
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
            className="bg-white border border-hairline rounded-xl p-5 hover:border-primary/40 transition-colors">
            <div className={`w-10 h-10 ${stat.bg} rounded-lg flex items-center justify-center mb-3`}>
              <span className={`text-lg font-bold ${stat.color}`}>{stat.value}</span>
            </div>
            <p className="text-sm text-ink-2">{stat.label}</p>
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
