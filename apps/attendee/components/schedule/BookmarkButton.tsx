'use client'

import { useState } from 'react'

interface Props {
  sessionId: string
  initialSaved: boolean
}

export function BookmarkButton({ sessionId, initialSaved }: Props) {
  const [saved, setSaved] = useState(initialSaved)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    if (loading) return
    setLoading(true)
    const res = await fetch(`/api/sessions/${sessionId}/bookmark`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setSaved(data.bookmarked)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
        saved
          ? 'bg-primary/10 text-primary'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >
      <svg
        className="w-4 h-4 text-pink-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      {saved ? 'Saved' : 'Save'}
    </button>
  )
}
