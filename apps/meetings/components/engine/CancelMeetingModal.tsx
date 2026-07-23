'use client'
import { useState } from 'react'
import { EtailModal, EtailBtn } from './EtailModal'

export interface CancelTarget {
  sponsorMeetingId: string
  attendeeName: string
  attendeeCompany: string | null
  when: string // "05/07/25 1:05 – 1:35 PM · Table 1"
}

const REASONS = ['Scheduling conflict', 'Attendee no-show', 'Company request', 'Other']

export function CancelMeetingModal({ target, onClose, onDone }: { target: CancelTarget; onClose: () => void; onDone: () => void }) {
  // "Remove the match request as well?" — No (default) preserves the request and
  // returns it to the Unscheduled bank; Yes removes it entirely.
  const [removeRequest, setRemoveRequest] = useState<'yes' | 'no'>('no')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (!reason) { setError('Please choose a reason.'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/staff/meetings/${target.sponsorMeetingId}/cancel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preserveRequest: removeRequest === 'no', reason, notes: notes.trim() || null }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not cancel the meeting')
      onDone()
    } catch (e: any) { setError(e.message); setSubmitting(false) }
  }

  return (
    <EtailModal
      title="Cancel Meeting"
      onClose={onClose}
      width={520}
      footer={<><EtailBtn onClick={onClose}>Close</EtailBtn><EtailBtn variant="danger" disabled={submitting} onClick={submit}>{submitting ? 'Submitting…' : 'Submit'}</EtailBtn></>}
    >
      <div className="mb-3">
        <div className="font-bold text-[#333] mb-1">Attendees</div>
        <div className="text-[13px]">👤 {target.attendeeName}{target.attendeeCompany ? `, ${target.attendeeCompany}` : ''}</div>
        <div className="text-[12px] text-[#777] mt-0.5">{target.when}</div>
      </div>

      {error && <div className="border border-[#d9534f] bg-[#f2dede] text-[#a94442] px-2 py-1 rounded mb-2 text-[12px]">{error}</div>}

      <div className="mb-3">
        <div className="font-bold text-[#333] mb-1">Also remove the match request?</div>
        <label className="flex items-center gap-2 text-[13px] mb-1">
          <input type="radio" name="removeReq" checked={removeRequest === 'no'} onChange={() => setRemoveRequest('no')} />
          <span><b>No</b> — clear the time slot but keep the request (returns to Unscheduled)</span>
        </label>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="radio" name="removeReq" checked={removeRequest === 'yes'} onChange={() => setRemoveRequest('yes')} />
          <span><b>Yes</b> — remove the match request entirely</span>
        </label>
      </div>

      <div className="mb-3">
        <label className="block font-bold text-[#333] mb-1">Reason</label>
        <select className="border border-[#ccc] rounded px-2 py-1.5 text-[13px] bg-white w-full" value={reason} onChange={e => { setReason(e.target.value); setError(null) }}>
          <option value="">Select a reason…</option>
          {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div>
        <label className="block font-bold text-[#333] mb-1">Notes</label>
        <textarea className="border border-[#ccc] rounded px-2 py-1.5 text-[13px] bg-white w-full" rows={3} placeholder="Add context for the record…" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
    </EtailModal>
  )
}
