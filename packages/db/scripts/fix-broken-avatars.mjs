// Repairs broken profile photos.
//
// Users' avatars are direct images.unsplash.com photo URLs. A few photo IDs
// in the seed pool are invalid and 404 (e.g. Sophie Müller, Dana Adams),
// which renders as a broken image in the Meetings avatars and everywhere else.
//
// This script probes every distinct avatar URL, then reassigns each user whose
// URL 404s to a verified-working URL from the same pool (spread round-robin for
// variety). Idempotent: re-running only touches URLs that are currently broken.
//
// Usage: node packages/db/scripts/fix-broken-avatars.mjs [--dry]
// Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from apps/web/.env.local.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY = process.argv.includes('--dry')

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
  await Promise.all(
    Array.from({ length: cc }, async () => {
      while (i < items.length) {
        const idx = i++
        out[idx] = await fn(items[idx])
      }
    }),
  )
  return out
}

async function main() {
  const [res] = await turso([
    { type: 'execute', stmt: { sql: 'SELECT id, name, image FROM User WHERE image IS NOT NULL', args: [] } },
  ])
  const users = res.response.result.rows.map((r) => ({
    id: r[0].value,
    name: r[1].value,
    image: r[2].value,
  }))
  const distinct = [...new Set(users.map((u) => u.image))]
  console.log(`Probing ${distinct.length} distinct avatar URLs across ${users.length} users...`)

  const ok = await mapLimit(distinct, 20, reachable)
  const good = distinct.filter((_, i) => ok[i])
  const bad = new Set(distinct.filter((_, i) => !ok[i]))
  console.log(`  working: ${good.length}   broken: ${bad.size}`)
  if (bad.size === 0) {
    console.log('✓ No broken avatars. Nothing to do.')
    return
  }
  bad.forEach((u) => console.log(`  broken → ${u}`))

  const affected = users.filter((u) => bad.has(u.image))
  console.log(`\nReassigning ${affected.length} users to working avatars${DRY ? ' (DRY RUN)' : ''}:`)
  const updates = affected.map((u, i) => {
    const next = good[i % good.length]
    console.log(`  ${u.name}`)
    return { type: 'execute', stmt: { sql: 'UPDATE User SET image=? WHERE id=?', args: [
      { type: 'text', value: next }, { type: 'text', value: u.id },
    ] } }
  })

  if (DRY) { console.log('\n(dry run — no writes)'); return }
  await turso(updates)
  console.log(`\n✓ Updated ${affected.length} users.`)

  // Verify the previously-broken URLs are gone.
  const [check] = await turso([
    { type: 'execute', stmt: { sql: 'SELECT count(*) FROM User WHERE image IN (' + [...bad].map(() => '?').join(',') + ')', args: [...bad].map((v) => ({ type: 'text', value: v })) } },
  ])
  console.log(`Remaining users on broken URLs: ${check.response.result.rows[0][0].value}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
