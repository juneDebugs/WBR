#!/usr/bin/env node
// Checks for packages/db/src/onboarding-policy.ts — the shared onboarding
// required set. Pure logic plus a behaviour-preservation comparison against the
// seeded database.
//
//   node scripts/test-onboarding-policy.mjs
//   pnpm test:onboarding-policy
//
// Exits non-zero on any failure.
//
// ── Why this file exists ─────────────────────────────────────────────────────
//
// Phase 2 of the onboarding-enforcement plan moved the definition of "complete"
// out of two apps and into one shared module. A move like that is exactly the
// change that looks harmless and silently alters meaning, so it needs two kinds
// of evidence:
//
//   1. The Phase 1 Playwright script passing UNCHANGED at its full 53
//      assertions — that covers the delegate gate end to end, through a real
//      browser. It is the primary evidence and lives at
//      docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs.
//
//   2. The checks below, which cover what a browser flow cannot reach: the
//      awkward stored values the emptiness rules must reject, the derived
//      database `select` actually covering every column a check reads, and the
//      admin reminder email still naming the same nine items for all 20 seeded
//      exhibiting companies after being re-pointed at the shared list.
//
// Same shape and same mechanism as scripts/test-browse-taxonomy.mjs, which does
// this for packages/db/src/browse-taxonomy.ts. Node imports the TypeScript
// module directly; no test runner is involved and none is introduced.

import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DB_PATH = join(ROOT, 'packages/db/prisma/dev.db')
const POLICY_PATH = join(ROOT, 'packages/db/src/onboarding-policy.ts')

const {
  parseStringList,
  isScalarFilled,
  DELEGATE_REQUIRED_FIELDS,
  DELEGATE_FIELD_LABELS,
  DELEGATE_REQUIRED_SELECT,
  missingDelegateFields,
  SPONSOR_READINESS_ITEMS,
  SPONSOR_REQUIRED_ITEMS,
  SPONSOR_REQUIRED_SELECT,
  missingSponsorItems,
  missingRequiredLabels,
  isRequiredSetComplete,
} = await import(POLICY_PATH)

