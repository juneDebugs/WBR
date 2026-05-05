import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { RequestsList } from '@/components/RequestsList'

const requestInclude = {
  requester: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, role: true } },
  targetUser: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true, role: true } },
  targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
  timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } },
} as const

function getCachedUserRequests(userId: string, sponsorId: string | null) {
  return unstable_cache(
    async () => {
      // Split OR into parallel index-targeted queries for SQLite performance
      const [byRequester, byTarget, bySponsor] = await Promise.all([
        prisma.meetingRequest.findMany({
          where: { requesterId: userId },
          include: requestInclude,
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        prisma.meetingRequest.findMany({
          where: { targetUserId: userId },
          include: requestInclude,
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
        sponsorId
          ? prisma.meetingRequest.findMany({
              where: { targetSponsorId: sponsorId },
              include: requestInclude,
              orderBy: { createdAt: 'desc' },
              take: 200,
            })
          : Promise.resolve([]),
      ])
      // Deduplicate (a request could match multiple conditions) and sort
      const seen = new Set<string>()
      const all = [...byRequester, ...byTarget, ...bySponsor].filter(r => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      return all.slice(0, 200)
    },
    ['meetings-user-requests', userId],
    { revalidate: 60, tags: [`meetings-user-${userId}`] },
  )()
}

export default async function RequestsPage() {
  const session = await getSession()
  const userId = (session!.user as any).id as string
  const sponsorId = (session!.user as any).sponsorId as string | null

  const requests = await getCachedUserRequests(userId, sponsorId)

  return <RequestsList requests={requests} currentUserId={userId} />
}
