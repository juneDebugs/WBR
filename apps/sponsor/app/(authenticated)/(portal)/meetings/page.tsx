import { getSession } from '@/lib/session'
import { SponsorMeetingsView } from '@/components/SponsorMeetingsView'

export default async function MeetingsPage() {
  const session = await getSession()
  const user = session!.user as any

  return (
    <SponsorMeetingsView
      sponsorId={user.sponsorId ?? null}
      isStaff={user.role === 'STAFF'}
    />
  )
}
