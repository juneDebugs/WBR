import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const user = session.user as any
  if (!user.sponsorId) {
    return NextResponse.json({ inbound: [], outbound: [], sponsorMeetings: [] })
  }

  const [inbound, outbound, sponsorMeetings] = await Promise.all([
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

  return NextResponse.json({
    inbound: JSON.parse(JSON.stringify(inbound)),
    outbound: JSON.parse(JSON.stringify(outbound)),
    sponsorMeetings: JSON.parse(JSON.stringify(sponsorMeetings)),
  })
}
