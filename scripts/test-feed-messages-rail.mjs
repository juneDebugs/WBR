#!/usr/bin/env node
/**
 * Feed "Messages rail" source-contract test (pure Node, no server, no DB).
 *
 * Guards the 2026-07 rewrite of the People → Feed stories rail: the retired
 * Instagram-style "Your story" rail (composer tile + random people linking to
 * /people/<id>) is replaced by a MESSAGES rail — a "Messages" entry tile that
 * jumps to the Messages tab, followed by the user's actual DM conversations,
 * each opening the DM chat modal directly.
 *
 * Invariants locked in here:
 *   1. FeedTab.tsx no longer contains "Your story" anywhere.
 *   2. First rail tile is a <button> labeled "Messages" whose onClick is
 *      onOpenMessages; FeedTabProps declares onOpenMessages: () => void and
 *      conversations: Conversation[].
 *   3. Conversation tiles are <button> elements (NOT <Link href="/people/...">)
 *      keyed by convo.roomId, whose onClick calls onOpenDm(person).
 *   4. The rail data source is the `conversations` prop: railConversations
 *      filters `c.userId && c.userId !== currentUserId`, slices to 15, and
 *      does NOT re-sort (preserves the API's most-recent-first order).
 *   5. A fallback Person is built from convo fields (id/name/image) in BOTH
 *      FeedTab.tsx (rail) and PeopleClient.tsx (Messages tab rows), so a
 *      thread whose user isn't in the loaded people page still opens.
 *   6. `export interface Conversation` lives in FeedTab.tsx with exactly the
 *      fields the API returns (roomId, userId, name, image, lastMessage,
 *      lastMessageSenderId, lastMessageAt) — cross-checked against the
 *      conversation mapping in apps/attendee/app/api/data/people/route.ts so
 *      the shapes can't silently drift. PeopleClient imports the type and does
 *      NOT redeclare it.
 *   7. PeopleClient passes conversations={conversations} and
 *      onOpenMessages={() => setTab('Messages')} to <FeedTab>.
 *   8. HIG/accessibility: rail buttons carry aria-labels (Messages entry +
 *      per-conversation), the count badge is aria-hidden (count lives in the
 *      button's aria-label), badge caps at '9+', and tiles keep the
 *      w-[72px] / w-16 h-16 (64px ≥ 44pt) touch-target sizing.
 *   9. The Messages tab in PeopleClient still renders filteredConvos and opens
 *      the DM modal via setSelected — rail and tab share the same data.
 *
 * Run: node scripts/test-feed-messages-rail.mjs   (alias: pnpm test:feed:rail)
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let checks = 0
const failures = []
function ok(cond, msg) {
  checks++
  if (!cond) failures.push(msg)
}

// Slice src between two markers (start inclusive). Returns '' when not found
// so downstream regex checks fail with their own messages.
function section(src, startMarker, endMarker, label) {
  const start = src.indexOf(startMarker)
  ok(start !== -1, `${label}: start marker ${JSON.stringify(startMarker)} found`)
  if (start === -1) return ''
  const end = src.indexOf(endMarker, start + startMarker.length)
  ok(end !== -1, `${label}: end marker ${JSON.stringify(endMarker)} found`)
  if (end === -1) return ''
  return src.slice(start, end)
}

const feedTab = readFileSync(join(ROOT, 'apps/attendee/components/people/FeedTab.tsx'), 'utf8')
const peopleClient = readFileSync(join(ROOT, 'apps/attendee/components/people/PeopleClient.tsx'), 'utf8')
const route = readFileSync(join(ROOT, 'apps/attendee/app/api/data/people/route.ts'), 'utf8')

// ── 1. The stories rail is gone ───────────────────────────────────────────────
ok(!feedTab.includes('Your story'), 'FeedTab.tsx contains no "Your story" tile (stories rail retired)')

// ── 2. FeedTabProps contract + the "Messages" entry tile ──────────────────────
const propsBlock = section(feedTab, 'export interface FeedTabProps {', '\n}', 'FeedTabProps')
ok(/^\s*onOpenMessages:\s*\(\)\s*=>\s*void$/m.test(propsBlock),
  'FeedTabProps declares onOpenMessages: () => void')
ok(/^\s*conversations:\s*Conversation\[\]$/m.test(propsBlock),
  'FeedTabProps declares conversations: Conversation[]')

// The rail lives between the "Messages rail" comment and the "Posts" comment.
const rail = section(feedTab, '{/* Messages rail', '{/* Posts */}', 'rail markup')
ok(/<button[^]*?onClick=\{onOpenMessages\}/.test(rail),
  'rail: first tile is a <button> whose onClick is onOpenMessages')
ok(/>Messages<\/span>/.test(rail), 'rail: entry tile is labeled "Messages"')

