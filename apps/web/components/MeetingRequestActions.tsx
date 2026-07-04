'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TZ = 'America/Los_Angeles'
function fmtSlot(start: string, end: string) {
  const s = new Date(start), e = new Date(end)
  const day = s.toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ })
  const t1 = s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).replace(/\s(AM|PM)/, '')
  const t2 = e.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).toLowerCase().replace(/\s/, '\u202f')
  return `${day}, ${t1}–${t2}`
}

interface AvailableSlot {
  id: string
  startsAt: string
  endsAt: string
  location: string | null
  bothFree: boolean
  requesterFree: boolean
  targetFree: boolean
}

interface Props {
  requestId: string
  status: string
  currentTimeBlockId: string | null
}

export function MeetingRequestActions({ requestId, status, currentTimeBlockId }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [slots, setSlots] = useState<AvailableSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedTb, setSelectedTb] = useState(currentTimeBlockId ?? '')
  const [filterFree, setFilterFree] = useState(true)

  async function update(newStatus: string, timeBlockId?: string) {
    setLoading(true)
    await fetch(`/api/meeting-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, ...(timeBlockId !== undefined ? { timeBlockId } : {}) }),
    })
    setLoading(false)
    setAssigning(false)
    router.refresh()
  }

  async function deleteMeeting() {
    setLoading(true)
    await fetch(`/api/meeting-requests/${requestId}`, { method: 'DELETE' })
    setLoading(false)
    router.refresh()
  }

  async function openAssign() {
    setAssigning(true)
    setSlotsLoading(true)
    const res = await fetch('/api/schedule-meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    })
    const data = await res.json()
    setSlots(data.availableSlots ?? [])
    if (data.firstAvailable) setSelectedTb(data.firstAvailable.id)
    setSlotsLoading(false)
  }

  const displaySlots = filterFree ? slots.filter(s => s.bothFree) : slots
  const freeCount = slots.filter(s => s.bothFree).length

  // ── Slot picker (shared by APPROVED + CONFIRMED edit) ──────────────────
  const SlotPicker = ({ onCancel, onSave, saveLabel }: { onCancel: () => void; onSave: () => void; saveLabel: string }) => (
    <div className="rounded-2xl overflow-hidden border border-brand/30 shadow-sm bg-brand-50">
      <div className="px-3 pt-2.5 pb-1">
        <p className="text-caption font-bold uppercase tracking-widest text-brand">Assign Time Slot</p>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {slotsLoading ? (
          <div className="flex items-center justify-center py-4 gap-2">
            <div className="w-3 h-3 rounded-full bg-brand-300 animate-pulse" />
            <p className="text-xs text-brand">Checking availability…</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-caption font-semibold text-brand-700">
                {freeCount} mutual slot{freeCount !== 1 ? 's' : ''} available
              </p>
              <button onClick={() => setFilterFree(v => !v)}
                className="text-caption font-semibold text-brand hover:text-brand-700 bg-white/60 px-2 py-0.5 rounded-full transition-colors">
                {filterFree ? 'Show all' : 'Free only'}
              </button>
            </div>

            {displaySlots.length === 0 ? (
              <p className="text-xs text-danger text-center py-2 bg-white/50 rounded-xl">No mutual availability found</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto rounded-xl">
                {displaySlots.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedTb(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all ${
                      selectedTb === s.id
                        ? 'bg-brand text-white shadow-sm'
                        : s.bothFree
                        ? 'bg-white/80 text-ink hover:bg-white'
                        : 'bg-white/50 text-ink-2 hover:bg-white/70'
                    }`}
                  >
                    <span className="font-semibold">
                      {fmtSlot(s.startsAt, s.endsAt)}
                    </span>
                    {s.location && <span className={`ml-1.5 ${selectedTb === s.id ? 'text-brand-200' : 'text-ink-2'}`}>· {s.location}</span>}
                    {!s.bothFree && (
                      <span className={`ml-1.5 text-caption ${selectedTb === s.id ? 'text-brand-200' : 'text-warning'}`}>
                        {s.requesterFree ? '(target busy)' : '(requester busy)'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-1.5 pt-0.5">
              <button onClick={onCancel}
                className="btn-secondary btn-sm flex-1">
                Cancel
              </button>
              <button onClick={onSave} disabled={!selectedTb || loading}
                className="btn-primary btn-sm flex-1">
                {loading ? 'Saving…' : saveLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // ── REJECTED ───────────────────────────────────────────────────────────
  if (status === 'REJECTED') {
    return (
      <button onClick={() => update('PENDING')} disabled={loading}
        className="text-xs text-ink-2 hover:text-ink underline transition-colors">
        Undo
      </button>
    )
  }

  // ── CONFIRMED ──────────────────────────────────────────────────────────
  if (status === 'CONFIRMED') {
    if (assigning) {
      return (
        <SlotPicker
          onCancel={() => { setAssigning(false); setSelectedTb(currentTimeBlockId ?? '') }}
          onSave={() => update('CONFIRMED', selectedTb)}
          saveLabel="Save"
        />
      )
    }

    if (confirmDelete) {
      return (
        <div className="rounded-2xl overflow-hidden border border-danger/30 shadow-sm bg-danger-soft">
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-caption font-bold uppercase tracking-widest text-danger">Delete Meeting</p>
          </div>
          <div className="px-3 pb-3 space-y-2">
            <p className="text-xs text-danger-ink">This will permanently remove the meeting and free up the time slot.</p>
            <div className="flex gap-1.5">
              <button onClick={() => setConfirmDelete(false)}
                className="btn-secondary btn-sm flex-1">
                Cancel
              </button>
              <button onClick={deleteMeeting} disabled={loading}
                className="btn-danger btn-sm flex-1">
                {loading ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => update('APPROVED')}
          disabled={loading}
          title="Click to unconfirm"
          className="flex items-center gap-1 bg-success-soft border border-success/30 rounded-full px-2.5 py-1 hover:bg-danger-soft hover:border-danger/30 group transition-colors disabled:opacity-50">
          <svg className="w-3 h-3 text-success group-hover:hidden" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <svg className="w-3 h-3 text-danger hidden group-hover:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-xs font-semibold text-success-ink group-hover:text-danger transition-colors">
            {loading ? '…' : 'Confirmed'}
          </span>
        </button>
        <button onClick={openAssign} disabled={loading}
          aria-label="Edit time slot"
          className="p-1.5 rounded-full bg-brand-50 hover:bg-brand-100 transition-colors text-brand hover:text-brand-700"
          title="Edit time slot">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button onClick={() => setConfirmDelete(true)} disabled={loading}
          aria-label="Delete meeting"
          className="p-1.5 rounded-full bg-danger-soft hover:bg-danger/20 transition-colors text-danger hover:text-danger-ink"
          title="Delete meeting">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    )
  }

  // ── PENDING / APPROVED ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-1.5 min-w-[220px]">
      {status === 'PENDING' && (
        <div className="flex gap-1.5">
          <button onClick={() => update('APPROVED')} disabled={loading}
            className="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-success-soft text-success-ink hover:bg-success/20 disabled:opacity-50">
            Approve
          </button>
          <button onClick={() => update('REJECTED')} disabled={loading}
            className="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-danger-soft text-danger-ink hover:bg-danger/20 disabled:opacity-50">
            Reject
          </button>
        </div>
      )}

      {status === 'APPROVED' && (
        assigning ? (
          <SlotPicker
            onCancel={() => { setAssigning(false); setSelectedTb('') }}
            onSave={() => update('CONFIRMED', selectedTb)}
            saveLabel="Confirm"
          />
        ) : (
          <div className="flex gap-1.5">
            <button onClick={openAssign} disabled={loading}
              className="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-brand-50 text-brand-700 hover:bg-brand-100">
              📅 Assign Time Slot
            </button>
            <button onClick={() => update('REJECTED')} disabled={loading}
              aria-label="Reject request"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-danger-soft text-danger hover:bg-danger/20">
              ✕
            </button>
          </div>
        )
      )}
    </div>
  )
}
