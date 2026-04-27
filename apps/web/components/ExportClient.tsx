'use client'

import { useState } from 'react'

const EXPORTS = [
  {
    type: 'agenda',
    label: 'Agenda',
    description: 'All sessions with type, track, room, times, and speakers',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    ),
  },
  {
    type: 'meetings',
    label: 'Meetings',
    description: 'All 1-1 meetings with participants, times, location, and status',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    ),
  },
  {
    type: 'speakers',
    label: 'Speakers',
    description: 'All speakers with name, email, company, job title, and bio',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    ),
  },
  {
    type: 'attendees',
    label: 'All Attendees',
    description: 'Every user with name, email, company, job title, role, and join date',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    ),
  },
  {
    type: 'sponsors',
    label: 'Sponsors',
    description: 'All sponsors with tier, contact info, booth number, and company details',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    ),
  },
  {
    type: 'timeblocks',
    label: 'Time Blocks',
    description: 'All time blocks with title, type, times, and description',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
  },
]

export function ExportClient() {
  const [loading, setLoading] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function handleExport(type: string, label: string) {
    setLoading(type)
    setDone(null)
    try {
      const res = await fetch(`/api/export?type=${type}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${type}.csv`
      a.click()
      URL.revokeObjectURL(url)
      setDone(type)
      setTimeout(() => setDone(null), 3000)
    } catch {
      // silent — browser will show nothing downloaded
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <p className="text-sm text-gray-500">
        Download conference data as CSV files, ready to open in Excel, Google Sheets, or any spreadsheet app.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
        {EXPORTS.map(({ type, label, description, icon }) => (
          <div key={type} className="flex items-center gap-4 px-5 py-4">
            <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {icon}
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
            <button
              onClick={() => handleExport(type, label)}
              disabled={loading === type}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                done === type
                  ? 'bg-green-50 text-green-600 border border-green-200'
                  : 'bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20'
              } disabled:opacity-50`}
            >
              {loading === type ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Exporting…
                </>
              ) : done === type ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Downloaded
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
