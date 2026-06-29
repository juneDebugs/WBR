# Phase 5 Smoketest — Split attendee NetworkFirst PWA timeout by rule class

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md` (read first if you haven't); source: WBR demo sprint PRD §6 Phase 5, §8.1, §8.6.

## What this verifies

- All five Workbox runtime-caching rules in `apps/attendee/next.config.js` have been re-tuned per the PRD §6 Phase 5 approach:
  - Image-class rules (`next-image`, `cross-origin-images`, `unsplash-images`) switch from `NetworkFirst` to `StaleWhileRevalidate` — instant from cache, background refresh.
  - Page rule (same-origin, non-`/api/`) and the `next-data` rule both keep `NetworkFirst` semantics but lower `networkTimeoutSeconds` from `10` to `5`. The `next-data` rule is likely inert under the App Router (see PRD §6 Phase 5 Approach + Codex T4), but the timeout is updated consistently.
- **(Primary, load-bearing.)** The attendee service worker installs after a warm authenticated load — confirms the PWA build pipeline still produces a registered SW.
- **(Primary, load-bearing.)** After a cache warm, every image-class response on a subsequent reload comes from the service worker (`response.fromServiceWorker() === true`) — the SWR handlers serve cached variants without waiting on network. AND: with the image cache populated, an offline fetch of every cached image URL still resolves successfully through the SW. The literal PRD §6 Phase 5 AC #2 ("under emulated offline, every image-class response on reload returns fromSW=true") was authored before the base64-storage + data-gated rendering interaction was understood: avatar grids on `/people`, speaker thumbnails, etc. source URLs from `/api/data/*` responses, which fail under offline (no SW rule for `/api/*` paths, by design — they flow through React Query's own cache), so the page falls into a loading state and zero `<img>` elements render. The script's Step 2 therefore splits into two halves: (2a) online warm-reload — all image responses SW-served; (2b) offline fetch of each cached image URL — all served from the workbox cache. Together these directly verify the offline-resilience contract the AC intended without depending on the data-gated render.
- **(Primary, load-bearing.)** Under emulated offline, the page rule's cache fallback serves a 200-status SW-cached response for `/schedule` — and the response body contains a real authenticated-route shell (matching URL, `/_next/static` chunk references in the document, no login-form indicators), not a redirected `/login` page or a workbox-precache synthesized fallback. The literal PRD AC #3 ("under emulated 10 s latency, `/schedule` navigation elapsed < 6000 ms") is **not verifiable on this stack** — Playwright's CDP `Network.emulateNetworkConditions` latency does not propagate to service-worker-initiated fetches (verified empirically: under 10 s latency, SW network fetches resolved in ~20 ms regardless of throttle setting). The 5 s timeout VALUE is verified at the source level by Step 1's `next-config.js` block-targeted assertions. The offline-fallback observation in this step proves the half of the contract that Playwright CAN verify — that the page rule's cache fallback fires when network fails AND serves the right document. Together with Step 1's source-level check, the timeout-and-fallback contract is verified end-to-end without depending on an unobservable timing boundary.
- **(Primary, load-bearing.)** Page rule remains `NetworkFirst`, not `StaleWhileRevalidate`. With a known stale marker poisoned into the SW `pages` cache, an online reload renders the live network response, not the cached marker. **Framing clarification (vs the literal PRD AC #4 wording "after a seed-data mutation + reload, the rendered page reflects the post-mutation state"):** workbox's page rule caches the page DOCUMENT (HTML shell), not the per-route data. In the App Router, page documents are client-rendered shells that mount React components which fetch via React Query against `/api/data/*` — and `/api/*` has no SW rule (data flows through React Query's own caching layer, not workbox). Mutating seed data + reloading therefore tests React Query's `staleTime` semantics, not Phase 5's page-rule change. The contract Phase 5 actually changes is "does the page rule prefer network over cache when both are reachable" — the cache-poison test is the direct verification for that contract. This protects against stale schedule / meeting state during the live event (Codex T4's risk flag).
- No regression in attendee landing-page Lighthouse measurements (perf-bar tier C on the local prod build, optional tier B confirmation on the Vercel preview).

## Prerequisites for the runner

- Attendee app runnable locally per `docs/smoketests/phase-0a-foundation-docs.md` §3–4.
- **Node 20 or newer.** The Playwright script uses `Response.headers.getSetCookie()` for cookie extraction (added in Node 20, April 2023). Confirm via `node --version` — anything earlier short-circuits the cookie extraction and the script throws `/api/login response did not set next-auth.session-token cookie` even with a healthy server. The Tier-C/Tier-B shell recipes use shell `awk` for cookie extraction and are not Node-version-dependent.
- For contract Step 1: source-tree access only (no running server required).
- For contract Step 2 (Playwright PWA-runtime contracts): local prod build of attendee (`pnpm --filter attendee build && pnpm --filter attendee start` → port `3001`) AND Playwright + chromium installed. Playwright is a root devDependency from Phase 3 (`pnpm add -D -w playwright` already run); chromium browser binary already installed via `npx playwright install chromium`. See PRD §8.6.
  - **Tier D (`pnpm --filter attendee dev`) is invalid for this step.** The PWA is disabled in dev (`next.config.js`: `disable: NODE_ENV === 'development'`) — the service worker never registers, so every Playwright step's preconditions fail.
- Attendee `.env.local` present with `NEXTAUTH_SECRET`, `NEXTAUTH_URL=http://localhost:3001`, `DATABASE_URL=file:./dev.db` (verified working in the existing checkout — relative path is fine for attendee, unlike sponsor's absolute-path requirement documented in the Phase 3 smoketest).
- For perf-bar Step 3 Tier-C: same local prod build on port `3001`.
- For perf-bar Step 3 Tier-B: the PR's Vercel preview URL (`vercel ls wbr-attendee --scope june-1220s-projects | head -10`) and the bypass token (Vercel project → Settings → Deployment Protection).
- Seeded credentials per `packages/db/prisma/seed.ts` (default: `steph@curry.com` / `stephcurry`); seed runs as part of the bootstrap flow.

## Steps

### Step 1 — Code-level inspection [contract]

**Verifies:** the runtime-caching configuration matches the PRD §6 Phase 5 approach. Env-agnostic — the file compiles to the same `sw.js` everywhere.

- [ ] Each of the three image-class rules is SWR — `node -e "const c=require('fs').readFileSync('apps/attendee/next.config.js','utf8'); for (const n of ['next-image','cross-origin-images','unsplash-images']) { const m = c.match(new RegExp(\"handler: '([^']+)',\\\\s*options:\\\\s*\\\\{\\\\s*cacheName: '\" + n + \"'\")); console.log(n, '→', m?.[1] ?? 'NOT FOUND'); }"`
  - **Pass:** all three print `→ StaleWhileRevalidate`.
  - **Fail:** any rule prints `NetworkFirst` or `NOT FOUND`.
- [ ] Each of the two NetworkFirst rules has `networkTimeoutSeconds: 5` — `node -e "const c=require('fs').readFileSync('apps/attendee/next.config.js','utf8'); for (const n of ['pages','next-data']) { const m = c.match(new RegExp(\"cacheName: '\" + n + \"',\\\\s*networkTimeoutSeconds:\\\\s*(\\\\d+)\")); console.log(n, '→', m?.[1] ?? 'NOT FOUND'); }"`
  - **Pass:** both print `→ 5`.
  - **Fail:** either prints `10` or `NOT FOUND`.
- [ ] Image-class rules precede the page rule (the rule-ordering shadow bug fix) — `node -e "const c=require('fs').readFileSync('apps/attendee/next.config.js','utf8'); const pos = (n) => c.indexOf(\"cacheName: '\" + n + \"'\"); for (const n of ['next-image','cross-origin-images','unsplash-images','static-assets','next-data']) { console.log(n, pos(n) < pos('pages') ? 'before pages ✓' : 'AFTER pages ✗'); }"`
  - **Pass:** all five print `before pages ✓` (image-class rules + static-assets + next-data all evaluated before the broad page rule).
  - **Fail:** any prints `AFTER pages ✗` — the shadow bug returned.

### Step 2 — Playwright PWA-runtime-behavior verification [contract]

**Verifies:** the live SW behavior matches the new runtime-caching configuration. Four behavioral contracts the PRD §6 Phase 5 AC names that Lighthouse cannot measure: SW install, image SW-serving under offline, 5 s page-rule timeout under high latency, and no indefinite stale serve. Env-agnostic per CONTRACT.md §1.1; the recipe below targets the local prod build for reproducibility. Per PRD §8.6, Playwright is the runner; pass criteria remain binary observables.

**Environment required:** local prod build on port `3001` (`pnpm --filter attendee build && pnpm --filter attendee start`). The script accepts `ATTENDEE_BASE_URL` env override to run against the Vercel preview if desired. **Tier D dev mode is invalid** because the PWA is disabled in dev.

```bash
# In one terminal: bring up the attendee local prod build.
pnpm --filter attendee build && pnpm --filter attendee start

# In another terminal at the repo root:
node docs/smoketests/playwright/phase-5-pwa-timeout-split.mjs

# Optional: run against the PR's Vercel preview URL.
# ATTENDEE_BASE_URL=https://<preview-url>.vercel.app \
# node docs/smoketests/playwright/phase-5-pwa-timeout-split.mjs
```

- [ ] Execute the Playwright script.
  - **Pass:** script exits 0 with `5 passed, 0 failed` (four steps; Step 2 emits two `✓` lines for sub-checks 2a and 2b). Console reports: SW install within timeout; 2a online warm-reload image responses all SW-served; 2b offline cached-URL fetches all served from SW cache; offline `/schedule` reload served from SW cache (200 status, fromServiceWorker=true, authed-route shell — NOT a `/login` redirect or workbox-precache fallback); online reload of `/schedule` did NOT render the poisoned stale marker.
  - **Fail (real contract failure):** script exits 1 with any `✗` line attributable to behavior (e.g., images hitting network instead of SW, offline reload returning a login-page body, online reload rendering the poisoned marker).
  - **Re-check environment, not product** (mirrors the Phase 3 smoketest's setup-error-vs-real-fail distinction at `docs/smoketests/phase-3-sponsor-preload-relocate.md` Step 2): script exits 1 with a setup error rather than a `✗` line — attendee server not reachable, seed credentials wrong, `next-auth.session-token` cookie missing on `/api/login` response, SW never registered (usually means the runner used `pnpm dev` instead of `pnpm build && pnpm start`, since the PWA is disabled in dev). These are environment problems; verify the build mode + server health + credentials before treating them as a Phase 5 regression.

**Single-retry policy** (mirrors Phase 3 Step 2's): a single Playwright failure may be re-run once before treating it as a real contract failure. Service-worker activation and cache priming can briefly race under load. If the second run also fails the same assertion, that's a real fail.

### Step 3 — Lighthouse mobile landing-page no-regression [perf-bar tier C]

**Verifies:** Phase 5's SW-config change does not regress attendee landing-page Lighthouse measurements on a local prod build. Lighthouse disables the service worker during measurement (cold-load profile), so this step does NOT measure SW-served performance — it confirms the rule-class re-tuning has no spillover regression on the cold-load measurement Phase 1 used.

**Environment required:** Tier C (local prod build on port `3001`) is the pre-push gate; Tier B (Vercel preview) is the pre-merge confirmation. Tier D (dev mode) is invalid per CONTRACT.md §1.2 — separately also invalid here because PWA is disabled in dev.

**Baseline is captured by this smoketest run, not pulled from prior runs.** Per Phase 3 + Phase 4 precedent, the runner produces both pre- and post-change measurements on the same Lighthouse invocation and records them in `docs/smoketests/runs/phase-5-<date>.md`.

**Authenticated Lighthouse is mandatory** (Codex Round 1 finding). The attendee app's middleware (`apps/attendee/middleware.ts`) redirects every unauthenticated page request to `/login`, so an anonymous Lighthouse run measures `/login` four times rather than the four target routes. The recipe below extracts the seed user's `next-auth.session-token` cookie from `/api/login` and passes it via `--extra-headers`. Every run log MUST verify `lh.finalDisplayedUrl` matches `lh.requestedUrl` per route — a mismatch means the cookie injection broke and the numbers reflect `/login`, not the intended route.

#### Tier C recipe (local prod build, `git stash` baseline)

```bash
set -euo pipefail
ROUTES=(/home /speakers /schedule /people)

run_authed_lh () {
  # $1 = KIND (BASELINE | POST)
  local KIND="$1"
  local COOKIE_VALUE
  COOKIE_VALUE=$(curl -sS -i -X POST "http://localhost:3001/api/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"steph@curry.com","password":"stephcurry"}' \
    | tr -d '\r' | awk '/^[Ss]et-[Cc]ookie:/ {sub(/^[Ss]et-[Cc]ookie: /, ""); print; exit}' \
    | awk -F';' '{print $1}')
  if [[ -z "$COOKIE_VALUE" || "$COOKIE_VALUE" != next-auth.session-token=* ]]; then
    echo "FAIL: did not extract next-auth.session-token cookie from /api/login" >&2
    return 1
  fi
  for ROUTE in "${ROUTES[@]}"; do
    local SLUG=$(echo "$ROUTE" | sed 's|/||g; s|^$|root|')
    npx --yes lighthouse@latest "http://localhost:3001${ROUTE}" \
      --output=json --output-path="/tmp/lh-attendee-${SLUG}-${KIND}.json" \
      --quiet --chrome-flags="--headless=new --no-sandbox" \
      --form-factor=mobile --only-categories=performance \
      --extra-headers="{\"Cookie\":\"${COOKIE_VALUE}\"}"
    local FINAL
    FINAL=$(node -e "console.log(require('/tmp/lh-attendee-${SLUG}-${KIND}.json').finalDisplayedUrl)")
    if [[ "$FINAL" != "http://localhost:3001${ROUTE}" ]]; then
      echo "FAIL ${KIND}/${ROUTE}: finalDisplayedUrl=${FINAL}, expected http://localhost:3001${ROUTE} — cookie failed, measurement invalid" >&2
      return 1
    fi
  done
}

# 1. Build + start the post-change attendee app (Phase 5 branch checked out).
pnpm --filter attendee build && pnpm --filter attendee start &
ATTENDEE_PID=$!
# Wait for the port to listen ("Local: http://localhost:3001").

# 2. POST Lighthouse runs.
run_authed_lh POST

# 3. Capture BASELINE: stash next.config.js (Phase 5's only code change).
kill $ATTENDEE_PID 2>/dev/null
git stash push -m "phase-5-baseline" -- apps/attendee/next.config.js
pnpm --filter attendee build && pnpm --filter attendee start &
ATTENDEE_PID=$!

run_authed_lh BASELINE

# 4. Restore the Phase 5 state.
kill $ATTENDEE_PID 2>/dev/null
git stash pop

# 5. Extract observed LCP + Speed Index per route:
for ROUTE in "${ROUTES[@]}"; do
  SLUG=$(echo "$ROUTE" | sed 's|/||g; s|^$|root|')
  for KIND in BASELINE POST; do
    node -e "const lh=require('/tmp/lh-attendee-${SLUG}-${KIND}.json');
      const lcpObs=lh.audits.metrics?.details?.items?.[0]?.observedLargestContentfulPaint;
      const lcpSim=lh.audits['largest-contentful-paint']?.numericValue;
      const si=lh.audits['speed-index']?.numericValue;
      console.log('ROUTE: ${ROUTE} | KIND: ${KIND}');
      console.log('  finalDisplayedUrl:', lh.finalDisplayedUrl);
      console.log('  observed LCP (ms):', lcpObs);
      console.log('  simulated LCP (ms):', Math.round(lcpSim));
      console.log('  Speed Index (ms):', Math.round(si));"
  done
done
```

**Cold-start variance:** the first Lighthouse run against a freshly-started Next.js server bears JIT-compilation overhead that decays after run 1. For the most-affected route (`/home`, with its hero image), a single-run delta can be > 400 ms purely due to JIT timing. The run log records a median-of-3 for `/home` to disambiguate cold-start variance from a real regression; other routes are recorded single-run since their first-run vs steady-state delta is small enough that single-run reliably falls inside the tolerance band.

- [ ] Capture **baseline** Lighthouse runs across `/home`, `/speakers`, `/schedule`, `/people`. Record observed LCP, simulated LCP, Speed Index, and `finalDisplayedUrl` (must match `requestedUrl`) in `docs/smoketests/runs/phase-5-<date>.md`.
- [ ] Capture **post-change** Lighthouse runs. Record the same metrics in the same run log.
  - **Pass:** for every route, `post.observed_lcp_ms <= baseline.observed_lcp_ms + 200` AND `post.speed_index_ms <= baseline.speed_index_ms + 200`. The 200 ms tolerance matches the Phase 3 + Phase 4 precedent for single-run Lighthouse variance on local prod builds.
  - **Pass with median caveat:** if a single-run delta exceeds 200 ms, re-measure 3× and use the median. This applies especially to `/home` where the hero image's first-paint timing is sensitive to JIT-compilation cold-start.
  - **Fail:** any route shows median `post > baseline + 200` on observed LCP or Speed Index. A regression at this magnitude indicates the SW-config change has spillover into cold-load measurement (unlikely given Lighthouse disables SW during measurement — most plausibly an unrelated regression introduced alongside this phase).

**Single-run variance disclaimer:** Lighthouse on local prod builds carries ~5–10 % run-to-run variance on observed LCP and Speed Index (more on simulated LCP due to lantern-model amplification of base64 image payloads — see PRD §6 Phase 16). Phase 5's primary AC items are the four PWA-runtime contracts in Step 2; Step 3 is the timing observation that confirms no unexpected cold-load regression. **Lighthouse with SW disabled cannot measure the conference-WiFi survival win that Phase 5 actually delivers** — that lives in the Step 2 contracts.

#### Tier B recipe (Vercel preview, pre-merge confirmation)

Tier B requires BOTH the Vercel deployment-protection bypass header AND the auth session cookie. The cookie is captured against the preview URL's `/api/login` (not localhost). Verify each route's `finalDisplayedUrl` matches its `requestedUrl`.

```bash
set -euo pipefail
ROUTES=(/home /speakers /schedule /people)

# Set PREVIEW_BASELINE (current main-branch deployment URL) and PREVIEW_POST (this PR's preview URL).
# Look up: vercel ls wbr-attendee --scope june-1220s-projects | head -10
# Bypass token: Vercel project Settings → Deployment Protection.

for KIND in BASELINE POST; do
  URL_VAR="PREVIEW_${KIND}"; URL="${!URL_VAR}"
  COOKIE_VALUE=$(curl -sS -i -X POST "${URL}/api/login" \
    -H 'Content-Type: application/json' \
    -H "x-vercel-protection-bypass: ${BYPASS_TOKEN_ATTENDEE}" \
    -d '{"email":"steph@curry.com","password":"stephcurry"}' \
    | tr -d '\r' | awk '/^[Ss]et-[Cc]ookie:/ {sub(/^[Ss]et-[Cc]ookie: /, ""); print; exit}' \
    | awk -F';' '{print $1}')
  if [[ -z "$COOKIE_VALUE" || "$COOKIE_VALUE" != *next-auth.session-token=* ]]; then
    echo "FAIL ${KIND}: did not extract session cookie from ${URL}/api/login — check bypass token + seeded credentials" >&2
    exit 1
  fi
  for ROUTE in "${ROUTES[@]}"; do
    SLUG=$(echo "$ROUTE" | sed 's|/||g; s|^$|root|')
    npx --yes lighthouse@latest "${URL}${ROUTE}" \
      --output=json --output-path="/tmp/lh-attendee-preview-${SLUG}-${KIND}.json" \
      --quiet --chrome-flags="--headless=new --no-sandbox" \
      --form-factor=mobile \
      --extra-headers="{\"x-vercel-protection-bypass\":\"$BYPASS_TOKEN_ATTENDEE\",\"Cookie\":\"${COOKIE_VALUE}\"}" \
      --only-categories=performance
    # MANDATORY verification: every Tier-B run must confirm Lighthouse
    # measured the requested route, not a /login redirect (Codex R1 + R3
    # finding). A mismatch is a recipe failure, not a warning — preview
    # URL HTTPS quirks + bypass-token + cookie-name interactions are the
    # silent-failure surface.
    FINAL=$(node -e "console.log(require('/tmp/lh-attendee-preview-${SLUG}-${KIND}.json').finalDisplayedUrl)")
    if [[ "$FINAL" != "${URL}${ROUTE}" ]]; then
      echo "FAIL ${KIND}/${ROUTE}: finalDisplayedUrl=${FINAL}, expected ${URL}${ROUTE} — cookie/bypass-token failed, measurement is invalid"
      exit 1
    fi
  done
done
```

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Code-level inspection | contract | anywhere (source files) | |
| 2. Playwright PWA-runtime contracts | contract (Playwright per §8.6) | local prod build (port 3001) / Vercel preview | |
| 3. Lighthouse no-regression | perf-bar tier C | local prod build (Tier B preview as confirmation) | |

## Pass / fail

The phase ships when:

- Steps 1 and 2 PASS on any valid environment — these are the load-bearing PWA-runtime-behavior checks Phase 5 is named after.
- Step 3 PASS on Tier C (local prod build) as the pre-push gate — no regression beyond **200 ms tolerance** on observed LCP or Speed Index per route (matching Phase 3 + Phase 4 precedent; median-of-3 escape valve on routes hit by cold-start JIT variance). Tier B (Vercel preview) confirms post-push using the same 200 ms tolerance.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/attendee/next.config.js` (Workbox `runtimeCaching` config — the direct surface of Phase 5).
- `apps/attendee/public/sw.js` (generated by the build — should never be hand-edited; presence in a diff means the build re-ran).
- `apps/attendee/app/(authenticated)/(app)/{home,schedule,people,speakers,meetings,my-schedule}/page.tsx` (cached page surfaces; cache-poison + 5 s timeout assertions target `/schedule`, but meeting + my-schedule pages share the same page-rule contract and the PRD pairs `schedule and meeting routes` for stale-data protection — keep both in scope when verifying regressions).
- `apps/attendee/components/HomeScreen.tsx`, `apps/attendee/components/speakers/SpeakersClient.tsx`, `apps/attendee/components/people/PeopleClient.tsx`, `apps/attendee/components/schedule/ScheduleView.tsx`, `apps/attendee/components/schedule/SessionCard.tsx`, `apps/attendee/components/meetings/*` (image-rendering components feeding the `next-image` / `cross-origin-images` / `unsplash-images` caches that Step 2 exercises — if a component swaps `next/image` for plain `<img>` or vice versa, the workbox rules that match will change).
- `apps/attendee/app/api/data/{home,schedule,speakers,people,meetings,my-schedule}/route.ts` (route handlers feeding React Query — if response shape changes break the page render, no image-class request fires and Step 2 has nothing to observe).
- `apps/attendee/app/api/login/route.ts` (cookie shape changes break the Playwright login helper AND the Lighthouse cookie-injection recipe).
- `apps/attendee/middleware.ts` (auth-gating logic — middleware changes affect whether unauthenticated Lighthouse hits `/login` or the target route).
- `packages/db/prisma/seed.ts` (test-account changes break the Playwright login helper; speaker/session changes affect what `/speakers` and `/schedule` render).
- `apps/attendee/package.json` (a `@ducanh2912/next-pwa` version bump can shift workbox runtime-caching semantics).
- Root `package.json` and `pnpm-lock.yaml` (a `playwright` version bump can change CDP behavior — especially relevant for Step 3's CDP-vs-SW propagation note + Step 2b's `<img>` injection semantics).

## Calibration follow-ups

Per PRD §6 Phase 5 Approach + Fallback ("If real-conference-WiFi testing not possible before sprint exit, lock 5 s based on simulated slow-4G testing and capture the calibration item in the bus-factor docs"):

- **Real-conference-WiFi calibration of the 5 s `networkTimeoutSeconds` value is deferred** until conference WiFi is reachable (will not be available before sprint exit). The 5 s value is currently locked based on the PRD §6 Phase 5 working target. Re-tune to 3 s or 7 s on real WiFi if the page-rule timeout proves too eager or too patient under live conditions.
- Migrate this calibration item into `docs/runbook.md` (§ NetworkFirst-timeout calibration) when Phase 0b creates that file. The runbook is the durable home; this smoketest captures the deferral until then.

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
