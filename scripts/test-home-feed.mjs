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
//   6. validateFeedImage accepts null/valid data URIs and rejects http URLs,
//      non-image data URIs, and over-length payloads.
//   7. postGlobalMessage with an image: image-only posts (empty content) are
//      allowed, text+image persists both, empty text WITHOUT an image is still
//      rejected, invalid images are rejected.
//   8. listGlobalFeed enrichment: likeCount / commentCount / likedByMe are
//      correct per viewer, and the sender projection stays credential-free.
//   9. toggleMessageLike: like/unlike round-trip, multi-user counts, unknown
//      ids and DM-room messages are Not found (likes never leak into DMs).
//  10. Comments: post + ascending list, empty comment rejected, DM-room
//      messages are Not found.
//  11. Friend gate on DMs: getOrCreateDirectRoom refuses a NEW room for a
//      non-friend pair with code NOT_FRIENDS; the DM sections befriend their
//      pairs (mutual Follow edges) first.
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
  validateFeedImage,
  postGlobalMessage,
  listGlobalFeed,
  getOrCreateDirectRoom,
  listRoomMessagesForUser,
  postRoomMessage,
  toggleMessageLike,
  listMessageComments,
  postMessageComment,
  MAX_CHAT_CONTENT_LENGTH,
  MAX_FEED_IMAGE_CHARS,
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

// ─── 6. validateFeedImage (pure) ─────────────────────────────────────────────

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const TINY_JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ=='

