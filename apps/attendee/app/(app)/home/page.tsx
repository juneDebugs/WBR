import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'
import { HomeScreen } from '@/components/HomeScreen'

const getCachedConference = unstable_cache(
  async () => {
    const conf = await prisma.conference.findFirst({
      where: { active: true },
      select: { name: true, venue: true, venueLat: true, venueLon: true, venueTimezone: true, startDate: true, endDate: true, heroImageUrl: true, wifiName: true, wifiPassword: true },
    })
    if (!conf) return null
    return {
      ...conf,
      startDate: conf.startDate.toISOString(),
      endDate: conf.endDate.toISOString(),
    }
  },
  ['attendee-conference'],
  { revalidate: 300, tags: ['conference'] },
)

const getCachedSpeakers = unstable_cache(
  async () =>
    prisma.speaker.findMany({
      select: { id: true, name: true, photoUrl: true, company: true, jobTitle: true },
      take: 20,
    }),
  ['attendee-speakers'],
  { revalidate: 120, tags: ['speakers'] },
)

const getCachedSponsors = unstable_cache(
  async () =>
    prisma.sponsor.findMany({
      select: { id: true, name: true, logoUrl: true, tier: true, website: true },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
      take: 50,
    }),
  ['attendee-sponsors'],
  { revalidate: 120, tags: ['sponsors'] },
)

function getCachedUserHome(userId: string, sponsorId: string | null) {
  return unstable_cache(
    async () => {
      const now = new Date()
      const [user, meetingCount, sessionCount, sponsorMeetingCount, upcomingMeetings, upcomingSessionBookmarks] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, image: true, bio: true, company: true, jobTitle: true, website: true, sponsorId: true },
        }),
        prisma.meeting.count({
          where: { OR: [{ attendeeAId: userId }, { attendeeBId: userId }], status: { not: 'CANCELLED' } },
        }),
        prisma.sessionBookmark.count({ where: { userId } }),
        prisma.sponsorMeeting.count({
          where: {
            status: 'CONFIRMED',
            OR: [
              { userId },
              ...(sponsorId ? [{ sponsorId }] : []),
            ],
          },
        }),
        prisma.meeting.findMany({
          where: {
            OR: [{ attendeeAId: userId }, { attendeeBId: userId }],
            status: { not: 'CANCELLED' },
            timeBlock: { startsAt: { gte: now } },
          },
          orderBy: { timeBlock: { startsAt: 'asc' } },
          take: 5,
          include: {
            timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
            attendeeA: { select: { name: true, image: true } },
            attendeeB: { select: { name: true, image: true } },
          },
        }),
        prisma.sessionBookmark.findMany({
          where: { userId, session: { startsAt: { gte: now } } },
          orderBy: { session: { startsAt: 'asc' } },
          take: 5,
          include: { session: { select: { title: true, startsAt: true, endsAt: true, room: true, track: true, type: true } } },
        }),
      ])
      // Pre-serialise dates so callers don't need to handle Date→string from unstable_cache
      const serialisedMeetings = upcomingMeetings.map(m => ({
        ...m,
        timeBlock: {
          ...m.timeBlock,
          startsAt: m.timeBlock.startsAt.toISOString(),
          endsAt: m.timeBlock.endsAt.toISOString(),
        },
      }))
      const serialisedBookmarks = upcomingSessionBookmarks.map(b => ({
        ...b,
        session: {
          ...b.session,
          startsAt: b.session.startsAt.toISOString(),
          endsAt: b.session.endsAt.toISOString(),
        },
      }))
      return { user, meetingCount, sessionCount, sponsorMeetingCount, upcomingMeetings: serialisedMeetings, upcomingSessionBookmarks: serialisedBookmarks }
    },
    ['attendee-user-home', userId, sponsorId ?? '__none__'],
    { revalidate: 30, tags: [`user-home-${userId}`] },
  )()
}

export default async function HomePage() {
  const session = (await getSession())!

  const userId = (session.user as any).id as string
  const sponsorId = (session.user as any).sponsorId as string | null

  const [conference, speakers, sponsors, userData] = await Promise.all([
    getCachedConference(),
    getCachedSpeakers(),
    getCachedSponsors(),
    getCachedUserHome(userId, sponsorId),
  ])

  const { user, meetingCount, sessionCount, sponsorMeetingCount, upcomingMeetings, upcomingSessionBookmarks } = userData

  const totalMeetingCount = meetingCount + sponsorMeetingCount

  // Profile completion: count filled optional fields
  const fieldDefs: [unknown, string][] = [
    [user?.image,    'Photo'],
    [user?.bio,      'Bio'],
    [user?.company,  'Company'],
    [user?.jobTitle, 'Job title'],
    [user?.website,  'Website'],
    [user?.name,     'Name'],
  ]
  const filled = fieldDefs.filter(([v]) => v).length
  const profilePct = Math.round((filled / fieldDefs.length) * 100)
  const missingFields = fieldDefs.filter(([v]) => !v).map(([, label]) => label)

  // Merge meetings + bookmarked sessions into a single upcoming schedule
  const scheduleItems = [
    ...upcomingMeetings.map(m => {
      const other = m.attendeeAId === userId ? m.attendeeB : m.attendeeA
      return {
        id: m.id,
        type: 'meeting' as const,
        title: `1-on-1 with ${other.name ?? 'Someone'}`,
        startsAt: m.timeBlock.startsAt,
        endsAt: m.timeBlock.endsAt,
        location: m.timeBlock.location,
        otherName: other.name ?? null,
        otherImage: other.image ?? null,
        status: m.status,
        track: null,
      }
    }),
    ...upcomingSessionBookmarks.map(b => ({
      id: b.id,
      type: b.session.type.toLowerCase() as 'talk' | 'workshop' | 'keynote' | 'panel' | 'break',
      title: b.session.title,
      startsAt: b.session.startsAt,
      endsAt: b.session.endsAt,
      location: b.session.room ?? null,
      track: b.session.track ?? null,
      otherName: null,
      otherImage: null,
      status: undefined,
    })),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).slice(0, 2)


  return (
    <HomeScreen
      conference={conference ? {
        name: conference.name,
        venue: conference.venue,
        venueLat: conference.venueLat ?? null,
        venueLon: conference.venueLon ?? null,
        venueTimezone: conference.venueTimezone ?? null,
        startDate: conference.startDate,
        endDate: conference.endDate,
        heroImageUrl: conference.heroImageUrl ?? null,
        wifiName: conference.wifiName ?? null,
        wifiPassword: conference.wifiPassword ?? null,
      } : null}
      user={{ name: user?.name ?? null, image: user?.image ?? null, company: user?.company ?? null, jobTitle: user?.jobTitle ?? null }}
      meetingCount={totalMeetingCount}
      sessionCount={sessionCount}
      profilePct={profilePct}
      missingFields={missingFields}
      scheduleItems={scheduleItems}
      speakers={speakers}
      sponsors={sponsors}
    />
  )
}
