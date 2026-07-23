#!/usr/bin/env node
// Idempotent migration for the company-centric meeting engine.
// Adds SponsorMeeting.location and SponsorMeeting.reason (nullable TEXT).
//
// Targets Turso when TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are present (in env or
// apps/*/.env.local), else the local packages/db/prisma/dev.db fallback — the
// same connection strategy the test-*.mjs oracles use.
//
//   node scripts/migrate-meeting-engine.mjs            # auto-detect Turso, else local
//   node scripts/migrate-meeting-engine.mjs --local    # force local dev.db
//
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FORCE_LOCAL = process.argv.includes('--local')

function readEnvLocal(app) {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps', app, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const mm = line.match(/^([A-Z_]+)=(.*)$/)
      if (mm) env[mm[1]] = mm[2].replace(/^"|"$/g, '')
    }
  } catch {}
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
    return createClient({ url, authToken: token })
  }
  const file = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  console.log('→ target: local', file)
  return createClient({ url: file })
}

async function columns(db, table) {
  const res = await db.execute(`PRAGMA table_info("${table}")`)
  return new Set(res.rows.map(r => String(r.name)))
}

async function main() {
  const db = openDb()
  const cols = await columns(db, 'SponsorMeeting')
  const adds = [
    ['location', 'ALTER TABLE "SponsorMeeting" ADD COLUMN "location" TEXT'],
    ['reason', 'ALTER TABLE "SponsorMeeting" ADD COLUMN "reason" TEXT'],
  ]
  let changed = 0
  for (const [name, sql] of adds) {
    if (cols.has(name)) {
      console.log(`  ✓ SponsorMeeting.${name} already present`)
      continue
    }
    await db.execute(sql)
    changed++
    console.log(`  + added SponsorMeeting.${name}`)
  }
  console.log(changed ? `Done — ${changed} column(s) added.` : 'Done — schema already up to date.')
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1) })
