'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import type { AutoMatch, AutoMatchScheduleResult } from '@conference/db'
import { useAutoMatchBoard, invalidateScheduler } from '@/lib/scheduler-hooks'
import { fmtRangeUTC } from '@/lib/format'
import { TIER_COLORS, TIER_FALLBACK } from '@/lib/meetings-ui'

const fmtPickDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function initial(name: string | null | undefined) {
  return (name?.trim()[0] ?? '?').toUpperCase()
}

// Mutual Best Fit matches: pairs where the sponsor and the attendee each picked
// the other as Best Fit through their portals. Ready matches can be scheduled
// in one pass (preview → apply); scheduled ones show their slot and room.
export function AutoMatchBoard() {
  const queryClient = useQueryClient()
  const { data: board, isLoading, isError, refetch } = useAutoMatchBoard()

  const [preview, setPreview] = useState<AutoMatchScheduleResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function post(dryRun: boolean): Promise<AutoMatchScheduleResult> {
    const r = await fetch('/api/admin/scheduler/auto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dryRun ? { dryRun: true } : {}),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(data.error ?? `Scheduling failed (${r.status})`)
    return data
  }

  async function openPreview() {
    setPreviewing(true)
    setError(null)
    setApplied(null)
    try {
      setPreview(await post(true))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setPreviewing(false)
    }
  }

  async function apply() {
    setApplying(true)
    setError(null)
    try {
      const result = await post(false)
      setApplied(result.scheduled.length)
      setPreview(null)
      invalidateScheduler(queryClient)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setApplying(false)
    }
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-4 py-3" role="alert">
        Couldn&rsquo;t load auto matches.{' '}
        <button type="button" onClick={() => refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !board) return <BoardSkeleton />

  const ready = board.matches.filter(m => !m.meeting)
  const scheduled = board.matches.filter(m => m.meeting)

  return (
    <div>
      {/* ── Summary tiles + bulk action ── */}
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div className="grid grid-cols-3 gap-3 flex-1 max-w-xl">
          {([
            { label: 'Mutual Matches', val: board.totals.matches, num: 'text-ink' },
            { label: 'Awaiting Schedule', val: board.totals.ready, num: board.totals.ready > 0 ? 'text-warning-ink' : 'text-ink' },
            { label: 'Scheduled', val: board.totals.scheduled, num: 'text-success-ink' },
          ] as const).map(({ label, val, num }) => (
            <div key={label} className="bg-white border border-hairline rounded-xl px-4 py-3">
              <p className="text-caption text-ink-2 font-medium mb-1.5">{label}</p>
              <p className={`text-2xl font-bold tabular-nums ${num}`}>{val}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {applied !== null && (
            <span className="text-xs text-success-ink font-medium" aria-live="polite">
              {'✓'} {applied} meeting{applied === 1 ? '' : 's'} scheduled
            </span>
          )}
          {board.totals.ready > 0 && (
            <button type="button" onClick={openPreview} disabled={previewing || applying} className="btn-primary btn-sm">
              {previewing ? 'Working…' : `Schedule ${board.totals.ready} Match${board.totals.ready === 1 ? '' : 'es'}`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl bg-danger-soft text-danger-ink text-sm px-3 py-2" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-semibold" aria-label="Dismiss error">
            {'✕'}
          </button>
        </div>
      )}

      {board.matches.length === 0 ? (
        <div className="empty-state bg-white border border-hairline rounded-xl">
          <p className="font-medium text-ink">No mutual matches yet</p>
          <p className="text-sm text-ink-2 max-w-md">
            A match appears automatically when a sponsor and an attendee each pick the other as{' '}
            <span className="font-medium">Best Fit</span> through their portals.
          </p>
          <Link href="?tab=requests" className="mt-2 text-primary text-sm hover:underline">
            View all meeting requests {'→'}
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {ready.length > 0 && (
            <section aria-label="Matches awaiting schedule">
              <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">
                Awaiting Schedule <span className="font-normal normal-case">{'·'} {ready.length}</span>
              </p>
              <div className="space-y-2">
                {ready.map(m => <MatchCard key={m.key} match={m} />)}
              </div>
            </section>
          )}
          {scheduled.length > 0 && (
            <section aria-label="Scheduled matches">
              <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">
                Scheduled <span className="font-normal normal-case">{'·'} {scheduled.length}</span>
              </p>
              <div className="space-y-2">
                {scheduled.map(m => <MatchCard key={m.key} match={m} />)}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Preview → apply dialog ── */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Schedule auto matches" className="bg-surface rounded-2xl p-5 shadow-elevated max-w-md w-full">
            <h2 className="font-semibold text-ink text-base">Schedule Auto Matches</h2>
            {preview.scheduled.length === 0 ? (
              <p className="text-sm text-ink-2 mt-4">
                None of the {preview.matchedPairs} ready match{preview.matchedPairs === 1 ? '' : 'es'} can be placed
                right now — the attendees or booths are fully booked.
              </p>
            ) : (
              <>
                <p className="text-sm text-ink-2 mt-4">
                  {preview.scheduled.length} of {preview.matchedPairs} ready match{preview.matchedPairs === 1 ? '' : 'es'} will
                  get a confirmed meeting in the earliest open slot:
                </p>
                <ul className="mt-3 space-y-1.5 max-h-56 overflow-y-auto">
                  {preview.scheduled.map(s => (
                    <li key={s.requestId} className="flex items-center justify-between gap-3 rounded-2xl bg-fill px-3 py-2 text-xs">
                      <span className="font-medium text-ink truncate">{s.sponsorName} {'↔'} {s.userName}</span>
                      <span className="text-ink-2 whitespace-nowrap tabular-nums">{s.room}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {preview.skipped.length > 0 && (
              <p className="text-xs text-ink-3 mt-3">
                {preview.skipped.length} skipped — no free slot, or the pair already has a meeting.
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setPreview(null)} disabled={applying} className="btn-secondary btn-sm">
                Cancel
              </button>
              {preview.scheduled.length > 0 && (
                <button type="button" onClick={apply} disabled={applying} className="btn-primary btn-sm">
                  {applying ? 'Working…' : 'Confirm Schedule'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// One matched pair: sponsor ⇄ attendee, both Best Fit picks with their dates,
// the solutions-fit signal, and the slot/room once the meeting exists.
function MatchCard({ match }: { match: AutoMatch }) {
  return (
    <div className="bg-white border border-hairline rounded-xl px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Sponsor */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-52">
          {match.sponsor.logoUrl ? (
            <div className="w-9 h-9 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
              <Image src={match.sponsor.logoUrl} alt="" width={36} height={36} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold text-sm flex-shrink-0">
              {initial(match.sponsor.name)}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-semibold text-ink leading-tight truncate">{match.sponsor.name}</p>
            <span className={`badge text-caption ${TIER_COLORS[match.sponsor.tier] ?? TIER_FALLBACK}`}>{match.sponsor.tier}</span>
          </div>
        </div>

        {/* Mutual badge */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="badge badge-brand whitespace-nowrap">{'↔'} Mutual Best Fit</span>
          {match.score > 0 && (
            <span className="text-caption text-ink-3 tabular-nums">{match.score}% fit</span>
          )}
        </div>

        {/* Attendee */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-52">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
            {initial(match.attendee.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-ink leading-tight truncate">{match.attendee.name}</p>
            {match.attendee.company && <p className="text-xs text-ink-2 truncate">{match.attendee.company}</p>}
          </div>
        </div>

        {/* Outcome */}
        <div className="flex-shrink-0 text-right ml-auto">
          {match.meeting ? (
            <>
              <span className="badge badge-success">{'✓'} Scheduled</span>
              <p className="text-xs text-ink-2 tabular-nums mt-1">
                {fmtRangeUTC(match.meeting.startsAt, match.meeting.endsAt)}
                {match.meeting.room && <span className="text-ink-3"> {'·'} {match.meeting.room}</span>}
              </p>
            </>
          ) : (
            <span className="badge badge-warning">Ready to schedule</span>
          )}
        </div>
      </div>

      {/* Pick provenance */}
      <p className="text-caption text-ink-3 mt-2">
        {match.sponsorPick.byName} picked Best Fit {fmtPickDate(match.sponsorPick.pickedAt)}
        <span className="mx-1">{'·'}</span>
        {match.attendeePick.byName} picked Best Fit {fmtPickDate(match.attendeePick.pickedAt)}
        <span className="mx-1">{'·'}</span>
        Matched {fmtPickDate(match.matchedAt)}
        {match.matchedSolutions.length > 0 && (
          <>
            <span className="mx-1">{'·'}</span>
            {match.matchedSolutions.slice(0, 3).join(', ')}
            {match.matchedSolutions.length > 3 && ` +${match.matchedSolutions.length - 3}`}
          </>
        )}
      </p>
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 max-w-xl mb-5">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-hairline rounded-xl px-4 py-3">
            <div className="skeleton h-3 w-20 mb-2" />
            <div className="skeleton h-8 w-10" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-hairline rounded-xl px-4 py-4 flex items-center gap-4">
            <div className="skeleton w-9 h-9 rounded-lg flex-shrink-0" />
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-4 w-28 mx-auto" />
            <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-4 w-24 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
