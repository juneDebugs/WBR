export const dynamic = 'force-dynamic'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import Link from 'next/link'
import { format } from 'date-fns'
import { RecommendedMatchesClient, type RecommendedMatch } from '@/components/RecommendedMatchesClient'
import { getIndustry } from '@/lib/solutions'
import { TeamMembers } from '@/components/TeamMembers'

// ── Scoring ────────────────────────────────────────────────────────────────────

function parseSolutions(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

function scoreAttendeeVsSponsor(
  userSeeking: string[], userOffering: string[],
  sponsorOffering: string[], sponsorSeeking: string[],
  userSize: string | null, sponsorSize: string | null,
): { score: number; matched: string[] } {
  const matched: string[] = []
  let raw = 0
  for (const s of userSeeking) {
    if (sponsorOffering.includes(s)) { raw += 3; matched.push(s) }
  }
  for (const s of userOffering) {
    if (sponsorSeeking.includes(s) && !matched.includes(s)) { raw += 2; matched.push(s) }
  }
  if (userSize && sponsorSize && userSize === sponsorSize) raw += 1
  const maxPossible = userSeeking.length * 3 + userOffering.length * 2 + 1
  const score = maxPossible > 0 ? Math.min(100, Math.round((raw / maxPossible) * 100)) : 0
  return { score, matched }
}

function scoreSponsorVsAttendee(
  sponsorSeeking: string[], sponsorOffering: string[],
  userOffering: string[], userSeeking: string[],
  sponsorIndustry: string | null, userIndustry: string | null,
): { score: number; matched: string[] } {
  const matched: string[] = []
  let raw = 0
  for (const s of sponsorSeeking) {
    if (userOffering.includes(s)) { raw += 3; matched.push(s) }
  }
  for (const s of sponsorOffering) {
    if (userSeeking.includes(s) && !matched.includes(s)) { raw += 2; matched.push(s) }
  }
  if (sponsorIndustry && userIndustry && sponsorIndustry === userIndustry) raw += 1
  const maxPossible = sponsorSeeking.length * 3 + sponsorOffering.length * 2 + 1
  const score = maxPossible > 0 ? Math.min(100, Math.round((raw / maxPossible) * 100)) : 0
  return { score, matched }
}

// ──────────────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  const user = session.user as any
  const isStaff = user.role === 'STAFF'
  const isSponsor = !!user.sponsorId

  // ── Core metrics ──
  const [
    totalRequests,
    pendingRequests,
    approvedRequests,
    confirmedRequests,
    rejectedRequests,
    totalAttendees,
    totalSponsors,
    totalTimeBlocks,
    usedTimeBlocks,
    recentRequests,
    myRequests,
    inboundRequests,
    profileUser,
    myMeetings,
  ] = await Promise.all([
    isStaff
      ? prisma.meetingRequest.count()
      : prisma.meetingRequest.count({
          where: { OR: [{ requesterId: user.id }, { targetUserId: user.id }] },
        }),
    isStaff
      ? prisma.meetingRequest.count({ where: { status: 'PENDING' } })
      : prisma.meetingRequest.count({
          where: { status: 'PENDING', OR: [{ requesterId: user.id }, { targetUserId: user.id }] },
        }),
    isStaff
      ? prisma.meetingRequest.count({ where: { status: 'APPROVED' } })
      : prisma.meetingRequest.count({
          where: { status: 'APPROVED', OR: [{ requesterId: user.id }, { targetUserId: user.id }] },
        }),
    isStaff
      ? prisma.meetingRequest.count({ where: { status: 'CONFIRMED' } })
      : prisma.meetingRequest.count({
          where: { status: 'CONFIRMED', OR: [{ requesterId: user.id }, { targetUserId: user.id }] },
        }),
    isStaff
      ? prisma.meetingRequest.count({ where: { status: 'REJECTED' } })
      : prisma.meetingRequest.count({
          where: { status: 'REJECTED', OR: [{ requesterId: user.id }, { targetUserId: user.id }] },
        }),
    isStaff ? prisma.user.count({ where: { role: { in: ['ATTENDEE', 'SPEAKER'] } } }) : Promise.resolve(null),
    isStaff ? prisma.sponsor.count() : Promise.resolve(null),
    isStaff ? prisma.timeBlock.count() : Promise.resolve(null),
    isStaff ? prisma.meetingRequest.count({ where: { timeBlockId: { not: null } } }) : Promise.resolve(null),
    isStaff
      ? prisma.meetingRequest.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            requester: { select: { name: true, company: true, image: true } },
            targetUser: { select: { name: true, company: true } },
            targetSponsor: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
    !isStaff
      ? prisma.meetingRequest.findMany({
          where: { requesterId: user.id },
          orderBy: { createdAt: 'desc' },
          take: 4,
          include: {
            targetUser: { select: { name: true, company: true, image: true } },
            targetSponsor: { select: { name: true, logoUrl: true } },
          },
        })
      : Promise.resolve(null),
    !isStaff
      ? prisma.meetingRequest.findMany({
          where: { OR: [{ targetUserId: user.id }, { targetSponsorId: user.sponsorId ?? undefined }] },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            requester: { select: { name: true, image: true, jobTitle: true, company: true } },
          },
        })
      : Promise.resolve(null),
    !isStaff
      ? prisma.user.findUnique({
          where: { id: user.id },
          select: { name: true, image: true, bio: true, company: true, jobTitle: true, website: true, solutionsSeeking: true, solutionsOffering: true, companySize: true, annualRevenue: true, sponsorId: true },
        })
      : Promise.resolve(null),
    !isStaff
      ? prisma.meetingRequest.findMany({
          where: {
            status: 'CONFIRMED',
            timeBlockId: { not: null },
            OR: [{ requesterId: user.id }, { targetUserId: user.id }],
          },
          orderBy: { timeBlock: { startsAt: 'asc' } },
          take: 3,
          include: {
            requester: { select: { name: true, image: true } },
            targetUser: { select: { name: true, image: true } },
            targetSponsor: { select: { name: true } },
            timeBlock: true,
          },
        })
      : Promise.resolve(null),
  ])

  // ── Sponsor team (for team reps section) ──
  const sponsorWithTeam = isSponsor && user.sponsorId
    ? await prisma.sponsor.findUnique({
        where: { id: user.sponsorId },
        include: { users: { select: { id: true, name: true, image: true, jobTitle: true, email: true, role: true } } },
      })
    : null

  // ── Recommendations ──
  let recommendations: RecommendedMatch[] = []
  let recHeading = ''
  let recSubheading = ''

  if (!isStaff) {
    const fullUser = profileUser // reuse — already fetched with all needed fields

    if (isSponsor && user.sponsorId) {
      const sponsor = await prisma.sponsor.findUnique({
        where: { id: user.sponsorId },
        select: { solutionsSeeking: true, solutionsOffering: true, name: true },
      })

      const [allAttendees, alreadyRequestedIds] = await Promise.all([
        prisma.user.findMany({
          where: { role: { in: ['ATTENDEE', 'SPEAKER'] }, id: { not: user.id } },
          select: {
            id: true, name: true, image: true, company: true, jobTitle: true,
            solutionsOffering: true, solutionsSeeking: true, companySize: true,
          },
        }),
        prisma.meetingRequest.findMany({
          where: { requesterId: user.id, targetUserId: { not: null } },
          select: { targetUserId: true },
        }),
      ])

      const requestedSet = new Set(alreadyRequestedIds.map(r => r.targetUserId).filter(Boolean) as string[])
      const sponsorOffering = parseSolutions(sponsor?.solutionsOffering ?? null)
      const sponsorSeeking = parseSolutions(sponsor?.solutionsSeeking ?? null)
      const sponsorIndustry = getIndustry(sponsor?.name ?? null)

      recommendations = allAttendees
        .map(a => {
          const userOffering = parseSolutions(a.solutionsOffering)
          const userSeeking = parseSolutions(a.solutionsSeeking)
          const userIndustry = getIndustry(a.company)
          const { score, matched } = scoreSponsorVsAttendee(sponsorSeeking, sponsorOffering, userOffering, userSeeking, sponsorIndustry, userIndustry)
          return {
            id: a.id, type: 'person' as const, name: a.name ?? 'Unknown',
            logoUrl: a.image, company: a.company, jobTitle: a.jobTitle,
            tier: null, matchScore: score, matchedSolutions: matched,
            alreadyRequested: requestedSet.has(a.id),
          }
        })
        .filter(m => m.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 12)

      recHeading = 'Recommended Attendees'
      recSubheading = 'People whose offerings & interests align with your solutions'
    } else {
      const [allSponsors, alreadyRequestedIds] = await Promise.all([
        prisma.sponsor.findMany({
          select: {
            id: true, name: true, logoUrl: true, tier: true,
            solutionsOffering: true, solutionsSeeking: true,
            companySize: true, tagline: true,
          },
        }),
        prisma.meetingRequest.findMany({
          where: { requesterId: user.id, targetSponsorId: { not: null } },
          select: { targetSponsorId: true },
        }),
      ])

      const requestedSet = new Set(alreadyRequestedIds.map(r => r.targetSponsorId).filter(Boolean) as string[])
      const userSeeking = parseSolutions(fullUser?.solutionsSeeking ?? null)
      const userOffering = parseSolutions(fullUser?.solutionsOffering ?? null)

      recommendations = allSponsors
        .map(s => {
          const sponsorOffering = parseSolutions(s.solutionsOffering)
          const sponsorSeeking = parseSolutions(s.solutionsSeeking)
          const { score, matched } = scoreAttendeeVsSponsor(
            userSeeking, userOffering, sponsorOffering, sponsorSeeking,
            fullUser?.companySize ?? null, s.companySize ?? null,
          )
          return {
            id: s.id, type: 'sponsor' as const, name: s.name,
            logoUrl: s.logoUrl, company: null, jobTitle: s.tagline ?? null,
            tier: s.tier, matchScore: score, matchedSolutions: matched,
            alreadyRequested: requestedSet.has(s.id),
          }
        })
        .filter(m => m.matchScore > 0)
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 12)

      recHeading = 'Recommended Sponsors'
      recSubheading = 'Matched to your solutions seeking profile'
    }
  }

  const confirmRate = totalRequests > 0 ? Math.round((confirmedRequests / totalRequests) * 100) : 0

  // Profile completeness
  const profileFields: [unknown, string][] = [
    [profileUser?.image,            'Photo'],
    [profileUser?.name,             'Name'],
    [profileUser?.bio,              'Bio'],
    [profileUser?.company,          'Company'],
    [profileUser?.jobTitle,         'Job title'],
    [profileUser?.website,          'Website'],
    [profileUser?.solutionsSeeking, 'Solutions seeking'],
    [profileUser?.solutionsOffering,'Solutions offering'],
  ]
  const profileFilled = profileFields.filter(([v]) => v).length
  const profilePct = Math.round((profileFilled / profileFields.length) * 100)
  const profileMissing = profileFields.filter(([v]) => !v).map(([, l]) => l)

  // Stats for attendee/sponsor view (matches Sponsor Portal format)
  const attendeeStats = [
    { label: 'Total Requests', value: totalRequests, color: 'text-primary', bg: 'bg-primary/10', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Pending', value: pendingRequests, color: 'text-amber-600', bg: 'bg-amber-50', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Confirmed', value: confirmedRequests, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Profile Score', value: `${profilePct}%`, color: profilePct >= 80 ? 'text-emerald-600' : 'text-amber-600', bg: profilePct >= 80 ? 'bg-emerald-50' : 'bg-amber-50', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ]

  // Stats for staff view
  const staffStats = [
    { label: 'Total Requests', value: totalRequests, color: 'text-primary', bg: 'bg-primary/10', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Pending', value: pendingRequests, color: 'text-amber-600', bg: 'bg-amber-50', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Confirmed', value: confirmedRequests, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Confirm Rate', value: `${confirmRate}%`, color: 'text-violet-600', bg: 'bg-violet-50', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isStaff
            ? 'Meeting Portal Overview'
            : `Welcome back, ${user.name?.split(' ')[0] ?? 'there'}`}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {isStaff
            ? 'Live metrics across all meeting requests'
            : isSponsor
            ? 'Your sponsor dashboard'
            : 'Your meeting activity'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(isStaff ? staffStats : attendeeStats).map(s => (
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

      {/* ════════════════ STAFF EXTRA ════════════════ */}
      {isStaff && (
        <>
          {/* Secondary stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Attendees & Speakers', value: totalAttendees, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: 'text-blue-500', bg: 'bg-blue-50' },
              { label: 'Sponsors', value: totalSponsors, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', color: 'text-purple-500', bg: 'bg-purple-50' },
              { label: 'Available Slots', value: (totalTimeBlocks ?? 0) - (usedTimeBlocks ?? 0), icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', color: 'text-teal-500', bg: 'bg-teal-50' },
              { label: 'Approved (Awaiting)', value: approvedRequests, icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', color: 'text-orange-500', bg: 'bg-orange-50' },
            ].map(s => (
              <div key={s.label} className="card p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center flex-shrink-0`}>
                    <svg className={`w-5 h-5 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={s.icon} />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900">{s.value}</p>
                    <p className="text-xs text-gray-400">{s.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Status breakdown bar */}
          {totalRequests > 0 && (
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Request Status Breakdown</h2>
              <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
                {confirmedRequests > 0 && <div className="bg-emerald-400" style={{ width: `${(confirmedRequests / totalRequests) * 100}%` }} />}
                {approvedRequests > 0  && <div className="bg-blue-400"    style={{ width: `${(approvedRequests / totalRequests) * 100}%` }} />}
                {pendingRequests > 0   && <div className="bg-amber-400"   style={{ width: `${(pendingRequests / totalRequests) * 100}%` }} />}
                {rejectedRequests > 0  && <div className="bg-red-300"     style={{ width: `${(rejectedRequests / totalRequests) * 100}%` }} />}
              </div>
              <div className="flex flex-wrap gap-4">
                {[
                  { label: 'Confirmed', count: confirmedRequests, color: 'bg-emerald-400' },
                  { label: 'Approved',  count: approvedRequests,  color: 'bg-blue-400' },
                  { label: 'Pending',   count: pendingRequests,   color: 'bg-amber-400' },
                  { label: 'Rejected',  count: rejectedRequests,  color: 'bg-red-300' },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                    <span className="text-xs text-gray-500">{s.label} <strong className="text-gray-800">{s.count}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent requests */}
          {recentRequests && recentRequests.length > 0 && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Recent Requests</h2>
                <Link href="/staff" className="text-xs text-primary hover:underline">Review all →</Link>
              </div>
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
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {r.requester.name}
                        <span className="text-gray-400"> → </span>
                        {r.targetSponsor?.name ?? r.targetUser?.name ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">{format(new Date(r.createdAt), 'MMM d, h:mm a')}</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                      r.status === 'PENDING' ? 'bg-amber-50 text-amber-700' :
                      r.status === 'CONFIRMED' || r.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' :
                      'bg-red-50 text-red-600'
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { href: '/staff',    label: 'Review Pending',   sub: `${pendingRequests} awaiting` },
              { href: '/browse',   label: 'Browse Attendees', sub: `${totalAttendees ?? 0} registered` },
              { href: '/meetings', label: 'View Meetings',    sub: `${confirmedRequests} confirmed` },
            ].map(a => (
              <Link key={a.href} href={a.href} className="card p-4 hover:shadow-md transition-shadow flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">{a.label}</p>
                  <p className="text-xs text-gray-400">{a.sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* ════════════════ ATTENDEE / SPONSOR ════════════════ */}
      {!isStaff && (
        <>
          {/* Recommended */}
          {recommendations.length > 0 && (
            <RecommendedMatchesClient
              matches={recommendations}
              heading={recHeading}
              subheading={recSubheading}
            />
          )}

          <div className="grid md:grid-cols-2 gap-6">
            {/* Profile completeness */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Profile Completeness</h2>
                <Link href="/profile" className="text-xs text-primary hover:underline">Edit profile →</Link>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="h-2.5 rounded-full transition-all"
                  style={{ width: `${profilePct}%`, background: profilePct >= 80 ? '#10b981' : '#f59e0b' }}
                />
              </div>
              <p className="text-sm text-gray-600">{profilePct}% complete</p>
              {profileMissing.length > 0 ? (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-2">Missing fields:</p>
                  <ul className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                    {profileMissing.map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs text-amber-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Profile complete
                </p>
              )}
            </div>

            {/* Recent meeting requests */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Recent Meeting Requests</h2>
                <Link href="/requests" className="text-xs text-primary hover:underline">View all →</Link>
              </div>
              {!inboundRequests || inboundRequests.length === 0 ? (
                <p className="text-sm text-gray-400">No meeting requests yet.</p>
              ) : (
                <div className="space-y-3">
                  {inboundRequests.map(r => (
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

          {/* Upcoming meetings */}
          {myMeetings && myMeetings.length > 0 && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Upcoming Meetings</h2>
                <Link href="/meetings" className="text-xs text-primary hover:underline">View all →</Link>
              </div>
              <div className="space-y-3">
                {myMeetings.map(r => {
                  const other = r.requesterId === user.id ? r.targetUser : r.requester
                  const name = r.targetSponsor?.name ?? other?.name ?? '—'
                  const img = other?.image ?? null
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                      {img ? (
                        <img src={img} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-bold text-emerald-700">{name[0]}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                        {r.timeBlock && (
                          <p className="text-xs text-gray-500">
                            {format(new Date(r.timeBlock.startsAt), 'EEE MMM d · h:mm a')}
                            {r.timeBlock.location ? ` · ${r.timeBlock.location}` : ''}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex-shrink-0">Confirmed</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Team reps */}
          {sponsorWithTeam?.users && sponsorWithTeam.users.length > 0 && (
            <TeamMembers members={sponsorWithTeam.users} />
          )}

          {/* No profile → CTA */}
          {recommendations.length === 0 && (
            <div className="card p-6 flex items-start gap-4 bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-100">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">Set up your profile to unlock recommendations</p>
                <p className="text-xs text-gray-500 mt-1">Tell us what solutions you're seeking and offering so we can match you with the right {isSponsor ? 'attendees' : 'sponsors'}.</p>
                <Link href="/profile" className="inline-block mt-3 btn-primary text-xs px-4 py-1.5">
                  Complete Profile →
                </Link>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  )
}
