#!/usr/bin/env node
// Logic test for scheduled chat broadcasts (packages/db/src/scheduled-messages.ts).
// No server needed — exercises the shared validation + dispatch functions
// against a scratch SQLite database whose DDL is cloned from the real dev DB,
// so schema drift between the app and this test is impossible.
//
// What this verifies:
//   1. validateSchedulePayload accepts/rejects the right payloads (empty,
//      too long, bad date, past, too far out, valid, Date instance).
//   2. dispatchDueScheduledMessages delivers a due PENDING message: creates
//      the Message row, marks SENT with sentAt + sentMessageId, and upserts
//      the room + sender membership if missing.
//   3. Future, CANCELED, and FAILED rows are never dispatched.
//   4. Dispatch is idempotent and race-safe: concurrent/repeated ticks never
//      deliver a message twice (atomic status-guarded claim).
//   5. If message creation fails after a claim, the row becomes FAILED (never
//      silently dropped, never retried into a double send).
//
//   node scripts/test-scheduled-messages.mjs
//
// Exits 0 on all-pass, 1 on failure.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_DB = join(ROOT, 'packages/db/prisma/dev.db')

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const {
  validateSchedulePayload,
  dispatchDueScheduledMessages,
  SCHEDULED_STATUS,
  GENERAL_ROOM_ID,
  MAX_SCHEDULED_CONTENT_LENGTH,
  MIN_LEAD_MS,
  MAX_LEAD_MS,
  STUCK_CLAIM_GRACE_MS,
} = await import(join(ROOT, 'packages/db/src/scheduled-messages.ts'))

// ─── 1. validateSchedulePayload ───────────────────────────────────────────────

console.log('[validateSchedulePayload]')
{
  const now = new Date('2026-07-10T12:00:00Z')
  const inOneHour = new Date(now.getTime() + 3_600_000).toISOString()

  check('valid payload accepted', validateSchedulePayload('hello', inOneHour, now).ok === true)
  const trimmedResult = validateSchedulePayload('  hi  ', inOneHour, now)
  check('content is trimmed', trimmedResult.ok && trimmedResult.content === 'hi')
  check('Date instance accepted', validateSchedulePayload('hi', new Date(now.getTime() + 60_000), now).ok === true)
  check('empty content rejected', validateSchedulePayload('', inOneHour, now).ok === false)
  check('whitespace-only content rejected', validateSchedulePayload('   ', inOneHour, now).ok === false)
  check('non-string content rejected', validateSchedulePayload(42, inOneHour, now).ok === false)
  check('over-long content rejected',
    validateSchedulePayload('x'.repeat(MAX_SCHEDULED_CONTENT_LENGTH + 1), inOneHour, now).ok === false)
  check('at-limit content accepted',
    validateSchedulePayload('x'.repeat(MAX_SCHEDULED_CONTENT_LENGTH), inOneHour, now).ok === true)
  check('missing time rejected', validateSchedulePayload('hi', undefined, now).ok === false)
  check('garbage time rejected', validateSchedulePayload('hi', 'not-a-date', now).ok === false)
  check('past time rejected',
    validateSchedulePayload('hi', new Date(now.getTime() - 60_000).toISOString(), now).ok === false)
  check('sub-minimum lead rejected',
    validateSchedulePayload('hi', new Date(now.getTime() + MIN_LEAD_MS - 1).toISOString(), now).ok === false)
  check('beyond one year rejected',
    validateSchedulePayload('hi', new Date(now.getTime() + MAX_LEAD_MS + 60_000).toISOString(), now).ok === false)
}

// ─── Scratch database (DDL cloned from the real dev DB) ──────────────────────

const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')

const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-sched-test-'))
const scratchPath = join(scratchDir, 'test.db')

const source = createClient({ url: `file:${SOURCE_DB}` })
const ddl = await source.execute(
  `SELECT sql FROM sqlite_master
   WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid`
)
source.close?.()
const scratch = createClient({ url: `file:${scratchPath}` })
for (const row of ddl.rows) await scratch.execute(row.sql)

process.env.DATABASE_URL = `file:${scratchPath}`
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
const { PrismaClient } = req('@prisma/client')
const prisma = new PrismaClient()

const sender = await prisma.user.create({
  data: { email: 'sched-test@example.com', name: 'Sched Tester', role: 'ORGANIZER' },
})

