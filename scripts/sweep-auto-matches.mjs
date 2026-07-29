#!/usr/bin/env node
// Ops/backfill sweep for mutual Best Fit auto-matches.
//
// Runs the same idempotent syncAutoMatches sweep the admin GET routes run on
// every board read, but on demand against the real DB (Turso when creds are in
// apps/*/.env.local, else local dev.db): every ready mutual pair in the active
// conference is scheduled into the earliest free slot, and the audit log is
// reconciled (one MATCHED per pair, one SCHEDULED once the pair meets —
// including backfill for meetings created by other paths). Safe to re-run:
// a second invocation schedules nothing and writes nothing.
//
//   node scripts/sweep-auto-matches.mjs
//
// Prints what happened — mutual matches found, meetings scheduled this run
// (pair names + slot), MATCHED/SCHEDULED events logged — plus the current
// board totals including awaitingReciprocation (one-sided picks parked on the
// Auto board until the other side reciprocates).

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'packages/db/package.json'))

function readEnvLocal(app) {
  const env = {}
  try {
    for (const line of readFileSync(join(ROOT, 'apps', app, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}
function makePrisma() {
  const env = { ...readEnvLocal('web'), ...readEnvLocal('meetings') }
  const { PrismaClient } = require('@prisma/client')
  const url = process.env.TURSO_DATABASE_URL ?? env.TURSO_DATABASE_URL
  const token = process.env.TURSO_AUTH_TOKEN ?? env.TURSO_AUTH_TOKEN
  if (url && token && url.startsWith('libsql://')) {
    const { PrismaLibSQL } = require('@prisma/adapter-libsql')
    const { createClient } = require('@libsql/client')
    console.log('→ DB: Turso')
    return new PrismaClient({ adapter: new PrismaLibSQL(createClient({ url, authToken: token })) })
  }
  console.log('→ DB: local dev.db')
  process.env.DATABASE_URL = `file:${join(ROOT, 'packages/db/prisma/dev.db')}`
  return new PrismaClient()
}

const E = await import(pathToFileURL(join(ROOT, 'packages/db/src/meeting-engine.ts')).href)
const prisma = makePrisma()

async function main() {
  const conf = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  const confId = conf?.id ?? 'conf-2025'
  console.log(`→ conference: ${confId}`)

  const sync = await E.syncAutoMatches(prisma, confId)
  const board = await E.getAutoMatchBoard(prisma, confId)

  console.log(`→ mutual matches found: ${board.totals.matches}`)
  console.log(`→ meetings scheduled this run: ${sync.scheduled.length}`)
  for (const s of sync.scheduled) {
    console.log(`   • ${s.sponsorName} ↔ ${s.userName} — ${s.room} @ ${s.startsAt}`)
  }
  console.log(`→ events logged: ${sync.matchedLogged} MATCHED + ${sync.scheduledLogged} SCHEDULED`)
  console.log(
    `→ totals: ${board.totals.matches} matches (${board.totals.ready} ready, ` +
    `${board.totals.scheduled} scheduled) · ${board.totals.awaitingReciprocation} awaiting reciprocation`,
  )
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
