'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import type { AutoMatch, AutoMatchHalf, AutoMatchLogEntry, RescheduleAvailability } from '@conference/db'
import { useAutoMatchBoard, invalidateScheduler } from '@/lib/scheduler-hooks'
import { fmtSlotRange, fmtSlotTime } from '@/lib/format'
import { PRIORITY_LABEL, TIER_COLORS, TIER_FALLBACK } from '@/lib/meetings-ui'

const fmtPickDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const fmtLogTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function initial(name: string | null | undefined) {
  return (name?.trim()[0] ?? '?').toUpperCase()
}

// Group the flat, engine-ordered match list by sponsor company, companies
// alphabetical, matches keeping engine order (awaiting first, then by slot).
function groupByCompany(matches: AutoMatch[]) {
  const groups = new Map<string, { sponsor: AutoMatch['sponsor']; matches: AutoMatch[] }>()
  for (const m of matches) {
    let g = groups.get(m.sponsor.id)
    if (!g) {
      g = { sponsor: m.sponsor, matches: [] }
      groups.set(m.sponsor.id, g)
    }
    g.matches.push(m)
  }
  return Array.from(groups.values()).sort((a, b) => a.sponsor.name.localeCompare(b.sponsor.name))
}

// Mutual Best Fit matches: when a sponsor and an attendee each pick the other
// as Best Fit through their portals, the pair matches and the meeting is
// scheduled automatically (at pick time, with a self-healing sweep on every
// board read). This board is the record of that automation: matches sectioned
// by company, plus the audit log of match/schedule events.
export function AutoMatchBoard() {
  const { data: board, isLoading, isError, refetch } = useAutoMatchBoard()

  // Memoized so the Map build + alphabetical sort don't run on every render
  // (kept above the early returns so hook order stays stable).
  const companies = useMemo(() => (board ? groupByCompany(board.matches) : []), [board])

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-4 py-3" role="alert">
        Couldn&rsquo;t load auto matches.{' '}
        <button type="button" onClick={() => refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !board) return <BoardSkeleton />

  return (
    <div>
      {/* ── Summary tiles ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-2">
        <div className="grid grid-cols-4 gap-3 flex-1 max-w-2xl">
          {([
            { label: 'Mutual Matches', val: board.totals.matches, num: 'text-ink' },
            { label: 'Auto-Scheduled', val: board.totals.scheduled, num: 'text-success-ink' },
            { label: 'Awaiting Slot', val: board.totals.ready, num: board.totals.ready > 0 ? 'text-warning-ink' : 'text-ink' },
            { label: 'Awaiting Reciprocation', val: board.totals.awaitingReciprocation, num: 'text-ink' },
          ] as const).map(({ label, val, num }) => (
            <div key={label} className="bg-white border border-hairline rounded-xl px-4 py-3">
              <p className="text-caption text-ink-2 font-medium mb-1.5">{label}</p>
              <p className={`text-2xl font-bold tabular-nums ${num}`}>{val}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-caption text-ink-3 mb-5">
        When a sponsor and an attendee each pick the other as Best Fit, the meeting is scheduled automatically.
        One-sided Best Fit picks wait here until the other side reciprocates.
      </p>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr),320px] lg:gap-6 space-y-6 lg:space-y-0">
        {/* ── Matches, sectioned by company ── */}
        <div>
          {companies.length === 0 && board.halfMatches.length === 0 ? (
            <div className="empty-state bg-white border border-hairline rounded-xl">
              <p className="font-medium text-ink">No mutual matches yet</p>
              <p className="text-sm text-ink-2 max-w-md">
                A match forms — and its meeting is scheduled automatically — the moment a sponsor and an
                attendee each pick the other as <span className="font-medium">Best Fit</span> through their portals.
              </p>
              <Link href="?tab=requests" className="mt-2 text-primary text-sm hover:underline">
                View all meeting requests {'→'}
              </Link>
            </div>
          ) : companies.length === 0 ? (
            <p className="text-sm text-ink-3">
              No mutual matches yet — a match forms, and its meeting is scheduled automatically, the moment
              a sponsor and an attendee each pick the other as Best Fit through their portals.
            </p>
          ) : (
            <div className="space-y-6">
              {companies.map(({ sponsor, matches }) => (
                <CompanySection key={sponsor.id} sponsor={sponsor} matches={matches} />
              ))}
            </div>
          )}

          {/* ── Half matches: one side picked Best Fit, the other hasn't yet ── */}
          {board.halfMatches.length > 0 && (
            <section aria-label="Best Fit picks awaiting reciprocation" className="mt-6">
              <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">
                Awaiting Reciprocation {'·'} {board.halfMatches.length}
              </p>
              <div className="space-y-2">
                {board.halfMatches.map(half => (
                  <HalfMatchCard key={half.key} half={half} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ── Activity log ── */}
        <aside aria-label="Auto-match activity log">
          <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">Activity</p>
          <div className="bg-white border border-hairline rounded-xl overflow-hidden">
            {board.log.length === 0 ? (
              <p className="text-sm text-ink-3 px-4 py-6 text-center">No activity yet</p>
            ) : (
              <ol className="divide-y divide-hairline max-h-[36rem] overflow-y-auto">
                {board.log.map(entry => (
                  <LogRow key={entry.id} entry={entry} />
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function CompanySection({ sponsor, matches }: { sponsor: AutoMatch['sponsor']; matches: AutoMatch[] }) {
  const scheduled = matches.filter(m => m.meeting).length
  return (
    <section aria-label={`${sponsor.name} auto matches`}>
      <div className="flex items-center gap-2.5 mb-2">
        {sponsor.logoUrl ? (
          <div className="w-7 h-7 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
            <Image src={sponsor.logoUrl} alt="" width={28} height={28} className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold text-xs flex-shrink-0">
            {initial(sponsor.name)}
          </div>
        )}
        <h3 className="font-semibold text-ink">{sponsor.name}</h3>
        <span className={`badge text-caption ${TIER_COLORS[sponsor.tier] ?? TIER_FALLBACK}`}>{sponsor.tier}</span>
        <span className={`badge text-caption tabular-nums ml-auto ${scheduled === matches.length ? 'badge-success' : 'badge-neutral'}`}>
          {scheduled} of {matches.length} scheduled
        </span>
      </div>
      <div className="space-y-2">
        {matches.map(m => (
          <MatchCard key={m.key} match={m} />
        ))}
      </div>
    </section>
  )
}

// One matched pair within its company section: the attendee, the mutual-pick
// signal, both picks' provenance, the auto-scheduled slot/room (or the waiting
// state when every slot is currently taken), and reschedule/cancel actions.
function MatchCard({ match }: { match: AutoMatch }) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<'reschedule' | 'cancel' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const done = () => {
    setDialog(null)
    setActionError(null)
    invalidateScheduler(queryClient)
  }

  return (
    <div className="bg-white border border-hairline rounded-xl px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Attendee */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-48">
          <div className="rounded-full bg-gradient-to-b from-[#a5b4fc] to-[#4f46e5] p-[2px] flex-shrink-0 shadow-sm">
            {match.attendee.image ? (
              <img
                src={match.attendee.image}
                alt=""
                className="w-9 h-9 rounded-full object-cover block"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {initial(match.attendee.name)}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink leading-tight truncate">{match.attendee.name}</p>
            {match.attendee.company && <p className="text-xs text-ink-2 truncate">{match.attendee.company}</p>}
          </div>
        </div>

        {/* Mutual badge */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="badge badge-brand whitespace-nowrap">{'↔'} Mutual Best Fit</span>
          {match.score > 0 && <span className="text-caption text-ink-3 tabular-nums">{match.score}% fit</span>}
        </div>

        {/* Outcome + actions */}
        <div className="flex-shrink-0 text-right ml-auto">
          {match.meeting ? (
            <>
              <span className="badge badge-success">{'✓'} Scheduled</span>
              <p className="text-xs text-ink-2 tabular-nums mt-1">
                {fmtSlotRange(match.meeting.startsAt, match.meeting.endsAt)}
                {match.meeting.room && <span className="text-ink-3"> {'·'} {match.meeting.room}</span>}
              </p>
              <div className="flex justify-end gap-1 mt-1">
                <button
                  type="button"
                  onClick={() => { setActionError(null); setDialog('reschedule') }}
                  className="btn-ghost btn-sm"
                  aria-label={`Reschedule meeting — ${match.sponsor.name} with ${match.attendee.name}`}
                >
                  Reschedule
                </button>
                <button
                  type="button"
                  onClick={() => { setActionError(null); setDialog('cancel') }}
                  className="btn-ghost btn-sm text-danger"
                  aria-label={`Cancel meeting — ${match.sponsor.name} with ${match.attendee.name}`}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="badge badge-warning">Awaiting slot</span>
              <p className="text-caption text-ink-3 mt-1">Schedules when a slot frees up</p>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="mt-2 rounded-xl bg-danger-soft text-danger-ink text-xs px-3 py-2" role="alert">
          {actionError}
        </div>
      )}

      {dialog === 'reschedule' && match.meeting && (
        <RescheduleSheet
          match={match}
          meeting={match.meeting}
          onClose={() => setDialog(null)}
          onDone={done}
          onError={setActionError}
        />
      )}
      {dialog === 'cancel' && match.meeting && (
        <CancelDialog
          match={match}
          meeting={match.meeting}
          onClose={() => setDialog(null)}
          onDone={done}
          onError={setActionError}
        />
      )}

      {/* Pick provenance */}
      <p className="text-caption text-ink-3 mt-2">
        {match.sponsorPick.byName} picked Best Fit {fmtPickDate(match.sponsorPick.pickedAt)}
        <span className="mx-1">{'·'}</span>
        {match.attendeePick.byName} picked Best Fit {fmtPickDate(match.attendeePick.pickedAt)}
        <span className="mx-1">{'·'}</span>
        Matched {fmtPickDate(match.matchedAt)}
        {match.matchedSolutions.length > 0 && (
          <>
            <span className="mx-1">{'·'}</span>
            {match.matchedSolutions.slice(0, 3).join(', ')}
            {match.matchedSolutions.length > 3 && ` +${match.matchedSolutions.length - 3}`}
          </>
        )}
      </p>
    </div>
  )
}

// A one-sided Best Fit pick: one side has picked, the other hasn't yet. Every
// sponsor↔attendee Best Fit pick lives on this board — mutual pairs schedule
// automatically above; these wait for the other side to reciprocate. No
// actions: the card resolves organically when the counterpart picks.
function HalfMatchCard({ half }: { half: AutoMatchHalf }) {
  const waitingOn = half.pickedBy === 'ATTENDEE' ? half.sponsor.name : half.attendee.name
  return (
    <div className="bg-white border border-hairline rounded-xl px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Sponsor */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-48">
          {half.sponsor.logoUrl ? (
            <div className="w-7 h-7 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
              <Image src={half.sponsor.logoUrl} alt="" width={28} height={28} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold text-xs flex-shrink-0">
              {initial(half.sponsor.name)}
            </div>
          )}
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-semibold text-ink leading-tight truncate">{half.sponsor.name}</p>
            <span className={`badge text-caption flex-shrink-0 ${TIER_COLORS[half.sponsor.tier] ?? TIER_FALLBACK}`}>
              {half.sponsor.tier}
            </span>
          </div>
        </div>

        {/* Attendee */}
        <div className="min-w-0 flex-1 basis-48">
          <p className="font-semibold text-ink leading-tight truncate">{half.attendee.name}</p>
          {half.attendee.company && <p className="text-xs text-ink-2 truncate">{half.attendee.company}</p>}
        </div>

        {/* One-directional signal */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0 ml-auto">
          <span className="badge badge-neutral whitespace-nowrap">{'→'} Best Fit {'·'} one side</span>
          {half.score > 0 && <span className="text-caption text-ink-3 tabular-nums">{half.score}% fit</span>}
        </div>
      </div>

      {/* Pick provenance + what's awaited */}
      <p className="text-caption text-ink-3 mt-2">
        {half.pick.byName} picked Best Fit {fmtPickDate(half.pick.pickedAt)}
        <span className="mx-1">{'·'}</span>
        waiting on {waitingOn}
        {half.counterpartPriority && (
          <>
            <span className="mx-1">{'·'}</span>
            other side picked {PRIORITY_LABEL[half.counterpartPriority]}
          </>
        )}
      </p>
    </div>
  )
}

const LOG_STYLE: Record<string, { dot: string; label: string }> = {
  MATCHED: { dot: 'bg-brand', label: 'Matched · both picked Best Fit' },
  SCHEDULED: { dot: 'bg-success', label: 'Meeting auto-scheduled' },
  RESCHEDULED: { dot: 'bg-warning', label: 'Meeting rescheduled' },
  CANCELLED: { dot: 'bg-danger', label: 'Meeting cancelled — match dissolved' },
}

function LogRow({ entry }: { entry: AutoMatchLogEntry }) {
  const style = LOG_STYLE[entry.event] ?? LOG_STYLE.MATCHED
  const showSlot = entry.event === 'SCHEDULED' || entry.event === 'RESCHEDULED'
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start gap-2">
        <span aria-hidden="true" className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink leading-snug">
            {entry.sponsorName} {'↔'} {entry.attendeeName}
          </p>
          <p className="text-caption text-ink-2 leading-snug">
            {style.label}
            {showSlot && entry.room && <> {'·'} {entry.room}</>}
            {showSlot && entry.startsAt && <> {'·'} {fmtSlotTime(entry.startsAt)}</>}
          </p>
          <p className="text-caption text-ink-3 tabular-nums">{fmtLogTime(entry.createdAt)}</p>
        </div>
      </div>
    </li>
  )
}

// ── Card actions ─────────────────────────────────────────────────────────────

async function meetingAction(url: string, init: RequestInit): Promise<void> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  if (!r.ok) {
    const d = await r.json().catch(() => ({}))
    throw new Error(d.error ?? `Request failed (${r.status})`)
  }
}

// Slot + room picker for moving an auto-scheduled meeting. Availability comes
// from the shared scheduler endpoint (the moved meeting reads as free in it).
function RescheduleSheet({ match, meeting, onClose, onDone, onError }: {
  match: AutoMatch
  meeting: NonNullable<AutoMatch['meeting']>
  onClose: () => void
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [availability, setAvailability] = useState<RescheduleAvailability | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/scheduler/meetings/${encodeURIComponent(meeting.sponsorMeetingId)}/availability`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(a => { if (alive) setAvailability(a) })
      .catch(() => { if (alive) setLoadError(true) })
    return () => { alive = false }
  }, [meeting.sponsorMeetingId])

  const slots = availability?.days.flatMap(d => d.slots) ?? []
  const selected = slots.find(s => s.timeBlockId === slotId) ?? null
  const freeRooms = selected?.rooms.filter(r => r.available) ?? []

  async function save() {
    if (!slotId || !room) return
    setSaving(true)
    try {
      await meetingAction(`/api/admin/scheduler/auto/meetings/${encodeURIComponent(meeting.sponsorMeetingId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ timeBlockId: slotId, room }),
      })
      onDone()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Reschedule failed')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Reschedule meeting" className="bg-surface rounded-2xl p-5 shadow-elevated max-w-md w-full">
        <h2 className="font-semibold text-ink text-base">Reschedule Meeting</h2>
        <p className="text-sm text-ink-2 mt-1">
          {match.sponsor.name} {'↔'} {match.attendee.name} {'·'} currently {fmtSlotRange(meeting.startsAt, meeting.endsAt)}
          {meeting.room && <> {'·'} {meeting.room}</>}
        </p>

        {loadError ? (
          <p className="text-sm text-danger mt-4">Couldn&rsquo;t load open slots. Close and try again.</p>
        ) : !availability ? (
          <div className="mt-4 space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="mt-4 max-h-64 overflow-y-auto space-y-3 pr-1">
              {availability.days.map(day => (
                <div key={day.dayKey}>
                  <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-1.5">{day.label}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {day.slots.map(slot => {
                      const isCurrent = slot.timeBlockId === availability.current.timeBlockId
                      const active = slotId === slot.timeBlockId
                      return (
                        <button
                          key={slot.timeBlockId}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => {
                            setSlotId(slot.timeBlockId)
                            const free = slot.rooms.filter(r => r.available)
                            setRoom(isCurrent && availability.current.room && free.some(r => r.name === availability.current.room)
                              ? availability.current.room
                              : free[0]?.name ?? null)
                          }}
                          className={`px-2.5 py-2 rounded-xl text-xs font-medium text-left transition-colors border ${
                            active
                              ? 'bg-primary text-white border-transparent shadow-sm'
                              : slot.available
                                ? 'bg-white border-hairline text-ink hover:bg-fill'
                                : 'bg-fill border-transparent text-ink-3 cursor-not-allowed'
                          }`}
                        >
                          <span className="tabular-nums">{fmtSlotRange(slot.startsAt, slot.endsAt)}</span>
                          {isCurrent && <span className={`ml-1 ${active ? 'opacity-80' : 'text-ink-3'}`}>{'·'} current</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            {selected && (
              <div className="mt-3 flex items-center gap-2">
                <label htmlFor={`room-${meeting.sponsorMeetingId}`} className="text-xs font-medium text-ink-2">Room</label>
                <select
                  id={`room-${meeting.sponsorMeetingId}`}
                  value={room ?? ''}
                  onChange={e => setRoom(e.target.value)}
                  className="input text-xs flex-1"
                >
                  {freeRooms.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary btn-sm">Close</button>
          <button type="button" onClick={save} disabled={saving || !slotId || !room} className="btn-primary btn-sm">
            {saving ? 'Working…' : 'Move Meeting'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CancelDialog({ match, meeting, onClose, onDone, onError }: {
  match: AutoMatch
  meeting: NonNullable<AutoMatch['meeting']>
  onClose: () => void
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function confirm() {
    setSaving(true)
    try {
      await meetingAction(`/api/admin/scheduler/auto/meetings/${encodeURIComponent(meeting.sponsorMeetingId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() || null }),
      })
      onDone()
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Cancel failed')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label="Cancel meeting" className="bg-surface rounded-2xl p-5 shadow-elevated max-w-md w-full">
        <h2 className="font-semibold text-ink text-base">Cancel Meeting?</h2>
        <p className="text-sm text-ink-2 mt-2">
          {match.sponsor.name} {'↔'} {match.attendee.name} {'·'} {fmtSlotRange(meeting.startsAt, meeting.endsAt)}
          {meeting.room && <> {'·'} {meeting.room}</>}
        </p>
        <p className="text-sm text-ink-2 mt-2">
          This also dissolves the match: both Best Fit picks are withdrawn, so it won&rsquo;t be rescheduled
          automatically. If both sides pick each other again, a new match forms.
        </p>
        <input
          type="text"
          className="input text-sm w-full mt-3"
          placeholder="Reason (optional)"
          aria-label="Cancellation reason"
          value={reason}
          onChange={e => setReason(e.target.value)}
          maxLength={300}
        />
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary btn-sm">Keep Meeting</button>
          <button type="button" onClick={confirm} disabled={saving} className="btn-danger btn-sm">
            {saving ? 'Working…' : 'Cancel Meeting'}
          </button>
        </div>
      </div>
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-4 gap-3 max-w-2xl mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-hairline rounded-xl px-4 py-3">
            <div className="skeleton h-3 w-20 mb-2" />
            <div className="skeleton h-8 w-10" />
          </div>
        ))}
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr),320px] lg:gap-6 space-y-6 lg:space-y-0">
        <div className="space-y-2">
          <div className="skeleton h-6 w-56 mb-2" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-hairline rounded-xl px-4 py-4 flex items-center gap-4">
              <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-4 w-28 mx-auto" />
              <div className="skeleton h-4 w-24 ml-auto" />
            </div>
          ))}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    </div>
  )
}
