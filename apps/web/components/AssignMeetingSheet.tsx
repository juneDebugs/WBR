'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CandidateAvailability } from '@conference/db'
import { SchedulerSheet, SheetSkeleton, SlotRoomPicker } from '@/components/SlotRoomPicker'

interface Props {
  requestId: string
  candidate: { name: string; company: string | null; confirmedCount: number }
  initialTimeBlockId?: string
  onClose: () => void
  // Called with the chosen time block so the parent can flash the slot row.
  onSuccess: (timeBlockId: string) => void
}

// Right-side sheet that assigns an approved request to a slot + room.
export function AssignMeetingSheet({ requestId, candidate, initialTimeBlockId, onClose, onSuccess }: Props) {
  const [avail, setAvail] = useState<CandidateAvailability | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const r = await fetch(`/api/admin/scheduler/availability?requestId=${encodeURIComponent(requestId)}`)
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        throw new Error(d.error ?? `Availability request failed: ${r.status}`)
      }
      const d: CandidateAvailability = await r.json()
      setAvail(d)
      // Preselect the slot the grid was opened from, when it is available.
      if (initialTimeBlockId) {
        const target = d.days.flatMap(day => day.slots).find(s => s.timeBlockId === initialTimeBlockId)
        if (target?.available) setSlot(prev => prev ?? initialTimeBlockId)
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load availability')
    }
  }, [requestId, initialTimeBlockId])

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!slot || !room) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/scheduler/meetings/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, timeBlockId: slot, room }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Could not assign the meeting')
        if (res.status === 409) {
          // The slot filled up under us — clear the whole choice and refresh
          // availability, so the admin re-picks against current occupancy
          // instead of resubmitting a doomed slot.
          setSlot(null)
          setRoom(null)
          load()
        }
        return
      }
      onSuccess(slot)
    } catch {
      setError('Network error — the meeting was not assigned')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SchedulerSheet
      title="Assign meeting"
      subtitle={candidate.company ? `${candidate.name} · ${candidate.company}` : candidate.name}
      onClose={onClose}
      dismissable={!submitting}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={submitting} className="btn">
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={!slot || !room || submitting} className="btn-primary">
            {submitting ? 'Assigning…' : 'Assign meeting'}
          </button>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl bg-danger-soft text-danger-ink text-sm px-3 py-2" role="alert">
          {error}
        </div>
      )}

      {candidate.confirmedCount >= 3 && (
        <div className="mb-4 rounded-xl bg-info-soft text-info-ink text-sm px-3 py-2">
          This attendee already has {candidate.confirmedCount} confirmed meetings.
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
        />
      )}
    </SchedulerSheet>
  )
}
