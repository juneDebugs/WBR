#!/usr/bin/env node
// Acceptance test for the People home feed + DMs, over HTTP against the
// attendee app. Follows the same harness conventions as
// test-scheduled-messages-api.mjs: cookie-jar login, raw-SQL oracle opened
// against the database the server reports (via /api/debug), --start server
// lifecycle, exit 0/1/2.
//
// What this verifies:
//   1. Auth: unauthenticated feed read/post and DM-room creation are 401s.
//   2. Global feed: any signed-in user can POST /api/chat/global; the message
//      persists in room-general (oracle-checked), comes back in GET ascending,
//      and the sender payload carries profile fields but never credentials.
//   3. Validation: empty and >5000-char posts are 400s.
//   4. DMs: user A creates/reuses a DIRECT room to user B (idempotent), both
//      sides can read and reply through /api/chat/rooms/[roomId]/messages,
//      membership rows exist for both (oracle-checked).
//   5. Guardrails: self-DM 400, unknown target 404, missing target 400,
//      reading a room you're not a member of 403.
//   6. Feed social: GET /api/chat/global messages carry imageUrl / likeCount /
//      commentCount / likedByMe; POST with a valid data-URI image persists and
//      echoes it (oracle-checked), invalid images are 400s.
//   7. Likes: POST /api/feed/:id/like toggles per user with correct counts,
//      401 unauthenticated, 404 for unknown ids and DM-room message ids.
//   8. Comments: GET/POST /api/feed/:id/comments happy path (ascending, safe
//      user projection), 400 empty, 401 unauthenticated, 404 for DM messages.
//   9. Friend gate: NEW DM rooms are friends-only, so the run befriends A↔B
//      through /api/friend before the DM section; Follow edges it created
//      (and did not pre-exist) are removed in teardown.
//
//   node scripts/test-home-feed-api.mjs           # server already on :3001
//   node scripts/test-home-feed-api.mjs --start   # boot `next dev`, then kill it
//
// Env overrides: SMOKE_BASE_URL, SMOKE_EMAIL, SMOKE_PASSWORD,
// SMOKE_EMAIL_B, SMOKE_PASSWORD_B (the second, DM-partner account).
// All messages created here carry a unique marker and are deleted afterwards;
// a DIRECT room created by this run (rather than reused) is also removed.

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3001'
const PORT = new URL(BASE).port || '3001'
const EMAIL_A = process.env.SMOKE_EMAIL ?? 'wbr@test.com'
const PASSWORD_A = process.env.SMOKE_PASSWORD ?? 'password123'
const EMAIL_B = process.env.SMOKE_EMAIL_B ?? 'brand@test.com'
const PASSWORD_B = process.env.SMOKE_PASSWORD_B ?? 'password123'
const MARKER = `[feed-test ${process.pid}-${Date.now()}]`
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

let serverProc = null
let failures = 0
let oracle = null
let dmRoomWasCreatedByThisRun = false
let dmRoomId = null
// Follow edges the befriend step created (absent beforehand) — removed in
// teardown so a fresh pair is left as strangers again.
const followEdgesToCleanup = []
// Messages whose content can't carry the marker (image-only posts) — tracked
// by id so cleanup still removes them.
const extraMessageIds = []

function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

// ─── Cookie jars (one per signed-in user) ─────────────────────────────────────

function makeJar() {
  const jar = new Map()
  return async function jarFetch(url, init = {}) {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: { ...init.headers, cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ') },
    })
    for (const line of res.headers.getSetCookie?.() ?? []) {
      const [pair] = line.split(';')
      const eq = pair.indexOf('=')
      jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1))
    }
    jarFetch.hasSession = [...jar.keys()].some(k => k.includes('next-auth.session-token'))
    return res
  }
}

async function login(jarFetch, email, password) {
  const csrfRes = await jarFetch(`${BASE}/api/auth/csrf`)
  const { csrfToken } = csrfRes.headers.get('content-type')?.includes('json') ? await csrfRes.json() : {}
  check(`csrf token issued (${email})`, Boolean(csrfToken),
    `is ${BASE} really the WBR attendee app? got ${csrfRes.status}`)
  if (!csrfToken) return false
  const loginRes = await jarFetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
  })
  check(`login accepted (${email})`, loginRes.status === 200 || loginRes.status === 302,
    `status ${loginRes.status}`)
  check(`session cookie set (${email})`, jarFetch.hasSession, 'wrong credentials? reseed with db:seed')
  return jarFetch.hasSession
}

