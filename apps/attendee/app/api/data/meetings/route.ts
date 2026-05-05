import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma } from '@conference/db'

function getCachedAttendeeMeetings(userId: string) {
  return unstable_cache(
    async () => {
      const now = new Date()
      const meetingInclude = {
        timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
        attendeeA: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
        attendeeB: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
      } as const

      const [meetingsAsA, meetingsAsB, incomingRequests] = await Promise.all([
        prisma.meeting.findMany({
          where: { attendeeAId: userId, status: { not: 'CANCELLED' } },
          include: meetingInclude,
          orderBy: { timeBlock: { startsAt: 'asc' } },
        }),
        prisma.meeting.findMany({
          where: { attendeeBId: userId, status: { not: 'CANCELLED' } },
          include: meetingInclude,
          orderBy: { timeBlock: { startsAt: 'asc' } },
        }),
        prisma.meetingRequest.findMany({
          where: { targetUserId: userId, status: 'PENDING' },
          include: {
            requester: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      const seenIds = new Set<string>()
      const meetings = [...meetingsAsA, ...meetingsAsB]
        .filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true })
        .sort((a, b) => new Date(a.timeBlock.startsAt).getTime() - new Date(b.timeBlock.startsAt).getTime())

      const upcoming = meetings.filter(m => m.timeBlock.startsAt >= now)
      const past = meetings.filter(m => m.timeBlock.startsAt < now)

      return {
        role: 'ATTENDEE' as const,
        upcoming: upcoming.map(m => ({
          id: m.id,
          status: m.status,
          startsAt: m.timeBlock.startsAt.toISOString(),
          endsAt: m.timeBlock.endsAt.toISOString(),
          location: m.timeBlock.location,
          other: m.attendeeAId === userId ? m.attendeeB : m.attendeeA,
        })),
        past: past.map(m => ({
          id: m.id,
          status: m.status,
          startsAt: m.timeBlock.startsAt.toISOString(),
          endsAt: m.timeBlock.endsAt.toISOString(),
          location: m.timeBlock.location,
          other: m.attendeeAId === userId ? m.attendeeB : m.attendeeA,
        })),
        incomingRequests: incomingRequests.map(r => ({
          id: r.id,
          message: r.message,
          requester: r.requester,
        })),
      }
    },
    ['attendee-meetings', userId],
    { revalidate: 30, tags: [`meetings-${userId}`] },
  )()
}

function getCachedSponsorMeetings(sponsorId: string) {
  return unstable_cache(
    async () => {
      const now = new Date()
      const [sponsor, sponsorMeetings, meetingRequests] = await Promise.all([
        prisma.sponsor.findUnique({
          where: { id: sponsorId },
          select: { id: true, name: true, logoUrl: true, tier: true },
        }),
        prisma.sponsorMeeting.findMany({
          where: { sponsorId, status: 'CONFIRMED' },
          include: {
            user: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
            timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
          },
          orderBy: { timeBlock: { startsAt: 'asc' } },
        }),
        prisma.meetingRequest.findMany({
          where: { targetSponsorId: sponsorId, status: { in: ['PENDING', 'APPROVED'] } },
          include: {
            requester: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
            timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ])

      const upcoming = sponsorMeetings.filter(m => m.timeBlock.startsAt >= now)
      const past = sponsorMeetings.filter(m => m.timeBlock.startsAt < now)

      return {
        role: 'SPONSOR' as const,
        sponsor,
        upcoming: upcoming.map(m => ({
          id: m.id,
          startsAt: m.timeBlock.startsAt.toISOString(),
          endsAt: m.timeBlock.endsAt.toISOString(),
          location: m.timeBlock.location,
          notes: m.notes,
          attendee: m.user,
        })),
        past: past.map(m => ({
          id: m.id,
          startsAt: m.timeBlock.startsAt.toISOString(),
          endsAt: m.timeBlock.endsAt.toISOString(),
          location: m.timeBlock.location,
          notes: m.notes,
          attendee: m.user,
        })),
        inboundRequests: meetingRequests.map(r => ({
          id: r.id,
          status: r.status,
          message: r.message,
          requester: r.requester,
          timeBlock: r.timeBlock ? {
            startsAt: r.timeBlock.startsAt.toISOString(),
            endsAt: r.timeBlock.endsAt.toISOString(),
            location: r.timeBlock.location,
          } : null,
        })),
      }
    },
    ['sponsor-meetings', sponsorId],
    { revalidate: 30, tags: [`sponsor-meetings-${sponsorId}`] },
  )()
}

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id as string
  const role = (session.user as any).role as string
  const sponsorId = (session.user as any).sponsorId as string | null

  if (role === 'SPONSOR' && sponsorId) {
    const data = await getCachedSponsorMeetings(sponsorId)
    return NextResponse.json(data)
  }

  if (role === 'SPONSOR') {
    return NextResponse.json({ role: 'SPONSOR', noSponsor: true })
  }

  const data = await getCachedAttendeeMeetings(userId)
  return NextResponse.json(data)
}
