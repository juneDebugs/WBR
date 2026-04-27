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
    <div className="rounded-2xl overflow-hidden border border-indigo-100 shadow-sm" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)' }}>
      <div className="px-3 pt-2.5 pb-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">Assign Time Slot</p>
      </div>
      <div className="px-3 pb-3 space-y-2">
        {slotsLoading ? (
          <div className="flex items-center justify-center py-4 gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-300 animate-pulse" />
            <p className="text-xs text-indigo-400">Checking availability…</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-indigo-700">
                {freeCount} mutual slot{freeCount !== 1 ? 's' : ''} available
              </p>
              <button onClick={() => setFilterFree(v => !v)}
                className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-600 bg-white/60 px-2 py-0.5 rounded-full transition-colors">
                {filterFree ? 'Show all' : 'Free only'}
              </button>
            </div>

            {displaySlots.length === 0 ? (
              <p className="text-xs text-red-400 text-center py-2 bg-white/50 rounded-xl">No mutual availability found</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto rounded-xl">
                {displaySlots.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedTb(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all ${
                      selectedTb === s.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : s.bothFree
                        ? 'bg-white/80 text-gray-700 hover:bg-white'
                        : 'bg-white/50 text-gray-400 hover:bg-white/70'
                    }`}
                  >
                    <span className="font-semibold">
                      {fmtSlot(s.startsAt, s.endsAt)}
                    </span>
                    {s.location && <span className={`ml-1.5 ${selectedTb === s.id ? 'text-indigo-200' : 'text-gray-400'}`}>· {s.location}</span>}
                    {!s.bothFree && (
                      <span className={`ml-1.5 text-[10px] ${selectedTb === s.id ? 'text-indigo-200' : 'text-amber-500'}`}>
                        {s.requesterFree ? '(target busy)' : '(requester busy)'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-1.5 pt-0.5">
              <button onClick={onCancel}
                className="flex-1 py-1.5 bg-white/70 text-gray-600 rounded-xl text-xs font-semibold hover:bg-white transition-colors border border-white">
                Cancel
              </button>
              <button onClick={onSave} disabled={!selectedTb || loading}
                className="flex-1 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-40 transition-colors shadow-sm">
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
        className="text-xs text-gray-400 hover:text-gray-500 underline transition-colors">
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
        <div className="rounded-2xl overflow-hidden border border-red-100 shadow-sm" style={{ background: 'linear-gradient(135deg, #fff1f2 0%, #fff5f5 100%)' }}>
          <div className="px-3 pt-2.5 pb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Delete Meeting</p>
          </div>
          <div className="px-3 pb-3 space-y-2">
            <p className="text-xs text-red-600">This will permanently remove the meeting and free up the time slot.</p>
            <div className="flex gap-1.5">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-1.5 bg-white/70 text-gray-600 rounded-xl text-xs font-semibold hover:bg-white transition-colors border border-white">
                Cancel
              </button>
              <button onClick={deleteMeeting} disabled={loading}
                className="flex-1 py-1.5 bg-red-500 text-white rounded-xl text-xs font-bold hover:bg-red-600 disabled:opacity-40 transition-colors shadow-sm">
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
          className="flex items-center gap-1 bg-green-50 border border-green-100 rounded-full px-2.5 py-1 hover:bg-red-50 hover:border-red-100 group transition-colors disabled:opacity-50">
          <svg className="w-3 h-3 text-green-500 group-hover:hidden" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <svg className="w-3 h-3 text-red-400 hidden group-hover:block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-xs font-semibold text-green-700 group-hover:text-red-500 transition-colors">
            {loading ? '…' : 'Confirmed'}
          </span>
        </button>
        <button onClick={openAssign} disabled={loading}
          className="p-1.5 rounded-full bg-indigo-50 hover:bg-indigo-100 transition-colors text-indigo-500 hover:text-indigo-700"
          title="Edit time slot">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
        <button onClick={() => setConfirmDelete(true)} disabled={loading}
          className="p-1.5 rounded-full bg-red-50 hover:bg-red-100 transition-colors text-red-400 hover:text-red-600"
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
            className="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50">
            Approve
          </button>
          <button onClick={() => update('REJECTED')} disabled={loading}
            className="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
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
              className="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
              📅 Assign Time Slot
            </button>
            <button onClick={() => update('REJECTED')} disabled={loading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors bg-red-50 text-red-500 hover:bg-red-100">
              ✕
            </button>
          </div>
        )
      )}
    </div>
  )
}
