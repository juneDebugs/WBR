'use client'

import { useEffect, useId, useState } from 'react'
import type { MeetingPriority } from '@conference/db'
import { useDialogFocus } from '@/lib/useDialogFocus'
import { PRIORITY_LABEL, PRIORITY_BADGE } from '@/lib/meetings-ui'

// Matches the engine's AutoScheduleResult/TierSummary shape returned verbatim
// by POST /api/auto-schedule.
interface PreviewResult {
  dryRun: boolean
  scheduled: unknown[]
  skipped: unknown[]
  byTier: { tier: MeetingPriority; eligible: number; scheduled: number; skipped: number }[]
  totalEligible: number
}

// Per-company auto-schedule: dry-run preview → confirm → apply.
export function CompanyAutoScheduleButton({ sponsorId, sponsorName, onSuccess }: {
  sponsorId: string
  sponsorName: string
  onSuccess: () => void
}) {
  const [open, setOpen] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function openPreview() {
    setPreviewing(true)
    setError(null)
    setPreview(null)
    setOpen(true)
    try {
      // Approved-only: the Inbound (PENDING) queue requires an explicit
      // approve/decline decision, so auto-schedule fills only the bank.
      const res = await fetch('/api/auto-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, sponsorId, statuses: ['APPROVED'] }),
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
        body: JSON.stringify({ sponsorId, statuses: ['APPROVED'] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      setOpen(false)
      onSuccess()
    } catch {
      setError('Network error')
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <button type="button" onClick={openPreview} disabled={previewing} className="btn-primary">
        <svg className="w-5 h-5 text-yellow-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Auto-schedule
      </button>

      {open && (
        <PreviewDialog
          sponsorName={sponsorName}
          previewing={previewing}
          applying={applying}
          preview={preview}
          error={error}
          onApply={apply}
          onClose={() => { if (!applying) setOpen(false) }}
        />
      )}
    </>
  )
}

function PreviewDialog({ sponsorName, previewing, applying, preview, error, onApply, onClose }: {
  sponsorName: string
  previewing: boolean
  applying: boolean
  preview: PreviewResult | null
  error: string | null
  onApply: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const ref = useDialogFocus<HTMLDivElement>(true)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const willSchedule = preview?.scheduled.length ?? 0

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5"
        onClick={e => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold text-ink">Auto-schedule {sponsorName}</h2>
        <p className="text-sm text-ink-2 mt-1">Preview of what the scheduler will book, by priority tier.</p>

        {error && (
          <div className="mt-3 rounded-xl bg-danger-soft text-danger-ink text-sm px-3 py-2" role="alert">
            {error}
          </div>
        )}

        {previewing ? (
          <div className="mt-4 space-y-2" aria-hidden="true">
            {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-9 w-full" />)}
          </div>
        ) : preview ? (
          preview.totalEligible === 0 ? (
            <p className="text-sm text-ink-2 mt-4">No unscheduled requests for this company.</p>
          ) : (
            <div className="mt-4 border border-hairline rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-fill border-b border-hairline">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-ink-2 uppercase tracking-wide">Tier</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-ink-2 uppercase tracking-wide">Eligible</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-ink-2 uppercase tracking-wide">Will schedule</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-ink-2 uppercase tracking-wide">Skipped</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {preview.byTier.map(row => (
                    <tr key={row.tier}>
                      <td className="px-3 py-2"><span className={PRIORITY_BADGE[row.tier]}>{PRIORITY_LABEL[row.tier]}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-2">{row.eligible}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">{row.scheduled}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-2">{row.skipped}</td>
                    </tr>
                  ))}
                  <tr className="bg-fill/60">
                    <td className="px-3 py-2 font-semibold text-ink">Total</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">{preview.totalEligible}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">{preview.scheduled.length}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-2">{preview.skipped.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        ) : null}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} disabled={applying} className="btn">
            Cancel
          </button>
          <button type="button" onClick={onApply} disabled={applying || previewing || willSchedule === 0} className="btn-primary">
            {applying ? 'Scheduling…' : `Schedule ${willSchedule} meeting${willSchedule === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