// ─── Oracle: open the same database the server reports ───────────────────────

function readEnvLocal() {
  const env = {}
  try {
    const raw = readFileSync(join(ROOT, 'apps/attendee/.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
    }
  } catch {}
  return env
}

async function openDb(jarFetch) {
  // The attendee app has no /api/health; /api/debug reports the connection
  // mode in its first step (auth-gated by middleware, hence the jar).
  const debug = await (await jarFetch(`${BASE}/api/debug`)).json()
  const modeStep = (debug.steps ?? []).find(s => s.startsWith('DB mode: '))
  const mode = modeStep ? modeStep.slice('DB mode: '.length) : ''
  console.log(`Server connection mode: ${mode}`)
  const req = createRequire(join(ROOT, 'packages/db/package.json'))
  const { createClient } = req('@libsql/client')
  if (mode.startsWith('turso-http')) {
    const envLocal = readEnvLocal()
    const url = process.env.TURSO_DATABASE_URL ?? envLocal.TURSO_DATABASE_URL
    const authToken = process.env.TURSO_AUTH_TOKEN ?? envLocal.TURSO_AUTH_TOKEN
    if (!url || !authToken) throw new Error('server uses Turso but no TURSO_* vars found for the oracle')
    return createClient({ url, authToken })
  }
  if (mode.startsWith('sqlite')) {
    const path = mode.replace(/^sqlite:\s*file:/, '')
    // DATABASE_URL may be absolute (file:/abs/path) or relative to the app dir.
    const resolved = path.startsWith('/') ? path : join(ROOT, 'apps/attendee', path)
    return createClient({ url: `file:${resolved}` })
  }
  throw new Error(`unexpected server connection mode: ${mode || JSON.stringify(debug)}`)
}

// ─── Server lifecycle ────────────────────────────────────────────────────────

async function serverUp() {
  try {
    const res = await fetch(`${BASE}/login`, { redirect: 'manual' })
    return res.status < 500
  } catch {
    return false
  }
}

async function waitFor(cond, timeoutMs, label) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return
    await new Promise(r => setTimeout(r, 1500))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function main() {
  if (!(await serverUp())) {
    if (!process.argv.includes('--start')) {
      console.error(`No server at ${BASE}. Start one (npx next dev -p ${PORT} in apps/attendee) or pass --start.`)
      process.exit(2)
    }
    console.log(`Starting attendee dev server on :${PORT}...`)
    serverProc = spawn('npx', ['next', 'dev', '-p', PORT], {
      cwd: join(ROOT, 'apps/attendee'),
      env: { ...process.env, NEXTAUTH_URL: BASE },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    })
    serverProc.stdout.on('data', () => {})
    serverProc.stderr.on('data', () => {})
    await waitFor(serverUp, 120_000, 'attendee dev server')
    console.log('Server is up.')
  }

  // ── Auth gates ──
  console.log('\n[auth]')
  check('unauthenticated feed read rejected', (await fetch(`${BASE}/api/chat/global`)).status === 401)
  const anonPost = await fetch(`${BASE}/api/chat/global`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'nope' }),
  })
  check('unauthenticated feed post rejected', anonPost.status === 401, `status ${anonPost.status}`)
  const anonRoom = await fetch(`${BASE}/api/chat/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ targetUserId: 'whoever' }),
  })
  check('unauthenticated DM-room create rejected', anonRoom.status === 401, `status ${anonRoom.status}`)

  console.log(`\nLogging in as ${EMAIL_A} and ${EMAIL_B}`)
  const userA = makeJar()
  const userB = makeJar()
  if (!(await login(userA, EMAIL_A, PASSWORD_A))) return
  if (!(await login(userB, EMAIL_B, PASSWORD_B))) return

  oracle = await openDb(userA)
  const ids = await oracle.execute({
    sql: 'SELECT id, email FROM User WHERE email IN (?, ?)',
    args: [EMAIL_A, EMAIL_B],
  })
  const idA = ids.rows.find(r => r.email === EMAIL_A)?.id
  const idB = ids.rows.find(r => r.email === EMAIL_B)?.id
  check('both test users exist in the DB', Boolean(idA && idB), JSON.stringify(ids.rows))
  if (!idA || !idB) return

  // Note whether a DM room for this pair already exists, so cleanup only
  // removes a room this run created.
  const preRoom = await oracle.execute({
    sql: `SELECT r.id FROM ChatRoom r
          WHERE r.type = 'DIRECT'
            AND EXISTS (SELECT 1 FROM ChatMember m WHERE m.roomId = r.id AND m.userId = ?)
            AND EXISTS (SELECT 1 FROM ChatMember m WHERE m.roomId = r.id AND m.userId = ?)`,
    args: [idA, idB],
  })
  const preExistingRoomId = preRoom.rows[0]?.id ?? null

  // ── Global feed: validation ──
  console.log('\n[feed validation]')
  const postGlobal = (jarFetch, content) =>
    jarFetch(`${BASE}/api/chat/global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  check('empty post → 400', (await postGlobal(userA, '')).status === 400)
  check('whitespace post → 400', (await postGlobal(userA, '   ')).status === 400)
  check('over-5000-char post → 400', (await postGlobal(userA, 'x'.repeat(5001))).status === 400)

  // ── Global feed: post + read ──
  console.log('\n[global feed]')
  const feedContent = `${MARKER} hello everyone`
  const postRes = await postGlobal(userA, `  ${feedContent}  `)
  check('feed post accepted', postRes.ok, `status ${postRes.status}`)
  const posted = await postRes.json()
  check('post echoes trimmed content + sender', posted?.content === feedContent &&
    posted?.sender?.id === idA, JSON.stringify(posted).slice(0, 200))
  check('post sender payload has no credentials',
    posted?.sender && !('password' in posted.sender) && !('pushToken' in posted.sender) && !('email' in posted.sender),
    Object.keys(posted?.sender ?? {}).join(','))

  const feedRes = await userB(`${BASE}/api/chat/global`)
  check('another user can read the feed', feedRes.status === 200, `status ${feedRes.status}`)
  const feed = await feedRes.json()
  check('feed reports the general room', feed.roomId === 'room-general', feed.roomId)
  check('posted message visible to everyone', feed.messages?.some(m => m.id === posted.id))
  const times = (feed.messages ?? []).map(m => new Date(m.createdAt).getTime())
  check('feed is ascending (newest last)',
    times.every((t, i) => i === 0 || t >= times[i - 1]) &&
    feed.messages?.[feed.messages.length - 1]?.id === posted.id)
  check('feed senders carry profile fields, never credentials',
    (feed.messages ?? []).every(m => m.sender && 'name' in m.sender && !('password' in m.sender) && !('pushToken' in m.sender)))

  const dbMsg = await oracle.execute({
    sql: 'SELECT roomId, senderId, content FROM Message WHERE id = ?',
    args: [posted.id],
  })
  check('oracle: feed message persisted in room-general',
    dbMsg.rows[0]?.roomId === 'room-general' && dbMsg.rows[0]?.senderId === idA &&
    dbMsg.rows[0]?.content === feedContent, JSON.stringify(dbMsg.rows))

  // User B posts too — the "everyone can broadcast" requirement, not just staff.
  const postB = await postGlobal(userB, `${MARKER} attendee voice`)
  check('a plain ATTENDEE can post to the feed', postB.ok, `status ${postB.status}`)
  const postedB = await postB.json()
  const feedAfterB = await (await userA(`${BASE}/api/chat/global`)).json()
  check('attendee post visible to the first user', feedAfterB.messages?.some(m => m.id === postedB.id))

  // ── Befriend A↔B (NEW DM rooms are friend-gated now) ──
  console.log('\n[befriend]')
  const preEdges = await oracle.execute({
    sql: `SELECT followerId, followingId FROM Follow
          WHERE (followerId = ? AND followingId = ?) OR (followerId = ? AND followingId = ?)`,
    args: [idA, idB, idB, idA],
  })
  const hadEdge = (f, g) => preEdges.rows.some(r => r.followerId === f && r.followingId === g)
  const friendPost = (jarFetch, targetId, action) =>
    jarFetch(`${BASE}/api/friend/${targetId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action }),
    })
  const friendReq = await friendPost(userA, idB, 'request')
  check('A can send/refresh a friend request', friendReq.ok, `status ${friendReq.status}`)
  const friendAcc = await friendPost(userB, idA, 'accept')
  check('B can accept it', friendAcc.ok, `status ${friendAcc.status}`)
  const friendAccBody = await friendAcc.json().catch(() => ({}))
  check('pair reports friends before the DM section', friendAccBody?.status === 'friends',
    JSON.stringify(friendAccBody))
  if (!hadEdge(idA, idB)) followEdgesToCleanup.push([idA, idB])
  if (!hadEdge(idB, idA)) followEdgesToCleanup.push([idB, idA])

  // ── DM room creation ──
  console.log('\n[dm room]')
  const createRoom = (jarFetch, targetUserId) =>
    jarFetch(`${BASE}/api/chat/rooms`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    })
  const roomRes = await createRoom(userA, idB)
  check('DM room create/get → ok', roomRes.ok, `status ${roomRes.status}`)
  const room = await roomRes.json()
  check('room payload has an id', typeof room?.id === 'string' && room.id.length > 0, JSON.stringify(room))
  dmRoomId = room.id
  dmRoomWasCreatedByThisRun = preExistingRoomId === null
  if (preExistingRoomId) {
    check('pre-existing pair room reused', room.id === preExistingRoomId,
      `${room.id} vs ${preExistingRoomId}`)
  }
  const roomAgain = await (await createRoom(userA, idB)).json()
  check('second create returns the same room (idempotent)', roomAgain?.id === room.id)
  const roomFromB = await (await createRoom(userB, idA)).json()
  check('reverse direction resolves to the same room', roomFromB?.id === room.id)

  const members = await oracle.execute({
    sql: 'SELECT userId FROM ChatMember WHERE roomId = ?',
    args: [room.id],
  })
  const memberIds = members.rows.map(r => r.userId)
  check('oracle: both users are members', memberIds.includes(idA) && memberIds.includes(idB) && memberIds.length === 2,
    JSON.stringify(memberIds))

  check('self-DM → 400', (await createRoom(userA, idA)).status === 400)
  check('unknown target → 404', (await createRoom(userA, 'no-such-user-xyz')).status === 404)
  const missingTarget = await userA(`${BASE}/api/chat/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })
  check('missing targetUserId → 400', missingTarget.status === 400, `status ${missingTarget.status}`)

  // ── DM messaging, both directions ──
  console.log('\n[dm messages]')
  const dmContent = `${MARKER} dm from A`
  const dmPost = await userA(`${BASE}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: dmContent }),
  })
  check('A can post into the DM room', dmPost.ok, `status ${dmPost.status}`)
  const dmMsg = await dmPost.json()

  const bRead = await userB(`${BASE}/api/chat/rooms/${room.id}/messages`)
  check('B can read the DM room', bRead.status === 200, `status ${bRead.status}`)
  const bMessages = await bRead.json()
  check('B sees A\'s message', Array.isArray(bMessages) && bMessages.some(m => m.id === dmMsg.id))
  check('DM senders never leak credentials',
    (Array.isArray(bMessages) ? bMessages : []).every(m => !('password' in (m.sender ?? {})) && !('pushToken' in (m.sender ?? {}))))

  const replyContent = `${MARKER} reply from B`
  const bReply = await userB(`${BASE}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: replyContent }),
  })
  check('B can reply', bReply.ok, `status ${bReply.status}`)
  const aRead = await (await userA(`${BASE}/api/chat/rooms/${room.id}/messages`)).json()
  check('A sees B\'s reply, in order',
    Array.isArray(aRead) &&
    aRead.findIndex(m => m.content === dmContent) < aRead.findIndex(m => m.content === replyContent) &&
    aRead.some(m => m.content === replyContent))

  check('empty DM → 400', (await userA(`${BASE}/api/chat/rooms/${room.id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: '' }),
  })).status === 400)

  // ── Membership gate ──
  console.log('\n[membership gate]')
  check('reading a room you are not in → 403',
    (await userA(`${BASE}/api/chat/rooms/no-such-room/messages`)).status === 403)
  check('posting into a room you are not in → 403',
    (await userA(`${BASE}/api/chat/rooms/no-such-room/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'sneaky' }),
    })).status === 403)

  // ── Feed social: enrichment fields + images ──
  console.log('\n[feed social: enrichment + images]')
  const postGlobalBody = (jarFetch, body) =>
    jarFetch(`${BASE}/api/chat/global`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  const enrichedFeed = await (await userA(`${BASE}/api/chat/global`)).json()
  check('feed messages carry imageUrl/likeCount/commentCount/likedByMe',
    (enrichedFeed.messages ?? []).length > 0 &&
    enrichedFeed.messages.every(m => 'imageUrl' in m && typeof m.likeCount === 'number' &&
      typeof m.commentCount === 'number' && typeof m.likedByMe === 'boolean'))

  const imgRes = await postGlobalBody(userA, { content: `${MARKER} with pic`, imageUrl: TINY_PNG })
  check('post with image accepted', imgRes.ok, `status ${imgRes.status}`)
  const imgPosted = await imgRes.json()
  check('post echoes the image data URI', imgPosted?.imageUrl === TINY_PNG,
    JSON.stringify(imgPosted).slice(0, 200))
  check('fresh post echoes zero social counts',
    imgPosted?.likeCount === 0 && imgPosted?.commentCount === 0 && imgPosted?.likedByMe === false)
  const dbImg = await oracle.execute({
    sql: 'SELECT imageUrl FROM Message WHERE id = ?',
    args: [imgPosted.id],
  })
  check('oracle: imageUrl persisted', dbImg.rows[0]?.imageUrl === TINY_PNG)

  const imageOnlyRes = await postGlobalBody(userA, { content: '', imageUrl: TINY_PNG })
  check('image-only post (empty content) accepted', imageOnlyRes.ok, `status ${imageOnlyRes.status}`)
  const imageOnlyPosted = await imageOnlyRes.json()
  if (imageOnlyPosted?.id) extraMessageIds.push(imageOnlyPosted.id)
  check('image-only post stores empty content + the image',
    imageOnlyPosted?.content === '' && imageOnlyPosted?.imageUrl === TINY_PNG)

  check('http(s) imageUrl → 400',
    (await postGlobalBody(userA, { content: 'x', imageUrl: 'https://example.com/x.png' })).status === 400)
  check('non-image data URI → 400',
    (await postGlobalBody(userA, { content: 'x', imageUrl: 'data:text/html;base64,PHNjcmlwdD4=' })).status === 400)

  // ── Feed social: likes ──
  console.log('\n[feed social: likes]')
  const likeUrl = id => `${BASE}/api/feed/${id}/like`
  check('unauthenticated like rejected',
    (await fetch(likeUrl(posted.id), { method: 'POST' })).status === 401)

  const likeARes = await userA(likeUrl(posted.id), { method: 'POST' })
  check('A can like a feed message', likeARes.status === 200, `status ${likeARes.status}`)
  const likeA = await likeARes.json()
  check('A like → liked true, count 1', likeA?.liked === true && likeA?.likeCount === 1,
    JSON.stringify(likeA))
  const likeB = await (await userB(likeUrl(posted.id), { method: 'POST' })).json()
  check('B like → liked true, count 2', likeB?.liked === true && likeB?.likeCount === 2,
    JSON.stringify(likeB))
  const dbLikes = await oracle.execute({
    sql: 'SELECT COUNT(*) AS n FROM MessageLike WHERE messageId = ?',
    args: [posted.id],
  })
  check('oracle: both like rows persisted', Number(dbLikes.rows[0]?.n) === 2,
    JSON.stringify(dbLikes.rows))

  const likedFeed = await (await userB(`${BASE}/api/chat/global`)).json()
  const likedMsg = likedFeed.messages?.find(m => m.id === posted.id)
  check('feed reflects likeCount + likedByMe for the viewer',
    likedMsg?.likeCount === 2 && likedMsg?.likedByMe === true, JSON.stringify(likedMsg).slice(0, 200))

  const unlikeA = await (await userA(likeUrl(posted.id), { method: 'POST' })).json()
  check('A toggles off → liked false, count 1', unlikeA?.liked === false && unlikeA?.likeCount === 1,
    JSON.stringify(unlikeA))
  const unlikeB = await (await userB(likeUrl(posted.id), { method: 'POST' })).json()
  check('B toggles off → liked false, count 0', unlikeB?.liked === false && unlikeB?.likeCount === 0)

  check('like on unknown message → 404',
    (await userA(likeUrl('no-such-message'), { method: 'POST' })).status === 404)
  check('like on a DM-room message → 404 (guard)',
    (await userA(likeUrl(dmMsg.id), { method: 'POST' })).status === 404)

  // ── Feed social: comments ──
  console.log('\n[feed social: comments]')
  const commentsUrl = id => `${BASE}/api/feed/${id}/comments`
  const postComment = (jarFetch, id, content) =>
    jarFetch(commentsUrl(id), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content }),
    })
  check('unauthenticated comment list rejected', (await fetch(commentsUrl(posted.id))).status === 401)
  check('unauthenticated comment post rejected', (await fetch(commentsUrl(posted.id), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'nope' }),
  })).status === 401)

  const commentContent = `${MARKER} nice one`
  const commentRes = await postComment(userB, posted.id, `  ${commentContent}  `)
  check('comment accepted', commentRes.ok, `status ${commentRes.status}`)
  const comment = await commentRes.json()
  check('comment echoes trimmed content + safe user projection',
    comment?.content === commentContent && comment?.messageId === posted.id &&
    comment?.user?.id === idB && !('password' in (comment?.user ?? {})) &&
    !('pushToken' in (comment?.user ?? {})) && !('email' in (comment?.user ?? {})),
    JSON.stringify(comment).slice(0, 200))

  const replyContent2 = `${MARKER} thanks!`
  check('second comment accepted', (await postComment(userA, posted.id, replyContent2)).ok)

  const listRes = await userA(commentsUrl(posted.id))
  check('comments readable', listRes.status === 200, `status ${listRes.status}`)
  const { comments } = await listRes.json()
  check('comments listed ascending with both entries',
    Array.isArray(comments) &&
    comments.some(c => c.content === commentContent) &&
    comments.findIndex(c => c.content === commentContent) <
      comments.findIndex(c => c.content === replyContent2),
    JSON.stringify(comments ?? []).slice(0, 200))
  check('listed comments never leak credentials',
    (Array.isArray(comments) ? comments : []).every(c =>
      c.user && !('password' in c.user) && !('pushToken' in c.user)))

  const commentedFeed = await (await userA(`${BASE}/api/chat/global`)).json()
  check('feed commentCount reflects both comments',
    commentedFeed.messages?.find(m => m.id === posted.id)?.commentCount === 2)

  check('empty comment → 400', (await postComment(userA, posted.id, '   ')).status === 400)
  check('comment on a DM-room message → 404 (guard)',
    (await postComment(userA, dmMsg.id, 'sneaky')).status === 404)
  check('listing comments on a DM-room message → 404',
    (await userA(commentsUrl(dmMsg.id))).status === 404)
}

