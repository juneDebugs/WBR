'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { MeetingRequestActions } from './MeetingRequestActions'

const TZ = 'America/Los_Angeles'

function fmtTime(d: string | Date, showAmPm = false) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
    hour12: true, timeZone: TZ,
  }).replace(/\s?(AM|PM)/g, (_, p1: string) => showAmPm ? `\u202f${p1.toLowerCase()}` : '')
}
function fmtDate(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ })
}

function CommitPill({ label, n, total, done, warn }: { label: string; n: number; total: number; done: boolean; warn: boolean }) {
  return (
    <div className="inline-flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
      <span className="text-[10px] text-gray-400 font-medium">{label}</span>
      <span className={`text-[11px] font-bold ${done ? 'text-green-600' : warn ? 'text-amber-500' : 'text-red-500'}`}>
        {n}/{total}
      </span>
      {done && <span className="text-green-500 text-[10px]">✓</span>}
    </div>
  )
}

const STATUS_GROUPS = [
  { status: 'PENDING',   label: 'Needs Review',             bg: 'bg-amber-50/70', border: 'border-amber-100', text: 'text-amber-700', dot: 'bg-amber-400' },
  { status: 'APPROVED',  label: 'Approved — Awaiting Slot', bg: 'bg-blue-50/70',  border: 'border-blue-100',  text: 'text-blue-700',  dot: 'bg-blue-400'  },
  { status: 'CONFIRMED', label: 'Confirmed',                bg: 'bg-green-50/70', border: 'border-green-100', text: 'text-green-700', dot: 'bg-green-400' },
  { status: 'REJECTED',  label: 'Rejected',                 bg: 'bg-gray-50',     border: 'border-gray-200',  text: 'text-gray-500',  dot: 'bg-gray-300'  },
]

const TIER_COLORS: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700',
  GOLD:     'bg-amber-100 text-amber-700',
  SILVER:   'bg-gray-100 text-gray-600',
  BRONZE:   'bg-orange-100 text-orange-700',
}

type MeetingRequest = {
  id: string
  status: string
  message: string | null
  timeBlockId: string | null
  timeBlock: { id: string; startsAt: string | Date; endsAt: string | Date; location: string | null } | null
  requester: { id: string; name: string | null; email: string | null; company: string | null; role: string }
  targetUser: { id: string; name: string | null; email: string | null; company: string | null; role: string } | null
  targetSponsor: { id: string; name: string; logoUrl: string | null; tier: string } | null
}

type Block = {
  id: string
  startsAt: string
  endsAt: string
  location: string | null
  requesterWith: string | null
  targetWith: string | null
}

type Participant = {
  id: string; name: string | null; image?: string | null
  company?: string | null; jobTitle?: string | null
  logoUrl?: string | null; tier?: string; isSponsor?: boolean
}

interface Props {
  requests: MeetingRequest[]
  requesterCommitments: Record<string, number>
  sponsorCommitments: Record<string, number>
  bookmarkCommitments: Record<string, number>
}

