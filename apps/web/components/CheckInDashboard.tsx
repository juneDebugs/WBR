'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import type { CheckInBoard as CheckInBoardData, CheckInDay, OpenSlotSponsor } from '@conference/db'
import { fmtSlotRange, fmtSlotTime, TZ } from '@/lib/format'
import { meterClass, TIER_COLORS, TIER_FALLBACK } from '@/lib/meetings-ui'
import {
  compactSlotLabel, completionRate, filledTicks, needsAttention, pickHighlightSlot, slotStats,
  openSlotSummary, type AttentionItem, type SlotStat,
} from '@/lib/checkin-dashboard'

type PatchPayload = { sponsorArrived?: boolean; buyerArrived?: boolean; notes?: string | null }
type OnCheckIn = (sponsorMeetingId: string, patch: PatchPayload) => Promise<unknown>

function initial(name: string | null | undefined) {
  return (name?.trim()[0] ?? '?').toUpperCase()
}

// Re-evaluate slot phases ("Live now", next-up highlight) once a minute so the
// dashboard tracks the wall clock between the 30s board polls.
function useNowMs() {
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  return nowMs
}

// Floor-overview dashboard above the check-in table: tracker chart per time
// slot, the day's slot list, half-arrived chase list, conference totals, and
// arrival progress strips. Everything derives from the same board payload the
// table renders, so the two can never disagree.
export function CheckInDashboard({ board, day, onCheckIn }: {
  board: CheckInBoardData
  day: CheckInDay
  onCheckIn: OnCheckIn
}) {
  const nowMs = useNowMs()
  const stats = useMemo(() => slotStats(day, nowMs), [day, nowMs])
  const highlightId = pickHighlightSlot(stats)
  const attention = useMemo(() => needsAttention(day), [day])

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="flex flex-col gap-4 xl:col-span-2">
        <TrackerCard day={day} stats={stats} highlightId={highlightId} />
        <div className="grid flex-1 gap-4 md:grid-cols-2">
          <NeedsAttentionCard items={attention} onCheckIn={onCheckIn} />
          <ConferencePulseCard totals={board.totals} days={board.days.length} />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <OpenSlotsCard day={day} />
        <ArrivalProgressCard day={day} />
      </div>
      <DaySummaryBar day={day} boardTotals={board.totals} />
    </div>
  )
}

