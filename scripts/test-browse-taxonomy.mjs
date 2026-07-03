#!/usr/bin/env node
// Unit tests for packages/db/src/browse-taxonomy.ts — canonicalization and the
// guaranteed-minimum filter engine. Pure logic, no database required.
//
//   node scripts/test-browse-taxonomy.mjs
//
// Exits non-zero on any failure.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const {
  CANONICAL_SOLUTIONS,
  canonicalizeSolution,
  solutionGroups,
  solutionMatchScore,
  canonicalizeIndustry,
  canonicalizeCompanySize,
  canonicalizeRevenue,
  filterWithGuarantee,
  filterSponsorPortalAttendees,
  filterMeetingsPeople,
  parseSolutionsArray,
  deriveIndustry,
  derivePeopleCategory,
  deriveJobFunction,
  deriveTitleLevel,
} = await import(join(ROOT, 'packages/db/src/browse-taxonomy.ts'))

// The app libs are import-free, so Node can load them directly for drift checks
const meetingsLib = await import(join(ROOT, 'apps/meetings/lib/solutions.ts'))
const sponsorLib = await import(join(ROOT, 'apps/sponsor/lib/solutions.ts'))

// Labels with no canonical mapping AND no group: they intentionally match only
// identical stored labels. Adding a chip that lands here should be a conscious
// decision — extend the synonym map or this list.
const IDENTITY_ONLY_OK = new Set([
  'Augmented Reality & Virtual Reality',
  'Translation & Localization Services',
  'Web Performance & Security Solutions',
  'Consultancy & Advisory Services',
])

let failures = 0
let passes = 0
function check(name, cond, detail = '') {
  if (cond) {
    passes++
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Extract chip catalogs from the real source files (drift-proof) ──────────

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
      if (depth === 0) {
        const literal = source.slice(start, i + 1)
        return new Function(`return ${literal}`)()
      }
    }
  }
  throw new Error(`Unbalanced array literal for ${constName} in ${file}`)
}

const sponsorViewSrc = readFileSync(join(ROOT, 'apps/sponsor/components/SponsorBrowseView.tsx'), 'utf8')
const sponsorProfileSrc = readFileSync(join(ROOT, 'apps/sponsor/components/ProfileEditor.tsx'), 'utf8')
const meetingsLibSrc = readFileSync(join(ROOT, 'apps/meetings/lib/solutions.ts'), 'utf8')

const TAXONOMY_C = extractArrayLiteral(sponsorViewSrc, 'SOLUTION_CATEGORIES', 'SponsorBrowseView.tsx')
  .flatMap(g => g.items)
const TAXONOMY_B = extractArrayLiteral(sponsorProfileSrc, 'SOLUTIONS', 'ProfileEditor.tsx')
const TAXONOMY_A = extractArrayLiteral(meetingsLibSrc, 'SOLUTIONS', 'meetings/lib/solutions.ts')

console.log(`Chip catalogs: A=${TAXONOMY_A.length} B=${TAXONOMY_B.length} C=${TAXONOMY_C.length}`)

// ─── 1. Canonical coverage ───────────────────────────────────────────────────

console.log('\n[1] Every label in every taxonomy maps to a canonical solution or group')
for (const label of [...TAXONOMY_A, ...TAXONOMY_B, ...TAXONOMY_C]) {
  const set = canonicalizeSolution(label)
  const groups = solutionGroups(label)
  check(
    `canonicalize "${label}"`,
    set.size >= 1 || groups.size >= 1 || IDENTITY_ONLY_OK.has(label),
    'maps to no canonical, no group, and is not allowlisted as identity-only',
  )
  for (const c of set) {
    check(`"${label}" → valid canonical`, CANONICAL_SOLUTIONS.includes(c), `got "${c}"`)
  }
}

// ─── 2. Identity + case/suffix robustness ────────────────────────────────────

console.log('[2] Identity and normalization robustness')
for (const label of [...TAXONOMY_A, ...TAXONOMY_B, ...TAXONOMY_C]) {
  check(`self-match "${label}"`, solutionMatchScore(label, label) === 1)
  check(`case-insensitive "${label}"`, solutionMatchScore(label.toUpperCase(), label) === 1)
}
check('suffix-blind', solutionMatchScore('Email Marketing Solutions', 'Email Marketing') === 1)
check('parenthetical-blind', solutionMatchScore('Loyalty & Rewards (inc. Rebates) Solutions', 'Loyalty & Rewards') === 1)

// ─── 3. Known cross-taxonomy equivalences ────────────────────────────────────

