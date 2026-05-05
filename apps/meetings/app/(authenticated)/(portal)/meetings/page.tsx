import { Suspense } from 'react'
import { unstable_cache } from 'next/cache'
import { getSession } from '@/lib/session'
import { prisma, getActiveConflicts } from '@conference/db'
import { MeetingsView } from '@/components/MeetingsView'

const meetingRequestInclude = {
  requester: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true } },
  targetUser: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true } },
  targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true, website: true } },
  timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } },
} as const

function getCachedUserMeetings(userId: string, sponsorId: string | null) {
  return unstable_cache(
    async () => {
      // Split OR into parallel index-targeted queries for SQLite performance
      const [byRequester, byTarget, bySponsor, sponsorMeetings] = await Promise.all([
        prisma.meetingRequest.findMany({
          where: { requesterId: userId },
          include: meetingRequestInclude,
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 200,
        }),
        prisma.meetingRequest.findMany({
          where: { targetUserId: userId },
          include: meetingRequestInclude,
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: 200,
        }),
        sponsorId
          ? prisma.meetingRequest.findMany({
              where: { targetSponsorId: sponsorId },
              include: meetingRequestInclude,
              orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
              take: 200,
            })
          : Promise.resolve([]),
        sponsorId
          ? prisma.sponsorMeeting.findMany({
              where: { sponsorId, status: 'CONFIRMED' },
              include: {
                user: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
                timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } },
                sponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
              },
              orderBy: { timeBlock: { startsAt: 'asc' } },
              take: 100,
            })
          : Promise.resolve([]),
      ])
      // Deduplicate and sort requests
      const seen = new Set<string>()
      const requests = [...byRequester, ...byTarget, ...bySponsor].filter(r => {
        if (seen.has(r.id)) return false
        seen.add(r.id)
        return true
      })
      requests.sort((a, b) => {
        if (a.status !== b.status) return a.status.localeCompare(b.status)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      return { requests: requests.slice(0, 200), sponsorMeetings }
    },
    ['meetings-user-meetings', userId],
    { revalidate: 60, tags: [`meetings-user-${userId}`] },
  )()
}

const getCachedConflicts = unstable_cache(
  async () => getActiveConflicts(prisma),
  ['meetings-active-conflicts'],
  { revalidate: 120 },
)

async function ConflictsBanner() {
  const conflicts = await getCachedConflicts()
  if (conflicts.length === 0) return null
  return (
    <div className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
      <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-red-800">
          {conflicts.length} presenter conflict{conflicts.length !== 1 ? 's' : ''} detected
        </p>
        <p className="text-xs text-red-600 mt-0.5">
          {conflicts.map(c => c.speakerName).join(', ')} {conflicts.length === 1 ? 'is' : 'are'} double-booked. Session schedule may change — check back for updates.
        </p>
      </div>
    </div>
  )
}

export default async function MeetingsPage() {
  const session = await getSession()
  const userId = (session!.user as any).id as string
  const sponsorId = (session!.user as any).sponsorId as string | null

  const { requests, sponsorMeetings } = await getCachedUserMeetings(userId, sponsorId)

  return (
    <>
      <Suspense fallback={null}>
        <ConflictsBanner />
      </Suspense>
      <MeetingsView
        requests={requests}
        sponsorMeetings={sponsorMeetings}
        currentUserId={userId}
        currentSponsorId={sponsorId}
      />
    </>
  )
}
