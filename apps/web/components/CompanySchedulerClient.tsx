'use client'

import { CompanyDirectory } from '@/components/CompanyDirectory'
import { CompanyScheduleView } from '@/components/CompanyScheduleView'
import { CompanyMeetingSettings } from '@/components/CompanyMeetingSettings'
import { MeetingTablesSettings } from '@/components/MeetingTablesSettings'

// Companies tab of the admin Meetings section. Navigation is URL-based so
// views are deep-linkable and browser back works: ?tab=companies&company=id
// opens a company's schedule, ?tab=companies&view=settings the meeting
// settings (a Settings item in the Meetings tab bar — meeting requirements,
// then the Meeting Tables section), plain ?tab=companies the directory.
export default function CompanySchedulerClient({ sponsor, view }: { sponsor?: string; view?: string }) {
  if (sponsor) return <CompanyScheduleView sponsorId={sponsor} />
  if (view === 'settings') {
    return (
      <div className="space-y-10">
        <CompanyMeetingSettings />
        <MeetingTablesSettings />
      </div>
    )
  }
  return <CompanyDirectory />
}