let passes = 0
let failures = 0
function check(name, cond, detail = '') {
  if (cond) {
    passes++
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
function section(title) {
  console.log(`\n── ${title} ──`)
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ─── 1. The module is import-free ─────────────────────────────────────────────
//
// Not cosmetic. The package root exports the live database client, so a browser
// component must deep-import this file; if this file ever grows an import of
// its own, that deep import stops being safe. A type check will not tell you.

section('The module carries no runtime imports')

const policySource = readFileSync(POLICY_PATH, 'utf8')
const codeLines = policySource
  .split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))

const importLines = codeLines.filter(line => /^\s*import\b/.test(line) || /\brequire\s*\(/.test(line))
check(
  'no import or require statement anywhere in the module',
  importLines.length === 0,
  importLines.join(' | '),
)
check(
  'no re-export from another module (which would also pull code in)',
  !codeLines.some(line => /^\s*export\s+.*\bfrom\b/.test(line)),
)

// ─── 2. Emptiness rules — the documented awkward inputs ───────────────────────
//
// These are the exact cases written into the module's header table. Every one
// must count as MISSING except the single filled case.

section('Emptiness rules: the documented awkward inputs')

const LIST_CASES = [
  ['[]', 0, 'empty list'],
  ['["a"]', 1, 'list of strings — the only filled case'],
  ['5', 0, 'a bare number'],
  ['"hello"', 0, 'a bare string'],
  ['{}', 0, 'an object'],
  ['null', 0, 'the null literal'],
  ['not json', 0, 'unparseable text'],
  ['', 0, 'empty text'],
  [null, 0, 'null'],
  [undefined, 0, 'undefined'],
]
for (const [input, expectedLength, why] of LIST_CASES) {
  const got = parseStringList(input)
  check(
    `list ${JSON.stringify(input)} → ${expectedLength === 0 ? 'missing' : 'filled'} (${why})`,
    got.length === expectedLength,
    `got ${JSON.stringify(got)}`,
  )
}
check(
  'list ["a", 5] keeps only the text entry → filled',
  eq(parseStringList('["a", 5]'), ['a']),
)
check(
  'list [5] has no text entry → missing',
  parseStringList('[5]').length === 0,
)
check(
  'list ["  "] is blank after trimming → missing',
  parseStringList('["  "]').length === 0,
)

const SCALAR_CASES = [
  ['Acme', true, 'ordinary value'],
  [' ', false, 'a single space — must not satisfy a hard block'],
  ['   ', false, 'several spaces'],
  ['', false, 'empty text'],
  [null, false, 'null'],
  [undefined, false, 'undefined'],
]
for (const [input, expected, why] of SCALAR_CASES) {
  check(
    `scalar ${JSON.stringify(input)} → ${expected ? 'filled' : 'missing'} (${why})`,
    isScalarFilled(input) === expected,
  )
}

// ─── 3. The delegate required set is unchanged by the move ───────────────────

section('Delegate required set: unchanged from Phase 1')

const EXPECTED_DELEGATE_FIELDS = [
  'name',
  'jobTitle',
  'company',
  'companySize',
  'annualRevenue',
  'solutionsSeeking',
]
check(
  'exactly the same six fields, in the same order',
  eq([...DELEGATE_REQUIRED_FIELDS], EXPECTED_DELEGATE_FIELDS),
  JSON.stringify([...DELEGATE_REQUIRED_FIELDS]),
)
check(
  'every field has a human sentence',
  EXPECTED_DELEGATE_FIELDS.every(f => typeof DELEGATE_FIELD_LABELS[f] === 'string' && DELEGATE_FIELD_LABELS[f].length > 0),
)
check(
  'the labels are the exact words Phase 1 shipped',
  eq(
    EXPECTED_DELEGATE_FIELDS.map(f => DELEGATE_FIELD_LABELS[f]),
    ['Name', 'Job title', 'Company', 'Company size', 'Annual revenue', 'Solutions you’re seeking'],
  ),
)
check(
  'a delegate is a BUYER: the set asks what they seek and never what they offer',
  DELEGATE_REQUIRED_FIELDS.includes('solutionsSeeking') &&
    !DELEGATE_REQUIRED_FIELDS.includes('solutionsOffering'),
)
check(
  'missing fields come back in declaration order, not input order',
  eq(missingDelegateFields({ company: 'Acme' }), ['name', 'jobTitle', 'companySize', 'annualRevenue', 'solutionsSeeking']),
)

// ─── 4. The database select is DERIVED and covers every column read ──────────
//
// The failure this prevents: a column the query did not fetch reads as absent,
// so the policy reports it missing and the gate blocks a delegate on a field
// they had actually filled in. A hardcoded select drifting from the required
// set is how that happens.

section('Every column a check reads is a column the query fetched')

const delegateSelectKeys = Object.keys(DELEGATE_REQUIRED_SELECT).sort()
check(
  'the delegate select covers exactly the required fields — no more, no fewer',
  eq(delegateSelectKeys, [...EXPECTED_DELEGATE_FIELDS].sort()),
  JSON.stringify(delegateSelectKeys),
)
check(
  'every value in the delegate select is true (a real Prisma select)',
  Object.values(DELEGATE_REQUIRED_SELECT).every(v => v === true),
)
check(
  'a profile fetched with exactly that select is judged complete when filled',
  isRequiredSetComplete('delegate', {
    name: 'A',
    jobTitle: 'B',
    company: 'C',
    companySize: 'SMB',
    annualRevenue: '1M-10M',
    solutionsSeeking: '["x"]',
  }),
)

const sponsorRequiredColumns = [...new Set(SPONSOR_REQUIRED_ITEMS.flatMap(i => i.columns))].sort()
const sponsorSelectKeys = Object.keys(SPONSOR_REQUIRED_SELECT).sort()
check(
  'the sponsor select covers exactly the columns the required items read',
  eq(sponsorSelectKeys, sponsorRequiredColumns),
  `select=${JSON.stringify(sponsorSelectKeys)} columns=${JSON.stringify(sponsorRequiredColumns)}`,
)
check(
  'no required sponsor item reads a column the select omits',
  SPONSOR_REQUIRED_ITEMS.every(i => i.columns.every(c => SPONSOR_REQUIRED_SELECT[c] === true)),
)

// ─── 5. The sponsor required set is the six named items ──────────────────────

section('Sponsor required set: six of the reminder’s nine')

check(
  'the reminder list still holds nine items',
  SPONSOR_READINESS_ITEMS.length === 9,
  `got ${SPONSOR_READINESS_ITEMS.length}`,
)
check(
  'the required set is the six named in the plan, in declaration order',
  eq(SPONSOR_REQUIRED_ITEMS.map(i => i.key), ['logo', 'tagline', 'description', 'contact', 'solutions', 'website']),
  JSON.stringify(SPONSOR_REQUIRED_ITEMS.map(i => i.key)),
)
check(
  'the three excluded items are booth, teammates and social',
  eq(
    SPONSOR_READINESS_ITEMS.filter(i => !i.required).map(i => i.key),
    ['booth', 'teammates', 'social'],
  ),
)
check(
  'a sponsor is a SELLER: the required items read what they offer, never what they seek',
  SPONSOR_REQUIRED_ITEMS.some(i => i.columns.includes('solutionsOffering')) &&
    !SPONSOR_REQUIRED_ITEMS.some(i => i.columns.includes('solutionsSeeking')),
)
check(
  'a company with no team member attached is NOT blocked by the gate',
  isRequiredSetComplete('sponsor', {
    logoUrl: 'x',
    tagline: 'y',
    description: 'a description comfortably longer than twenty characters',
    contactName: 'n',
    contactEmail: 'e',
    solutionsOffering: '["s"]',
    website: 'w',
    attachedUserCount: 0,
  }),
)
check(
  'a missing company row (nothing known at all) is judged INCOMPLETE, not complete',
  !isRequiredSetComplete('sponsor', {}) && !isRequiredSetComplete('delegate', {}),
)
check(
  'a description of exactly 20 characters is missing; 21 satisfies it',
  !isRequiredSetComplete('sponsor', {
    logoUrl: 'x', tagline: 'y', description: 'a'.repeat(20), contactName: 'n',
    contactEmail: 'e', solutionsOffering: '["s"]', website: 'w',
  }) &&
  isRequiredSetComplete('sponsor', {
    logoUrl: 'x', tagline: 'y', description: 'a'.repeat(21), contactName: 'n',
    contactEmail: 'e', solutionsOffering: '["s"]', website: 'w',
  }),
)

// ─── 6. The named-set interface ──────────────────────────────────────────────

section('The named-set interface returns human sentences in declaration order')

check(
  'delegate: labels come back in declaration order',
  eq(missingRequiredLabels('delegate', { name: 'A' }), [
    'Job title', 'Company', 'Company size', 'Annual revenue', 'Solutions you’re seeking',
  ]),
)
check(
  'sponsor: labels are the reminder email’s exact imperative wording',
  eq(missingRequiredLabels('sponsor', {}), [
    'Upload your company logo',
    'Add a company tagline',
    'Write a company description',
    'Set primary contact name & email',
    'List your solutions / offerings',
    'Add your website URL',
  ]),
)

// ─── 7. Behaviour preservation against the seeded database ───────────────────
//
// The rules below are copies of the code as it stood BEFORE Phase 2 — the
// attendee app's profile-completeness.ts and the admin reminder route's inline
// CHECKLIST. Every seeded row is judged by both and the verdicts must agree.
// This is what turns "the move changed no behaviour" from a claim into a
// measurement.

section('Behaviour preservation: old rules vs new, over every seeded row')

function oldParseArrayField(value) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(v => typeof v === 'string' && v.trim() !== '')
  } catch {
    return []
  }
}
const OLD_DELEGATE_FIELDS = EXPECTED_DELEGATE_FIELDS
function oldDelegateMissing(profile) {
  return OLD_DELEGATE_FIELDS.filter(field => {
    const raw = profile[field]
    if (field === 'solutionsSeeking') return oldParseArrayField(raw).length === 0
    return typeof raw !== 'string' || raw.trim() === ''
  })
}

