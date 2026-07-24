#!/usr/bin/env node
// Idempotent migration for priority-based meeting scheduling.
// Adds MeetingRequest.priority (TEXT NOT NULL DEFAULT 'MED') + a supporting index.
//
// Targets Turso when TURSO_DATABASE_URL/TURSO_AUTH_TOKEN are present (in env or
// apps/*/.env.local), else the local packages/db/prisma/dev.db fallback — the
// same connection strategy the migrate-meeting-engine oracle uses.
//
//   node scripts/migrate-meeting-priority.mjs            # auto-detect Turso, else local
//   node scripts/migrate-meeting-priority.mjs --local    # force local dev.db
//
import { readFileSync, copyFileSync, existsSync } from 'node:fs'
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
    return { db: createClient({ url, authToken: token }), isLocal: false }
  }
  const file = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  console.log('→ target: local', file)
  return { db: createClient({ url: file }), isLocal: true }
}

async function columns(db, table) {
  const res = await db.execute(`PRAGMA table_info("${table}")`)
  return new Set(res.rows.map(r => String(r.name)))
}
async function indexes(db, table) {
  const res = await db.execute(`PRAGMA index_list("${table}")`)
  return new Set(res.rows.map(r => String(r.name)))
}

// Keep every app's local dev.db copy in lockstep (db:seed does the same fan-out).
function fanOutLocal() {
  const src = join(ROOT, 'packages/db/prisma/dev.db')
  const targets = [
    'apps/attendee/dev.db', 'apps/web/dev.db', 'apps/sponsor/dev.db',
    'apps/meetings/dev.db', 'packages/db/dev.db',
  ]
  for (const t of targets) {
    const dest = join(ROOT, t)
    try {
      if (existsSync(dest)) { copyFileSync(src, dest); console.log(`  ↪ synced ${t}`) }
    } catch (e) { console.warn(`  ! could not sync ${t}: ${e.message}`) }
  }
}

async function main() {
  const { db, isLocal } = openDb()
  const cols = await columns(db, 'MeetingRequest')
  let changed = 0

  if (cols.has('priority')) {
    console.log('  ✓ MeetingRequest.priority already present')
  } else {
    await db.execute(`ALTER TABLE "MeetingRequest" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MED'`)
    changed++
    console.log("  + added MeetingRequest.priority (TEXT NOT NULL DEFAULT 'MED')")
  }

  const idx = await indexes(db, 'MeetingRequest')
  const idxName = 'MeetingRequest_status_priority_idx'
  if (idx.has(idxName)) {
    console.log(`  ✓ index ${idxName} already present`)
  } else {
    await db.execute(`CREATE INDEX "${idxName}" ON "MeetingRequest"("status", "priority")`)
    changed++
    console.log(`  + created index ${idxName}`)
  }

  if (isLocal) fanOutLocal()
  console.log(changed ? `Done — ${changed} change(s) applied.` : 'Done — schema already up to date.')
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1) })
