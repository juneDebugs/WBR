# Phase 1 Smoketest — Gate attendee `BackgroundPrefetch` fan-out

Manual verification path. Both human and AI agents are valid runners. Source: WBR demo sprint PRD §6 Phase 1, §8.1 (smoketest contract).

## What this verifies

- `usePrefetchAll` no longer competes with the current page's critical query — the eight prefetches are gated on the `load` event and then scheduled via `requestIdleCallback(run, { timeout: 10_000 })` (or `setTimeout(run, 0)` after `load` on Safari < 16.4).
- The cache-warming intent of `BackgroundPrefetch` is preserved — all eight endpoints still populate React Query's cache for inter-route navigation.
- React Query's `staleTime` contract is unchanged — within `staleTime` the cache serves stored data; after expiry the next mount/focus refetches. The prefetch deferral is a *scheduling* change, not a caching change.
- Attendee mobile LCP on the four landing pages (`/home`, `/speakers`, `/schedule`, `/people`) measurably improves vs. the Phase 2 baseline.

## Prerequisites for the runner

- All four apps runnable locally per `docs/smoketests/phase-0a-foundation-docs.md` §3–4 (or against the deployed `wbr` Vercel project for the production-Lighthouse leg).
- Chrome DevTools (Performance + Network panels) available.
- Attendee credentials: `steph@curry.com` / `stephcurry`.
- For the production-Lighthouse leg: the Phase 2 runner at `/tmp/wbr-perf/run-lighthouse.sh` or Chrome DevTools Lighthouse mobile profile.

## Steps

### 1. Code-level inspection

- [ ] Read `apps/attendee/lib/hooks.ts` and confirm `usePrefetchAll`'s `useEffect` body wraps the eight `prefetchQuery` calls inside a `run()` function. Confirm the effect gates scheduling on the `load` event — `schedule()` runs only after `document.readyState === 'complete'` or after a `window.addEventListener('load', …, { once: true })` listener fires.
  - **Expected:** The eight `prefetchQuery` calls no longer execute synchronously inside the effect body. The schedule waits for `load` so the prefetches do not enter the LCP window.
- [ ] Confirm `schedule()` uses `window.requestIdleCallback(run, { timeout: 10_000 })` when available and `setTimeout(run, 0)` as the Safari-< 16.4 fallback.
  - **Expected:** Both branches plus the `load` listener are torn down by the effect's cleanup (`removeEventListener`, `cancelIdleCallback`, `clearTimeout`) so an unmount before the callback fires cancels the schedule cleanly.

### 2. Cold-load deferral — DevTools verification (local)

This step must observe a **cold document load of `/home`** so that a fresh `load` event fires on the same document the prefetch deferral runs in. The attendee login form uses `router.push('/home')` (client-side navigation in the same document), so logging in then watching the prefetches would never see a `/home`-document `load` marker — the gate would take the `document.readyState === 'complete'` branch from `/login`'s already-fired `load`. To verify the `load`-event gate end-to-end we must force a fresh `/home` document load after the session cookie is set. This matches the AC measurement path (the Phase 2 Lighthouse runner hits routes cold).

- [ ] In a clean incognito window, navigate to `http://localhost:3001/login` and log in as `steph@curry.com` / `stephcurry`. Land on `/home` via the form's redirect. This step exists only to set the NextAuth session cookie — do not record it.
- [ ] Now open DevTools → Network panel → throttle to **Slow 4G**, check "Disable cache" (the session cookie persists; the page document does not). Open the Performance panel and prepare to record.
- [ ] Start the Performance recording, then hard-reload the page (`Cmd+R` / `Ctrl+R`) while sitting on `/home`. This forces a fresh document load of `/home` with the session cookie already in place. Stop the recording once the page has fully painted and the timeline is quiet.
- [ ] In the Performance timeline, locate the `load` event marker (Timings track). Then in the Network panel, sort by Start Time and inspect the eight prefetch endpoints:
  - `/api/data/meetings`, `/api/data/home`, `/api/data/schedule`, `/api/data/speakers`, `/api/data/people`, `/api/data/chat`, `/api/data/my-schedule`, `/api/data/setup`.
  - **Expected:** `/api/data/home` (the route's own critical query) fires before the `load` event marker. The seven *non-home* prefetches all start *after* the `load` event marker — proof that the `load` gate plus the idle-callback schedule kept them out of the LCP window. (Note: `/api/data/home` may appear twice if React Query's own fetch and the prefetch run back-to-back; only the second instance should be post-load.)

**Known limitation observed during Round 3 review:** the deferral gate works correctly on cold loads (Lighthouse path, deep links, browser reloads) but does *not* fire on intra-app SPA navigation (e.g., the live login → `/home` flow). On SPA nav the `load` event already fired on a prior document, so the `usePrefetchAll` effect takes the `document.readyState === 'complete'` branch and schedules immediately via `requestIdleCallback`. The seven prefetches still queue behind `requestIdleCallback`'s idle gate, so the worst-case contention is bounded; subsequent inter-route nav (`/home` → `/people` → `/schedule`) still benefits from the warmed cache. Documented in `docs/codex-reviews/phase-1-prefetch-fanout-gate.md` §Round 3.

