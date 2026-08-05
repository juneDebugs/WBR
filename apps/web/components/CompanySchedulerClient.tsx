'use client'

import dynamic from 'next/dynamic'
import { CompanyDirectory } from '@/components/CompanyDirectory'

// The directory is the landing view (kept static to avoid a load flash); the
// schedule and settings views are lazy-loaded since only one renders at a time.
const ViewSkeleton = () => <div className="h-64 rounded-xl bg-fill-2 animate-pulse" />
const CompanyScheduleView = dynamic(
  () => import('@/components/CompanyScheduleView').then(m => m.CompanyScheduleView),
  { loading: ViewSkeleton },
)
const CompanyMeetingSettings = dynamic(
  () => import('@/components/CompanyMeetingSettings').then(m => m.CompanyMeetingSettings),
  { loading: ViewSkeleton },
)

// Companies tab of the admin Meetings section. Navigation is URL-based so
// views are deep-linkable and browser back works: ?tab=companies&company=id
// opens a company's schedule, ?tab=companies&view=settings the meeting
// settings (a Settings item in the Meetings tab bar — meeting requirements),
// plain ?tab=companies the directory.
export default function CompanySchedulerClient({ sponsor, view }: { sponsor?: string; view?: string }) {
  if (sponsor) return <CompanyScheduleView sponsorId={sponsor} />
  if (view === 'settings') {
    return (
      <div className="space-y-10">
        <CompanyMeetingSettings />
      </div>
    )
  }
  return <CompanyDirectory />
}
