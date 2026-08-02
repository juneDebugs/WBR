#!/usr/bin/env node
// Brings an existing database's exhibiting companies up to date with the values
// the booth card shows — tagline, website, booth number, logo and offerings.
//
//   node scripts/migrate-sponsor-card-fields.mjs              # REPORT ONLY
//   node scripts/migrate-sponsor-card-fields.mjs --apply      # write the changes
//   node scripts/migrate-sponsor-card-fields.mjs --local      # force local dev.db
//
// ── Why this script exists ───────────────────────────────────────────────────
//
// Finding F-10, 2026-08-02. Until Phase 9, packages/db/prisma/seed.ts upserted
// each exhibiting company with `update: { name, tier, logoUrl }`, so tagline,
// website and booth number were written when a row was first created and never
// corrected afterwards; solutionsOffering was never written to a company at all.
// The seed now writes the full set on both branches, which fixes any database
// built from scratch — but re-running a full seed against a database that
// already holds real data does far more than correct these six fields.
//
// This script does only the narrow thing: it updates the card's fields on
// companies that already exist, matched by id. It creates nothing and deletes
// nothing.
//
// ── Why it reports rather than writes unless told otherwise ──────────────────
//
// The deployed participant app and every Vercel preview read the SAME database.
// A write here is a live write to the data a demonstration will read. So the
// default is a per-field report of exactly what would change and on how many
// rows, and --apply is required to change anything. That is the opposite of the
// convention the other migrate scripts follow, and it is deliberate: those add
// a column or backfill a derived number, while this one overwrites content
// somebody may have edited by hand.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORCE_LOCAL = process.argv.includes('--local')
const APPLY = process.argv.includes('--apply')

const { SPONSOR_DEFS, sponsorCreateFields } = await import(
  join(ROOT, 'packages/db/prisma/seed-sponsors.ts')
)

// The fields this script is allowed to touch. `name` and `tier` are in the
// seed's written set but are left alone here: they are the two an organizer is
// most likely to have corrected in the admin app, and neither is part of what
// finding F-10 was about.
const FIELDS = ['tagline', 'website', 'description', 'logoUrl', 'boothNumber', 'solutionsOffering']

function readEnvLocal(app) {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps', app, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {
    // No file for this app is normal; the caller merges several.
  }
  return env
}

function openDb() {
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')
  const envLocal = { ...readEnvLocal('web'), ...readEnvLocal('meetings') }
  const url = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
  if (!FORCE_LOCAL && url && token && url.startsWith('libsql://')) {
    console.log('→ target: Turso', url.replace(/(libsql:\/\/[^.]+).*/, '$1…'))
    return { db: createClient({ url, authToken: token }), isLocal: false }
  }
  // WBR_DB_PATH points this at a specific database file. The Playwright suites
  // already take the same variable, so this follows the convention rather than
  // inventing one.
  //
  // It exists because of how this script was verified. Without it the only way
  // to exercise --apply is to write to a database something else is reading,
  // which is precisely the act the whole script is built to be careful about —
  // so the careful path was the one that could not be tested. Pointing it at a
  // copy makes the write path checkable without risking anything.
  const path = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
  const file = `file:${path}`
  console.log('→ target: local', file)
  return { db: createClient({ url: file }), isLocal: true }
}

const { db, isLocal } = openDb()

if (!isLocal && !APPLY) {
  console.log('  (reporting only — this is a shared database and --apply was not given)')
}

const changes = []
let missing = 0
let alreadyCorrect = 0

for (const def of SPONSOR_DEFS) {
  const res = await db.execute({
    sql: `SELECT id, name, ${FIELDS.map(f => `"${f}"`).join(', ')} FROM Sponsor WHERE id = ?`,
    args: [def.id],
  })
  if (res.rows.length === 0) {
    missing++
    console.log(`  – ${def.name}: no row with this id, skipped (this script creates nothing)`)
    continue
  }
  const row = res.rows[0]
  const want = sponsorCreateFields(def)

  // ── This script fills and corrects. It never erases. ────────────────────────
  //
  // Raised by Phase 9's adversarial review round 3 as a high finding, and it is
  // the most dangerous thing this script could have done.
  //
  // It walks every one of the twenty defined companies, not only the ten that
  // exhibit, and boothNumber is in FIELDS. For the ten that do not exhibit the
  // definition says boothNumber is null. So if an organizer assigns one of them
  // a stand in the live database — which is exactly what Phase 11's authoring
  // tool is for — this would quietly set it back to null, and that company
  // would vanish from the roster that scripts/seed-floor-plan.mjs and
  // scripts/build-floor-plan-maps.mjs read. A booth would disappear from the
  // hall because someone ran a script described as correcting taglines.
  //
  // The rule below: a field is only written when the definition HAS a value. A
  // database value that the definition does not account for is left alone and
  // reported, so the operator sees it rather than losing it.
  const isEmpty = v => v === null || v === undefined || String(v).trim() === ''

  const differing = []
  const wouldErase = []
  for (const f of FIELDS) {
    const have = row[f] ?? null
    const wantV = want[f] ?? null
    if (have === wantV) continue
    if (isEmpty(wantV) && !isEmpty(have)) {
      wouldErase.push({ field: f, have })
      continue
    }
    differing.push(f)
  }

  if (wouldErase.length > 0) {
    console.log(
      `  ! ${def.name}: leaving ${wouldErase.length} field(s) alone — the database has a value ` +
        `and the definition does not: ` +
        wouldErase.map(w => `${w.field}=${JSON.stringify(w.have)}`).join(', '),
    )
  }

  if (differing.length === 0) {
    alreadyCorrect++
    continue
  }
  changes.push({ def, row, differing, want })
}