try {
  await main()
} catch (e) {
  failures++
  console.error(`\n  ✗ unexpected error — ${e.message}`)
} finally {
  // Remove every row this run created. Social rows go first — the oracle's
  // raw SQL doesn't run with foreign_keys ON, so cascades can't be relied on.
  try {
    if (oracle) {
      await oracle.execute({
        sql: 'DELETE FROM MessageLike WHERE messageId IN (SELECT id FROM Message WHERE content LIKE ?)',
        args: [`%${MARKER}%`],
      })
      await oracle.execute({
        sql: 'DELETE FROM MessageComment WHERE messageId IN (SELECT id FROM Message WHERE content LIKE ?)',
        args: [`%${MARKER}%`],
      })
      await oracle.execute({ sql: 'DELETE FROM MessageComment WHERE content LIKE ?', args: [`%${MARKER}%`] })
      for (const id of extraMessageIds) {
        await oracle.execute({ sql: 'DELETE FROM MessageLike WHERE messageId = ?', args: [id] })
        await oracle.execute({ sql: 'DELETE FROM MessageComment WHERE messageId = ?', args: [id] })
        await oracle.execute({ sql: 'DELETE FROM Message WHERE id = ?', args: [id] })
      }
      await oracle.execute({ sql: 'DELETE FROM Message WHERE content LIKE ?', args: [`%${MARKER}%`] })
      if (dmRoomWasCreatedByThisRun && dmRoomId) {
        await oracle.execute({ sql: 'DELETE FROM ChatMember WHERE roomId = ?', args: [dmRoomId] })
        await oracle.execute({ sql: 'DELETE FROM ChatRoom WHERE id = ?', args: [dmRoomId] })
      }
      for (const [f, g] of followEdgesToCleanup) {
        await oracle.execute({
          sql: 'DELETE FROM Follow WHERE followerId = ? AND followingId = ?',
          args: [f, g],
        })
      }
    }
  } catch (e) {
    console.error('cleanup failed:', e.message)
  }
  if (serverProc) {
    console.log('\nStopping dev server...')
    try { process.kill(-serverProc.pid, 'SIGTERM') } catch {}
  }
}

console.log(failures === 0 ? '\nHOME FEED API TEST PASSED ✓' : `\n${failures} FAILURES ✗`)
process.exit(failures === 0 ? 0 : 1)
