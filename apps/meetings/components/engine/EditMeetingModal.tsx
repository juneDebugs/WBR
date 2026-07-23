'use client'
import { useEffect, useMemo, useState } from 'react'
import type { RescheduleAvailability, AvailabilitySlot } from '@conference/db'
import { EtailModal, EtailBtn } from './EtailModal'
import { fmtRange } from './format'

export interface EditTarget {
  sponsorMeetingId: string
  attendeeName: string
  attendeeCompany: string | null
}

const TOOLBAR = ['Keywords', 'Note', 'Type Tag', 'Time', 'Reschedule', 'Add Attendee']

export function EditMeetingModal({
  sponsorName, target, onClose, onDone,
}: {
  sponsorName: string
  target: EditTarget
  onClose: () => void
  onDone: () => void
}) {
  const [avail, setAvail] = useState<RescheduleAvailability | null>(null)
  const [slotId, setSlotId] = useState('')
  const [room, setRoom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/staff/meetings/${target.sponsorMeetingId}/availability`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load availability')))
      .then((d: RescheduleAvailability) => { if (!alive) return; setAvail(d); setSlotId(d.current.timeBlockId); setRoom(d.current.room ?? '') })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [target.sponsorMeetingId])

  const slot: AvailabilitySlot | null = useMemo(
    () => avail?.days.flatMap(d => d.slots).find(s => s.timeBlockId === slotId) ?? null,
    [avail, slotId],
  )
  const availableDays = avail?.days.map(d => ({ ...d, slots: d.slots.filter(s => s.available) })).filter(d => d.slots.length) ?? []

  function pickSlot(id: string) {
    setSlotId(id)
    const s = avail?.days.flatMap(d => d.slots).find(x => x.timeBlockId === id)
    if (s && !s.rooms.find(r => r.name === room && r.available)) setRoom(s.rooms.find(r => r.available)?.name ?? '')
  }

  async function submit() {
    if (!slotId || !room) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/staff/meetings/${target.sponsorMeetingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeBlockId: slotId, room }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not reschedule')
      onDone()
    } catch (e: any) { setError(e.message); setSubmitting(false) }
  }

  return (
    <EtailModal
      title="Edit Meeting"
      onClose={onClose}
      width={560}
      footer={<EtailBtn variant="primary" disabled={submitting || !slotId || !room} onClick={submit}>{submitting ? 'Submitting…' : 'Submit'}</EtailBtn>}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 border-b border-[#e5e5e5] pb-2 mb-3 text-[12px] text-[#337ab7]">
        {TOOLBAR.map(t => <span key={t} className="hover:underline cursor-default">{t}</span>)}
      </div>

      {error && <div className="border border-[#d9534f] bg-[#f2dede] text-[#a94442] px-2 py-1 rounded mb-2 text-[12px]">{error}</div>}

      <div className="mb-3">
        <div className="font-bold text-[#333] mb-1">Attendees</div>
        <div className="text-[13px]">👤 {target.attendeeName}{target.attendeeCompany ? `, ${target.attendeeCompany}` : ''}</div>
      </div>

      <div className="mb-3">
        <div className="font-bold text-[#333] mb-1">Include Colleagues</div>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" defaultChecked /> {sponsorName}</label>
      </div>

      <div className="mb-3">
        <div className="font-bold text-[#333] mb-1">Meeting Time</div>
        {!avail && !error ? <div className="text-[#777] text-[13px]">Loading times…</div> : (
          <select className="border border-[#ccc] rounded px-2 py-1.5 text-[13px] bg-white w-full" value={slotId} onChange={e => pickSlot(e.target.value)}>
            <option value="">select</option>
            {availableDays.map(day => (
              <optgroup key={day.dayKey} label={day.label}>
                {day.slots.map(s => (
                  <option key={s.timeBlockId} value={s.timeBlockId}>{fmtRange(s.startsAt, s.endsAt)}{avail?.current.timeBlockId === s.timeBlockId ? '  (current)' : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </div>

      <div className="mb-1">
        <div className="font-bold text-[#333] mb-1">Meeting Location</div>
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-[#555]">Assigned Location</span>
          <select className="border border-[#ccc] rounded px-2 py-1.5 text-[13px] bg-white" value={room} onChange={e => setRoom(e.target.value)}>
            <option value="">Room…</option>
            {slot?.rooms.map(r => <option key={r.name} value={r.name} disabled={!r.available}>{r.name}{r.occupancy > 0 ? ' *' : ''}{!r.available ? ' — full' : ''}</option>)}
          </select>
        </div>
      </div>
    </EtailModal>
  )
}
