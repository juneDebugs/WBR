import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'
import { requireCompleteProfile } from '@/lib/require-complete-profile'

export async function GET() {
  const user = await getUserFromHeaders()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reading is gated too: a delegate whose required set is incomplete is
  // refused here, not only at the screens. Blocking every screen while
  // leaving the data behind them readable is not a block.
  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const userId = user.id
  const sponsorId = user.sponsorId

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
      // Prefer the sponsor meeting's own assigned table ("Table N") over the
      // generic time-block slot label; fall back when unassigned/legacy.
      location: m.location ?? m.timeBlock.location,
      startsAt: m.timeBlock.startsAt.toISOString(),
      endsAt: m.timeBlock.endsAt.toISOString(),
    }
  })

  const peerItems = peerRequests.map(r => {
    const isRequester = r.requesterId === userId
    const otherUser = isRequester ? r.targetUser : r.requester
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

  return NextResponse.json({
    items: [...sessions, ...sponsorItems, ...peerItems],
  })
}
