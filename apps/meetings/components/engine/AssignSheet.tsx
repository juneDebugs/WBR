'use client'
import { useEffect, useMemo, useState } from 'react'
import type { CandidateAvailability, AvailabilitySlot, RoomAvailability } from '@conference/db'
import { SideSheet } from './Sheet'
import { fmtRange } from './format'

export interface AssignTarget {
  requestId: string
  name: string
  confirmedCount: number
  interest: string
}

export function AssignSheet({
  sponsorId, target, onClose, onDone,
}: {
  sponsorId: string
  target: AssignTarget
  onClose: () => void
  onDone: () => void
}) {
  const [avail, setAvail] = useState<CandidateAvailability | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/staff/companies/${sponsorId}/availability?requestId=${encodeURIComponent(target.requestId)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load availability')))
      .then(d => { if (alive) setAvail(d) })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [sponsorId, target.requestId])

  const selectedSlot: AvailabilitySlot | null = useMemo(() => {
    if (!avail || !slotId) return null
    return avail.days.flatMap(d => d.slots).find(s => s.timeBlockId === slotId) ?? null
  }, [avail, slotId])

  // Preselect the first available room whenever the slot changes.
  useEffect(() => {
    if (!selectedSlot) { setRoom(null); return }
    const firstFree = selectedSlot.rooms.find(r => r.available)
    setRoom(firstFree?.name ?? null)
  }, [selectedSlot])

  async function submit() {
    if (!slotId || !room) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/staff/meetings/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: target.requestId, timeBlockId: slotId, room }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Could not assign the meeting')
      }
      onDone()
    } catch (e: any) {
      setError(e.message); setSubmitting(false)
    }
  }

  const availableDays = avail?.days.map(d => ({ ...d, slots: d.slots.filter(s => s.available) })).filter(d => d.slots.length) ?? []

  return (
    <SideSheet
      title={`Schedule ${target.name}`}
      subtitle={`${target.interest} interest · ${target.confirmedCount} confirmed meeting${target.confirmedCount === 1 ? '' : 's'} so far`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm flex-1" disabled={!slotId || !room || submitting} onClick={submit}>
            {submitting ? 'Assigning…' : 'Assign meeting'}
          </button>
        </div>
      }
    >
      {error && <p className="badge badge-danger mb-3">{error}</p>}

      <p className="form-label">Time slot</p>
      {!avail && !error && <div className="skeleton h-24 w-full mb-4" />}
      {avail && availableDays.length === 0 && (
        <p className="text-footnote text-ink-2 mb-4">No mutually-free slots remain for this attendee.</p>
      )}
      <div className="space-y-4 mb-5">
        {availableDays.map(day => (
          <div key={day.dayKey}>
            <p className="section-title">{day.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {day.slots.map(s => (
                <button
                  key={s.timeBlockId}
                  onClick={() => setSlotId(s.timeBlockId)}
                  className={`text-left px-3 py-2 rounded-xl border text-footnote transition-colors ${
                    slotId === s.timeBlockId ? 'border-primary bg-brand/5 text-ink' : 'border-hairline text-ink-2 hover:border-primary/50'
                  }`}
                >
                  {fmtRange(s.startsAt, s.endsAt)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedSlot && (
        <>
          <p className="form-label">Room / table</p>
          <div className="space-y-1.5" role="listbox" aria-label="Rooms">
            {selectedSlot.rooms.map(r => (
              <RoomRow key={r.name} room={r} selected={room === r.name} onSelect={() => r.available && setRoom(r.name)} />
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-info-soft px-3 py-2.5">
            <p className="text-footnote text-info-ink">
              Load balancing: this attendee has {target.confirmedCount} confirmed meeting{target.confirmedCount === 1 ? '' : 's'}.
              {target.confirmedCount === 0 ? ' Scheduling them improves coverage.' : ' Prefer attendees with fewer meetings when tables are scarce.'}
            </p>
          </div>
        </>
      )}
    </SideSheet>
  )
}

export function RoomRow({ room, selected, onSelect }: { room: RoomAvailability; selected: boolean; onSelect: () => void }) {
  const conflict = !room.available
  const tight = room.available && room.capacity > 1 && room.occupancy >= room.capacity - 1
  return (
    <button
      role="option"
      aria-selected={selected}
      disabled={conflict}
      onClick={onSelect}
      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border transition-colors ${
        selected ? 'border-primary bg-brand/5'
          : conflict ? 'border-hairline opacity-60 cursor-not-allowed'
          : 'border-hairline hover:border-primary/50'
      }`}
    >
      <span className="flex items-center gap-2">
        <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${selected ? 'border-primary' : 'border-ink-3'}`}>
          {selected && <span className="w-2 h-2 rounded-full bg-primary" />}
        </span>
        <span className="text-body text-ink">{room.name}</span>
      </span>
      {conflict
        ? <span className="badge badge-danger">Conflict</span>
        : tight
        ? <span className="badge badge-warning">Tight</span>
        : <span className="badge badge-success">Available</span>}
    </button>
  )
}
