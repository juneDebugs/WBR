'use client'

import { CompanyDirectory } from '@/components/CompanyDirectory'
import { CompanyScheduleView } from '@/components/CompanyScheduleView'
import { CompanyMeetingSettings } from '@/components/CompanyMeetingSettings'

// Companies tab of the admin Meetings section. Navigation is URL-based so
// views are deep-linkable and browser back works: ?tab=companies&company=id
// opens a company's schedule, ?tab=companies&view=settings the meeting
// requirement settings (a Settings item in the Meetings tab bar), plain
// ?tab=companies the directory.
export default function CompanySchedulerClient({ sponsor, view }: { sponsor?: string; view?: string }) {
  if (sponsor) return <CompanyScheduleView sponsorId={sponsor} />
  if (view === 'settings') return <CompanyMeetingSettings />
  return <CompanyDirectory />
}
