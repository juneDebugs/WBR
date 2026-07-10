#!/usr/bin/env node
// Logic test for the People home feed + DMs (packages/db/src/chat.ts).
// No server needed — exercises the shared validation + chat functions
// against a scratch SQLite database whose DDL is cloned from the real dev DB,
// so schema drift between the app and this test is impossible.
//
// What this verifies:
//   1. validateChatContent accepts/rejects the right payloads (empty,
//      whitespace, non-string, over-long, at-limit, trimming).
//   2. postGlobalMessage creates the general room + sender membership on
//      demand and persists the message; sender payload is the safe projection
//      (no password / pushToken leak).
//   3. listGlobalFeed returns the LATEST N messages in ascending order — not
//      the oldest N (the pre-feed bug).
//   4. getOrCreateDirectRoom: creates a two-member DIRECT room, is idempotent
//      in both argument orders, never cross-matches another pair's room,
//      rejects self-DM and unknown targets.
//   5. listRoomMessagesForUser / postRoomMessage enforce membership (Forbidden
//      for outsiders), return ascending latest-N, and stamp lastReadAt.
//
//   node scripts/test-home-feed.mjs
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
  validateChatContent,
  postGlobalMessage,
  listGlobalFeed,
  getOrCreateDirectRoom,
  listRoomMessagesForUser,
  postRoomMessage,
  MAX_CHAT_CONTENT_LENGTH,
} = await import(join(ROOT, 'packages/db/src/chat.ts'))
const { GENERAL_ROOM_ID } = await import(join(ROOT, 'packages/db/src/scheduled-messages.ts'))

// ─── 1. validateChatContent ───────────────────────────────────────────────────

console.log('[validateChatContent]')
{
  check('valid content accepted', validateChatContent('hello').ok === true)
  const trimmed = validateChatContent('  hi  ')
  check('content is trimmed', trimmed.ok && trimmed.content === 'hi')
  check('empty content rejected', validateChatContent('').ok === false)
  check('whitespace-only rejected', validateChatContent('   ').ok === false)
  check('non-string rejected', validateChatContent(42).ok === false)
  check('undefined rejected', validateChatContent(undefined).ok === false)
  check('over-long rejected',
    validateChatContent('x'.repeat(MAX_CHAT_CONTENT_LENGTH + 1)).ok === false)
  check('at-limit accepted',
    validateChatContent('x'.repeat(MAX_CHAT_CONTENT_LENGTH)).ok === true)
  check('rejection carries the route error string',
    validateChatContent('').error === 'Empty message' &&
    validateChatContent('x'.repeat(MAX_CHAT_CONTENT_LENGTH + 1)).error === 'Message too long')
}

// ─── Scratch database (DDL cloned from the real dev DB) ──────────────────────

const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')

const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-feed-test-'))
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

const alice = await prisma.user.create({
  data: { email: 'feed-alice@example.com', name: 'Alice', role: 'ATTENDEE', company: 'Acme', jobTitle: 'CEO', password: 'hash', pushToken: 'tok' },
})
const bob = await prisma.user.create({
  data: { email: 'feed-bob@example.com', name: 'Bob', role: 'ATTENDEE' },
})
const carol = await prisma.user.create({
  data: { email: 'feed-carol@example.com', name: 'Carol', role: 'SPEAKER' },
})

// ─── 2. postGlobalMessage ─────────────────────────────────────────────────────

console.log('\n[postGlobalMessage]')
{
  const res = await postGlobalMessage(prisma, alice.id, '  hello conference  ')
  check('post accepted', res.ok === true, JSON.stringify(res))
  check('content trimmed on persist', res.ok && res.message.content === 'hello conference')
  check('message lands in the general room', res.ok && res.message.roomId === GENERAL_ROOM_ID)

  const room = await prisma.chatRoom.findUnique({ where: { id: GENERAL_ROOM_ID } })
  check('general room auto-created (General / CHANNEL)',
    room !== null && room.name === 'General' && room.type === 'CHANNEL')
  const member = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: GENERAL_ROOM_ID, userId: alice.id } },
  })
  check('sender membership upserted', member !== null)

  check('sender projection has profile fields', res.ok &&
    res.message.sender.id === alice.id &&
    res.message.sender.name === 'Alice' &&
    res.message.sender.company === 'Acme' &&
    res.message.sender.jobTitle === 'CEO')
  check('sender projection leaks no credentials', res.ok &&
    !('password' in res.message.sender) && !('pushToken' in res.message.sender) &&
    !('email' in res.message.sender))

  const rejected = await postGlobalMessage(prisma, alice.id, '   ')
  check('empty post rejected', rejected.ok === false && rejected.error === 'Empty message')
  const tooLong = await postGlobalMessage(prisma, alice.id, 'x'.repeat(MAX_CHAT_CONTENT_LENGTH + 1))
  check('over-long post rejected', tooLong.ok === false && tooLong.error === 'Message too long')
  check('rejected posts persist nothing',
    (await prisma.message.count({ where: { roomId: GENERAL_ROOM_ID } })) === 1)
}

// ─── 3. listGlobalFeed returns the LATEST N, ascending ───────────────────────