// Verbatim from apps/web/app/api/sponsors/remind/route.ts before this phase.
const OLD_CHECKLIST = [
  { key: 'logo', label: 'Upload your company logo', check: s => !!s.logoUrl },
  { key: 'tagline', label: 'Add a company tagline', check: s => !!s.tagline },
  { key: 'description', label: 'Write a company description', check: s => !!s.description && s.description.length > 20 },
  { key: 'contact', label: 'Set primary contact name & email', check: s => !!s.contactName && !!s.contactEmail },
  { key: 'booth', label: 'Confirm your booth number', check: s => !!s.boothNumber },
  { key: 'solutions', label: 'List your solutions / offerings', check: s => { try { return JSON.parse(s.solutionsOffering || '[]').length > 0 } catch { return false } } },
  { key: 'teammates', label: 'Assign at least one team member', check: s => s._count.users > 0 },
  { key: 'website', label: 'Add your website URL', check: s => !!s.website },
  { key: 'social', label: 'Add LinkedIn or Twitter/X link', check: s => !!s.socialLinkedIn || !!s.socialTwitter },
]

const db = new DatabaseSync(DB_PATH, { readOnly: true })

// Delegates — every user row, judged by both rules.
const users = db
  .prepare('SELECT id, name, jobTitle, company, companySize, annualRevenue, solutionsSeeking FROM User')
  .all()

