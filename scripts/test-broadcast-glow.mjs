#!/usr/bin/env node
// Logic + wiring test for the admin global-broadcast glow.
//
// Goal under test: when an admin posts a global message (admin app → Chat →
// "Global Broadcast"), it renders in the attendee mobile feed with a glow
// around its perimeter. There is no per-message broadcast flag — the only
// signal is that the sender holds an admin role — so this test pins down the
// whole chain that makes the glow appear for exactly those posts:
//
//   1. isAdminBroadcastRole (packages/db/src/broadcast.ts) is the canonical
//      predicate: STAFF/ORGANIZER/ADMIN → true; ATTENDEE/SPEAKER/null/'' → no.
//   2. The three lists that must agree stay in sync — the canonical role set,
//      the admin app's broadcast-route auth gate, and the attendee client's
//      hand-copied mirror in FeedTab.tsx. Any drift = a broadcast that either
//      never glows or an attendee post that wrongly does.
//   3. The read path the mobile feed uses (listGlobalFeed → CHAT_SENDER_SELECT)
//      now exposes sender.role — WITHOUT leaking credentials — so the client
//      can tell an admin broadcast apart. Verified against a scratch DB whose
//      DDL is cloned from the real dev DB (schema drift is impossible), for
//      both a route-created broadcast and an ordinary attendee post.
//   4. The glow token (.feed-broadcast) exists in the shared UI preset.
//   5. FeedTab.tsx wires it: role in the payload type, the mirrored predicate,
//      the conditional `feed-broadcast` class + data-broadcast attribute, and
//      an sr-only label so the cue is not purely visual (HIG accessibility).
//
//   node scripts/test-broadcast-glow.mjs
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

const { ADMIN_BROADCAST_ROLES, isAdminBroadcastRole } = await import(
  join(ROOT, 'packages/db/src/broadcast.ts')
)

// ─── 1. isAdminBroadcastRole predicate ───────────────────────────────────────

console.log('[isAdminBroadcastRole]')
{
  check('STAFF is a broadcast', isAdminBroadcastRole('STAFF') === true)
  check('ORGANIZER is a broadcast', isAdminBroadcastRole('ORGANIZER') === true)
  check('ADMIN is a broadcast', isAdminBroadcastRole('ADMIN') === true)
  check('ATTENDEE is NOT a broadcast', isAdminBroadcastRole('ATTENDEE') === false)
  check('SPEAKER is NOT a broadcast', isAdminBroadcastRole('SPEAKER') === false)
  check('null is NOT a broadcast (legacy rows)', isAdminBroadcastRole(null) === false)
  check('undefined is NOT a broadcast', isAdminBroadcastRole(undefined) === false)
  check('empty string is NOT a broadcast', isAdminBroadcastRole('') === false)
  check('unknown role is NOT a broadcast', isAdminBroadcastRole('MODERATOR') === false)
  check('case-sensitive (staff ≠ STAFF)', isAdminBroadcastRole('staff') === false)
  check('canonical list is exactly STAFF/ORGANIZER/ADMIN',
    JSON.stringify([...ADMIN_BROADCAST_ROLES].sort()) ===
      JSON.stringify(['ADMIN', 'ORGANIZER', 'STAFF']))
}

// ─── 2. Cross-file role-list sync (no drift) ─────────────────────────────────

console.log('\n[role-list sync]')
{
  const canonical = JSON.stringify([...ADMIN_BROADCAST_ROLES].sort())

  // a) Admin broadcast route auth gate — the roles allowed to POST a broadcast.
  const routeSrc = readFileSync(
    join(ROOT, 'apps/web/app/api/chat/broadcast/route.ts'), 'utf8')
  const routeMatch = routeSrc.match(/\[\s*'STAFF'[^\]]*\]\.includes\(role\)/)
  check('broadcast route gates on a role list', routeMatch != null)
  const routeRoles = routeMatch
    ? JSON.stringify([...routeMatch[0].matchAll(/'([A-Z]+)'/g)].map(m => m[1]).sort())
    : null
  check('broadcast-route gate === canonical roles', routeRoles === canonical,
    `route=${routeRoles} canonical=${canonical}`)

  // b) Attendee client mirror in FeedTab.tsx.
  const feedSrc = readFileSync(
    join(ROOT, 'apps/attendee/components/people/FeedTab.tsx'), 'utf8')
  const mirrorMatch = feedSrc.match(/const ADMIN_BROADCAST_ROLES\s*=\s*\[([^\]]*)\]/)
  check('FeedTab declares a mirrored role list', mirrorMatch != null)
  const mirrorRoles = mirrorMatch
    ? JSON.stringify([...mirrorMatch[1].matchAll(/'([A-Z]+)'/g)].map(m => m[1]).sort())
    : null
  check('FeedTab mirror === canonical roles', mirrorRoles === canonical,
    `mirror=${mirrorRoles} canonical=${canonical}`)
}

// ─── 3. Read path exposes sender.role without leaking credentials ────────────

const { CHAT_SENDER_SELECT, postGlobalMessage, listGlobalFeed } =
  await import(join(ROOT, 'packages/db/src/chat.ts'))
