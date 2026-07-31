#!/usr/bin/env node
// Unit tests for the Check-In dashboard derivation helpers
// (apps/web/lib/checkin-dashboard.ts — pure functions, no DB). Pure Node —
// imports the real module directly (Node strips the TS types), same pattern
// as test-overview-health-bars.mjs.
//
//   node scripts/test-checkin-dashboard.mjs   (alias: pnpm test:checkin-dashboard)

import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MOD = join(ROOT, 'apps/web/lib/checkin-dashboard.ts')

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const d = await import(pathToFileURL(MOD).href)

// ── Fixtures ──────────────────────────────────────────────────────────────────
const T0 = Date.parse('2027-03-01T17:00:00.000Z') // slot A start
const HOUR = 3_600_000
const iso = ms => new Date(ms).toISOString()

const mtg = (id, { sponsor = null, buyer = null, room = null, name = `Sponsor ${id}` } = {}) => ({
  sponsorMeetingId: id,
  sponsorId: `sp-${id}`,
  sponsorName: name,
  sponsorLogo: null,
  sponsorTier: 'GOLD',
  attendeeName: `Attendee ${id}`,
  attendeeCompany: null,
  room,
  sponsorArrivedAt: sponsor,
  buyerArrivedAt: buyer,
  notes: null,
})

const NOW = iso(T0)
// Slot A (T0→T0+1h): m1 completed, m2 sponsor-only, m3 awaiting. Rooms: 101, 101, null.
const slotA = {
  timeBlockId: 'blk-a', startsAt: iso(T0), endsAt: iso(T0 + HOUR),
  meetings: [
    mtg('m1', { sponsor: NOW, buyer: NOW, room: 'Room 101' }),
    mtg('m2', { sponsor: NOW, room: 'Room 101' }),
    mtg('m3', {}),
  ],
  completed: 1,
}
// Slot B (T0+2h→T0+3h): m4 buyer-only, m5 completed. Rooms: 201, 202.
const slotB = {
  timeBlockId: 'blk-b', startsAt: iso(T0 + 2 * HOUR), endsAt: iso(T0 + 3 * HOUR),
  meetings: [
    mtg('m4', { buyer: NOW, room: 'Room 201' }),
    mtg('m5', { sponsor: NOW, buyer: NOW, room: 'Room 202' }),
  ],
  completed: 1,
}
// Two under-booked sponsors: Acme needs 3 more with 2 open blocks, Globex needs
// 1 more with 1 open block. openSlotSummary sums across them.
const openA = { timeBlockId: 'blk-a', startsAt: iso(T0), endsAt: iso(T0 + HOUR) }
const openB = { timeBlockId: 'blk-b', startsAt: iso(T0 + 2 * HOUR), endsAt: iso(T0 + 3 * HOUR) }
const day = {
  dayKey: '2027-03-01', label: 'Mar 1', slots: [slotA, slotB],
  totals: { meetings: 5, completed: 2, sponsorArrived: 3, buyerArrived: 3, awaiting: 1 },
  openSlots: [
    { sponsorId: 'sp-acme', sponsorName: 'Acme', sponsorLogo: null, sponsorTier: 'GOLD',
      confirmed: 5, requiredMeetings: 8, needed: 3, openSlots: [openA, openB] },
    { sponsorId: 'sp-globex', sponsorName: 'Globex', sponsorLogo: null, sponsorTier: 'SILVER',
      confirmed: 7, requiredMeetings: 8, needed: 1, openSlots: [openB] },
  ],
}

// ── slotPhase ─────────────────────────────────────────────────────────────────
console.log('slotPhase')
check('before start → upcoming', d.slotPhase(slotA, T0 - 1) === 'upcoming')
check('at start (inclusive) → live', d.slotPhase(slotA, T0) === 'live')
check('mid-slot → live', d.slotPhase(slotA, T0 + HOUR / 2) === 'live')
check('at end (exclusive) → past', d.slotPhase(slotA, T0 + HOUR) === 'past')

// ── slotStats ─────────────────────────────────────────────────────────────────
console.log('slotStats')
const stats = d.slotStats(day, T0 + HOUR / 2) // slot A live, slot B upcoming
const [sA, sB] = stats
check('two slot stats, chronological', stats.length === 2 && sA.timeBlockId === 'blk-a' && sB.timeBlockId === 'blk-b')
check('slot A tallies (3 mtgs, 1 completed, 2 sponsor, 1 buyer, 1 awaiting)',
  sA.meetings === 3 && sA.completed === 1 && sA.sponsorArrived === 2 && sA.buyerArrived === 1 && sA.awaiting === 1,
  JSON.stringify(sA))
