export const revalidate = 120
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { BrowseView } from '@/components/BrowseView'

export default async function BrowsePage() {
  const session = await getSession()
  const userId = (session!.user as any).id as string

  const [myRequests, sponsors, people] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: { requesterId: userId, status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
      select: { targetSponsorId: true, targetUserId: true },
    }),
    prisma.sponsor.findMany({
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
      include: {
        users: {
          select: { id: true, name: true, jobTitle: true, image: true, role: true },
          where: { id: { not: userId } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: 'ATTENDEE', id: { not: userId }, sponsorId: null },
      select: {
        id: true, name: true, email: true, image: true, company: true,
        jobTitle: true, role: true, bio: true, companySize: true,
        annualRevenue: true, solutionsOffering: true, solutionsSeeking: true,
        website: true,
      },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ])
  const requestedSponsorIds = Array.from(new Set(myRequests.map(r => r.targetSponsorId).filter(Boolean) as string[]))
  const requestedUserIds = Array.from(new Set(myRequests.map(r => r.targetUserId).filter(Boolean) as string[]))

  return (
    <BrowseView
      mode="attendee-browsing-sponsors"
      people={people}
      sponsors={sponsors}
      requestedUserIds={requestedUserIds}
      requestedSponsorIds={requestedSponsorIds}
    />
  )
}
