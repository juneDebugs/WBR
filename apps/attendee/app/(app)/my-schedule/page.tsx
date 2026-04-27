export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { MyScheduleView } from '@/components/my-schedule/MyScheduleView'

export default async function MySchedulePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const sponsorId = (session.user as any).sponsorId as string | null

  const [bookmarks, sponsorMeetings, peerRequests] = await Promise.all([
    prisma.sessionBookmark.findMany({
      where: { userId },
      include: {
        session: {
          include: { speaker: true },
        },
      },
      orderBy: { session: { startsAt: 'asc' } },
    }),
    // Sponsor meetings: show if user is the attendee OR if user is a sponsor rep
    prisma.sponsorMeeting.findMany({
      where: {
        status: 'CONFIRMED',
        OR: [
          { userId },
          ...(sponsorId ? [{ sponsorId }] : []),
        ],
      },
      include: {
        sponsor: true,
        user: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
        timeBlock: true,
      },
      orderBy: { timeBlock: { startsAt: 'asc' } },
    }),
    // Confirmed peer meetings from the Meeting Portal
    prisma.meetingRequest.findMany({
      where: {
        status: 'CONFIRMED',
        timeBlockId: { not: null },
        OR: [
          { requesterId: userId },
          { targetUserId: userId },
          ...(sponsorId ? [{ targetSponsorId: sponsorId }] : []),
        ],
      },
      include: {
        requester: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
        targetUser: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
        targetSponsor: { select: { id: true, name: true, tier: true } },
        timeBlock: true,
      },
      orderBy: { timeBlock: { startsAt: 'asc' } },
    }),
  ])

  const sessions = bookmarks.map(b => ({
    id: b.session.id,
    type: 'session' as const,
    title: b.session.title,
    track: b.session.track,
    room: b.session.room,
    sessionType: b.session.type,
    startsAt: b.session.startsAt.toISOString(),
    endsAt: b.session.endsAt.toISOString(),
    speaker: b.session.speaker
      ? { name: b.session.speaker.name, company: b.session.speaker.company }
      : null,
  }))

  const sponsorItems = sponsorMeetings.map(m => {
    // If user is a sponsor rep, show the attendee name; otherwise show the sponsor name
    const isSponsorRep = sponsorId && m.sponsorId === sponsorId && m.userId !== userId
    const title = isSponsorRep
      ? `1-1 with ${m.user?.name ?? 'Attendee'}`
      : `1-1 with ${m.sponsor.name}`
    return {
      id: m.id,
      type: 'sponsor' as const,
      title,
      sponsorName: m.sponsor.name,
      sponsorTier: m.sponsor.tier,
      notes: m.notes,
      location: m.timeBlock.location,
      startsAt: m.timeBlock.startsAt.toISOString(),
      endsAt: m.timeBlock.endsAt.toISOString(),
    }
  })

  const peerItems = peerRequests.map(r => {
    const other = r.requesterId === userId ? r.targetUser : r.requester
    return {
      id: r.id,
      type: 'peer' as const,
      title: `1-1 with ${other?.name ?? 'Attendee'}`,
      otherId: other?.id ?? null,
      otherName: other?.name ?? 'Unknown',
      otherCompany: other?.company ?? null,
      otherJobTitle: other?.jobTitle ?? null,
      otherImage: other?.image ?? null,
      notes: null as string | null,
      location: r.timeBlock!.location,
      startsAt: r.timeBlock!.startsAt.toISOString(),
      endsAt: r.timeBlock!.endsAt.toISOString(),
    }
  })

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold mb-1">My Schedule</h1>
      <p className="text-sm text-gray-500 mb-6">Your saved sessions and confirmed meetings</p>
      <MyScheduleView items={[...sessions, ...sponsorItems, ...peerItems]} />
    </div>
  )
}
