'use client'

import Link from 'next/link'
import { CompanyDirectory } from '@/components/CompanyDirectory'
import { CompanyScheduleView } from '@/components/CompanyScheduleView'
import { CompanyMeetingSettings } from '@/components/CompanyMeetingSettings'

// Companies tab of the admin Meetings section. Navigation is URL-based so
// views are deep-linkable and browser back works: ?tab=companies&company=id
// opens a company's schedule, ?tab=companies&view=settings the meeting
// requirement settings, plain ?tab=companies the directory.
export default function CompanySchedulerClient({ sponsor, view }: { sponsor?: string; view?: string }) {
  if (sponsor) return <CompanyScheduleView sponsorId={sponsor} />

  const section = view === 'settings' ? 'settings' : 'directory'
  return (
    <div>
      <nav aria-label="Companies sections" className="mb-4">
        <div className="segmented inline-flex">
          <Link
            href="?tab=companies"
            aria-current={section === 'directory' ? 'page' : undefined}
            className={`segmented-item min-h-[44px] ${section === 'directory' ? 'active' : ''}`}
          >
            Directory
          </Link>
          <Link
            href="?tab=companies&view=settings"
            aria-current={section === 'settings' ? 'page' : undefined}
            className={`segmented-item min-h-[44px] ${section === 'settings' ? 'active' : ''}`}
          >
            Settings
          </Link>
        </div>
      </nav>
      {section === 'settings' ? <CompanyMeetingSettings /> : <CompanyDirectory />}
    </div>
  )
}
