'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useQueryClient } from '@tanstack/react-query'
import { useMeetingRequirementSettings, invalidateScheduler, type SettingsSponsor } from '@/lib/scheduler-hooks'
import { Stepper } from '@/components/Stepper'
import { TIER_COLORS, TIER_FALLBACK } from '@/lib/meetings-ui'

// Editable slice of the settings payload (the sponsor roster is read-only
// context and stays outside the draft/snapshot pair).
type Draft = {
  attendeeRequired: number
  sponsorDefaultRequired: number
  sponsorOverrides: Record<string, number>
}

type Status = 'idle' | 'saving' | 'saved' | 'error'

function cloneDraft(d: Draft): Draft {
  return { ...d, sponsorOverrides: { ...d.sponsorOverrides } }
}

function sameDraft(a: Draft, b: Draft): boolean {
  if (a.attendeeRequired !== b.attendeeRequired) return false
  if (a.sponsorDefaultRequired !== b.sponsorDefaultRequired) return false
  const aIds = Object.keys(a.sponsorOverrides)
  if (aIds.length !== Object.keys(b.sponsorOverrides).length) return false
  return aIds.every(id => a.sponsorOverrides[id] === b.sponsorOverrides[id])
}

// Settings section of the Companies tab: how many meetings each attendee must
// book, and how many each sponsor company must fill (global default +
// per-company overrides). Mirrors ChatSettingsPanel's draft/snapshot mechanics
// — dirty tracking, discard, beforeunload guard, sticky save bar, diff-only PUT.
export function CompanyMeetingSettings() {
  const queryClient = useQueryClient()
  const { data, isLoading, isError, refetch } = useMeetingRequirementSettings()

  const [snapshot, setSnapshot] = useState<Draft | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [query, setQuery] = useState('')
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  // Seed the draft/snapshot pair once the settings arrive. Later background
  // refetches (invalidateScheduler after a save elsewhere) must not clobber
  // in-progress edits, so only the first load seeds.
  useEffect(() => {
    if (!data || snapshot) return
    const seed: Draft = {
      attendeeRequired: data.attendeeRequired,
      sponsorDefaultRequired: data.sponsorDefaultRequired,
      sponsorOverrides: { ...data.sponsorOverrides },
    }
    setSnapshot(cloneDraft(seed))
    setDraft(cloneDraft(seed))
  }, [data, snapshot])

  const dirty = useMemo(() => !!draft && !!snapshot && !sameDraft(draft, snapshot), [draft, snapshot])

  // Warn before a full page unload while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  const busy = status === 'saving'

  function markTouched() {
    if (status === 'saved') setStatus('idle')
  }

  function patchDraft(patch: (next: Draft) => void) {
    setDraft(prev => {
      if (!prev) return prev
      const next = cloneDraft(prev)
      patch(next)
      return next
    })
    markTouched()
  }

  function discard() {
    if (snapshot) setDraft(cloneDraft(snapshot))
    setStatus('idle')
    setErrorMsg('')
  }

  const sponsors = data?.sponsors ?? []
  const filteredSponsors = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sponsors
    return sponsors.filter(s => s.name.toLowerCase().includes(q))
  }, [sponsors, query])

  async function save() {
    if (!draft || !snapshot) return
    setStatus('saving')
    setErrorMsg('')

    // Send only what changed.
    const body: {
      attendeeRequired?: number
      sponsorDefaultRequired?: number
      sponsorOverrides?: { sponsorId: string; required: number | null }[]
    } = {}
    if (draft.attendeeRequired !== snapshot.attendeeRequired) body.attendeeRequired = draft.attendeeRequired
    if (draft.sponsorDefaultRequired !== snapshot.sponsorDefaultRequired) {
      body.sponsorDefaultRequired = draft.sponsorDefaultRequired
    }
    const overrides: { sponsorId: string; required: number | null }[] = []
    for (const [sponsorId, required] of Object.entries(draft.sponsorOverrides)) {
      if (snapshot.sponsorOverrides[sponsorId] !== required) overrides.push({ sponsorId, required })
    }
    for (const sponsorId of Object.keys(snapshot.sponsorOverrides)) {
      if (!(sponsorId in draft.sponsorOverrides)) overrides.push({ sponsorId, required: null })
    }
    if (overrides.length > 0) body.sponsorOverrides = overrides

    try {
      const res = await fetch('/api/admin/scheduler/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErrorMsg(d.error ?? 'Couldn’t save meeting requirements. Your changes weren’t applied.')
        setStatus('error')
        setTimeout(() => errorRef.current?.focus(), 0)
        return
      }
      const view = (await res.json().catch(() => null)) as {
        attendeeRequired: number
        sponsorDefaultRequired: number
        sponsorOverrides: Record<string, number>
      } | null
      // Trust the server-normalized view when present, else our optimistic draft.
      const next: Draft = view
        ? {
            attendeeRequired: view.attendeeRequired,
            sponsorDefaultRequired: view.sponsorDefaultRequired,
            sponsorOverrides: { ...view.sponsorOverrides },
          }
        : cloneDraft(draft)
      setSnapshot(cloneDraft(next))
      setDraft(cloneDraft(next))
      setStatus('saved')
      savedTimer.current = setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), 3000)
      // Directory fill meters and matrix chips derive from these numbers.
      invalidateScheduler(queryClient)
    } catch {
      setErrorMsg('Network error — meeting requirements weren’t saved.')
      setStatus('error')
      setTimeout(() => errorRef.current?.focus(), 0)
    }
  }

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-4 py-3" role="alert">
        Couldn&rsquo;t load meeting requirement settings.{' '}
        <button type="button" onClick={() => refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    )
  }

  if (isLoading || !data || !draft || !snapshot) return <SettingsSkeleton />

  const showSaveBar = dirty || status === 'saving' || status === 'saved'

  return (
    <div className="max-w-4xl space-y-6 pb-24">
      <div>
        <h2 className="text-title3 font-semibold text-ink">Meeting Requirements</h2>
        <p className="text-sm text-ink-2 mt-0.5">
          Set how many 1-on-1 meetings attendees and sponsor companies are expected to book.
        </p>
      </div>

      {status === 'error' && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="flex items-center justify-between gap-2 px-4 py-2.5 bg-danger-soft border border-danger/30 rounded-xl focus:outline-none"
        >
          <p className="text-sm text-danger-ink">{errorMsg}</p>
          <button onClick={() => setStatus('idle')} className="text-danger hover:text-danger-ink" aria-label="Dismiss error">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── 1. Attendee requirement ─────────────────────────────────────────── */}
      <section className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-hairline">
          <h3 className="text-headline text-ink">Attendees</h3>
          <p className="text-sm text-ink-2 mt-0.5">Applies to every attendee at the conference.</p>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          {/* Visible text mirrors the Stepper's aria-label (group + input). */}
          <span className="text-sm font-medium text-ink">Required meetings per attendee</span>
          <Stepper
            value={draft.attendeeRequired}
            onChange={n => patchDraft(next => { next.attendeeRequired = n })}
            label="Required meetings per attendee"
            disabled={busy}
          />
        </div>
      </section>

      {/* ── 2. Sponsor requirements ─────────────────────────────────────────── */}
      <section className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
        <div className="px-5 py-4 border-b border-hairline">
          <h3 className="text-headline text-ink">Sponsors</h3>
          <p className="text-sm text-ink-2 mt-0.5">
            How many confirmed meetings each sponsor company is expected to fill.
          </p>
        </div>

        <div className="px-5 py-4 border-b border-hairline">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="text-sm font-medium text-ink">Default required meetings per company</span>
            <Stepper
              value={draft.sponsorDefaultRequired}
              onChange={n => patchDraft(next => { next.sponsorDefaultRequired = n })}
              label="Default required meetings per company"
              disabled={busy}
            />
          </div>
          <p className="text-caption text-ink-3 mt-2">Companies without a custom requirement use this default.</p>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <h4 className="section-title">Per-company requirements</h4>
            <input
              type="search"
              className="input w-64"
              placeholder="Search companies…"
              aria-label="Search companies"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          {filteredSponsors.length === 0 ? (
            <div className="empty-state">
              <p className="font-medium text-ink">No companies match &ldquo;{query}&rdquo;</p>
              <p className="text-sm text-ink-2">Try a different name.</p>
            </div>
          ) : (
            <ul className="divide-y divide-hairline">
              {filteredSponsors.map(s => (
                <SponsorRow
                  key={s.id}
                  sponsor={s}
                  override={draft.sponsorOverrides[s.id]}
                  defaultRequired={draft.sponsorDefaultRequired}
                  busy={busy}
                  onCustomize={() =>
                    patchDraft(next => { next.sponsorOverrides[s.id] = next.sponsorDefaultRequired })
                  }
                  onUseDefault={() => patchDraft(next => { delete next.sponsorOverrides[s.id] })}
                  onChange={n => patchDraft(next => { next.sponsorOverrides[s.id] = n })}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Sticky save bar ─────────────────────────────────────────────────── */}
      {showSaveBar && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(56rem,calc(100vw-3rem))] flex items-center justify-between gap-3 bg-white border border-hairline rounded-2xl shadow-pop px-4 py-3">
          {status === 'saved' ? (
            <span role="status" className="flex items-center gap-1.5 text-sm text-success-ink">
              <CheckIcon className="w-4 h-4" />
              All changes saved
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />
              Unsaved changes
            </span>
          )}
          <div className="flex items-center gap-2">
            {status !== 'saved' && (
              <button type="button" onClick={discard} disabled={busy} className="btn-secondary">
                Discard
              </button>
            )}
            {status !== 'saved' && (
              <button type="button" onClick={save} disabled={busy || !dirty} className="btn-primary">
                {busy && <Spinner />}
                {busy ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// One sponsor row: identity on the left, its requirement control on the right —
// a stepper when the company carries an override, otherwise the default value
// with a Customize button that seeds an override at the current default.
function SponsorRow({
  sponsor,
  override,
  defaultRequired,
  busy,
  onCustomize,
  onUseDefault,
  onChange,
}: {
  sponsor: SettingsSponsor
  override: number | undefined
  defaultRequired: number
  busy: boolean
  onCustomize: () => void
  onUseDefault: () => void
  onChange: (n: number) => void
}) {
  return (
    <li className="min-h-[44px] py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {sponsor.logoUrl ? (
          <div className="w-8 h-8 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
            <Image src={sponsor.logoUrl} alt="" width={32} height={32} className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold text-sm flex-shrink-0">
            {sponsor.name[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <span className="text-sm font-medium text-ink truncate">{sponsor.name}</span>
        <span className={`badge text-caption flex-shrink-0 ${TIER_COLORS[sponsor.tier] ?? TIER_FALLBACK}`}>{sponsor.tier}</span>
      </div>
      {override !== undefined ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <Stepper
            value={override}
            onChange={onChange}
            label={`Required meetings for ${sponsor.name}`}
            disabled={busy}
          />
          <button type="button" onClick={onUseDefault} disabled={busy} className="btn-ghost btn-sm">
            Use default
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-footnote text-ink-3 tabular-nums">Default · {defaultRequired}</span>
          <button type="button" onClick={onCustomize} disabled={busy} className="btn-secondary btn-sm">
            Customize
          </button>
        </div>
      )}
    </li>
  )
}

// Loading placeholder mirroring the two grouped cards.
function SettingsSkeleton() {
  return (
    <div className="max-w-4xl space-y-6" aria-hidden="true">
      <div>
        <div className="skeleton h-6 w-56" />
        <div className="skeleton h-4 w-80 mt-2" />
      </div>
      {[...Array(2)].map((_, i) => (
        <div key={i} className="bg-white border border-hairline rounded-2xl shadow-card overflow-hidden">
          <div className="px-5 py-4 border-b border-hairline">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton h-4 w-64 mt-2" />
          </div>
          <div className="px-5 py-4 space-y-3">
            {[...Array(i === 0 ? 1 : 4)].map((_, j) => (
              <div key={j} className="flex items-center justify-between gap-3">
                <div className="skeleton h-4 w-48" />
                <div className="skeleton h-11 w-40 rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Inline icons (stroke, HIG-weight) ───────────────────────────────────────
function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin motion-reduce:animate-none" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  )
}
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
