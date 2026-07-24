'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PRIORITY_LABEL = { BEST_FIT: 'Best Fit', MED: 'Med', LOW: 'Low' } as const
const PRIORITY_BADGE = { BEST_FIT: 'badge badge-brand', MED: 'badge badge-warning', LOW: 'badge badge-neutral' } as const
const TIER_ORDER = ['BEST_FIT', 'MED', 'LOW'] as const
type Tier = keyof typeof PRIORITY_LABEL

interface TierRow {
  tier: Tier
  eligible: number
  scheduled: number
  skipped: number
}

interface PreviewResult {
  dryRun: boolean
  scheduled: unknown[]
  skipped: unknown[]
  byTier: TierRow[]
  totalEligible: number
}

export function PriorityAutoScheduleButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState<number | null>(null)

  async function openPreview() {
    setPreviewing(true)
    setError(null)
    setPreview(null)
    setApplied(null)
    setOpen(true)
    try {
      const res = await fetch('/api/auto-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      setPreview(data)
    } catch {
      setError('Network error')
    } finally {
      setPreviewing(false)
    }
  }

  async function apply() {
    setApplying(true)
    setError(null)
    try {
      const res = await fetch('/api/auto-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      setApplied(data.scheduled?.length ?? 0)
      setOpen(false)
      router.refresh()
    } catch {
      setError('Network error')
    } finally {
      setApplying(false)
    }
  }

  const busy = previewing || applying
  const orderedTiers = preview
    ? TIER_ORDER.map(t => preview.byTier.find(r => r.tier === t)).filter((r): r is TierRow => !!r)
    : []
  const totalScheduled = preview?.scheduled.length ?? 0
  const totalSkipped = preview?.skipped.length ?? 0
  const isEmpty = preview !== null && preview.totalEligible === 0

  return (
    <div className="flex items-center gap-2">
      {applied !== null && (
        <span className="text-xs text-ink-2">✓ {applied} scheduled</span>
      )}
      <button onClick={openPreview} disabled={busy} className="btn-primary btn-sm">
        Auto-Schedule by Priority
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface rounded-2xl p-5 shadow-elevated max-w-md w-full">
            <h2 className="font-semibold text-ink text-base">Auto-Schedule Preview</h2>

            {previewing ? (
              <p className="text-sm text-ink-2 mt-4">Working…</p>
            ) : error ? (
              <p className="text-sm text-danger mt-4">{error}</p>
            ) : isEmpty ? (
              <>
                <p className="text-sm text-ink-2 mt-4">No pending requests to schedule.</p>
                <div className="flex justify-end mt-5">
                  <button onClick={() => setOpen(false)} className="btn-secondary btn-sm">Close</button>
                </div>
              </>
            ) : preview ? (
              <>
                <div className="mt-4 space-y-2">
                  {orderedTiers.map(row => (
                    <div key={row.tier} className="flex items-center justify-between gap-3 rounded-2xl bg-fill px-3 py-2">
                      <span className={PRIORITY_BADGE[row.tier]}>{PRIORITY_LABEL[row.tier]}</span>
                      <span className="text-xs text-ink-2">
                        {row.scheduled} scheduled · {row.skipped} skipped · {row.eligible} eligible
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-ink-3 mt-3">
                  {preview.totalEligible} eligible · {totalScheduled} scheduled · {totalSkipped} skipped
                </p>
                {totalSkipped > 0 && (
                  <p className="text-xs text-ink-3 mt-1">
                    Skipped requests had no free slot or already have a meeting.
                  </p>
                )}

                <div className="flex justify-end gap-2 mt-5">
                  <button onClick={() => setOpen(false)} disabled={applying} className="btn-secondary btn-sm">
                    Cancel
                  </button>
                  <button onClick={apply} disabled={applying} className="btn-primary btn-sm">
                    {applying ? 'Working…' : 'Apply Schedule'}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
