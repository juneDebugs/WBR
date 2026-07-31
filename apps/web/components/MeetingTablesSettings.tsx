'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTableBoard, invalidateScheduler } from '@/lib/scheduler-hooks'
import type { TableBoard } from '@conference/db'
import { Stepper } from '@/components/Stepper'

// Meeting Tables section of Meetings → Settings: the admin-managed inventory of
// the physical tables 1-on-1 meetings happen at (add / rename / resize /
// remove). Unlike the requirements panel above (a draft/snapshot form), every
// action here is operational data and applies immediately — the same
// interaction model as the check-in board. Each response carries the fresh
// board, which replaces the query cache in one round trip.
export function MeetingTablesSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useTableBoard()

  const [busy, setBusy] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const errorRef = useRef<HTMLDivElement>(null)

  // Inventory editing state.
  const [editing, setEditing] = useState<string | null>(null) // table being edited
  const [editName, setEditName] = useState('')
  const [editCapacity, setEditCapacity] = useState(1)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [addCapacity, setAddCapacity] = useState(1)

  function fail(message: string) {
    setErrorMsg(message)
    setTimeout(() => errorRef.current?.focus(), 0)
  }

  // One in-flight mutation at a time; every success swaps in the fresh board
  // the server returned and invalidates the wider scheduler cache (matrix
  // pickers and availability sheets consume the same inventory).
  async function mutate(url: string, init: RequestInit, onBoard?: (json: any) => TableBoard | null) {
    setBusy(true)
    setErrorMsg('')
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

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-title3 font-semibold text-ink">Meeting Tables</h2>
        <p className="text-sm text-ink-2 mt-0.5">
          Manage the physical tables 1-on-1 meetings happen at.
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

      {/* ── Table inventory ────────────────────────────────────────────────── */}
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
    </div>
  )
}

// Loading placeholder mirroring the inventory card.
function TablesSkeleton() {
  return (
    <div className="max-w-4xl space-y-6" aria-hidden="true">
      <div>
        <div className="skeleton h-6 w-48" />
        <div className="skeleton h-4 w-96 mt-2" />
      </div>
      <div className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
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
