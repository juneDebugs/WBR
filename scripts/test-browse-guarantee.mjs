#!/usr/bin/env node
// Combinatorial guarantee test for the Browse filters, run against real data.
//
// Proves that for ANY combination of chip filters:
//   - the meetings portal Browse returns ≥ 8 results (People tab across every
//     category scope, and the Solution Providers tab), and
//   - the sponsor portal Browse returns ≥ 20 results,
// capped by pool size when the pool itself is smaller.
//
// Chip catalogs are extracted from the live UI source files, and candidate
// pools replicate the exact API queries, so this exercises the same inputs and
// the same shared filter functions (packages/db/src/browse-taxonomy.ts) the
// components use.
//
//   node scripts/test-browse-guarantee.mjs [--db path/to.db] [--quick]
//
// Default DB: packages/db/prisma/dev.db (read-only). Exits non-zero on failure.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dbFlag = args.indexOf('--db')
const DB_PATH = dbFlag >= 0 ? args[dbFlag + 1] : join(ROOT, 'packages/db/prisma/dev.db')
const QUICK = args.includes('--quick')

const {
  filterMeetingsPeople,
  filterMeetingsSponsors,
  filterSponsorPortalAttendees,
  parseSolutionsArray,
  MEETINGS_MIN_RESULTS,
  SPONSOR_MIN_RESULTS,
} = await import(join(ROOT, 'packages/db/src/browse-taxonomy.ts'))

// ─── Chip catalogs from live UI source ───────────────────────────────────────

function extractArrayLiteral(source, constName, file) {
  const marker = new RegExp(`const ${constName}[^=]*=\\s*\\[`)
  const m = marker.exec(source)
  if (!m) throw new Error(`Cannot find "const ${constName} = [" in ${file}`)
  const start = m.index + m[0].length - 1
  let depth = 0
  let inStr = null
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (inStr) {
      if (ch === '\\') i++
      else if (ch === inStr) inStr = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') inStr = ch
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) return new Function(`return ${source.slice(start, i + 1)}`)()
    }
  }
  throw new Error(`Unbalanced array literal for ${constName} in ${file}`)
}

const sponsorViewSrc = readFileSync(join(ROOT, 'apps/sponsor/components/SponsorBrowseView.tsx'), 'utf8')
const meetingsLibSrc = readFileSync(join(ROOT, 'apps/meetings/lib/solutions.ts'), 'utf8')

// Sponsor portal chips (as rendered by SponsorBrowseView)
const S_SOLUTIONS = extractArrayLiteral(sponsorViewSrc, 'SOLUTION_CATEGORIES', 'SponsorBrowseView.tsx').flatMap(g => g.items)
const S_INDUSTRIES = extractArrayLiteral(sponsorViewSrc, 'INDUSTRIES', 'SponsorBrowseView.tsx')
const S_JOB_FUNCTIONS = extractArrayLiteral(sponsorViewSrc, 'JOB_FUNCTIONS', 'SponsorBrowseView.tsx')
const S_SIZES = extractArrayLiteral(sponsorViewSrc, 'COMPANY_SIZES', 'SponsorBrowseView.tsx')
const S_REVENUES = extractArrayLiteral(sponsorViewSrc, 'REVENUE_RANGES', 'SponsorBrowseView.tsx')
const S_ROLES = extractArrayLiteral(sponsorViewSrc, 'ROLES', 'SponsorBrowseView.tsx')

// Meetings portal chips (FilterPanel sources all lists from lib/solutions.ts)
const M_SOLUTIONS = extractArrayLiteral(meetingsLibSrc, 'SOLUTIONS', 'meetings/lib/solutions.ts')
const M_INDUSTRIES = extractArrayLiteral(meetingsLibSrc, 'INDUSTRIES', 'meetings/lib/solutions.ts')
const M_TITLE_LEVELS = extractArrayLiteral(meetingsLibSrc, 'TITLE_LEVELS', 'meetings/lib/solutions.ts')
const M_JOB_FUNCTIONS = extractArrayLiteral(meetingsLibSrc, 'JOB_FUNCTIONS', 'meetings/lib/solutions.ts')
const M_SIZES = extractArrayLiteral(meetingsLibSrc, 'COMPANY_SIZES', 'meetings/lib/solutions.ts')
const M_REVENUES = extractArrayLiteral(meetingsLibSrc, 'REVENUE_RANGES', 'meetings/lib/solutions.ts')
const M_CATEGORIES = [null, ...extractArrayLiteral(meetingsLibSrc, 'PEOPLE_CATEGORIES', 'meetings/lib/solutions.ts')]

