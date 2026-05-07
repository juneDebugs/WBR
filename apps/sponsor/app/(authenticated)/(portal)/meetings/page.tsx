import { getSession } from '@/lib/session'
import { SponsorMeetingsView } from '@/components/SponsorMeetingsView'
import { fetchMeetingsData } from '@/lib/server-data'

export default async function MeetingsPage() {
  const session = await getSession()
  const user = session!.user as any
  const sponsorId = user.sponsorId ?? null

  const data = await fetchMeetingsData(sponsorId)

  return (
    <SponsorMeetingsView
      inbound={data.inbound}
      outbound={data.outbound}
      sponsorMeetings={data.sponsorMeetings}
      sponsorId={sponsorId}
      isStaff={user.role === 'STAFF'}
    />
  )
}
