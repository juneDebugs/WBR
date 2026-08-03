#!/usr/bin/env node
/**
 * Third opinion on Phase 10 finding 9 — the connection count is not the
 * delivery count.
 *
 *   node scripts/third-opinion-phase-10-listener-count.mjs
 *
 * Needs the participant app on 3001, production mode, build matching source.
 *
 * ── The finding ──────────────────────────────────────────────────────────────
 *
 * publish() returns how many listeners it successfully WROTE TO. The revalidate
 * route was returning that number under the name `listenersOnThisInstance`.
 * Those two quantities are the same whenever every write succeeds, and differ
 * exactly when a write fails — which is the case a reader of that field would
 * most want to distinguish. Found by negative control 5.
 *
 * The fix calls listenerCount() BEFORE publish(), reading the register's size
 * rather than the result of writing to it.
 *
 * ── Why this cannot be checked without breaking something ────────────────────
 *
 * From outside the app the two numbers are indistinguishable, because with
 * healthy connections they are equal. The only way to separate them is to make
 * a write fail. So this script is run TWICE, against two builds:
 *
 *   1. With publish() patched so the first listener throws — simulating a
 *      connection that died mid-write. Expected with the fix: the response
 *      reports every open connection, and the LOG reports one fewer delivered.
 *      Expected with the bug: the response reports one fewer than are open.
 *
 *   2. Against the unmodified build, to confirm the restore took.
 *
 * The patch and the rebuild are driven from outside this script; this script
 * only opens connections and reads the number back.
 */

import { DatabaseSync } from 'node:sqlite'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'package.json'))
const { chromium } = require('playwright')

const DB_PATH = process.env.WBR_DB_PATH ?? join(ROOT, 'packages/db/prisma/dev.db')
const BASE = process.env.ATTENDEE_BASE_URL ?? 'http://localhost:3001'
const PASSWORD = process.env.ATTENDEE_PASSWORD ?? 'password123'
const SCREENS = Number(process.env.SCREENS ?? 3)
const P = 'thirdop10c'

let pass = 0, fail = 0
const ok = m => { pass++; console.log(`  ✓ ${m}`) }
const no = (m, d = '') => { fail++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ''}`) }
const yes = (c, m, d = '') => (c ? ok(m) : no(m, d))

const SECRET = (() => {
  const txt = readFileSync(join(ROOT, 'apps/attendee/.env.local'), 'utf8')
  const m = txt.match(/^NEXTAUTH_SECRET=(.*)$/m)
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
})()
if (!SECRET) { console.error('Could not read NEXTAUTH_SECRET. Refusing to run.'); process.exit(2) }

const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA busy_timeout = 15000')

function cleanup() {
  db.prepare(`DELETE FROM User WHERE id LIKE '${P}%' OR email LIKE '${P}%'`).run()
}

async function revalidate() {
  const res = await fetch(`${BASE}/api/revalidate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: SECRET, tags: ['floor-plan'] }),
  })
  return res.json()
}

console.log('\n════════════════════════════════════════════════════════════')
console.log('  Third opinion — Phase 10 finding 9, connection count')
console.log(`  opening ${SCREENS} map screens`)
console.log('════════════════════════════════════════════════════════════')

cleanup()
const now = Date.now()
const { hashPassword } = await import(join(ROOT, 'packages/db/src/password.ts'))
const hash = await hashPassword(PASSWORD)
const EMAIL = `${P}-delegate@wbr.invalid`
db.prepare(`INSERT INTO User (id, email, name, role, password, jobTitle, company, companySize,
                              annualRevenue, solutionsSeeking, createdAt, updatedAt)
            VALUES (?, ?, 'TO-C Delegate', 'ATTENDEE', ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run(`${P}-delegate`, EMAIL, hash, 'Verifier', 'TO-C Ltd', 'MIDMARKET', '10M-50M',
       JSON.stringify(['Order Management']), now, now)

const browser = await chromium.launch()
const ctx = await browser.newContext()
try {
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"], input[name="email"]').first().fill(EMAIL)
  await page.locator('input[type="password"], input[name="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 60_000 })

  const before = (await revalidate()).listenersOnThisInstance
  console.log(`\n  connections before opening anything: ${before}`)

  const pages = [page]
  for (let i = 1; i < SCREENS; i++) pages.push(await ctx.newPage())
  await Promise.all(pages.map(p => p.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' }).catch(() => {})))

  // Wait for the register to settle rather than sleeping a fixed time.
  let count = before
  let settled = 0
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250)
    const n = (await revalidate()).listenersOnThisInstance
    if (n === count) { settled++; if (settled >= 3 && n >= before + SCREENS) break } else { settled = 0 }
    count = n
  }

  console.log(`  connections with ${SCREENS} map screens open: ${count}`)
  console.log(`\n  THE OBSERVATION THAT SEPARATES THE TWO NUMBERS:`)
  console.log(`    with the fix, this reports every OPEN connection      → ${before + SCREENS}`)
  console.log(`    with the bug, it reports only SUCCESSFUL writes       → ${before + SCREENS - 1} (when one write fails)`)
  console.log(`    observed                                              → ${count}\n`)

  yes(count === before + SCREENS,
    `the response reports all ${SCREENS} open connections, not the number written to`,
    `got ${count}, wanted ${before + SCREENS}. If this is exactly one short while a listener is patched to throw, the field is the DELIVERY count and finding 9 is NOT fixed.`)

  await ctx.close()
  let after = count
  for (let i = 0; i < 60 && after > before; i++) {
    await new Promise(r => setTimeout(r, 250))
    after = (await revalidate()).listenersOnThisInstance
  }
  yes(after === before, 'closing them releases every connection', `settled at ${after}, wanted ${before}`)
} catch (err) {
  no('the script ran to completion', String(err?.message ?? err).split('\n')[0])
  await ctx.close().catch(() => {})
} finally {
  cleanup()
  const left = db.prepare(`SELECT COUNT(*) AS n FROM User WHERE id LIKE '${P}%'`).get().n
  yes(left === 0, 'the disposable account was removed', `${left} left`)
  await browser.close()
  db.close()
  console.log('\n────────────────────────────────────────────────────────────')
  console.log(`  Results: ${pass} passed, ${fail} failed`)
  console.log('────────────────────────────────────────────────────────────')
  process.exit(fail === 0 ? 0 : 1)
}
