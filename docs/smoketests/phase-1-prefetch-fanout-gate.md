# Phase 1 Smoketest — Gate attendee `BackgroundPrefetch` fan-out

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md` (read this first if you haven't); source: WBR demo sprint PRD §6 Phase 1, §8.1.

## What this verifies

- `usePrefetchAll` no longer competes with the current page's critical query — the eight prefetches are gated on the `load` event and then scheduled via `requestIdleCallback(run, { timeout: 10_000 })` (or `setTimeout(run, 0)` after `load` on Safari < 16.4).
- The cache-warming intent of `BackgroundPrefetch` is preserved — all eight endpoints still populate React Query's cache for inter-route navigation.
- React Query's `staleTime` contract is unchanged — within `staleTime` the cache serves stored data; after expiry the next mount/focus refetches. The prefetch deferral is a *scheduling* change, not a caching change.
- Attendee mobile LCP on the four landing pages (`/home`, `/speakers`, `/schedule`, `/people`) measurably improves vs. the Phase 2 baseline against a production-equivalent measurement.

## Prerequisites for the runner

- All four apps runnable locally per `docs/smoketests/phase-0a-foundation-docs.md` §3–4.
- Chrome DevTools (Network + Performance panels) available.
- For production-build steps: `pnpm --filter attendee build && pnpm --filter attendee start` works on the branch.
- For Vercel preview Lighthouse: the PR's preview URL (`gh pr view <number> --json statusCheckRollup,deployments` or copy from PR check list).
- Attendee credentials: `steph@curry.com` / `stephcurry`.

## Steps

### Step 1 — Code-level inspection [contract]

**Verifies:** the implementation matches the design surfaced in `apps/attendee/lib/hooks.ts`.

- [ ] Read `apps/attendee/lib/hooks.ts` and confirm `usePrefetchAll`'s `useEffect` body wraps the eight `prefetchQuery` calls inside a `run()` function. Confirm the effect gates scheduling on the `load` event — `schedule()` runs only after `document.readyState === 'complete'` or after a `window.addEventListener('load', …, { once: true })` listener fires.
  - **Pass:** the eight `prefetchQuery` calls are inside the `run` closure (not inlined in the effect body); a `load` listener is installed when `readyState !== 'complete'`.
  - **Fail:** any of the eight calls runs synchronously inside the effect body; no `load` gate present.
- [ ] Confirm `schedule()` uses `window.requestIdleCallback(run, { timeout: 10_000 })` when available and `setTimeout(run, 0)` as the Safari-< 16.4 fallback.
  - **Pass:** both branches present; both plus the `load` listener are torn down by the effect's cleanup (`removeEventListener`, `cancelIdleCallback`, `clearTimeout`).
  - **Fail:** missing cleanup for any of the three states; missing fallback path.

### Step 2 — Cold-load deferral [contract]

**Verifies:** the eight prefetches fire AFTER the document's `load` event on a fresh document load.

This step must observe a **cold document load of `/home`** so that a fresh `load` event fires on the same document the prefetch deferral runs in. The attendee login form uses `router.push('/home')` (client-side navigation in the same document), so logging in then watching the prefetches would never see a `/home`-document `load` marker. To verify the `load`-event gate end-to-end we must force a fresh `/home` document load after the session cookie is set.

This is a **contract check** — the cache mechanics and `load`-event handler are the same code regardless of environment. Throttling is not required to pass.

- [ ] In a clean incognito window, navigate to `http://localhost:3001/login` and log in as `steph@curry.com` / `stephcurry`. Land on `/home` via the form's redirect. This step exists only to set the NextAuth session cookie.
- [ ] Open DevTools → Network panel → check "Disable cache." Open the Performance panel and prepare to record.
- [ ] Start the Performance recording, then hard-reload the page (`Cmd+R` / `Ctrl+R`) while sitting on `/home`. Stop the recording once the page has fully painted and the timeline is quiet.
- [ ] In the Performance timeline, locate the `load` event marker (Timings track). Then in the Network panel, sort by Start Time and inspect the eight prefetch endpoints:
  - `/api/data/meetings`, `/api/data/home`, `/api/data/schedule`, `/api/data/speakers`, `/api/data/people`, `/api/data/chat`, `/api/data/my-schedule`, `/api/data/setup`.
  - **Pass:** the seven *non-home* prefetches all start *after* the `load` event marker. `/api/data/home` (the route's own critical query) may start before or shortly after — its position relative to `load` is not part of the gate's contract.
  - **Fail:** any of the seven non-home prefetches starts before the `load` event marker.

**Known limitation:** on SPA-nav (login → `/home`), the deferral does NOT engage because the `load` event already fired on a prior document. The `usePrefetchAll` effect takes the `document.readyState === 'complete'` branch and schedules immediately via `requestIdleCallback`. The seven prefetches still queue behind `requestIdleCallback`'s idle gate, but the timing is much tighter and the contract above can't be verified on the SPA-nav path. See `docs/codex-reviews/phase-1-prefetch-fanout-gate.md` §Round 3.

### Step 3 — Warm-nav cache hits [contract]

**Verifies:** after the prefetches land, React Query's cache lookup serves inter-route navigation without a fresh network request.

- [ ] From `/home` (after Step 2's hard-reload), wait until the Network panel shows all eight `/api/data/*` responses landed (HTTP 200, no pending). With DevTools throttling off this typically takes <2 s.
- [ ] Right-click the Network panel and select "Clear" to reset the request log.
- [ ] Click bottom-nav to `/schedule`.
  - **Pass:** no new `/api/data/schedule` request appears in the Network panel during navigation.
  - **Fail:** a fresh `/api/data/schedule` request fires.
- [ ] Click bottom-nav to `/speakers`.
  - **Pass:** no new `/api/data/speakers` request.
  - **Fail:** a fresh `/api/data/speakers` request fires.
- [ ] Click bottom-nav to `/people`.
  - **Pass:** no new `/api/data/people` request.
  - **Fail:** a fresh `/api/data/people` request fires.

If `staleTime` has expired on any endpoint between prefetch and navigation (the lowest is `speakers-data` at 5 s), a background refetch may fire — that's expected React Query behavior; the verifier must distinguish "the route's query fired on mount because cache was empty" (FAIL) from "the route mounted with cache present then a stale-on-mount refetch fired in the background" (PASS).

### Step 4 — Data-staleness contract [contract]

**Verifies:** React Query's `staleTime` contract is unchanged — within `staleTime` the cache serves stored data without refetching; past `staleTime` the next mount triggers a background refetch.

- [ ] Open the React Query DevTools (or watch the Network panel). Wait for all eight prefetches to land. Note the `dataUpdatedAt` timestamp for `speakers-data` (5 s `staleTime` — fastest expiry).
- [ ] Within 5 s of `speakers-data` landing, navigate `/home` → `/speakers` and back twice.
  - **Pass:** no new `/api/data/speakers` request fires in the Network panel during either round-trip.
  - **Fail:** any new `/api/data/speakers` request fires.
- [ ] Wait past the 5 s window, then navigate `/home` → `/speakers` again.
  - **Pass:** exactly one new `/api/data/speakers` request fires in the Network panel (React Query's stale-on-mount refetch). Cached data renders immediately; the refetch resolves in the background.
  - **Fail:** zero new requests (cache never refetches stale data) OR more than one new request (duplicate fetch).
- [ ] In a second tab, log into admin (`http://localhost:3000` as `june@tailor.tech` / `admin123`) and edit a speaker name. Return to the attendee tab and either (a) wait past 5 s and revisit `/speakers`, or (b) open React Query DevTools and call `queryClient.invalidateQueries({ queryKey: ['speakers-data'] })`.
  - **Pass:** the next `/api/data/speakers` refetch returns the mutated speaker name; the UI reflects it.
  - **Fail:** the mutated name does not appear after a documented refetch.

### Step 5 — No-regression check on `/home` TBT [perf-bar tier C]

**Verifies:** the deferral does not regress the `/home` Total Blocking Time baseline (~100 ms per Phase 2 measurement).

**Environment required: local production build.** Dev-mode (`pnpm dev`) is invalid for this step — the JS bundle inflates by an order of magnitude and Lighthouse numbers become uninterpretable.

```bash
# Build + start attendee in production mode (port 3001)
pnpm --filter attendee build
pnpm --filter attendee start
```

- [ ] Capture a fresh session cookie via the production server's `/api/login`:
  ```bash
  curl -s -c /tmp/wbr-cookies.txt -X POST http://localhost:3001/api/login \
    -H "Content-Type: application/json" \
    -d '{"email":"steph@curry.com","password":"stephcurry"}'
  ```
- [ ] Run Lighthouse against `/home` with the cookie applied:
  ```bash
  TOKEN=$(grep next-auth /tmp/wbr-cookies.txt | awk '{print $7}')
  npx --yes lighthouse@latest http://localhost:3001/home \
    --output=json \
    --output-path=/tmp/wbr-phase1-lh.json \
    --quiet --chrome-flags="--headless=new" \
    --form-factor=mobile \
    --extra-headers="$(printf '{"Cookie":"next-auth.session-token=%s"}' "$TOKEN")" \
    --only-categories=performance
  ```
- [ ] Parse the result and check TBT:
  ```bash
  node -e 'const lh=require("/tmp/wbr-phase1-lh.json"); console.log("TBT:", Math.round(lh.audits["total-blocking-time"].numericValue), "ms")'
  ```
  - **Pass:** TBT ≤ 150 ms (gives a ~50% margin over the Phase 2 production baseline of ~100 ms; the local-prod-build measurement runs on localhost which has zero network latency, so the absolute number is not directly comparable to production but should trend lower or comparable).
  - **Fail:** TBT > 150 ms.

### Step 6 — AC verification [perf-bar tier B, pre-merge]

**Verifies:** the headline AC claim — attendee mobile LCP on `/home`, `/speakers`, `/schedule`, `/people` measurably improved vs. the Phase 2 baseline — on a production-equivalent build.

**Environment required: Vercel preview deployment.** The PR for this branch will produce a preview URL on the `wbr` Vercel project (the attendee-app project). The build is identical to production; only the URL is per-branch. This is the empirical gate to clear *before* merging.

- [ ] After pushing the branch and opening the PR, find the preview URL from the PR's check list (look for the `wbr` project deployment).
- [ ] Capture a session cookie from the preview deployment's `/api/login`:
  ```bash
  PREVIEW_URL=<paste from PR>  # e.g., https://wbr-attendee-<hash>-june-1220s-projects.vercel.app
  curl -s -c /tmp/wbr-preview-cookies.txt -X POST $PREVIEW_URL/api/login \
    -H "Content-Type: application/json" \
    -d '{"email":"steph@curry.com","password":"stephcurry"}'
  ```
  (On HTTPS the cookie name is `__Secure-next-auth.session-token`. Adjust the parsing accordingly.)
- [ ] Run Lighthouse against each of `/home`, `/speakers`, `/schedule`, `/people` on the preview URL, mobile profile, simulated slow-4G (Lighthouse mobile default):
  ```bash
  for route in home speakers schedule people; do
    TOKEN=$(grep -E '(next-auth|Secure-next-auth)' /tmp/wbr-preview-cookies.txt | tail -1 | awk '{print $7}')
    COOKIE_NAME=$(grep -E '(next-auth|Secure-next-auth)' /tmp/wbr-preview-cookies.txt | tail -1 | awk '{print $6}')
    npx --yes lighthouse@latest $PREVIEW_URL/$route \
      --output=json \
      --output-path=/tmp/wbr-phase1-preview-$route.json \
      --quiet --chrome-flags="--headless=new" \
      --form-factor=mobile \
      --extra-headers="$(printf '{"Cookie":"%s=%s"}' "$COOKIE_NAME" "$TOKEN")" \
      --only-categories=performance
  done
  ```
- [ ] **AC bar amended 2026-06-27** per PRD §6 Phase 1 (methodology finding). Read against **observed LCP** as primary, **simulated LCP** as supplementary signal.

  Extract both per route from the Lighthouse JSON:
  ```bash
  for route in home speakers schedule people; do
    node -e "const lh=require('/tmp/wbr-phase1-preview-${route}.json'); const m=lh.audits.metrics.details.items[0]; console.log('${route}: obsLCP=' + Math.round(m.observedLargestContentfulPaint) + 'ms, simLCP=' + Math.round(lh.audits['largest-contentful-paint'].numericValue) + 'ms, TBT=' + Math.round(lh.audits['total-blocking-time'].numericValue) + 'ms')"
  done
  ```

  | Route | Phase 2 baseline simLCP | Primary AC (observed) | Supplementary (simulated, reported but not gating) |
  |---|---:|---:|---:|
  | `/home` | 17.10 s | obsLCP < 3 s | track simLCP reduction for Phase 13 |
  | `/speakers` | 15.50 s | obsLCP < 3 s | track simLCP reduction for Phase 13 |
  | `/schedule` | 8.83 s | obsLCP < 3 s | track simLCP reduction for Phase 13 |
  | `/people` | 8.14 s | obsLCP < 3 s | track simLCP reduction for Phase 13 |

  - **Pass (Phase 1 AC bar met):** every route's `audits.metrics.details.items[0].observedLargestContentfulPaint` < 3000 ms on the Vercel preview Lighthouse mobile run. TBT on `/home` ≤ 150 ms (Phase 2 baseline ~100 ms).
  - **Fail:** any route's observed LCP ≥ 3000 ms OR `/home` TBT > 150 ms.

  The simulated-LCP reduction is reported for the Phase 13 perf delta report but does NOT gate Phase 1 acceptance — the lantern-model amplification of the base64-in-DB image storage pattern in `/api/data/*` responses inflates simulated LCP independent of Phase 1's deferral work. The architectural unlock for simulated LCP is Phase 16 (post-sprint per PRD §6 Phase 16).

### Step 7 — Post-merge production confirmation [perf-bar tier A]

**Verifies:** the preview-build measurement holds against the post-merge production deployment.

**Environment required: production deploy.** Run after the PR merges to `main` and the `wbr` Vercel project completes its production deployment.

- [ ] Repeat Step 6's Lighthouse runs against the production URL (`wbr.tailor.tech` once Phase 10's vanity URL is live; otherwise the production-Vercel URL — confirm in `wbr` project's domain settings).
- [ ] Apply the same pass criteria as Step 6.
- [ ] Sequenced as sprint Phase 7 per PRD §6.

### Step 8 — PWA service-worker compatibility [contract, prod-build only]

**Verifies:** the deferral change does not break service-worker installation or PWA cache behavior.

**Environment required: local production build** (SW is disabled in dev mode per `apps/attendee/next.config.js`).

```bash
pnpm --filter attendee build
pnpm --filter attendee start
```

- [ ] In a clean incognito window, open `http://localhost:3001/login`, log in, hard-reload `/home`. Open DevTools → Application panel → Service Workers.
  - **Pass:** the `/sw.js` service worker shows "activated and is running." No console errors in DevTools Console panel.
  - **Fail:** SW fails to install or activate; any console error mentions Workbox, prefetch, or query-client.
- [ ] Application panel → Cache Storage. Inspect the precache (`workbox-precache-v2`) and the runtime caches.
  - **Pass:** precache contains the bootstrap shell (JS bundles, icons, manifest); runtime caches show entries for the eight `/api/data/*` URLs hit during the session.
  - **Fail:** precache empty; no runtime cache entries.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Code inspection | contract | anywhere | |
| 2. Cold-load deferral | contract | local dev / local prod / preview | |
| 3. Warm-nav cache hits | contract | local dev / local prod / preview | |
| 4. Data-staleness contract | contract | local dev / local prod / preview | |
| 5. `/home` TBT | perf-bar tier C | **local prod build** | |
| 6. AC verification | perf-bar tier B | **Vercel preview** | |
| 7. Post-merge confirmation | perf-bar tier A | **production deploy** | |
| 8. PWA SW compatibility | contract | **local prod build** | |

## Pass / fail

The phase ships when:
- Steps 1–4 PASS on any valid environment.
- Step 5 PASS on local prod build.
- Step 6 PASS on the Vercel preview before merge (observed LCP < 3s on all 4 routes; TBT ≤ 150 ms on `/home`). Simulated-LCP reduction reported for Phase 13 but non-gating.
- Step 8 PASS on local prod build.
- Step 7 is the post-merge confirmation gate (sprint Phase 7).

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/attendee/lib/hooks.ts`
- `apps/attendee/components/BackgroundPrefetch.tsx` or its layout call site at `apps/attendee/app/(authenticated)/(app)/layout.tsx`
- `apps/attendee/next.config.js` Workbox `runtimeCaching` rules (Phase 5 — the SW caching policy interacts with the prefetched endpoints)
- The `/api/data/*` route handlers for any of the eight prefetched endpoints

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
