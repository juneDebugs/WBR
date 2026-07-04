'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useUser, useSponsorData, useMeetingsData, useAttendees, useInvalidate } from '@/lib/hooks'
import { RecommendedAttendees } from './RecommendedAttendees'
import { TeamMembers } from './TeamMembers'

function parseArr(val: string | null | undefined): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

const ARRAY_FIELDS = new Set(['solutionsOffering', 'solutionsSeeking', 'targetIndustries'])

function completeness(sponsor: any): { score: number; missing: string[] } {
  const fields: [string, string][] = [
    ['tagline', 'Tagline'], ['description', 'Description'], ['logoUrl', 'Logo'],
    ['heroImageUrl', 'Hero image'], ['website', 'Website'], ['contactName', 'Contact name'],
    ['contactEmail', 'Contact email'], ['contactPhone', 'Phone'], ['companySize', 'Company size'],
    ['annualRevenue', 'Annual revenue'], ['founded', 'Founded year'], ['headquarters', 'Headquarters'],
    ['boothNumber', 'Booth number'], ['socialLinkedIn', 'LinkedIn'], ['socialTwitter', 'Twitter / X'],
    ['solutionsOffering', 'Solutions offering'], ['solutionsSeeking', 'Solutions seeking'],
    ['targetIndustries', 'Target industries'],
  ]
  const missing = fields
    .filter(([k]) => ARRAY_FIELDS.has(k) ? parseArr(sponsor[k]).length === 0 : !sponsor[k])
    .map(([, label]) => label)
  const score = Math.round(((fields.length - missing.length) / fields.length) * 100)
  return { score, missing }
}

function scoreAttendees(attendees: any[], sponsorSignals: string[]) {
  const results: any[] = []
  for (const a of attendees) {
    const attendeeTags = [...new Set([...parseArr(a.solutionsSeeking), ...parseArr(a.solutionsOffering)])]
    if (attendeeTags.length < 2) continue
    const matched = sponsorSignals.filter(s => attendeeTags.some(t => t === s))
    if (matched.length === 0) continue
    const score = Math.round((matched.length / Math.max(sponsorSignals.length, attendeeTags.length)) * 100)
    results.push({
      id: a.id, name: a.name ?? 'Attendee', image: a.image, company: a.company, jobTitle: a.jobTitle,
      bio: a.bio ?? null,
      matchScore: Math.min(score, 99), matchedTags: [...new Set(matched)], allTags: [...new Set(attendeeTags)],
    })
  }
  results.sort((a, b) => b.matchScore - a.matchScore)
  return results.slice(0, 12)
}