console.log('[3] Cross-taxonomy equivalences score 1')
const EQUIVALENCES = [
  // B ↔ A
  ['Analytics & Data', 'Analytics & Reporting'],
  ['Loyalty & Retention', 'Loyalty & Rewards'],
  ['Payments & Checkout', 'Payment Processing'],
  ['Logistics & Fulfillment', 'Shipping & Fulfillment'],
  ['Personalization & AI', 'Personalization'],
  ['ERP & Operations', 'ERP / Operations'],
  ['Returns & Exchanges', 'Returns Management'],
  // C ↔ A
  ['Email Marketing Solutions', 'Email Marketing'],
  ['Mobile, App & SMS Marketing Solutions', 'SMS Marketing'],
  ['Site Search Solutions', 'Search & Discovery'],
  ['Site Personalization Solutions', 'Personalization'],
  ['Inventory Management Systems', 'Inventory Management'],
  ['Returns Solutions', 'Returns Management'],
  ['Marketplace Platforms', 'Marketplace Integration'],
  ['B2B Ecommerce Platforms', 'B2B Commerce'],
  ['Artificial Intelligence (inc. Machine Learning)', 'AI & Automation'],
  ['Subscription Management & Recurring Payment Solutions', 'Subscription Management'],
  ['Customer Relationship Management (CRM) Solutions', 'Customer Support'],
  ['Loyalty Management Solutions', 'Loyalty & Rewards'],
  ['Order Management Systems', 'ERP / Operations'],
  ['Third Party Logistics (3PL) Services', 'Shipping & Fulfillment'],
  ['Web & App Analytics', 'Analytics & Reporting'],
  ['Predictive Analytics', 'Analytics & Reporting'],
  ['POS Solutions', 'Payment Processing'],
]
for (const [a, b] of EQUIVALENCES) {
  check(`"${a}" ≡ "${b}"`, solutionMatchScore(a, b) === 1, `score ${solutionMatchScore(a, b)}`)
  check(`symmetric "${b}" ≡ "${a}"`, solutionMatchScore(b, a) === 1)
}
check('unrelated pair scores < 1', solutionMatchScore('Email Marketing', 'Payment Processing') < 1)

// ─── 4. Industry / size / revenue normalization ──────────────────────────────

console.log('[4] Industry, company size, revenue normalization')
check('industry identity', canonicalizeIndustry('Fashion & Apparel') === 'Fashion & Apparel')
check('industry B→A', canonicalizeIndustry('Apparel & Fashion') === 'Fashion & Apparel')
check('industry beauty', canonicalizeIndustry('Beauty & Personal Care') === 'Beauty & Cosmetics')
check('industry home', canonicalizeIndustry('Home & Garden') === 'Home & Lifestyle')
check('industry pet', canonicalizeIndustry('Pet Supplies') === 'Pet')
check('industry luxury', canonicalizeIndustry('Luxury & Premium') === 'Luxury')
check('size code', canonicalizeCompanySize('SMB') === 'SMB')
check('size range startup', canonicalizeCompanySize('1–10') === 'STARTUP')
check('size range midmarket', canonicalizeCompanySize('51–200') === 'MIDMARKET')
check('size range enterprise', canonicalizeCompanySize('1,000+') === 'ENTERPRISE')
check('revenue code', canonicalizeRevenue('10M-50M') === '10M-50M')
check('revenue label', canonicalizeRevenue('$10M–$50M') === '10M-50M')
check('revenue under', canonicalizeRevenue('<$1M') === '<1M')
check('parseSolutionsArray json', parseSolutionsArray('["a","b"]').length === 2)
check('parseSolutionsArray junk', parseSolutionsArray('not json').length === 0)
check('parseSolutionsArray null', parseSolutionsArray(null).length === 0)

// ─── 5. Engine invariants (synthetic data) ───────────────────────────────────

console.log('[5] Guaranteed-minimum engine invariants')

const mkPerson = (i, overrides = {}) => ({
  id: `p${i}`,
  name: `Person ${String(i).padStart(3, '0')}`,
  company: 'Glossier',
  jobTitle: 'CMO',
  role: 'ATTENDEE',
  companySize: 'SMB',
  annualRevenue: '<1M',
  solutionsOffering: JSON.stringify(['Email Marketing']),
  solutionsSeeking: '[]',
  ...overrides,
})
const pool100 = Array.from({ length: 100 }, (_, i) => mkPerson(i))

// 5a. Zero strict matches → exactly min results, all similar
{
  const r = filterSponsorPortalAttendees(pool100, {
    roles: [], jobFunctions: [], industries: [], sizes: ['ENTERPRISE'], revenues: ['250M+'],
    seeking: ['POS Solutions'], search: '',
  })
  check('zero-strict returns min', r.results.length === r.minTarget, `got ${r.results.length}`)
  check('zero-strict strictCount 0', r.strictCount === 0)
  check('zero-strict similarCount = min', r.similarCount === r.minTarget)
}

