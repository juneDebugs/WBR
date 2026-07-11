#!/usr/bin/env node
// Logic test for the friend-request system (packages/db/src/friends.ts) and
// its DM gate (getOrCreateDirectRoom in packages/db/src/chat.ts).
// No server needed — exercises the shared functions against a scratch SQLite
// database whose DDL is cloned from the real dev DB, so schema drift between
// the app and this test is impossible. Friendship = MUTUAL Follow edges.
//
// What this verifies:
//   1. Lifecycle: A request → A pending_outgoing / B pending_incoming;
//      B accept → 'friends' both sides; areFriends true in both argument
//      orders; listFriendIds mutual for both; exactly two Follow edges.
//   2. Cancel: requester's auto action while pending_outgoing cancels the
//      request — both sides back to 'none', no Follow rows left.
//   3. Decline: target deletes the incoming request — both sides 'none';
//      the requester can re-request afterwards.
//   4. Auto-advance inference (no explicit action): none→request,
//      pending_outgoing→cancel, pending_incoming→accept, friends→no-op
//      ({ ok: true, status: 'friends' }, edges untouched).
//   5. Remove: unfriending from either side deletes BOTH edges; idempotent
//      when repeated; listFriendIds reflects the unfriend.
//   6. Errors: self target ('Cannot friend yourself'), unknown target
//      ('User not found'), cancel/decline while friends → error mentioning
//      remove, with the friendship left intact; unknown action rejected.
//   7. getFriendStatuses map: a user with one counterpart of each kind
//      simultaneously — friends / pending_outgoing / pending_incoming present,
//      strangers ('none') absent; counterpart views mirror correctly.
//   8. DM gate: getOrCreateDirectRoom refuses non-friends (and merely-pending
//      pairs) with code NOT_FRIENDS and creates no room; once friends it
//      creates a room (idempotent in both argument orders); after unfriending
//      the EXISTING room is still returned and still accepts messages; a
//      fresh never-friends pair stays blocked.
//   9. Mutual-request race: both sides auto → friends; and after a reset,
//      explicit 'request' from both sides also lands on 'friends' with
//      exactly two edges (a counter-request IS an accept).
//  10. '@conference/db' re-exports the friends module (packages/db/src/index.ts).
//
//   node scripts/test-friends.mjs
//
// Exits 0 on all-pass, 1 on failure.

import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
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
  getFriendStatus,
  getFriendStatuses,
  areFriends,
  listFriendIds,
  applyFriendAction,
} = await import(join(ROOT, 'packages/db/src/friends.ts'))
const { getOrCreateDirectRoom, postRoomMessage } = await import(
  join(ROOT, 'packages/db/src/chat.ts')
)

// ─── 10. '@conference/db' re-export (static check, no client side effects) ───

console.log('[@conference/db re-export]')
{
  const indexSrc = readFileSync(join(ROOT, 'packages/db/src/index.ts'), 'utf8')
  check("index.ts re-exports './friends'",
    /export\s+\*\s+from\s+['"]\.\/friends['"]/.test(indexSrc))
}

// ─── Scratch database (DDL cloned from the real dev DB) ──────────────────────

const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')

const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-friends-test-'))
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

// Precondition: the cloned DDL must contain the Follow table the friend
// system is built on. Guards against silently "passing" against a stale DB.
{
  const tables = await scratch.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Follow'`
  )
  if (tables.rows.length !== 1) {
    console.error(`\n✗ ${SOURCE_DB} lacks the Follow table the friend system uses.`)
    console.error('  Run `npx prisma db push` (schema packages/db/prisma/schema.prisma) first.')
    process.exit(1)
  }
}

process.env.DATABASE_URL = `file:${scratchPath}`
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
const { PrismaClient } = req('@prisma/client')
const prisma = new PrismaClient()

async function mkUser(name) {
  return prisma.user.create({
    data: { email: `friends-${name.toLowerCase()}@example.com`, name, role: 'ATTENDEE' },
  })
}
const alice = await mkUser('Alice')
const bob = await mkUser('Bob')
const carol = await mkUser('Carol')
const dave = await mkUser('Dave')
const erin = await mkUser('Erin')
const frank = await mkUser('Frank')
const grace = await mkUser('Grace')
const mia = await mkUser('Mia')
const wendy = await mkUser('Wendy')
const xavier = await mkUser('Xavier')
const yara = await mkUser('Yara')
const zack = await mkUser('Zack')
const pat = await mkUser('Pat')
const quinn = await mkUser('Quinn')

// Follow rows between a pair, either direction (2 = friends, 1 = pending).
const edgeCount = (a, b) =>
  prisma.follow.count({
    where: {
      OR: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a },
      ],
    },
  })