export function MeetingsTableWithPanel({ requests, requesterCommitments, sponsorCommitments, bookmarkCommitments }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<MeetingRequest | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [requester, setRequester] = useState<Participant | null>(null)
  const [target, setTarget] = useState<Participant | null>(null)
  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState<string | null>(null) // blockId being booked

  const bookSlot = useCallback(async (blockId: string) => {
    if (!selected) return
    setBooking(blockId)
    await fetch(`/api/meeting-requests/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONFIRMED', timeBlockId: blockId }),
    })
    setBooking(null)
    setSelected(null)
    router.refresh()
  }, [selected, router])

  const fetchSchedules = useCallback(async (r: MeetingRequest) => {
    setLoading(true)
    setBlocks([])
    const params = new URLSearchParams({ requesterId: r.requester.id })
    if (r.targetUser) params.set('targetUserId', r.targetUser.id)
    if (r.targetSponsor) params.set('targetSponsorId', r.targetSponsor.id)
    const res = await fetch(`/api/admin/participant-schedules?${params}`)
    const data = await res.json()
    setRequester(data.requester)
    setTarget(data.target)
    setBlocks(data.blocks ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (selected) fetchSchedules(selected)
  }, [selected, fetchSchedules])

  // Close panel on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex gap-5 items-start">
      {/* Table */}
      <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-300 ${selected ? 'flex-1 min-w-0' : 'w-full'}`}>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">From</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Requesting to Meet</th>
              {!selected && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Committed</th>}
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Time Assigned</th>
              {!selected && <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {STATUS_GROUPS.map(group => {
              const groupRows = requests.filter(r => r.status === group.status)
              if (groupRows.length === 0) return null
              return (
                <Fragment key={group.status}>
                  <tr>
                    <td colSpan={selected ? 3 : 5} className={`px-4 py-2 ${group.bg} border-y ${group.border}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${group.dot}`} />
                        <span className={`text-[11px] font-bold uppercase tracking-widest ${group.text}`}>{group.label}</span>
                        <span className="text-xs text-gray-400">· {groupRows.length}</span>
                      </div>
                    </td>
                  </tr>
                  {groupRows.map(r => {
              const sponsor = r.targetSponsor
              const isSelected = selected?.id === r.id
              return (
                <tr
                  key={r.id}
                  onClick={() => setSelected(isSelected ? null : r)}
                  className={`align-middle cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-primary/5 border-l-2 border-primary'
                      : r.status === 'PENDING'
                      ? 'bg-amber-50/40 hover:bg-amber-50'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-primary">
                          {(r.requester.name ?? r.requester.email ?? '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 leading-tight">{r.requester.name ?? '—'}</p>
                        <p className="text-xs text-gray-400 truncate">{r.requester.company ?? r.requester.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {sponsor?.logoUrl && (
                        <Image src={sponsor.logoUrl} alt={sponsor.name} width={24} height={24} className="w-6 h-6 object-contain rounded flex-shrink-0" />
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{sponsor?.name ?? r.targetUser?.name ?? '—'}</p>
                        <p className="text-xs text-gray-400">
                          {sponsor
                            ? <span className={`badge ${TIER_COLORS[sponsor.tier]}`}>{sponsor.tier}</span>
                            : r.targetUser?.company ?? r.targetUser?.role}
                        </p>
                      </div>
                    </div>
                  </td>
                  {!selected && (
                    <td className="px-4 py-3">
                      {r.targetSponsor ? (() => {
                        const n = sponsorCommitments[r.targetSponsor.id] ?? 0
                        const done = n >= 10
                        return <CommitPill label="1-1" n={n} total={10} done={done} warn={n >= 7} />
                      })() : (
                        <div className="flex items-center gap-2">
                          {(() => {
                            const n = requesterCommitments[r.requester.id] ?? 0
                            return <CommitPill label="1-1" n={n} total={10} done={n >= 10} warn={n >= 7} />
                          })()}
                          {(() => {
                            const n = bookmarkCommitments[r.requester.id] ?? 0
                            return <CommitPill label="Events" n={n} total={2} done={n >= 2} warn={false} />
                          })()}
                        </div>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.timeBlock ? (
                      <div>
                        <p className="text-xs font-medium text-indigo-600">
                          {fmtDate(r.timeBlock.startsAt)}, {fmtTime(r.timeBlock.startsAt)}–{fmtTime(r.timeBlock.endsAt, true)}
                        </p>
                        {r.timeBlock.location && <p className="text-xs text-gray-400">{r.timeBlock.location}</p>}
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">Not assigned</span>
                    )}
                  </td>
                  {!selected && (
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <MeetingRequestActions
                        requestId={r.id}
                        status={r.status}
                        currentTimeBlockId={r.timeBlockId ?? null}
                      />
                    </td>
                  )}
                </tr>
              )
                  })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {requests.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-sm">No meeting requests yet.</p>
        )}
      </div>

      {/* Schedule panel */}
      {selected && (
        <div className="w-80 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Schedules</p>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Participants row */}
          <div className="grid grid-cols-2 divide-x divide-gray-100 border-b border-gray-100">
            {[
              { p: requester, label: 'Requester' },
              { p: target, label: selected.targetSponsor ? 'Sponsor' : 'Target' },
            ].map(({ p, label }) => (
              <div key={label} className="px-3 py-2.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                {p ? (
                  <div className="flex items-center gap-2">
                    {(p.image || p.logoUrl) ? (
                      <img src={(p.image ?? p.logoUrl)!} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-primary">{(p.name ?? '?')[0]}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 truncate">{p.name ?? '—'}</p>
                      <p className="text-[10px] text-gray-400 truncate">{p.company ?? p.jobTitle ?? ''}</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-6 w-24 bg-gray-100 rounded animate-pulse" />
                )}
              </div>
            ))}
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-2 px-3 py-1.5 bg-gray-50/80 border-b border-gray-100">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              {requester?.name?.split(' ')[0] ?? 'Requester'}
            </span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
              {target?.name?.split(' ')[0] ?? 'Target'}
            </span>
          </div>

          {/* Blocks grouped by day */}
          <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
            {loading ? (
              <div className="space-y-2 p-3">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : blocks.length === 0 ? (
              <p className="text-center text-gray-400 text-xs py-8">No time blocks found</p>
            ) : (() => {
              // Group blocks by day
              const byDay = new Map<string, typeof blocks>()
              for (const b of blocks) {
                const day = new Date(b.startsAt).toISOString().slice(0, 10)
                if (!byDay.has(day)) byDay.set(day, [])
                byDay.get(day)!.push(b)
              }
              return Array.from(byDay.entries()).map(([day, dayBlocks]) => (
                <div key={day}>
                  {/* Day header */}
                  <div className="sticky top-0 z-10 px-3 py-1.5 bg-gray-100/90 backdrop-blur-sm border-y border-gray-200">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      {new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })}
                    </span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {dayBlocks.map(block => {
                      const isThisRequest = selected.timeBlock?.id === block.id
                      const bothFree = !block.requesterWith && !block.targetWith
                      const canBook = bothFree && !isThisRequest && selected.status !== 'CONFIRMED' && selected.status !== 'REJECTED'
                      const isBooking = booking === block.id

                      return (
                        <div
                          key={block.id}
                          onClick={e => { e.stopPropagation(); if (canBook) bookSlot(block.id) }}
                          className={`transition-colors ${
                            isThisRequest
                              ? 'bg-indigo-50 border-l-2 border-indigo-400'
                              : bothFree
                              ? 'bg-green-50/70 border-l-2 border-green-400 hover:bg-green-100/80 cursor-pointer'
                              : 'border-l-2 border-transparent'
                          }`}
                        >
                          {/* Time + location */}
                          <div className="flex items-center justify-between px-3 pt-2 pb-1">
                            <span className={`text-xs font-bold tabular-nums ${
                              isThisRequest ? 'text-indigo-700' : bothFree ? 'text-green-800' : 'text-gray-600'
                            }`}>
                              {fmtTime(block.startsAt)}–{fmtTime(block.endsAt, true)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {isThisRequest && (
                                <span className="text-[9px] font-bold text-indigo-600 bg-indigo-100 px-1.5 py-0.5 rounded-full">Assigned</span>
                              )}
                              {bothFree && !isThisRequest && (
                                <span className="text-[9px] font-bold text-green-700 bg-green-200 px-1.5 py-0.5 rounded-full">Both free</span>
                              )}
                              {block.location && (
                                <span className="text-[9px] text-gray-400">{block.location}</span>
                              )}
                            </div>
                          </div>

                          {/* Availability cells */}
                          <div className="grid grid-cols-2 gap-1.5 px-3 pb-2">
                            <div className={`px-2 py-1 rounded-md text-[10px] ${
                              block.requesterWith
                                ? 'bg-red-50 text-red-600 border border-red-100'
                                : 'bg-green-50 text-green-700 border border-green-100'
                            }`}>
                              {block.requesterWith
                                ? <span className="truncate block" title={block.requesterWith}>↔ {block.requesterWith}</span>
                                : '✓ Free'}
                            </div>
                            <div className={`px-2 py-1 rounded-md text-[10px] ${
                              block.targetWith
                                ? 'bg-red-50 text-red-600 border border-red-100'
                                : 'bg-green-50 text-green-700 border border-green-100'
                            }`}>
                              {block.targetWith
                                ? <span className="truncate block" title={block.targetWith}>↔ {block.targetWith}</span>
                                : '✓ Free'}
                            </div>
                          </div>

                          {/* Book button — full width on bookable slots */}
                          {canBook && (
                            <div className="px-3 pb-2.5">
                              <button
                                onClick={e => { e.stopPropagation(); bookSlot(block.id) }}
                                disabled={!!booking}
                                className="w-full py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 shadow-sm"
                              >
                                {isBooking ? 'Booking…' : 'Book this slot'}
                              </button>
                            </div>
                          )}
                          {isThisRequest && selected.status === 'CONFIRMED' && (
                            <div className="px-3 pb-2.5">
                              <div className="w-full py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold text-center">
                                ✓ Booked
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>

          {/* Actions at bottom — only show for non-bookable states */}
          {selected.status === 'CONFIRMED' && (
            <div className="border-t border-gray-100 px-3 py-3" onClick={e => e.stopPropagation()}>
              <MeetingRequestActions
                requestId={selected.id}
                status={selected.status}
                currentTimeBlockId={selected.timeBlockId ?? null}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