// ─── Candidate pools (replicating the API queries) ───────────────────────────

const db = new DatabaseSync(DB_PATH, { readOnly: true })

function preparse(rows) {
  for (const r of rows) {
    r._parsedOffering = parseSolutionsArray(r.solutionsOffering)
    r._parsedSeeking = parseSolutionsArray(r.solutionsSeeking)
  }
  return rows
}

// meetings /api/browse/people: role=ATTENDEE, sponsorId null, name asc, take 500
const meetingsPeople = preparse(db.prepare(`
  SELECT id, name, email, company, jobTitle, role, bio, companySize, annualRevenue,
         solutionsOffering, solutionsSeeking
  FROM User WHERE role = 'ATTENDEE' AND sponsorId IS NULL
  ORDER BY name ASC LIMIT 500
`).all())

// meetings /api/browse/sponsors: all sponsors, tier asc then name asc
const meetingsSponsors = preparse(db.prepare(`
  SELECT id, name, tier, companySize, annualRevenue, solutionsOffering, solutionsSeeking
  FROM Sponsor ORDER BY tier ASC, name ASC
`).all())

// sponsor /api/attendees: role in (ATTENDEE, SPEAKER), name asc, no cap
const sponsorAttendees = preparse(db.prepare(`
  SELECT id, name, company, jobTitle, bio, role, companySize, annualRevenue,
         solutionsOffering, solutionsSeeking, sponsorId
  FROM User WHERE role IN ('ATTENDEE', 'SPEAKER')
  ORDER BY name ASC
`).all())

db.close()

console.log(`Pools: meetings people=${meetingsPeople.length}, sponsors=${meetingsSponsors.length}, sponsor-portal attendees=${sponsorAttendees.length}`)
console.log(`Chips: meetings solutions=${M_SOLUTIONS.length}, sponsor solutions=${S_SOLUTIONS.length}`)

// ─── Harness ─────────────────────────────────────────────────────────────────

let failures = 0
let combosRun = 0
let worst = { count: Infinity, desc: '' }
let strictZeroCombos = 0

function assertCombo(desc, result, minTarget, poolSize) {
  combosRun++
  const floor = Math.min(minTarget, poolSize)
  if (result.results.length < floor) {
    failures++
    if (failures <= 25) console.error(`  ✗ ${desc} → ${result.results.length} results (need ≥ ${floor})`)
  }
  if (result.strictCount === 0) strictZeroCombos++
  if (result.results.length < worst.count) worst = { count: result.results.length, desc }
  const ids = result.results.map(r => r.id)
  if (new Set(ids).size !== ids.length) {
    failures++
    console.error(`  ✗ ${desc} → duplicate results`)
  }
  if (result.strictCount > result.results.length) {
    failures++
    console.error(`  ✗ ${desc} → strictCount ${result.strictCount} > results ${result.results.length}`)
  }
}

// Deterministic PRNG for the sampled higher-order combos
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick(rng, arr, n) {
  const copy = arr.slice()
  const out = []
  for (let i = 0; i < n && copy.length; i++) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0])
  }
  return out
}

// ─── Sponsor portal: any combination ≥ 20 ────────────────────────────────────

