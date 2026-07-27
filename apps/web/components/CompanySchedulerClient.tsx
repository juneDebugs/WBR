'use client'

import { CompanyDirectory } from '@/components/CompanyDirectory'
import { CompanyScheduleView } from '@/components/CompanyScheduleView'

// Companies tab of the admin Meetings section. Navigation between the
// directory and a company's schedule is URL-based (?tab=companies&company=id)
// so views are deep-linkable and browser back works.
export default function CompanySchedulerClient({ sponsor }: { sponsor?: string }) {
  if (!sponsor) return <CompanyDirectory />
  return <CompanyScheduleView sponsorId={sponsor} />
}