// 5b. Strict ≥ min → no backfill
{
  const r = filterSponsorPortalAttendees(pool100, {
    roles: [], jobFunctions: [], industries: [], sizes: ['SMB'], revenues: [], seeking: [], search: '',
  })
  check('all-strict no backfill', r.similarCount === 0 && r.strictCount === 100)
}

// 5c. Strict < min < pool → exactly min, strict first
{
  const pool = [
    ...Array.from({ length: 5 }, (_, i) => mkPerson(i, { companySize: 'ENTERPRISE' })),
    ...Array.from({ length: 95 }, (_, i) => mkPerson(i + 5)),
  ]
  const r = filterSponsorPortalAttendees(pool, {
    roles: [], jobFunctions: [], industries: [], sizes: ['ENTERPRISE'], revenues: [], seeking: [], search: '',
  })
  check('partial-strict returns min', r.results.length === r.minTarget, `got ${r.results.length}`)
  check('partial-strict count', r.strictCount === 5)
  check('strict come first', r.results.slice(0, 5).every(p => p.companySize === 'ENTERPRISE'))
  check('backfill after strict', r.results.slice(5).every(p => p.companySize !== 'ENTERPRISE'))
}

// 5d. Pool smaller than min → whole pool
{
  const r = filterSponsorPortalAttendees(pool100.slice(0, 6), {
    roles: [], jobFunctions: [], industries: [], sizes: ['ENTERPRISE'], revenues: [], seeking: [], search: '',
  })
  check('small pool returns all', r.results.length === 6)
}

// 5e. No active filters → full pool, all strict
{
  const r = filterSponsorPortalAttendees(pool100, {
    roles: [], jobFunctions: [], industries: [], sizes: [], revenues: [], seeking: [], search: '',
  })
  check('no filters full pool', r.results.length === 100 && r.strictCount === 100)
}

// 5f. No duplicates, results ⊆ pool, deterministic
{
  const run = () => filterSponsorPortalAttendees(pool100, {
    roles: [], jobFunctions: [], industries: [], sizes: [], revenues: ['250M+'],
    seeking: ['Fulfillment Solutions'], search: '',
  })
  const r1 = run()
  const r2 = run()
  const ids1 = r1.results.map(p => p.id)
  check('no duplicates', new Set(ids1).size === ids1.length)
  check('deterministic', JSON.stringify(ids1) === JSON.stringify(r2.results.map(p => p.id)))
}

// 5g. Better partial matches rank before worse ones in the backfill
{
  const pool = [
    mkPerson(0, { id: 'bad', companySize: 'STARTUP', annualRevenue: '<1M' }),
    mkPerson(1, { id: 'good', companySize: 'ENTERPRISE', annualRevenue: '<1M' }),
  ]
  const r = filterWithGuarantee(pool, [
    { kind: 'companySize', selected: ['ENTERPRISE'], getValue: p => p.companySize },
    { kind: 'revenue', selected: ['250M+'], getValue: p => p.annualRevenue },
  ], 2)
  check('ranking by relevance', r.results[0].id === 'good', `got ${r.results[0].id}`)
}

// 5h. Search stays a hard scope (documented behavior)
{
  const r = filterSponsorPortalAttendees(pool100, {
    roles: [], jobFunctions: [], industries: [], sizes: [], revenues: [], seeking: [],
    search: 'zzz-no-such-person',
  })
  check('search is hard scope', r.results.length === 0)
}

// 5i. Meetings variant honors its own minimum
{
  const r = filterMeetingsPeople(pool100, {
    roles: [], industries: ['Luxury'], titleLevels: [], jobFunctions: [], companySizes: [],
    revenues: [], solutionsOffering: ['SMS Marketing'], solutionsSeeking: [], search: '',
  }, null)
  check('meetings min respected', r.results.length >= 8, `got ${r.results.length}`)
}

// ─── 6. Drift guard: shared derivation copies vs app libs ────────────────────
// packages/db/src/browse-taxonomy.ts carries copies of getIndustry /
// getJobFunction / getTitleLevel / getPeopleCategory (and their company-name
// sets) so it can stay import-free. Cards render from the app libs while
// filtering uses the copies — any drift silently misclassifies rows. Pin them.

console.log('[6] Drift guard: shared derivation helpers ≡ app libs')

