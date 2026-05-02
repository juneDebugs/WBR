import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { SponsorBrowseView } from '@/components/SponsorBrowseView'

const getCachedPeople = unstable_cache(
  async () =>
    prisma.user.findMany({
      where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
      select: {
        id: true, name: true, image: true, company: true, jobTitle: true, bio: true,
        role: true, companySize: true, annualRevenue: true,
        solutionsOffering: true, solutionsSeeking: true, website: true, sponsorId: true,
      },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ['sponsor-browse-people'],
  { revalidate: 120 },
)

const getCachedRequestedIds = unstable_cache(
  async (userId: string) => {
    const rows = await prisma.meetingRequest.findMany({
      where: { requesterId: userId },
      select: { targetUserId: true },
    })
    return rows.map(r => r.targetUserId).filter(Boolean) as string[]
  },
  ['sponsor-browse-requested'],
  { revalidate: 30 },
)

export default async function BrowsePage() {
  const session = await getSession()
  const user = session!.user as any

  const [people, requestedIds] = await Promise.all([
    getCachedPeople(),
    getCachedRequestedIds(user.id),
  ])

  return (
    <SponsorBrowseView
      people={people}
      sponsorId={user.sponsorId ?? null}
      isStaff={user.role === 'STAFF'}
      initialRequestedIds={requestedIds}
    />
  )
}
