'use client'
import { useEffect, useMemo, useState } from 'react'
import type { CandidateAvailability, AvailabilitySlot } from '@conference/db'
import { EtailModal, EtailBtn } from './EtailModal'
import { fmtDate, fmtRange } from './format'

export interface AssignLocationTarget {
  requestId: string
  candidateName: string
  candidateCompany: string | null
  timeBlockId: string
  startsAt: string
  endsAt: string
}

export function AssignLocationModal({
  sponsorId, sponsorName, target, onClose, onDone,
}: {
  sponsorId: string
  sponsorName: string
  target: AssignLocationTarget
  onClose: () => void
  onDone: () => void
}) {
  const [avail, setAvail] = useState<CandidateAvailability | null>(null)
  const [room, setRoom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/staff/companies/${sponsorId}/availability?requestId=${encodeURIComponent(target.requestId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load availability')))
      .then(d => { if (alive) setAvail(d) })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [sponsorId, target.requestId])

  const slot: AvailabilitySlot | null = useMemo(
    () => avail?.days.flatMap(d => d.slots).find(s => s.timeBlockId === target.timeBlockId) ?? null,
    [avail, target.timeBlockId],
  )

  async function submit() {
    if (!room) { setError('Please select a location.'); return }
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/staff/meetings/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: target.requestId, timeBlockId: target.timeBlockId, room }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not assign the meeting')
      onDone()
    } catch (e: any) { setError(e.message); setSubmitting(false) }
  }

  return (
    <EtailModal
      title="Assign Meeting Location"
      onClose={onClose}
      width={520}
      footer={<><EtailBtn onClick={onClose}>Close</EtailBtn><EtailBtn variant="primary" disabled={submitting || !room} onClick={submit}>{submitting ? 'Submitting…' : 'Submit'}</EtailBtn></>}
    >
      <div className="font-semibold text-[#333] mb-1">{fmtDate(target.startsAt)}&nbsp;&nbsp;{fmtRange(target.startsAt, target.endsAt)}</div>
      <div className="mb-3 text-[13px]">
        <span className="text-[#337ab7]">▸ {sponsorName}:</span> {target.candidateName}
        {target.candidateCompany && <span className="text-[#777]"> ({target.candidateCompany})</span>}
      </div>

      {error && <div className="border border-[#d9534f] bg-[#f2dede] text-[#a94442] px-2 py-1 rounded mb-2">{error}</div>}

      <label className="block text-[12px] font-semibold text-[#555] mb-1">Location</label>
      {!avail && !error ? (
        <div className="text-[#777]">Loading locations…</div>
      ) : (
        <select className="border border-[#ccc] rounded px-2 py-1.5 text-[13px] bg-white w-full" value={room} onChange={e => setRoom(e.target.value)}>
          <option value="">Select store…</option>
          {slot?.rooms.map(r => {
            const free = r.capacity - r.occupancy
            const inUse = r.occupancy > 0
            return (
              <option key={r.name} value={r.name} disabled={!r.available}>
                {inUse ? '* ' : ''}{r.name} [{free}]{!r.available ? ' — full' : ''}
              </option>
            )
          })}
        </select>
      )}

      <p className="mt-3 text-[11px] text-[#777] leading-snug">
        Asterisk (*) indicates location already being used for this time slot. Bracketed number [#] indicates total number of non-conflicting meetings for location.
      </p>
    </EtailModal>
  )
}