export function DashboardView() {
  const { name: userName, role: userRole, sponsorId } = useUser()
  const { data: sponsorData, isLoading: sponsorLoading } = useSponsorData()
  const { data: meetingsData } = useMeetingsData()
  const { data: allAttendees } = useAttendees()

  const sponsor = sponsorData?.sponsor
  const wbrTeam = sponsorData?.staff ?? []
  const stats = sponsorData?.stats
  const conflicts = sponsorData?.conflicts ?? []

  // Recent inbound requests (top 5)
  const recentRequests = useMemo(() => {
    if (!meetingsData?.inbound) return []
    return [...meetingsData.inbound]
      .sort((a: any, b: any) => new Date(b.createdAt ?? b.updatedAt).getTime() - new Date(a.createdAt ?? a.updatedAt).getTime())
      .slice(0, 5)
  }, [meetingsData?.inbound])

  // Upcoming meetings (merged booth + confirmed requests, top 5)
  const upcomingMeetings = useMemo(() => {
    if (!meetingsData) return []
    const now = new Date()
    const items: any[] = []

    for (const m of meetingsData.sponsorMeetings) {
      if (m.status === 'CONFIRMED' && m.timeBlock && new Date(m.timeBlock.startsAt) >= now) {
        items.push({ id: m.id, type: 'booth', person: m.user, startsAt: m.timeBlock.startsAt, endsAt: m.timeBlock.endsAt, location: m.timeBlock.location })
      }
    }
    for (const r of [...meetingsData.inbound, ...meetingsData.outbound]) {
      if ((r.status === 'CONFIRMED' || r.status === 'APPROVED') && r.timeBlock && new Date(r.timeBlock.startsAt) >= now) {
        const person = r.requester ?? r.targetUser
        items.push({ id: r.id, type: 'request', person, startsAt: r.timeBlock.startsAt, endsAt: r.timeBlock.endsAt, location: r.timeBlock.location })
      }
    }
    items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    return items.slice(0, 5)
  }, [meetingsData])

  // Recommended attendees
  const recommended = useMemo(() => {
    if (!sponsor || !allAttendees) return []
    const offering = parseArr(sponsor.solutionsOffering)
    const seeking = parseArr(sponsor.solutionsSeeking)
    const industries = parseArr(sponsor.targetIndustries)
    const signals = [...offering, ...seeking, ...industries]
    if (signals.length === 0) return []
    const eligible = allAttendees.filter((a: any) => !a.sponsorId)
    return scoreAttendees(eligible, signals)
  }, [sponsor, allAttendees])

  const profile = completeness(sponsor ?? {})

  const statCards = [
    { label: 'Total Requests', value: stats?.totalMeetings ?? 0, color: 'text-brand-600', bg: 'bg-brand-50', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Pending', value: stats?.pendingCount ?? 0, color: 'text-warning-ink', bg: 'bg-warning-soft', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Confirmed', value: stats?.confirmedCount ?? 0, color: 'text-success-ink', bg: 'bg-success-soft', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    { label: 'Profile Score', value: `${profile.score}%`, color: profile.score >= 80 ? 'text-success-ink' : 'text-warning-ink', bg: profile.score >= 80 ? 'bg-success-soft' : 'bg-warning-soft', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ]

  if (sponsorLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <div><div className="skeleton h-7 w-64" /><div className="skeleton h-4 w-40 mt-2" /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (<div key={i} className="card p-5"><div className="skeleton w-10 h-10 rounded-xl mb-3" /><div className="skeleton h-7 w-12" /><div className="skeleton h-3 w-20 mt-2" /></div>))}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {conflicts.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 flex items-start gap-3">
          <svg className="w-4 h-4 text-danger flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-danger-ink">{conflicts.length} presenter scheduling conflict{conflicts.length !== 1 ? 's' : ''} detected</p>
            <p className="text-xs text-danger-ink mt-0.5">{conflicts.map((c: any) => c.speakerName).join(', ')} {conflicts.length === 1 ? 'is' : 'are'} double-booked. Contact the organizer.</p>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-ink">{userRole === 'STAFF' ? 'Staff Dashboard' : `Welcome back, ${userName.split(' ')[0]}`}</h1>
        <p className="text-ink-2 text-sm mt-1">{sponsor?.name ?? 'WBR'} · Sponsor Portal</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="card p-5">
            <div className={`w-10 h-10 rounded-xl ${s.bg} flex items-center justify-center mb-3`}>
              <svg className={`w-5 h-5 ${s.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={s.icon} /></svg>
            </div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-ink-2 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {recommended.length > 0 && sponsorId && (
        <RecommendedAttendees
          attendees={recommended}
          sponsorId={sponsorId}
          sponsor={{
            id: sponsorId,
            name: sponsor?.name ?? null,
            tagline: sponsor?.tagline ?? null,
          }}
        />
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {sponsor && (
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Profile Completeness</h2>
              <Link href="/profile" className="text-xs text-primary hover:underline">Edit profile →</Link>
            </div>
            <div className="w-full bg-fill rounded-full h-2.5">
              <div className={`h-2.5 rounded-full transition-all ${profile.score >= 80 ? 'bg-success' : 'bg-warning'}`} style={{ width: `${profile.score}%` }} />
            </div>
            <p className="text-sm text-ink-2">{profile.score}% complete</p>
            {profile.missing.length > 0 && (
              <div>
                <p className="text-xs text-ink-2 font-medium mb-2">Missing fields:</p>
                <ul className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {profile.missing.map(f => (<li key={f} className="flex items-center gap-2 text-xs text-warning-ink"><span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />{f}</li>))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Recent Meeting Requests</h2>
            <Link href="/meetings" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-ink-3">No meeting requests yet.</p>
          ) : (
            <div className="space-y-3">
              {recentRequests.map((r: any) => (
                <div key={r.id} className="flex items-center gap-3">
                  {r.requester?.image ? (<img src={r.requester.image} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />) : (<div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0"><span className="text-xs font-bold text-primary">{r.requester?.name?.[0] ?? '?'}</span></div>)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink truncate">{r.requester?.name}</p>
                    <p className="text-xs text-ink-2 truncate">{r.requester?.jobTitle} · {r.requester?.company}</p>
                  </div>
                  <span className={`badge flex-shrink-0 ${r.status === 'PENDING' ? 'badge-warning' : r.status === 'CONFIRMED' || r.status === 'APPROVED' ? 'badge-success' : 'badge-danger'}`}>{r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {upcomingMeetings.length > 0 && (
        <div className="card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Upcoming Meetings</h2>
            <Link href="/meetings" className="text-sm text-primary hover:underline">View all →</Link>
          </div>
          <div className="space-y-3">
            {upcomingMeetings.map((m: any) => {
              const starts = new Date(m.startsAt)
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-success/20 bg-success-soft/50 px-4 py-3">
                  {m.person?.image ? (<img src={m.person.image} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />) : (<div className="w-10 h-10 rounded-full bg-success-soft flex items-center justify-center flex-shrink-0"><span className="text-sm font-semibold text-success-ink">{(m.person?.name ?? '?')[0]}</span></div>)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{m.person?.name ?? 'Attendee'}</p>
                    <p className="text-xs text-ink-2 mt-0.5">{starts.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {starts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}{m.location ? ` · ${m.location}` : ''}</p>
                  </div>
                  <span className="text-sm font-medium text-success-ink flex-shrink-0">Confirmed</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {wbrTeam.length > 0 && <TeamMembers members={wbrTeam} />}
    </div>
  )
}
