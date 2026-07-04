'use client'

import { useMemo } from 'react'
import { useMeetingsData } from '@/lib/hooks'
import { AutoScheduleButton } from '@/components/AutoScheduleButton'
import { MeetingsTableWithPanel } from '@/components/MeetingsTableWithPanel'
import Image from 'next/image'
import Link from 'next/link'
import { fmtTime, TZ } from '@/lib/format'

const TIER_COLORS: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700',
  GOLD:     'bg-warning-soft text-warning-ink',
  SILVER:   'bg-fill text-ink-2',
  BRONZE:   'bg-orange-100 text-orange-700',
}

export default function MeetingsPageClient({ tab: tabParam, status, type }: { tab?: string; status?: string; type?: string }) {
  const { data, isLoading } = useMeetingsData()

  const tab = tabParam === 'schedule' ? 'schedule' : 'requests'
  const statusFilter = status?.toUpperCase()
  const typeFilter = type === 'attendee' ? 'attendee' : type === 'sponsor' ? 'sponsor' : undefined

  const allMeetingRequests = data?.allMeetingRequests ?? []
  const sponsorMeetings = data?.sponsorMeetings ?? []
  const bookmarkCounts = data?.bookmarkCounts ?? []

  const { counts, requesterCommitments, sponsorCommitments, bookmarkCommitments } = useMemo(() => {
    const counts: Record<string, number> = {}
    const requesterCommitments: Record<string, number> = {}
    for (const r of allMeetingRequests) {
      counts[r.status] = (counts[r.status] ?? 0) + 1
      if (r.status !== 'REJECTED' && r.status !== 'CANCELLED') {
        requesterCommitments[r.requesterId] = (requesterCommitments[r.requesterId] ?? 0) + 1
      }
    }
    const sponsorCommitments: Record<string, number> = {}
    for (const sm of sponsorMeetings) {
      if (sm.status !== 'CANCELLED') {
        sponsorCommitments[sm.sponsorId] = (sponsorCommitments[sm.sponsorId] ?? 0) + 1
      }
    }
    const bookmarkCommitments = Object.fromEntries(bookmarkCounts.map((r: any) => [r.userId, r._count._all]))
    return { counts, requesterCommitments, sponsorCommitments, bookmarkCommitments }
  }, [allMeetingRequests, sponsorMeetings, bookmarkCounts])

  // Apply filters for the displayed list
  const meetingRequests = allMeetingRequests.filter((r: any) => {
    if (statusFilter && ['PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED'].includes(statusFilter) && r.status !== statusFilter) return false
    if (typeFilter === 'sponsor' && r.targetSponsorId === null) return false
    if (typeFilter === 'attendee' && r.targetSponsorId !== null) return false
    return true
  })

  const confirmedSponsorMeetings = useMemo(
    () => sponsorMeetings.filter((sm: any) => sm.status === 'CONFIRMED'),
    [sponsorMeetings],
  )

  const { allConfirmed, sponsorFillRate, scheduleByDay } = useMemo(() => {
    const confirmedRequests = meetingRequests.filter((r: any) => r.status === 'CONFIRMED' && r.timeBlock)
    const allConfirmed = [
      ...confirmedSponsorMeetings.map((sm: any) => ({
        id: sm.id,
        type: 'sponsor' as const,
        timeBlock: sm.timeBlock,
        sponsorName: sm.sponsor.name,
        sponsorLogo: sm.sponsor.logoUrl,
        sponsorTier: sm.sponsor.tier,
        personName: sm.user.name ?? sm.user.email ?? '\u2014',
        personCompany: sm.user.company ?? '',
        personRole: sm.user.role,
        status: sm.status,
      })),
      ...confirmedRequests.map((r: any) => ({
        id: r.id,
        type: 'request' as const,
        timeBlock: r.timeBlock!,
        sponsorName: r.targetSponsor?.name ?? null,
        sponsorLogo: r.targetSponsor?.logoUrl ?? null,
        sponsorTier: r.targetSponsor?.tier ?? null,
        personName: r.requester.name ?? '\u2014',
        personCompany: r.requester.company ?? '',
        personRole: r.requester.role,
        targetName: r.targetUser?.name ?? null,
        targetCompany: r.targetUser?.company ?? null,
        status: r.status,
      })),
    ].sort((a, b) => new Date(a.timeBlock.startsAt).getTime() - new Date(b.timeBlock.startsAt).getTime())

    const sponsorFillMap = new Map<string, { id: string; name: string; tier: string; logoUrl: string | null; count: number }>()
    for (const sm of confirmedSponsorMeetings) {
      const id = sm.sponsor.id
      if (!sponsorFillMap.has(id)) sponsorFillMap.set(id, { id, name: sm.sponsor.name, tier: sm.sponsor.tier, logoUrl: sm.sponsor.logoUrl, count: 0 })
      sponsorFillMap.get(id)!.count++
    }
    const sponsorFillRate = Array.from(sponsorFillMap.values()).sort((a, b) => b.count - a.count)

    const scheduleByDay = new Map<string, Map<string, typeof allConfirmed>>()
    for (const item of allConfirmed) {
      const day = new Date(item.timeBlock.startsAt).toISOString().slice(0, 10)
      const slot = item.timeBlock.id
      if (!scheduleByDay.has(day)) scheduleByDay.set(day, new Map())
      const dayMap = scheduleByDay.get(day)!
      if (!dayMap.has(slot)) dayMap.set(slot, [])
      dayMap.get(slot)!.push(item)
    }

    return { allConfirmed, sponsorFillRate, scheduleByDay }
  }, [meetingRequests, confirmedSponsorMeetings])

  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-36 bg-fill-2 rounded-xl animate-pulse" />
          <div className="h-10 w-36 bg-fill-2 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white border border-hairline rounded-xl px-4 py-3">
              <div className="h-3 w-16 bg-fill rounded animate-pulse mb-2" />
              <div className="h-8 w-12 bg-fill rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="bg-white border border-hairline rounded-xl overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-hairline">
              <div className="h-4 w-32 bg-fill rounded animate-pulse" />
              <div className="h-4 w-32 bg-fill rounded animate-pulse" />
              <div className="h-4 w-24 bg-fill rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="?tab=requests"
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'requests' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-hairline text-ink-2 hover:bg-fill'
          }`}>
          Meeting Requests
          {(counts.PENDING ?? 0) > 0 && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === 'requests' ? 'bg-white/25 text-white' : 'bg-warning-soft text-warning-ink'
            }`}>{counts.PENDING} pending</span>
          )}
        </Link>
        <Link href="?tab=schedule"
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'schedule' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-hairline text-ink-2 hover:bg-fill'
          }`}>
          Master Schedule
          <span className={`ml-1.5 text-xs opacity-70`}>{allConfirmed.length}</span>
        </Link>
        <Link href="/dashboard/meetings/new" className="ml-auto text-sm px-4 py-2 bg-white border border-hairline rounded-xl text-ink-2 hover:bg-fill font-medium transition-colors">
          + New Time Block
        </Link>
      </div>

      {/* -- KPI STRIP -- */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {([
          { label: 'Pending',   val: counts.PENDING   ?? 0, status: 'pending',   dot: 'bg-warning', num: 'text-warning-ink' },
          { label: 'Approved',  val: counts.APPROVED  ?? 0, status: 'approved',  dot: 'bg-brand',  num: 'text-brand-700'  },
          { label: 'Confirmed', val: counts.CONFIRMED ?? 0, status: 'confirmed', dot: 'bg-success', num: 'text-success-ink' },
          { label: 'Rejected',  val: counts.REJECTED  ?? 0, status: 'rejected',  dot: 'bg-ink-3',  num: 'text-ink-2'  },
        ] as const).map(({ label, val, status, dot, num }) => (
          <Link key={label} href={`?tab=requests&status=${status}`}
            className="bg-white border border-hairline rounded-xl px-4 py-3 hover:border-hairline hover:shadow-sm transition-all group">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              <p className="text-caption text-ink-2 font-medium">{label}</p>
            </div>
            <p className={`text-2xl font-bold ${num}`}>{val}</p>
          </Link>
        ))}
        <div className="bg-white border border-hairline rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-caption text-ink-2 font-medium">Sponsor Slots</p>
            <p className="text-caption text-ink-3">/ 200</p>
          </div>
          <p className="text-2xl font-bold text-ink">
            {confirmedSponsorMeetings.length}
          </p>
          <div className="mt-2 h-1 bg-fill rounded-full overflow-hidden">
            <div className="h-full bg-success rounded-full transition-all"
              style={{ width: `${Math.min((confirmedSponsorMeetings.length / 200) * 100, 100)}%` }} />
          </div>
        </div>
      </div>

      {/* -- REQUESTS TAB -- */}
      {tab === 'requests' && (
        <div>
          {/* Type filter + Auto-schedule */}
          <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
            <div className="flex gap-2">
              {([undefined, 'attendee', 'sponsor'] as const).map(t => {
                const href = t
                  ? `?tab=requests&type=${t}${statusFilter ? `&status=${statusFilter.toLowerCase()}` : ''}`
                  : `?tab=requests${statusFilter ? `&status=${statusFilter.toLowerCase()}` : ''}`
                return (
                  <Link key={t ?? 'all'} href={href}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                      typeFilter === t
                        ? 'bg-ink text-white'
                        : 'bg-white border border-hairline text-ink-2 hover:bg-fill'
                    }`}>
                    {t === 'attendee' ? '\ud83d\udc64 Attendee' : t === 'sponsor' ? '\ud83c\udfe2 Sponsor' : 'All Types'}
                  </Link>
                )
              })}
            </div>
            <AutoScheduleButton approvedCount={counts.APPROVED ?? 0} />
          </div>

          {/* Status filter */}
          <div className="flex gap-2 flex-wrap mb-4">
            {([undefined, 'PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED'] as const).map(s => (
              <Link key={s ?? 'all'}
                href={s
                  ? `?tab=requests&status=${s.toLowerCase()}${typeFilter ? `&type=${typeFilter}` : ''}`
                  : `?tab=requests${typeFilter ? `&type=${typeFilter}` : ''}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  (statusFilter ?? undefined) === s
                    ? 'bg-ink text-white'
                    : 'bg-white border border-hairline text-ink-2 hover:bg-fill'
                }`}>
                {s ?? 'All'}
                {s && (counts[s] ?? 0) > 0 && (
                  <span className="ml-1 opacity-60">{counts[s]}</span>
                )}
              </Link>
            ))}
          </div>

          <MeetingsTableWithPanel
            requests={meetingRequests}
            requesterCommitments={requesterCommitments}
            sponsorCommitments={sponsorCommitments}
            bookmarkCommitments={bookmarkCommitments}
          />
        </div>
      )}

      {/* -- MASTER SCHEDULE TAB -- */}
      {tab === 'schedule' && (
        <div>
          {/* Sponsor fill-rate overview */}
          {sponsorFillRate.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">Sponsor Meeting Fill Rate</p>
              <div className="flex flex-wrap gap-2">
                {sponsorFillRate.map(sp => {
                  const pct = Math.min((sp.count / 10) * 100, 100)
                  const color = sp.count >= 10 ? 'bg-success' : sp.count >= 7 ? 'bg-warning' : 'bg-brand-300'
                  const textColor = sp.count >= 10 ? 'text-success-ink' : sp.count >= 7 ? 'text-warning' : 'text-ink-2'
                  const borderColor = sp.count >= 10 ? 'border-success/30' : sp.count >= 7 ? 'border-warning/30' : 'border-hairline'
                  return (
                    <div key={sp.id} className={`flex items-center gap-2.5 bg-white border ${borderColor} rounded-xl px-3 py-2`}>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink leading-tight">{sp.name}</p>
                        <p className={`text-caption font-bold ${textColor}`}>{sp.count}/10</p>
                      </div>
                      <div className="w-12 h-1.5 bg-fill rounded-full overflow-hidden flex-shrink-0">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {allConfirmed.length === 0 ? (
            <div className="bg-white border border-hairline rounded-xl p-12 text-center">
              <p className="font-medium text-ink">No confirmed meetings yet</p>
              <p className="text-sm text-ink-2 mt-1">Approve and assign time blocks to requests to build the schedule.</p>
              <Link href="?tab=requests" className="mt-3 inline-block text-primary text-sm hover:underline">
                Go to Meeting Requests {'\u2192'}
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-hairline rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-fill border-b border-hairline">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-36">Time</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Attendee</th>
                    <th className="w-8"></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Meeting With</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-28">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {Array.from(scheduleByDay.entries()).map(([day, slotMap]) => (
                    <>
                      {/* Day separator row */}
                      <tr key={`day-${day}`} className="bg-fill/80">
                        <td colSpan={5} className="px-4 py-2 text-xs font-bold text-ink-2 uppercase tracking-widest border-b border-hairline">
                          {new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })}
                          <span className="ml-2 font-normal normal-case text-ink-2">
                            {'\u00b7'} {Array.from(slotMap.values()).flat().length} meetings
                          </span>
                        </td>
                      </tr>

                      {Array.from(slotMap.entries()).map(([slotId, items]) => {
                        const tb = items[0].timeBlock
                        return items.map((item, i) => (
                          <tr key={item.id} className="hover:bg-fill align-middle">
                            {/* Time -- only on first row of slot */}
                            <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                              {i === 0 ? (
                                <div>
                                  <p className="text-sm font-semibold text-ink">
                                    {fmtTime(tb.startsAt)}
                                    <span className="text-ink-2 font-normal">{'\u2013'}{fmtTime(tb.endsAt, true)}</span>
                                  </p>
                                  {tb.location && (
                                    <p className="text-caption text-ink-2 mt-0.5">{tb.location}</p>
                                  )}
                                  {items.length > 1 && (
                                    <span className="text-caption text-ink-2 bg-fill px-1.5 py-0.5 rounded mt-1 inline-block">
                                      {items.length} parallel
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="border-l-2 border-hairline pl-2 ml-1">
                                  <span className="text-caption text-ink-3">same slot</span>
                                </div>
                              )}
                            </td>

                            {/* Attendee */}
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                                  {(item.personName ?? '?')[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-semibold text-ink leading-tight">{item.personName}</p>
                                  <p className="text-xs text-ink-2 truncate">{item.personCompany || item.personRole}</p>
                                </div>
                              </div>
                            </td>

                            {/* Arrow */}
                            <td className="text-center text-ink-3 text-base select-none">{'\u2194'}</td>

                            {/* Meeting With */}
                            <td className="px-4 py-3.5">
                              {item.sponsorName ? (
                                <div className="flex items-center gap-2.5">
                                  {item.sponsorLogo ? (
                                    <div className="w-8 h-8 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
                                      <Image src={item.sponsorLogo} alt={item.sponsorName} width={32} height={32} className="w-full h-full object-contain" />
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-warning-soft flex items-center justify-center flex-shrink-0">
                                      <span className="text-warning-ink font-bold text-sm">{item.sponsorName[0]}</span>
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-semibold text-ink leading-tight">{item.sponsorName}</p>
                                    {item.sponsorTier && (
                                      <span className={`badge text-caption ${TIER_COLORS[item.sponsorTier]}`}>{item.sponsorTier}</span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-fill flex items-center justify-center text-ink-2 font-bold text-sm flex-shrink-0">
                                    {((item as any).targetName ?? '?')[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-ink leading-tight">{(item as any).targetName ?? '\u2014'}</p>
                                    <p className="text-xs text-ink-2 truncate">{(item as any).targetCompany ?? ''}</p>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Type */}
                            <td className="px-4 py-3.5">
                              <span className={`badge ${item.type === 'sponsor' ? 'bg-warning-soft text-warning-ink' : 'bg-brand-50 text-brand-700'}`}>
                                {item.type === 'sponsor' ? 'Sponsor' : 'Peer'}
                              </span>
                            </td>
                          </tr>
                        ))
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}
