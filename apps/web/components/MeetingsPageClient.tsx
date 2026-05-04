'use client'

import { useMeetingsData } from '@/lib/hooks'
import { AutoScheduleButton } from '@/components/AutoScheduleButton'
import { MeetingsTableWithPanel } from '@/components/MeetingsTableWithPanel'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const TZ = 'America/Los_Angeles'
function fmtTime(d: Date | string, showAmPm = false) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ,
  }).replace(/\s?(AM|PM)/g, (_, p1: string) => showAmPm ? `\u202f${p1.toLowerCase()}` : '')
}

const TIER_COLORS: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700',
  GOLD:     'bg-amber-100 text-amber-700',
  SILVER:   'bg-gray-100 text-gray-600',
  BRONZE:   'bg-orange-100 text-orange-700',
}

export default function MeetingsPageClient() {
  const searchParams = useSearchParams()
  const { data, isLoading } = useMeetingsData()

  const tab = searchParams.get('tab') === 'schedule' ? 'schedule' : 'requests'
  const statusFilter = searchParams.get('status')?.toUpperCase()
  const typeFilter = searchParams.get('type') === 'attendee' ? 'attendee' : searchParams.get('type') === 'sponsor' ? 'sponsor' : undefined

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-6">
          <div className="h-10 w-36 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-10 w-36 bg-gray-200 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="h-3 w-16 bg-gray-100 rounded animate-pulse mb-2" />
              <div className="h-8 w-12 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
              <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  const allMeetingRequests = data?.allMeetingRequests ?? []
  const sponsorMeetings = data?.sponsorMeetings ?? []
  const bookmarkCounts = data?.bookmarkCounts ?? []

  // Compute status counts in-memory from all requests
  const counts: Record<string, number> = {}
  for (const r of allMeetingRequests) {
    counts[r.status] = (counts[r.status] ?? 0) + 1
  }

  // Compute requester commitments in-memory (non-rejected/cancelled)
  const requesterCommitments: Record<string, number> = {}
  for (const r of allMeetingRequests) {
    if (r.status !== 'REJECTED' && r.status !== 'CANCELLED') {
      requesterCommitments[r.requesterId] = (requesterCommitments[r.requesterId] ?? 0) + 1
    }
  }

  // Compute sponsor commitments in-memory (non-cancelled sponsor meetings)
  const sponsorCommitments: Record<string, number> = {}
  for (const sm of sponsorMeetings) {
    if (sm.status !== 'CANCELLED') {
      sponsorCommitments[sm.sponsorId] = (sponsorCommitments[sm.sponsorId] ?? 0) + 1
    }
  }

  const bookmarkCommitments = Object.fromEntries(bookmarkCounts.map((r: any) => [r.userId, r._count._all]))

  // Apply filters for the displayed list
  const meetingRequests = allMeetingRequests.filter((r: any) => {
    if (statusFilter && ['PENDING', 'APPROVED', 'CONFIRMED', 'REJECTED'].includes(statusFilter) && r.status !== statusFilter) return false
    if (typeFilter === 'sponsor' && r.targetSponsorId === null) return false
    if (typeFilter === 'attendee' && r.targetSponsorId !== null) return false
    return true
  })

  // Filter sponsor meetings to confirmed only for schedule view
  const confirmedSponsorMeetings = sponsorMeetings.filter((sm: any) => sm.status === 'CONFIRMED')

  // Build master schedule: group confirmed sponsor meetings by time slot
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

  // Sponsor fill-rate summary (for schedule tab)
  const sponsorFillMap = new Map<string, { id: string; name: string; tier: string; logoUrl: string | null; count: number }>()
  for (const sm of confirmedSponsorMeetings) {
    const id = sm.sponsor.id
    if (!sponsorFillMap.has(id)) sponsorFillMap.set(id, { id, name: sm.sponsor.name, tier: sm.sponsor.tier, logoUrl: sm.sponsor.logoUrl, count: 0 })
    sponsorFillMap.get(id)!.count++
  }
  const sponsorFillRate = Array.from(sponsorFillMap.values()).sort((a, b) => b.count - a.count)

  // Group by day then by time slot
  const scheduleByDay = new Map<string, Map<string, typeof allConfirmed>>()
  for (const item of allConfirmed) {
    const day = new Date(item.timeBlock.startsAt).toISOString().slice(0, 10)
    const slot = item.timeBlock.id
    if (!scheduleByDay.has(day)) scheduleByDay.set(day, new Map())
    const dayMap = scheduleByDay.get(day)!
    if (!dayMap.has(slot)) dayMap.set(slot, [])
    dayMap.get(slot)!.push(item)
  }

  return (
    <>
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="?tab=requests"
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'requests' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          Meeting Requests
          {(counts.PENDING ?? 0) > 0 && (
            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              tab === 'requests' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'
            }`}>{counts.PENDING} pending</span>
          )}
        </Link>
        <Link href="?tab=schedule"
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            tab === 'schedule' ? 'bg-primary text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          Master Schedule
          <span className={`ml-1.5 text-xs opacity-70`}>{allConfirmed.length}</span>
        </Link>
        <Link href="/dashboard/meetings/new" className="ml-auto text-sm px-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 font-medium transition-colors">
          + New Time Block
        </Link>
      </div>

      {/* -- KPI STRIP -- */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {([
          { label: 'Pending',   val: counts.PENDING   ?? 0, status: 'pending',   dot: 'bg-amber-400', num: 'text-amber-600' },
          { label: 'Approved',  val: counts.APPROVED  ?? 0, status: 'approved',  dot: 'bg-blue-400',  num: 'text-blue-600'  },
          { label: 'Confirmed', val: counts.CONFIRMED ?? 0, status: 'confirmed', dot: 'bg-green-400', num: 'text-green-600' },
          { label: 'Rejected',  val: counts.REJECTED  ?? 0, status: 'rejected',  dot: 'bg-gray-300',  num: 'text-gray-500'  },
        ] as const).map(({ label, val, status, dot, num }) => (
          <Link key={label} href={`?tab=requests&status=${status}`}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-gray-300 hover:shadow-sm transition-all group">
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              <p className="text-[11px] text-gray-400 font-medium">{label}</p>
            </div>
            <p className={`text-2xl font-bold ${num}`}>{val}</p>
          </Link>
        ))}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-gray-400 font-medium">Sponsor Slots</p>
            <p className="text-[10px] text-gray-300">/ 200</p>
          </div>
          <p className="text-2xl font-bold text-gray-800">
            {confirmedSponsorMeetings.length}
          </p>
          <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-400 rounded-full transition-all"
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
                        ? 'bg-gray-900 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
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
                    ? 'bg-gray-900 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Sponsor Meeting Fill Rate</p>
              <div className="flex flex-wrap gap-2">
                {sponsorFillRate.map(sp => {
                  const pct = Math.min((sp.count / 10) * 100, 100)
                  const color = sp.count >= 10 ? 'bg-green-400' : sp.count >= 7 ? 'bg-amber-400' : 'bg-blue-300'
                  const textColor = sp.count >= 10 ? 'text-green-600' : sp.count >= 7 ? 'text-amber-500' : 'text-gray-400'
                  const borderColor = sp.count >= 10 ? 'border-green-200' : sp.count >= 7 ? 'border-amber-200' : 'border-gray-200'
                  return (
                    <div key={sp.id} className={`flex items-center gap-2.5 bg-white border ${borderColor} rounded-xl px-3 py-2`}>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 leading-tight">{sp.name}</p>
                        <p className={`text-[10px] font-bold ${textColor}`}>{sp.count}/10</p>
                      </div>
                      <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {allConfirmed.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
              <p className="font-medium text-gray-700">No confirmed meetings yet</p>
              <p className="text-sm text-gray-400 mt-1">Approve and assign time blocks to requests to build the schedule.</p>
              <Link href="?tab=requests" className="mt-3 inline-block text-primary text-sm hover:underline">
                Go to Meeting Requests {'\u2192'}
              </Link>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Time</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendee</th>
                    <th className="w-8"></th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Meeting With</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Array.from(scheduleByDay.entries()).map(([day, slotMap]) => (
                    <>
                      {/* Day separator row */}
                      <tr key={`day-${day}`} className="bg-gray-50/80">
                        <td colSpan={5} className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">
                          {new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })}
                          <span className="ml-2 font-normal normal-case text-gray-400">
                            {'\u00b7'} {Array.from(slotMap.values()).flat().length} meetings
                          </span>
                        </td>
                      </tr>

                      {Array.from(slotMap.entries()).map(([slotId, items]) => {
                        const tb = items[0].timeBlock
                        return items.map((item, i) => (
                          <tr key={item.id} className="hover:bg-gray-50 align-middle">
                            {/* Time -- only on first row of slot */}
                            <td className="px-4 py-3.5 whitespace-nowrap align-middle">
                              {i === 0 ? (
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">
                                    {fmtTime(tb.startsAt)}
                                    <span className="text-gray-400 font-normal">{'\u2013'}{fmtTime(tb.endsAt, true)}</span>
                                  </p>
                                  {tb.location && (
                                    <p className="text-[11px] text-gray-400 mt-0.5">{tb.location}</p>
                                  )}
                                  {items.length > 1 && (
                                    <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-1 inline-block">
                                      {items.length} parallel
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="border-l-2 border-gray-100 pl-2 ml-1">
                                  <span className="text-[10px] text-gray-300">same slot</span>
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
                                  <p className="font-semibold text-gray-900 leading-tight">{item.personName}</p>
                                  <p className="text-xs text-gray-400 truncate">{item.personCompany || item.personRole}</p>
                                </div>
                              </div>
                            </td>

                            {/* Arrow */}
                            <td className="text-center text-gray-300 text-base select-none">{'\u2194'}</td>

                            {/* Meeting With */}
                            <td className="px-4 py-3.5">
                              {item.sponsorName ? (
                                <div className="flex items-center gap-2.5">
                                  {item.sponsorLogo ? (
                                    <div className="w-8 h-8 rounded-lg border border-gray-100 bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
                                      <Image src={item.sponsorLogo} alt={item.sponsorName} width={32} height={32} className="w-full h-full object-contain" />
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                      <span className="text-amber-700 font-bold text-sm">{item.sponsorName[0]}</span>
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 leading-tight">{item.sponsorName}</p>
                                    {item.sponsorTier && (
                                      <span className={`badge text-[10px] ${TIER_COLORS[item.sponsorTier]}`}>{item.sponsorTier}</span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-sm flex-shrink-0">
                                    {((item as any).targetName ?? '?')[0]?.toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 leading-tight">{(item as any).targetName ?? '\u2014'}</p>
                                    <p className="text-xs text-gray-400 truncate">{(item as any).targetCompany ?? ''}</p>
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Type */}
                            <td className="px-4 py-3.5">
                              <span className={`badge ${item.type === 'sponsor' ? 'bg-amber-50 text-amber-700' : 'bg-indigo-50 text-indigo-700'}`}>
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
