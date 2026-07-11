# FEATURE-001 Smoketest — friend requests + DM friendship gate

**What this verifies:** the People→Feed "Follow" button is now a friend-request flow
(Friend → Pending → Accept → Friends), friendship is mutual `Follow` edges, and
starting a NEW direct-message conversation requires being friends (existing
conversations are grandfathered).

**Who this is for:** a human running the test manually, or an AI agent following the
same steps. No prior WBR knowledge required.

**Time to run:** ~5 minutes scripted; +5 minutes for the manual UI pass.

---

## 1. Which apps you need

**Only one:** `apps/attendee` (the participant PWA, port 3001). All checks below are
**contract checks** (env-agnostic per `CONTRACT.md` §1.1) — a local dev server is a
valid environment. There are no perf-bar checks in this smoketest.

## 2. Prerequisites

A seeded local DB (see `bugfix-001` §2 for first-time setup). The scripted steps
create and clean up their own users/edges/rooms.

---

## 3. Scripted steps (deterministic, binary pass criteria)

### Step 1 — data-layer contract (contract check)

```bash
node scripts/test-friends.mjs        # alias: test:friends (pnpm broken? run node directly)
```

**Pass:** exits 0 printing `FRIENDS LOGIC TEST PASSED ✓` (62 checks: lifecycle,
cancel/decline/remove, auto-advance inference, error paths, `getFriendStatuses` map,
DM gate NOT_FRIENDS → friends → room, grandfathering after unfriend, mutual-request
race). **Fail:** exit 1.

### Step 2 — HTTP contract (contract check)

```bash
node scripts/test-friends-api.mjs --start     # alias: test:friends:api; omit --start if :3001 is already up
```

**Pass:** exits 0 printing `FRIENDS API TEST PASSED ✓` (401s logged out; request →
pending_outgoing/pending_incoming on the two sides; `/api/data/people` carries
`friendStatuses` + `incomingRequests` and mutual-only `friendIds`; DM attempt while
pending → **403 with `code: 'NOT_FRIENDS'`**; accept → friends → DM 200 + message
round-trip; self → 400, unknown → 404, old `/api/follow` route gone; remove → the
pre-existing room still opens with the SAME id). **Fail:** exit 1.

### Step 3 — feed suites still green (contract check, regression guard)

```bash
node scripts/test-home-feed.mjs && node scripts/test-home-feed-api.mjs && node scripts/e2e-home-feed.mjs
```

**Pass:** all three exit 0 (`HOME FEED LOGIC/API TEST PASSED ✓`, `HOME FEED E2E
PASSED ✓`). The e2e run seeds mutual edges before its DM-rail setup — a failure at
"DM room create failed: 403" means that seeding regressed.

---

## 4. Manual UI pass (contract checks, two browsers)

Log in as two different attendees (e.g. `steph@curry.com` / `stephcurry` and a second
seeded account) in two browser profiles at `http://localhost:3001/people`.

1. **Feed button states** — user A taps **Friend** on one of B's posts. Pass: the
   button reads **Pending** for A; B's feed shows **Accept** on A's posts and B's
   Friends tab shows a **Requests** section with A (Accept button + ✕ decline).
2. **Tap Pending cancels** — A taps **Pending**. Pass: button returns to **Friend**;
   B's Requests row disappears (after B's next data refetch or tab re-entry).
3. **Accept → Friends** — A requests again; B taps **Accept**. Pass: both sides show
   **Friends** (feed button inert — not tappable), both Friends tabs list each other.
4. **DM gate** — before accepting, A taps B in the People list. Pass: the DM sheet
   shows "You can message … once you're friends." with the contextual action button
   and NO message composer. After becoming friends the same sheet auto-loads the
   conversation and the composer appears (no reopen needed when the accept happens
   on A's own device).
5. **Unfriend grandfathering** — after exchanging one DM, A removes B (Friends tab row
   → Friends button → confirm). Pass: the existing conversation still opens from the
   Messages tab and still sends; tapping **Friend** again restarts the request flow.
6. **Profile tile** — on B's profile (`/people/<id>`), the Message tile is present only
   when friends; otherwise the friend-request tile (Add Friend / Pending / Accept)
   stands in its place.

**Fail for any step:** the described observable does not occur.
