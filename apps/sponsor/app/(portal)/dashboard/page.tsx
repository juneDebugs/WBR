export const revalidate = 15
import { Suspense } from 'react'
import { getSession } from '@/lib/session'
import { prisma, getActiveConflicts } from '@conference/db'
import Link from 'next/link'

import { RecommendedAttendees } from '@/components/RecommendedAttendees'
import { TeamMembers } from '@/components/TeamMembers'

function parseArr(val: string | null | undefined): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

function completeness(sponsor: any): { score: number; missing: string[] } {
  const fields: [string, string][] = [
    ['tagline', 'Tagline'],
    ['description', 'Description'],
    ['logoUrl', 'Logo'],
    ['heroImageUrl', 'Hero image'],
    ['website', 'Website'],
    ['contactName', 'Contact name'],
    ['contactEmail', 'Contact email'],
    ['contactPhone', 'Phone'],
    ['companySize', 'Company size'],
    ['annualRevenue', 'Annual revenue'],
    ['founded', 'Founded year'],
    ['headquarters', 'Headquarters'],
    ['boothNumber', 'Booth number'],
    ['socialLinkedIn', 'LinkedIn'],
    ['socialTwitter', 'Twitter / X'],
    ['solutionsOffering', 'Solutions offering'],
    ['solutionsSeeking', 'Solutions seeking'],
    ['targetIndustries', 'Target industries'],
  ]
  const missing = fields.filter(([k]) => !sponsor[k]).map(([, label]) => label)
  const score = Math.round(((fields.length - missing.length) / fields.length) * 100)
  return { score, missing }
}

function matchAttendees(sponsor: any) {
  const sponsorOffering = parseArr(sponsor.solutionsOffering)
  const sponsorSeeking = parseArr(sponsor.solutionsSeeking)
  const sponsorTargetIndustries = parseArr(sponsor.targetIndustries)
  return [...sponsorOffering, ...sponsorSeeking, ...sponsorTargetIndustries]
}

function scoreAttendees(attendees: any[], sponsorSignals: string[]) {
  const results: {
    id: string; name: string; image: string | null; company: string | null; jobTitle: string | null;
    matchScore: number; matchedTags: string[]; allTags: string[]
  }[] = []

  for (const a of attendees) {
    const attendeeTags = [...new Set([...parseArr(a.solutionsSeeking), ...parseArr(a.solutionsOffering)])]
    if (attendeeTags.length < 2) continue
    const matched = sponsorSignals.filter(s => attendeeTags.some(t => t === s))
    if (matched.length === 0) continue
    const score = Math.round((matched.length / Math.max(sponsorSignals.length, attendeeTags.length)) * 100)
    results.push({
      id: a.id, name: a.name ?? 'Attendee', image: a.image, company: a.company, jobTitle: a.jobTitle,
      matchScore: Math.min(score, 99),
      matchedTags: [...new Set(matched)],
      allTags: [...new Set(attendeeTags)],
    })
  }

  results.sort((a, b) => b.matchScore - a.matchScore)
  return results.slice(0, 12)
}

/** Async server component streamed via Suspense — keeps main dashboard render fast */
async function RecommendedAttendeesAsync({ sponsorId, sponsorSignals }: { sponsorId: string; sponsorSignals: string[] }) {
  if (sponsorSignals.length === 0) return null
  const attendees = await prisma.user.findMany({
    where: {
      role: { in: ['ATTENDEE', 'SPEAKER'] },
      sponsorId: null,
      NOT: [
        { solutionsSeeking: null },
        { solutionsSeeking: '' },
        { solutionsSeeking: '[]' },
        { solutionsOffering: null },
        { solutionsOffering: '' },
        { solutionsOffering: '[]' },
      ],
    },
    select: { id: true, name: true, image: true, company: true, jobTitle: true, solutionsSeeking: true, solutionsOffering: true },
    take: 200,
  })
  const recommended = scoreAttendees(attendees, sponsorSignals)
  if (recommended.length === 0) return null
  return <RecommendedAttendees attendees={recommended} sponsorId={sponsorId} />
}

