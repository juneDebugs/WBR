export const revalidate = 15
import { prisma } from '@conference/db'
import { getSession } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import { AttendeesMeetingsView } from '@/components/meetings/AttendeesMeetingsView'
import { SponsorMeetingsView } from '@/components/meetings/SponsorMeetingsView'

async function declineRequest(formData: FormData) {
  'use server'
  const session = await getSession()
  if (!session?.user?.id) return
  const id = formData.get('id') as string
  const mr = await prisma.meetingRequest.findUnique({ where: { id }, select: { targetUserId: true } })
  if (!mr || mr.targetUserId !== session.user.id) return
  await prisma.meetingRequest.update({ where: { id }, data: { status: 'REJECTED' } })
  revalidatePath('/meetings')
}

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const authSession = (await getSession())!

  const userId = authSession.user.id
  const role = (authSession.user as any).role as string
  const { tab: rawTab } = await searchParams
  const tab = rawTab ?? 'upcoming'
  const now = new Date()

  // ── Sponsor view ──────────────────────────────────────────────────────────
  if (role === 'SPONSOR') {
    const sponsorId = (authSession.user as any).sponsorId as string | null

    if (!sponsorId) {
      return (
        <div className="page-container">
          <h1 className="text-2xl font-bold mb-2">Meetings</h1>
          <p className="text-sm text-gray-500">Your account isn't linked to a sponsor yet. Contact the organiser.</p>
        </div>
      )
    }

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

    return (
      <SponsorMeetingsView
        sponsor={sponsor!}
        upcoming={upcoming.map(m => ({
          id: m.id,
          startsAt: m.timeBlock.startsAt.toISOString(),
          endsAt: m.timeBlock.endsAt.toISOString(),
          location: m.timeBlock.location,
          notes: m.notes,
          attendee: m.user,
        }))}
        past={past.map(m => ({
          id: m.id,
          startsAt: m.timeBlock.startsAt.toISOString(),
          endsAt: m.timeBlock.endsAt.toISOString(),
          location: m.timeBlock.location,
          notes: m.notes,
          attendee: m.user,
        }))}
        inboundRequests={meetingRequests.map(r => ({
          id: r.id,
          status: r.status,
          message: r.message,
          requester: r.requester,
          timeBlock: r.timeBlock ? {
            startsAt: r.timeBlock.startsAt.toISOString(),
            endsAt: r.timeBlock.endsAt.toISOString(),
            location: r.timeBlock.location,
          } : null,
        }))}
        tab={tab}
      />
    )
  }

  // ── Attendee / Speaker view ───────────────────────────────────────────────
  const [meetings, incomingRequests] = await Promise.all([
    prisma.meeting.findMany({
      where: { OR: [{ attendeeAId: userId }, { attendeeBId: userId }], status: { not: 'CANCELLED' } },
      include: {
        timeBlock: { select: { startsAt: true, endsAt: true, location: true } },
        attendeeA: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
        attendeeB: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
      },
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

  const upcoming = meetings.filter(m => m.timeBlock.startsAt >= now)
  const past = meetings.filter(m => m.timeBlock.startsAt < now)

  return (
    <AttendeesMeetingsView
      upcoming={upcoming.map(m => ({
        id: m.id,
        status: m.status,
        startsAt: m.timeBlock.startsAt.toISOString(),
        endsAt: m.timeBlock.endsAt.toISOString(),
        location: m.timeBlock.location,
        other: m.attendeeAId === userId ? m.attendeeB : m.attendeeA,
      }))}
      past={past.map(m => ({
        id: m.id,
        status: m.status,
        startsAt: m.timeBlock.startsAt.toISOString(),
        endsAt: m.timeBlock.endsAt.toISOString(),
        location: m.timeBlock.location,
        other: m.attendeeAId === userId ? m.attendeeB : m.attendeeA,
      }))}
      incomingRequests={incomingRequests.map(r => ({
        id: r.id,
        message: r.message,
        requester: r.requester,
      }))}
      tab={tab}
      declineRequest={declineRequest}
    />
  )
}
