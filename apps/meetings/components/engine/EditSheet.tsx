'use client'
import { useEffect, useMemo, useState } from 'react'
import type { RescheduleAvailability, AvailabilitySlot } from '@conference/db'
import { SideSheet } from './Sheet'
import { RoomRow } from './AssignSheet'
import { fmtRange } from './format'

export interface EditTarget {
  sponsorMeetingId: string
  name: string
  currentLabel: string // e.g. "Tue Apr 6 · 9:00 AM · Table 1"
}

export function EditSheet({
  target, onClose, onDone,
}: {
  target: EditTarget
  onClose: () => void
  onDone: () => void
}) {
  const [avail, setAvail] = useState<RescheduleAvailability | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [slotId, setSlotId] = useState<string | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/staff/meetings/${target.sponsorMeetingId}/availability`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load availability')))
      .then((d: RescheduleAvailability) => {
        if (!alive) return
        setAvail(d)
        setSlotId(d.current.timeBlockId)
        setRoom(d.current.room)
      })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [target.sponsorMeetingId])

  const selectedSlot: AvailabilitySlot | null = useMemo(() => {
    if (!avail || !slotId) return null
    return avail.days.flatMap(d => d.slots).find(s => s.timeBlockId === slotId) ?? null
  }, [avail, slotId])

  function pickSlot(id: string) {
    setSlotId(id)
    const slot = avail?.days.flatMap(d => d.slots).find(s => s.timeBlockId === id)
    if (slot && (!room || !slot.rooms.find(r => r.name === room && r.available))) {
      setRoom(slot.rooms.find(r => r.available)?.name ?? null)
    }
  }

  async function submit() {
    if (!slotId || !room) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch(`/api/staff/meetings/${target.sponsorMeetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeBlockId: slotId, room }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Could not reschedule')
      }
      onDone()
    } catch (e: any) {
      setError(e.message); setSubmitting(false)
    }
  }

  const availableDays = avail?.days.map(d => ({ ...d, slots: d.slots.filter(s => s.available) })).filter(d => d.slots.length) ?? []

  return (
    <SideSheet
      title={`Reschedule ${target.name}`}
      subtitle={`Currently ${target.currentLabel}`}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm flex-1" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm flex-1" disabled={!slotId || !room || submitting} onClick={submit}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      {error && <p className="badge badge-danger mb-3">{error}</p>}

      <p className="form-label">New time slot</p>
      {!avail && !error && <div className="skeleton h-24 w-full mb-4" />}
      <div className="space-y-4 mb-5">
        {availableDays.map(day => (
          <div key={day.dayKey}>
            <p className="section-title">{day.label}</p>
            <div className="grid grid-cols-2 gap-2">
              {day.slots.map(s => {
                const isCurrent = avail?.current.timeBlockId === s.timeBlockId
                return (
                  <button
                    key={s.timeBlockId}
                    onClick={() => pickSlot(s.timeBlockId)}
                    className={`text-left px-3 py-2 rounded-xl border text-footnote transition-colors flex items-center justify-between gap-1 ${
                      slotId === s.timeBlockId ? 'border-primary bg-brand/5 text-ink' : 'border-hairline text-ink-2 hover:border-primary/50'
                    }`}
                  >
                    <span>{fmtRange(s.startsAt, s.endsAt)}</span>
                    {isCurrent && <span className="badge badge-neutral !py-0 text-[10px]">Current</span>}
                  </button>
                )
              })}
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
        </>
      )}
    </SideSheet>
  )
}
