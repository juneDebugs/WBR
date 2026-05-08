import { getUserFromHeaders } from '@/lib/user'
import { SponsorBrowseView } from '@/components/SponsorBrowseView'

export default async function BrowsePage() {
  const user = await getUserFromHeaders()
  return (
    <SponsorBrowseView
      sponsorId={user.sponsorId}
      isStaff={user.role === 'STAFF'}
    />
  )
}
