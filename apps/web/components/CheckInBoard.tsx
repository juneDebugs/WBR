'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CheckInBoard as CheckInBoardData, CheckInDay, CheckInMeeting, CheckInTotals } from '@conference/db'
import { useCheckInBoard } from '@/lib/scheduler-hooks'
import { fmtSlotRange, TZ } from '@/lib/format'
import { TIER_COLORS, TIER_FALLBACK } from '@/lib/meetings-ui'
import { CheckInDashboard } from '@/components/CheckInDashboard'

const KEY = ['scheduler', 'checkin'] as const

type PatchPayload = { sponsorArrived?: boolean; buyerArrived?: boolean; notes?: string | null }

function initial(name: string | null | undefined) {
  return (name?.trim()[0] ?? '?').toUpperCase()
}

// Client-side mirror of the engine's tallyCheckIns so optimistic updates keep
// the slot chips and footer reconciliation in sync with the ticked boxes.
function tally(meetings: CheckInMeeting[]): CheckInTotals {
  const totals: CheckInTotals = { meetings: meetings.length, completed: 0, sponsorArrived: 0, buyerArrived: 0, awaiting: 0 }
  for (const m of meetings) {
    if (m.sponsorArrivedAt) totals.sponsorArrived++
    if (m.buyerArrivedAt) totals.buyerArrived++
    if (m.sponsorArrivedAt && m.buyerArrivedAt) totals.completed++
    else if (!m.sponsorArrivedAt && !m.buyerArrivedAt) totals.awaiting++
  }
  return totals
}

function patchedMeeting(m: CheckInMeeting, patch: PatchPayload): CheckInMeeting {
  const next = { ...m }
  if (patch.sponsorArrived !== undefined) next.sponsorArrivedAt = patch.sponsorArrived ? new Date().toISOString() : null
  if (patch.buyerArrived !== undefined) next.buyerArrivedAt = patch.buyerArrived ? new Date().toISOString() : null
  if (patch.notes !== undefined) next.notes = patch.notes?.trim() ? patch.notes.trim() : null // mirrors setMeetingCheckIn
  return next
}

function applyPatch(board: CheckInBoardData, sponsorMeetingId: string, patch: PatchPayload): CheckInBoardData {
  const days = board.days.map(day => {
    let touched = false
    const slots = day.slots.map(slot => {
      if (!slot.meetings.some(m => m.sponsorMeetingId === sponsorMeetingId)) return slot
      touched = true
      const meetings = slot.meetings.map(m => (m.sponsorMeetingId === sponsorMeetingId ? patchedMeeting(m, patch) : m))
      return { ...slot, meetings, completed: meetings.filter(m => m.sponsorArrivedAt && m.buyerArrivedAt).length }
    })
    if (!touched) return day
    return { ...day, slots, totals: tally(slots.flatMap(s => s.meetings)) }
  })
  return { days, totals: tally(days.flatMap(d => d.slots.flatMap(s => s.meetings))) }
}

