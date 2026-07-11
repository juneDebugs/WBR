# Adversarial Review — FEATURE-001 Friend Requests + DM Gate

Run on 2026-07-11 against the working tree (pre-commit), by Claude Code orchestrating
8 independent finder agents (line-by-line, removed-behavior, cross-file tracer, reuse,
simplification, efficiency, altitude, conventions) with per-finding verification —
the sprint's Codex N=3 loop adapted to the available tooling. Cap honored: one full
find→fix→re-verify cycle, converged.

**Files reviewed:** the entire feature diff — `packages/db/src/friends.ts`,
`packages/db/src/chat.ts`, `apps/attendee/app/api/friend/[userId]/route.ts`,
`app/api/chat/rooms/route.ts`, `app/api/data/people/route.ts`, the `chat/dm`,
`chat/new`, `people`, `people/[id]` pages, `components/people/*`,
`components/chat/NewDmClient.tsx`, `scripts/test-friends*.mjs`,
`scripts/migrate-friends-backfill.mjs`, `scripts/e2e-home-feed.mjs`.

**Bar applied:** AC-failing = breaks the friend-request lifecycle, the DM gate, or any
existing surface that creates DM rooms; or regresses `test:feed` / `test:feed:api` /
`e2e:feed`.

---

## Round 1 — 6 AC-failing + 4 non-blocking, all fixed

- **F1 (AC-failing, cluster).** Three surfaces outside People POST `/api/chat/rooms`
  and navigated to `` `/chat/${room.id}` `` unconditionally: `MeetingActions.tsx`,
  `SponsorMeetingsView.tsx`, `MyScheduleView.tsx`. With the new gate a non-friend
  counterpart returns 403 → navigation to `/chat/undefined` (and a stuck loading
  state in MyScheduleView). **Fix:** all three now check `res.ok`; on
  `code: 'NOT_FRIENDS'` they route to `/people/<id>` (the friend-request tile),
  mirroring `chat/dm/[userId]`.
- **F2 (AC-failing).** `PeopleClient.friendState` was seeded once from
  `friendStatuses` and never re-synced, so the COUNTERPART's accept/decline/remove
  (which only arrives via an `/api/data/people` refetch) never reached the UI without
  a hard reload — the requester stayed on "Pending" forever. **Fix:** an effect
  replaces the optimistic map whenever a fresh `data.friendStatuses` payload lands;
  this also makes the DM-gate auto-unlock fire when the other side accepts.
- **F3 (AC-failing).** The comments-sheet stale-fetch guard (added mid-feature for a
  race the heavier people payload exposed) covered `setComments` but not
  `commentsLoading` — a superseded list fetch could strand the spinner or clear a
  newer sheet's spinner early. **Fix:** generation-guard the `finally` too, and
  `sendComment` clears the loading flag when it supersedes the in-flight fetch.
- **F4 (AC-failing).** `chat/new` now lists only friends but `NewDmClient` had no
  empty state — zero-friend users saw a dead blank screen. **Fix:** empty state with
  "No friends to message yet" + guidance, and a no-results state for searches.
- **F5 (AC-failing).** `chat/dm/[userId]` re-implemented lookup + gate + create with
  raw Prisma (three transcriptions of the gate rule; nonexistent target redirected to
  a 404ing profile). **Fix:** the page now calls `getOrCreateDirectRoom` — one gated
  create path; unknown target → `/chat`, NOT_FRIENDS → profile.
- **F6 (AC-failing at cutover).** Pre-existing one-way Follow rows read as pending
  requests under the new model, silently revoking Friends-tab entries and DM access.
  **Fix:** `scripts/migrate-friends-backfill.mjs` (idempotent, `--local` support,
  `db:backfill-friends` alias) mirrors one-way edges; run on all local DBs and on
  Turso at deploy.
- **F7 (non-blocking, efficiency).** `applyFriendAction` spent ~4 sequential Turso
  round trips per tap. **Fix:** target check parallelized with the status read; final
  status derived locally from the pre-mutation booleans (2 hops).
- **F8 (non-blocking, reuse).** `/api/data/people` hand-rolled the mutual-edge
  classification. **Fix:** extracted `deriveFriendStatusMap` in `friends.ts` as the
  single classifier; both `getFriendStatuses` and the route call it.
- **F9 (non-blocking, reuse).** Identical friend aria-label logic hand-written in
  three components. **Fix:** shared `lib/friend-labels.ts` (`friendAriaLabel`);
  visible button copy intentionally stays per-surface.
- **F10 (non-blocking).** Misc: vestigial `friendIds` prop removed from
  `PeopleClient`; unfriend-confirm name lookup extended to search results; DM-gate
  IIFE hoisted to `selectedStatus`; `people/[id]` skips the room query for
  non-friends; `chat/new` collapsed to one relation-filtered query.

**Deliberate non-fix (documented):** `postRoomMessage` stays membership-gated only —
existing conversations keep working after an unfriend. Recorded in the function's doc
comment and asserted by `test:friends` ("existing room still opens after unfriend").

## Round 2 — CONVERGED

Full re-run after fixes: `test:friends` (62/62), `test:friends:api`, `test:feed`,
`test:feed:api`, `test:feed:rail`, `test:scheduled`, `test:design`, `test:button-style`,
`e2e:feed` all pass; `tsc --noEmit` clean in `apps/attendee` (modulo the documented
`BottomNav.tsx` TS2514) and `packages/db`.
