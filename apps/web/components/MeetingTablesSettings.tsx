'use client'

import { useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useQueryClient } from '@tanstack/react-query'
import { useTableBoard, invalidateScheduler } from '@/lib/scheduler-hooks'
import type { TableBoard, TableBoardMeeting, TableBoardSlot } from '@conference/db'
import { Stepper } from '@/components/Stepper'
import { TIER_COLORS, TIER_FALLBACK } from '@/lib/meetings-ui'

// Meeting Tables section of Meetings → Settings: view, assign, and manage the
// physical tables behind every confirmed meeting. Two cards:
//   1. Tables — the admin-managed inventory (add / rename / resize / remove).
//   2. Assignments — every confirmed meeting by day and time block with a
//      table picker per meeting, plus one-click auto-assign.
// Unlike the requirements panel above (a draft/snapshot form), every action
// here is operational data and applies immediately — the same interaction
// model as the check-in board. Each response carries the fresh board, which
// replaces the query cache in one round trip.
export function MeetingTablesSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useTableBoard()

  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [notice, setNotice] = useState('')
  const errorRef = useRef<HTMLDivElement>(null)

  // Inventory editing state.
  const [editing, setEditing] = useState<string | null>(null) // table being edited
  const [editName, setEditName] = useState('')
  const [editCapacity, setEditCapacity] = useState(1)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addCapacity, setAddCapacity] = useState(1)

  // Board view state.
  const [dayKey, setDayKey] = useState<string | null>(null)
  const [includeConflicts, setIncludeConflicts] = useState(false)

  const days = data?.days ?? []
  const activeDay = useMemo(
    () => days.find(d => d.dayKey === dayKey) ?? days[0] ?? null,
    [days, dayKey],
  )

  function fail(message: string) {
    setErrorMsg(message)
    setNotice('')
    setTimeout(() => errorRef.current?.focus(), 0)
  }

  // One in-flight mutation at a time; every success swaps in the fresh board
  // the server returned and invalidates the wider scheduler cache (matrix
  // pickers and availability sheets consume the same inventory).
  async function mutate(url: string, init: RequestInit, onBoard?: (json: any) => TableBoard | null) {
    setBusy(true)
    setErrorMsg('')
    setNotice('')
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        fail(json?.error ?? 'The change wasn’t saved. Please try again.')
        return null
      }
      const board = onBoard ? onBoard(json) : (json as TableBoard)
      if (board) queryClient.setQueryData(['scheduler', 'tables'], board)
      invalidateScheduler(queryClient)
      return json
    } catch {
      fail('Network error — the change wasn’t saved.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function addTable() {
    const name = addName.trim()
    if (!name) return
    const ok = await mutate('/api/admin/scheduler/tables', {
      method: 'PUT',
      body: JSON.stringify({ op: 'add', name, capacity: addCapacity }),
    })
    if (ok) {
      setAddName('')
      setAddCapacity(1)
    }
  }

  async function saveEdit(originalName: string) {
    const name = editName.trim()
    if (!name) {
      fail('Table name is required.')
      return
    }
    const ok = await mutate('/api/admin/scheduler/tables', {
      method: 'PUT',
      body: JSON.stringify({ op: 'update', name: originalName, newName: name, capacity: editCapacity }),
    })
    if (ok) setEditing(null)
  }

  async function removeTable(name: string) {
    setConfirmRemove(null)
    await mutate('/api/admin/scheduler/tables', {
      method: 'PUT',
      body: JSON.stringify({ op: 'remove', name }),
    })
  }

  async function assign(meeting: TableBoardMeeting, table: string | null) {
    await mutate('/api/admin/scheduler/tables/assign', {
      method: 'PUT',
      body: JSON.stringify({ sponsorMeetingId: meeting.sponsorMeetingId, table }),
    })
  }

  async function autoAssign() {
    const json = await mutate(
      '/api/admin/scheduler/tables/auto-assign',
      { method: 'POST', body: JSON.stringify({ includeConflicts }) },
      j => (j?.board as TableBoard) ?? null,
    )
    if (json) {
      setNotice(
        json.assigned === 0 && json.unplaced === 0
          ? 'Every meeting already has a table.'
          : `Assigned ${json.assigned} meeting${json.assigned === 1 ? '' : 's'}${
              json.unplaced > 0 ? ` — ${json.unplaced} couldn’t be placed (all tables full)` : ''
            }.`,
      )
    }
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-4 py-3" role="alert">
        Couldn&rsquo;t load meeting tables.{' '}
        <button type="button" onClick={() => refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !data) return <TablesSkeleton />

  const totals = data.totals

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-title3 font-semibold text-ink">Meeting Tables</h2>
        <p className="text-sm text-ink-2 mt-0.5">
          Manage the physical tables 1-on-1 meetings happen at, and see or change which table every meeting is assigned to.
        </p>
      </div>

      {errorMsg && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="flex items-center justify-between gap-2 px-4 py-2.5 bg-danger-soft border border-danger/30 rounded-xl focus:outline-none"
        >
          <p className="text-sm text-danger-ink">{errorMsg}</p>
          <button onClick={() => setErrorMsg('')} className="text-danger hover:text-danger-ink" aria-label="Dismiss error">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="px-4 py-2.5 bg-success-soft text-success-ink text-sm rounded-xl">
          {notice}
        </p>
      )}

      {/* ── 1. Table inventory ─────────────────────────────────────────────── */}
      <section className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-hairline">
          <h3 className="text-headline text-ink">Tables</h3>
          <p className="text-sm text-ink-2 mt-0.5">
            Renaming a table moves its existing meetings with it. A table with meetings assigned can&rsquo;t be removed.
          </p>
        </div>

        <ul className="divide-y divide-hairline px-5">
          {data.tables.map(t => (
            <li key={t.name} className="min-h-[44px] py-2.5 flex items-center justify-between gap-3 flex-wrap">
              {editing === t.name ? (
                <>
                  <input
                    type="text"
                    className="input w-56"
                    aria-label={`New name for ${t.name}`}
                    value={editName}
                    maxLength={40}
                    disabled={busy}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEdit(t.name) } }}
                  />
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-footnote text-ink-3">Seats</span>
                    <Stepper value={editCapacity} onChange={setEditCapacity} min={1} label={`Seats at ${t.name}`} disabled={busy} />
                    <button type="button" onClick={() => saveEdit(t.name)} disabled={busy} className="btn-primary btn-sm">
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(null)} disabled={busy} className="btn-ghost btn-sm">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-sm font-medium text-ink truncate">{t.name}</span>
                    <span className="badge badge-neutral text-caption flex-shrink-0 tabular-nums">
                      {t.capacity === 1 ? '1 seat' : `${t.capacity} seats`}
                    </span>
                    <span className="text-footnote text-ink-3 tabular-nums flex-shrink-0">
                      {t.assignedCount === 0 ? 'No meetings' : `${t.assignedCount} meeting${t.assignedCount === 1 ? '' : 's'}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => { setEditing(t.name); setEditName(t.name); setEditCapacity(t.capacity); setConfirmRemove(null) }}
                      disabled={busy}
                      className="btn-secondary btn-sm"
                    >
                      Edit
                    </button>
                    {confirmRemove === t.name ? (
                      <>
                        <button
                          type="button"
                          onClick={() => removeTable(t.name)}
                          disabled={busy}
                          className="btn-sm rounded-lg bg-danger text-white font-medium px-3 hover:opacity-90"
                        >
                          Confirm remove
                        </button>
                        <button type="button" onClick={() => setConfirmRemove(null)} disabled={busy} className="btn-ghost btn-sm">
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemove(t.name)}
                        disabled={busy || t.assignedCount > 0 || data.tables.length <= 1}
                        title={
                          t.assignedCount > 0
                            ? 'Reassign or unassign its meetings first'
                            : data.tables.length <= 1
                              ? 'At least one table must remain'
                              : undefined
                        }
                        className="btn-ghost btn-sm text-danger disabled:opacity-40"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        <div className="px-5 py-4 border-t border-hairline flex items-center gap-2 flex-wrap">
          <input
            type="text"
            className="input w-56"
            placeholder="New table name…"
            aria-label="New table name"
            value={addName}
            maxLength={40}
            disabled={busy}
            onChange={e => setAddName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTable() } }}
          />
          <span className="text-footnote text-ink-3">Seats</span>
          <Stepper value={addCapacity} onChange={setAddCapacity} min={1} label="Seats at the new table" disabled={busy} />
          <button type="button" onClick={addTable} disabled={busy || !addName.trim()} className="btn-primary btn-sm">
            Add table
          </button>
        </div>
      </section>

      {/* ── 2. Assignments across all meetings ─────────────────────────────── */}
      <section className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-hairline flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-headline text-ink">Assignments</h3>
            <p className="text-sm text-ink-2 mt-0.5">Every confirmed meeting, by day and time slot.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1.5 text-footnote text-ink-2 select-none">
              <input
                type="checkbox"
                checked={includeConflicts}
                disabled={busy}
                onChange={e => setIncludeConflicts(e.target.checked)}
                className="rounded border-hairline"
              />
              Also move conflicting meetings
            </label>
            <button
              type="button"
              onClick={autoAssign}
              disabled={busy || totals.meetings === 0}
              className="btn-primary btn-sm"
            >
              Auto-assign tables
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-hairline flex items-center gap-2 flex-wrap text-caption">
          <span className="badge badge-neutral tabular-nums">{totals.meetings} meeting{totals.meetings === 1 ? '' : 's'}</span>
          <span className="badge bg-success-soft text-success-ink tabular-nums">{totals.assigned} assigned</span>
          <span className={`badge tabular-nums ${totals.unassigned > 0 ? 'bg-warning-soft text-warning-ink' : 'badge-neutral'}`}>
            {totals.unassigned} unassigned
          </span>
          {totals.unknownTable > 0 && (
            <span className="badge bg-warning-soft text-warning-ink tabular-nums">{totals.unknownTable} at removed tables</span>
          )}
          <span className={`badge tabular-nums ${totals.conflicts > 0 ? 'bg-danger-soft text-danger-ink' : 'badge-neutral'}`}>
            {totals.conflicts} conflict{totals.conflicts === 1 ? '' : 's'}
          </span>
        </div>

        {days.length === 0 ? (
          <div className="empty-state m-5">
            <p className="font-medium text-ink">No confirmed meetings yet</p>
            <p className="text-sm text-ink-2">Meetings appear here once they&rsquo;re scheduled.</p>
          </div>
        ) : (
          <>
            {days.length > 1 && (
              <div className="px-5 pt-4 flex gap-2 flex-wrap" role="tablist" aria-label="Days">
                {days.map(d => (
                  <button
                    key={d.dayKey}
                    type="button"
                    role="tab"
                    aria-selected={activeDay?.dayKey === d.dayKey}
                    onClick={() => setDayKey(d.dayKey)}
                    className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
                      activeDay?.dayKey === d.dayKey
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-white border border-hairline text-ink-2 hover:bg-fill'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            <div className="px-5 py-4 space-y-5">
              {(activeDay?.slots ?? []).map(slot => (
                <SlotGroup key={slot.timeBlockId} slot={slot} board={data} busy={busy} onAssign={assign} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function timeRange(startsAt: string, endsAt: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${fmt(startsAt)} – ${fmt(endsAt)}`
}

// One time block: header with the slot's own unassigned/conflict badges, then a
// row per meeting with the table picker.
function SlotGroup({
  slot,
  board,
  busy,
  onAssign,
}: {
  slot: TableBoardSlot
  board: TableBoard
  busy: boolean
  onAssign: (meeting: TableBoardMeeting, table: string | null) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <h4 className="section-title">{timeRange(slot.startsAt, slot.endsAt)}</h4>
        {slot.unassigned > 0 && (
          <span className="badge bg-warning-soft text-warning-ink text-caption tabular-nums">{slot.unassigned} unassigned</span>
        )}
        {slot.conflictTables.length > 0 && (
          <span className="badge bg-danger-soft text-danger-ink text-caption">
            Conflict: {slot.conflictTables.join(', ')}
          </span>
        )}
      </div>
      <ul className="divide-y divide-hairline border border-hairline rounded-xl overflow-hidden">
        {slot.meetings.map(m => {
          const conflicted = !!m.table && slot.conflictTables.includes(m.table)
          return (
            <li
              key={m.sponsorMeetingId}
              className={`min-h-[44px] px-3 py-2.5 flex items-center justify-between gap-3 flex-wrap ${
                conflicted ? 'bg-danger-soft/40' : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {m.sponsorLogo ? (
                  <div className="w-8 h-8 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
                    <Image src={m.sponsorLogo} alt="" width={32} height={32} className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold text-sm flex-shrink-0">
                    {m.sponsorName[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-medium text-ink truncate">{m.sponsorName}</span>
                    <span className={`badge text-caption flex-shrink-0 ${TIER_COLORS[m.sponsorTier] ?? TIER_FALLBACK}`}>
                      {m.sponsorTier}
                    </span>
                  </div>
                  <p className="text-footnote text-ink-2 truncate">
                    meets {m.attendeeName}
                    {m.attendeeCompany ? ` · ${m.attendeeCompany}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {conflicted && <span className="text-caption text-danger-ink font-medium">Double-booked</span>}
                {!m.tableKnown && <span className="text-caption text-warning-ink font-medium">Removed table</span>}
                <select
                  className="input min-h-[36px] py-1 w-48"
                  aria-label={`Table for ${m.sponsorName} meeting ${m.attendeeName}`}
                  value={m.table ?? ''}
                  disabled={busy}
                  onChange={e => onAssign(m, e.target.value === '' ? null : e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {!m.tableKnown && m.table && <option value={m.table}>{m.table} (removed)</option>}
                  {board.tables.map(t => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Loading placeholder mirroring the two cards.
function TablesSkeleton() {
  return (
    <div className="max-w-4xl space-y-6" aria-hidden="true">
      <div>
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-96 mt-2" />
      </div>
      {[...Array(2)].map((_, i) => (
        <div key={i} className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-hairline">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton h-4 w-72 mt-2" />
          </div>
          <div className="px-5 py-4 space-y-3">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="flex items-center justify-between gap-3">
                <div className="skeleton h-4 w-56" />
                <div className="skeleton h-9 w-44 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
