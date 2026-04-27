export const dynamic = 'force-dynamic'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@conference/db'
import { HomeScreen } from '@/components/HomeScreen'

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const userId = (session.user as any).id as string

  const now = new Date()

  const [conference, user, meetingCount, sessionCount, upcomingMeetings, upcomingSessionBookmarks, speakers, sponsors] = await Promise.all([
    prisma.conference.findFirst({ where: { active: true } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, image: true, bio: true, company: true, jobTitle: true, website: true, sponsorId: true },
    }),
    prisma.meeting.count({
      where: { OR: [{ attendeeAId: userId }, { attendeeBId: userId }], status: { not: 'CANCELLED' } },
    }),
    prisma.sessionBookmark.count({ where: { userId } }),
    prisma.meeting.findMany({
      where: {
        OR: [{ attendeeAId: userId }, { attendeeBId: userId }],
        status: { not: 'CANCELLED' },
        timeBlock: { startsAt: { gte: now } },
      },
      orderBy: { timeBlock: { startsAt: 'asc' } },
      take: 5,
      include: {
        timeBlock: true,
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
    prisma.speaker.findMany({
      select: { id: true, name: true, photoUrl: true, company: true, jobTitle: true },
      take: 20,
    }),
    prisma.sponsor.findMany({
      select: { id: true, name: true, logoUrl: true, tier: true, website: true },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    }),
  ])

  // Add sponsor meeting count
  const sponsorMeetingCount = await prisma.sponsorMeeting.count({
    where: {
      status: 'CONFIRMED',
      OR: [
        { userId },
        ...(user?.sponsorId ? [{ sponsorId: user.sponsorId }] : []),
      ],
    },
  })
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
        startsAt: m.timeBlock.startsAt.toISOString(),
        endsAt: m.timeBlock.endsAt.toISOString(),
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
      startsAt: b.session.startsAt.toISOString(),
      endsAt: b.session.endsAt.toISOString(),
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
        venueLat: conference.venueLat,
        venueLon: conference.venueLon,
        venueTimezone: conference.venueTimezone,
        startDate: conference.startDate.toISOString(),
        endDate: conference.endDate.toISOString(),
        heroImageUrl: conference.heroImageUrl,
        wifiName: conference.wifiName,
        wifiPassword: conference.wifiPassword,
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
