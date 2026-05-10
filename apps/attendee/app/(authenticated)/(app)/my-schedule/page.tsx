export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { MyScheduleView } from '@/components/my-schedule/MyScheduleView'

export default async function MySchedulePage() {
  const session = (await getSession())!

  const userId = session.user!.id
  const sponsorId = (session.user as any).sponsorId as string | null

  const [bookmarks, sponsorMeetings, peerRequests] = await Promise.all([
    prisma.sessionBookmark.findMany({
      where: { userId },
      include: {
        session: {
          select: { id: true, title: true, track: true, room: true, type: true, startsAt: true, endsAt: true, speaker: { select: { name: true, company: true } } },
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
        sponsor: { select: { name: true, tier: true } },
        user: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
        timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
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
        timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
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
    const isRequester = r.requesterId === userId
    const otherUser = isRequester ? r.targetUser : r.requester
    // When the target is a sponsor (not a user), use sponsor info
    const otherSponsor = isRequester ? r.targetSponsor : null
    const otherName = otherUser?.name ?? otherSponsor?.name ?? 'Attendee'
    return {
      id: r.id,
      type: 'peer' as const,
      title: `1-1 with ${otherName}`,
      otherId: otherUser?.id ?? null,
      otherName,
      otherCompany: otherUser?.company ?? null,
      otherJobTitle: otherUser?.jobTitle ?? null,
      otherImage: otherUser?.image ?? null,
      notes: null as string | null,
      location: r.timeBlock!.location,
      startsAt: r.timeBlock!.startsAt.toISOString(),
      endsAt: r.timeBlock!.endsAt.toISOString(),
    }
  })

  return (
    <div className="page-container">
      <div className="flex items-center gap-3 mb-1">
        <a
          href="/schedule"
          className="w-8 h-8 rounded-full bg-white/80 backdrop-blur flex items-center justify-center flex-shrink-0 shadow-sm"
        >
          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 className="text-2xl font-bold">My Schedule</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6 ml-11">Your saved sessions and confirmed meetings</p>
      <MyScheduleView items={[...sessions, ...sponsorItems, ...peerItems]} />
    </div>
  )
}
