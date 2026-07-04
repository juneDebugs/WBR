'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'

interface Props {
  id: string
  name: string
  venue: string | null
  startDate: string
  endDate: string
}

export function ConferenceBanner({ id, name, venue, startDate, endDate }: Props) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name,
    venue: venue ?? '',
    startDate: startDate.slice(0, 10),
    endDate: endDate.slice(0, 10),
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [current, setCurrent] = useState({ name, venue, startDate, endDate })

  async function save() {
    setSaving(true)
    const res = await fetch('/api/conference', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...form }),
    })
    if (res.ok) {
      setCurrent({
        name: form.name,
        venue: form.venue || null,
        startDate: form.startDate,
        endDate: form.endDate,
      })
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  const dateRange = useMemo(() => {
    try {
      const s = new Date(current.startDate)
      const e = new Date(current.endDate)
      if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
        return `${format(s, 'MMMM d')}–${format(e, 'd, yyyy')}`
      }
      return `${format(s, 'MMMM d')} – ${format(e, 'MMMM d, yyyy')}`
    } catch { return '' }
  }, [current.startDate, current.endDate])

  return (
    <div className="mb-6 bg-primary/5 border border-primary/20 rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs text-primary font-medium uppercase tracking-wide mb-1">Active Conference</p>
        <button
          onClick={() => { setEditing(e => !e); setSaved(false) }}
          className="flex items-center gap-1 text-xs text-primary font-medium hover:underline flex-shrink-0"
        >
          {editing ? (
            'Cancel'
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </>
          )}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2 mt-1">
          <div>
            <label className="text-caption font-semibold text-ink-2 uppercase tracking-wide">Name</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full mt-0.5 px-3 py-1.5 text-sm font-bold text-ink border border-hairline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            />
          </div>
          <div>
            <label className="text-caption font-semibold text-ink-2 uppercase tracking-wide">Venue</label>
            <input
              value={form.venue}
              onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
              className="w-full mt-0.5 px-3 py-1.5 text-sm text-ink border border-hairline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              placeholder="e.g. Convention Center, San Francisco"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-caption font-semibold text-ink-2 uppercase tracking-wide">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className="w-full mt-0.5 px-3 py-1.5 text-sm text-ink border border-hairline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              />
            </div>
            <div className="flex-1">
              <label className="text-caption font-semibold text-ink-2 uppercase tracking-wide">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                className="w-full mt-0.5 px-3 py-1.5 text-sm text-ink border border-hairline rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving || !form.name.trim()}
            className="btn-primary btn-sm mt-1"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-bold text-ink">{current.name}</h2>
          <div className="flex items-center gap-2 flex-wrap text-sm text-ink-2 mt-0.5">
            {current.venue && <span>{current.venue}</span>}
            {current.venue && dateRange && <span className="text-ink-3">·</span>}
            {dateRange && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {dateRange}
              </span>
            )}
          </div>
          {saved && <p className="text-xs text-success-ink mt-1 font-medium">✓ Saved</p>}
        </div>
      )}
    </div>
  )
}