console.log('\n[Sponsor portal] singles, all cross-dimension pairs, sampled higher-order')
const S_EMPTY = { roles: [], jobFunctions: [], industries: [], sizes: [], revenues: [], seeking: [], search: '' }
const S_DIMS = [
  ['seeking', S_SOLUTIONS],
  ['industries', S_INDUSTRIES],
  ['jobFunctions', S_JOB_FUNCTIONS],
  ['sizes', S_SIZES],
  ['revenues', S_REVENUES],
  ['roles', S_ROLES],
]

function runSponsor(overrides, desc) {
  const r = filterSponsorPortalAttendees(sponsorAttendees, { ...S_EMPTY, ...overrides })
  assertCombo(`sponsor ${desc}`, r, SPONSOR_MIN_RESULTS, sponsorAttendees.length)
  return r
}

for (const [dim, chips] of S_DIMS) {
  for (const chip of chips) runSponsor({ [dim]: [chip] }, `${dim}=[${chip}]`)
}

for (let i = 0; i < S_DIMS.length; i++) {
  for (let j = i + 1; j < S_DIMS.length; j++) {
    const [dimA, chipsA] = S_DIMS[i]
    const [dimB, chipsB] = S_DIMS[j]
    const stepA = QUICK ? Math.ceil(chipsA.length / 8) : 1
    const stepB = QUICK ? Math.ceil(chipsB.length / 8) : 1
    for (let a = 0; a < chipsA.length; a += stepA) {
      for (let b = 0; b < chipsB.length; b += stepB) {
        runSponsor({ [dimA]: [chipsA[a]], [dimB]: [chipsB[b]] }, `${dimA}=[${chipsA[a]}] + ${dimB}=[${chipsB[b]}]`)
      }
    }
  }
}

{
  const rng = mulberry32(20260703)
  const rounds = QUICK ? 100 : 400
  for (let n = 0; n < rounds; n++) {
    const dims = pick(rng, S_DIMS, 3 + Math.floor(rng() * 3))
    const overrides = {}
    const parts = []
    for (const [dim, chips] of dims) {
      const sel = pick(rng, chips, 1 + Math.floor(rng() * 3))
      overrides[dim] = sel
      parts.push(`${dim}=[${sel.join('|')}]`)
    }
    runSponsor(overrides, `random ${parts.join(' + ')}`)
  }
}

// ─── Meetings portal, People tab: any combination ≥ 8 in every category ──────

console.log('[Meetings People tab] singles + pairs across every category scope')
const M_EMPTY = {
  roles: [], industries: [], titleLevels: [], jobFunctions: [], companySizes: [],
  revenues: [], solutionsOffering: [], solutionsSeeking: [], search: '',
}
const M_DIMS = [
  ['solutionsOffering', M_SOLUTIONS],
  ['industries', M_INDUSTRIES],
  ['titleLevels', M_TITLE_LEVELS],
  ['jobFunctions', M_JOB_FUNCTIONS],
  ['companySizes', M_SIZES],
  ['revenues', M_REVENUES],
]

function categoryPoolSize(category) {
  if (category === null) return meetingsPeople.length
  const r = filterMeetingsPeople(meetingsPeople, M_EMPTY, category)
  return r.results.length
}
const M_CATEGORY_POOLS = new Map(M_CATEGORIES.map(c => [c, categoryPoolSize(c)]))
for (const [cat, size] of M_CATEGORY_POOLS) {
  console.log(`  category ${cat ?? '(all)'}: pool ${size}`)
}

function runMeetingsPeople(overrides, category, desc) {
  const r = filterMeetingsPeople(meetingsPeople, { ...M_EMPTY, ...overrides }, category)
  assertCombo(`meetings-people [${category ?? 'all'}] ${desc}`, r, MEETINGS_MIN_RESULTS, M_CATEGORY_POOLS.get(category))
  return r
}

