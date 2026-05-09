export const revalidate = 30
import { getUserFromHeaders } from '@/lib/user'
import { redirect } from 'next/navigation'
import { prisma } from '@conference/db'
import { StaffQueue } from '@/components/StaffQueue'

export default async function StaffPage() {
  const user = await getUserFromHeaders()
  if (user.role !== 'STAFF') redirect('/browse')

  const [requests, timeBlocks] = await Promise.all([
    prisma.meetingRequest.findMany({
      include: {
        requester: { select: { id: true, name: true, email: true, image: true, company: true, role: true, sponsorId: true } },
        targetUser: { select: { id: true, name: true, email: true, image: true, company: true, role: true } },
        targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
        timeBlock: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.timeBlock.findMany({
      where: { conferenceId: 'conf-2025' },
      orderBy: { startsAt: 'asc' },
    }),
  ])

  return <StaffQueue requests={requests} timeBlocks={timeBlocks} />
}
