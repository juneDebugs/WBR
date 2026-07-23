'use client'
import { useState } from 'react'
import { CenterModal } from './Sheet'

export interface CancelTarget {
  sponsorMeetingId: string
  name: string
  summary: string // "Tue Apr 6 · 9:00 AM · Table 1"
}

const REASONS = ['Scheduling conflict', 'Attendee no-show', 'Company request', 'Other']

export function CancelModal({
  target, onClose, onDone,
}: {
  target: CancelTarget
  onClose: () => void
  onDone: () => void
}) {
  const [mode, setMode] = useState<'preserve' | 'remove' | null>(null)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showReasonError, setShowReasonError] = useState(false)

  async function submit() {
    if (!mode) return
    if (!reason) { setShowReasonError(true); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/staff/meetings/${target.sponsorMeetingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preserveRequest: mode === 'preserve', reason, notes: notes.trim() || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Could not cancel the meeting')
      }
      onDone()
    } catch (e: any) {
      setError(e.message); setSubmitting(false)
    }
  }

  return (
    <CenterModal
      title="Cancel meeting"
      describedById="cancel-summary"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary btn-sm" onClick={onClose}>Never mind</button>
          <button
            className={`btn-sm ${mode === 'remove' ? 'btn-danger' : 'btn-primary'}`}
            disabled={!mode || submitting}
            onClick={submit}
          >
            {submitting ? 'Working…' : mode === 'remove' ? 'Remove meeting' : 'Return to bank'}
          </button>
        </>
      }
    >
      <p id="cancel-summary" className="text-footnote text-ink-2 mb-4">
        <span className="text-ink font-medium">{target.name}</span> · {target.summary}
      </p>

      <div className="segmented w-full mb-4" role="group" aria-label="Cancellation type">
        <button
          className={`segmented-item ${mode === 'preserve' ? 'active' : ''}`}
          aria-pressed={mode === 'preserve'}
          onClick={() => setMode('preserve')}
        >
          Return to bank
        </button>
        <button
          className={`segmented-item ${mode === 'remove' ? 'active' : ''}`}
          aria-pressed={mode === 'remove'}
          onClick={() => setMode('remove')}
        >
          Remove entirely
        </button>
      </div>

      {mode && (
        <>
          <p className="text-footnote text-ink-2 mb-3">
            {mode === 'preserve'
              ? 'The time slot is freed and the request returns to the Unscheduled Bank to be rescheduled.'
              : 'The meeting and its request are cancelled and will not return to the bank.'}
          </p>

          <label className="form-label" htmlFor="cancel-reason">
            Reason <span className="text-danger-ink">*</span>
          </label>
          <select
            id="cancel-reason"
            className="select mb-1"
            value={reason}
            onChange={e => { setReason(e.target.value); setShowReasonError(false) }}
          >
            <option value="">Select a reason…</option>
            {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          {showReasonError && <p className="text-caption text-danger-ink mb-2">Please choose a reason.</p>}

          <label className="form-label mt-3" htmlFor="cancel-notes">Notes</label>
          <textarea
            id="cancel-notes"
            className="textarea"
            placeholder="Add context for the record…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </>
      )}

      {error && <p className="badge badge-danger mt-3">{error}</p>}
    </CenterModal>
  )
}
