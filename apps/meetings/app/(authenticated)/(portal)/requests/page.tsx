import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { RequestsList } from '@/components/RequestsList'

function getCachedUserRequests(userId: string, sponsorId: string | null) {
  return unstable_cache(
    async () => prisma.meetingRequest.findMany({
      where: {
        OR: [
          { requesterId: userId },
          { targetUserId: userId },
          ...(sponsorId ? [{ targetSponsorId: sponsorId }] : []),
        ],
      },
      include: {
        requester: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, role: true } },
        targetUser: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, role: true } },
        targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
        timeBlock: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    ['meetings-user-requests', userId],
    { revalidate: 30, tags: [`meetings-user-${userId}`] },
  )()
}

export default async function RequestsPage() {
  const session = await getSession()
  const userId = (session!.user as any).id as string
  const sponsorId = (session!.user as any).sponsorId as string | null

  const requests = await getCachedUserRequests(userId, sponsorId)

  return <RequestsList requests={requests} currentUserId={userId} />
}
