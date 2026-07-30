#!/usr/bin/env node
/**
 * Backfill the profile fields the attendee onboarding gate requires, so demo
 * and test accounts are not stopped by it.
 *
 * WHY THIS EXISTS
 * The attendee app gained an onboarding gate: an attendee missing any of
 * name, jobTitle, company, companySize, annualRevenue, or at least one
 * solutionsSeeking entry is blocked from the app until they complete it. The
 * demo data predates that requirement, so a large share of loginable accounts
 * were blocked — measured at 297 of 560 when this script was written, almost
 * all of them holding solutionsSeeking as the string "[]" (an explicitly
 * emptied array, which is truthy and therefore easy to mistake for filled).
 *
 * An empty "solutions seeking" is also a data problem in its own right,
 * independent of the gate: meeting matching compares what an attendee seeks
 * against what sponsors offer, so an attendee with nothing listed cannot be
 * matched well by any algorithm.
 *
 * ONE ACCOUNT IS LEFT DELIBERATELY INCOMPLETE
 * GATE_DEMO_EMAIL below is created (or repaired) as a complete profile EXCEPT
 * for solutionsSeeking, so the gate can be demonstrated on cue rather than
 * discovered by accident on someone else's login. It is named for that purpose
 * so nobody "fixes" it later thinking it is broken data.
 *
 * DO NOT REACH FOR `db:seed` INSTEAD OF THIS
 * prisma/seed.ts deletes every user whose id is not in its own generated list.
 * The current demo dataset was not produced by that script — none of its
 * accounts carry the `gen-attendee-*` ids the seed generates — so reseeding
 * would delete the whole demo population. It would also leave you worse off
 * for this specific problem: the seed assigns solutionsSeeking to everyone it
 * generates, but sets neither companySize nor annualRevenue, so a reseed
 * produces ~1000 accounts blocked on two fields instead of 297 blocked on one.
 * (seed.ts has since been taught to set those two — but the deletion behaviour
 * is unchanged, so reseeding a live demo database is still destructive.)
 *
 * Idempotent: only writes fields that are actually missing, so re-running is
 * safe and a second run reports zero changes.
 *
 * Usage:
 *   node packages/db/scripts/backfill-onboarding-required-fields.mjs [--dry-run]
 *
 * Requires DATABASE_URL (local file: path) or TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
 */

import { PrismaClient } from '@prisma/client'
import { scrypt, randomBytes } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)
const SCRYPT_N = 2048
const SCRYPT_R = 8
const SCRYPT_P = 1

const DRY_RUN = process.argv.includes('--dry-run')

/** The account deliberately left blocked, for demonstrating the gate. */
const GATE_DEMO_EMAIL = 'onboarding-demo@test.com'
const GATE_DEMO_PASSWORD = 'password123'

/** Mirrors apps/attendee/lib/solutions.ts SOLUTIONS. */
const SOLUTIONS = [
  'Email Marketing', 'SMS Marketing', 'Loyalty & Rewards', 'Subscription Management',
  'Returns Management', 'Customer Support', 'Shipping & Fulfillment', 'Inventory Management',
  'Analytics & Reporting', 'Payment Processing', 'Search & Discovery', 'ERP / Operations',
  'Personalization', 'Reviews & UGC', 'Marketplace Integration', 'B2B Commerce',
  'Headless Commerce', 'AI & Automation',
]

/** Mirrors apps/attendee/lib/solutions.ts COMPANY_SIZES / REVENUE_RANGES. */
const COMPANY_SIZES = ['STARTUP', 'SMB', 'MIDMARKET', 'ENTERPRISE']
const REVENUE_RANGES = ['<1M', '1M-10M', '10M-50M', '50M-250M', '250M+']

/**
 * Job-title keyword -> solutions that role plausibly shops for. Keeps the
 * backfilled data coherent rather than random, so the matching feature has
 * something sensible to work with. Order matters: first match wins.
 */
const TITLE_INTERESTS = [
  [/market|brand|content|acquisition|retention|seo|creative/i, ['Email Marketing', 'SMS Marketing', 'Personalization']],
  [/ecommerce|e-commerce|dtc|growth|commerce|revenue|marketplace/i, ['Search & Discovery', 'Headless Commerce', 'Marketplace Integration']],
  [/tech|engineer|product|data|developer|software|platform|architect|ai/i, ['AI & Automation', 'Analytics & Reporting', 'Headless Commerce']],
  [/operation|ops|logistic|supply|fulfil|warehouse|procurement/i, ['ERP / Operations', 'Shipping & Fulfillment', 'Inventory Management']],
  [/financ|account|analytic|reporting|insight/i, ['Analytics & Reporting', 'Payment Processing', 'ERP / Operations']],
  [/sales|partnership|wholesale|retail|customer success|account/i, ['B2B Commerce', 'Customer Support', 'Loyalty & Rewards']],
  [/ceo|coo|cfo|cto|cmo|founder|president|owner|chief/i, ['AI & Automation', 'Analytics & Reporting', 'Loyalty & Rewards']],
]

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const buf = await scryptAsync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
  return `${buf.toString('hex')}.${salt}.${SCRYPT_N}`
}

function createPrismaClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN
  if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')
    const { createClient } = require('@libsql/client')
    const adapter = new PrismaLibSQL(createClient({ url: tursoUrl, authToken: tursoToken }))
    return new PrismaClient({ adapter })
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Set DATABASE_URL (e.g. file:./dev.db) or TURSO_DATABASE_URL + TURSO_AUTH_TOKEN')
  }
  return new PrismaClient()
}

