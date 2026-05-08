import { getUserFromHeaders } from '@/lib/user'
import { SponsorMeetingsView } from '@/components/SponsorMeetingsView'

export default async function MeetingsPage() {
  const user = await getUserFromHeaders()
  return (
    <SponsorMeetingsView
      sponsorId={user.sponsorId}
      isStaff={user.role === 'STAFF'}
    />
  )
}