// ─── 1. Full lifecycle: request → accept → friends ───────────────────────────

console.log('\n[lifecycle: request → accept]')
{
  check('strangers start at none in both directions',
    (await getFriendStatus(prisma, alice.id, bob.id)) === 'none' &&
    (await getFriendStatus(prisma, bob.id, alice.id)) === 'none')

  const requested = await applyFriendAction(prisma, alice.id, bob.id, 'request')
  check('request accepted → pending_outgoing',
    requested.ok === true && requested.status === 'pending_outgoing', JSON.stringify(requested))
  check('requester sees pending_outgoing',
    (await getFriendStatus(prisma, alice.id, bob.id)) === 'pending_outgoing')
  check('target sees pending_incoming',
    (await getFriendStatus(prisma, bob.id, alice.id)) === 'pending_incoming')
  check('a pending pair is not friends yet',
    (await areFriends(prisma, alice.id, bob.id)) === false)
  check('exactly one Follow edge persisted (A→B only)',
    (await prisma.follow.count({ where: { followerId: alice.id, followingId: bob.id } })) === 1 &&
    (await prisma.follow.count({ where: { followerId: bob.id, followingId: alice.id } })) === 0)
  check('pending friendship excluded from listFriendIds',
    !(await listFriendIds(prisma, alice.id)).includes(bob.id) &&
    !(await listFriendIds(prisma, bob.id)).includes(alice.id))

  const accepted = await applyFriendAction(prisma, bob.id, alice.id, 'accept')
  check('accept → friends', accepted.ok === true && accepted.status === 'friends',
    JSON.stringify(accepted))
  check('both sides now see friends',
    (await getFriendStatus(prisma, alice.id, bob.id)) === 'friends' &&
    (await getFriendStatus(prisma, bob.id, alice.id)) === 'friends')
  check('areFriends true in both argument orders',
    (await areFriends(prisma, alice.id, bob.id)) === true &&
    (await areFriends(prisma, bob.id, alice.id)) === true)
  check('listFriendIds mutual for both users',
    (await listFriendIds(prisma, alice.id)).includes(bob.id) &&
    (await listFriendIds(prisma, bob.id)).includes(alice.id))
  check('exactly two Follow edges for the pair',
    (await edgeCount(alice.id, bob.id)) === 2)
}

// ─── 2. Cancel (auto action from the requester) ───────────────────────────────

console.log('\n[cancel]')
{
  await applyFriendAction(prisma, alice.id, carol.id, 'request')
  const cancelled = await applyFriendAction(prisma, alice.id, carol.id) // auto → cancel
  check('auto action while pending_outgoing cancels → none',
    cancelled.ok === true && cancelled.status === 'none', JSON.stringify(cancelled))
  check('both sides back to none after cancel',
    (await getFriendStatus(prisma, alice.id, carol.id)) === 'none' &&
    (await getFriendStatus(prisma, carol.id, alice.id)) === 'none')
  check('cancel left no Follow rows', (await edgeCount(alice.id, carol.id)) === 0)
}

// ─── 3. Decline ───────────────────────────────────────────────────────────────

console.log('\n[decline]')
{
  await applyFriendAction(prisma, alice.id, carol.id, 'request')
  const declined = await applyFriendAction(prisma, carol.id, alice.id, 'decline')
  check('decline → none (target view)',
    declined.ok === true && declined.status === 'none', JSON.stringify(declined))
  check('requester also back to none after decline',
    (await getFriendStatus(prisma, alice.id, carol.id)) === 'none')
  check('decline removed the edge', (await edgeCount(alice.id, carol.id)) === 0)

  const again = await applyFriendAction(prisma, alice.id, carol.id, 'request')
  check('re-request after decline works',
    again.ok === true && again.status === 'pending_outgoing', JSON.stringify(again))
  await applyFriendAction(prisma, alice.id, carol.id, 'cancel') // leave the pair clean
}

// ─── 4. Auto-advance inference (no explicit action) ──────────────────────────

console.log('\n[auto-advance]')
{
  const step1 = await applyFriendAction(prisma, bob.id, carol.id)
  check('auto from none → request (pending_outgoing)',
    step1.ok === true && step1.status === 'pending_outgoing', JSON.stringify(step1))
  const step2 = await applyFriendAction(prisma, bob.id, carol.id)
  check('auto again from the requester → cancel (none)',
    step2.ok === true && step2.status === 'none', JSON.stringify(step2))
  const step3 = await applyFriendAction(prisma, bob.id, carol.id)
  check('auto re-request → pending_outgoing',
    step3.ok === true && step3.status === 'pending_outgoing')
  const step4 = await applyFriendAction(prisma, carol.id, bob.id)
  check('auto on pending_incoming → accept (friends)',
    step4.ok === true && step4.status === 'friends', JSON.stringify(step4))
  const noop = await applyFriendAction(prisma, bob.id, carol.id)
  check('auto when friends → no-op keeps friends',
    noop.ok === true && noop.status === 'friends', JSON.stringify(noop))
  check('no-op left both edges and both statuses intact',
    (await edgeCount(bob.id, carol.id)) === 2 &&
    (await getFriendStatus(prisma, carol.id, bob.id)) === 'friends')
}

