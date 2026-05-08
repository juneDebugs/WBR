import { getSession } from '@/lib/session'
import { SponsorBrowseView } from '@/components/SponsorBrowseView'

export default async function BrowsePage() {
  const session = await getSession()
  const user = session!.user as any

  return (
    <SponsorBrowseView
      sponsorId={user.sponsorId ?? null}
      isStaff={user.role === 'STAFF'}
    />
  )
}
