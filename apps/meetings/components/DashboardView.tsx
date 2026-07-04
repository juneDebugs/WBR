'use client'

import { useDashboard, useRecommendations } from '@/lib/hooks'
import { RecommendedMatchesClient } from '@/components/RecommendedMatchesClient'
import { TeamMembers } from '@/components/TeamMembers'
import { format } from 'date-fns'
import Link from 'next/link'

function LoadingSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div className="h-7 w-64 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse mb-3" />
            <div className="h-7 w-12 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-20 bg-gray-100 rounded animate-pulse mt-1" />
          </div>
        ))}
      </div>
    </div>
  )
}

function RecsSkeleton() {
  return (
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
  )
}

function RecommendationsSection() {
  const { data: recs, isLoading } = useRecommendations()

  if (isLoading && !recs) return <RecsSkeleton />
  if (!recs || recs.matches.length === 0) return null

  return (
    <RecommendedMatchesClient
      matches={recs.matches}
      heading={recs.heading}
      subheading={recs.subheading}
    />
  )
}

interface DashboardProps {
  isSponsor: boolean
  userId: string
}

export function DashboardView({ isSponsor, userId }: DashboardProps) {
  const { data, isLoading } = useDashboard()

  if (isLoading && !data) return <LoadingSkeleton />
  if (!data) return null

  const {
    totalRequests, pendingRequests, approvedRequests, confirmedRequests, rejectedRequests,
  } = data

  const confirmRate = totalRequests > 0 ? Math.round((confirmedRequests / totalRequests) * 100) : 0

  if (data.isStaff) {
    return <StaffDashboard data={data} confirmRate={confirmRate} />
  }

  return <UserDashboard data={data} isSponsor={isSponsor} />
}

function StaffDashboard({ data, confirmRate }: { data: any; confirmRate: number }) {
  const {
    totalRequests, pendingRequests, approvedRequests, confirmedRequests, rejectedRequests,
    totalAttendees, totalSponsors, totalTimeBlocks, usedTimeBlocks, recentRequests,
  } = data

  const staffStats = [
    { label: 'Total Requests', value: totalRequests, color: 'text-primary', bg: 'bg-primary/10', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Pending', value: pendingRequests, color: 'text-amber-600', bg: 'bg-amber-50', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Confirmed', value: confirmedRequests, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Confirm Rate', value: `${confirmRate}%`, color: 'text-violet-600', bg: 'bg-violet-50', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meeting Portal Overview</h1>
        <p className="text-gray-500 text-sm mt-1">Live metrics across all meeting requests</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {staffStats.map(s => (
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

      {/* Secondary stats */}
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
            {recentRequests.map((r: any) => (
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
          { href: '/browse',   label: 'Browse Attendees', sub: `${data.totalAttendees ?? 0} registered` },
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
    </div>
  )
}

function UserDashboard({ data, isSponsor }: { data: any; isSponsor: boolean }) {
  const {
    totalRequests, pendingRequests, confirmedRequests, userName,
    myRequests, inboundRequests, profileUser, myMeetings, staff,
  } = data

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

  const attendeeStats = [
    { label: 'Total Requests', value: totalRequests, color: 'text-primary', bg: 'bg-primary/10', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Pending', value: pendingRequests, color: 'text-amber-600', bg: 'bg-amber-50', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Confirmed', value: confirmedRequests, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Profile Score', value: `${profilePct}%`, color: profilePct >= 80 ? 'text-emerald-600' : 'text-amber-600', bg: profilePct >= 80 ? 'bg-emerald-50' : 'bg-amber-50', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ]

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {userName.split(' ')[0]}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {isSponsor ? 'Your sponsor dashboard' : 'Your meeting activity'}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {attendeeStats.map(s => (
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

      {/* Recommendations */}
      <RecommendationsSection />

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
              {inboundRequests.map((r: any) => (
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
            <Link href="/meetings" className="text-sm text-primary hover:underline">View all →</Link>
          </div>
          <div className="space-y-3">
            {myMeetings.map((r: any) => {
              if (!r.timeBlock) return null
              const other = r.requesterId === data.userId ? r.targetUser : r.requester
              const name = r.targetSponsor?.name ?? other?.name ?? '—'
              const img = other?.image ?? null
              const starts = new Date(r.timeBlock.startsAt)
              return (
                <div key={r.id} className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
                  {img ? (
                    <img src={img} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-semibold text-emerald-700">{name[0]}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {starts.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {starts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}{r.timeBlock.location ? ` · ${r.timeBlock.location}` : ''}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-emerald-600 flex-shrink-0">Confirmed</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* WBR staff roster — same module as the sponsor app dashboard */}
      {staff && staff.length > 0 && <TeamMembers members={staff} />}

      {/* No profile CTA */}
      {profilePct < 50 && (
        <div className="card p-6 flex items-start gap-4 bg-gradient-to-br from-indigo-50 to-violet-50 border-indigo-100">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Set up your profile to unlock recommendations</p>
            <p className="text-xs text-gray-500 mt-1">Tell us what solutions you&apos;re seeking and offering so we can match you with the right {isSponsor ? 'attendees' : 'sponsors'}.</p>
            <Link href="/profile" className="inline-block mt-3 btn-primary text-xs px-4 py-1.5">
              Complete Profile →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
