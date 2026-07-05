#!/usr/bin/env node
/**
 * Data-layer read/write/update benchmark (pure Node + Prisma, seeded dev.db).
 *
 * Measures representative queries the apps actually run — median latency + payload
 * bytes — so read/write/update speed can be compared before vs after a change.
 * Runs against a THROWAWAY COPY of the db (never mutates the seed).
 *
 * Usage: node scripts/bench-data-layer.mjs [path-to-dev.db] [label]
 *   default db: apps/web/dev.db   default label: run
 *
 * NOTE: local SQLite times are lower-bound (production uses Turso over HTTP);
 * payload bytes are environment-independent and reflect real transfer/parse cost.
 */
import { createRequire } from 'node:module'
import { cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire('/Users/june/WBR/packages/db/')
const { PrismaClient } = require('@prisma/client')
const { PrismaLibSQL } = require('@prisma/adapter-libsql')
const { createClient } = require('@libsql/client')

const SRC = process.argv[2] || '/Users/june/WBR/apps/web/dev.db'
const LABEL = process.argv[3] || 'run'
const DB = join(tmpdir(), `wbr-bench-${process.pid}.db`)
cpSync(SRC, DB)

const libsql = createClient({ url: 'file:' + DB })
const prisma = new PrismaClient({ adapter: new PrismaLibSQL(libsql) })

const bytes = (o) => Buffer.byteLength(JSON.stringify(o ?? null), 'utf8')
const kb = (n) => (n / 1024).toFixed(1)
async function bench(label, fn, n = 9) {
  const ts = []
  let r
  for (let i = 0; i < n; i++) {
    const s = performance.now()
    r = await fn()
    ts.push(performance.now() - s)
  }
  ts.sort((a, b) => a - b)
  const med = ts[Math.floor(n / 2)]
  const rows = Array.isArray(r) ? r.length : r && typeof r === 'object' ? '—' : r
  return { label, med: med.toFixed(1), kb: kb(bytes(r)), rows }
}

// Query shapes mirroring the apps' real data functions (select-narrowed, take-limited).
const MEETING_INCLUDE = {
  requester: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true } },
  targetUser: { select: { id: true, name: true, email: true, image: true, company: true, jobTitle: true } },
  targetSponsor: { select: { id: true, name: true, logoUrl: true, tier: true } },
  timeBlock: { select: { id: true, startsAt: true, endsAt: true, location: true } },
}
const USER_SELECT = {
  id: true, name: true, email: true, image: true, company: true,
  jobTitle: true, role: true, bio: true, companySize: true,
}

const results = []
// pick a real request row (full) to drive per-user reads and clone-based writes
const anyReq = await prisma.meetingRequest.findFirst()
const userId = anyReq?.requesterId

// ---- READS ----
results.push(await bench('READ meetings-data (byRequester, incl, take200)', () =>
  prisma.meetingRequest.findMany({ where: { requesterId: userId }, include: MEETING_INCLUDE, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 })))
results.push(await bench('READ dashboard counts (5× count parallel)', () =>
  Promise.all([
    prisma.meetingRequest.count(),
    prisma.meetingRequest.count({ where: { status: 'PENDING' } }),
    prisma.meetingRequest.count({ where: { status: 'APPROVED' } }),
    prisma.user.count({ where: { role: { in: ['ATTENDEE', 'SPEAKER'] } } }),
    prisma.sponsor.count(),
  ])))
results.push(await bench('READ browse people (select, take500)', () =>
  prisma.user.findMany({ where: { role: { in: ['ATTENDEE', 'SPEAKER'] } }, select: USER_SELECT, take: 500, orderBy: { name: 'asc' } })))
results.push(await bench('READ attendee people (select, take200)', () =>
  prisma.user.findMany({ where: { role: { in: ['ATTENDEE', 'SPEAKER'] } }, select: USER_SELECT, take: 200, orderBy: { name: 'asc' } })))

// ---- WRITE / UPDATE (mutating; done on the throwaway copy, cleaned up) ----
if (anyReq) {
  const { id: _id, createdAt: _c, updatedAt: _u, ...cloneData } = anyReq
  const w = await bench('WRITE create+delete meetingRequest', async () => {
    const row = await prisma.meetingRequest.create({ data: cloneData, select: { id: true } })
    await prisma.meetingRequest.delete({ where: { id: row.id } })
    return row
  }, 7)
  results.push(w)

  const u = await bench('UPDATE meetingRequest status (toggle back)', async () => {
    await prisma.meetingRequest.update({ where: { id: anyReq.id }, data: { status: 'APPROVED' } })
    await prisma.meetingRequest.update({ where: { id: anyReq.id }, data: { status: anyReq.status } })
    return { id: anyReq.id }
  }, 7)
  results.push(u)
}

console.log(`\n=== data-layer benchmark [${LABEL}] — db=${SRC.split('/').slice(-2).join('/')} ===`)
console.log('op'.padEnd(48), 'median'.padStart(9), 'payload'.padStart(10), 'rows'.padStart(7))
for (const r of results) {
  console.log(r.label.padEnd(48), (r.med + ' ms').padStart(9), (r.kb + ' KB').padStart(10), String(r.rows).padStart(7))
}
await prisma.$disconnect()
