import { unstable_cache } from 'next/cache'
import { prisma, getActiveConflicts } from '@conference/db'
import { staffRosterWhere, STAFF_ROSTER_ORDER_BY } from '@conference/db/src/staff-roster'

// ── WBR staff roster ("Your Team at WBR 2027") ───────────────────────
// The same list the Admin app's Staff page shows — membership semantics live
// in the shared packages/db/src/staff-roster.ts. The roster is identical for
// every sponsor, so it's cached like the attendees list above.
// scripts/test-sponsor-team.mjs guards the mapping end-to-end.
const getCachedStaff = unstable_cache(
  async () =>
    prisma.user.findMany({
      where: staffRosterWhere(),
      orderBy: STAFF_ROSTER_ORDER_BY,
      select: { id: true, name: true, image: true, jobTitle: true, company: true, email: true, role: true },
    }),
  ['sponsor-staff'],
  { revalidate: 60, tags: ['staff'] },
)

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
  if (!sponsorId) return { sponsor: null, staff: [], stats: null, conflicts: [], requestedIds: [] }

  const [sponsor, staff, pendingCount, confirmedCount, totalRequestCount, sponsorMeetingsCount, conflicts, requestedIds] = await Promise.all([
    prisma.sponsor.findUnique({
      where: { id: sponsorId },
      include: { users: { select: { id: true, name: true, image: true, jobTitle: true, email: true, role: true } } },
    }),
    getCachedStaff(),
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
    staff,
    stats: {
      pendingCount,
      confirmedCount,
      totalMeetings: totalRequestCount + sponsorMeetingsCount,
    },
    conflicts,
    requestedIds: requestedIds.map(r => r.targetUserId).filter(Boolean),
  }
}
