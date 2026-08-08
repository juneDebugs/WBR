/**
 * Acceptance test for the SPONSOR-side gate demonstration account and company.
 *
 * WHAT IS UNDER TEST
 * `restoreSponsorCompanyPin()`, reached through `ensureCanonicalTestAccount()`
 * in ../src/test-accounts.ts. Every app's NextAuth authorize() calls that
 * function before the credential check.
 *
 * WHY IT EXISTS SEPARATELY FROM test-canonical-account-restore.ts
 * That script covers `restoreRequiredFields`, which puts a DELEGATE's own six
 * profile fields back. The sponsor onboarding gate never reads a
 * representative's own profile — it reads the six required items of the
 * exhibiting COMPANY the account is attached to — so the delegate flag cannot
 * do this job and a second mechanism exists (UF-59). Two mechanisms, two
 * scripts, so a failure names which one broke.
 *
 * THE TWO CONTAINMENT PROPERTIES ARE THE POINT, AND THEY RUN IN BOTH
 * DIRECTIONS:
 *   - outward: an account that carries no company pin must never cause a
 *     Sponsor row to be read or written. `sponsor@test.com` is attached to
 *     Tailor ERP, a REAL exhibiting company with real content, so a leak here
 *     would corrupt demonstration data. That account is the sharpest available
 *     probe and is used as one.
 *   - inward: the pin must write only the columns it names. The company
 *     definition holds a tagline, description, logo, website and offerings that
 *     the pin deliberately does not cover, because a restore wider than the pin
 *     produces a row that is unhealthy forever and writes on every single
 *     sign-in — the trap UF-40 and UF-47 record on the delegate half.
 *
 * EVERY ASSERTION IS A NAMED FUNCTION IN `assertion` BELOW, CALLED BY BOTH THE
 * CHECK AND ITS NEGATIVE CONTROL. Recorded as the fix for the same defect found
 * twice in this sprint: a control that restates the claim it is vouching for
 * rather than calling it goes on passing after somebody rewrites the real
 * assertion, and a control that cannot fail is worse than no control because it
 * is counted as coverage.
 *
 * IT WRITES, SO IT NEVER GOES NEAR THE SHARED DATABASE. It copies
 * packages/db/prisma/dev.db to a temporary file, works only on the copy, and
 * refuses to run if the connection that actually opened is anything else — the
 * same guard, for the same reason, as test-canonical-account-restore.ts.
 *
 * USAGE
 *   pnpm test:sponsor-gate-demo
 */

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

// ─── Pick the database BEFORE importing anything that opens a connection ─────
//
// ../src/client.ts reads process.env at import time and prefers Turso whenever
// TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are both set. Both are cleared here,
// before the import, and the connection that actually opened is verified after.

const SOURCE_DB = resolve(__dirname, '..', 'prisma', 'dev.db')
if (!existsSync(SOURCE_DB)) {
  console.error(`[fatal] source database not found: ${SOURCE_DB}`)
  process.exit(2)
}

const WORK_DIR = mkdtempSync(join(tmpdir(), 'wbr-sponsor-gate-demo-'))
const WORK_DB = join(WORK_DIR, 'test-copy.db')
copyFileSync(SOURCE_DB, WORK_DB)

delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
process.env.DATABASE_URL = `file:${WORK_DB}`

import { prisma, dbConnectionMode } from '../src/client'
import { ensureCanonicalTestAccount, CANONICAL_TEST_ACCOUNTS } from '../src/test-accounts'
import {
  GATE_DEMO_SPONSOR,
  GATE_DEMO_SPONSOR_ID,
  GATE_DEMO_SPONSOR_PINNED,
} from '../src/gate-demo-sponsor'
import {
  SPONSOR_REQUIRED_ITEMS,
  missingSponsorItems,
  type SponsorReadinessSubject,
} from '../src/onboarding-policy'
import {
  getCheckInBoard,
  getCompanyDirectory,
  getMeetingRequirementSettings,
  requiredMeetingsForSponsor,
  saveMeetingRequirementSettings,
} from '../src/meeting-engine'

const SPONSOR_DEMO_EMAIL = 'sponsor-onboarding-demo@test.com'
const REAL_SPONSOR_EMAIL = 'sponsor@test.com'
const DELEGATE_DEMO_EMAIL = 'onboarding-demo@test.com'
const PASSWORD = 'password123'
/** How many companies carry a booth number, and therefore appear on the drawn map. */
const EXPECTED_BOOTH_COMPANIES = 10

// ─── Harness ──────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ''))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * A negative control. Names the defect it recreates, runs it, and passes only
 * when the assertion the real check uses turns FALSE. It calls the same
 * function out of `assertion` that the real check calls, so rewriting that
 * function changes both together and this cannot silently stop covering it.
 */
function control(label: string, assertionHeldUnderDefect: boolean, detail = ''): void {
  check(`CONTROL — ${label} (the check must go red)`, assertionHeldUnderDefect === false, detail)
}

function section(title: string): void {
  console.log(`\n── ${title}`)
}

function assertLocalCopy(): void {
  const mode = dbConnectionMode
  const ok = mode.startsWith('sqlite: ') && mode.includes(WORK_DB)
  if (!ok) {
    console.error(`\n[fatal] refusing to run: expected a local SQLite copy at ${WORK_DB}`)
    console.error(`[fatal] the client reports: ${mode}`)
    console.error('[fatal] this test writes, and must never write to a shared database')
    cleanup()
    process.exit(2)
  }
  console.log(`connection: ${mode}`)
}

