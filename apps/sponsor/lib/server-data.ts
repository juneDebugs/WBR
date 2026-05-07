import { unstable_cache } from 'next/cache'
import { prisma, getActiveConflicts } from '@conference/db'

// ── Attendees (browse page + recommendations) ────────────────────────
export const getCachedAttendees = unstable_cache(
  async () =>
    prisma.user.findMany({
      where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
      select: {
        id: true, name: true, image: true, company: true, jobTitle: true, bio: true,
        role: true, companySize: true, annualRevenue: true,
        solutionsOffering: true, solutionsSeeking: true, website: true, sponsorId: true,
      },
      orderBy: { name: 'asc' },
    }),
  ['sponsor-attendees'],
  { revalidate: 60, tags: ['attendees'] },
)

// ── Meetings data ────────────────────────────────────────────────────
export async function fetchMeetingsData(sponsorId: string | null) {
  if (!sponsorId) return { inbound: [], outbound: [], sponsorMeetings: [] }

  const [inbound, outbound, sponsorMeetings] = await Promise.all([
    prisma.meetingRequest.findMany({
      where: { targetSponsorId: sponsorId },
      include: {
        requester: { select: { id: true, name: true, image: true, company: true, jobTitle: true, email: true } },
        timeBlock: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.meetingRequest.findMany({
      where: {
        requester: { sponsorId },
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
      where: { sponsorId },
      include: {
        user: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
        timeBlock: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    inbound: JSON.parse(JSON.stringify(inbound)),
    outbound: JSON.parse(JSON.stringify(outbound)),
    sponsorMeetings: JSON.parse(JSON.stringify(sponsorMeetings)),
  }
}

// ── Sponsor data (dashboard) ─────────────────────────────────────────
export async function fetchSponsorData(userId: string, sponsorId: string | null) {
  if (!sponsorId) return { sponsor: null, stats: null, conflicts: [], requestedIds: [] }

  const [sponsor, pendingCount, confirmedCount, totalRequestCount, sponsorMeetingsCount, conflicts, requestedIds] = await Promise.all([
    prisma.sponsor.findUnique({
      where: { id: sponsorId },
      include: { users: { select: { id: true, name: true, image: true, jobTitle: true, email: true, role: true } } },
    }),
    prisma.meetingRequest.count({
      where: {
        status: 'PENDING',
        OR: [
          { targetSponsorId: sponsorId },
          { requester: { sponsorId }, targetSponsorId: null },
        ],
      },
    }),
    prisma.meetingRequest.count({
      where: {
        status: { in: ['CONFIRMED', 'APPROVED'] },
        OR: [
          { targetSponsorId: sponsorId },
          { requester: { sponsorId }, targetSponsorId: null },
        ],
      },
    }),
    prisma.meetingRequest.count({
      where: {
        OR: [
          { targetSponsorId: sponsorId },
          { requester: { sponsorId }, targetSponsorId: null },
        ],
      },
    }),
    prisma.sponsorMeeting.count({ where: { sponsorId } }),
    getActiveConflicts(prisma),
    prisma.meetingRequest.findMany({
      where: { requesterId: userId },
      select: { targetUserId: true },
    }),
  ])

  return {
    sponsor: JSON.parse(JSON.stringify(sponsor)),
    stats: {
      pendingCount,
      confirmedCount,
      totalMeetings: totalRequestCount + sponsorMeetingsCount,
    },
    conflicts,
    requestedIds: requestedIds.map(r => r.targetUserId).filter(Boolean),
  }
}
