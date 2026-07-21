#!/usr/bin/env node
/**
 * Admin Chat "Direct Messages viewing removed" source-contract test
 * (pure Node, no server, no DB).
 *
 * Guards the removal of the admin (apps/web) Chat page's Direct-Messages
 * viewing surface — the "DIRECT MESSAGES — N CONVERSATIONS" list of DM
 * conversation cards that let an organizer read every attendee's private
 * threads. Removed 2026-07-20.
 *
 * The removal must be SURGICAL: only the DM-viewing surface goes. The Global
 * Broadcast feature (same page), the scheduled-broadcast subsystem, the Chat
 * nav entry + permission, and — critically — the attendee app's own DM system
 * (which shares packages/db/src/chat.ts) must all stay intact.
 *
 * Invariants locked in here:
 *   A. DM-viewing files are deleted:
 *      - apps/web/components/DMRoomsClient.tsx
 *      - apps/web/app/api/chat/rooms/[roomId]/route.ts  (+ the whole rooms dir)
 *   B. ChatPageClient renders ONLY Global Broadcast — no DMRoomsClient import,
 *      no `data.rooms`, no "Direct Messages" header.
 *   C. The admin chat data endpoint (app/api/data/chat) and the server page
 *      (dashboard/chat/page.tsx) no longer query DIRECT rooms or return `rooms`,
 *      but still return the Global Broadcast fields.
 *   D. The route loading skeleton drops the DM conversation-card placeholders.
 *   E. Global Broadcast + scheduled broadcasts are preserved.
 *   F. The attendee DM system is untouched: chat.ts still exports
 *      getOrCreateDirectRoom / listRoomMessagesForUser / postRoomMessage, and
 *      the attendee DM routes still exist.
 *   G. The Chat nav entry + `chat` permission key are preserved.
 *
 * Run: node scripts/test-admin-chat-dm-removed.mjs   (alias: pnpm test:chat-no-dm)
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let checks = 0
const failures = []
function ok(cond, msg) {
  checks++
  if (!cond) failures.push(msg)
}
const read = (rel) => (existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : null)
const exists = (rel) => existsSync(join(ROOT, rel))

// ── A. DM-viewing files are gone ──────────────────────────────────────────────
ok(!exists('apps/web/components/DMRoomsClient.tsx'),
  'DMRoomsClient.tsx (the DM conversation list/cards) is deleted')
ok(!exists('apps/web/app/api/chat/rooms/[roomId]/route.ts'),
  'GET /api/chat/rooms/[roomId] (admin per-room message history) is deleted')
ok(!exists('apps/web/app/api/chat/rooms'),
  'the admin app/api/chat/rooms directory is removed entirely')

// ── B. ChatPageClient renders only Global Broadcast ───────────────────────────
const chatClient = read('apps/web/components/ChatPageClient.tsx')
ok(chatClient !== null, 'ChatPageClient.tsx still exists (the Chat page shell is preserved)')
if (chatClient) {
  ok(!/DMRoomsClient/.test(chatClient), 'ChatPageClient.tsx no longer imports or renders DMRoomsClient')
  ok(!/\.rooms\b/.test(chatClient), 'ChatPageClient.tsx no longer reads data.rooms')
  ok(!/Direct Messages/i.test(chatClient), 'ChatPageClient.tsx no longer renders a "Direct Messages" header')
  ok(/<GlobalChatAdmin\b/.test(chatClient), 'ChatPageClient.tsx STILL renders <GlobalChatAdmin> (broadcast preserved)')
}

// ── C. Admin chat data sources drop DM queries, keep broadcast ────────────────
for (const rel of ['apps/web/app/api/data/chat/route.ts', 'apps/web/app/(dashboard)/dashboard/chat/page.tsx']) {
  const src = read(rel)
  ok(src !== null, `${rel} still exists`)
  if (!src) continue
  ok(!/type:\s*['"]DIRECT['"]/.test(src), `${rel}: no longer queries DIRECT (DM) rooms`)
  ok(!/\bdmRooms\b/.test(src), `${rel}: the dmRooms query variable is gone`)
  ok(!/\brooms\b/.test(src), `${rel}: no longer builds or returns a \`rooms\` field`)
  // Global Broadcast payload preserved.
  ok(/recentMessages/.test(src), `${rel}: STILL returns recentMessages (broadcast history)`)
  ok(/memberCount/.test(src) && /totalUsers/.test(src) && /messageCount/.test(src),
    `${rel}: STILL returns memberCount/totalUsers/messageCount (broadcast stats)`)
  ok(/GENERAL_ROOM_ID|room-general/.test(src), `${rel}: STILL reads the general broadcast room`)
}

// ── D. Loading skeleton drops the DM conversation-card placeholders ───────────
const loading = read('apps/web/app/(dashboard)/dashboard/chat/loading.tsx')
ok(loading !== null, 'chat/loading.tsx still exists')
if (loading) {
  ok(!/rounded-full/.test(loading), 'chat/loading.tsx: DM avatar (rounded-full) skeletons removed')
  ok(!/Array\(6\)/.test(loading), 'chat/loading.tsx: the 6 DM conversation-card skeletons removed')
  ok(/Array\(5\)/.test(loading), 'chat/loading.tsx: the broadcast message-line skeleton is preserved')
}

// ── E. Global Broadcast + scheduled broadcasts preserved ──────────────────────
ok(exists('apps/web/components/GlobalChatAdmin.tsx'), 'GlobalChatAdmin.tsx (Global Broadcast) preserved')
ok(exists('apps/web/components/ScheduledBroadcasts.tsx'), 'ScheduledBroadcasts.tsx preserved')
for (const rel of [
  'apps/web/app/api/chat/broadcast/route.ts',
  'apps/web/app/api/chat/messages/route.ts',
  'apps/web/app/api/chat/sync-members/route.ts',
  'apps/web/app/api/chat/scheduled/route.ts',
  'apps/web/app/api/chat/scheduled/[id]/route.ts',
  'apps/web/app/api/chat/scheduled/dispatch/route.ts',
]) {
  ok(exists(rel), `broadcast/scheduled route preserved: ${rel.replace('apps/web/app', '')}`)
}

// ── F. Attendee DM system untouched (shared data layer intact) ────────────────
const chatTs = read('packages/db/src/chat.ts')
ok(chatTs !== null, 'packages/db/src/chat.ts still exists (shared chat data layer)')
if (chatTs) {
  for (const fn of ['getOrCreateDirectRoom', 'listRoomMessagesForUser', 'postRoomMessage']) {
    ok(new RegExp(`export async function ${fn}\\b`).test(chatTs),
      `chat.ts STILL exports ${fn}() — attendee DMs must not be removed`)
  }
}
ok(exists('apps/attendee/app/api/chat/rooms/route.ts'),
  'attendee DM create route (POST /api/chat/rooms) preserved')
ok(exists('apps/attendee/app/api/chat/rooms/[roomId]/messages/route.ts'),
  'attendee DM messages route (/api/chat/rooms/[roomId]/messages) preserved')

// ── G. Chat nav entry + permission key preserved ──────────────────────────────
const sidebar = read('apps/web/components/Sidebar.tsx')
ok(sidebar !== null && /\/dashboard\/chat/.test(sidebar),
  'Sidebar.tsx STILL links to /dashboard/chat (the Chat page is not orphaned)')
const perms = read('apps/web/lib/permissions.ts')
ok(perms !== null && /key:\s*'chat'/.test(perms),
  "permissions.ts STILL defines the 'chat' permission key")

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\nAdmin Chat DM-removal (source contract) — ${checks} checks`)
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('\n✓ all checks passed — admin DM viewing is fully removed; Global Broadcast, scheduled broadcasts, the Chat nav/permission, and the attendee DM system are all intact.')