// ── Day summary bar ─────────────────────────────────────────────────────────
// The attendance reconciliation strip (formerly the table's sticky footer,
// docked here 2026-07-30): the day's meetings-happened headline + meter and
// the all-days rollup, bridging the dashboard into the Floor Board below it.
function DaySummaryBar({ day, boardTotals }: { day: CheckInDay; boardTotals: CheckInBoardData['totals'] }) {
  const t = day.totals
  return (
    <section className="material-bar rounded-xl border border-hairline px-4 py-3 shadow-card xl:col-span-3" aria-label="Day summary">
      <div className="flex flex-wrap items-center gap-4">
        <span className="whitespace-nowrap text-sm font-semibold text-ink">
          {day.label}: <span className="tabular-nums">{t.completed}/{t.meetings}</span> meetings happened
        </span>
        <div className="meter w-40 flex-shrink-0">
          <div
            className={`meter-fill ${meterClass(t.meetings > 0 ? t.completed / t.meetings : 0)}`}
            style={{ width: `${t.meetings > 0 ? (t.completed / t.meetings) * 100 : 0}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-sm text-ink-2 tabular-nums">Sponsor arrived {t.sponsorArrived}</span>
        <span className="whitespace-nowrap text-sm text-ink-2 tabular-nums">Buyer arrived {t.buyerArrived}</span>
        <span className="whitespace-nowrap text-sm text-ink-2 tabular-nums">Awaiting {t.awaiting}</span>
      </div>
      <p className="mt-1 text-caption text-ink-3 tabular-nums">
        All days: {boardTotals.completed} of {boardTotals.meetings} completed · {boardTotals.sponsorArrived} sponsor arrivals ·{' '}
        {boardTotals.buyerArrived} buyer arrivals · {boardTotals.awaiting} awaiting
      </p>
    </section>
  )
}

// ── Check-In Tracker ────────────────────────────────────────────────────────
// Lollipop chart: per slot, a light brand-100 track for how many meetings are
// scheduled and a brand stem + dot for how many are fully checked in. The
// highlighted slot (live → next up → busiest) carries the one direct label;
// every column has a hover/focus tooltip and the table below is the text twin.
function TrackerCard({ day, stats, highlightId }: {
  day: CheckInDay
  stats: SlotStat[]
  highlightId: string | null
}) {
  const maxMeetings = Math.max(1, ...stats.map(s => s.meetings))
  const rate = completionRate(day.totals)

  return (
    <section className="card p-5" aria-label="Check-in tracker">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">Check-In Tracker</h3>
          <p className="mt-0.5 text-sm text-ink-2">Arrivals across each time slot — how many meetings actually happen</p>
        </div>
        <div className="flex items-center gap-4 pt-1" aria-hidden>
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" /> Checked in
          </span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-100" /> Scheduled
          </span>
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto">
        {stats.map((s, i) => {
          const isHl = s.timeBlockId === highlightId
          const trackPct = (s.meetings / maxMeetings) * 100
          const fillPct = (s.completed / maxMeetings) * 100
          // The chart strip is an overflow-x scroller, which also clips
          // vertically — so the tooltip floats INSIDE the plot area, and the
          // edge columns pin it to their own edge instead of centering it.
          const tipAlign = i === 0 ? 'left-0' : i === stats.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
          return (
            <div key={s.timeBlockId} className="group relative flex min-w-[48px] flex-1 flex-col items-center">
              <button
                type="button"
                aria-label={`${fmtSlotRange(s.startsAt, s.endsAt)}: ${s.completed} of ${s.meetings} checked in — ${s.sponsorArrived} sponsors arrived, ${s.buyerArrived} buyers arrived, ${s.awaiting} awaiting`}
                className={`relative w-full cursor-default rounded-xl px-1 pb-2 pt-7 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${isHl ? 'bg-fill/80' : 'hover:bg-fill/50'}`}
              >
                {isHl && (
                  <span className="absolute left-1/2 top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-xs font-semibold text-white">
                    {s.completed}/{s.meetings}
                  </span>
                )}
                <span aria-hidden className="relative block h-28 w-full">
                  <span
                    className="absolute bottom-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-brand-100"
                    style={{ height: `${trackPct}%` }}
                  />
                  <span
                    className="absolute bottom-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-brand"
                    style={{ height: `${fillPct}%` }}
                  />
                  <span
                    className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-brand ring-2 ring-white"
                    style={{ bottom: s.completed === 0 ? '0px' : `calc(${fillPct}% - 5px)` }}
                  />
                </span>
              </button>
              <span className={`mt-1.5 flex h-7 items-center justify-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${isHl ? 'bg-ink text-white' : 'bg-fill text-ink-2'}`}>
                {compactSlotLabel(s.startsAt, TZ)}
              </span>

              {/* Hover/focus tooltip — same values as the aria-label and the table below */}
              <div className={`pointer-events-none absolute top-9 z-20 hidden flex-col whitespace-nowrap rounded-xl bg-ink px-3 py-2 shadow-pop group-focus-within:flex group-hover:flex ${tipAlign}`}>
                <span className="text-xs font-semibold text-white tabular-nums">{s.completed} of {s.meetings} checked in</span>
                <span className="text-[11px] text-white/70 tabular-nums">{fmtSlotRange(s.startsAt, s.endsAt)}</span>
                <span className="text-[11px] text-white/70 tabular-nums">Sponsors {s.sponsorArrived} · Buyers {s.buyerArrived} · Awaiting {s.awaiting}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5">
        <p className="text-5xl font-bold leading-none text-ink">{rate}%</p>
        <p className="mt-2 max-w-[28rem] text-sm text-ink-2">
          of {day.label} meetings are fully checked in ({day.totals.completed} of {day.totals.meetings})
        </p>
      </div>
    </section>
  )
}

// ── Time Slots (open slots per sponsor) ─────────────────────────────────────
// Not the day's clock anymore — the day's *gaps*. Each row is a sponsor that
// still needs meetings (confirmed < required), and expands to the exact empty
// blocks it can be booked into. Text twin of the "Open Meeting Slots" table
// below the floor board (both read day.openSlots); "See table" jumps there.
function OpenSlotsCard({ day }: { day: CheckInDay }) {
  const rows = day.openSlots
  const [openId, setOpenId] = useState<string | null>(rows[0]?.sponsorId ?? null)
  const summary = openSlotSummary(day)

  return (
    <section className="card flex-1 p-5" aria-label="Open time slots">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-ink">Open Time Slots</h3>
          <p className="mt-0.5 text-caption text-ink-3 tabular-nums">
            {summary.slots} open slot{summary.slots === 1 ? '' : 's'} · {summary.sponsors} sponsor{summary.sponsors === 1 ? '' : 's'} short
          </p>
        </div>
        <a href="#open-slots" className="flex-shrink-0 text-sm font-medium text-brand hover:underline">See table</a>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-ink">No open slots</p>
          <p className="mt-1 text-xs text-ink-2">Every sponsor has enough meetings booked for {day.label}.</p>
        </div>
      ) : (
        /* Capped so a many-sponsor day scrolls here instead of stretching the whole dashboard */
        <ul className="mt-1 max-h-[24rem] divide-y divide-hairline overflow-y-auto overscroll-contain">
          {rows.map(sp => {
            const open = openId === sp.sponsorId
            return (
              <li key={sp.sponsorId}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(cur => (cur === sp.sponsorId ? null : sp.sponsorId))}
                  className="flex min-h-[52px] w-full items-center gap-3 py-2.5 text-left"
                >
                  <SponsorAvatar name={sp.sponsorName} logo={sp.sponsorLogo} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{sp.sponsorName}</span>
                      <span className={`badge ${TIER_COLORS[sp.sponsorTier] ?? TIER_FALLBACK}`}>{sp.sponsorTier}</span>
                    </span>
                    <span className="mt-0.5 block text-caption text-ink-3 tabular-nums">
                      {sp.confirmed}/{sp.requiredMeetings} booked · needs {sp.needed} more
                    </span>
                  </span>
                  <span className="badge badge-warning flex-shrink-0 tabular-nums">{sp.openSlots.length} open</span>
                  <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-fill text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2.5 4.5 6 8l3.5-3.5" />
                    </svg>
                  </span>
                </button>
                {open && (
                  <div className="pb-3 pl-[52px]">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="meter flex-1">
                        <div
                          className={`meter-fill ${meterClass(sp.requiredMeetings > 0 ? sp.confirmed / sp.requiredMeetings : 1)}`}
                          style={{ width: `${sp.requiredMeetings > 0 ? Math.min(100, (sp.confirmed / sp.requiredMeetings) * 100) : 100}%` }}
                        />
                      </div>
                      <span className="text-caption text-ink-3 tabular-nums">{sp.confirmed}/{sp.requiredMeetings}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {sp.openSlots.map(slot => (
                        <span key={slot.timeBlockId} className="badge badge-neutral tabular-nums">
                          {fmtSlotRange(slot.startsAt, slot.endsAt)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function SponsorAvatar({ name, logo }: { name: string; logo: string | null }) {
  if (logo) {
    return (
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-hairline bg-white p-0.5">
        <Image src={logo} alt="" width={40} height={40} className="h-full w-full object-contain" />
      </div>
    )
  }
  return (
    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand">
      {initial(name)}
    </div>
  )
}

// ── Needs Attention (half-arrived chase list) ───────────────────────────────
const ATTENTION_PREVIEW = 4

function NeedsAttentionCard({ items, onCheckIn }: { items: AttentionItem[]; onCheckIn: OnCheckIn }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? items : items.slice(0, ATTENTION_PREVIEW)

  return (
    <section className="card p-5" aria-label="Needs attention">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
          Needs Attention
          {items.length > 0 && <span className="badge badge-warning tabular-nums">{items.length}</span>}
        </h3>
        {items.length > ATTENTION_PREVIEW && (
          <button type="button" onClick={() => setShowAll(v => !v)} className="text-sm font-medium text-brand hover:underline">
            {showAll ? 'Show fewer' : `See all ${items.length}`}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-ink">All caught up</p>
          <p className="mt-1 text-xs text-ink-2">No meetings are waiting on one side to arrive.</p>
        </div>
      ) : (
        <ul className="mt-1 divide-y divide-hairline">
          {visible.map(({ meeting: m, missing, startsAt }) => (
            <li key={m.sponsorMeetingId} className="flex items-center gap-3 py-2.5">
              {m.sponsorLogo ? (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-white p-0.5">
                  <Image src={m.sponsorLogo} alt="" width={40} height={40} className="h-full w-full object-contain" />
                </div>
              ) : (
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-fill text-sm font-bold text-ink-2">
                  {initial(m.sponsorName)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{m.sponsorName}</p>
                  <span className="badge badge-warning whitespace-nowrap">Awaiting {missing}</span>
                </div>
                <p className="truncate text-xs text-ink-2">{m.attendeeName} · {fmtSlotTime(startsAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => void onCheckIn(m.sponsorMeetingId, missing === 'sponsor' ? { sponsorArrived: true } : { buyerArrived: true }).catch(() => {})}
                aria-label={`Mark ${missing} arrived — ${m.sponsorName} meeting with ${m.attendeeName}`}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-hairline text-ink-2 transition-colors hover:bg-success-soft hover:text-success-ink"
              >
                {'✓'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Conference at a glance (all-days totals) ────────────────────────────────
function ConferencePulseCard({ totals, days }: { totals: CheckInBoardData['totals']; days: number }) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-brand-50 p-5 text-ink shadow-card" aria-label="Conference at a glance">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: 'radial-gradient(rgba(99,102,241,0.25) 1.25px, transparent 1.75px)',
          backgroundSize: '12px 12px',
          maskImage: 'linear-gradient(115deg, transparent 32%, black)',
          WebkitMaskImage: 'linear-gradient(115deg, transparent 32%, black)',
        }}
      />
      <div className="relative flex h-full flex-col">
        <h3 className="text-lg font-semibold">Conference at a glance</h3>
        <p className="mt-1 flex-1 text-sm text-ink-2">
          <span className="font-semibold text-ink tabular-nums">{totals.completed} of {totals.meetings}</span>{' '}
          meetings completed across {days} day{days === 1 ? '' : 's'} — {totals.sponsorArrived} sponsor and{' '}
          {totals.buyerArrived} buyer arrivals logged, {totals.awaiting} still awaiting.
        </p>
        <a
          href="#floor-board"
          className="mt-4 flex min-h-[44px] items-center justify-between rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.97]"
        >
          Jump to the floor board <span aria-hidden>{'→'}</span>
        </a>
      </div>
    </section>
  )
}

// ── Arrival Progress (tick strips) ──────────────────────────────────────────
// Three labeled measures of the selected day. Each strip fills value/meetings;
// identity comes from the label above each strip, never color alone.
const TICKS = 14

function ArrivalProgressCard({ day }: { day: CheckInDay }) {
  const t = day.totals
  const metrics = [
    { key: 'sponsors', label: 'Sponsors arrived', value: t.sponsorArrived, color: 'bg-brand-400' },
    { key: 'buyers', label: 'Buyers arrived', value: t.buyerArrived, color: 'bg-brand-600' },
    { key: 'completed', label: 'Completed', value: t.completed, color: 'bg-success' },
  ]
  return (
    <section className="card p-5" aria-label="Arrival progress">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-ink">Arrival Progress</h3>
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-fill px-3 py-1.5 text-xs font-medium text-ink-2">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden>
            <rect x="1.5" y="2.5" width="9" height="8" rx="1.5" />
            <path d="M1.5 5h9M4 1.25v2M8 1.25v2" />
          </svg>
          {day.label}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-hairline">
        {metrics.map(m => {
          const filled = filledTicks(m.value, t.meetings, TICKS)
          return (
            <div key={m.key} className="px-3 first:pl-0 last:pr-0">
              <p className="text-xs text-ink-2 sm:text-sm">{m.label}</p>
              <p className="mt-1 text-3xl font-bold text-ink">{m.value}</p>
              <div className="mt-3 flex h-7 items-stretch gap-[3px]" aria-hidden>
                {Array.from({ length: TICKS }, (_, i) => (
                  <span key={i} className={`max-w-[4px] flex-1 rounded-full ${i < filled ? m.color : 'bg-fill-2'}`} />
                ))}
              </div>
              <p className="mt-1.5 text-caption text-ink-3 tabular-nums">of {t.meetings}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
