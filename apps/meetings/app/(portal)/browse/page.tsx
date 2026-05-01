export const revalidate = 120
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { BrowseView } from '@/components/BrowseView'

export default async function BrowsePage() {
  const session = await getServerSession(authOptions)
  const userId = (session!.user as any).id as string

  const [myRequests, sponsors] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: { requesterId: userId, status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
      select: { targetSponsorId: true },
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
  ])
  const requestedSponsorIds = Array.from(new Set(myRequests.map(r => r.targetSponsorId).filter(Boolean) as string[]))

  return (
    <BrowseView
      mode="attendee-browsing-sponsors"
      people={[]}
      sponsors={sponsors}
      requestedUserIds={[]}
      requestedSponsorIds={requestedSponsorIds}
    />
  )
}
