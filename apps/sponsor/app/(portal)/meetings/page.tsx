export const revalidate = 0
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { SponsorMeetingsView } from '@/components/SponsorMeetingsView'

export default async function MeetingsPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const user = session.user as any

  let inbound: any[] = []
  let outbound: any[] = []
  let sponsorMeetings: any[] = []

  if (user.sponsorId) {
    ;[inbound, outbound, sponsorMeetings] = await Promise.all([
      prisma.meetingRequest.findMany({
        where: { targetSponsorId: user.sponsorId },
        include: {
          requester: { select: { id: true, name: true, image: true, company: true, jobTitle: true, email: true } },
          timeBlock: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.meetingRequest.findMany({
        where: {
          requester: { sponsorId: user.sponsorId },
          targetUserId: { not: null },
          targetSponsorId: null,
        },
        include: {
          targetUser: { select: { id: true, name: true, image: true, company: true, jobTitle: true, email: true } },
          timeBlock: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.sponsorMeeting.findMany({
        where: { sponsorId: user.sponsorId },
        include: {
          user: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
          timeBlock: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])
  }

  return (
    <SponsorMeetingsView
      inbound={JSON.parse(JSON.stringify(inbound))}
      outbound={JSON.parse(JSON.stringify(outbound))}
      sponsorMeetings={JSON.parse(JSON.stringify(sponsorMeetings))}
      sponsorId={user.sponsorId ?? null}
      isStaff={user.role === 'STAFF'}
    />
  )
}