// ─── 5. Remove ────────────────────────────────────────────────────────────────

console.log('\n[remove]')
{
  // bob–carol are friends from the auto-advance section (carol accepted).
  const removed = await applyFriendAction(prisma, carol.id, bob.id, 'remove')
  check('remove → none', removed.ok === true && removed.status === 'none',
    JSON.stringify(removed))
  check('both sides none, both edges gone',
    (await getFriendStatus(prisma, bob.id, carol.id)) === 'none' &&
    (await getFriendStatus(prisma, carol.id, bob.id)) === 'none' &&
    (await edgeCount(bob.id, carol.id)) === 0)
  const again = await applyFriendAction(prisma, carol.id, bob.id, 'remove')
  check('remove is idempotent', again.ok === true && again.status === 'none',
    JSON.stringify(again))

  // alice–bob are friends from the lifecycle section (alice requested) —
  // remove from the requester side works too.
  const otherSide = await applyFriendAction(prisma, alice.id, bob.id, 'remove')
  check('remove works from the other side of a friendship',
    otherSide.ok === true && otherSide.status === 'none' &&
    (await edgeCount(alice.id, bob.id)) === 0)
  check('listFriendIds reflects the unfriend',
    !(await listFriendIds(prisma, alice.id)).includes(bob.id) &&
    !(await listFriendIds(prisma, bob.id)).includes(alice.id))
}

// ─── 6. Errors ────────────────────────────────────────────────────────────────

console.log('\n[errors]')
{
  const self = await applyFriendAction(prisma, alice.id, alice.id, 'request')
  check('self target rejected',
    self.ok === false && self.error === 'Cannot friend yourself', JSON.stringify(self))
  const selfAuto = await applyFriendAction(prisma, alice.id, alice.id)
  check('self target rejected with auto action too',
    selfAuto.ok === false && selfAuto.error === 'Cannot friend yourself')
  const ghost = await applyFriendAction(prisma, alice.id, 'no-such-user')
  check('unknown target rejected',
    ghost.ok === false && ghost.error === 'User not found', JSON.stringify(ghost))

  // cancel / decline are invalid once friends — unfriending must be explicit.
  await applyFriendAction(prisma, frank.id, grace.id, 'request')
  await applyFriendAction(prisma, grace.id, frank.id, 'accept')
  const badCancel = await applyFriendAction(prisma, frank.id, grace.id, 'cancel')
  check('cancel while friends → error mentioning remove',
    badCancel.ok === false && /remove/i.test(badCancel.error ?? ''), JSON.stringify(badCancel))
  const badDecline = await applyFriendAction(prisma, grace.id, frank.id, 'decline')
  check('decline while friends → error mentioning remove',
    badDecline.ok === false && /remove/i.test(badDecline.error ?? ''), JSON.stringify(badDecline))
  check('failed cancel/decline left the friendship intact',
    (await areFriends(prisma, frank.id, grace.id)) === true &&
    (await edgeCount(frank.id, grace.id)) === 2)

  const badAction = await applyFriendAction(prisma, frank.id, grace.id, 'destroy')
  check('unknown action rejected', badAction.ok === false, JSON.stringify(badAction))
}

// ─── 7. getFriendStatuses map (one of each kind simultaneously) ──────────────

console.log('\n[getFriendStatuses]')
{
  // mia: wendy = friends, xavier = pending_outgoing, yara = pending_incoming,
  // zack = none (absent from the map).
  await applyFriendAction(prisma, mia.id, wendy.id, 'request')
  await applyFriendAction(prisma, wendy.id, mia.id, 'accept')
  await applyFriendAction(prisma, mia.id, xavier.id, 'request')
  await applyFriendAction(prisma, yara.id, mia.id, 'request')

  const map = await getFriendStatuses(prisma, mia.id)
  check('friend counterpart → friends', map[wendy.id] === 'friends', JSON.stringify(map))
  check('requested counterpart → pending_outgoing', map[xavier.id] === 'pending_outgoing')
  check('requesting counterpart → pending_incoming', map[yara.id] === 'pending_incoming')
  check('stranger absent from the map', !(zack.id in map))
  check('map holds exactly the three related users', Object.keys(map).length === 3,
    JSON.stringify(map))

  check('counterpart views mirror correctly',
    (await getFriendStatuses(prisma, wendy.id))[mia.id] === 'friends' &&
    (await getFriendStatuses(prisma, xavier.id))[mia.id] === 'pending_incoming' &&
    (await getFriendStatuses(prisma, yara.id))[mia.id] === 'pending_outgoing')
  const miaFriends = await listFriendIds(prisma, mia.id)
  check('listFriendIds returns exactly the mutual friend',
    miaFriends.length === 1 && miaFriends[0] === wendy.id, JSON.stringify(miaFriends))
}

