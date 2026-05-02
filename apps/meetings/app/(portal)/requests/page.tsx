export const revalidate = 0
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { RequestsList } from '@/components/RequestsList'

export default async function RequestsPage() {
  const session = await getSession()
  const userId = (session!.user as any).id as string
  const sponsorId = (session!.user as any).sponsorId as string | null

  const requests = await prisma.meetingRequest.findMany({
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
  })

  return <RequestsList requests={requests} currentUserId={userId} />
}
