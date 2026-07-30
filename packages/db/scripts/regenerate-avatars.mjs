// Generates real-headshot avatars for users that had a broken photo or none.
//
// randomuser.me serves 100 men + 100 women verified portrait JPGs
// (/api/portraits/{men|women}/{0-99}.jpg). We hand each target user a UNIQUE
// photo from that pool (no repeats within the target set), gender-matched when
// the first name makes gender obvious, otherwise picked deterministically by a
// hash of the user id. Every assigned URL is verified 200 before it is written.
//
// Target set = users with no image at all, plus any user still on a URL that
// currently 404s, plus any ids passed via --include-file (a JSON array of ids
// or of {id} objects) — used to also re-roll users that were repaired onto a
// reused photo and should get their own unique headshot. Idempotent: re-running
// with no include-file only touches users that are genuinely broken/missing.
//
// Usage: node packages/db/scripts/regenerate-avatars.mjs [--dry] [--include-file <path>]

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')
const includeFlag = process.argv.indexOf('--include-file')
const INCLUDE_IDS = includeFlag !== -1
  ? new Set(JSON.parse(readFileSync(process.argv[includeFlag + 1], 'utf8')).map((x) => (typeof x === 'string' ? x : x.id)))
  : new Set()

const env = readFileSync(resolve(__dirname, '../../../apps/web/.env.local'), 'utf8')
const grab = (k) => env.match(new RegExp(`${k}=(.*)`))[1].trim()
const HTTP = grab('TURSO_DATABASE_URL').replace(/^libsql:\/\//, 'https://')
const TOKEN = grab('TURSO_AUTH_TOKEN')

async function turso(stmts) {
  const r = await fetch(HTTP + '/v2/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [...stmts, { type: 'close' }] }),
  })
  const j = await r.json()
  const err = (j.results || []).find((x) => x.type === 'error')
  if (err) throw new Error(JSON.stringify(err.error))
  return j.results
}

async function reachable(url) {
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 8000)
    const r = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, signal: c.signal })
    clearTimeout(t)
    return r.status >= 200 && r.status < 400
  } catch {
    return false
  }
}

async function mapLimit(items, cc, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: cc }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]) }
  }))
  return out
}

// Obvious-gender lexicon for the first names in play. Unlisted names fall back
// to a stable id-hash coin flip — fine for demo avatars.
const FEMALE = new Set(['sophie','faye','jess','mara','lily','tess','brooke','iris','vera','diana','julia','ruby','wren'])
const MALE = new Set(['grant','sean','zane','chase','jake','owen','noah','eli','kyle'])
const hash = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }
function genderFor(name, id) {
  const first = (name ?? '').trim().split(/\s+/)[0].toLowerCase()
  if (FEMALE.has(first)) return 'women'
  if (MALE.has(first)) return 'men'
  return hash(id) % 2 === 0 ? 'women' : 'men'
}

async function main() {
  const [all] = await turso([
    { type: 'execute', stmt: { sql: 'SELECT id, name, image FROM User', args: [] } },
  ])
  const users = all.response.result.rows.map((r) => ({ id: r[0].value, name: r[1].value, image: r[2].value }))
  const withImg = users.filter((u) => u.image)
  const distinct = [...new Set(withImg.map((u) => u.image))]

  // Which existing URLs are broken right now?
  const ok = await mapLimit(distinct, 20, reachable)
  const bad = new Set(distinct.filter((_, i) => !ok[i]))

  const targets = users.filter((u) => !u.image || bad.has(u.image) || INCLUDE_IDS.has(u.id))
  console.log(`Targets: ${targets.length} users (no image or 404 photo${INCLUDE_IDS.size ? ` or in include-file (${INCLUDE_IDS.size})` : ''}).`)
  if (targets.length === 0) { console.log('✓ Nothing to do.'); return }

  // Assign a unique photo per user; separate index counters per gender so we
  // never hand out the same photo twice within this run.
  const used = { men: new Set(), women: new Set() }
  const assign = (u) => {
    const g = genderFor(u.name, u.id)
    let idx = hash(u.id + g) % 100
    while (used[g].has(idx)) idx = (idx + 1) % 100
    used[g].add(idx)
    return `https://randomuser.me/api/portraits/${g}/${idx}.jpg`
  }
  const plan = targets.map((u) => ({ ...u, next: assign(u) }))

  // Verify every freshly-assigned URL resolves before writing anything.
  const good = await mapLimit(plan, 20, (p) => reachable(p.next))
  const unreachable = plan.filter((_, i) => !good[i])
  if (unreachable.length) {
    console.error('Refusing to write — some generated URLs did not resolve:')
    unreachable.forEach((p) => console.error('  ' + p.next))
    process.exit(1)
  }

  console.log(`Assigning unique real headshots${DRY ? ' (DRY RUN)' : ''}:`)
  plan.forEach((p) => console.log(`  ${p.name} → ${p.next.replace('https://randomuser.me/api/portraits/', '')}`))
  if (DRY) { console.log('\n(dry run — no writes)'); return }

  await turso(plan.map((p) => ({ type: 'execute', stmt: { sql: 'UPDATE User SET image=? WHERE id=?', args: [
    { type: 'text', value: p.next }, { type: 'text', value: p.id },
  ] } })))
  console.log(`\n✓ Updated ${plan.length} users.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