function cleanup(): void {
  try {
    rmSync(WORK_DIR, { recursive: true, force: true })
  } catch {
    /* the temporary directory is disposable; failing to remove it is not a result */
  }
}

// ─── Reading ──────────────────────────────────────────────────────────────────

type CompanyRow = Record<string, unknown>

/**
 * EVERY scalar column on the row, not a chosen subset.
 *
 * This started as a nine-column `select` and that was a real defect, found by
 * adversarial review: a restore that wrote `contactPhone`, `tier`,
 * `tableNumber`, `headquarters` or any of the other columns it omitted would
 * have left every "unchanged" assertion in this file passing. A subset chosen
 * by the person writing the test can only ever catch the damage that person
 * already thought of. Reading the whole row costs nothing here and cannot be
 * out of date with the schema.
 *
 * Round-tripped through JSON so `createdAt` becomes a comparable string; the
 * comparison below is on canonical JSON with sorted keys, so it does not depend
 * on Prisma returning columns in a stable order either.
 */
async function readCompany(id: string): Promise<CompanyRow> {
  const row = await prisma.sponsor.findUnique({ where: { id } })
  if (!row) throw new Error(`company row missing for ${id}`)
  return JSON.parse(JSON.stringify(row)) as CompanyRow
}

/** Key-order-independent comparable form. */
function canonical(row: CompanyRow): string {
  return JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(k => [k, row[k] ?? null])))
}

/**
 * Count every call the code under test makes against the Sponsor model, with
 * the id each one names.
 *
 * The containment property is "never READ and never WRITTEN", and comparing
 * rows before and after can only ever demonstrate the second half. A restore
 * that read a real company's row and then decided against writing it would have
 * satisfied every value comparison in this file while still violating the
 * property the early return exists to guarantee.
 *
 * The module under test holds its own reference to the shared `prisma` object,
 * so wrapping the methods on that object is what reaches it — an extended or
 * re-created client would not be the client it calls.
 */
function spyOnSponsorCalls(): { calls: { op: string; id: unknown }[]; restore: () => void } {
  const calls: { op: string; id: unknown }[] = []
  const model = prisma.sponsor as unknown as Record<string, (...a: unknown[]) => unknown>
  const originals: Record<string, (...a: unknown[]) => unknown> = {}
  for (const op of ['findUnique', 'findFirst', 'findMany', 'update', 'updateMany', 'upsert', 'create', 'delete']) {
    const original = model[op]
    if (typeof original !== 'function') continue
    originals[op] = original
    model[op] = (...args: unknown[]) => {
      const arg = args[0] as { where?: { id?: unknown } } | undefined
      calls.push({ op, id: arg?.where?.id })
      return original.apply(prisma.sponsor, args)
    }
  }
  return {
    calls,
    restore: () => {
      for (const [op, original] of Object.entries(originals)) model[op] = original
    },
  }
}

/** The gate's own verdict on a company, as the list of missing item keys. */
async function missingItemKeys(id: string): Promise<string[]> {
  const row = await prisma.sponsor.findUnique({
    where: { id },
    include: { _count: { select: { users: true } } },
  })
  if (!row) throw new Error(`company row missing for ${id}`)
  const subject = { ...row, attachedUserCount: row._count.users } as unknown as SponsorReadinessSubject
  return missingSponsorItems(subject, SPONSOR_REQUIRED_ITEMS).map(item => item.key)
}

// ─── The assertions, named once and called by both a check and a control ─────

const assertion = {
  /** The company is short its contact, which is what the gate blocks it on. */
  contactIsEmpty: (row: CompanyRow): boolean => row.contactName === null && row.contactEmail === null,

  /** The gate itself agrees, and names the contact item specifically. */
  gateBlocksOnContactOnly: (missing: string[]): boolean =>
    missing.length === 1 && missing[0] === 'contact',

  /** No write was performed. */
  noWrite: (wrote: boolean): boolean => wrote === false,

  /** A write WAS performed. */
  didWrite: (wrote: boolean): boolean => wrote === true,

  /** Every column outside the pin is byte-for-byte what it was. */
  onlyPinnedColumnsChanged: (before: CompanyRow, after: CompanyRow): boolean => {
    const pinned = new Set(Object.keys(GATE_DEMO_SPONSOR_PINNED))
    const columns = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...columns]
      .filter(column => !pinned.has(column))
      .every(column => (before[column] ?? null) === (after[column] ?? null))
  },

  /** A company row is untouched across an action. Used for Tailor ERP. */
  companyUnchanged: (before: CompanyRow, after: CompanyRow): boolean =>
    canonical(before) === canonical(after),

  /** The Sponsor model was never touched at all for this id. */
  companyNeverTouched: (calls: { op: string; id: unknown }[], id: string): boolean =>
    calls.every(call => call.id !== id),

  /** The demonstration company does not exhibit, so the drawn map is unaffected. */
  noBoothNumber: (row: CompanyRow): boolean => row.boothNumber === null,

  /** The count of booth-carrying companies the floor-plan layout reads. */
  boothCompanyCountUnchanged: (count: number): boolean => count === EXPECTED_BOOTH_COMPANIES,

  /** The per-company meeting requirement override. */
  requirementIsZero: (required: number): boolean => required === 0,

  /** A company row does not exist. */
  companyAbsent: (row: unknown): boolean => row === null,
}

