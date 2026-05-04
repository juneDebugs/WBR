import { getSession } from '@/lib/session'
import { SponsorBrowseView } from '@/components/SponsorBrowseView'

export default async function BrowsePage() {
  const session = await getSession()
  const user = session!.user as any

  // No SSR data fetch — client useAttendees() hook loads from TanStack Query cache instantly
  return (
    <SponsorBrowseView
      people={[]}
      sponsorId={user.sponsorId ?? null}
      isStaff={user.role === 'STAFF'}
      initialRequestedIds={[]}
    />
  )
}
