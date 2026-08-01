'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import Image from 'next/image'
import { useMeetingsLog } from '@/lib/scheduler-hooks'
import { fmtTime, TZ } from '@/lib/format'
import { TIER_COLORS } from '@/lib/meetings-ui'
import type { MeetingLogEntry, MeetingLogKind } from '@conference/db'

// Meetings → Log tab.
//
// A single, calm, chronological feed of every internal note and comment written
// across the Meetings domain — 1-on-1 meeting notes, on-site floor notes,
// cancellation reasons and meeting-request messages — consolidated from surfaces
// that were previously scattered across the scheduler, the check-in board, the
// cancel dialogs and the request modals.
//
// Design follows Apple's HIG for lists and content: a search field + a segmented
// control to scope by kind, day-grouped sections with sticky headers, and
// grouped "cards" that lead with a color-coded symbol, a clear title, secondary
// metadata, then the note itself set apart as a quoted block.

const KIND_META: Record<MeetingLogKind, { label: string; short: string; tile: string; badge: string; icon: React.ReactNode }> = {
  MEETING_NOTE: {
    label: 'Meeting Note', short: 'Notes',
    tile: 'bg-brand-50 text-brand-700', badge: 'bg-brand-50 text-brand-700',
    icon: <IconNote />,
  },
  FLOOR_NOTE: {
    label: 'Floor Note', short: 'Floor',
    tile: 'bg-success-soft text-success-ink', badge: 'bg-success-soft text-success-ink',
    icon: <IconPin />,
  },
  CANCELLATION: {
    label: 'Cancellation', short: 'Cancelled',
    tile: 'bg-danger-soft text-danger-ink', badge: 'bg-danger-soft text-danger-ink',
    icon: <IconCancel />,
  },
  REQUEST_MESSAGE: {
    label: 'Request', short: 'Requests',
    tile: 'bg-warning-soft text-warning-ink', badge: 'bg-warning-soft text-warning-ink',
    icon: <IconRequest />,
  },
}

// The segmented-control order: All, then the four kinds.
const FILTERS: { key: 'all' | MeetingLogKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'MEETING_NOTE', label: KIND_META.MEETING_NOTE.short },
  { key: 'FLOOR_NOTE', label: KIND_META.FLOOR_NOTE.short },
  { key: 'CANCELLATION', label: KIND_META.CANCELLATION.short },
  { key: 'REQUEST_MESSAGE', label: KIND_META.REQUEST_MESSAGE.short },
]

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TZ })
const dayHeadingFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TZ })

// "Today" / "Yesterday" / full date — computed in the event timezone so the
// buckets line up with every other Meetings surface (all render in TZ).
function dayLabel(iso: string, todayKey: string, yesterdayKey: string): string {
  const key = dayKeyFmt.format(new Date(iso))
  if (key === todayKey) return 'Today'
  if (key === yesterdayKey) return 'Yesterday'
  return dayHeadingFmt.format(new Date(iso))
}

