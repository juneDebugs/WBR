// Pure derivation helpers for the Check-In dashboard widgets. No React and no
// runtime imports (types only), so scripts/test-checkin-dashboard.mjs can
// import this file directly under Node's TS type-stripping — same pattern as
// lib/health-color.ts.
import type { CheckInDay, CheckInMeeting } from '@conference/db'

// Where a slot sits relative to the wall clock. Completion is tracked
// separately — a slot can be 'past' with meetings still un-checked-in.
export type SlotPhase = 'upcoming' | 'live' | 'past'

export interface SlotStat {
  timeBlockId: string
  startsAt: string
  endsAt: string
  phase: SlotPhase
  meetings: number
  completed: number
  sponsorArrived: number
  buyerArrived: number
  awaiting: number
  rooms: number // distinct assigned rooms in the slot
}

export function slotPhase(slot: { startsAt: string; endsAt: string }, nowMs: number): SlotPhase {
  if (nowMs < Date.parse(slot.startsAt)) return 'upcoming'
  if (nowMs < Date.parse(slot.endsAt)) return 'live'
  return 'past'
}

export function slotStats(day: CheckInDay, nowMs: number): SlotStat[] {
  return day.slots.map(slot => {
    const stat: SlotStat = {
      timeBlockId: slot.timeBlockId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      phase: slotPhase(slot, nowMs),
      meetings: slot.meetings.length,
      completed: 0,
      sponsorArrived: 0,
      buyerArrived: 0,
      awaiting: 0,
      rooms: new Set(slot.meetings.map(m => m.room).filter(Boolean)).size,
    }
    for (const m of slot.meetings) {
      if (m.sponsorArrivedAt) stat.sponsorArrived++
      if (m.buyerArrivedAt) stat.buyerArrived++
      if (m.sponsorArrivedAt && m.buyerArrivedAt) stat.completed++
      else if (!m.sponsorArrivedAt && !m.buyerArrivedAt) stat.awaiting++
    }
    return stat
  })
}

// Header tallies for the open-slots widget: how many under-booked sponsors the
// day has and how many bookable gaps they add up to. Pure over day.openSlots
// (built server-side), so the widget and the "Open Meeting Slots" table below
// can never disagree.
export function openSlotSummary(day: CheckInDay): { sponsors: number; slots: number; needed: number } {
  let slots = 0
  let needed = 0
  for (const sp of day.openSlots) {
    slots += sp.openSlots.length
    needed += sp.needed
  }
  return { sponsors: day.openSlots.length, slots, needed }
}

// The slot the tracker chart spotlights: the one happening now, else the next
// one up, else (day fully over) the busiest slot by completed check-ins.
export function pickHighlightSlot(stats: SlotStat[]): string | null {
  if (stats.length === 0) return null
  const live = stats.find(s => s.phase === 'live')
  if (live) return live.timeBlockId
  const upcoming = stats.find(s => s.phase === 'upcoming') // stats are chronological
  if (upcoming) return upcoming.timeBlockId
  return stats.reduce((best, s) => (s.completed > best.completed ? s : best)).timeBlockId
}

export function completionRate(totals: { completed: number; meetings: number }): number {
  if (totals.meetings <= 0) return 0
  return Math.round((totals.completed / totals.meetings) * 100)
}

// Meetings where exactly one side has arrived — the floor team's chase list.
export interface AttentionItem {
  meeting: CheckInMeeting
  missing: 'sponsor' | 'buyer'
  startsAt: string
  endsAt: string
}

export function needsAttention(day: CheckInDay): AttentionItem[] {
  const items: AttentionItem[] = []
  for (const slot of day.slots) {
    for (const m of slot.meetings) {
      const hasSponsor = !!m.sponsorArrivedAt
      const hasBuyer = !!m.buyerArrivedAt
      if (hasSponsor === hasBuyer) continue // awaiting both, or complete
      items.push({ meeting: m, missing: hasSponsor ? 'buyer' : 'sponsor', startsAt: slot.startsAt, endsAt: slot.endsAt })
    }
  }
  return items // slots are chronological, meetings alphabetical within a slot
}

// How many ticks of a `ticks`-wide strip to fill for value/total. Any nonzero
// value lights at least one tick; only value === total lights them all.
export function filledTicks(value: number, total: number, ticks: number): number {
  if (total <= 0 || value <= 0 || ticks <= 0) return 0
  if (value >= total) return ticks
  return Math.min(ticks - 1, Math.max(1, Math.round((value / total) * ticks)))
}

// Compact x-axis label for a slot start: "9 AM", "10:30 AM", "1 PM".
// Drops ":00" so a dense slot row stays readable.
export function compactSlotLabel(iso: string, tz: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz })
    .replace(':00', '')
}