export default async function DashboardPage() {
  const session = await getSession()
  const user = session!.user as any

  let sponsor: any = null
  let pendingCount = 0
  let confirmedCount = 0
  let totalMeetings = 0
  let recentRequests: any[] = []
  let conflicts: any[] = []

  if (user.sponsorId) {
    // Phase 1: Get sponsor data first (needed for attendee matching signals)
    sponsor = await prisma.sponsor.findUnique({
      where: { id: user.sponsorId },
      include: { users: { select: { id: true, name: true, image: true, jobTitle: true, email: true, role: true } } },
    })

    // Phase 2: ALL remaining queries in parallel
    const [inboundRequests, pendingCountResult, confirmedCountResult, totalRequestCount, sponsorMeetings, conflictsResult] = await Promise.all([
      prisma.meetingRequest.findMany({
        where: { targetSponsorId: user.sponsorId },
        include: {
          requester: { select: { id: true, name: true, image: true, company: true, jobTitle: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.meetingRequest.count({
        where: {
          status: 'PENDING',
          OR: [
            { targetSponsorId: user.sponsorId },
            { requester: { sponsorId: user.sponsorId }, targetSponsorId: null },
          ],
        },
      }),
      prisma.meetingRequest.count({
        where: {
          status: { in: ['CONFIRMED', 'APPROVED'] },
          OR: [
            { targetSponsorId: user.sponsorId },
            { requester: { sponsorId: user.sponsorId }, targetSponsorId: null },
          ],
        },
      }),
      prisma.meetingRequest.count({
        where: {
          OR: [
            { targetSponsorId: user.sponsorId },
            { requester: { sponsorId: user.sponsorId }, targetSponsorId: null },
          ],
        },
      }),
      prisma.sponsorMeeting.count({ where: { sponsorId: user.sponsorId } }),
      getActiveConflicts(prisma),
    ])

    recentRequests = inboundRequests
    pendingCount = pendingCountResult
    confirmedCount = confirmedCountResult
    totalMeetings = totalRequestCount + sponsorMeetings
    conflicts = conflictsResult
  }

  const profile = completeness(sponsor ?? {})
  const sponsorSignals = sponsor ? matchAttendees(sponsor) : []

  const stats = [
    { label: 'Total Requests', value: totalMeetings, color: 'text-primary', bg: 'bg-primary/10', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Pending', value: pendingCount, color: 'text-amber-600', bg: 'bg-amber-50', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Confirmed', value: confirmedCount, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Profile Score', value: `${profile.score}%`, color: profile.score >= 80 ? 'text-emerald-600' : 'text-amber-600', bg: profile.score >= 80 ? 'bg-emerald-50' : 'bg-amber-50', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      {/* Conflict alert */}
      {conflicts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-red-800">
              {conflicts.length} presenter scheduling conflict{conflicts.length !== 1 ? 's' : ''} detected
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              {conflicts.map(c => c.speakerName).join(', ')} {conflicts.length === 1 ? 'is' : 'are'} double-booked in overlapping sessions. Contact the conference organizer to resolve.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {user.role === 'STAFF' ? 'Staff Dashboard' : `Welcome back, ${user.name?.split(' ')[0] ?? 'Sponsor'}`}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {sponsor?.name ?? 'WBR'} · Sponsor Portal
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="card p-5">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <svg className={`w-5 h-5 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} />
              </svg>
            </div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recommended Attendees — streamed via Suspense so stats render instantly */}
      {sponsor && sponsorSignals.length > 0 && (
        <Suspense fallback={
          <div>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
                <div className="h-3.5 w-72 bg-gray-100 rounded animate-pulse mt-1.5" />
              </div>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex-shrink-0 w-52 bg-white border border-gray-100 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-gray-200 animate-pulse" />
                  </div>
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mx-auto" />
                  <div className="h-3 w-32 bg-gray-100 rounded animate-pulse mx-auto" />
                  <div className="h-8 bg-gray-200 rounded-xl animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        }>
          <RecommendedAttendeesAsync sponsorId={user.sponsorId} sponsorSignals={sponsorSignals} />
        </Suspense>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Profile completeness */}
        {sponsor && (
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Profile Completeness</h2>
              <Link href="/profile" className="text-xs text-primary hover:underline">Edit profile →</Link>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full transition-all"
                style={{ width: `${profile.score}%`, background: profile.score >= 80 ? '#10b981' : '#f59e0b' }}
              />
            </div>
            <p className="text-sm text-gray-600">{profile.score}% complete</p>
            {profile.missing.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Missing fields:</p>
                <ul className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {profile.missing.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs text-amber-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Recent meeting requests */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Meeting Requests</h2>
            <Link href="/meetings" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-gray-400">No meeting requests yet.</p>
          ) : (
            <div className="space-y-3">
              {recentRequests.map(r => (
                <div key={r.id} className="flex items-center gap-3">
                  {r.requester.image ? (
                    <img src={r.requester.image} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-primary">{r.requester.name?.[0] ?? '?'}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.requester.name}</p>
                    <p className="text-xs text-gray-500 truncate">{r.requester.jobTitle} · {r.requester.company}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                    r.status === 'PENDING' ? 'bg-amber-50 text-amber-700' :
                    r.status === 'CONFIRMED' || r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                    'bg-red-50 text-red-600'
                  }`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Team reps */}
      {sponsor?.users?.length > 0 && (
        <TeamMembers members={sponsor.users} />
      )}
    </div>
  )
}
