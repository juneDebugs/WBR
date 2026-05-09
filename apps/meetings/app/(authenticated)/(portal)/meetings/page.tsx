import { getUserFromHeaders } from '@/lib/user'
import { MeetingsPortal } from '@/components/MeetingsPortal'

export default async function MeetingsPage() {
  const user = await getUserFromHeaders()
  return (
    <MeetingsPortal
      currentUserId={user.id}
      currentSponsorId={user.sponsorId}
      defaultSection="meetings"
    />
  )
}