// FK target for scheduled rows — the API route upserts this the same way.
await prisma.chatRoom.create({ data: { id: GENERAL_ROOM_ID, name: 'General', type: 'CHANNEL' } })

async function schedule(content, offsetMs, status = SCHEDULED_STATUS.PENDING) {
  return prisma.scheduledMessage.create({
    data: {
      roomId: GENERAL_ROOM_ID,
      senderId: sender.id,
      content,
      scheduledFor: new Date(Date.now() + offsetMs),
      status,
    },
  })
}

// ─── 2. Basic dispatch of a due message ──────────────────────────────────────

console.log('\n[dispatch: due message delivered]')
{
  const due = await schedule('due now', -60_000)
  const future = await schedule('future message', 3_600_000)
  const canceled = await schedule('canceled message', -60_000, SCHEDULED_STATUS.CANCELED)

  const result = await dispatchDueScheduledMessages(prisma)
  check('one due message found and sent', result.due === 1 && result.sent === 1 && result.failed === 0,
    JSON.stringify(result))

  const sent = await prisma.scheduledMessage.findUnique({ where: { id: due.id } })
  check('row marked SENT', sent.status === SCHEDULED_STATUS.SENT)
  check('sentAt stamped', sent.sentAt !== null)
  check('sentMessageId recorded', typeof sent.sentMessageId === 'string' && sent.sentMessageId.length > 0)

  const msg = sent.sentMessageId
    ? await prisma.message.findUnique({ where: { id: sent.sentMessageId } })
    : null
  check('Message row created in the general room',
    msg !== null && msg.roomId === GENERAL_ROOM_ID && msg.content === 'due now' && msg.senderId === sender.id)

  const room = await prisma.chatRoom.findUnique({ where: { id: GENERAL_ROOM_ID } })
  check('general room intact (name + CHANNEL type)', room !== null && room.type === 'CHANNEL' && room.name === 'General')
  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: GENERAL_ROOM_ID, userId: sender.id } },
  })
  check('sender membership upserted', member !== null)

  const futureRow = await prisma.scheduledMessage.findUnique({ where: { id: future.id } })
  check('future message untouched', futureRow.status === SCHEDULED_STATUS.PENDING && futureRow.sentMessageId === null)
  const canceledRow = await prisma.scheduledMessage.findUnique({ where: { id: canceled.id } })
  check('canceled message untouched', canceledRow.status === SCHEDULED_STATUS.CANCELED && canceledRow.sentMessageId === null)

  const again = await dispatchDueScheduledMessages(prisma)
  check('second tick is a no-op (idempotent)', again.due === 0 && again.sent === 0, JSON.stringify(again))
  const msgCount = await prisma.message.count({ where: { content: 'due now' } })
  check('message not duplicated by second tick', msgCount === 1, `count ${msgCount}`)
}

// ─── 3. Concurrent ticks never double-send ───────────────────────────────────

console.log('\n[dispatch: concurrent ticks]')
{
  await schedule('race message A', -60_000)
  await schedule('race message B', -60_000)
  await schedule('race message C', -60_000)

  const results = await Promise.all([
    dispatchDueScheduledMessages(prisma),
    dispatchDueScheduledMessages(prisma),
    dispatchDueScheduledMessages(prisma),
  ])
  const totalSent = results.reduce((n, r) => n + r.sent, 0)
  check('exactly 3 sends across all concurrent ticks', totalSent === 3,
    `sent ${totalSent} (${JSON.stringify(results)})`)
  for (const label of ['race message A', 'race message B', 'race message C']) {
    const n = await prisma.message.count({ where: { content: label } })
    check(`"${label}" delivered exactly once`, n === 1, `count ${n}`)
  }
}

// ─── 4. Failure after claim → FAILED, no double delivery ─────────────────────

console.log('\n[dispatch: failure path]')
{
  const doomed = await schedule('doomed message', -60_000)

  // Same client, but message.create always throws — simulates a mid-send crash.
  const brokenClient = new Proxy(prisma, {
    get(target, prop) {
      if (prop === 'message') {
        return { ...target.message, create: async () => { throw new Error('injected send failure') } }
      }
      return target[prop]
    },
  })

  const result = await dispatchDueScheduledMessages(brokenClient)
  check('failure counted', result.failed === 1 && result.sent === 0, JSON.stringify(result))

  const row = await prisma.scheduledMessage.findUnique({ where: { id: doomed.id } })
  check('row marked FAILED', row.status === SCHEDULED_STATUS.FAILED)
  check('no message created', (await prisma.message.count({ where: { content: 'doomed message' } })) === 0)

  const retry = await dispatchDueScheduledMessages(prisma)
  check('FAILED row not retried by a healthy tick', retry.due === 0 && retry.sent === 0, JSON.stringify(retry))
}

