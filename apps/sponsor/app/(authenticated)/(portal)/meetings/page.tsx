import { getSession } from '@/lib/session'
import { SponsorMeetingsView } from '@/components/SponsorMeetingsView'

export default async function MeetingsPage() {
  const session = await getSession()
  const user = session!.user as any

  // No SSR data fetch — client useMeetingsData() hook loads from TanStack Query cache instantly
  return (
    <SponsorMeetingsView
      inbound={[]}
      outbound={[]}
      sponsorMeetings={[]}
      sponsorId={user.sponsorId ?? null}
      isStaff={user.role === 'STAFF'}
    />
  )
}
