'use client'

import { useState } from 'react'

interface Props {
  conference: {
    id: string
    name: string
    venue: string
    venueLat: string
    venueLon: string
    venueTimezone: string
    startDate: string
    endDate: string
    heroImageUrl: string
    wifiName: string
    wifiPassword: string
  }
}

export function AppSettingsForm({ conference }: Props) {
  const [form, setForm] = useState(conference)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await fetch('/api/conference', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Mobile App Home Screen</h2>
          <p className="text-sm text-gray-500 mt-0.5">These settings control what attendees see on the mobile app home screen.</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Conference Name */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Conference Details
        </h3>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Conference Title</label>
          <input
            value={form.name}
            onChange={e => set('name', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="e.g. WBR 2027"
          />
          <p className="text-xs text-gray-400 mt-1">Appears as the main title on the mobile app home screen.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Start Date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={e => set('startDate', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">End Date</label>
            <input
              type="date"
              value={form.endDate}
              onChange={e => set('endDate', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Venue</label>
          <input
            value={form.venue}
            onChange={e => set('venue', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="e.g. Convention Center, San Francisco"
          />
          <p className="text-xs text-gray-400 mt-1">Shown on the Venue tile and used for weather location.</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Latitude</label>
            <input
              value={form.venueLat}
              onChange={e => set('venueLat', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. 37.7749"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Longitude</label>
            <input
              value={form.venueLon}
              onChange={e => set('venueLon', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. -122.4194"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Timezone</label>
            <input
              value={form.venueTimezone}
              onChange={e => set('venueTimezone', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. America/Los_Angeles"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">Coordinates power the Weather widget. Get them from Google Maps.</p>
      </div>

      {/* Hero Image */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Header Image
        </h3>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Hero Image URL</label>
          <input
            value={form.heroImageUrl}
            onChange={e => set('heroImageUrl', e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="https://example.com/hero.jpg"
          />
          <p className="text-xs text-gray-400 mt-1">The large banner image at the top of the mobile app home screen.</p>
        </div>

        {form.heroImageUrl && (
          <div className="rounded-xl overflow-hidden border border-gray-100 bg-gray-50">
            <img
              src={form.heroImageUrl}
              alt="Hero preview"
              loading="lazy"
              className="w-full h-48 object-cover"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}
      </div>

      {/* WiFi */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
          </svg>
          WiFi Settings
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Network Name</label>
            <input
              value={form.wifiName}
              onChange={e => set('wifiName', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. WBR_Guest"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Password</label>
            <input
              value={form.wifiPassword}
              onChange={e => set('wifiPassword', e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. Welcome2027!"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">Shown on the WiFi tile on the mobile app. Attendees can tap to copy.</p>
      </div>
    </div>
  )
}
