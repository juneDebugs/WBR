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
      <div className="card border border-red-100 bg-red-50 text-center py-5">
        <p className="text-sm text-red-500 font-semibold">This meeting has been cancelled</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Notes */}
      <div className="card">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">My Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Prep notes, talking points, follow-ups…"
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={saveNotes}
          disabled={notesSaving}
          className={`mt-2 w-full py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 ${
            notesSaved ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {notesSaved ? '✓ Saved' : notesSaving ? 'Saving…' : 'Save Notes'}
        </button>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={openDm}
          disabled={dmLoading}
          className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {dmLoading ? 'Opening…' : 'Message'}
        </button>
        <button
          onClick={downloadIcal}
          className="flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
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
        className="w-full py-2.5 text-sm font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl border border-red-100 transition-colors disabled:opacity-60"
      >
        {cancelling ? 'Cancelling…' : 'Cancel Meeting'}
      </button>
    </div>
  )
}
