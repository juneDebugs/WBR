import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { BrowseView } from '@/components/BrowseView'

const getCachedSponsors = unstable_cache(
  async () =>
    prisma.sponsor.findMany({
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
      include: {
        users: {
          select: { id: true, name: true, jobTitle: true, image: true, role: true },
        },
      },
    }),
  ['meetings-browse-sponsors'],
  { revalidate: 120 },
)

const getCachedPeople = unstable_cache(
  async () =>
    prisma.user.findMany({
      where: { role: 'ATTENDEE', sponsorId: null },
      select: {
        id: true, name: true, email: true, image: true, company: true,
        jobTitle: true, role: true, bio: true, companySize: true,
        annualRevenue: true, solutionsOffering: true, solutionsSeeking: true,
        website: true,
      },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ['meetings-browse-people'],
  { revalidate: 120 },
)

const getCachedRequests = unstable_cache(
  async (userId: string) => {
    const rows = await prisma.meetingRequest.findMany({
      where: { requesterId: userId, status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
      select: { targetSponsorId: true, targetUserId: true },
    })
    return {
      sponsorIds: [...new Set(rows.map(r => r.targetSponsorId).filter(Boolean) as string[])],
      userIds: [...new Set(rows.map(r => r.targetUserId).filter(Boolean) as string[])],
    }
  },
  ['meetings-browse-requests'],
  { revalidate: 30 },
)

export default async function BrowsePage() {
  const session = await getSession()
  const userId = (session!.user as any).id as string

  const [sponsors, people, requests] = await Promise.all([
    getCachedSponsors(),
    getCachedPeople(),
    getCachedRequests(userId),
  ])

  return (
    <BrowseView
      mode="attendee-browsing-sponsors"
      people={people.filter(p => p.id !== userId)}
      sponsors={sponsors.map(s => ({ ...s, users: s.users.filter(u => u.id !== userId) }))}
      requestedUserIds={requests.userIds}
      requestedSponsorIds={requests.sponsorIds}
    />
  )
}
