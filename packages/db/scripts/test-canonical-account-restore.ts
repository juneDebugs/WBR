/**
 * Acceptance test for the canonical-account self-repair, focused on the
 * gate demonstration account's restore.
 *
 * WHAT IS UNDER TEST
 * `ensureCanonicalTestAccount()` in ../src/test-accounts.ts. Every app's
 * NextAuth authorize() calls it before the credential check. Historically its
 * health check compared four things — the row exists, the password verifies,
 * the role matches, the company link matches — and no profile field, so a gate
 * demonstration account whose profile had been completed by hand stayed
 * completed and stopped demonstrating the onboarding gate.
 *
 * The account definitions may now carry `restoreRequiredFields`. For an account
 * that carries it, the health check ALSO compares the delegate required set, so
 * a hand-completed profile counts as unhealthy and the repair that already
 * exists puts the account back into its blocked state.
 *
 * THE CONTAINMENT PROPERTY IS THE POINT
 * The flag must not reach an account that does not carry it. Three of the four
 * canonical accounts do not, and one of them — stephcurry@test.com — already
 * stores a `solutionsSeeking` value that differs from its definition, so a leak
 * would visibly rewrite it. That account is therefore the sharpest available
 * probe and is used as one.
 *
 * WHY TYPESCRIPT RATHER THAN .mjs
 * The other test scripts in this repository talk to a running app over HTTP and
 * compute their expected values with raw SQL, so they need no package code. This
 * one must call the real function rather than a copy of it, and that function
 * imports the Prisma client through an extensionless relative path, which
 * defeats Node's type stripping. ts-node resolves it. See the purity note at the
 * top of ../src/onboarding-policy.ts for the same constraint stated from the
 * other side.
 *
 * NOT THE SAME THING AS `pnpm test:accounts`
 * scripts/test-test-accounts.mjs covers which apps each role may reach, that
 * every login path calls the access policy, and that the live database holds
 * the right accounts. It READS, and it reads the shared live database on
 * purpose. This one WRITES, so it must never go near that database: it copies
 * packages/db/prisma/dev.db to a temporary file, works only on the copy, and
 * refuses to run if the connection that actually opened is anything else — see
 * assertLocalCopy below.
 *
 * USAGE
 *   pnpm test:canonical-restore
 */

import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

// ─── Pick the database BEFORE importing anything that opens a connection ─────
//
// ../src/client.ts reads process.env at import time and prefers Turso whenever
// TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are both set. A test that only set
// DATABASE_URL would therefore write to the SHARED PRODUCTION DATABASE if those
// happened to be in the environment. Both are cleared here, before the import,
// and the connection that actually opened is verified afterwards.

const SOURCE_DB = resolve(__dirname, '..', 'prisma', 'dev.db')
if (!existsSync(SOURCE_DB)) {
  console.error(`[fatal] source database not found: ${SOURCE_DB}`)
  process.exit(2)
}

const WORK_DIR = mkdtempSync(join(tmpdir(), 'wbr-canonical-restore-'))
const WORK_DB = join(WORK_DIR, 'test-copy.db')
copyFileSync(SOURCE_DB, WORK_DB)

delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
process.env.DATABASE_URL = `file:${WORK_DB}`

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { prisma, dbConnectionMode } from '../src/client'
import { ensureCanonicalTestAccount, CANONICAL_TEST_ACCOUNTS } from '../src/test-accounts'
import { DELEGATE_REQUIRED_FIELDS } from '../src/onboarding-policy'

const GATE_DEMO_EMAIL = 'onboarding-demo@test.com'
const PASSWORD = 'password123'

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

function section(title: string): void {
  console.log(`\n── ${title}`)
}

/**
 * Refuse to run unless the connection that actually opened is the local copy.
 *
 * Checked against the reported connection mode rather than against the variable
 * that was set, because the variable is an intention and the mode is what
 * happened.
 */
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
    /* the temporary directory is disposable; a failure to remove it is not a test result */
  }
}

