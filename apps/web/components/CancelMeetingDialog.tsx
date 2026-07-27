'use client'

import { useEffect, useId, useState } from 'react'
import { useDialogFocus } from '@/lib/useDialogFocus'

const REASONS = ['Scheduling conflict', 'Attendee no-show', 'Company request', 'Other'] as const

interface Props {
  sponsorMeetingId: string
  attendeeName: string
  slotLabel: string
  room: string | null
  onClose: () => void
  onSuccess: () => void
}

// Centered stop-and-decide modal (HIG alert): heavier scrim than the sheets.
// Focus lands on the segmented toggle (first focusable), never the
// destructive button; the submit style is conditional on the choice.
export function CancelMeetingDialog({ sponsorMeetingId, attendeeName, slotLabel, room, onClose, onSuccess }: Props) {
  const titleId = useId()
  const footnoteId = useId()
  const ref = useDialogFocus<HTMLDivElement>(true)
  const [preserveRequest, setPreserveRequest] = useState(true)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // While the cancel POST is in flight the dialog must not be dismissable —
  // unmounting it would drop the onSuccess refresh and leave stale UI.
  useEffect(() => {
    if (submitting) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  async function submit() {
    if (!reason) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/scheduler/meetings/${encodeURIComponent(sponsorMeetingId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preserveRequest, reason, notes: notes.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Could not cancel the meeting')
        return
      }
      onSuccess()
    } catch {
      setError('Network error — the meeting was not cancelled')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => { if (!submitting) onClose() }}
    >
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-ink">Cancel this meeting?</h2>
        <p className="text-sm text-ink-2 mt-1">
          {attendeeName} · {slotLabel}{room ? ` · ${room}` : ''}
        </p>

        {error && (
          <div className="mt-3 rounded-xl bg-danger-soft text-danger-ink text-sm px-3 py-2" role="alert">
            {error}
          </div>
        )}

        {/* What happens to the underlying request */}
        <div className="segmented w-full mt-4" role="group" aria-label="What happens to the request" aria-describedby={footnoteId}>
          <button
            type="button"
            onClick={() => setPreserveRequest(true)}
            aria-pressed={preserveRequest}
            className={`segmented-item min-h-[44px] ${preserveRequest ? 'active' : ''}`}
          >
            Return to bank
          </button>
          <button
            type="button"
            onClick={() => setPreserveRequest(false)}
            aria-pressed={!preserveRequest}
            className={`segmented-item min-h-[44px] ${!preserveRequest ? 'active' : ''}`}
          >
            Remove entirely
          </button>
        </div>
        <p id={footnoteId} className="text-xs text-ink-2 mt-2">
          {preserveRequest
            ? 'The request goes back to Unscheduled so the meeting can be rebooked.'
            : 'The request is removed and recorded under Declined & removed.'}
        </p>

        <label className="label mt-4" htmlFor={`${titleId}-reason`}>Reason</label>
        <select
          id={`${titleId}-reason`}
          className="select w-full"
          value={reason}
          onChange={e => { setReason(e.target.value); setError(null) }}
        >
          <option value="">Choose a reason…</option>
          {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <label className="label mt-3" htmlFor={`${titleId}-notes`}>Notes <span className="font-normal text-ink-3">(optional)</span></label>
        <textarea
          id={`${titleId}-notes`}
          className="textarea w-full"
          rows={3}
          placeholder="Add context for the record…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />

        <div className="flex items-center justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} disabled={submitting} className="btn">
            Never mind
          </button>
          {preserveRequest ? (
            <button type="button" onClick={submit} disabled={!reason || submitting} className="btn-primary">
              {submitting ? 'Cancelling…' : 'Return to Bank'}
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!reason || submitting} className="btn-danger">
              {submitting ? 'Cancelling…' : 'Remove Meeting'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