function extractSetCompanies(source, file) {
  const names = new Set()
  const re = /new Set\(\[/g
  let m
  while ((m = re.exec(source))) {
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
      if (ch === "'" || ch === '"') inStr = ch
      else if (ch === '[') depth++
      else if (ch === ']') {
        depth--
        if (depth === 0) {
          for (const name of new Function(`return ${source.slice(start, i + 1)}`)()) names.add(name)
          break
        }
      }
    }
  }
  if (names.size === 0) throw new Error(`No Set literals found in ${file}`)
  return names
}

const taxonomySrc = readFileSync(join(ROOT, 'packages/db/src/browse-taxonomy.ts'), 'utf8')
const sponsorLibSrc = readFileSync(join(ROOT, 'apps/sponsor/lib/solutions.ts'), 'utf8')
const allCompanies = new Set([
  ...extractSetCompanies(taxonomySrc, 'browse-taxonomy.ts'),
  ...extractSetCompanies(meetingsLibSrc, 'meetings/lib/solutions.ts'),
  ...extractSetCompanies(sponsorLibSrc, 'sponsor/lib/solutions.ts'),
  'Some Unknown Startup', 'Shopify', '',
])

for (const company of allCompanies) {
  const shared = deriveIndustry(company || null)
  const m1 = meetingsLib.getIndustry(company || null)
  const s1 = sponsorLib.getIndustry(company || null)
  check(`industry drift "${company}"`, shared === m1 && shared === s1,
    `shared=${shared} meetings=${m1} sponsor=${s1}`)
  const sharedCat = derivePeopleCategory(company || null)
  const mCat = meetingsLib.getPeopleCategory(company || null)
  check(`category drift "${company}"`, sharedCat === mCat, `shared=${sharedCat} meetings=${mCat}`)
}

const TITLE_CORPUS = [
  null, '', 'CEO', 'COO', 'CFO', 'CTO', 'CMO', 'CPO of Product', 'Founder', 'Co-Founder & CEO',
  'President', 'Owner', 'General Manager', 'Managing Director', 'VP of Marketing', 'VP, Growth',
  'SVP Operations', 'Vice President of Product', 'Brand Manager', 'Head of Acquisition',
  'Retention Lead', 'Performance Marketing Manager', 'SEO Specialist', 'Director of Content',
  'Creative Director', 'Communications Manager', 'Ecommerce Director', 'E-commerce Manager',
  'DTC Lead', 'Head of Commerce', 'Marketplace Manager', 'Online Sales Manager', 'Store Manager',
  'Retail Operations Lead', 'Wholesale Director', 'Omnichannel Lead', 'Customer Success Manager',
  'CX Lead', 'Head of Experience', 'Support Manager', 'Service Manager', 'Digital Director',
  'Growth Manager', 'Web Manager', 'Social Media Manager', 'Strategy Director', 'Innovation Lead',
  'Transformation Manager', 'Consulting Manager', 'Tech Lead', 'Engineering Manager', 'Developer',
  'Software Architect', 'Platform Manager', 'Data Engineer', 'IT Manager', 'Head of Information',
  'Operations Manager', 'Ops Lead', 'Fulfillment Manager', 'Warehouse Supervisor',
  'Procurement Manager', 'Supply Chain Manager', 'Logistics Coordinator', 'Shipping Manager',
  'Distribution Manager', 'Merchandising Manager', 'Buyer', 'Director of Product',
  'Assortment Planner', 'Planning Manager', 'Sales Director', 'Partnerships Manager',
  'Account Executive', 'Revenue Manager', 'Finance Manager', 'Financial Analyst',
  'Manager of Analytics', 'Accounting Manager', 'Reporting Analyst', 'Director of Analytics',
  'Head of Marketing', 'Head, Digital', 'Head of Technology', 'Chief', 'Analyst',
]

for (const title of TITLE_CORPUS) {
  const sharedFn = deriveJobFunction(title)
  const m2 = meetingsLib.getJobFunction(title)
  const s2 = sponsorLib.getJobFunction(title)
  check(`jobFunction drift "${title}"`, sharedFn === m2 && sharedFn === s2,
    `shared=${sharedFn} meetings=${m2} sponsor=${s2}`)
  const sharedLvl = deriveTitleLevel(title)
  const m3 = meetingsLib.getTitleLevel(title)
  const s3 = sponsorLib.getTitleLevel(title)
  check(`titleLevel drift "${title}"`, sharedLvl === m3 && sharedLvl === s3,
    `shared=${sharedLvl} meetings=${m3} sponsor=${s3}`)
}

// Group mapping: every canonical solution's group in the shared module must
// match the app libs' SOLUTION_CATEGORY_GROUPS.
for (const group of meetingsLib.SOLUTION_CATEGORY_GROUPS) {
  for (const item of group.items) {
    const groups = solutionGroups(item)
    check(`group drift "${item}"`, groups.size === 1 && groups.has(group.label),
      `shared=[${[...groups]}] lib=${group.label}`)
  }
}
check('group coverage', meetingsLib.SOLUTION_CATEGORY_GROUPS.flatMap(g => g.items).length === CANONICAL_SOLUTIONS.length)

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
