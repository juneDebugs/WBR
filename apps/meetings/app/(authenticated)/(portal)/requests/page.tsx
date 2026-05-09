import { getUserFromHeaders } from '@/lib/user'
import { MeetingsPortal } from '@/components/MeetingsPortal'

export default async function RequestsPage() {
  const user = await getUserFromHeaders()
  return (
    <MeetingsPortal
      currentUserId={user.id}
      currentSponsorId={user.sponsorId}
      defaultSection="requests"
    />
  )
}