### 3. Warm-nav cache-hit verification

- [ ] From `/home`, wait until the Network panel quiets and all eight prefetch responses have arrived (idle callback timeout is 10 s; on slow-4G the entire batch typically settles within 5–15 s of `load`).
- [ ] Click bottom-nav to `/schedule`, then `/speakers`, then `/people` in quick succession.
  - **Expected:** Each route renders from cache without a fresh `/api/data/*` round-trip. Loading skeletons either do not appear or flash for less than a frame. (If `staleTime` has expired on any endpoint — speakers' `staleTime` is only 5 s — a background refetch may fire, but the cached data renders first.)

### 4. Data-staleness contract — verify the deferral did NOT change React Query semantics

The goal of this step is to confirm the prefetch deferral is a *scheduling* change only; the `staleTime` contract should behave exactly as before.

- [ ] In the React Query DevTools (or via the Network panel), wait for all eight prefetches to land. Note the `dataUpdatedAt` timestamp for `speakers-data` and `schedule-data`.
- [ ] Within the speakers `staleTime` window of 5 s, navigate `/home` → `/speakers` and back twice.
  - **Expected:** No new `/api/data/speakers` request fires during the 5 s window — the cache is treated as fresh. This matches pre-change behavior.
- [ ] Wait past the 5 s window, then navigate `/home` → `/speakers` again.
  - **Expected:** A background refetch of `/api/data/speakers` fires (React Query default behavior on stale-on-mount). Cached data renders immediately; fresh data swaps in when the refetch resolves.
- [ ] In a second tab logged in as admin (`june@tailor.tech` / `admin123` on `localhost:3000`), edit a speaker name. Return to the attendee tab and either (a) wait past 5 s and revisit `/speakers`, or (b) call `queryClient.invalidateQueries({ queryKey: ['speakers-data'] })` from the React Query DevTools.
  - **Expected:** The mutated name shows up on the next refetch. The prefetch deferral does not block subsequent invalidation-driven refetches.

### 5. No-regression check on `/home` TBT

- [ ] Run Chrome DevTools Lighthouse (mobile profile, applied throttling) against `http://localhost:3001/home` after login.
  - **Expected:** Total Blocking Time stays at or below the Phase 2 baseline of ~100 ms. The Long Tasks track shows no new task ≥50 ms attributable to the deferred prefetch batch (the eight `prefetchQuery` calls run synchronously inside one `run()` invocation, but each is a thin React Query enqueue — the batch should land under one main-thread tick).

### 6. Production Lighthouse re-measurement (the AC bar)

- [ ] After this PR merges and the Vercel `wbr` project deploys, run the Phase 2 Lighthouse runner against attendee mobile per `recon/perf_investigation_2026_06_18.md` §"Re-measurement instructions". If `/tmp/wbr-perf/` has been cleared, re-capture cookies first.
  - **Expected per PRD §6 Phase 1 AC:** At least one of `/home`, `/speakers`, `/schedule`, `/people` mobile LCP under 3 s post-change; remaining routes show ≥50% LCP reduction vs. the Phase 2 baseline (`/home` 17.10 s, `/speakers` 15.50 s, `/schedule` 8.83 s, `/people` 8.14 s).
  - **Expected:** No TBT regression — `/home` mobile TBT remains around the 100 ms baseline.

### 7. PWA service-worker compatibility check

- [ ] Build attendee for production (`pnpm --filter attendee build && pnpm --filter attendee start`) and reload the site in a private window. Confirm the service worker installs and the PWA precache populates.
  - **Expected:** Service worker installs as before. The deferred prefetches still populate React Query's in-memory cache. The PWA NetworkFirst rules continue to serve cached responses on subsequent loads. No new console errors.

## Pass / fail

Smoketest **passes** when every checked item produces its expected outcome. Steps 1–5 are local-dev verification. Step 6 is the production AC bar — required for Phase 1 to be considered complete per PRD §6 Phase 1 acceptance criteria. Step 7 is the PWA-compatibility guardrail; failure here means the deferral broke service-worker installation and the fix needs rework.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/attendee/lib/hooks.ts` (the prefetch hooks themselves)
- `apps/attendee/components/BackgroundPrefetch.tsx` or its layout call site at `apps/attendee/app/(authenticated)/(app)/layout.tsx`
- `apps/attendee/next.config.js` Workbox `runtimeCaching` rules (Phase 5 — the SW caching policy interacts with the prefetched endpoints)
- The `/api/data/*` route handlers for any of the eight prefetched endpoints (data-freshness contract may shift)

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
