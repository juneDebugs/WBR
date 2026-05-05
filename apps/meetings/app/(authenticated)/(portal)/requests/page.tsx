import { getUserFromHeaders } from '@/lib/user'
import { cached } from '@/lib/mem-cache'
import { prisma } from '@conference/db'
import { RequestsList } from '@/components/RequestsList'

const INCLUDE = {
  requester: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, role: true } },
  targetUser: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, role: true } },
  targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
  timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } },
} as const

function fetchUserRequests(userId: string, sponsorId: string | null) {
  return cached(`requests:${userId}`, 60_000, async () => {
    const [byRequester, byTarget, bySponsor] = await Promise.all([
      prisma.meetingRequest.findMany({
        where: { requesterId: userId },
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.meetingRequest.findMany({
        where: { targetUserId: userId },
        include: INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      sponsorId
        ? prisma.meetingRequest.findMany({
            where: { targetSponsorId: sponsorId },
            include: INCLUDE,
            orderBy: { createdAt: 'desc' },
            take: 200,
          })
        : Promise.resolve([]),
    ])
    const seen = new Set<string>()
    const all = [...byRequester, ...byTarget, ...bySponsor].filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return all.slice(0, 200)
  })
}

export default async function RequestsPage() {
  const user = await getUserFromHeaders()
  const requests = await fetchUserRequests(user.id, user.sponsorId)
  return <RequestsList requests={requests} currentUserId={user.id} />
}