// ─── 8. DM gate (getOrCreateDirectRoom is friends-only for NEW rooms) ────────

console.log('\n[dm gate]')
{
  const blocked = await getOrCreateDirectRoom(prisma, dave.id, erin.id)
  check('non-friends cannot open a DM (NOT_FRIENDS)',
    blocked.ok === false && blocked.code === 'NOT_FRIENDS' &&
    blocked.error === 'You must be friends to message', JSON.stringify(blocked))
  check('blocked attempt created no room',
    (await prisma.chatRoom.count({ where: { type: 'DIRECT' } })) === 0)

  await applyFriendAction(prisma, dave.id, erin.id, 'request')
  const pendingBlocked = await getOrCreateDirectRoom(prisma, dave.id, erin.id)
  check('a merely-pending pair is still blocked',
    pendingBlocked.ok === false && pendingBlocked.code === 'NOT_FRIENDS')

  await applyFriendAction(prisma, erin.id, dave.id, 'accept')
  const created = await getOrCreateDirectRoom(prisma, dave.id, erin.id)
  check('friends can open a DM room',
    created.ok === true && created.room.type === 'DIRECT', JSON.stringify(created))
  const again = await getOrCreateDirectRoom(prisma, dave.id, erin.id)
  check('same pair → same room (idempotent)',
    again.ok === true && again.room.id === created.room.id)
  const reversed = await getOrCreateDirectRoom(prisma, erin.id, dave.id)
  check('reversed args → same room',
    reversed.ok === true && reversed.room.id === created.room.id)

  await applyFriendAction(prisma, dave.id, erin.id, 'remove')
  check('pair unfriended for the survival check',
    (await getFriendStatus(prisma, erin.id, dave.id)) === 'none')
  const survivor = await getOrCreateDirectRoom(prisma, dave.id, erin.id)
  check('EXISTING room still returned after unfriending',
    survivor.ok === true && survivor.room.id === created.room.id, JSON.stringify(survivor))
  const survivorReversed = await getOrCreateDirectRoom(prisma, erin.id, dave.id)
  check('existing room survives in the reversed order too',
    survivorReversed.ok === true && survivorReversed.room.id === created.room.id)
  const post = await postRoomMessage(prisma, created.room.id, erin.id, 'still works')
  check('surviving room still accepts messages',
    post.ok === true, JSON.stringify(post))

  const fresh = await getOrCreateDirectRoom(prisma, zack.id, erin.id)
  check('a fresh never-friends pair is still blocked',
    fresh.ok === false && fresh.code === 'NOT_FRIENDS', JSON.stringify(fresh))
  check('exactly one DIRECT room exists in total',
    (await prisma.chatRoom.count({ where: { type: 'DIRECT' } })) === 1)
}

// ─── 9. Mutual-request race ───────────────────────────────────────────────────

console.log('\n[mutual request]')
{
  // Both sides auto: pat auto-requests, quinn's auto lands on accept.
  const first = await applyFriendAction(prisma, pat.id, quinn.id)
  check('first auto → pending_outgoing',
    first.ok === true && first.status === 'pending_outgoing')
  const second = await applyFriendAction(prisma, quinn.id, pat.id)
  check('counter auto → friends', second.ok === true && second.status === 'friends',
    JSON.stringify(second))

  // Reset, then EXPLICIT 'request' from both sides — a counter-request IS an
  // accept (mutual edges via two requests), and nothing duplicates.
  await applyFriendAction(prisma, pat.id, quinn.id, 'remove')
  await applyFriendAction(prisma, pat.id, quinn.id, 'request')
  const counter = await applyFriendAction(prisma, quinn.id, pat.id, 'request')
  check("explicit counter-request lands on friends",
    counter.ok === true && counter.status === 'friends', JSON.stringify(counter))
  check('both see friends with exactly two edges (no duplicates)',
    (await areFriends(prisma, pat.id, quinn.id)) === true &&
    (await areFriends(prisma, quinn.id, pat.id)) === true &&
    (await edgeCount(pat.id, quinn.id)) === 2)
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

await prisma.$disconnect()
scratch.close?.()
rmSync(scratchDir, { recursive: true, force: true })

console.log(failures === 0 ? '\nFRIENDS LOGIC TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
