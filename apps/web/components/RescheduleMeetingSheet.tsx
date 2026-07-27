'use client'

import { useCallback, useEffect, useState } from 'react'
import type { RescheduleAvailability } from '@conference/db'
import { SchedulerSheet, SheetSkeleton, SlotRoomPicker } from '@/components/SlotRoomPicker'
import { fmtRangeUTC } from '@/lib/format'

interface Props {
  sponsorMeetingId: string
  attendeeName: string
  onClose: () => void
  // Called with the new time block so the parent can flash the slot row.
  onSuccess: (timeBlockId: string) => void
}

// Right-side sheet that moves an existing meeting to a new slot + room.
// Same shell as the Assign sheet; the current assignment shows as the
// subtitle and its slot row is tagged "Current" (and stays selectable).
export function RescheduleMeetingSheet({ sponsorMeetingId, attendeeName, onClose, onSuccess }: Props) {
  const [avail, setAvail] = useState<RescheduleAvailability | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const r = await fetch(`/api/admin/scheduler/meetings/${encodeURIComponent(sponsorMeetingId)}/availability`)
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? `Availability request failed: ${r.status}`)
      }
      const d: RescheduleAvailability = await r.json()
      setAvail(d)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load availability')
    }
  }, [sponsorMeetingId])

  useEffect(() => { load() }, [load])

  // "Currently Tue, Apr 6 · 6:00–6:30 PM · Table 3"
  let currentLabel: string | null = null
  if (avail) {
    for (const day of avail.days) {
      const s = day.slots.find(x => x.timeBlockId === avail.current.timeBlockId)
      if (s) {
        currentLabel = `Currently ${day.label} · ${fmtRangeUTC(s.startsAt, s.endsAt)}${avail.current.room ? ` · ${avail.current.room}` : ''}`
        break
      }
    }
  }

  async function submit() {
    if (!slot || !room) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/scheduler/meetings/${encodeURIComponent(sponsorMeetingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeBlockId: slot, room }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Could not move the meeting')
        if (res.status === 409) {
          // The slot filled up under us — clear the whole choice and refresh
          // availability, so the admin re-picks against current occupancy.
          setSlot(null)
          setRoom(null)
          load()
        }
        return
      }
      onSuccess(slot)
    } catch {
      setError('Network error — the meeting was not moved')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SchedulerSheet
      title="Reschedule meeting"
      subtitle={currentLabel ? `${attendeeName} — ${currentLabel}` : attendeeName}
      onClose={onClose}
      dismissable={!submitting}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="btn">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!slot || !room || submitting} className="btn-primary">
            {submitting ? 'Moving…' : 'Move meeting'}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl bg-danger-soft text-danger-ink text-sm px-3 py-2" role="alert">
          {error}
        </div>
      )}

      {loadError ? (
        <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-3 py-2" role="alert">
          {loadError}{' '}
          <button type="button" onClick={load} className="underline font-medium">
            Retry
          </button>
        </div>
      ) : !avail ? (
        <SheetSkeleton />
      ) : (
        <SlotRoomPicker
          days={avail.days}
          selectedSlot={slot}
          onSelectSlot={setSlot}
          selectedRoom={room}
          onSelectRoom={setRoom}
          currentTimeBlockId={avail.current.timeBlockId}
        />
      )}
    </SchedulerSheet>
  )
}