const { GENERAL_ROOM_ID } = await import(
  join(ROOT, 'packages/db/src/scheduled-messages.ts'))

console.log('\n[CHAT_SENDER_SELECT projection]')
{
  check('projection includes role', CHAT_SENDER_SELECT.role === true)
  check('projection still omits password', !('password' in CHAT_SENDER_SELECT))
  check('projection still omits pushToken', !('pushToken' in CHAT_SENDER_SELECT))
}

// Scratch database — DDL cloned from the real dev DB (schema drift impossible).
const req = createRequire(join(ROOT, 'packages/db/package.json'))
const { createClient } = req('@libsql/client')
const scratchDir = mkdtempSync(join(tmpdir(), 'wbr-broadcast-test-'))
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
scratch.close?.()

process.env.DATABASE_URL = `file:${scratchPath}`
delete process.env.TURSO_DATABASE_URL
delete process.env.TURSO_AUTH_TOKEN
const { PrismaClient } = req('@prisma/client')
const prisma = new PrismaClient()

console.log('\n[listGlobalFeed — admin broadcast vs attendee post]')
try {
  const organizer = await prisma.user.create({
    data: {
      email: 'bcast-organizer@example.com', name: 'Ops Team', role: 'ORGANIZER',
      password: 'secret-hash', pushToken: 'secret-token',
    },
  })
  const attendee = await prisma.user.create({
    data: { email: 'bcast-attendee@example.com', name: 'Regular Reg', role: 'ATTENDEE' },
  })

  // Attendee post via the shared helper the attendee app uses.
  await postGlobalMessage(prisma, attendee.id, 'just an attendee saying hi')

  // Admin broadcast — created exactly as apps/web .../chat/broadcast/route.ts
  // does: an ordinary Message row in the general room, sender = the admin.
  await prisma.chatMember.upsert({
    where: { roomId_userId: { roomId: GENERAL_ROOM_ID, userId: organizer.id } },
    create: { roomId: GENERAL_ROOM_ID, userId: organizer.id },
    update: {},
  })
  await prisma.message.create({
    data: { roomId: GENERAL_ROOM_ID, senderId: organizer.id, content: 'Doors open at 9am!' },
  })

  const feed = await listGlobalFeed(prisma, 100, attendee.id)
  const bcast = feed.find(m => m.content === 'Doors open at 9am!')
  const normal = feed.find(m => m.content === 'just an attendee saying hi')

  check('both posts are in the feed', !!bcast && !!normal)
  check('broadcast sender carries its role', bcast?.sender?.role === 'ORGANIZER')
  check('broadcast is detected as an admin broadcast',
    isAdminBroadcastRole(bcast?.sender?.role) === true)
  check('attendee sender carries its role', normal?.sender?.role === 'ATTENDEE')
  check('attendee post is NOT detected as a broadcast',
    isAdminBroadcastRole(normal?.sender?.role) === false)
  check('no password leaked in feed payload',
    !JSON.stringify(feed).includes('secret-hash'))
  check('no pushToken leaked in feed payload',
    !JSON.stringify(feed).includes('secret-token'))
} finally {
  await prisma.$disconnect()
  rmSync(scratchDir, { recursive: true, force: true })
}

// ─── 4. Glow token exists in the shared UI preset ────────────────────────────

console.log('\n[UI preset glow token]')
{
  const preset = readFileSync(join(ROOT, 'packages/ui/preset.cjs'), 'utf8')
  check('FEED_BROADCAST_GLOW box-shadow is defined',
    /const FEED_BROADCAST_GLOW\s*=\s*\[/.test(preset))
  check('.feed-broadcast component class exists',
    /'\.feed-broadcast':\s*\{\s*boxShadow:\s*FEED_BROADCAST_GLOW/.test(preset))
}

// ─── 5. FeedTab render wiring ────────────────────────────────────────────────

console.log('\n[FeedTab render wiring]')
{
  const feed = readFileSync(
    join(ROOT, 'apps/attendee/components/people/FeedTab.tsx'), 'utf8')
  check('FeedSender type carries role', /role\?:\s*string\s*\|\s*null/.test(feed))
  check('computes isBroadcast from the sender role',
    /const isBroadcast = isAdminBroadcast\(msg\.sender\.role\)/.test(feed))
  check('applies the feed-broadcast glow class conditionally',
    /isBroadcast[\s\S]{0,80}feed-broadcast/.test(feed))
  check('exposes data-broadcast for the broadcast post',
    /data-broadcast=\{isBroadcast \? 'true' : undefined\}/.test(feed))
  check('adds an sr-only announcement label (a11y, not purely visual)',
    /sr-only[^>]*>\s*Announcement from the organizers/.test(feed) ||
    /isBroadcast &&[\s\S]{0,120}sr-only[\s\S]{0,60}Announcement/.test(feed))
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('')
if (failures === 0) {
  console.log('✓ all broadcast-glow checks passed')
  process.exit(0)
} else {
  console.error(`✗ ${failures} broadcast-glow check(s) failed`)
  process.exit(1)
}