// ─── 5. Edit racing dispatch (snapshot vs claim) ─────────────────────────────
// A dispatch tick snapshots due rows with findMany, then claims each row. An
// edit can land between those two steps. Simulate it by feeding the dispatcher
// a stale snapshot while the database already holds the edited row.

function withStaleSnapshot(client, staleRows) {
  return new Proxy(client, {
    get(target, prop) {
      if (prop === 'scheduledMessage') {
        return { ...target.scheduledMessage, findMany: async () => staleRows }
      }
      return target[prop]
    },
  })
}

console.log('\n[dispatch: edit races the tick]')
{
  // (a) Postponed between snapshot and claim → must NOT send.
  const postponed = await schedule('postponed message', 3_600_000) // DB truth: due tomorrow
  const staleDue = { ...postponed, scheduledFor: new Date(Date.now() - 60_000) } // snapshot says due
  const r1 = await dispatchDueScheduledMessages(withStaleSnapshot(prisma, [staleDue]))
  check('postponed row is not sent', r1.sent === 0 && r1.failed === 0, JSON.stringify(r1))
  const afterPostpone = await prisma.scheduledMessage.findUnique({ where: { id: postponed.id } })
  check('postponed row still PENDING', afterPostpone.status === SCHEDULED_STATUS.PENDING)
  check('no message for postponed row',
    (await prisma.message.count({ where: { content: { in: ['postponed message'] } } })) === 0)

  // (b) Content edited between snapshot and claim → the EDITED text must go out.
  const edited = await schedule('edited text (current)', -60_000) // DB truth after the edit
  const staleContent = { ...edited, content: 'stale text (pre-edit)' } // what the snapshot saw
  const r2 = await dispatchDueScheduledMessages(withStaleSnapshot(prisma, [staleContent]))
  check('edited row sent once', r2.sent === 1, JSON.stringify(r2))
  check('delivered with post-edit content',
    (await prisma.message.count({ where: { content: 'edited text (current)' } })) === 1)
  check('pre-edit content never delivered',
    (await prisma.message.count({ where: { content: 'stale text (pre-edit)' } })) === 0)
}

// ─── 6. Stuck claim reconciliation ───────────────────────────────────────────
// A process death between claim and message-create leaves SENT with a null
// sentMessageId. The next tick must surface it as FAILED, not "delivered".

console.log('\n[dispatch: stuck claim reconciliation]')
{
  const stuck = await prisma.scheduledMessage.create({
    data: {
      roomId: GENERAL_ROOM_ID,
      senderId: sender.id,
      content: 'stuck claim',
      scheduledFor: new Date(Date.now() - STUCK_CLAIM_GRACE_MS - 120_000),
      status: SCHEDULED_STATUS.SENT,
      sentAt: new Date(Date.now() - STUCK_CLAIM_GRACE_MS - 60_000),
    },
  })
  const fresh = await prisma.scheduledMessage.create({
    data: {
      roomId: GENERAL_ROOM_ID,
      senderId: sender.id,
      content: 'freshly claimed',
      scheduledFor: new Date(Date.now() - 60_000),
      status: SCHEDULED_STATUS.SENT, // claimed seconds ago by an in-flight tick
      sentAt: new Date(),
    },
  })

  await dispatchDueScheduledMessages(prisma)
  const stuckRow = await prisma.scheduledMessage.findUnique({ where: { id: stuck.id } })
  check('orphaned claim flipped to FAILED', stuckRow.status === SCHEDULED_STATUS.FAILED)
  const freshRow = await prisma.scheduledMessage.findUnique({ where: { id: fresh.id } })
  check('in-flight claim within grace left alone', freshRow.status === SCHEDULED_STATUS.SENT)
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

await prisma.$disconnect()
scratch.close?.()
rmSync(scratchDir, { recursive: true, force: true })

console.log(failures === 0 ? '\nSCHEDULED MESSAGES LOGIC TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