console.log(
  `\n${SPONSOR_DEFS.length} companies defined: ` +
    `${alreadyCorrect} already correct, ${changes.length} would change, ${missing} not present.`,
)

if (changes.length > 0) {
  console.log('\nField by field, what would change:\n')
  for (const c of changes) {
    console.log(`  ${c.def.name}${c.def.boothNumber ? ` (stand ${c.def.boothNumber})` : ''}`)
    for (const f of c.differing) {
      const from = c.row[f] === null || c.row[f] === '' ? '(empty)' : String(c.row[f])
      const to = c.want[f] === null || c.want[f] === '' ? '(empty)' : String(c.want[f])
      console.log(`    ${f}:`)
      console.log(`      from ${from.length > 90 ? from.slice(0, 90) + '…' : from}`)
      console.log(`      to   ${to.length > 90 ? to.slice(0, 90) + '…' : to}`)
    }
    console.log('')
  }
}

if (!APPLY) {
  console.log(
    changes.length === 0
      ? 'Nothing to do.'
      : `Nothing was written. Re-run with --apply to make these ${changes.length} change(s).`,
  )
  process.exit(0)
}

// ── Why the writes go in one batch, and why the report is in a finally ───────
//
// Raised by Phase 9's adversarial review as a high finding. The first version
// updated one row at a time and verified only after the loop finished. A
// network or database failure partway through would leave earlier companies
// overwritten and later ones untouched, and the script would exit on the
// exception BEFORE printing anything — so the operator would be left with a
// shared database in a state nobody had described, after a command they were
// told reports what it does.
//
// Two changes. The writes go through client.batch(..., 'write'), which the
// libSQL client runs as a single transaction, so the whole set lands or none of
// it does. And the reconciliation below runs in a finally, so it prints whatever
// happened — including after a throw.
let written = 0
let writeError = null

try {
  // Only the fields this row actually needs, NOT the whole set. Writing the
  // whole set would put back the nulls the never-erase rule above just spared,
  // which would make that rule decorative.
  const statements = changes.map(c => {
    const want = sponsorCreateFields(c.def)
    return {
      sql: `UPDATE Sponsor SET ${c.differing.map(f => `"${f}" = ?`).join(', ')} WHERE id = ?`,
      args: [...c.differing.map(f => want[f] ?? null), c.def.id],
    }
  })
  if (statements.length > 0) {
    await db.batch(statements, 'write')
    written = statements.length
  }
} catch (e) {
  writeError = e
}

// Counted afterwards by RE-READING the database rather than trusting the loop.
// An UPDATE that matched no row and an UPDATE that worked are indistinguishable
// from the caller's side otherwise. This runs whether or not the write threw,
// which is the point: after a failure the operator most needs to know what the
// database actually holds now.
let stillWrong = 0
let unreadable = 0
for (const def of SPONSOR_DEFS) {
  let res
  try {
    res = await db.execute({
      sql: `SELECT ${FIELDS.map(f => `"${f}"`).join(', ')} FROM Sponsor WHERE id = ?`,
      args: [def.id],
    })
  } catch {
    unreadable++
    continue
  }
  if (res.rows.length === 0) continue
  const want = sponsorCreateFields(def)
  const isEmpty2 = v => v === null || v === undefined || String(v).trim() === ''
  // The same never-erase rule the write used. Judging the result against the
  // full field set would report a deliberately preserved database value as
  // "still wrong" and send the operator hunting for a fault that is a feature.
  const wrong = FIELDS.some(f => {
    const have = res.rows[0][f] ?? null
    const wantV = want[f] ?? null
    if (have === wantV) return false
    if (isEmpty2(wantV) && !isEmpty2(have)) return false
    return true
  })
  if (wrong) stillWrong++
}

console.log('')
if (writeError) {
  console.log(`The write FAILED: ${writeError.message}`)
  console.log('It was sent as a single transaction, so the expectation is that NO row changed.')
  console.log('The re-read below is what the database actually holds now — trust it over that expectation.')
} else {
  console.log(`Wrote ${written} row(s) in one transaction.`)
}

if (unreadable > 0) {
  console.log(`${unreadable} company(ies) could not be re-read, so their state is unknown.`)
}
console.log(
  stillWrong === 0
    ? `Re-read from the database: every defined company that exists now matches.`
    : `Re-read from the database: ${stillWrong} company(ies) still do not match.`,
)

process.exit(writeError || stillWrong > 0 || unreadable > 0 ? 1 : 0)
