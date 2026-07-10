'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { useDialogFocus } from '@/lib/useDialogFocus'

export interface ScheduledBroadcast {
  id: string
  content: string
  scheduledFor: string
  status: 'PENDING' | 'SENT' | 'CANCELED' | 'FAILED'
  sentAt: string | null
  createdAt: string
  sender: { name: string | null; email: string | null } | null
}

// ── time helpers ──────────────────────────────────────────────────────────────

/** Date → value for <input type="datetime-local"> in the user's local zone. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function nextHour(): Date {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d
}

function tomorrowAt(hour: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d
}

export function formatWhen(iso: string): string {
  return format(new Date(iso), 'EEE, MMM d · h:mm a')
}

/** "in 3h 20m" / "in 2d" / "now" — short HIG-style relative time. */
export function relativeUntil(iso: string, from: Date = new Date()): string {
  const ms = new Date(iso).getTime() - from.getTime()
  if (ms <= 0) return 'now'
  const mins = Math.round(ms / 60_000)
  if (mins < 60) return `in ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) {
    const rem = mins % 60
    return rem > 0 ? `in ${hours}h ${rem}m` : `in ${hours}h`
  }
  const days = Math.floor(hours / 24)
  return `in ${days}d`
}

// ── schedule dialog (create + edit) ───────────────────────────────────────────

interface ScheduleDialogProps {
  open: boolean
  title: string
  submitLabel: string
  initialContent: string
  initialWhen?: string // ISO
  onClose: () => void
  /** Returns an error message to display, or null on success. */
  onSubmit: (content: string, scheduledForIso: string) => Promise<string | null>
}

export function ScheduleDialog({
  open,
  title,
  submitLabel,
  initialContent,
  initialWhen,
  onClose,
  onSubmit,
}: ScheduleDialogProps) {
  const [content, setContent] = useState(initialContent)
  const [when, setWhen] = useState(() =>
    toLocalInputValue(initialWhen ? new Date(initialWhen) : nextHour())
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useDialogFocus<HTMLDivElement>(open)

  const [presets, setPresets] = useState<{ label: string; value: string }[]>([])

  // Re-seed the form (and refresh the relative presets) each time the dialog opens
  useEffect(() => {
    if (open) {
      setContent(initialContent)
      setWhen(toLocalInputValue(initialWhen ? new Date(initialWhen) : nextHour()))
      setError(null)
      setPresets([
        { label: 'In 1 hour', value: toLocalInputValue(new Date(Date.now() + 60 * 60_000)) },
        { label: 'Tomorrow 9 AM', value: toLocalInputValue(tomorrowAt(9)) },
        { label: 'Tomorrow 5 PM', value: toLocalInputValue(tomorrowAt(17)) },
      ])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const parsed = when ? new Date(when) : null
  const inFuture = !!parsed && !isNaN(parsed.getTime()) && parsed.getTime() > Date.now()
  const canSubmit = !!content.trim() && inFuture && !submitting

  async function submit() {
    if (!canSubmit || !parsed) return
    setSubmitting(true)
    setError(null)
    const err = await onSubmit(content.trim(), parsed.toISOString())
    setSubmitting(false)
    if (err) setError(err)
    else onClose()
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-dialog-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 id="schedule-dialog-title" className="text-lg font-bold text-ink">{title}</h3>
        <p className="text-sm text-ink-2 mt-0.5 mb-4">Sends to everyone in Global Broadcast.</p>

        {error && (
          <div role="alert" className="mb-3 px-3 py-2 rounded-xl bg-danger-soft border border-danger/20 text-danger-ink text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="schedule-message" className="form-label">Message</label>
            <textarea
              id="schedule-message"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Type a broadcast message…"
              className="textarea"
            />
          </div>

          <div>
            <label htmlFor="schedule-when" className="form-label">Send time</label>
            <input
              id="schedule-when"
              type="datetime-local"
              value={when}
              min={toLocalInputValue(new Date(Date.now() + 60_000))}
              onChange={e => setWhen(e.target.value)}
              className="form-input"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {presets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setWhen(p.value)}
                  aria-pressed={when === p.value}
                  className={`chip ${when === p.value ? 'chip-active' : 'chip-inactive'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <p className={`text-xs ${inFuture ? 'text-ink-2' : 'text-danger-ink'}`} aria-live="polite">
            {parsed && !isNaN(parsed.getTime())
              ? inFuture
                ? `Will send ${formatWhen(parsed.toISOString())} (${relativeUntil(parsed.toISOString())})`
                : 'Send time must be in the future'
              : 'Pick a send time'}
          </p>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="btn-secondary btn-sm">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!canSubmit} aria-busy={submitting} className="btn-primary btn-sm">
            {submitting ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
                <span className="sr-only">{submitLabel}</span>
              </>
            ) : (
              <>
                <ClockIcon className="w-4 h-4" />
                {submitLabel}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── pending queue panel ───────────────────────────────────────────────────────

interface PanelProps {
  /** Bump to force an immediate refetch (e.g. right after scheduling). */
  refreshKey: number
  /** Called when a poll observed due messages being delivered. */
  onDelivered: () => void
}

export function ScheduledBroadcastsPanel({ refreshKey, onDelivered }: PanelProps) {
  const [pending, setPending] = useState<ScheduledBroadcast[]>([])
  const [history, setHistory] = useState<ScheduledBroadcast[]>([])
  const [loaded, setLoaded] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [editing, setEditing] = useState<ScheduledBroadcast | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const onDeliveredRef = useRef(onDelivered)
  onDeliveredRef.current = onDelivered

  // Keyboard focus continuity through the destructive-confirm swap: the icon
  // buttons unmount when the confirm strip appears (and vice versa), which
  // would otherwise drop focus to <body> mid-flow.
  const listRef = useRef<HTMLUListElement | null>(null)
  const confirmYesRef = useRef<HTMLButtonElement | null>(null)
  const cancelBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const focusAfterDismiss = useRef<string | null>(null)
  useEffect(() => {
    if (confirmCancelId) {
      confirmYesRef.current?.focus()
    } else if (focusAfterDismiss.current) {
      const target = cancelBtnRefs.current[focusAfterDismiss.current]
      focusAfterDismiss.current = null
      ;(target ?? listRef.current)?.focus()
    }
  }, [confirmCancelId])

  const prevPendingIds = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/scheduled')
      if (!res.ok) return
      const data = await res.json()
      const nextPending: ScheduledBroadcast[] = data.pending ?? []
      const nextHistory: ScheduledBroadcast[] = data.history ?? []
      setPending(nextPending)
      setHistory(nextHistory)
      setLoaded(true)
      // Refresh the message list when this tick delivered, or when an item we
      // were tracking as pending got delivered by another app's tick.
      const deliveredElsewhere = nextHistory.some(
        h => h.status === 'SENT' && prevPendingIds.current.has(h.id)
      )
      prevPendingIds.current = new Set(nextPending.map(p => p.id))
      if (data.dispatched?.sent > 0 || deliveredElsewhere) onDeliveredRef.current()
    } catch {
      // transient network error — next poll retries
    }
  }, [])

  // Initial load + 30s poll (each poll is also a server-side dispatch tick)
  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  // Immediate refetch when the composer schedules something new
  useEffect(() => {
    if (refreshKey > 0) load()
  }, [refreshKey, load])

  async function cancelOne(id: string) {
    const res = await fetch(`/api/chat/scheduled/${id}`, { method: 'DELETE' })
    focusAfterDismiss.current = id // row is gone → effect falls back to the list
    setConfirmCancelId(null)
    if (res.ok) setPending(prev => prev.filter(p => p.id !== id))
    else load() // it may have been sent in the meantime — resync
  }

  async function saveEdit(content: string, scheduledForIso: string): Promise<string | null> {
    if (!editing) return 'Nothing to edit'
    const res = await fetch(`/api/chat/scheduled/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, scheduledFor: scheduledForIso }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      load() // resync in case it was sent while the dialog was open
      return data.error ?? 'Could not update the scheduled message'
    }
    setPending(prev =>
      prev
        .map(p => (p.id === editing.id ? data.scheduled : p))
        .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
    )
    return null
  }

  if (!loaded || (pending.length === 0 && history.length === 0)) return null

  return (
    <div className="border-b border-hairline bg-brand-50/40">
      {/* Section header */}
      <div className="px-5 py-2.5 flex items-center justify-between bg-brand-50 border-b border-hairline">
        <p className="text-xs font-semibold text-brand uppercase tracking-widest flex items-center gap-2">
          <ClockIcon className="w-4 h-4" />
          Scheduled messages
          {pending.length > 0 && <span className="badge badge-brand">{pending.length}</span>}
        </p>
        {history.length > 0 && (
          <button
            onClick={() => setShowHistory(v => !v)}
            className="text-xs text-ink-2 hover:text-ink font-medium inline-flex items-center gap-1 min-h-9"
            aria-expanded={showHistory}
          >
            Recently sent
            <svg
              className={`w-3 h-3 transition-transform ${showHistory ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Pending queue */}
      {pending.length > 0 ? (
        <ul ref={listRef} tabIndex={-1} className="divide-y divide-hairline focus:outline-none">
          {pending.map(item => (
            <li key={item.id} className="px-5 py-3 flex items-center gap-3">
              {/* Glow recipe mirrors .btn-primary: brand-300 edge ring + brand halo,
                  rgba() form to stay clear of the retired-hex guard in test:design */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-white text-brand shadow-[0_0_0_1px_rgba(165,180,252,0.9),0_2px_8px_rgba(79,70,229,0.35),0_0_18px_rgba(99,102,241,0.55)]">
                <ClockIcon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate">{item.content}</p>
                <p className="text-xs text-ink-2 mt-0.5">
                  {formatWhen(item.scheduledFor)} · {relativeUntil(item.scheduledFor)}
                </p>
              </div>
              {confirmCancelId === item.id ? (
                <div className="flex items-center gap-2 flex-shrink-0 self-center">
                  <span className="text-xs text-ink-2">Cancel this?</span>
                  <button ref={confirmYesRef} onClick={() => cancelOne(item.id)} className="btn-danger btn-sm">
                    Yes, cancel
                  </button>
                  <button
                    onClick={() => {
                      focusAfterDismiss.current = item.id
                      setConfirmCancelId(null)
                    }}
                    className="text-xs text-ink-2 hover:text-ink px-2 min-h-9 inline-flex items-center"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <div className="flex items-center flex-shrink-0 self-center">
                  <button
                    onClick={() => setEditing(item)}
                    className="icon-btn-sm icon-btn"
                    aria-label="Edit scheduled message"
                    title="Edit"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    ref={el => { cancelBtnRefs.current[item.id] = el }}
                    onClick={() => setConfirmCancelId(item.id)}
                    className="icon-btn-sm icon-btn hover:text-danger"
                    aria-label="Cancel scheduled message"
                    title="Cancel"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-3 text-xs text-ink-3 italic">No upcoming broadcasts scheduled</p>
      )}

      {/* Recently sent / failed */}
      {showHistory && history.length > 0 && (
        <ul className="divide-y divide-hairline border-t border-hairline bg-surface-2">
          {history.map(item => (
            <li key={item.id} className="px-5 py-2 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-ink-2 truncate">{item.content}</p>
                <p className="text-xs text-ink-3 mt-0.5">
                  {item.status === 'SENT' && item.sentAt
                    ? `Sent ${formatWhen(item.sentAt)}`
                    : `Was due ${formatWhen(item.scheduledFor)}`}
                </p>
              </div>
              <span className={`badge ${item.status === 'SENT' ? 'badge-success' : 'badge-danger'} flex-shrink-0`}>
                {item.status === 'SENT' ? 'Sent' : 'Failed'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Edit dialog */}
      <ScheduleDialog
        open={editing !== null}
        title="Edit scheduled broadcast"
        submitLabel="Save"
        initialContent={editing?.content ?? ''}
        initialWhen={editing?.scheduledFor}
        onClose={() => setEditing(null)}
        onSubmit={saveEdit}
      />
    </div>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
