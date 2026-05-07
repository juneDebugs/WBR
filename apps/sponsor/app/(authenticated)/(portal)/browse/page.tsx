import { getSession } from '@/lib/session'
import { SponsorBrowseView } from '@/components/SponsorBrowseView'
import { getCachedAttendees, fetchSponsorData } from '@/lib/server-data'

export default async function BrowsePage() {
  const session = await getSession()
  const user = session!.user as any
  const sponsorId = user.sponsorId ?? null

  const [people, sponsorData] = await Promise.all([
    getCachedAttendees(),
    fetchSponsorData(user.id, sponsorId),
  ])

  return (
    <SponsorBrowseView
      people={people}
      sponsorId={sponsorId}
      isStaff={user.role === 'STAFF'}
      initialRequestedIds={sponsorData.requestedIds as string[]}
    />
  )
}