console.log('\n[listGlobalFeed]')
{
  // Backdate a burst of messages with explicit timestamps so ordering is
  // deterministic (same-ms cuid creation would tie otherwise).
  const t0 = Date.now() - 60_000
  for (let i = 1; i <= 5; i++) {
    await prisma.message.create({
      data: {
        roomId: GENERAL_ROOM_ID,
        senderId: bob.id,
        content: `feed message ${i}`,
        createdAt: new Date(t0 + i * 1000),
      },
    })
  }

  const feed = await listGlobalFeed(prisma, 3)
  check('limit respected', feed.length === 3, `got ${feed.length}`)
  // 'hello conference' (posted above, stamped now) is newer than the whole
  // backdated burst, so the latest three are burst 4, 5, then it.
  check('returns the LATEST messages, not the oldest',
    feed.map(m => m.content).join('|') === 'feed message 4|feed message 5|hello conference',
    feed.map(m => m.content).join('|'))
  check('ascending chronological order',
    feed.every((m, i) => i === 0 || m.createdAt >= feed[i - 1].createdAt))
  check('feed sender projection is safe',
    feed.every(m => m.sender && !('password' in m.sender) && !('pushToken' in m.sender)))

  const all = await listGlobalFeed(prisma)
  check('default limit returns everything here (6 messages)', all.length === 6, `got ${all.length}`)
}

// ─── 4. getOrCreateDirectRoom ─────────────────────────────────────────────────

console.log('\n[getOrCreateDirectRoom]')
{
  const created = await getOrCreateDirectRoom(prisma, alice.id, bob.id)
  check('DM room created', created.ok === true, JSON.stringify(created))
  check('room is DIRECT with no name', created.ok && created.room.type === 'DIRECT' && created.room.name === null)
  const members = await prisma.chatMember.findMany({ where: { roomId: created.room.id } })
  check('exactly two members (both users)',
    members.length === 2 &&
    new Set(members.map(m => m.userId)).size === 2 &&
    members.every(m => [alice.id, bob.id].includes(m.userId)))

  const again = await getOrCreateDirectRoom(prisma, alice.id, bob.id)
  check('same pair → same room (idempotent)', again.ok && again.room.id === created.room.id)
  const reversed = await getOrCreateDirectRoom(prisma, bob.id, alice.id)
  check('reversed args → same room', reversed.ok && reversed.room.id === created.room.id)

  const other = await getOrCreateDirectRoom(prisma, alice.id, carol.id)
  check('different pair → different room', other.ok && other.room.id !== created.room.id)
  const back = await getOrCreateDirectRoom(prisma, alice.id, bob.id)
  check('original pair still resolves to its own room (no cross-match)',
    back.ok && back.room.id === created.room.id)

  const self = await getOrCreateDirectRoom(prisma, alice.id, alice.id)
  check('self-DM rejected', self.ok === false && self.error === 'Cannot message yourself')
  const ghost = await getOrCreateDirectRoom(prisma, alice.id, 'no-such-user')
  check('unknown target rejected', ghost.ok === false && ghost.error === 'User not found')

  const roomCount = await prisma.chatRoom.count({ where: { type: 'DIRECT' } })
  check('no duplicate DIRECT rooms created', roomCount === 2, `count ${roomCount}`)
}

// ─── 5. Room messages: membership gate, ordering, lastReadAt ─────────────────

console.log('\n[postRoomMessage + listRoomMessagesForUser]')
{
  const { room } = await getOrCreateDirectRoom(prisma, alice.id, bob.id)

  const outsiderPost = await postRoomMessage(prisma, room.id, carol.id, 'let me in')
  check('non-member post → Forbidden', outsiderPost.ok === false && outsiderPost.error === 'Forbidden')
  const outsiderRead = await listRoomMessagesForUser(prisma, room.id, carol.id)
  check('non-member read → Forbidden', outsiderRead.ok === false && outsiderRead.error === 'Forbidden')
  const ghostRoom = await listRoomMessagesForUser(prisma, 'no-such-room', alice.id)
  check('unknown room read → Forbidden', ghostRoom.ok === false && ghostRoom.error === 'Forbidden')

  const sent = await postRoomMessage(prisma, room.id, alice.id, 'hi bob')
  check('member post accepted', sent.ok === true, JSON.stringify(sent))
  const emptyPost = await postRoomMessage(prisma, room.id, alice.id, '')
  check('empty DM rejected', emptyPost.ok === false && emptyPost.error === 'Empty message')

  const reply = await postRoomMessage(prisma, room.id, bob.id, 'hi alice')
  check('recipient can reply', reply.ok === true)

  const before = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: bob.id } },
  })
  const read = await listRoomMessagesForUser(prisma, room.id, bob.id)
  check('member read returns both messages in order',
    read.ok && read.messages.map(m => m.content).join('|') === 'hi bob|hi alice',
    read.ok ? read.messages.map(m => m.content).join('|') : JSON.stringify(read))
  check('DM sender projection is safe',
    read.ok && read.messages.every(m => !('password' in m.sender) && !('pushToken' in m.sender)))
  const after = await prisma.chatMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: bob.id } },
  })
  check('lastReadAt stamped by read',
    after.lastReadAt !== null && (before.lastReadAt === null || after.lastReadAt >= before.lastReadAt))

  // Latest-N semantics in a DM room too. These must sort AFTER the two
  // just-created "hi" messages, so stamp them slightly in the future.
  const t0 = Date.now() + 5_000
  for (let i = 1; i <= 4; i++) {
    await prisma.message.create({
      data: { roomId: room.id, senderId: alice.id, content: `dm ${i}`, createdAt: new Date(t0 + i * 1000) },
    })
  }
  const lastThree = await listRoomMessagesForUser(prisma, room.id, alice.id, 3)
  check('DM latest-N ascending',
    lastThree.ok && lastThree.messages.map(m => m.content).join('|') === 'dm 2|dm 3|dm 4',
    lastThree.ok ? lastThree.messages.map(m => m.content).join('|') : JSON.stringify(lastThree))
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

await prisma.$disconnect()
scratch.close?.()
rmSync(scratchDir, { recursive: true, force: true })

console.log(failures === 0 ? '\nHOME FEED LOGIC TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