console.log('\n[validateFeedImage]')
{
  const absent = validateFeedImage(null)
  check('null → ok with null imageUrl', absent.ok === true && absent.imageUrl === null)
  const missing = validateFeedImage(undefined)
  check('undefined → ok with null imageUrl', missing.ok === true && missing.imageUrl === null)
  const png = validateFeedImage(TINY_PNG)
  check('png data URI accepted', png.ok === true && png.imageUrl === TINY_PNG)
  check('jpeg data URI accepted', validateFeedImage(TINY_JPEG).ok === true)
  const http = validateFeedImage('https://example.com/cat.png')
  check('https URL rejected', http.ok === false && http.error === 'Invalid image')
  const html = validateFeedImage('data:text/html;base64,PHNjcmlwdD4=')
  check('non-image data URI rejected', html.ok === false && html.error === 'Invalid image')
  check('non-string rejected', validateFeedImage(42).ok === false)
  const huge = validateFeedImage(`data:image/png;base64,${'A'.repeat(MAX_FEED_IMAGE_CHARS)}`)
  check('over-length image rejected', huge.ok === false && huge.error === 'Image too large')
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

// Precondition: the cloned DDL must already contain the feed-social schema.
// Guards against silently "passing" the new sections against a stale dev.db.
{
  const tables = await scratch.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('MessageLike', 'MessageComment')`
  )
  const imageCol = await scratch.execute(
    `SELECT name FROM pragma_table_info('Message') WHERE name = 'imageUrl'`
  )
  if (tables.rows.length !== 2 || imageCol.rows.length !== 1) {
    console.error(
      `\n✗ ${SOURCE_DB} lacks the feed-social schema (MessageLike / MessageComment / Message.imageUrl).`
    )
    console.error('  Run `npx prisma db push` (schema packages/db/prisma/schema.prisma) first.')
    process.exit(1)
  }
}

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
  // NEW DM rooms are friend-gated: a non-friend pair is refused outright…
  const gated = await getOrCreateDirectRoom(prisma, alice.id, bob.id)
  check('non-friend pair refused with code NOT_FRIENDS',
    gated.ok === false && gated.code === 'NOT_FRIENDS' &&
    gated.error === 'You must be friends to message', JSON.stringify(gated))

  // …so befriend the pairs the DM sections use (friendship = mutual Follow edges).
  for (const [a, b] of [[alice.id, bob.id], [alice.id, carol.id]]) {
    await prisma.follow.create({ data: { followerId: a, followingId: b } })
    await prisma.follow.create({ data: { followerId: b, followingId: a } })
  }

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

// ─── 7. postGlobalMessage with images ────────────────────────────────────────

console.log('\n[postGlobalMessage + images]')
{
  const imageOnly = await postGlobalMessage(prisma, alice.id, '', TINY_PNG)
  check('image-only post accepted', imageOnly.ok === true, JSON.stringify(imageOnly).slice(0, 200))
  check('image-only post stores empty content', imageOnly.ok && imageOnly.message.content === '')
  check('image-only post persists the data URI', imageOnly.ok && imageOnly.message.imageUrl === TINY_PNG)
  check('new post reports zero social counts', imageOnly.ok &&
    imageOnly.message.likeCount === 0 && imageOnly.message.commentCount === 0 &&
    imageOnly.message.likedByMe === false)

  const withText = await postGlobalMessage(prisma, alice.id, '  caption here  ', TINY_JPEG)
  check('text+image post accepted', withText.ok === true, JSON.stringify(withText).slice(0, 200))
  check('text+image trims text and keeps the image', withText.ok &&
    withText.message.content === 'caption here' && withText.message.imageUrl === TINY_JPEG)
  const row = await prisma.message.findUnique({ where: { id: withText.message.id } })
  check('imageUrl persisted to the DB', row?.imageUrl === TINY_JPEG)

  const noImage = await postGlobalMessage(prisma, alice.id, '   ')
  check('empty text without image still rejected',
    noImage.ok === false && noImage.error === 'Empty message')
  const badImage = await postGlobalMessage(prisma, alice.id, 'hi', 'https://example.com/x.png')
  check('invalid image rejected', badImage.ok === false && badImage.error === 'Invalid image')
  const tooBig = await postGlobalMessage(prisma, alice.id, 'hi',
    `data:image/png;base64,${'A'.repeat(MAX_FEED_IMAGE_CHARS)}`)
  check('over-length image rejected on post', tooBig.ok === false && tooBig.error === 'Image too large')
  const longText = await postGlobalMessage(prisma, alice.id,
    'x'.repeat(MAX_CHAT_CONTENT_LENGTH + 1), TINY_PNG)
  check('over-long text rejected even with an image',
    longText.ok === false && longText.error === 'Message too long')
}

// ─── 8. listGlobalFeed enrichment (likes / comments / likedByMe) ─────────────

console.log('\n[listGlobalFeed enrichment]')
{
  const post = await postGlobalMessage(prisma, alice.id, 'social target')
  const msgId = post.message.id
  await toggleMessageLike(prisma, msgId, alice.id)
  await postMessageComment(prisma, msgId, bob.id, 'first!')
  await postMessageComment(prisma, msgId, carol.id, 'second!')

  const asAlice = await listGlobalFeed(prisma, 100, alice.id)
  const forAlice = asAlice.find(m => m.id === msgId)
  check('viewer who liked sees likedByMe true', forAlice?.likedByMe === true)
  check('likeCount reflects the like', forAlice?.likeCount === 1, `got ${forAlice?.likeCount}`)
  check('commentCount reflects both comments', forAlice?.commentCount === 2,
    `got ${forAlice?.commentCount}`)

  const asBob = await listGlobalFeed(prisma, 100, bob.id)
  const forBob = asBob.find(m => m.id === msgId)
  check('non-liker sees likedByMe false with the same counts',
    forBob?.likedByMe === false && forBob?.likeCount === 1 && forBob?.commentCount === 2)

  const anonymous = await listGlobalFeed(prisma, 100)
  check('no viewer → likedByMe false everywhere', anonymous.every(m => m.likedByMe === false))

  check('every message carries imageUrl + counts, never a raw _count',
    asAlice.every(m => 'imageUrl' in m && typeof m.likeCount === 'number' &&
      typeof m.commentCount === 'number' && typeof m.likedByMe === 'boolean' && !('_count' in m)))
  check('enriched sender projection is still safe',
    asAlice.every(m => m.sender && !('password' in m.sender) && !('pushToken' in m.sender)))
}

// ─── 9. toggleMessageLike ─────────────────────────────────────────────────────

console.log('\n[toggleMessageLike]')
{
  const post = await postGlobalMessage(prisma, alice.id, 'like me')
  const msgId = post.message.id

  const first = await toggleMessageLike(prisma, msgId, bob.id)
  check('first toggle likes (count 1)',
    first.ok && first.liked === true && first.likeCount === 1, JSON.stringify(first))
  const second = await toggleMessageLike(prisma, msgId, bob.id)
  check('second toggle unlikes (count 0)',
    second.ok && second.liked === false && second.likeCount === 0, JSON.stringify(second))

  await toggleMessageLike(prisma, msgId, bob.id)
  const twoUsers = await toggleMessageLike(prisma, msgId, carol.id)
  check('two likers → count 2',
    twoUsers.ok && twoUsers.liked === true && twoUsers.likeCount === 2, JSON.stringify(twoUsers))

  const ghost = await toggleMessageLike(prisma, 'no-such-message', bob.id)
  check('unknown message → Not found', ghost.ok === false && ghost.error === 'Not found')

  const { room } = await getOrCreateDirectRoom(prisma, alice.id, bob.id)
  const dmMessage = await prisma.message.findFirst({ where: { roomId: room.id } })
  const dmLike = await toggleMessageLike(prisma, dmMessage.id, bob.id)
  check('DM-room message → Not found (likes never leak into DMs)',
    dmLike.ok === false && dmLike.error === 'Not found')
  check('guard persisted no like rows for the DM message',
    (await prisma.messageLike.count({ where: { messageId: dmMessage.id } })) === 0)
}

// ─── 10. Comments ─────────────────────────────────────────────────────────────

console.log('\n[comments]')
{
  const post = await postGlobalMessage(prisma, alice.id, 'discuss')
  const msgId = post.message.id

  const c1 = await postMessageComment(prisma, msgId, bob.id, '  great point  ')
  check('comment accepted + trimmed',
    c1.ok === true && c1.comment.content === 'great point', JSON.stringify(c1).slice(0, 200))
  check('comment shape carries the safe user projection', c1.ok &&
    c1.comment.messageId === msgId && c1.comment.user.id === bob.id &&
    !('password' in c1.comment.user) && !('pushToken' in c1.comment.user) &&
    !('email' in c1.comment.user))

  // Space the second comment out so ascending-by-createdAt is deterministic
  // (same-ms creation would tie otherwise).
  await new Promise(r => setTimeout(r, 20))
  const c2 = await postMessageComment(prisma, msgId, carol.id, 'agreed')
  check('second comment accepted', c2.ok === true)

  const listed = await listMessageComments(prisma, msgId)
  check('comments listed ascending', listed.ok &&
    listed.comments.map(c => c.content).join('|') === 'great point|agreed',
    listed.ok ? listed.comments.map(c => c.content).join('|') : JSON.stringify(listed))
  check('listed comments carry safe user projections', listed.ok &&
    listed.comments.every(c => c.user && !('password' in c.user) && !('pushToken' in c.user)))

  const empty = await postMessageComment(prisma, msgId, bob.id, '   ')
  check('empty comment rejected', empty.ok === false && empty.error === 'Empty message')
  const tooLong = await postMessageComment(prisma, msgId, bob.id,
    'x'.repeat(MAX_CHAT_CONTENT_LENGTH + 1))
  check('over-long comment rejected', tooLong.ok === false && tooLong.error === 'Message too long')

  const ghostList = await listMessageComments(prisma, 'no-such-message')
  check('listing an unknown message → Not found',
    ghostList.ok === false && ghostList.error === 'Not found')

  const { room } = await getOrCreateDirectRoom(prisma, alice.id, bob.id)
  const dmMessage = await prisma.message.findFirst({ where: { roomId: room.id } })
  const dmComment = await postMessageComment(prisma, dmMessage.id, bob.id, 'sneaky')
  check('comment on DM-room message → Not found',
    dmComment.ok === false && dmComment.error === 'Not found')
  const dmList = await listMessageComments(prisma, dmMessage.id)
  check('listing DM-room comments → Not found',
    dmList.ok === false && dmList.error === 'Not found')
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

await prisma.$disconnect()
scratch.close?.()
rmSync(scratchDir, { recursive: true, force: true })

console.log(failures === 0 ? '\nHOME FEED LOGIC TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
