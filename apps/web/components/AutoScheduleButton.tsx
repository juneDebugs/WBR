'use client'

import { useState } from 'react'

interface Props {
  approvedCount: number
}

export function AutoScheduleButton({ approvedCount }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ scheduled: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    if (!approvedCount) return
    if (!confirm(`Auto-schedule all ${approvedCount} approved request(s)? This will assign the next available mutual time slot to each.`)) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/schedule-meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoScheduleAll: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      setResult({ scheduled: data.scheduled, skipped: data.skipped })
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {result && (
        <span className="text-xs text-ink-2">
          ✓ {result.scheduled} scheduled{result.skipped > 0 ? `, ${result.skipped} skipped (no availability)` : ''}
        </span>
      )}
      {error && (
        <span className="text-xs text-danger">{error}</span>
      )}
      {!approvedCount && !result && (
        <span className="text-xs text-ink-2">Approve requests first to enable auto-scheduling</span>
      )}
      <button
        onClick={run}
        disabled={loading || !approvedCount}
        title={!approvedCount ? 'No approved requests to schedule' : undefined}
        className="btn-primary btn-sm"
      >
        {loading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Scheduling…
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Auto-Schedule All{approvedCount ? ` (${approvedCount})` : ''}
          </>
        )}
      </button>
    </div>
  )
}
