'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  meetingId: string
  otherUserId: string
  otherName: string
  status: string
  notes: string | null
  startsAt: string
  endsAt: string
  location: string | null
}

export function MeetingActions({ meetingId, otherUserId, otherName, status, notes: initialNotes, startsAt, endsAt, location }: Props) {
  const router = useRouter()
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [dmLoading, setDmLoading] = useState(false)

  async function saveNotes() {
    setNotesSaving(true)
    await fetch(`/api/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
    setNotesSaving(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  async function cancelMeeting() {
    if (!confirm('Cancel this meeting?')) return
    setCancelling(true)
    await fetch(`/api/meetings/${meetingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    })
    router.push('/meetings')
  }

  async function openDm() {
    setDmLoading(true)
    const res = await fetch('/api/chat/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: otherUserId }),
    })
    if (!res.ok) {
      // New DM rooms require friendship — send the user to the profile,
      // where the friend-request tile lives (mirrors chat/dm/[userId]).
      const body = await res.json().catch(() => null)
      setDmLoading(false)
      if (body?.code === 'NOT_FRIENDS') router.push(`/people/${otherUserId}`)
      return
    }
    const room = await res.json()
    router.push(`/chat/${room.id}`)
  }

  function downloadIcal() {
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const start = new Date(startsAt)
    const end = new Date(endsAt)
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//WBR//Conference App//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:meeting-${meetingId}@wbr`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:1-1 with ${otherName} @ WBR 2027`,
      location ? `LOCATION:${location}` : '',
      notes ? `DESCRIPTION:${notes.replace(/\n/g, '\\n')}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\r\n')

    const blob = new Blob([ics], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meeting-${otherName.replace(/\s+/g, '-')}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (status === 'CANCELLED') {
    return (
      <div className="card border border-danger/20 bg-danger-soft text-center py-5">
        <p className="text-sm text-danger-ink font-semibold">This meeting has been cancelled</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Notes */}
      <div className="card">
        <label className="block text-xs font-semibold text-ink-2 uppercase tracking-wide mb-2">My Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Prep notes, talking points, follow-ups…"
          rows={3}
          className="textarea"
        />
        <button
          onClick={saveNotes}
          disabled={notesSaving}
          className={`btn-primary w-full mt-2 ${notesSaved ? 'bg-success' : ''}`}
        >
          {notesSaved ? '✓ Saved' : notesSaving ? 'Saving…' : 'Save Notes'}
        </button>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={openDm}
          disabled={dmLoading}
          className="btn-secondary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {dmLoading ? 'Opening…' : 'Message'}
        </button>
        <button
          onClick={downloadIcal}
          className="btn-secondary"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Add to Calendar
        </button>
      </div>

      <button
        onClick={cancelMeeting}
        disabled={cancelling}
        className="w-full py-2.5 text-sm font-semibold text-danger hover:text-danger-ink hover:bg-danger-soft rounded-xl border border-danger/20 transition-colors disabled:opacity-60"
      >
        {cancelling ? 'Cancelling…' : 'Cancel Meeting'}
      </button>
    </div>
  )
}