// ── 3. Conversation tiles: buttons keyed by roomId, opening the DM modal ──────
ok(/railConversations\.map\(\(\{\s*convo,\s*person\s*\}\)\s*=>\s*\(\s*<button/.test(rail),
  'rail: conversation tiles are <button> elements mapped from railConversations')
ok(/key=\{convo\.roomId\}/.test(rail), 'rail: conversation tiles are keyed by convo.roomId')
ok(/onClick=\{\(\)\s*=>\s*onOpenDm\(person\)\}/.test(rail),
  'rail: tapping a conversation tile calls onOpenDm(person)')
ok(!/<Link\b/.test(rail), 'rail: contains NO <Link> elements (tiles no longer navigate away)')
ok(!/\/people\//.test(rail), 'rail: contains NO /people/<id> profile hrefs')

// ── 4. Rail data source: the conversations prop, unfiltered order ─────────────
const memo = section(feedTab, 'const railConversations = useMemo(() => {',
  '}, [conversations, friends, people, currentUserId])', 'railConversations memo')
ok(/return conversations\b/.test(memo), 'railConversations is derived from the `conversations` prop')
ok(/\.filter\(c => c\.userId && c\.userId !== currentUserId\)/.test(memo),
  'railConversations filters out empty userId and the current user')
ok(/\.slice\(0,\s*15\)/.test(memo), 'railConversations caps the rail at 15 tiles')
ok(!/\.sort\(/.test(memo),
  'railConversations does NOT re-sort (preserves the API\'s most-recent-first order)')

// ── 5. Fallback Person from convo fields, in both surfaces ────────────────────
ok(/id:\s*c\.userId,\s*\n\s*name:\s*c\.name,\s*\n\s*image:\s*c\.image,/.test(memo),
  'FeedTab rail: fallback Person is built from convo fields (id/name/image)')
ok(/id:\s*convo\.userId,\s*\n\s*name:\s*convo\.name,\s*\n\s*image:\s*convo\.image,/.test(peopleClient),
  'PeopleClient Messages tab: fallback Person is built from convo fields (id/name/image)')

// ── 6. One Conversation type, shape-locked to the API ─────────────────────────
const EXPECTED_FIELDS = ['roomId', 'userId', 'name', 'image', 'lastMessage', 'lastMessageSenderId', 'lastMessageAt']

const convoIface = section(feedTab, 'export interface Conversation {', '\n}', 'Conversation interface')
ok(convoIface.length > 0, 'FeedTab.tsx exports `interface Conversation`')
const ifaceFields = [...convoIface.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1])
ok(ifaceFields.length === EXPECTED_FIELDS.length &&
  EXPECTED_FIELDS.every(f => ifaceFields.includes(f)),
  `Conversation interface has exactly the API's fields [${EXPECTED_FIELDS.join(', ')}] (got [${ifaceFields.join(', ')}])`)

// The API route's conversation mapping must emit the same field names.
const mapping = section(route, 'const conversations = dmRooms', 'return NextResponse.json', 'route conversation mapping')
for (const f of EXPECTED_FIELDS) {
  ok(new RegExp(`\\b${f}:`).test(mapping),
    `api/data/people conversation mapping emits \`${f}\` (shape matches Conversation)`)
}

ok(/import\s*\{[^}]*type Conversation[^}]*\}\s*from\s*'\.\/FeedTab'/.test(peopleClient),
  "PeopleClient imports `type Conversation` from './FeedTab'")
ok(!/interface Conversation\b/.test(peopleClient),
  'PeopleClient does NOT redeclare a local `interface Conversation`')

// ── 7. PeopleClient wires the rail's props into <FeedTab> ─────────────────────
const feedTabUse = section(peopleClient, '<FeedTab', '/>', '<FeedTab> usage')
ok(/conversations=\{conversations\}/.test(feedTabUse),
  '<FeedTab> receives conversations={conversations} (same array as the Messages tab)')
ok(/onOpenMessages=\{\(\)\s*=>\s*setTab\('Messages'\)\}/.test(feedTabUse),
  "<FeedTab> receives onOpenMessages={() => setTab('Messages')}")

// ── 8. HIG / accessibility affordances ────────────────────────────────────────
// Badge + label count from railConvoCount — only conversations the rail can
// actually represent (orphaned rooms with userId '' are excluded), never the
// raw conversations.length.
ok(/const railConvoCount = useMemo\(\s*\(\) => conversations\.filter\(c => c\.userId && c\.userId !== currentUserId\)\.length/.test(feedTab),
  'railConvoCount counts only representable conversations (filters empty userId + self)')
ok(/onClick=\{onOpenMessages\}[^]*?aria-label=\{railConvoCount > 0/.test(rail),
  'rail: Messages entry tile carries an aria-label that includes the conversation count')
ok(/aria-label=\{`Open conversation with \$\{person\.name \?\? 'attendee'\}`\}/.test(rail),
  'rail: every conversation tile carries an "Open conversation with <name>" aria-label')
// The visual badge is redundant with the aria-label, so it must be aria-hidden.
const badge = section(rail, 'railConvoCount > 0 && (', ')}', 'count badge')
ok(/aria-hidden="true"/.test(badge), 'rail: the count badge is aria-hidden (count lives in the aria-label)')
ok(/railConvoCount > 9 \? '9\+' : railConvoCount/.test(badge),
  "rail: the count badge caps its display at '9+'")
ok((rail.match(/w-\[72px\]/g) || []).length >= 2,
  'rail: both tile kinds keep the w-[72px] column width')
ok((rail.match(/w-16 h-16/g) || []).length >= 2,
  'rail: both tile kinds keep the w-16 h-16 (64px ≥ 44pt) touch target')

// ── 9. Messages tab still shares the same data + DM modal ─────────────────────
ok(/filteredConvos\.map\(convo\s*=>/.test(peopleClient),
  'PeopleClient Messages tab still renders filteredConvos')
ok(/onClick=\{\(\)\s*=>\s*convo\.userId && setSelected\(person\)\}/.test(peopleClient),
  'PeopleClient Messages tab rows open the DM modal via setSelected(person)')
ok(/return conversations\b/.test(peopleClient) || /if \(!search\) return conversations/.test(peopleClient),
  'filteredConvos is derived from the SAME conversations array the rail consumes')

// ── Report ────────────────────────────────────────────────────────────────────
console.log(`\nFeed Messages rail — ${checks} checks`)
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`\n✓ all ${checks} checks passed — the stories rail is retired; the Feed rail mirrors the Messages tab's DM conversations.`)