let delegateDisagreements = 0
for (const user of users) {
  if (!eq(oldDelegateMissing(user), missingDelegateFields(user))) delegateDisagreements++
}
check(
  `delegate verdicts identical for all ${users.length} user rows`,
  delegateDisagreements === 0,
  `${delegateDisagreements} row(s) disagree`,
)

// Sponsors — every company, judged by both the old nine-item list and the new one.
const sponsors = db
  .prepare(`
    SELECT s.id, s.name, s.logoUrl, s.tagline, s.description, s.contactName, s.contactEmail,
           s.boothNumber, s.solutionsOffering, s.website, s.socialLinkedIn, s.socialTwitter,
           (SELECT COUNT(*) FROM User u WHERE u.sponsorId = s.id) AS attachedUserCount
    FROM Sponsor s
  `)
  .all()

let reminderLabelDisagreements = 0
let reminderPctDisagreements = 0
const offenders = []
for (const sponsor of sponsors) {
  const oldSubject = { ...sponsor, _count: { users: sponsor.attachedUserCount } }
  const oldMissing = OLD_CHECKLIST.filter(i => !i.check(oldSubject)).map(i => i.label)
  const oldPct = Math.round(((OLD_CHECKLIST.length - oldMissing.length) / OLD_CHECKLIST.length) * 100)

  const newMissing = missingSponsorItems(sponsor).map(i => i.label)
  const newPct = Math.round(((SPONSOR_READINESS_ITEMS.length - newMissing.length) / SPONSOR_READINESS_ITEMS.length) * 100)

  if (!eq(oldMissing, newMissing)) {
    reminderLabelDisagreements++
    offenders.push(`${sponsor.name}: old=${JSON.stringify(oldMissing)} new=${JSON.stringify(newMissing)}`)
  }
  if (oldPct !== newPct) reminderPctDisagreements++
}
check(
  `reminder chase list identical for all ${sponsors.length} exhibiting companies`,
  reminderLabelDisagreements === 0,
  offenders.join(' | '),
)
check(
  `reminder completion percentage identical for all ${sponsors.length} exhibiting companies`,
  reminderPctDisagreements === 0,
)

// The measured figure the sponsor required set was chosen on. If this moves, the
// choice needs revisiting — it is why the 18-field dashboard percentage was
// rejected as a condition of entry.
const passingSix = sponsors.filter(s => isRequiredSetComplete('sponsor', s)).length
check(
  `${passingSix} of ${sponsors.length} companies satisfy the six required items (expected 14 of 20)`,
  passingSix === 14 && sponsors.length === 20,
  `got ${passingSix} of ${sponsors.length}`,
)

db.close()

// ─── Result ───────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60))
console.log(`  Results: ${passes} passed, ${failures} failed`)
console.log('─'.repeat(60))
console.log(
  '\n  A pass here is evidence about the assertions listed above and nothing\n' +
  '  wider. It says nothing about the gate’s behaviour in a browser — that is\n' +
  '  what the Phase 1 Playwright script covers.\n',
)

process.exit(failures === 0 ? 0 : 1)
