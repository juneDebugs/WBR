#!/usr/bin/env node
// Static-source regression guard for the security + correctness fixes landed in
// the deep-audit pass (docs/audit-2026-08-01-improvements.md). These fixes live
// in HTTP route handlers / middleware / server actions that cannot be exercised
// without a running server + DB, so this suite asserts on the SOURCE: each check
// proves the dangerous pattern is gone and the safe pattern is present, so a
// future refactor that reintroduces the hole fails CI-style here.
//
// This is intentionally a source-shape test (same family as
// test-admin-chat-dm-removed.mjs). It does not replace the behavioural suites;
// it pins the invariants the audit established.
//
//   node scripts/test-audit-security.mjs
//
// Exits 0 on all-pass, 1 on failure.

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else { failures++; console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : null)
function present(name, path, re) {
  const src = read(path)
  if (src == null) { failures++; console.error(`  ✗ ${name} — file missing: ${path}`); return }
  check(name, re.test(src), `pattern not found in ${path}`)
}
function absent(name, path, re) {
  const src = read(path)
  if (src == null) { failures++; console.error(`  ✗ ${name} — file missing: ${path}`); return }
  check(name, !re.test(src), `forbidden pattern still present in ${path}`)
}

// ─── Auth: speaker route derives role server-side (was spoofable header) ─────
console.log('[speaker route — server-side role, no header trust]')
{
  const p = 'apps/web/app/api/speakers/[id]/route.ts'
  present('PUT/DELETE use getServerSession', p, /getServerSession\s*\(\s*authOptions\s*\)/)
  absent('no longer reads client x-user-role header', p, /req\.headers\.get\(\s*['"]x-user-role['"]\s*\)/)
}

// ─── Middleware forwards + sanitizes request headers (web) ───────────────────
console.log('[web middleware — request-header forwarding + sanitization]')
{
  const p = 'apps/web/middleware.ts'
  present('returns NextResponse.next({ request: { headers } })', p, /NextResponse\.next\(\s*\{\s*request:\s*\{\s*headers/)
  present('deletes incoming x-user-role before setting', p, /requestHeaders\.delete\(\s*['"]x-user-role['"]\s*\)/)
}

// ─── Password hashes never serialized to clients ─────────────────────────────
console.log('[no password / pushToken leaks in API responses]')
{
  // meetings meeting-requests: explicit safe selects, not boolean full includes.
  const mreq = 'apps/meetings/app/api/meeting-requests/route.ts'
  absent('meeting-requests GET has no `requester: true` full include', mreq, /requester:\s*true/)
  absent('meeting-requests GET has no `targetUser: true` full include', mreq, /targetUser:\s*true/)
  // The route applies an explicit safe select to requester/targetUser — either
  // inline (`requester: { select: {...} }`) or via a shared select object.
  present('meeting-requests GET uses an explicit safe select for User relations', mreq,
    /select:\s*\{\s*id:\s*true[^}]*name:\s*true/)
  present('meeting-requests GET applies that select to requester', mreq, /requester:\s*(safeUser|\{\s*select:)/)

  const mreqId = 'apps/meetings/app/api/meeting-requests/[id]/route.ts'
  absent('meeting-requests [id] has no `requester: true` full include', mreqId, /requester:\s*true/)

  // meetings profile PATCH: explicit select, never returns the raw row.
  const prof = 'apps/meetings/app/api/profile/route.ts'
  present('profile PATCH uses a select', prof, /select:\s*\{/)
  absent('profile PATCH does not select password', prof, /password:\s*true/)
}

// ─── Cross-sponsor submission tampering closed ───────────────────────────────
console.log('[sponsor submission status scoped to the owning form]')
{
  const p = 'apps/sponsor/app/api/submissions/[id]/submissions/[subId]/route.ts'
  present('status write scoped by { id: subId, formId: id }', p, /where:\s*\{\s*id:\s*subId,\s*formId:\s*id\s*\}/)
  present('uses updateMany + count guard', p, /updateMany\(/)
}

// ─── Unauthenticated brute-force: login routes are rate limited ──────────────
console.log('[credential login endpoints rate limited in all four apps]')
for (const app of ['web', 'attendee', 'meetings', 'sponsor']) {
  const p = `apps/${app}/app/api/login/route.ts`
  present(`${app}: rateLimit imported`, p, /import\s*\{[^}]*rateLimit[^}]*\}\s*from\s*['"]@\/lib\/rateLimit['"]/)
  present(`${app}: login key throttled`, p, /rateLimit\(\s*[`'"]login:/)
}

// ─── Health endpoint no longer leaks infra secrets ───────────────────────────
console.log('[web /api/health — no DATABASE_URL / admin-probe / stack leak]')
{
  const p = 'apps/web/app/api/health/route.ts'
  present('gated by getToken', p, /getToken\(/)
  absent('does not return process.env.DATABASE_URL', p, /databaseUrl:\s*process\.env\.DATABASE_URL/)
  absent('no hardcoded admin-email probe', p, /june@tailor\.tech/)
  absent('no raw dbStack in response', p, /dbStack/)
}

// ─── Dashboard write surfaces gated (pages + server actions) ─────────────────
console.log('[dashboard detail/new pages carry permission guards]')
{
  const pages = [
    'apps/web/app/(dashboard)/dashboard/sponsors/new/page.tsx',
    'apps/web/app/(dashboard)/dashboard/sponsors/[id]/page.tsx',
    'apps/web/app/(dashboard)/dashboard/sessions/new/page.tsx',
    'apps/web/app/(dashboard)/dashboard/sessions/[id]/page.tsx',
    'apps/web/app/(dashboard)/dashboard/speakers/new/page.tsx',
    'apps/web/app/(dashboard)/dashboard/speakers/[id]/page.tsx',
    'apps/web/app/(dashboard)/dashboard/time-blocks/new/page.tsx',
    'apps/web/app/(dashboard)/dashboard/meetings/new/page.tsx',
    'apps/web/app/(dashboard)/dashboard/meetings/[id]/page.tsx',
    'apps/web/app/(dashboard)/dashboard/attendees/[userId]/page.tsx',
  ]
  for (const p of pages) {
    present(`${p.split('/dashboard/')[1]} guards writes (permissionDenied/assertPermission)`, p,
      /permissionDenied\(|assertPermission\(/)
  }
  present('assertPermission helper exists in require-permission.tsx',
    'apps/web/lib/require-permission.tsx', /export\s+async\s+function\s+assertPermission/)
}

// ─── /api/data/* read routes carry role + permission gate ────────────────────
console.log('[web /api/data/* routes gated by role + permission]')
for (const [route, key] of [
  ['app-settings', 'appSettings'], ['meetings', 'meetings'], ['chat', 'chat'],
  ['calendar', 'calendar'], ['sponsors', 'sponsors'], ['sessions', 'agenda'], ['speakers', 'speakers'],
]) {
  const p = `apps/web/app/api/data/${route}/route.ts`
  present(`data/${route}: role-gated`, p, /ADMIN_ROLES|roleHasPermission/)
}

// ─── Bulk scheduler behind the same gate as its siblings ─────────────────────
console.log('[web schedule-meetings behind requireSchedulerAccess]')
present('schedule-meetings uses requireSchedulerAccess', 'apps/web/app/api/schedule-meetings/route.ts',
  /requireSchedulerAccess\(/)

// ─── DB layer: N+1 loops replaced by batched writes ──────────────────────────
console.log('[db layer — batched writes, no per-row await loops]')
{
  const idx = 'packages/db/src/index.ts'
  present('detectSpeakerConflicts batches upserts via Promise.all', idx, /Promise\.all\(\s*pairs\.map/)
  present('detectSpeakerConflicts resolves stale rows via updateMany', idx, /conflictLog\.updateMany\(/)

  const eng = 'packages/db/src/meeting-engine.ts'
  present('autoAssignTables uses updateMany (grouped by location)', eng, /sponsorMeeting\.updateMany\(/)
}

// ─── Dead code removed ───────────────────────────────────────────────────────
console.log('[dead code removed]')
check('attendee posts/like route deleted',
  !existsSync(join(ROOT, 'apps/attendee/app/api/posts/[postId]/like/route.ts')))
check('meetings StaffQueue.tsx deleted',
  !existsSync(join(ROOT, 'apps/meetings/components/StaffQueue.tsx')))
check('meetings mem-cache.ts deleted',
  !existsSync(join(ROOT, 'apps/meetings/lib/mem-cache.ts')))

console.log(failures === 0 ? '\n✅ ALL PASSED' : `\n❌ ${failures} FAILED`)
process.exit(failures === 0 ? 0 : 1)
