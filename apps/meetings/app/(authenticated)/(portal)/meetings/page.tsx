import { getUserFromHeaders } from '@/lib/user'
import { MeetingsView } from '@/components/MeetingsView'

export default async function MeetingsPage() {
  const user = await getUserFromHeaders()
  return (
    <MeetingsView
      currentUserId={user.id}
      currentSponsorId={user.sponsorId}
    />
  )
}
