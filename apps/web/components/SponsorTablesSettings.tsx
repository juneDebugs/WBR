'use client'

import { useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSponsorTables, invalidateScheduler } from '@/lib/scheduler-hooks'
import type { SponsorTableBoard, SponsorTableEntry } from '@conference/db'
import { SponsorLogo } from '@/components/SponsorLogo'

// Meeting Tables section of Meetings → Settings. Each sponsor company owns one
// uniquely-numbered physical table for its 1-on-1 meetings — this board is the
// source of truth. Every slot pulls the company's logo + name and shows its
// table number; "Auto-number" fills every unassigned sponsor in one action.
// Like the check-in board, every action is operational data and applies
// immediately: each response carries the fresh board, which replaces the query
// cache in one round trip.

const MAX_TABLE_NUMBER = 999
type Filter = 'all' | 'assigned' | 'unassigned'

export function SponsorTablesSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useSponsorTables()

  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const errorRef = useRef<HTMLDivElement>(null)

  const [editing, setEditing] = useState<string | null>(null) // sponsorId being edited
  const [editValue, setEditValue] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  function fail(message: string) {
    setErrorMsg(message)
    setStatusMsg('')
    setTimeout(() => errorRef.current?.focus(), 0)
  }

  // One in-flight mutation at a time; every success swaps in the fresh board the
  // server returned and invalidates the wider scheduler cache (the Location
  // column, check-in grid and per-company matrices all read the same tables).
  async function mutate(url: string, init: RequestInit): Promise<any | null> {
    setBusy(true)
    setErrorMsg('')
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        fail(json?.error ?? 'The change wasn’t saved. Please try again.')
        return null
      }
      const board: SponsorTableBoard | undefined = json?.board ?? json
      if (board?.entries) queryClient.setQueryData(['scheduler', 'sponsor-tables'], board)
      invalidateScheduler(queryClient)
      return json
    } catch {
      fail('Network error — the change wasn’t saved.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function assign(sponsorId: string, tableNumber: number | null) {
    const ok = await mutate('/api/admin/scheduler/sponsor-tables', {
      method: 'PUT',
      body: JSON.stringify({ sponsorId, tableNumber }),
    })
    if (ok) {
      setEditing(null)
      setStatusMsg('')
    }
  }

  function saveEdit(sponsorId: string) {
    const raw = editValue.trim()
    if (raw === '') { assign(sponsorId, null); return } // empty clears the table
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1 || n > MAX_TABLE_NUMBER) {
      fail(`Enter a whole number from 1 to ${MAX_TABLE_NUMBER}.`)
      return
    }
    assign(sponsorId, n)
  }

  async function autoNumber() {
    const res = await mutate('/api/admin/scheduler/sponsor-tables/auto-populate', { method: 'POST' })
    if (res) {
      setStatusMsg(
        res.assigned > 0
          ? `Numbered ${res.assigned} ${res.assigned === 1 ? 'table' : 'tables'}.`
          : 'Every sponsor already has a table.',
      )
    }
  }

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'assigned') return data.entries.filter(e => e.tableNumber !== null)
    if (filter === 'unassigned') return data.entries.filter(e => e.tableNumber === null)
    return data.entries
  }, [data, filter])

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

  const { totals } = data

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-title3 font-semibold text-ink">Meeting Tables</h2>
        <p className="text-sm text-ink-2 mt-0.5">
          Every sponsor sits at one numbered table for its 1-on-1 meetings. Assign a table below — the number
          follows the company across the check-in board, schedules, and the attendee and sponsor apps.
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

      {/* ── Summary + actions ──────────────────────────────────────────────── */}
      <section className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <Stat label="Sponsors" value={totals.sponsors} />
          <div className="w-px self-stretch bg-hairline" aria-hidden="true" />
          <Stat label="Assigned" value={totals.assigned} tone="success" />
          <div className="w-px self-stretch bg-hairline" aria-hidden="true" />
          <Stat label="Unassigned" value={totals.unassigned} tone={totals.unassigned > 0 ? 'warning' : undefined} />
        </div>
        <div className="flex items-center gap-3">
          {statusMsg && <span className="text-footnote text-ink-2" role="status">{statusMsg}</span>}
          <button
            type="button"
            onClick={autoNumber}
            disabled={busy || totals.unassigned === 0}
            className="btn-primary btn-sm"
            title={totals.unassigned === 0 ? 'Every sponsor already has a table' : 'Give each unassigned sponsor the next free number'}
          >
            <NumberIcon className="w-4 h-4" />
            Auto-number
          </button>
        </div>
      </section>

      {/* ── Filter ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="segmented" role="tablist" aria-label="Filter tables">
          {(['all', 'assigned', 'unassigned'] as Filter[]).map(f => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`segmented-item capitalize ${filter === f ? 'active' : ''}`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-footnote text-ink-3 tabular-nums">
          {filtered.length} {filtered.length === 1 ? 'table' : 'tables'}
        </span>
      </div>

      {/* ── Table grid ─────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="empty-state card">
          <TableIcon className="w-8 h-8 text-ink-3" />
          <p className="text-sm">
            {filter === 'unassigned' ? 'Every sponsor has a table.' : filter === 'assigned' ? 'No tables assigned yet.' : 'No sponsors yet.'}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(entry => (
            <SponsorTableCard
              key={entry.sponsorId}
              entry={entry}
              busy={busy}
              editing={editing === entry.sponsorId}
              editValue={editValue}
              onEditValue={setEditValue}
              onStartEdit={() => {
                setEditing(entry.sponsorId)
                setEditValue(entry.tableNumber?.toString() ?? '')
                setErrorMsg('')
              }}
              onCancel={() => setEditing(null)}
              onSave={() => saveEdit(entry.sponsorId)}
              onClear={() => assign(entry.sponsorId, null)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── A single table slot ───────────────────────────────────────────────────────
function SponsorTableCard({
  entry, busy, editing, editValue, onEditValue, onStartEdit, onCancel, onSave, onClear,
}: {
  entry: SponsorTableEntry
  busy: boolean
  editing: boolean
  editValue: string
  onEditValue: (v: string) => void
  onStartEdit: () => void
  onCancel: () => void
  onSave: () => void
  onClear: () => void
}) {
  const assigned = entry.tableNumber !== null
  return (
    <li className="card flex items-center gap-4 animate-fade-in">
      <TableNumberBadge n={entry.tableNumber} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex-shrink-0 w-8 h-8 rounded-lg bg-fill overflow-hidden flex items-center justify-center">
            <SponsorLogo
              name={entry.name}
              logoUrl={entry.logoUrl}
              className="w-full h-full object-contain"
              fallbackClassName="text-ink-2 font-semibold text-sm"
            />
          </span>
          <span className="text-headline text-ink truncate" title={entry.name}>{entry.name}</span>
        </div>

        {editing ? (
          <div className="mt-2.5 flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={MAX_TABLE_NUMBER}
              inputMode="numeric"
              className="input w-24 tabular-nums"
              aria-label={`Table number for ${entry.name}`}
              value={editValue}
              disabled={busy}
              autoFocus
              placeholder="—"
              onChange={e => onEditValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); onSave() }
                if (e.key === 'Escape') { e.preventDefault(); onCancel() }
              }}
            />
            <button type="button" onClick={onSave} disabled={busy} className="btn-primary btn-sm">Save</button>
            <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost btn-sm">Cancel</button>
          </div>
        ) : (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <TierBadge tier={entry.tier} />
            <span className="text-footnote text-ink-3 tabular-nums">
              {entry.meetingCount === 0 ? 'No meetings' : `${entry.meetingCount} meeting${entry.meetingCount === 1 ? '' : 's'}`}
            </span>
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={onStartEdit} disabled={busy} className="btn-secondary btn-sm">
            {assigned ? 'Edit' : 'Assign'}
          </button>
          {assigned && (
            <button
              type="button"
              onClick={onClear}
              disabled={busy}
              className="icon-btn icon-btn-sm text-ink-3 hover:text-danger"
              aria-label={`Clear table for ${entry.name}`}
              title="Clear this table"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </li>
  )
}

// The table number as a hero identity mark: assigned slots use the brand
// gradient (an identity surface, exempt from the flat-fill rule); unassigned
// slots read as an empty dashed placeholder inviting assignment.
function TableNumberBadge({ n }: { n: number | null }) {
  if (n === null) {
    return (
      <div className="flex-shrink-0 w-14 h-14 rounded-2xl border-2 border-dashed border-hairline flex flex-col items-center justify-center text-ink-3" aria-label="No table assigned">
        <TableIcon className="w-5 h-5" />
      </div>
    )
  }
  return (
    <div className="flex-shrink-0 w-14 h-14 rounded-2xl brand-gradient text-white shadow-card flex flex-col items-center justify-center leading-none" aria-label={`Table ${n}`}>
      <span className="text-[0.5rem] font-semibold uppercase tracking-wide opacity-80">Table</span>
      <span className="text-title2 font-bold tabular-nums mt-0.5">{n}</span>
    </div>
  )
}

function TierBadge({ tier }: { tier: string }) {
  const cls =
    tier === 'PLATINUM' ? 'badge-brand'
      : tier === 'GOLD' ? 'badge-warning'
        : 'badge-neutral'
  return <span className={`badge ${cls} capitalize`}>{tier.toLowerCase()}</span>
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'warning' }) {
  const valueColor = tone === 'success' ? 'text-success-ink' : tone === 'warning' ? 'text-warning-ink' : 'text-ink'
  return (
    <div className="flex flex-col">
      <span className={`text-title2 font-bold tabular-nums ${valueColor}`}>{value}</span>
      <span className="text-caption text-ink-3 uppercase tracking-wide">{label}</span>
    </div>
  )
}

// Loading placeholder mirroring the board.
function TablesSkeleton() {
  return (
    <div className="max-w-4xl space-y-6" aria-hidden="true">
      <div>
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-96 mt-2" />
      </div>
      <div className="skeleton h-20 rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[...Array(4)].map((_, j) => (
          <div key={j} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
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
function NumberIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" />
    </svg>
  )
}
function TableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 10v8m14-8v8M4 6h16a1 1 0 011 1v0a2 2 0 01-2 2H5a2 2 0 01-2-2v0a1 1 0 011-1z" />
    </svg>
  )
}