/** Every field this test ever compares, read straight from the database. */
const READ_SELECT = {
  name: true,
  jobTitle: true,
  company: true,
  companySize: true,
  annualRevenue: true,
  solutionsSeeking: true,
  solutionsOffering: true,
  image: true,
  role: true,
  sponsorId: true,
} as const

type ReadRow = Record<string, string | null>

async function read(email: string): Promise<ReadRow> {
  const row = await prisma.user.findUnique({ where: { email }, select: READ_SELECT })
  if (!row) throw new Error(`row missing for ${email}`)
  return row as unknown as ReadRow
}

/** The six delegate fields only, as a comparable string. */
function requiredSnapshot(row: ReadRow): string {
  return JSON.stringify(Object.fromEntries(DELEGATE_REQUIRED_FIELDS.map(f => [f, row[f] ?? null])))
}

// ─── The tests ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\nCanonical account restore — acceptance test')
  console.log(`working copy: ${WORK_DB}`)
  assertLocalCopy()

  const flagged = CANONICAL_TEST_ACCOUNTS.filter(a => (a as any).restoreRequiredFields)
  const unflagged = CANONICAL_TEST_ACCOUNTS.filter(a => !(a as any).restoreRequiredFields)

  section('Which accounts carry the restore flag')
  check(
    'exactly one canonical account carries the flag',
    flagged.length === 1,
    `carrying it: [${flagged.map(a => a.email).join(', ') || 'none'}]`,
  )
  check(
    'the flagged account is the gate demonstration account',
    flagged.length === 1 && flagged[0].email === GATE_DEMO_EMAIL,
    `got ${flagged[0]?.email ?? 'none'}`,
  )

  // ── 1. The blocked state is already healthy: no write, every sign-in ────────
  section('1. The account in its blocked state is healthy — no write on sign-in')

  await prisma.user.update({
    where: { email: GATE_DEMO_EMAIL },
    data: { solutionsSeeking: JSON.stringify([]) },
  })
  const beforeBlocked = await read(GATE_DEMO_EMAIL)
  const wroteWhenBlocked = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  const afterBlocked = await read(GATE_DEMO_EMAIL)

  check('no write is performed when the account is already blocked', wroteWhenBlocked === false)
  check(
    'the six required fields are unchanged',
    requiredSnapshot(beforeBlocked) === requiredSnapshot(afterBlocked),
  )
  check('solutionsSeeking is still the empty list', afterBlocked.solutionsSeeking === '[]')

  // ── 2. A hand-completed profile is restored ────────────────────────────────
  section('2. A profile completed by hand is put back into its blocked state')

  await prisma.user.update({
    where: { email: GATE_DEMO_EMAIL },
    data: { solutionsSeeking: JSON.stringify(['AI & Automation']) },
  })
  const completed = await read(GATE_DEMO_EMAIL)
  check(
    'precondition: the profile now holds a filled solutions list',
    completed.solutionsSeeking === JSON.stringify(['AI & Automation']),
  )

  const wroteWhenCompleted = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  const afterRestore = await read(GATE_DEMO_EMAIL)

  check('a write IS performed when the profile has been completed', wroteWhenCompleted === true)
  check(
    'solutionsSeeking is back to the empty list',
    afterRestore.solutionsSeeking === '[]',
    `got ${afterRestore.solutionsSeeking}`,
  )
  check('the other five required fields still match the definition', (() => {
    const def = CANONICAL_TEST_ACCOUNTS.find(a => a.email === GATE_DEMO_EMAIL)!
    return (
      afterRestore.name === def.name &&
      afterRestore.jobTitle === def.jobTitle &&
      afterRestore.company === def.company &&
      afterRestore.companySize === (def.companySize ?? null) &&
      afterRestore.annualRevenue === (def.annualRevenue ?? null)
    )
  })())

  // ── 3. The restore settles: it does not write on every sign-in ─────────────
  section('3. The restore settles — a second sign-in writes nothing')

  const wroteAgain = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  check('the sign-in immediately after a restore writes nothing', wroteAgain === false)

  const wroteThird = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  check('and neither does the one after that', wroteThird === false)

  // ── 4. The photograph is not compared ──────────────────────────────────────
  section('4. The photograph is not part of the comparison')

  // The definition holds a picture address while the row may hold nothing.
  // Comparing it would make the account permanently unhealthy and write on
  // every single sign-in, which is what this asserts cannot happen.
  await prisma.user.update({ where: { email: GATE_DEMO_EMAIL }, data: { image: null } })
  const wroteWithNullImage = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  const afterNullImage = await read(GATE_DEMO_EMAIL)

  check(
    'an absent photograph does not by itself trigger a write',
    wroteWithNullImage === false,
    'if this fails, the photograph is being compared and the account writes on every sign-in',
  )
  check('the photograph is left absent', afterNullImage.image === null)

  // ── 5. A restore does set the photograph — recorded, not incidental ────────
  section('5. When a restore does fire, it also sets the photograph')

  await prisma.user.update({
    where: { email: GATE_DEMO_EMAIL },
    data: { solutionsSeeking: JSON.stringify(['Personalization']) },
  })
  await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  const afterSecondRestore = await read(GATE_DEMO_EMAIL)
  const demoDef = CANONICAL_TEST_ACCOUNTS.find(a => a.email === GATE_DEMO_EMAIL)!

  check(
    'the photograph is written from the definition',
    afterSecondRestore.image === demoDef.image,
    `got ${afterSecondRestore.image === null ? 'null' : 'a value'}`,
  )
  check('and the account is blocked again', afterSecondRestore.solutionsSeeking === '[]')

  // ── 6. A wrong password changes nothing ────────────────────────────────────
  section('6. A wrong password changes nothing, even for the flagged account')

  await prisma.user.update({
    where: { email: GATE_DEMO_EMAIL },
    data: { solutionsSeeking: JSON.stringify(['B2B Commerce']) },
  })
  const beforeWrongPassword = await read(GATE_DEMO_EMAIL)
  const wroteOnWrongPassword = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, 'not-the-password')
  const afterWrongPassword = await read(GATE_DEMO_EMAIL)

  check('a wrong password performs no write', wroteOnWrongPassword === false)
  check(
    'the completed profile is left exactly as it was',
    requiredSnapshot(beforeWrongPassword) === requiredSnapshot(afterWrongPassword),
  )

  // Put it back for the containment checks below.
  await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)

  // ── 7. CONTAINMENT: the three other canonical accounts are untouched ───────
  section('7. Containment — the accounts without the flag are untouched')

  for (const def of unflagged) {
    const before = await read(def.email)
    const wrote = await ensureCanonicalTestAccount(def.email, def.password)
    const after = await read(def.email)

    check(`${def.email}: sign-in performs no write`, wrote === false)
    check(
      `${def.email}: the six required fields are byte-identical afterwards`,
      requiredSnapshot(before) === requiredSnapshot(after),
      `before=${requiredSnapshot(before)} after=${requiredSnapshot(after)}`,
    )
  }

  // ── 8. CONTAINMENT: an unflagged account that DIFFERS from its definition ──
  section('8. Containment — an unflagged account differing from its definition stays as it is')

  // stephcurry@test.com already stores one solutions entry where its definition
  // lists three, so this probe is real rather than manufactured. It is made
  // explicit anyway, so the test keeps working if that drift is ever repaired.
  const stephDef = CANONICAL_TEST_ACCOUNTS.find(a => a.email === 'stephcurry@test.com')!
  const divergent = JSON.stringify(['Returns Management'])
  await prisma.user.update({
    where: { email: stephDef.email },
    data: { solutionsSeeking: divergent },
  })

  const wroteSteph = await ensureCanonicalTestAccount(stephDef.email, stephDef.password)
  const stephAfter = await read(stephDef.email)

  check('an unflagged account differing from its definition triggers no write', wroteSteph === false)
  check(
    'its differing field is left exactly as it was',
    stephAfter.solutionsSeeking === divergent,
    `expected ${divergent}, got ${stephAfter.solutionsSeeking}`,
  )
  check(
    'and it was NOT overwritten with the definition value',
    stephAfter.solutionsSeeking !== stephDef.solutionsSeeking,
  )

  // ── 8b. A definition pinning a conditionally-written field to '' settles ───
  section('8b. A required field pinned to an empty string does not write on every sign-in')

  // The trap: buildData writes companySize / annualRevenue / solutionsSeeking
  // only when the definition's value is truthy. If the comparison did not skip
  // an empty pin, the account would be unhealthy forever and write every time.
  // No definition does this today; the next gate demonstration account is where
  // somebody reaches for it, so it is held down here.
  const pinnedDef = CANONICAL_TEST_ACCOUNTS.find(a => a.email === GATE_DEMO_EMAIL)!
  const originalCompanySize = pinnedDef.companySize
  ;(pinnedDef as { companySize?: string }).companySize = ''

  await prisma.user.update({
    where: { email: GATE_DEMO_EMAIL },
    data: { companySize: 'ENTERPRISE', solutionsSeeking: JSON.stringify([]) },
  })

  const firstWithEmptyPin = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  const secondWithEmptyPin = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  const thirdWithEmptyPin = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)

  check(
    'an empty pin on a conditionally-written field never writes',
    firstWithEmptyPin === false && secondWithEmptyPin === false && thirdWithEmptyPin === false,
    `writes were [${firstWithEmptyPin}, ${secondWithEmptyPin}, ${thirdWithEmptyPin}] — if any is true the account writes on every sign-in`,
  )

  ;(pinnedDef as { companySize?: string }).companySize = originalCompanySize
  await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)

  // ── 8c. A definition that pins nothing for a field settles too ─────────────
  section('8c. A required field the definition does not pin does not write on every sign-in')

  // The sibling of 8b, and it must use an UNCONDITIONALLY written field to test
  // anything. `companySize` would not do: the empty-pin guard already skips it,
  // so removing `if (wanted === undefined) continue` would change nothing and
  // the control would stay green. Measured — that is exactly what happened on
  // the first attempt at this test.
  //
  // `name` is written unconditionally by buildData, so only the undefined guard
  // stands between an unpinned name and a write on every sign-in. Prisma reads
  // `name: undefined` as "leave this column alone", so the write would never
  // satisfy the comparison it failed.
  //
  // The cast is needed because the interface types `name` as a required string.
  // That is the point: this is reachable only if somebody later makes it
  // optional, which is precisely when the guard earns its place.
  const originalName = pinnedDef.name
  ;(pinnedDef as { name?: string }).name = undefined as unknown as string

  await prisma.user.update({
    where: { email: GATE_DEMO_EMAIL },
    data: { name: 'Renamed By Hand', solutionsSeeking: JSON.stringify([]) },
  })

  const firstUnpinned = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  const secondUnpinned = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)
  const thirdUnpinned = await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)

  check(
    'an unpinned required field never writes',
    firstUnpinned === false && secondUnpinned === false && thirdUnpinned === false,
    `writes were [${firstUnpinned}, ${secondUnpinned}, ${thirdUnpinned}] — if any is true the account writes on every sign-in`,
  )
  check(
    'and the value the definition does not pin is left alone',
    (await read(GATE_DEMO_EMAIL)).name === 'Renamed By Hand',
    `expected the hand-set name to survive, got ${(await read(GATE_DEMO_EMAIL)).name}`,
  )

  ;(pinnedDef as { name?: string }).name = originalName
  await ensureCanonicalTestAccount(GATE_DEMO_EMAIL, PASSWORD)

  // ── 9. CONTAINMENT: an unflagged account left deliberately incomplete ──────
  section('9. Containment — an unflagged account with an incomplete profile is left incomplete')

  await prisma.user.update({
    where: { email: stephDef.email },
    data: { companySize: null, annualRevenue: null },
  })
  const wroteIncomplete = await ensureCanonicalTestAccount(stephDef.email, stephDef.password)
  const incompleteAfter = await read(stephDef.email)

  check('an incomplete unflagged account triggers no write', wroteIncomplete === false)
  check('its emptied fields stay empty', incompleteAfter.companySize === null && incompleteAfter.annualRevenue === null)

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
