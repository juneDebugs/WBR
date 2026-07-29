'use client'

import { useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import type { BankItem, MatrixSlot, MiscItem, PendingItem, ScheduledItem } from '@conference/db'
import { useCompanySchedule, invalidateScheduler } from '@/lib/scheduler-hooks'
import { AssignMeetingSheet } from '@/components/AssignMeetingSheet'
import { RescheduleMeetingSheet } from '@/components/RescheduleMeetingSheet'
import { CancelMeetingDialog } from '@/components/CancelMeetingDialog'
import { CompanyAutoScheduleButton } from '@/components/CompanyAutoScheduleButton'
import { fmtRangeUTC } from '@/lib/format'
import { TIER_COLORS, TIER_FALLBACK, PRIORITY_LABEL, PRIORITY_BADGE, FILL_TARGET, meterClass } from '@/lib/meetings-ui'

function interestBadge(level: string) {
  return level === 'High' ? 'badge badge-success' : level === 'Medium' ? 'badge badge-warning' : 'badge badge-neutral'
}
function initial(name: string | null | undefined) {
  return (name?.trim()[0] ?? '?').toUpperCase()
}

type AssignTarget = { requestId: string; initialTimeBlockId?: string }
type RescheduleTarget = { sponsorMeetingId: string; attendeeName: string }
type CancelTarget = { sponsorMeetingId: string; attendeeName: string; slotLabel: string; room: string | null }

// Split-view schedule console for one company: request bank on the left,
// day-by-day slot grid on the right.
export function CompanyScheduleView({ sponsorId }: { sponsorId: string }) {
  const queryClient = useQueryClient()
  const { data: matrix, isLoading, isError, refetch } = useCompanySchedule(sponsorId)

  const [activeDay, setActiveDay] = useState(0)
  // Only the requestId is real state — the candidate's row data is derived
  // from the live matrix so refetches can't leave a stale snapshot behind,
  // and a candidate who leaves the bank (auto-schedule, decline) self-clears.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<RescheduleTarget | null>(null)
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [mutError, setMutError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [flashSlot, setFlashSlot] = useState<string | null>(null)

  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  // timeBlockId → "Tue, Apr 6 · 6:00–6:30 PM" for the Scheduled group + cancel dialog.
  const slotLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const day of matrix?.days ?? []) {
      for (const slot of day.slots) {
        map.set(slot.timeBlockId, `${day.label} · ${fmtRangeUTC(slot.startsAt, slot.endsAt)}`)
      }
    }
    return map
  }, [matrix])

  const selectedCandidate = matrix?.bank.find(b => b.requestId === selectedId) ?? null
  const assignCandidate = assignTarget
    ? matrix?.bank.find(b => b.requestId === assignTarget.requestId) ?? null
    : null

  function afterMutation() {
    // The routes already revalidateTag('meetings') server-side; the client
    // only needs its React Query caches refreshed.
    invalidateScheduler(queryClient)
  }

  function flash(timeBlockId: string) {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setFlashSlot(timeBlockId)
    window.setTimeout(() => setFlashSlot(current => (current === timeBlockId ? null : current)), 800)
  }

  // Approve / decline an inbound (PENDING) request.
  async function decide(requestId: string, status: 'APPROVED' | 'REJECTED') {
    setBusyId(requestId)
    setMutError(null)
    try {
      const res = await fetch(`/api/meeting-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setMutError(d.error ?? `Could not update the request (${res.status})`)
        return
      }
      afterMutation()
    } catch {
      setMutError('Network error — the request was not updated')
    } finally {
      setBusyId(null)
    }
  }

  // Grid-side assign entry point: needs a bank candidate selected first.
  function openSlotAssign(slot: MatrixSlot) {
    if (!selectedCandidate) {
      setHint('Choose a candidate from Unscheduled first')
      sidebarRef.current?.focus()
      return
    }
    setHint(null)
    setAssignTarget({ requestId: selectedCandidate.requestId, initialTimeBlockId: slot.timeBlockId })
  }

  if (isError) {
    return (
      <div>
        <BackLink />
        <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-4 py-3" role="alert">
          Couldn&rsquo;t load this company&rsquo;s schedule.{' '}
          <button type="button" onClick={() => refetch()} className="underline font-medium">
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (isLoading || !matrix) return <ScheduleSkeleton />

  const dayIndex = Math.min(activeDay, Math.max(0, matrix.days.length - 1))
  const day = matrix.days[dayIndex]
  const fillRate = Math.min(1, matrix.confirmedCount / FILL_TARGET)

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const n = matrix!.days.length
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (i + 1) % n
    else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next === null) return
    e.preventDefault()
    setActiveDay(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <div>
      {/* ── Header ── */}
      <BackLink />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {matrix.sponsor.logoUrl ? (
          <div className="w-10 h-10 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
            <Image src={matrix.sponsor.logoUrl} alt="" width={40} height={40} className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-10 h-10 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold flex-shrink-0">
            {initial(matrix.sponsor.name)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-ink truncate">{matrix.sponsor.name}</h2>
            <span className={`badge text-caption ${TIER_COLORS[matrix.sponsor.tier] ?? TIER_FALLBACK}`}>{matrix.sponsor.tier}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="meter w-28">
              <div className={`meter-fill ${meterClass(fillRate)}`} style={{ width: `${fillRate * 100}%` }} />
            </div>
            <span className="text-caption tabular-nums text-ink-2 whitespace-nowrap">
              {matrix.confirmedCount}/{FILL_TARGET} confirmed
            </span>
          </div>
        </div>
        <div className="ml-auto">
          <CompanyAutoScheduleButton sponsorId={sponsorId} sponsorName={matrix.sponsor.name} onSuccess={afterMutation} />
        </div>
      </div>

      {mutError && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-danger-soft text-danger-ink text-sm px-3 py-2" role="alert">
          <span>{mutError}</span>
          <button type="button" onClick={() => setMutError(null)} className="font-semibold" aria-label="Dismiss error">
            {'✕'}
          </button>
        </div>
      )}

      {/* ── Split view ── */}
      <div className="split-view h-[calc(100vh-280px)] min-h-[480px] rounded-xl border border-hairline overflow-hidden bg-surface">
        {/* Sidebar: request bank */}
        <div ref={sidebarRef} className="split-view-sidebar" role="region" aria-label="Meeting requests" tabIndex={-1}>
          <DisclosureGroup title="Inbound" count={matrix.pending.length} defaultOpen>
            {matrix.pending.map(p => (
              <InboundCard key={p.requestId} item={p} busy={busyId === p.requestId} onDecide={decide} />
            ))}
            {matrix.pending.length === 0 && <GroupEmpty />}
          </DisclosureGroup>

          <DisclosureGroup title="Unscheduled" count={matrix.bank.length} defaultOpen>
            {matrix.bank.map(b => (
              <BankCard
                key={b.requestId}
                item={b}
                sponsorName={matrix.sponsor.name}
                selected={selectedId === b.requestId}
                onToggle={() => setSelectedId(cur => (cur === b.requestId ? null : b.requestId))}
                onDeselect={() => setSelectedId(cur => (cur === b.requestId ? null : cur))}
                onAssign={() => setAssignTarget({ requestId: b.requestId })}
              />
            ))}
            {matrix.bank.length === 0 && <GroupEmpty />}
          </DisclosureGroup>

          <DisclosureGroup title="Scheduled" count={matrix.alreadyScheduled.length}>
            {matrix.alreadyScheduled.map(s => (
              <ScheduledCard
                key={s.sponsorMeetingId}
                item={s}
                slotLabel={slotLabels.get(s.timeBlockId) ?? '—'}
                onEdit={() => setRescheduleTarget({ sponsorMeetingId: s.sponsorMeetingId, attendeeName: s.name })}
                onCancel={() =>
                  setCancelTarget({
                    sponsorMeetingId: s.sponsorMeetingId,
                    attendeeName: s.name,
                    slotLabel: slotLabels.get(s.timeBlockId) ?? '—',
                    room: s.room,
                  })
                }
              />
            ))}
            {matrix.alreadyScheduled.length === 0 && <GroupEmpty />}
          </DisclosureGroup>

          <DisclosureGroup title="Declined & removed" count={matrix.misc.length}>
            {matrix.misc.map(m => <MiscCard key={m.requestId} item={m} />)}
            {matrix.misc.length === 0 && <GroupEmpty />}
          </DisclosureGroup>
        </div>

        {/* Main: schedule grid */}
        <div className="split-view-main" role="region" aria-label="Schedule grid">
          <div className="p-4">
            {matrix.days.length > 0 && (
              <div className="segmented" role="tablist" aria-label="Conference day">
                {matrix.days.map((d, i) => (
                  <button
                    key={d.dayKey}
                    ref={el => { tabRefs.current[i] = el }}
                    type="button"
                    role="tab"
                    id={`scheduler-day-tab-${i}`}
                    aria-selected={dayIndex === i}
                    aria-controls="scheduler-day-panel"
                    tabIndex={dayIndex === i ? 0 : -1}
                    onClick={() => setActiveDay(i)}
                    onKeyDown={e => onTabKey(e, i)}
                    className={`segmented-item min-h-[44px] ${dayIndex === i ? 'active' : ''}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            {hint && (
              <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-info-soft text-info-ink text-sm px-3 py-2">
                <span>{hint}</span>
                <button type="button" onClick={() => setHint(null)} className="font-semibold" aria-label="Dismiss hint">
                  {'✕'}
                </button>
              </div>
            )}

            <div id="scheduler-day-panel" role="tabpanel" aria-labelledby={`scheduler-day-tab-${dayIndex}`} className="mt-4">
              {!day || day.slots.length === 0 ? (
                <div className="empty-state bg-white border border-hairline rounded-xl">
                  <p className="font-medium text-ink">No time slots</p>
                  <p className="text-sm text-ink-2">This day has no meeting time blocks.</p>
                </div>
              ) : (
                <div className="bg-white border border-hairline rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-fill border-b border-hairline">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-36">Time</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-56">Company</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-80">Meetings</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-32">Location</th>
                        <th className="text-right px-4 py-3">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {day.slots.map(slot => (
                        <tr
                          key={slot.timeBlockId}
                          className={`align-top transition-colors ${flashSlot === slot.timeBlockId ? 'bg-success-soft' : ''}`}
                        >
                          <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-ink tabular-nums">
                            {fmtRangeUTC(slot.startsAt, slot.endsAt)}
                          </td>
                          {slot.meetings.length === 0 ? (
                            <td className="px-4 py-2.5" colSpan={4}>
                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => openSlotAssign(slot)}
                                  aria-label={`Open slot — ${slot.capacityLeft} spot${slot.capacityLeft === 1 ? '' : 's'} available`}
                                  className="flex-1 min-h-[44px] bg-success-soft rounded-xl hover:brightness-95 transition"
                                />
                                <button
                                  type="button"
                                  onClick={() => openSlotAssign(slot)}
                                  disabled={slot.capacityLeft === 0}
                                  title={slot.capacityLeft === 0 ? 'Slot full' : undefined}
                                  className="btn-secondary btn-sm flex-shrink-0"
                                >
                                  Assign
                                </button>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="px-4 py-2.5">
                                <div className="space-y-0.5">
                                  {slot.meetings.map(m => (
                                    <div key={m.sponsorMeetingId} className="flex items-center min-h-[36px]">
                                      <span className="text-sm text-ink-2 truncate">{m.company ?? '—'}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="space-y-0.5">
                                  {slot.meetings.map(m => (
                                    <div key={m.sponsorMeetingId} className="group flex items-center gap-2 min-h-[36px]">
                                      <span className="min-w-0 flex-1 font-medium text-ink truncate">{m.name}</span>
                                      <span className="flex items-center flex-shrink-0">
                                        <button
                                          type="button"
                                          aria-label={`Reschedule meeting with ${m.name}`}
                                          title="Reschedule"
                                          onClick={() => setRescheduleTarget({ sponsorMeetingId: m.sponsorMeetingId, attendeeName: m.name })}
                                          className="icon-btn-sm icon-btn opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity"
                                        >
                                          {'✎'}
                                        </button>
                                        <button
                                          type="button"
                                          aria-label={`Cancel meeting with ${m.name}`}
                                          title="Cancel"
                                          onClick={() =>
                                            setCancelTarget({
                                              sponsorMeetingId: m.sponsorMeetingId,
                                              attendeeName: m.name,
                                              slotLabel: slotLabels.get(slot.timeBlockId) ?? '—',
                                              room: m.room,
                                            })
                                          }
                                          className="icon-btn-sm icon-btn text-danger opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity"
                                        >
                                          {'✕'}
                                        </button>
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="space-y-0.5">
                                  {slot.meetings.map(m => (
                                    <div key={m.sponsorMeetingId} className="flex items-center min-h-[36px]">
                                      {m.room ? (
                                        <span className="badge badge-neutral">{m.room}</span>
                                      ) : (
                                        <span className="text-sm text-ink-3">—</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-right">
                                <button
                                  type="button"
                                  onClick={() => openSlotAssign(slot)}
                                  disabled={slot.capacityLeft === 0}
                                  title={slot.capacityLeft === 0 ? 'Slot full' : undefined}
                                  className="btn-secondary btn-sm"
                                >
                                  Assign
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sheets & dialogs ── */}
      {assignTarget && assignCandidate && (
        <AssignMeetingSheet
          requestId={assignTarget.requestId}
          candidate={assignCandidate}
          initialTimeBlockId={assignTarget.initialTimeBlockId}
          onClose={() => setAssignTarget(null)}
          onSuccess={timeBlockId => {
            setAssignTarget(null)
            setSelectedId(null)
            afterMutation()
            flash(timeBlockId)
          }}
        />
      )}
      {rescheduleTarget && (
        <RescheduleMeetingSheet
          sponsorMeetingId={rescheduleTarget.sponsorMeetingId}
          attendeeName={rescheduleTarget.attendeeName}
          onClose={() => setRescheduleTarget(null)}
          onSuccess={timeBlockId => {
            setRescheduleTarget(null)
            afterMutation()
            flash(timeBlockId)
          }}
        />
      )}
      {cancelTarget && (
        <CancelMeetingDialog
          sponsorMeetingId={cancelTarget.sponsorMeetingId}
          attendeeName={cancelTarget.attendeeName}
          slotLabel={cancelTarget.slotLabel}
          room={cancelTarget.room}
          onClose={() => setCancelTarget(null)}
          onSuccess={() => {
            setCancelTarget(null)
            afterMutation()
          }}
        />
      )}
    </div>
  )
}

function BackLink() {
  return (
    <Link href="?tab=companies" className="inline-flex items-center min-h-[44px] text-sm text-ink-2 hover:text-ink transition-colors mb-1">
      {'←'} All companies
    </Link>
  )
}

function GroupEmpty() {
  return <p className="px-4 py-2.5 text-xs text-ink-3">None</p>
}

// ── Collapsible sidebar group ────────────────────────────────────────────────
function DisclosureGroup({ title, count, defaultOpen = false, children }: {
  title: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-hairline">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full min-h-[44px] flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-ink-2 uppercase tracking-wide hover:bg-fill transition-colors"
      >
        <span aria-hidden="true" className="text-caption w-3">{open ? '▾' : '▸'}</span>
        {title}
        <span className="font-normal text-ink-3 normal-case">· {count}</span>
      </button>
      {open && <div className="pb-1">{children}</div>}
    </div>
  )
}

// ── Inbound (PENDING) card: approve / decline ────────────────────────────────
function InboundCard({ item, busy, onDecide }: {
  item: PendingItem
  busy: boolean
  onDecide: (requestId: string, status: 'APPROVED' | 'REJECTED') => void
}) {
  return (
    <div className="px-4 py-2.5 border-t border-hairline first:border-t-0">
      <div className="flex items-center gap-2.5">
        <Avatar name={item.name} image={item.image} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{item.name}</p>
          {item.company && <p className="text-xs text-ink-2 truncate">{item.company}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        <span className={PRIORITY_BADGE[item.priority]}>{PRIORITY_LABEL[item.priority]}</span>
        <span className={interestBadge(item.interest)}>{item.interest} interest</span>
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <button
          type="button"
          onClick={() => onDecide(item.requestId, 'APPROVED')}
          disabled={busy}
          className="btn-secondary btn-sm flex-1"
        >
          {busy ? 'Saving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => onDecide(item.requestId, 'REJECTED')}
          disabled={busy}
          className="btn-ghost btn-sm text-danger flex-1"
        >
          Decline
        </button>
      </div>
    </div>
  )
}

// ── Unscheduled (APPROVED bank) card with HUD popover ────────────────────────
function BankCard({ item, sponsorName, selected, onToggle, onDeselect, onAssign }: {
  item: BankItem
  sponsorName: string
  selected: boolean
  onToggle: () => void
  onDeselect: () => void
  onAssign: () => void
}) {
  const [hud, setHud] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleHud() {
    timer.current = setTimeout(() => setHud(true), 300)
  }
  function clearHud() {
    if (timer.current) clearTimeout(timer.current)
    setHud(false)
  }

  return (
    <div
      className="relative border-t border-hairline first:border-t-0"
      onMouseEnter={scheduleHud}
      onMouseLeave={clearHud}
    >
      <div className="flex items-start gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          onFocus={() => setHud(true)}
          onBlur={() => setHud(false)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              setHud(false)
              onDeselect()
            }
          }}
          aria-pressed={selected}
          aria-label={`Select ${item.name} for scheduling`}
          className={`min-w-0 flex-1 min-h-[44px] text-left rounded-xl px-2 py-1.5 -mx-2 transition-colors ${
            selected ? 'bg-brand-50' : 'hover:bg-fill'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="rank-chip flex-shrink-0">{item.rank}/{item.total}</span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink truncate">
                {item.name}
                {selected && <span className="ml-1.5 text-caption font-semibold text-brand-700">Selected</span>}
              </span>
              {item.company && <span className="block text-xs text-ink-2 truncate">{item.company}</span>}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={interestBadge(item.interest)}>{item.interest}</span>
            <span className={PRIORITY_BADGE[item.priority]}>{PRIORITY_LABEL[item.priority]}</span>
            <span className="text-caption text-ink-2 tabular-nums">{item.confirmedCount} mtg{item.confirmedCount === 1 ? '' : 's'}</span>
          </div>
        </button>
        <button type="button" onClick={onAssign} className="btn-secondary btn-sm flex-shrink-0 mt-1">
          Assign…
        </button>
      </div>

      {/* Non-modal detail HUD — structured content, never the only home of an action */}
      {hud && (
        <div
          role="group"
          aria-label={`Details for ${item.name}`}
          className="popover-card absolute left-4 top-full -mt-1 z-40"
        >
          <p className="text-sm font-semibold text-ink">{item.name}</p>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Rank</dt>
              <dd className="text-ink tabular-nums">{item.rank} of {item.total}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Interest</dt>
              <dd><span className={interestBadge(item.interest)}>{item.interest} · {item.interestOutOf5}/5</span></dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Confirmed meetings</dt>
              <dd className="text-ink tabular-nums">{item.confirmedCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Matched solutions</dt>
              <dd className="text-ink tabular-nums">{item.matched.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Source</dt>
              <dd className="text-ink truncate">{sponsorName}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  )
}

// ── Scheduled card: quick edit / cancel ──────────────────────────────────────
function ScheduledCard({ item, slotLabel, onEdit, onCancel }: {
  item: ScheduledItem
  slotLabel: string
  onEdit: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-hairline first:border-t-0">
      <Avatar name={item.name} image={item.image} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink truncate">{item.name}</p>
        <p className="text-xs text-ink-2 truncate">
          {slotLabel}
          {item.room && <span> · {item.room}</span>}
        </p>
      </div>
      <button type="button" onClick={onEdit} aria-label={`Reschedule meeting with ${item.name}`} title="Reschedule" className="icon-btn-sm icon-btn flex-shrink-0">
        {'✎'}
      </button>
      <button type="button" onClick={onCancel} aria-label={`Cancel meeting with ${item.name}`} title="Cancel" className="icon-btn-sm icon-btn text-danger flex-shrink-0">
        {'✕'}
      </button>
    </div>
  )
}

// ── Declined / removed rows ──────────────────────────────────────────────────
function MiscCard({ item }: { item: MiscItem }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t border-hairline first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-2 truncate">{item.name}</p>
        {item.company && <p className="text-xs text-ink-3 truncate">{item.company}</p>}
      </div>
      <span className="badge badge-neutral flex-shrink-0">{item.status}</span>
    </div>
  )
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
        <Image src={image} alt="" width={32} height={32} className="w-full h-full object-cover" />
      </div>
    )
  }
  return (
    <div className="w-8 h-8 rounded-full bg-fill flex items-center justify-center text-ink-2 font-bold text-sm flex-shrink-0">
      {initial(name)}
    </div>
  )
}

// ── Loading skeleton (sidebar + grid) ────────────────────────────────────────
function ScheduleSkeleton() {
  return (
    <div>
      <div className="skeleton h-5 w-32 mb-3" />
      <div className="flex items-center gap-3 mb-4">
        <div className="skeleton w-10 h-10 rounded-lg" />
        <div>
          <div className="skeleton h-5 w-48 mb-2" />
          <div className="skeleton h-3 w-32" />
        </div>
        <div className="skeleton h-10 w-32 ml-auto rounded-xl" />
      </div>
      <div className="split-view h-[calc(100vh-280px)] min-h-[480px] rounded-xl border border-hairline overflow-hidden bg-surface">
        <div className="split-view-sidebar p-4 space-y-3">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-14 w-full" />)}
        </div>
        <div className="split-view-main p-4">
          <div className="skeleton h-11 w-64 mb-4" />
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        </div>
      </div>
    </div>
  )
}