// ─── The tests ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\nSponsor gate demonstration account and company — acceptance test')
  console.log(`working copy: ${WORK_DB}`)
  assertLocalCopy()

  const pinned = CANONICAL_TEST_ACCOUNTS.filter(a => a.restoreSponsorCompany)
  const unpinned = CANONICAL_TEST_ACCOUNTS.filter(a => !a.restoreSponsorCompany)
  const demoDef = CANONICAL_TEST_ACCOUNTS.find(a => a.email === SPONSOR_DEMO_EMAIL)
  const realSponsorDef = CANONICAL_TEST_ACCOUNTS.find(a => a.email === REAL_SPONSOR_EMAIL)

  if (!demoDef) throw new Error(`${SPONSOR_DEMO_EMAIL} is not in CANONICAL_TEST_ACCOUNTS`)
  if (!realSponsorDef) throw new Error(`${REAL_SPONSOR_EMAIL} is not in CANONICAL_TEST_ACCOUNTS`)
  if (!realSponsorDef.sponsorId) throw new Error(`${REAL_SPONSOR_EMAIL} has no company link to probe`)

  // ── 0. Which accounts carry the company pin ────────────────────────────────
  section('0. Exactly one account carries the company pin')

  check(
    'exactly one canonical account carries restoreSponsorCompany',
    pinned.length === 1,
    `carrying it: [${pinned.map(a => a.email).join(', ') || 'none'}]`,
  )
  check(
    'it is the sponsor gate demonstration account',
    pinned.length === 1 && pinned[0].email === SPONSOR_DEMO_EMAIL,
    `got ${pinned[0]?.email ?? 'none'}`,
  )
  check(
    'it is attached to the gate demonstration company and to nothing else',
    demoDef.sponsorId === GATE_DEMO_SPONSOR_ID,
    `got ${demoDef.sponsorId}`,
  )
  check(
    'the account that is attached to a REAL company carries no pin',
    unpinned.some(a => a.email === REAL_SPONSOR_EMAIL),
    `${REAL_SPONSOR_EMAIL} carries a pin, which would write a real exhibiting company`,
  )

  // ── 1. The company is incomplete, and the gate agrees ──────────────────────
  section('1. The demonstration company is short its contact, and the gate blocks on it')

  const seeded = await readCompany(GATE_DEMO_SPONSOR_ID)
  check('the company holds neither a contact name nor a contact email', assertion.contactIsEmpty(seeded), JSON.stringify({ contactName: seeded.contactName, contactEmail: seeded.contactEmail }))

  const seededMissing = await missingItemKeys(GATE_DEMO_SPONSOR_ID)
  check(
    'the gate reports exactly one missing required item, and it is the contact',
    assertion.gateBlocksOnContactOnly(seededMissing),
    `missing: [${seededMissing.join(', ')}]`,
  )
  control(
    'a company whose contact is filled in is no longer blocked',
    assertion.gateBlocksOnContactOnly(
      await (async () => {
        await prisma.sponsor.update({
          where: { id: GATE_DEMO_SPONSOR_ID },
          data: { contactName: 'Filled By Hand', contactEmail: 'filled@example.com' },
        })
        const keys = await missingItemKeys(GATE_DEMO_SPONSOR_ID)
        return keys
      })(),
    ),
    'with a contact present the gate must report nothing missing',
  )

  // ── 2. A hand-completed contact is restored on the next sign-in ────────────
  section('2. A contact completed by hand is put back on the next sign-in')

  const completed = await readCompany(GATE_DEMO_SPONSOR_ID)
  check(
    'precondition: the previous control left the contact filled',
    completed.contactName === 'Filled By Hand' && completed.contactEmail === 'filled@example.com',
    JSON.stringify({ contactName: completed.contactName, contactEmail: completed.contactEmail }),
  )

  const wroteOnCompleted = await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)
  const restored = await readCompany(GATE_DEMO_SPONSOR_ID)

  check('a write IS performed when the company has been completed', assertion.didWrite(wroteOnCompleted))
  check('the contact is back to empty', assertion.contactIsEmpty(restored), JSON.stringify({ contactName: restored.contactName, contactEmail: restored.contactEmail }))
  check(
    'the gate blocks on the contact again',
    assertion.gateBlocksOnContactOnly(await missingItemKeys(GATE_DEMO_SPONSOR_ID)),
  )

  // ── 3. Only the pinned columns are written ─────────────────────────────────
  section('3. The restore writes the pinned columns and nothing else')

  await prisma.sponsor.update({
    where: { id: GATE_DEMO_SPONSOR_ID },
    data: {
      contactName: 'Filled Again',
      contactEmail: 'again@example.com',
      // Values no definition holds, so a wider write is visible rather than
      // coincidentally equal to what it would have written anyway.
      tagline: 'EDITED BY HAND — must survive the restore',
      description: 'EDITED BY HAND — a description longer than twenty characters, so the gate is not blocked on it.',
      website: 'https://edited-by-hand.example.com',
    },
  })
  const beforeNarrow = await readCompany(GATE_DEMO_SPONSOR_ID)
  const wroteNarrow = await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)
  const afterNarrow = await readCompany(GATE_DEMO_SPONSOR_ID)

  check('the restore fired', assertion.didWrite(wroteNarrow))
  check('the contact is empty again', assertion.contactIsEmpty(afterNarrow))
  check(
    'every column outside the pin is exactly what it was',
    assertion.onlyPinnedColumnsChanged(beforeNarrow, afterNarrow),
    `tagline ${JSON.stringify(afterNarrow.tagline)}, description ${JSON.stringify(afterNarrow.description)}, website ${JSON.stringify(afterNarrow.website)}`,
  )
  control(
    'a restore that also rewrote the tagline would be caught',
    assertion.onlyPinnedColumnsChanged(beforeNarrow, { ...afterNarrow, tagline: GATE_DEMO_SPONSOR.tagline }),
    'putting the definition tagline back must fail the narrow-write check',
  )

  // Put the hand-edited content back to the definition so later sections start
  // from the seeded state.
  await prisma.sponsor.update({
    where: { id: GATE_DEMO_SPONSOR_ID },
    data: {
      tagline: GATE_DEMO_SPONSOR.tagline,
      description: GATE_DEMO_SPONSOR.description,
      website: GATE_DEMO_SPONSOR.website,
    },
  })

  // ── 4. The restore settles ─────────────────────────────────────────────────
  section('4. The restore settles — the sign-ins after it write nothing')

  const settle1 = await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)
  const settle2 = await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)
  const settle3 = await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)

  check(
    'three consecutive sign-ins on an already-blocked company write nothing',
    assertion.noWrite(settle1) && assertion.noWrite(settle2) && assertion.noWrite(settle3),
    `writes were [${settle1}, ${settle2}, ${settle3}] — any true means it writes on every sign-in forever`,
  )
  control(
    'a pin naming a column the restore does not settle would write every time',
    assertion.noWrite(
      await (async () => {
        // Point the pin at a value the write cannot produce. `contactName` is
        // pinned to null; asking for a value the update sets and the read then
        // disagrees with is not reachable, so this recreates the shape instead:
        // an extra pinned column whose stored value is deliberately different.
        const original = demoDef.restoreSponsorCompany
        ;(demoDef as { restoreSponsorCompany?: unknown }).restoreSponsorCompany = {
          ...GATE_DEMO_SPONSOR_PINNED,
          tagline: 'A TAGLINE THE ROW DOES NOT HOLD',
        }
        await prisma.sponsor.update({
          where: { id: GATE_DEMO_SPONSOR_ID },
          data: { tagline: GATE_DEMO_SPONSOR.tagline },
        })
        const wrote = await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)
        ;(demoDef as { restoreSponsorCompany?: unknown }).restoreSponsorCompany = original
        await prisma.sponsor.update({
          where: { id: GATE_DEMO_SPONSOR_ID },
          data: { tagline: GATE_DEMO_SPONSOR.tagline },
        })
        return wrote
      })(),
    ),
    'a pinned column that disagrees with the row must produce a write',
  )

  // ── 5. CONTAINMENT, OUTWARD: a real company is never touched ───────────────
  section('5. Containment — an account with no pin never writes its company')

  const TAILOR_ID = realSponsorDef.sponsorId
  // A value no definition anywhere holds, so "unchanged" cannot be true by
  // coincidence — this is the defect UF-44 recorded, where a comparison passed
  // because a leak would have written exactly what was already stored.
  await prisma.sponsor.update({
    where: { id: TAILOR_ID },
    data: { contactName: 'DISTINCTIVE CONTACT — MUST SURVIVE', contactEmail: 'distinctive@example.com' },
  })
  const tailorBefore = await readCompany(TAILOR_ID)

  // The spy goes on for the sign-ins only, so the reads this test performs
  // itself are not counted against the code under test.
  const spy = spyOnSponsorCalls()
  const realSignIns: boolean[] = []
  for (let i = 0; i < 5; i++) realSignIns.push(await ensureCanonicalTestAccount(REAL_SPONSOR_EMAIL, PASSWORD))
  spy.restore()
  const tailorAfter = await readCompany(TAILOR_ID)

  check(
    'five sign-ins as the real sponsor account perform no write at all',
    realSignIns.every(assertion.noWrite),
    `writes were [${realSignIns.join(', ')}]`,
  )
  check(
    'the real exhibiting company is never READ, let alone written',
    assertion.companyNeverTouched(spy.calls, TAILOR_ID),
    `Sponsor calls naming it: ${JSON.stringify(spy.calls.filter(c => c.id === TAILOR_ID))}`,
  )
  check(
    'every column of the real exhibiting company is unchanged',
    assertion.companyUnchanged(tailorBefore, tailorAfter),
    `before ${canonical(tailorBefore)} after ${canonical(tailorAfter)}`,
  )
  // THE SPY'S OWN LIVENESS. "Zero calls naming Tailor ERP" is only evidence if
  // the spy would have seen a call had one been made. Proven by running the
  // same spy over an action that certainly does touch a Sponsor row — the
  // flagged account's own sign-in, which reads and writes the demonstration
  // company — rather than by asserting something about the spy that is true
  // whatever it did.
  await prisma.sponsor.update({
    where: { id: GATE_DEMO_SPONSOR_ID },
    data: { contactName: 'Filled', contactEmail: 'filled@example.com' },
  })
  const livenessSpy = spyOnSponsorCalls()
  await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)
  livenessSpy.restore()

  check(
    'the spy is live: the same instrumentation records a read AND a write of the demonstration company',
    livenessSpy.calls.some(c => c.id === GATE_DEMO_SPONSOR_ID && c.op === 'findUnique') &&
      livenessSpy.calls.some(c => c.id === GATE_DEMO_SPONSOR_ID && c.op === 'update'),
    `observed: ${JSON.stringify(livenessSpy.calls)}`,
  )
  check(
    'and that same run named no company other than the demonstration one',
    livenessSpy.calls.every(c => c.id === undefined || c.id === GATE_DEMO_SPONSOR_ID),
    `observed: ${JSON.stringify(livenessSpy.calls)}`,
  )
  check(
    'and it still holds the distinctive value, so "unchanged" is not vacuous',
    tailorAfter.contactName === 'DISTINCTIVE CONTACT — MUST SURVIVE',
    `got ${JSON.stringify(tailorAfter.contactName)}`,
  )
  control(
    'giving the real sponsor account a pin would rewrite a real company',
    await (async () => {
      const original = realSponsorDef.restoreSponsorCompany
      ;(realSponsorDef as { restoreSponsorCompany?: unknown }).restoreSponsorCompany =
        GATE_DEMO_SPONSOR_PINNED
      const leakBefore = await readCompany(TAILOR_ID)
      await ensureCanonicalTestAccount(REAL_SPONSOR_EMAIL, PASSWORD)
      const leakAfter = await readCompany(TAILOR_ID)
      ;(realSponsorDef as { restoreSponsorCompany?: unknown }).restoreSponsorCompany = original
      await prisma.sponsor.update({
        where: { id: TAILOR_ID },
        data: {
          contactName: (leakBefore.contactName ?? null) as string | null,
          contactEmail: (leakBefore.contactEmail ?? null) as string | null,
        },
      })
      return assertion.companyUnchanged(leakBefore, leakAfter)
    })(),
    'with a pin present the real company must change, proving the containment check can fail',
  )

  // ── 6. CONTAINMENT, INWARD: the delegate demo account writes no company ────
  section('6. Containment — the delegate demonstration account touches no company')

  // The row may not exist, and that is not a fault in this phase — UF-63: the
  // seed upserts canonical accounts by email but deletes by id, so an account
  // whose stored row was created by the backfill script rather than by the seed
  // is updated and then removed in the same run. Its registry entry recreates
  // it on the next password sign-in, which is exactly what this call is. Doing
  // it through the real function rather than a hand-written insert also means
  // this section starts from the state a sign-in actually produces.
  const delegateExisted = await prisma.user.findUnique({
    where: { email: DELEGATE_DEMO_EMAIL },
    select: { id: true },
  })
  if (!delegateExisted) {
    await ensureCanonicalTestAccount(DELEGATE_DEMO_EMAIL, PASSWORD)
    console.log(`  note: ${DELEGATE_DEMO_EMAIL} was absent and was recreated by its registry entry (UF-63)`)
  }
  check(
    'the delegate demonstration account exists, or its registry entry recreated it',
    (await prisma.user.findUnique({ where: { email: DELEGATE_DEMO_EMAIL }, select: { id: true } })) !== null,
    'ensureCanonicalTestAccount did not produce a row',
  )

  const delegateProbeBefore = await readCompany(GATE_DEMO_SPONSOR_ID)
  await prisma.user.update({
    where: { email: DELEGATE_DEMO_EMAIL },
    data: { solutionsSeeking: JSON.stringify(['AI & Automation']) },
  })
  const delegateWrote = await ensureCanonicalTestAccount(DELEGATE_DEMO_EMAIL, PASSWORD)
  const delegateProbeAfter = await readCompany(GATE_DEMO_SPONSOR_ID)

  check(
    'its own restore still fires (the probe is live, not a no-op)',
    assertion.didWrite(delegateWrote),
  )
  check(
    'and no company row is written by it',
    assertion.companyUnchanged(delegateProbeBefore, delegateProbeAfter),
  )

  // ── 7. A wrong password writes nothing, on either mechanism ────────────────
  section('7. A wrong password is a no-op for the company too')

  await prisma.sponsor.update({
    where: { id: GATE_DEMO_SPONSOR_ID },
    data: { contactName: 'Filled By Hand', contactEmail: 'filled@example.com' },
  })
  const wrongPwBefore = await readCompany(GATE_DEMO_SPONSOR_ID)
  const wroteOnWrongPw = await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, 'not-the-password')
  const wrongPwAfter = await readCompany(GATE_DEMO_SPONSOR_ID)

  check('a wrong password performs no write', assertion.noWrite(wroteOnWrongPw))
  check(
    'the completed contact is left exactly as it was',
    assertion.companyUnchanged(wrongPwBefore, wrongPwAfter),
    `before ${JSON.stringify(wrongPwBefore.contactName)} after ${JSON.stringify(wrongPwAfter.contactName)}`,
  )
  // Restore for the sections below.
  await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)

  // ── 8. A missing company is a no-op, not a crash and not a create ──────────
  section('8. A deleted company is a no-op — the sign-in path never creates one')

  const savedCompany = await prisma.sponsor.findUnique({ where: { id: GATE_DEMO_SPONSOR_ID } })
  if (!savedCompany) throw new Error('cannot run section 8: the demonstration company is missing')

  // Deleting a Sponsor is not a scalar-only operation: SponsorMeeting and
  // SubmissionForm cascade, and MeetingRequest.targetSponsorId and Pin.sponsorId
  // are set to null. This section restores the scalar row and nothing else, so
  // it is only sound while the demonstration company has no dependents. That is
  // asserted rather than assumed — if future seed data ever gives this company a
  // pin, a form, a meeting or a request, this check goes red and says so
  // instead of quietly running sections 9 and 10 against a damaged copy.
  // `users` is counted too, and it is the one that is easy to forget:
  // User.sponsorId is onDelete SetNull, so deleting the company silently
  // detaches every representative attached to it — including the demonstration
  // account itself, whose link this section clears deliberately just below. A
  // second representative would be detached and never reattached, and the
  // "recreated row identical" assertion would still pass, because it only
  // compares the company's own columns.
  const dependents = {
    meetings: await prisma.sponsorMeeting.count({ where: { sponsorId: GATE_DEMO_SPONSOR_ID } }),
    requests: await prisma.meetingRequest.count({ where: { targetSponsorId: GATE_DEMO_SPONSOR_ID } }),
    forms: await prisma.submissionForm.count({ where: { sponsorId: GATE_DEMO_SPONSOR_ID } }),
    pins: await prisma.pin.count({ where: { sponsorId: GATE_DEMO_SPONSOR_ID } }),
    otherUsers: await prisma.user.count({
      where: { sponsorId: GATE_DEMO_SPONSOR_ID, email: { not: SPONSOR_DEMO_EMAIL } },
    }),
  }
  const dependentTotal = Object.values(dependents).reduce((a, b) => a + b, 0)
  check(
    'the demonstration company has no dependent rows, so deleting and recreating it is lossless',
    dependentTotal === 0,
    `${JSON.stringify(dependents)} — this section would destroy them; snapshot and restore them, or skip it`,
  )
  if (dependentTotal !== 0) {
    console.log('  skipping the rest of section 8 rather than destroying dependent rows')
  } else {

  // The account holds a foreign key to it, so the link is cleared first.
  await prisma.user.update({ where: { email: SPONSOR_DEMO_EMAIL }, data: { sponsorId: null } })
  await prisma.sponsor.delete({ where: { id: GATE_DEMO_SPONSOR_ID } })

  let threw = false
  let wroteWithoutCompany = false
  try {
    wroteWithoutCompany = await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)
  } catch {
    threw = true
  }
  const afterMissing = await prisma.sponsor.findUnique({ where: { id: GATE_DEMO_SPONSOR_ID } })

  check('the sign-in path does not throw when the company is gone', threw === false)
  check(
    'and it does not create the company',
    assertion.companyAbsent(afterMissing),
    afterMissing ? 'a Sponsor row was created from the sign-in path' : '',
  )
  check(
    'the user row itself is still repaired (its company link was cleared, so it is unhealthy)',
    assertion.didWrite(wroteWithoutCompany),
  )

  // The boolean alone is not the postcondition. A `true` return says a write
  // happened, not that the right one did — the function could have rewritten
  // some unrelated field and returned true just the same. So the row is read
  // and its state asserted directly.
  const userAfterMissing = await prisma.user.findUnique({
    where: { email: SPONSOR_DEMO_EMAIL },
    select: { role: true, name: true, sponsorId: true, company: true },
  })
  check(
    'the repaired row holds the definition role and name',
    userAfterMissing?.role === demoDef.role && userAfterMissing?.name === demoDef.name,
    `got ${JSON.stringify(userAfterMissing)}`,
  )
  check(
    'and its company link is null, because the fallback drops a link to a company that does not exist',
    (userAfterMissing?.sponsorId ?? null) === null,
    `got ${JSON.stringify(userAfterMissing?.sponsorId)} — a dangling foreign key would be worse than a null one`,
  )

  // Put the company and the link back.
  const { id: _id, conferenceId, ...restored8 } = savedCompany as unknown as Record<string, unknown> & {
    id: string
    conferenceId: string
  }
  await prisma.sponsor.create({
    data: { id: GATE_DEMO_SPONSOR_ID, conferenceId, ...(restored8 as object) } as never,
  })
  await ensureCanonicalTestAccount(SPONSOR_DEMO_EMAIL, PASSWORD)

  // The recreate must be lossless, or sections 9 and 10 measure a row that is
  // not the one the seed produced. Compared against the snapshot taken before
  // the delete, every column.
  check(
    'the recreated company is identical to the row that was deleted',
    assertion.companyUnchanged(
      JSON.parse(JSON.stringify(savedCompany)) as CompanyRow,
      await readCompany(GATE_DEMO_SPONSOR_ID),
    ),
    'the delete-and-recreate lost or changed a column',
  )
  }

  // ── 9. It does not exhibit, and the drawn map is unaffected ────────────────
  section('9. The demonstration company carries no booth number')

  const finalCompany = await readCompany(GATE_DEMO_SPONSOR_ID)
  check('it holds no booth number', assertion.noBoothNumber(finalCompany), `got ${JSON.stringify(finalCompany.boothNumber)}`)

  const boothCount = await prisma.sponsor.count({
    where: { AND: [{ boothNumber: { not: null } }, { boothNumber: { not: '' } }] },
  })
  check(
    `the number of booth-carrying companies the floor-plan layout reads is still ${EXPECTED_BOOTH_COMPANIES}`,
    assertion.boothCompanyCountUnchanged(boothCount),
    `got ${boothCount} — a different count changes layoutBooths() and moves every marker off the drawn map (UF-60)`,
  )
  control(
    'an eleventh booth-carrying company would be caught',
    await (async () => {
      // A REAL mutation rather than `boothCount + 1`. Adding one to the number
      // proves only that the assertion function rejects 11; it says nothing
      // about whether the query would return 11. This gives the demonstration
      // company a booth number, re-runs the same query, and puts it back.
      await prisma.sponsor.update({
        where: { id: GATE_DEMO_SPONSOR_ID },
        data: { boothNumber: 'Z-99' },
      })
      const inflated = await prisma.sponsor.count({
        where: { AND: [{ boothNumber: { not: null } }, { boothNumber: { not: '' } }] },
      })
      await prisma.sponsor.update({
        where: { id: GATE_DEMO_SPONSOR_ID },
        data: { boothNumber: null },
      })
      return assertion.boothCompanyCountUnchanged(inflated)
    })(),
    'the count query must return 11 when the demonstration company exhibits',
  )

  // ── 10. Its meeting requirement is zero ────────────────────────────────────
  section('10. The per-company meeting requirement is zero')

  const settings = await getMeetingRequirementSettings(prisma)
  const required = requiredMeetingsForSponsor(settings, GATE_DEMO_SPONSOR_ID)
  check(
    'the override reads back as zero',
    assertion.requirementIsZero(required),
    `got ${required}; the sponsor default is ${settings.sponsorDefaultRequired}`,
  )
  // The control below compares against a company with no override, which reads
  // the sponsor default. If that default were itself 0 the control could not
  // fail and would be counted as coverage while proving nothing — so the
  // precondition is asserted rather than left as a note in a message.
  check(
    'precondition: the sponsor default is not itself zero, so the control below can fail',
    settings.sponsorDefaultRequired !== 0,
    `sponsorDefaultRequired is ${settings.sponsorDefaultRequired}`,
  )
  control(
    'a company with no override reads the sponsor default instead of zero',
    assertion.requirementIsZero(requiredMeetingsForSponsor(settings, TAILOR_ID)),
    `Tailor ERP reads ${requiredMeetingsForSponsor(settings, TAILOR_ID)}, the default being ${settings.sponsorDefaultRequired}`,
  )

  // ── 11. The showtime screens are not diluted by its presence ──────────────
  section('11. The fill-rate figures the showtime screens read are unaffected')

  // Asserting "the meeting requirement is zero" is not the same as asserting
  // "the fill-rate figures are unchanged", which is what the acceptance
  // criterion says. These call the functions those screens actually read.
  const directory = await getCompanyDirectory(prisma)
  const demoRow = directory.find(r => r.id === GATE_DEMO_SPONSOR_ID)

  check('the demonstration company appears in the company directory', demoRow !== undefined)
  check(
    'its required meetings read zero and its fill rate reads complete, so it cannot drag an average down',
    demoRow?.requiredMeetings === 0 && demoRow?.fillRate === 1,
    `requiredMeetings ${demoRow?.requiredMeetings}, fillRate ${demoRow?.fillRate}`,
  )

  // ONE CONFIRMED MEETING HAS TO EXIST, or this proves nothing.
  //
  // getCheckInBoard builds its days only from time blocks that already hold a
  // confirmed meeting — `if (!slotMeetings?.length) continue` — and the seeded
  // database has zero confirmed meetings, because meetings come from a separate
  // seed. So the board is empty for every company, and "the demonstration
  // company is not in the open-slots list" was passing for the wrong reason
  // entirely. Caught by the non-empty guard below, which is the only reason
  // this is not still a hollow check.
  //
  // So one confirmed meeting is manufactured, for a REAL company, purely to
  // make a day exist. This runs on a temporary copy of the database.
  const aBlock = await prisma.timeBlock.findFirst({ select: { id: true } })
  const aBuyer = await prisma.user.findFirst({ where: { email: 'stephcurry@test.com' }, select: { id: true } })
  if (aBlock && aBuyer) {
    await prisma.sponsorMeeting.create({
      data: { sponsorId: TAILOR_ID, userId: aBuyer.id, timeBlockId: aBlock.id, status: 'CONFIRMED' },
    })
  }

  const board = await getCheckInBoard(prisma)
  const openSlotSponsorIds = board.days.flatMap(d => (d.openSlots ?? []).map(s => s.sponsorId))

  // The absence check below is only evidence if the list is not empty for every
  // company. Guarded rather than assumed — an empty board makes "not present"
  // true for the wrong reason, which is exactly what happened before the
  // meeting above was manufactured.
  check(
    'the showtime open-slots list is non-empty, so an absence from it means something',
    openSlotSponsorIds.length > 0,
    'no company appears in any day\'s open slots; the absence check below would be vacuous',
  )
  check(
    'the demonstration company is absent from the showtime open-slots list',
    openSlotSponsorIds.includes(GATE_DEMO_SPONSOR_ID) === false,
    `it appears ${openSlotSponsorIds.filter(id => id === GATE_DEMO_SPONSOR_ID).length} time(s)`,
  )
  control(
    'without the zero override it would be listed as needing meetings',
    await (async () => {
      await saveMeetingRequirementSettings(prisma, {
        sponsorOverrides: [{ sponsorId: GATE_DEMO_SPONSOR_ID, required: null }],
      })
      const withoutOverride = await getCheckInBoard(prisma)
      const ids = withoutOverride.days.flatMap(d => (d.openSlots ?? []).map(s => s.sponsorId))
      await saveMeetingRequirementSettings(prisma, {
        sponsorOverrides: [{ sponsorId: GATE_DEMO_SPONSOR_ID, required: 0 }],
      })
      return ids.includes(GATE_DEMO_SPONSOR_ID) === false
    })(),
    'removing the override must put it on the showtime list, or the override is not what keeps it off',
  )

  // ── 12. Nothing addressed to exhibitors can reach it ──────────────────────
  section('12. The reminder route has no recipient for this company')

  // An EmailLog row saying FAILED is written by the route itself, so it is not
  // independent evidence that no mail left the system — that is a claim about
  // the route's behaviour and it is asserted here against the route's source,
  // the same way an earlier phase's Group S asserts what each sign-in file
  // states rather than what a shared function returns.
  const remindSource = readFileSync(
    resolve(__dirname, '..', '..', '..', 'apps', 'web', 'app', 'api', 'sponsors', 'remind', 'route.ts'),
    'utf8',
  )
  check(
    'the reminder route takes its recipient from the company contact email and from nothing else',
    /const\s+to\s*=\s*sponsor\.contactEmail/.test(remindSource),
    'the recipient is no longer read from sponsor.contactEmail — this check and UF-11/UF-12 both need revisiting',
  )
  check(
    'and it passes that value straight to the mailer with no fallback address',
    /to:\s*to\s*\?\?\s*undefined/.test(remindSource),
    'a fallback recipient would mean a company with no contact could still be mailed',
  )
  check(
    'the route calls sendMail exactly once, so there is no second delivery path',
    (remindSource.match(/\.sendMail\s*\(/g) ?? []).length === 1,
    `found ${(remindSource.match(/\.sendMail\s*\(/g) ?? []).length} sendMail calls`,
  )
  check(
    'and it sets no cc or bcc recipient',
    /\bcc\s*:/.test(remindSource) === false && /\bbcc\s*:/.test(remindSource) === false,
    'a cc or bcc would be a recipient the contactEmail check does not cover',
  )
  check(
    'the route source contains no hard-coded email address to fall back to',
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(
      remindSource.replace(/sponsors\.wbr\.com/g, '').replace(/^\s*\/\/.*$/gm, ''),
    ) === false,
    'an address literal appears in the route; check whether it can become a recipient',
  )
  check(
    'and the demonstration company holds no contact email for it to use',
    (await readCompany(GATE_DEMO_SPONSOR_ID)).contactEmail === null,
  )

  // ── 13. The restore is wired into the path people actually sign in on ─────
  section('13. Every app\'s real password route calls the repair')

  // THE CHECK THAT WOULD HAVE CAUGHT UF-65, AND THE REASON IT EXISTS.
  //
  // Everything above calls `ensureCanonicalTestAccount()` directly. That proves
  // the function works and proves nothing about whether anything calls it. The
  // repair lived only in NextAuth's `authorize()`, while every app's login
  // screen posts to its own hand-rolled `/api/login`, which mints its own
  // session cookie and never went near it — so a gate demonstration account
  // completed during a rehearsal stayed completed through every sign-in a
  // person could actually perform, and neither demonstration worked.
  //
  // This is the same shape as the earlier phase's Group S: read what each
  // application's file actually says, rather than testing a shared function
  // with arguments the test supplies itself.
  const APPS = ['attendee', 'meetings', 'web', 'sponsor'] as const
  for (const app of APPS) {
    const routePath = resolve(__dirname, '..', '..', '..', 'apps', app, 'app', 'api', 'login', 'route.ts')
    const source = existsSync(routePath) ? readFileSync(routePath, 'utf8') : ''
    check(
      `${app}: /api/login calls ensureCanonicalTestAccount`,
      /ensureCanonicalTestAccount\s*\(/.test(source),
      source ? 'the route exists but never repairs a canonical account (UF-65)' : `no route file at ${routePath}`,
    )
    check(
      `${app}: it does so BEFORE reading the user row, so the row it reads is the repaired one`,
      source.indexOf('ensureCanonicalTestAccount(') > 0 &&
        source.indexOf('ensureCanonicalTestAccount(') < source.indexOf('prisma.user.findUnique'),
      'the repair runs after the lookup, so the first sign-in after a rehearsal still reads the stale row',
    )
  }

  // ── 14. Each login screen hands out the account it can demonstrate ────────
  section('14. The demonstration accounts are listed on the login screens')

  // WHY THIS IS A CHECK AND NOT A STYLE PREFERENCE. Each login screen carries a
  // hand-written "Demo accounts" panel, and its whole purpose is to hand out the
  // logins somebody is meant to sign in with. Both gate demonstration accounts
  // were missing from it — the delegate one since the phase that built it, the
  // sponsor one until it was reported from the deployed site. The account worked
  // perfectly and nobody reading the screen could tell it existed.
  //
  // Same shape as section 13: read what the screen actually says, rather than
  // trusting that whoever added an account remembered to advertise it.
  const PANELS: { app: string; file: string[]; account: string }[] = [
    { app: 'sponsor', file: ['apps', 'sponsor', 'app', 'login', 'page.tsx'], account: SPONSOR_DEMO_EMAIL },
    { app: 'meetings', file: ['apps', 'meetings', 'app', 'login', 'page.tsx'], account: DELEGATE_DEMO_EMAIL },
    { app: 'attendee', file: ['apps', 'attendee', 'app', 'login', 'LoginClient.tsx'], account: DELEGATE_DEMO_EMAIL },
  ]
  for (const panel of PANELS) {
    const path = resolve(__dirname, '..', '..', '..', ...panel.file)
    const source = existsSync(path) ? readFileSync(path, 'utf8') : ''
    check(
      `${panel.app}: the login screen has a demo accounts panel`,
      /Demo accounts/.test(source),
      `no panel found in ${path}`,
    )
    check(
      `${panel.app}: it lists ${panel.account}`,
      source.includes(panel.account),
      'the account exists but the screen that hands out demo logins does not mention it',
    )
    check(
      `${panel.app}: and says the account is deliberately incomplete`,
      /kept incomplete on purpose/.test(source),
      'a visitor signing in with it would be stuck on a checklist with no explanation',
    )
  }

  // ── Result ────────────────────────────────────────────────────────────────
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  process.exitCode = failed === 0 ? 0 : 1
}

main()
  .catch(err => {
    console.error(`\n[fatal] ${err?.message ?? err}`)
    process.exitCode = 2
  })
  .finally(async () => {
    await prisma.$disconnect()
    cleanup()
  })