export default function MeetingsLog() {
  const { data, isLoading, isError, refetch } = useMeetingsLog()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | MeetingLogKind>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const entries = data?.entries ?? []
  const counts = data?.counts

  // Precompute the lowercased search haystack per entry once (keyed on entries),
  // so each keystroke does a plain includes() instead of rebuilding + joining +
  // lowercasing every entry's fields on every render.
  const searchable = useMemo(
    () => entries.map(e => ({
      entry: e,
      hay: [e.text, e.detail ?? '', e.title, e.subtitle ?? '', e.sponsorName ?? '', ...e.parties].join(' ').toLowerCase(),
    })),
    [entries],
  )

  // Filter by kind + free-text search across the note body, the parties and the
  // company. Grouping into day sections happens after, on the filtered set.
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = searchable
      .filter(({ entry: e, hay }) => {
        if (filter !== 'all' && e.kind !== filter) return false
        if (!q) return true
        return hay.includes(q)
      })
      .map(s => s.entry)

    const now = new Date()
    const todayKey = dayKeyFmt.format(now)
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayKey = dayKeyFmt.format(yesterday)

    const byDay = new Map<string, { label: string; items: MeetingLogEntry[] }>()
    for (const e of filtered) {
      const key = dayKeyFmt.format(new Date(e.timestamp))
      let g = byDay.get(key)
      if (!g) {
        g = { label: dayLabel(e.timestamp, todayKey, yesterdayKey), items: [] }
        byDay.set(key, g)
      }
      g.items.push(e)
    }
    // entries arrive newest-first; Map preserves that insertion order, and each
    // day's items stay newest-first within the section.
    return { list: Array.from(byDay.values()), total: filtered.length }
  }, [searchable, filter, query])

  // Stable identity so the memoized LogCards can bail out on the 30s poll
  // re-render instead of all re-rendering because `onToggle` changed.
  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  if (isLoading) return <LogSkeleton />

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-soft text-danger-ink px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-subhead font-medium">Couldn’t load the meetings log.</p>
        <button type="button" onClick={() => refetch()} className="btn btn-sm btn-secondary">Retry</button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Intro — what this feed is */}
      <div className="mb-4">
        <h2 className="text-title3 font-semibold text-ink">Activity Log</h2>
        <p className="text-footnote text-ink-2 mt-0.5">
          Every internal note and comment across meetings, newest first.
        </p>
      </div>

      {/* Toolbar — search + segmented kind filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 min-w-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none">
            <IconSearch />
          </span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search notes, people, companies…"
            aria-label="Search the meetings log"
            className="input w-full pl-9"
          />
        </div>
        <div className="segmented shrink-0 overflow-x-auto" role="tablist" aria-label="Filter by note type">
          {FILTERS.map(f => {
            const n = f.key === 'all' ? (counts?.all ?? 0) : (counts?.[f.key] ?? 0)
            return (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`segmented-item whitespace-nowrap ${filter === f.key ? 'active' : ''}`}
              >
                {f.label}
                <span className="ml-1.5 text-caption tabular-nums opacity-60">{n}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Feed */}
      {groups.total === 0 ? (
        <EmptyState searching={query.trim().length > 0 || filter !== 'all'} />
      ) : (
        <div className="space-y-6">
          {groups.list.map(group => (
            <section key={group.label}>
              <div className="section-title sticky top-0 z-10 bg-canvas/85 backdrop-blur-sm py-1.5">
                {group.label}
              </div>
              <div className="space-y-2.5">
                {group.items.map(entry => (
                  <LogCard
                    key={entry.id}
                    entry={entry}
                    expanded={expanded.has(entry.id)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

const LogCard = memo(function LogCard({ entry, expanded, onToggle }: { entry: MeetingLogEntry; expanded: boolean; onToggle: (id: string) => void }) {
  const meta = KIND_META[entry.kind]
  // Long notes clamp to a few lines; a "Show more" toggle reveals the rest.
  const clampable = entry.text.length > 220 || entry.text.includes('\n')

  return (
    <article className="card p-4 flex gap-3.5">
      {/* Color-coded symbol tile — communicates the note kind at a glance */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.tile}`} aria-hidden="true">
        {meta.icon}
      </div>

      <div className="min-w-0 flex-1">
        {/* Header row: title + kind badge + timestamp */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-headline text-ink truncate">{entry.title}</p>
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-footnote text-ink-2">
              <span>{entry.subtitle}</span>
              {entry.slotStartsAt && (
                <>
                  <span className="text-ink-3" aria-hidden="true">·</span>
                  <span>{fmtTime(entry.slotStartsAt, true)}</span>
                </>
              )}
              {entry.sponsorTier && (
                <span className={`badge text-caption ${TIER_COLORS[entry.sponsorTier] ?? 'badge-neutral'}`}>
                  {entry.sponsorTier}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`badge text-caption ${meta.badge}`}>{meta.label}</span>
            <time className="text-caption text-ink-3 tabular-nums" dateTime={entry.timestamp}>
              {fmtTime(entry.timestamp, true)}
            </time>
          </div>
        </div>

        {/* The note itself — set apart as a quoted block */}
        <div className="mt-2.5 rounded-xl bg-fill-2/50 border border-hairline/60 px-3.5 py-2.5">
          <p className={`text-subhead text-ink whitespace-pre-wrap break-words ${expanded ? '' : clampable ? 'line-clamp-4' : ''}`}>
            {entry.text}
          </p>
          {entry.detail && (
            <p className="mt-2 pt-2 border-t border-hairline/60 text-footnote text-ink-2 whitespace-pre-wrap break-words">
              <span className="font-medium text-ink-2">Note:</span> {entry.detail}
            </p>
          )}
          {clampable && (
            <button
              type="button"
              onClick={() => onToggle(entry.id)}
              className="mt-1.5 text-footnote font-medium text-primary hover:underline"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Sponsor attribution, when the note belongs to a company */}
        {entry.sponsorName && (
          <div className="flex items-center gap-1.5 mt-2 text-caption text-ink-3">
            {entry.sponsorLogo ? (
              <Image src={entry.sponsorLogo} alt="" width={16} height={16} className="w-4 h-4 rounded object-contain" />
            ) : (
              <IconBuilding />
            )}
            <span className="truncate">{entry.sponsorName}</span>
          </div>
        )}
      </div>
    </article>
  )
})

function EmptyState({ searching }: { searching: boolean }) {
  return (
    <div className="empty-state">
      <div className="w-14 h-14 rounded-2xl bg-fill-2 text-ink-3 flex items-center justify-center mx-auto mb-3">
        <IconNote />
      </div>
      <p className="text-headline text-ink">{searching ? 'No matching notes' : 'No notes yet'}</p>
      <p className="text-subhead text-ink-2 mt-1">
        {searching
          ? 'Try a different search term or filter.'
          : 'Notes and comments from meetings, check-in and requests will appear here.'}
      </p>
    </div>
  )
}

function LogSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="h-6 w-40 skeleton rounded-lg mb-4" />
      <div className="flex gap-3 mb-5">
        <div className="h-11 flex-1 skeleton rounded-xl" />
        <div className="h-11 w-72 skeleton rounded-xl" />
      </div>
      <div className="space-y-2.5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card p-4 flex gap-3.5">
            <div className="w-10 h-10 rounded-xl skeleton shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 skeleton rounded" />
              <div className="h-12 w-full skeleton rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Icons (inherit currentColor; sized for the 40px symbol tile) ─────────────
const iconProps = {
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

function IconNote() {
  return (
    <svg {...iconProps}>
      <path d="M15.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" />
      <path d="M15 3v5h5M8 13h8M8 17h5" />
    </svg>
  )
}
function IconPin() {
  return (
    <svg {...iconProps}>
      <path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="2.6" />
    </svg>
  )
}
function IconCancel() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 8l8 8" />
    </svg>
  )
}
function IconRequest() {
  return (
    <svg {...iconProps}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20.5l1.5-5.1A8.4 8.4 0 0 1 3.6 11 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
    </svg>
  )
}
function IconSearch() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}
function IconBuilding() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 21V9h3a1 1 0 0 1 1 1v11" />
      <path d="M8 8h.01M8 12h.01M11 8h.01M11 12h.01" />
    </svg>
  )
}
