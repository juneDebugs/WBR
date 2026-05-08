import { getSession } from '@/lib/session'
import { MeetingsView } from '@/components/MeetingsView'

export default async function MeetingsPage() {
  const session = await getSession()
  const user = session!.user as any
  return (
    <MeetingsView
      currentUserId={user.id}
      currentSponsorId={user.sponsorId ?? null}
    />
  )
}