check('slot A distinct rooms = 1 (dupes + null dropped)', sA.rooms === 1, `got ${sA.rooms}`)
check('slot B tallies (2 mtgs, 1 completed, 1 sponsor, 2 buyer, 0 awaiting)',
  sB.meetings === 2 && sB.completed === 1 && sB.sponsorArrived === 1 && sB.buyerArrived === 2 && sB.awaiting === 0,
  JSON.stringify(sB))
check('slot B rooms = 2', sB.rooms === 2, `got ${sB.rooms}`)
check('phases: A live, B upcoming', sA.phase === 'live' && sB.phase === 'upcoming')

// ── pickHighlightSlot ─────────────────────────────────────────────────────────
console.log('pickHighlightSlot')
check('live slot wins', d.pickHighlightSlot(stats) === 'blk-a')
const betweenSlots = d.slotStats(day, T0 + HOUR + 1) // A past, B upcoming
check('between slots → next upcoming', d.pickHighlightSlot(betweenSlots) === 'blk-b')
const allPast = d.slotStats(day, T0 + 10 * HOUR)
check('day over → busiest completed slot (first on tie)', d.pickHighlightSlot(allPast) === 'blk-a')
check('empty stats → null', d.pickHighlightSlot([]) === null)

// ── completionRate ────────────────────────────────────────────────────────────
console.log('completionRate')
check('2 of 5 → 40', d.completionRate({ completed: 2, meetings: 5 }) === 40)
check('rounds (1 of 3 → 33)', d.completionRate({ completed: 1, meetings: 3 }) === 33)
check('zero meetings → 0 (no NaN)', d.completionRate({ completed: 0, meetings: 0 }) === 0)
check('all done → 100', d.completionRate({ completed: 7, meetings: 7 }) === 100)

// ── needsAttention ────────────────────────────────────────────────────────────
console.log('needsAttention')
const attention = d.needsAttention(day)
check('only half-arrived meetings (m2, m4)', attention.length === 2 &&
  attention[0].meeting.sponsorMeetingId === 'm2' && attention[1].meeting.sponsorMeetingId === 'm4',
  JSON.stringify(attention.map(a => a.meeting.sponsorMeetingId)))
check('m2 waits on buyer', attention[0].missing === 'buyer')
check('m4 waits on sponsor', attention[1].missing === 'sponsor')
check('items carry their slot times', attention[0].startsAt === slotA.startsAt && attention[1].startsAt === slotB.startsAt)

// ── filledTicks ───────────────────────────────────────────────────────────────
console.log('filledTicks')
check('zero value → 0 ticks', d.filledTicks(0, 10, 14) === 0)
check('zero total → 0 ticks (no NaN)', d.filledTicks(3, 0, 14) === 0)
check('full → all ticks', d.filledTicks(10, 10, 14) === 14)
check('over-full clamps to all ticks', d.filledTicks(12, 10, 14) === 14)
check('tiny nonzero lights ≥1 tick', d.filledTicks(1, 1000, 14) === 1)
check('near-full stays <all ticks', d.filledTicks(999, 1000, 14) === 13)
check('half → about half', d.filledTicks(5, 10, 14) === 7)

// ── openSlotSummary ─────────────────────────────────────────────────────────
console.log('openSlotSummary')
const openSummary = d.openSlotSummary(day)
check('2 sponsors short', openSummary.sponsors === 2, JSON.stringify(openSummary))
check('3 open slots total (2 + 1)', openSummary.slots === 3, JSON.stringify(openSummary))
check('4 meetings needed total (3 + 1)', openSummary.needed === 4, JSON.stringify(openSummary))
const emptyDay = { ...day, openSlots: [] }
check('no open slots → all zero', (() => { const s = d.openSlotSummary(emptyDay); return s.sponsors === 0 && s.slots === 0 && s.needed === 0 })())

// ── compactSlotLabel ──────────────────────────────────────────────────────────
console.log('compactSlotLabel')
const TZ = 'America/Los_Angeles'
check('on the hour drops :00 (17:00Z → 9 AM PT)', d.compactSlotLabel('2027-03-01T17:00:00.000Z', TZ) === '9 AM',
  `got "${d.compactSlotLabel('2027-03-01T17:00:00.000Z', TZ)}"`)
check('half hour keeps minutes (18:30Z → 10:30 AM PT)', d.compactSlotLabel('2027-03-01T18:30:00.000Z', TZ) === '10:30 AM',
  `got "${d.compactSlotLabel('2027-03-01T18:30:00.000Z', TZ)}"`)
check('afternoon (21:00Z → 1 PM PT)', d.compactSlotLabel('2027-03-01T21:00:00.000Z', TZ) === '1 PM',
  `got "${d.compactSlotLabel('2027-03-01T21:00:00.000Z', TZ)}"`)

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1) }
console.log('\nAll checks passed')