// On-site floor attendance grid: every confirmed meeting for the selected day,
// grouped by time slot, with dual arrival check-offs, per-meeting notes, and a
// reconciliation footer of how many meetings actually happened.
export function CheckInBoard() {
  const queryClient = useQueryClient()
  const { data: board, isLoading, isError, refetch } = useCheckInBoard()

  const [dayKey, setDayKey] = useState<string | null>(null)
  const [mutError, setMutError] = useState<string | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const mutation = useMutation({
    mutationFn: async ({ sponsorMeetingId, patch }: { sponsorMeetingId: string; patch: PatchPayload }) => {
      const r = await fetch(`/api/admin/scheduler/checkin/${encodeURIComponent(sponsorMeetingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? `Check-in update failed (${r.status})`)
      }
      return r.json()
    },
    onMutate: async ({ sponsorMeetingId, patch }) => {
      // Patch the cache synchronously so the checkbox flips in the same frame
      // as the click — awaiting cancelQueries first leaves a gap where an
      // in-flight poll response can visibly snap the box back.
      const previous = queryClient.getQueryData<CheckInBoardData>(KEY)
      const optimistic = (cur?: CheckInBoardData) => (cur ? applyPatch(cur, sponsorMeetingId, patch) : cur)
      queryClient.setQueryData<CheckInBoardData>(KEY, optimistic)
      setMutError(null)
      await queryClient.cancelQueries({ queryKey: KEY })
      // An in-flight refetch may have resolved between the set and the cancel;
      // re-apply so its stale payload can't overwrite the optimistic state.
      queryClient.setQueryData<CheckInBoardData>(KEY, optimistic)
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(KEY, ctx.previous)
      setMutError(err instanceof Error ? err.message : 'Check-in update failed')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
    },
  })

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-4 py-3" role="alert">
        Couldn&rsquo;t load the check-in board.{' '}
        <button type="button" onClick={() => refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !board) return <BoardSkeleton />

  if (board.days.length === 0) {
    return (
      <div className="empty-state bg-white border border-hairline rounded-xl">
        <p className="font-medium text-ink">No meetings to check in</p>
        <p className="text-sm text-ink-2">Confirmed meetings will appear here once they are scheduled.</p>
      </div>
    )
  }

  // engine dayKeys are yyyy-mm-dd in the event timezone
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ,
  }).format(new Date())
  const day: CheckInDay =
    board.days.find(d => d.dayKey === dayKey) ??
    board.days.find(d => d.dayKey === todayKey) ??
    board.days[0]
  const dayIndex = board.days.indexOf(day)

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const n = board!.days.length
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (i + 1) % n
    else if (e.key === 'ArrowLeft') next = (i - 1 + n) % n
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    if (next === null) return
    e.preventDefault()
    setDayKey(board!.days[next].dayKey)
    tabRefs.current[next]?.focus()
  }

  const save = (sponsorMeetingId: string, patch: PatchPayload) => mutation.mutateAsync({ sponsorMeetingId, patch })

  return (
    <div>
      {/* ── Day switcher ── */}
      <div className="segmented" role="tablist" aria-label="Conference day">
        {board.days.map((d, i) => (
          <button
            key={d.dayKey}
            ref={el => { tabRefs.current[i] = el }}
            type="button"
            role="tab"
            id={`checkin-day-tab-${i}`}
            aria-selected={dayIndex === i}
            aria-controls="checkin-day-panel"
            tabIndex={dayIndex === i ? 0 : -1}
            onClick={() => setDayKey(d.dayKey)}
            onKeyDown={e => onTabKey(e, i)}
            className={`segmented-item min-h-[44px] ${dayIndex === i ? 'active' : ''}`}
          >
            {d.label}
            <span className="text-caption tabular-nums text-ink-3">{d.totals.completed}/{d.totals.meetings}</span>
          </button>
        ))}
      </div>

      {mutError && (
        <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-danger-soft text-danger-ink text-sm px-3 py-2" role="alert">
          <span>{mutError}</span>
          <button type="button" onClick={() => setMutError(null)} className="font-semibold" aria-label="Dismiss error">
            {'✕'}
          </button>
        </div>
      )}

      {/* ── Day dashboard + master attendance grid ── */}
      <div id="checkin-day-panel" role="tabpanel" aria-labelledby={`checkin-day-tab-${dayIndex}`} className="mt-4">
        {/* Keyed by day so the slot accordion re-opens on the new day's highlight */}
        <CheckInDashboard key={day.dayKey} board={board} day={day} onCheckIn={save} />

        <h2 id="floor-board" className="section-title mt-6 mb-2 scroll-mt-4">Floor Board</h2>
        <div className="bg-white border border-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fill border-b border-hairline">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Sponsor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Attendee</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-24">Room</th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-28">Sponsor Arrived</th>
                <th className="text-center px-2 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-28">Buyer Arrived</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-28">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide w-64">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {day.slots.map(slot => (
                <SlotRows key={slot.timeBlockId} slot={slot} onSave={save} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// One time slot: a separator header row with the range + check-in tally chip,
// then a row per meeting.
function SlotRows({ slot, onSave }: {
  slot: CheckInDay['slots'][number]
  onSave: (sponsorMeetingId: string, patch: PatchPayload) => Promise<unknown>
}) {
  const allDone = slot.completed === slot.meetings.length
  return (
    <>
      <tr className="bg-fill/80">
        <td colSpan={7} className="px-4 py-2 border-b border-hairline">
          <span className="text-xs font-bold text-ink-2 uppercase tracking-widest tabular-nums">
            {fmtSlotRange(slot.startsAt, slot.endsAt)}
          </span>
          <span className={`ml-2 badge text-caption tabular-nums ${allDone ? 'badge-success' : 'badge-neutral'}`}>
            {slot.completed} of {slot.meetings.length} checked in
          </span>
        </td>
      </tr>
      {slot.meetings.map(m => (
        <MeetingRow key={m.sponsorMeetingId} meeting={m} onSave={onSave} />
      ))}
    </>
  )
}

function MeetingRow({ meeting, onSave }: {
  meeting: CheckInMeeting
  onSave: (sponsorMeetingId: string, patch: PatchPayload) => Promise<unknown>
}) {
  const completed = !!meeting.sponsorArrivedAt && !!meeting.buyerArrivedAt
  const partial = !completed && (!!meeting.sponsorArrivedAt || !!meeting.buyerArrivedAt)
  return (
    <tr className={`align-middle transition-colors ${completed ? 'bg-success-soft/40' : 'hover:bg-fill'}`}>
      {/* Sponsor */}
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {meeting.sponsorLogo ? (
            <div className="w-8 h-8 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
              <Image src={meeting.sponsorLogo} alt="" width={32} height={32} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold text-sm flex-shrink-0">
              {initial(meeting.sponsorName)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-ink leading-tight truncate">{meeting.sponsorName}</p>
            <span className={`badge text-caption ${TIER_COLORS[meeting.sponsorTier] ?? TIER_FALLBACK}`}>{meeting.sponsorTier}</span>
          </div>
        </div>
      </td>

      {/* Attendee */}
      <td className="px-4 py-2.5">
        <p className="font-medium text-ink leading-tight truncate">{meeting.attendeeName}</p>
        {meeting.attendeeCompany && <p className="text-xs text-ink-2 truncate">{meeting.attendeeCompany}</p>}
      </td>

      {/* Room */}
      <td className="px-4 py-2.5">
        {meeting.room ? <span className="badge badge-neutral">{meeting.room}</span> : <span className="text-ink-3">—</span>}
      </td>

      {/* Arrival check-offs */}
      <ArrivalCell
        checked={!!meeting.sponsorArrivedAt}
        label={`Sponsor arrived — ${meeting.sponsorName} meeting with ${meeting.attendeeName}`}
        onChange={checked => onSave(meeting.sponsorMeetingId, { sponsorArrived: checked })}
      />
      <ArrivalCell
        checked={!!meeting.buyerArrivedAt}
        label={`Buyer arrived — ${meeting.sponsorName} meeting with ${meeting.attendeeName}`}
        onChange={checked => onSave(meeting.sponsorMeetingId, { buyerArrived: checked })}
      />

      {/* Status */}
      <td className="px-4 py-2.5">
        {completed ? (
          <span className="badge badge-success">{'✓'} Completed</span>
        ) : partial ? (
          <span className="badge badge-neutral">Partial</span>
        ) : (
          <span className="text-caption text-ink-3">Awaiting</span>
        )}
      </td>

      {/* Note */}
      <td className="px-4 py-2.5">
        <NoteCell meeting={meeting} onSave={notes => onSave(meeting.sponsorMeetingId, { notes })} />
      </td>
    </tr>
  )
}

// Real checkbox inside a ≥44px label hit area. A controlled input driven only
// by the query cache flips one notification-batch later than the click, which
// React's controlled-value restore renders as a momentary snap-back — so the
// tick is held in local state for the in-flight window, then handed back to
// the cache (which the mutation has patched optimistically, or rolled back).
function ArrivalCell({ checked, label, onChange }: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => Promise<unknown>
}) {
  const [pending, setPending] = useState<boolean | null>(null)
  return (
    <td className="px-2 py-2.5 text-center">
      <label className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl cursor-pointer hover:bg-fill transition-colors">
        <input
          type="checkbox"
          className="w-[18px] h-[18px] accent-brand cursor-pointer"
          checked={pending ?? checked}
          onChange={e => {
            const next = e.target.checked
            setPending(next)
            onChange(next).catch(() => {}).finally(() => setPending(null))
          }}
          aria-label={label}
        />
      </label>
    </td>
  )
}

// Compact per-meeting note: saves on blur/Enter only when changed; Escape
// reverts. While untouched it follows server refreshes (the 30s poll).
function NoteCell({ meeting, onSave }: {
  meeting: CheckInMeeting
  onSave: (notes: string | null) => Promise<unknown>
}) {
  const [draft, setDraft] = useState(meeting.notes ?? '')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const skipCommit = useRef(false)

  useEffect(() => {
    if (!editing && !saving) setDraft(meeting.notes ?? '')
  }, [meeting.notes, editing, saving])

  async function commit() {
    const next = draft.trim()
    if (next === (meeting.notes ?? '')) {
      setDraft(meeting.notes ?? '')
      return
    }
    setSaving(true)
    try {
      await onSave(next || null)
    } catch {
      setDraft(meeting.notes ?? '') // rollback banner is shown by the board
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        className="input text-xs flex-1 min-w-0"
        placeholder="Add note"
        aria-label={`Note — ${meeting.sponsorName} meeting with ${meeting.attendeeName}`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={() => setEditing(true)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            skipCommit.current = true
            setDraft(meeting.notes ?? '')
            e.currentTarget.blur()
          }
        }}
        onBlur={() => {
          setEditing(false)
          if (skipCommit.current) {
            skipCommit.current = false
            return
          }
          void commit()
        }}
      />
      {saving && <span className="text-caption text-ink-3 whitespace-nowrap" aria-live="polite">Saving{'…'}</span>}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div>
      <div className="skeleton h-11 w-72 mb-4" />
      {/* Dashboard placeholders (tracker + slots column, then the small cards) */}
      <div className="grid gap-4 xl:grid-cols-3 mb-6">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <div className="skeleton h-72 w-full rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="skeleton h-44 w-full rounded-2xl" />
            <div className="skeleton h-44 w-full rounded-2xl" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="skeleton flex-1 min-h-[16rem] w-full rounded-2xl" />
          <div className="skeleton h-44 w-full rounded-2xl" />
        </div>
      </div>
      <div className="bg-white border border-hairline rounded-xl overflow-hidden">
        <div className="bg-fill border-b border-hairline h-10" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-hairline last:border-b-0">
            <div className="skeleton w-8 h-8 rounded-lg flex-shrink-0" />
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-4 w-16" />
            <div className="skeleton h-4 w-10 ml-auto" />
            <div className="skeleton h-4 w-10" />
          </div>
        ))}
      </div>
      <div className="skeleton h-16 w-full mt-4 rounded-xl" />
    </div>
  )
}