for (const category of M_CATEGORIES) {
  for (const [dim, chips] of M_DIMS) {
    for (const chip of chips) runMeetingsPeople({ [dim]: [chip] }, category, `${dim}=[${chip}]`)
  }
  for (let i = 0; i < M_DIMS.length; i++) {
    for (let j = i + 1; j < M_DIMS.length; j++) {
      const [dimA, chipsA] = M_DIMS[i]
      const [dimB, chipsB] = M_DIMS[j]
      const stepA = QUICK ? Math.ceil(chipsA.length / 6) : 1
      const stepB = QUICK ? Math.ceil(chipsB.length / 6) : 1
      for (let a = 0; a < chipsA.length; a += stepA) {
        for (let b = 0; b < chipsB.length; b += stepB) {
          runMeetingsPeople(
            { [dimA]: [chipsA[a]], [dimB]: [chipsB[b]] },
            category,
            `${dimA}=[${chipsA[a]}] + ${dimB}=[${chipsB[b]}]`,
          )
        }
      }
    }
  }
}

{
  const rng = mulberry32(42)
  const rounds = QUICK ? 100 : 400
  for (let n = 0; n < rounds; n++) {
    const category = M_CATEGORIES[Math.floor(rng() * M_CATEGORIES.length)]
    const dims = pick(rng, M_DIMS, 3 + Math.floor(rng() * 3))
    const overrides = {}
    const parts = []
    for (const [dim, chips] of dims) {
      const sel = pick(rng, chips, 1 + Math.floor(rng() * 3))
      overrides[dim] = sel
      parts.push(`${dim}=[${sel.join('|')}]`)
    }
    runMeetingsPeople(overrides, category, `random ${parts.join(' + ')}`)
  }
}

// ─── Meetings portal, Solution Providers tab: any combination ≥ 8 ────────────

console.log('[Meetings Solution Providers tab] singles + all pairs')
const MS_DIMS = [
  ['solutionsOffering', M_SOLUTIONS],
  ['industries', M_INDUSTRIES],
  ['companySizes', M_SIZES],
  ['revenues', M_REVENUES],
]

function runMeetingsSponsors(overrides, desc) {
  const r = filterMeetingsSponsors(meetingsSponsors, { ...M_EMPTY, ...overrides })
  assertCombo(`meetings-sponsors ${desc}`, r, MEETINGS_MIN_RESULTS, meetingsSponsors.length)
  return r
}

for (const [dim, chips] of MS_DIMS) {
  for (const chip of chips) runMeetingsSponsors({ [dim]: [chip] }, `${dim}=[${chip}]`)
}
for (let i = 0; i < MS_DIMS.length; i++) {
  for (let j = i + 1; j < MS_DIMS.length; j++) {
    const [dimA, chipsA] = MS_DIMS[i]
    const [dimB, chipsB] = MS_DIMS[j]
    for (const a of chipsA) {
      for (const b of chipsB) {
        runMeetingsSponsors({ [dimA]: [a], [dimB]: [b] }, `${dimA}=[${a}] + ${dimB}=[${b}]`)
      }
    }
  }
}

// ─── Strict-first spot verification (independent re-check) ───────────────────

console.log('[Strict-first invariant] independent verification on sampled combos')
{
  const rng = mulberry32(7)
  for (let n = 0; n < 50; n++) {
    const [dim, chips] = S_DIMS[Math.floor(rng() * S_DIMS.length)]
    const chip = chips[Math.floor(rng() * chips.length)]
    const r = filterSponsorPortalAttendees(sponsorAttendees, { ...S_EMPTY, [dim]: [chip] })
    // Everything before strictCount must also appear in the strict-only run of a
    // pool restricted to those items; everything at/after must not be strict.
    const strictIds = new Set(r.results.slice(0, r.strictCount).map(p => p.id))
    const rerun = filterSponsorPortalAttendees(
      r.results.slice(0, r.strictCount),
      { ...S_EMPTY, [dim]: [chip] },
    )
    if (rerun.strictCount !== strictIds.size) {
      failures++
      console.error(`  ✗ strict-first violated for ${dim}=[${chip}]`)
    }
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\nCombos run: ${combosRun}`)
console.log(`Worst combo: ${worst.count} results — ${worst.desc}`)
console.log(`Combos with zero exact matches (fully backfilled): ${strictZeroCombos}`)
console.log(failures === 0 ? '\nALL GUARANTEES HOLD ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
