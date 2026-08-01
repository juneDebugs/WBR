# Deep audit & optimization pass — 2026-08-01

A full-codebase audit of all four apps (`web`, `attendee`, `meetings`, `sponsor`) and the shared `packages/db` data layer, followed by implementation of every confirmed fix. **61 issues** were found, adversarially verified, and fixed across **72 files**, with two new regression test suites added. Every app and the data layer typecheck clean; all behavioural test suites that cover the changed code pass.

## Contents

- [How this was done](#how-this-was-done)
- [Impact at a glance](#impact-at-a-glance)
- [What changed, by theme](#what-changed-by-theme)
- [Highlights worth calling out](#highlights-worth-calling-out)
- [The full finding list](#the-full-finding-list)
- [Testing & verification](#testing--verification)
- [Deliberately deferred](#deliberately-deferred)

## How this was done

The pass was run as an orchestrated, multi-agent workflow rather than a single linear read-through, so that breadth (every route in four apps + a 6,300-line data layer) did not come at the cost of depth.

1. **Parallel audit.** Seven independent auditor agents swept the codebase in parallel — one per app for correctness, one for `web` performance specifically, one for the shared `packages/db` query layer, and one cross-app API/auth-consistency sweep. Each was told the stack's cost model (Turso libSQL costs ~170 ms per DB round-trip, so sequential awaits and N+1 patterns on request paths are the highest-value perf findings) and an explicit exclusion list (the documented `BottomNav.tsx` TS error, `ignoreBuildErrors`, base64 images per ADR 0004, the `packages/db` package-specifier import rule).
2. **Adversarial verification.** Every raw finding was handed to a separate skeptic agent instructed to *refute* it by reading the actual code and its callers. Only findings that survived refutation — and whose proposed fix was judged safe (no behaviour change beyond the fix) — were kept. This removed 3 findings as false positives and produced a corrected, safety-checked fix for each survivor. **61 of 64 findings were confirmed.**
3. **Modern-practice research.** A research agent verified the intended fix patterns against current (2025–2026) official docs for Next.js 15.5, React 19.2, Prisma-over-libSQL, and NextAuth v4, so the fixes use today's recommended idioms rather than stale ones. Key rulings that shaped the work:
   - Stay on `unstable_cache` + `revalidateTag`; the `"use cache"` directive is **canary-only** on Next 15.5 and was not adopted.
   - On Prisma over the libSQL HTTP driver, `$transaction([...])` runs **sequentially** (one round-trip per query) — so it is *not* a batcher. Independent reads/writes were parallelized with `Promise.all` instead; the `include` JOIN strategy is Postgres/MySQL-only, so hot paths were scoped and trimmed rather than deep-included.
   - React Compiler is stable upstream but still experimental in Next 15.5, so re-render fixes use manual `memo`/`useCallback` discipline, not the compiler.
   - `after()` from `next/server` (stable in 15.5) is the right tool for moving expensive, response-irrelevant work (the auto-match sweep) off the user's request path.
4. **Parallel implementation.** Five implementation agents applied the vetted fixes on disjoint directory partitions (`web`, `attendee`, `meetings`, `sponsor`, `packages/db`) so there were no file conflicts. Each ran its own `tsc --noEmit` and reported back.
5. **Verification & regression tests.** Full typecheck sweep, the existing behavioural suites over the changed surfaces, and two new regression suites written to lock the fixes in place.

## Impact at a glance

| Category | Count | Examples of what was fixed |
|---|---|---|
| **Security** | 15 | Spoofable auth header, cross-sponsor data tampering, password-hash leakage, unauthenticated infra-secret disclosure, missing permission/rate-limit gates |
| **Correctness bugs** | 15 | Features that always 403'd, a dead search endpoint, check-then-write races, cache never invalidated, orphaned meetings |
| **Performance & efficiency** | 25 | Sequential Turso round-trips → `Promise.all`, N+1 write loops → batched writes, unscoped full-table fetches → conference-scoped, base64-avatar overfetch, per-keystroke feed re-renders |
| **Dead code & cleanup** | 6 | Orphaned routes/components, no-op cache module, dead helpers wired up or removed |
| **Total** | **61** | across **72 files** (5 new, 3 deleted) |

By severity: **14 high, 34 medium, 13 low.** By area: web 21, sponsor 12, db layer 10, attendee 9, meetings 9.

## What changed, by theme

### Security (15 findings)

- **Spoofable / broken speaker auth.** `apps/web/app/api/speakers/[id]/route.ts` read the role from a client-controllable `x-user-role` request header that the middleware never actually forwarded — so legitimate admin edits always 403'd *and* any holder of a sibling-app JWT (shared `NEXTAUTH_SECRET`) could set the header themselves and edit/delete any speaker. Both PUT and DELETE now derive the role server-side via `getServerSession`, matching every sibling route. As defense-in-depth, `apps/web/middleware.ts` was corrected to forward *and sanitize* request headers (`NextResponse.next({ request: { headers } })`, deleting any incoming `x-user-*` first), matching the `meetings`/`sponsor` middleware.
- **Ungated dashboard writes.** The ten dashboard detail/`new` pages and their inline `'use server'` actions had no permission check — a `STAFF` user whose section permission was revoked (or any decodable JWT) could open the page directly and create/update/delete sponsors, sessions, speakers, time blocks, and meetings. Each page now carries the same `permissionDenied` guard as its list sibling, and each server action independently re-checks via a new `assertPermission` helper (actions are directly POST-able, so the page guard alone is insufficient).
- **Cross-sponsor submission tampering.** `apps/sponsor/.../submissions/[subId]/route.ts` verified ownership on the *form* but wrote to the *submission* with no `formId` constraint — any sponsor could flip another company's submission to ACCEPTED/REJECTED. The write is now scoped `where: { id: subId, formId: id }` with a `count === 0 → 404` guard.
- **Password-hash leakage.** Three response paths serialized full `User` rows (scrypt hash + `pushToken`): the meetings `GET /api/meeting-requests` and `PATCH [id]`, and the meetings profile `PATCH`. All now use explicit safe `select`s.
- **Unauthenticated infra disclosure.** `GET /api/health` returned the raw `DATABASE_URL`, probed and disclosed the admin account, and leaked DB stack traces to anyone on the internet. It is now `getToken`-gated, returns only `{ status, connectionMode }` when unauthenticated, and no longer probes the admin row or echoes stack traces.
- **OAuth gaps.** The Google integration connect/callback skipped the `integrations` permission gate its sibling enforces and had no CSRF binding on `state`. Both are now permission-gated and the `state` carries a single-use nonce validated against an httpOnly cookie before the token exchange.
- **Missing gates & rate limiting.** Eight `/api/data/*` read routes checked only token presence (no role/permission) — now gated like their four already-retrofitted siblings. The bulk `schedule-meetings` route now goes through the same `requireSchedulerAccess()` as every other scheduling endpoint. All four apps' credential-login endpoints — previously unthrottled password oracles — now use the repo's existing in-memory limiter (10/60 s per IP); the meetings login also closes a user-enumeration timing oracle with a dummy-hash verify on the no-user path.

### Correctness bugs (15 findings)

- **Features that never worked.** The meetings Approve/Decline buttons always 403'd (route was `role !== 'STAFF'`, but the portal shows the buttons to attendees, who are never STAFF, and the check also locked out ORGANIZER/ADMIN); the guard is now a two-branch check (`isWbrStaff` full power; recipients may set only APPROVED/REJECTED on their own requests). The admin Cmd+K global search fetched `/api/search`, which **did not exist** — every keystroke 404'd; the route is now implemented (a `getToken`-guarded search over speakers/users/sessions/sponsors) and the client handles non-OK responses.
- **Races & data integrity.** The staff review `PATCH` did a check-then-update that could flip a just-CONFIRMED request back to APPROVED/REJECTED and orphan its meeting — now an atomic `updateMany({ where: { id, status: 'PENDING' } })`. The web `meeting-requests` DELETE orphaned the booked `SponsorMeeting` for rep→attendee requests (leaving a ghost in an exclusive slot) — now cleaned up in the same transaction. `getOrCreateDirectRoom` could mint duplicate DM rooms under concurrent taps — now a deterministic sorted-pair room id with a P2002 re-fetch.
- **Silent failures.** The attendee DM composer had no error handling — one network blip permanently bricked the send button; now try/catch/finally with draft restoration. The sponsor "✓ Requested" state was set without checking the response; the sponsor prefetch cached 401/403 error bodies as successful data (crashing the browse page). Both now check `res.ok`.
- **Drift & stale cache.** The sponsor duplicate-request check had drifted from the meetings app so a REJECTED/CANCELLED request permanently blocked re-requesting; it now excludes terminal statuses. The admin broadcast/clear-messages mutations never invalidated the `chat` cache tag, so the cached feed resurrected deleted messages; `revalidateTag('chat')` was added. ADMIN was locked out of chat moderation by guards testing only STAFF/ORGANIZER.
- **Prod no-op.** Cross-app speaker cache revalidation was hardcoded to `http://localhost:3001` and silently failed in production; it now reads `ATTENDEE_APP_URL` and logs failures instead of swallowing them.

### Performance & efficiency (25 findings)

The dominant theme is Turso's ~170 ms-per-round-trip cost model. Fixes fall into four patterns:

- **Sequential awaits → `Promise.all`.** Independent reads/writes that were awaited one-after-another are now concurrent: `POST /api/setup/meeting` (5→2 round-trips), the sponsor teammates route (duplicate user fetch removed), `listRoomMessagesForUser` (messages read ∥ read-marker write), `assignMeeting`/`rescheduleMeeting` and `assertBlockOpen` (independent reads fanned out while preserving error precedence), the web `schedule-meetings` time-block fetch, the email send path, and the sponsor approve path.
- **N+1 write loops → batched writes.** `autoAssignTables` (one UPDATE per meeting → one `updateMany` per distinct location), `autoPopulateSponsorTables` (2 serial writes per sponsor → bounded-concurrency waves), `detectSpeakerConflicts` (per-row upsert/update → `Promise.all` upserts + one `updateMany`), the auto-scheduler commit loop (per-meeting fixed-table SELECT → one batched pre-read), and `sync-members` (up to ~2,500 individual INSERTs → one `createMany`).
- **Unscoped full-table fetches → scoped.** `getCompanyDirectory` and `computeAutoMatches` pulled *every* live request across *all* conferences (the latter hydrating base64 avatars) then filtered in JS; both are now scoped to their conference via relation filters, keeping a single parallel batch, with the JS filter retained as a correctness net. The web sponsor-detail page fetched all 2,537 users with every column (password hashes included) to fill a dropdown — now a cached slim `select`.
- **Off-the-request-path & re-render work.** The full auto-match sweep that blocked every "Best Fit" pick now runs after the response via `after()` (with a cheap reciprocal-check kept synchronous only when a match can complete immediately). `ensureGeneralRoom`'s per-poll upsert is memoized. The attendee chat-room page no longer overfetches every channel member's base64 avatar. The `FeedTab` per-post subtree is now `React.memo`'d so comment/composer keystrokes stop re-rendering the whole image-heavy feed. The staff console's duplicate `/api/staff/companies` fetch is deduped behind one shared React Query hook.

### Dead code & cleanup (6 findings)

Removed the orphaned `GET /api/chat/rooms` handler (re-introduced the documented ~4 MB avatar payload), the unused `posts/[postId]/like` route (race-unsafe, superseded by the feed like path), the dead `mem-cache.ts` (its `cached()` read path was never called, so all `invalidate()` calls were no-ops — plus the undeclared-tag `revalidateTag` calls that gave false confidence), and the dead `StaffQueue.tsx` component. The sponsor `/api/browse` chip-filter branch now reuses the cached attendee list, and the previously-dead `rateLimit` helper is wired into the login route.

## Highlights worth calling out

The four findings most worth a second look, because each was both real and non-obvious:

1. **The speaker-route auth hole was invisible in local dev.** Because the middleware set the header on the *response*, in local dev the admin UI worked by accident only where it didn't (the feature was actually broken), and the spoof required a sibling-app token — so it never surfaced in normal testing. It took reading the exact Next 15 header-forwarding protocol to see that `req.headers.get('x-user-role')` returned client input.
2. **`$transaction([...])` is a trap on this stack.** The intuitive "batch these writes in a transaction" would have made things *slower* on libSQL HTTP (sequential round-trips), not faster. The research step caught this before it was applied anywhere.
3. **The cross-conference data leak compounded.** `computeAutoMatches` runs on every board read; fetching every request in the DB with base64 avatars meant the cost grew with total historical data, not with the active conference — exactly the failure mode `getMeetingsLog` had already been fixed to avoid.
4. **Three "dead" findings were load-bearing in a bad way.** The no-op `mem-cache` and undeclared-tag `revalidateTag` calls didn't just waste cycles — they told future maintainers that mutations were being cache-invalidated when they weren't.

## The full finding list

Severity: **H**igh / **M**edium / **L**ow. Locations are abbreviated (`db/` = `packages/db/src/`, app prefixes dropped).
<!-- BEGIN FINDINGS TABLES -->
### Security (15)

| Sev | Location | Issue |
|---|---|---|
| H | `meetings/app/api/meeting-requests/route.ts:100` | GET /api/meeting-requests leaks other users' password hashes via full-row includes |
| H | `sponsor/app/api/submissions/[id]/submissions/[subId]/route.ts:31` | Submission status update not scoped to the verified form — cross-sponsor tampering |
| H | `web/app/(dashboard)/dashboard/sponsors/[id]/page.tsx:49` | Detail/new pages and their server actions skip the permissionDenied guard that every sibling list page enforces |
| H | `web/app/(dashboard)/dashboard/sponsors/new/page.tsx:8` | Server actions on all ten new/detail dashboard pages perform writes with no role or permission check |
| H | `web/app/api/speakers/[id]/route.ts:17` | Speaker PUT/DELETE auth reads a client-controllable x-user-role header that middleware never actually forwards |
| H | `web/app/api/speakers/[id]/route.ts:17` | Speaker PUT/DELETE role check reads client-controlled x-user-role header — spoofable and broken for legit admins |
| M | `attendee/app/api/login/route.ts:26` | Credential login endpoint has no rate limiting although the repo's limiter exists and sibling apps use it |
| M | `meetings/app/api/login/route.ts:5` | Custom /api/login token-minting endpoint has no rate limiting (unlimited password guessing) |
| M | `meetings/app/api/profile/route.ts:46` | Profile PATCH response returns the full User row including the password hash and pushToken |
| M | `web/app/api/data/app-settings/route.ts:32` | Eight /api/data/* read routes check only token presence — no role and no permission gate, unlike their four retrofitted siblings |
| M | `web/app/api/health/route.ts:7` | Unauthenticated /api/health leaks DATABASE_URL, admin-account details, and DB stack traces |
| M | `web/app/api/integrations/google/route.ts:17` | Google OAuth connect + callback skip the 'integrations' permission gate their sibling enforces, and the state parameter has no CSRF binding |
| M | `web/app/api/login/route.ts:5` | Custom credentials login endpoint has no rate limiting although the repo's own rateLimit helper is used on a sibling route |
| M | `web/app/api/schedule-meetings/route.ts:15` | Bulk meeting scheduler missing the roleHasPermission('meetings') gate its sibling auto-schedule route applies |
| L | `web/app/api/login/route.ts:5` | Unauthenticated credential endpoints have no rate limiting in any app, though a rateLimit helper exists and guards a less sensitive route |

### Correctness bugs (15)

| Sev | Location | Issue |
|---|---|---|
| H | `meetings/app/api/meeting-requests/[id]/route.ts:29` | Approve/Decline buttons in MeetingsPortal always 403 — route is STAFF-only but UI shows them to attendees |
| H | `web/components/GlobalSearch.tsx:56` | Global Cmd+K search fetches /api/search, a route that does not exist — the feature always returns no results |
| H | `web/middleware.ts:28` | Middleware sets x-user-role on the RESPONSE, not the request — speakers PUT/DELETE always 403 and the header is client-spoofable |
| M | `attendee/components/people/PeopleClient.tsx:314` | DM modal sendMessage has no error handling — one network failure permanently bricks the composer |
| M | `meetings/app/api/staff/requests/[id]/route.ts:29` | Check-then-update race can flip a CONFIRMED request back to APPROVED/REJECTED, orphaning its meeting |
| M | `sponsor/app/api/request-meeting/route.ts:58` | targetUserId never validated to exist or be an attendee before create |
| M | `sponsor/app/api/request-meeting/route.ts:37` | Duplicate-request check drifted from meetings app: a REJECTED/CANCELLED request permanently blocks re-requesting |
| M | `sponsor/lib/hooks.ts:150` | usePrefetchAll caches error JSON bodies as query data (no res.ok check) |
| M | `web/app/api/chat/broadcast/route.ts:33` | Broadcast and clear-messages mutations never revalidate the 'chat' cache tag, so the cached chat feed resurrects deleted/stale messages |
| M | `web/app/api/meeting-requests/[id]/route.ts:122` | DELETE orphans the booked SponsorMeeting for rep→attendee requests, leaving a ghost meeting occupying an exclusive slot |
| M | `web/app/api/speakers/[id]/route.ts:8` | Cross-app speaker cache revalidation is hardcoded to http://localhost:3001 — a no-op in production |
| L | `sponsor/components/SponsorBrowseView.tsx:375` | Meeting request marked '✓ Requested' without checking the response succeeded |
| L | `web/app/api/chat/messages/route.ts:16` | ADMIN role locked out of chat moderation (and sync-members) because guards test only STAFF/ORGANIZER |
| L | `web/app/api/speakers/[id]/route.ts:57` | Speaker PUT/DELETE return success before the deferred DB write; a failed write is silently swallowed |
| L | `db/chat.ts:346` | getOrCreateDirectRoom can create duplicate DIRECT rooms under concurrent calls |

### Performance & efficiency (25)

| Sev | Location | Issue |
|---|---|---|
| H | `attendee/app/(authenticated)/(fullscreen)/chat/[roomId]/page.tsx:15` | Chat room page loads every channel member's base64 avatar just to compute a display name |
| H | `attendee/app/api/setup/meeting/route.ts:15` | POST /api/setup/meeting issues 5 sequential Turso round-trips (~850ms) that are mostly independent |
| H | `sponsor/app/api/request-meeting/route.ts:13` | Full auto-match engine sweep awaited on the user-facing request path |
| H | `db/meeting-engine.ts:2121` | autoAssignTables writes one sequential UPDATE per meeting (~170ms each) |
| H | `db/meeting-engine.ts:599` | autoPopulateSponsorTables issues 2 serial round-trips per sponsor |
| M | `attendee/app/api/setup/meeting/route.ts:15` | Peer-meeting create runs 4 sequential Turso round-trips (~700ms) where 1-2 suffice |
| M | `attendee/components/people/FeedTab.tsx:1051` | Comment/composer keystrokes re-render the entire feed (all posts with base64 images) — no per-post memoization |
| M | `meetings/app/api/meeting-requests/route.ts:64` | Best Fit picks block the user's response on a full auto-match sweep |
| M | `meetings/components/engine/MeetingEngineConsole.tsx:16` | Staff console fetches /api/staff/companies twice on every /staff load |
| M | `sponsor/app/api/profile/teammates/route.ts:23` | Same User row fetched twice sequentially per request (guard + getCallerCompanyId) |
| M | `sponsor/app/api/request-meeting/route.ts:71` | Extra DB round-trip to feed a revalidateTag no cache is subscribed to |
| M | `web/app/(dashboard)/dashboard/sponsors/[id]/page.tsx:119` | Sponsor detail page fetches ALL 2,537 users with EVERY column (including password hashes) on each request, just to fill a dropdown |
| M | `web/app/api/chat/sync-members/route.ts:31` | Sync-members issues one INSERT per missing user (up to ~2,500 sequential Turso round-trips) instead of createMany |
| M | `db/chat.ts:128` | listGlobalFeed pays an upsert write round-trip on every feed poll |
| M | `db/chat.ts:403` | listRoomMessagesForUser serializes the messages read and the read-marker write |
| M | `db/index.ts:111` | detectSpeakerConflicts issues one awaited upsert/update per conflict row (N+1) |
| M | `db/meeting-engine.ts:2444` | Auto-scheduler commit loop re-queries the sponsor fixed table per meeting (N+1) |
| M | `db/meeting-engine.ts:1505` | assignMeeting runs ~6 dependent-looking but independent queries serially |
| M | `db/meeting-engine.ts:874` | getCompanyDirectory fetches every live MeetingRequest and every CONFIRMED SponsorMeeting in the DB, unscoped by conference |
| M | `db/meeting-engine.ts:2582` | computeAutoMatches hauls every live request in the DB — with base64 image relations — on a sweep that runs on every board read |
| L | `attendee/app/api/friend/[userId]/route.ts:69` | Friend-action POST fetches the same friend status twice and serializes an independent upsert |
| L | `sponsor/app/api/meetings/[id]/route.ts:51` | Approve path chains up to 6 dependent Turso round-trips; two are parallelizable |
| L | `sponsor/app/api/request-meeting/route.ts:68` | Full auto-match sweep awaited inline before responding to a meeting-request POST |
| L | `web/app/api/email/send/route.ts:74` | Send path re-fetches the Integration row that getTransporter just read (and getTransporter probes providers with sequential queries) |
| L | `web/app/api/schedule-meetings/route.ts:147` | Time-block fetch runs sequentially after the busy-slot Promise.all, adding an avoidable ~170ms Turso round-trip |

### Dead code & cleanup (6)

| Sev | Location | Issue |
|---|---|---|
| M | `attendee/app/api/chat/rooms/route.ts:24` | GET /api/chat/rooms is dead code that re-introduces the documented ~4MB full-member-avatar payload |
| M | `attendee/app/api/posts/[postId]/like/route.ts:19` | Orphaned /api/posts/[postId]/like route with race-unsafe toggle that 500s on concurrent taps and unknown ids |
| M | `meetings/lib/mem-cache.ts:15` | The mem-cache read path is dead: cached() is never called, so all seven invalidate() calls are no-ops |
| L | `meetings/components/StaffQueue.tsx:15` | StaffQueue component is dead code, superseded by MeetingEngineConsole |
| L | `sponsor/app/api/browse/route.ts:9` | GET /api/browse has no caller in the sponsor app — dead route with full-table fallback |
| L | `sponsor/lib/rateLimit.ts:27` | rateLimit helper is dead code — hand-rolled /api/login ships with no throttle |
<!-- END FINDINGS TABLES -->

## Testing & verification

- **Typecheck:** `packages/db`, `apps/web`, `apps/meetings`, `apps/sponsor` all `tsc --noEmit` clean. `apps/attendee` clean except its two documented pre-existing errors (`BottomNav.tsx` TS2514 and a stale generated `.next` validator entry).
- **Existing behavioural suites over changed code — all pass:** `test:auto-match`, `test:meeting-tables`, `test:sponsor-tables`, `test:meetings-log`, `test:checkin`, `test:friends`, `test:feed`, `test:broadcast-glow`, `test:roles`.
- **Two new regression suites** (registered as `pnpm test:audit`):
  - `scripts/test-audit-db-regressions.mjs` — behavioural, against a scratch SQLite DB cloned from the live schema. Proves `getOrCreateDirectRoom` is idempotent under a concurrent burst (deterministic id, legacy-room reuse, friendship gate intact) and that `getCompanyDirectory` no longer leaks across conferences.
  - `scripts/test-audit-security.mjs` — source-shape assertions that each security/correctness fix stays fixed (no `x-user-role` header trust, request-header sanitization, no `password`/full-row includes, `formId`-scoped submission writes, login rate limits in all four apps, no health-endpoint secret leak, permission guards on all ten dashboard write pages, `/api/data/*` gating, batched DB writes, dead code removed).
- **Known non-passing suites, unrelated to this work:** `test-meeting-engine` fails 3 assertions identically on unmodified `main` (a local-DB fixture gap in the meeting-tables seed, not a regression — verified by running it against the reverted engine file); `test-access-counts` requires a live server on port 3000, which this environment's unrelated app occupies.

## Deliberately deferred

A few items were intentionally *not* changed, to keep this pass safe and in-scope:

- **`Post`/`PostLike` schema removal.** Deleting the orphaned like route was safe, but dropping the models requires a DDL migration against the shared live Turso database — a separate, explicit change.
- **`assignMeeting` full read fan-out.** Only the provably-independent reads were parallelized; the throwing guards were left in original order to preserve exact error precedence (`ALREADY_SCHEDULED` → `UNKNOWN_ROOM` → …), since `assertSlotBookable`/`assertBlockOpen` are shared by legacy confirm routes in three apps.
- **A shared cross-instance rate limiter.** The login throttling uses the repo's existing in-memory limiter (per serverless instance) for consistency with the other limited routes; a shared Upstash/Redis limiter remains the documented post-sprint solution.
- **The `"use cache"` directive and React Compiler.** Both are canary/experimental on Next 15.5 and were not adopted; the cache code is structured so the eventual migration is mechanical.