/** Same emptiness rule as apps/attendee/lib/profile-completeness.ts. */
function parseArrayField(value) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(v => typeof v === 'string' && v.trim() !== '')
  } catch {
    return []
  }
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim() === ''
}

/** Stable per-user pseudo-random index, so re-runs and re-reads agree. */
function seedFrom(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

function solutionsFor(user) {
  const base = []
  for (const [pattern, picks] of TITLE_INTERESTS) {
    if (pattern.test(user.jobTitle ?? '')) { base.push(...picks); break }
  }
  const n = seedFrom(user.id)
  // Always end with 2–3 distinct values, even when the title matched nothing.
  while (base.length < 2) {
    const candidate = SOLUTIONS[(n + base.length * 7) % SOLUTIONS.length]
    if (!base.includes(candidate)) base.push(candidate)
  }
  return base.slice(0, 2 + (n % 2))
}

async function main() {
  const prisma = createPrismaClient()
  const label = DRY_RUN ? '[dry-run]' : '[apply]'
  console.log(`\n${label} Backfilling onboarding-required profile fields`)
  console.log(`${label} Deliberately left incomplete: ${GATE_DEMO_EMAIL}\n`)

  try {
    // ── 1. Ensure the gate-demo account exists, complete EXCEPT its solutions ──
    const existingDemo = await prisma.user.findUnique({
      where: { email: GATE_DEMO_EMAIL },
      select: { id: true },
    })
    const demoFields = {
      name: 'Onboarding Gate Demo',
      jobTitle: 'Head of eCommerce',
      company: 'Gate Demo Co',
      companySize: 'MIDMARKET',
      annualRevenue: '10M-50M',
      solutionsSeeking: '[]', // deliberately empty — this is the whole point
      role: 'ATTENDEE',
    }
    if (!existingDemo) {
      if (DRY_RUN) {
        console.log(`  would CREATE ${GATE_DEMO_EMAIL} (complete except solutionsSeeking)`)
      } else {
        await prisma.user.create({
          data: { email: GATE_DEMO_EMAIL, password: await hashPassword(GATE_DEMO_PASSWORD), ...demoFields },
        })
        console.log(`  created ${GATE_DEMO_EMAIL} / ${GATE_DEMO_PASSWORD} — blocked by design`)
      }
    } else if (DRY_RUN) {
      console.log(`  would RESET ${GATE_DEMO_EMAIL} back to blocked-by-design`)
    } else {
      await prisma.user.update({ where: { email: GATE_DEMO_EMAIL }, data: demoFields })
      console.log(`  reset ${GATE_DEMO_EMAIL} back to blocked-by-design`)
    }

    // ── 2. Backfill everyone else who can sign in ──────────────────────────────
    const users = await prisma.user.findMany({
      where: { password: { not: null }, email: { not: GATE_DEMO_EMAIL } },
      select: {
        id: true, email: true, name: true, jobTitle: true, company: true,
        companySize: true, annualRevenue: true, solutionsSeeking: true,
      },
    })
    console.log(`\n  ${users.length} loginable accounts to inspect (excluding the gate demo)`)

    const filledCounts = {}
    let changed = 0

    for (const user of users) {
      const data = {}
      const n = seedFrom(user.id)

      if (isBlank(user.name)) data.name = user.email?.split('@')[0]?.replace(/[._]/g, ' ') ?? 'Attendee'
      if (isBlank(user.jobTitle)) data.jobTitle = 'Head of eCommerce'
      if (isBlank(user.company)) data.company = user.email?.split('@')[1]?.split('.')[0] ?? 'Independent'
      if (isBlank(user.companySize)) data.companySize = COMPANY_SIZES[n % COMPANY_SIZES.length]
      if (isBlank(user.annualRevenue)) data.annualRevenue = REVENUE_RANGES[n % REVENUE_RANGES.length]
      if (parseArrayField(user.solutionsSeeking).length === 0) {
        data.solutionsSeeking = JSON.stringify(solutionsFor(user))
      }

      const keys = Object.keys(data)
      if (keys.length === 0) continue
      for (const k of keys) filledCounts[k] = (filledCounts[k] ?? 0) + 1
      changed++
      if (!DRY_RUN) await prisma.user.update({ where: { id: user.id }, data })
    }

    console.log(`  ${DRY_RUN ? 'would update' : 'updated'} ${changed} account(s)`)
    for (const [field, count] of Object.entries(filledCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${field}: ${count}`)
    }

    // ── 3. Verify by re-reading, rather than trusting the writes above ─────────
    if (!DRY_RUN) {
      const after = await prisma.user.findMany({
        where: { password: { not: null } },
        select: {
          email: true, name: true, jobTitle: true, company: true,
          companySize: true, annualRevenue: true, solutionsSeeking: true,
        },
      })
      const stillBlocked = after.filter(u =>
        isBlank(u.name) || isBlank(u.jobTitle) || isBlank(u.company) ||
        isBlank(u.companySize) || isBlank(u.annualRevenue) ||
        parseArrayField(u.solutionsSeeking).length === 0,
      )
      console.log(`\n  verification: ${stillBlocked.length} of ${after.length} loginable accounts still blocked`)
      const unexpected = stillBlocked.filter(u => u.email !== GATE_DEMO_EMAIL)
      if (stillBlocked.length === 1 && unexpected.length === 0) {
        console.log(`  PASS — the only blocked account is ${GATE_DEMO_EMAIL}, which is intentional`)
      } else {
        console.log(`  FAIL — ${unexpected.length} account(s) blocked that should not be:`)
        for (const u of unexpected.slice(0, 10)) console.log(`    ${u.email}`)
        process.exitCode = 1
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(err => { console.error(`\n[fatal] ${err?.message ?? err}`); process.exit(1) })
