# Phase 3 Smoketest — Move sponsor `/api/attendees` preload off root layout

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md` (read first if you haven't); source: WBR demo sprint PRD §6 Phase 3, §8.1, §8.6.

## What this verifies

- The `<link rel="preload" href="/api/attendees" ...>` element has been removed from `apps/sponsor/app/layout.tsx` (root layout) and added inside `apps/sponsor/app/(authenticated)/(portal)/layout.tsx` (authenticated portal layout). The preload itself remains correct; only its placement changes.
- **(Primary, load-bearing.)** Loading the sponsor `/login` page in a fresh browser context fires zero network requests to `/api/attendees`.
- **(Primary, load-bearing.)** Loading an authenticated sponsor route (`/dashboard`) with a valid session cookie still fires at least one `/api/attendees` request (preload contract preserved on the authenticated surface).
- Mobile-profile Speed Index for sponsor `/login` directionally improves vs the pre-Phase-3 baseline on the same build. **Magnitude is sub-noise on the current post-Phase-4 baseline** (in-session measurement: BASELINE 768 ms → POST 763 ms; ~5 ms delta against the ~5–10% Lighthouse single-run variance). The 3.67 s → 0.85 s figure from `recon/perf_investigation_2026_06_18.md` §Finding #5 over-attributed the slowdown to the preload; Phase 4's imagery strip already brought sponsor `/login` Speed Index to admin-login parity. Phase 3's contribution to the timing AC is contract correctness + regression guard, not measurable timing delta on the current baseline.

## Prerequisites for the runner

- Sponsor app runnable locally per `docs/smoketests/phase-0a-foundation-docs.md` §3–4.
- For contract Step 1: source-tree access (no running server required).
- For contract Step 2 (Playwright routing): local prod build for sponsor (`pnpm --filter sponsor build && pnpm --filter sponsor start` → port 3003) AND Playwright + chromium installed. Playwright is a root devDependency (`pnpm add -D -w playwright` already run); chromium browser binary installed via `npx playwright install chromium`. See PRD §8.6.
- **Sponsor `.env.local` required for Step 2's authenticated half** (`/api/login` POST must succeed). At minimum: `NEXTAUTH_SECRET=<any-base64>`, `NEXTAUTH_URL=http://localhost:3003`, and `DATABASE_URL=file:<absolute-path-to>/packages/db/prisma/dev.db`. **Use an absolute path** for `DATABASE_URL` — a relative path like `file:../../packages/db/prisma/dev.db` has been observed to cause `next-server` to spin at 100% CPU on the first DB query against the seeded SQLite file. The `.env.local` is gitignored.
- For perf-bar Step 3 Tier-C: same local prod build on port 3003. Tier-D dev mode is invalid (CONTRACT.md §1.2).
- For perf-bar Step 3 Tier-B: the PR's Vercel preview URL (`vercel ls wbr-sponsor --scope june-1220s-projects | head -10`) and the bypass token (Vercel project → Settings → Deployment Protection).
- Seeded credentials per `packages/db/prisma/seed.ts` (default: `june@tailor.tech` / `admin123`); seed runs as part of the bootstrap flow.

## Steps

### Step 1 — Code-level inspection [contract]

**Verifies:** the preload `<link>` is gone from `apps/sponsor/app/layout.tsx` and present in `apps/sponsor/app/(authenticated)/(portal)/layout.tsx`. Env-agnostic — the source compiles to the same output everywhere.

- [ ] `grep -c 'rel="preload" href="/api/attendees"' apps/sponsor/app/layout.tsx`
  - **Pass:** count is `0` (preload removed from root layout).
  - **Fail:** count ≥ `1` (preload still in root layout — fix not landed).
- [ ] `grep -c 'rel="preload" href="/api/attendees"' apps/sponsor/app/\(authenticated\)/\(portal\)/layout.tsx`
  - **Pass:** count is `1` (preload present in authenticated portal layout).
  - **Fail:** count is `0` (preload deleted entirely — authenticated routes would lose the preload) or > `1` (duplicate preload).

### Step 2 — Playwright routing-contract verification [contract]

**Verifies:** the live network behavior matches the source-level placement — `/login` fires zero `/api/attendees` requests, `/dashboard` (post-auth) still fires at least one. Env-agnostic per CONTRACT.md §1.1; runs against any environment serving the prod-mode bundle, but the recipe below targets the local prod build for reproducibility. Per PRD §8.6, Playwright is the runner; the pass criterion remains a binary observable.

**Environment required:** local prod build on port 3003 (`pnpm --filter sponsor build && pnpm --filter sponsor start`). The Playwright script accepts `SPONSOR_BASE_URL` env override to run against the Vercel preview if desired.

```bash
# In one terminal: bring up the sponsor local prod build.
pnpm --filter sponsor build && pnpm --filter sponsor start

# In another terminal at the repo root:
node docs/smoketests/playwright/phase-3-sponsor-preload-relocate.mjs

# Optional: run against the PR's Vercel preview URL.
# SPONSOR_BASE_URL=https://<preview-url>.vercel.app \
# node docs/smoketests/playwright/phase-3-sponsor-preload-relocate.mjs
```

- [ ] Execute the Playwright script.
  - **Pass:** script exits 0 with `2 passed, 0 failed`. Console reports `✓ /login emitted 0 /api/attendees requests` and `✓ /dashboard emitted N /api/attendees request(s)` where N ≥ 1.
  - **Fail:** script exits 1 with any `✗` line, OR a setup error (sponsor server not reachable, seed credentials wrong, `next-auth.session-token` cookie not present on `/api/login` response). Setup errors mean re-check the environment, not necessarily a real fail.

**Single-retry policy (analogous to Step 3's median-of-3 disclaimer):** a single Playwright failure may be re-run once before being treated as a contract failure — `networkidle` waits + cookie-issuance round-trips can briefly stall under load. If the second run also fails the same assertion, that's a real fail. The script is otherwise deterministic given a healthy sponsor server + correct `.env.local`.

### Step 3 — Lighthouse mobile Speed Index [perf-bar tier C or B]

**Verifies:** sponsor `/login` mobile Speed Index drops from the 3.67 s baseline (recon §Finding #5) toward admin-login parity (~0.85 s). The Lighthouse audit ID is `speed-index` (numericValue = SI in milliseconds).

**Environment required:** Tier C (local prod build) is the pre-push gate; Tier B (Vercel preview) is the pre-merge confirmation. Tier D (dev mode) is invalid per CONTRACT.md §1.2.

**Baseline is captured by this smoketest run, not pulled from prior runs.** The 3.67 s figure from the 2026-06-18 recon is indicative, not normative. The runner produces both pre and post measurements on the same Lighthouse invocation and records them in `docs/smoketests/runs/phase-3-<date>.md`.

#### Tier C recipe (local prod build, `git stash` baseline)

The `git stash` pattern below works in both pre-commit and post-commit states (matches the Phase 4 precedent + the in-session run log for this phase). For post-commit re-runs only, the alternative `git restore --source=HEAD~1 -- <files>` is also valid (it doesn't touch HEAD), but `git stash` is the canonical recipe for this smoketest.

```bash
# 1. Build + start the post-change sponsor app (Phase 3 branch checked out).
pnpm --filter sponsor build && pnpm --filter sponsor start &
SPONSOR_PID=$!
# Wait for the port to listen (Next prints "Local: http://localhost:3003").

# 2. POST Lighthouse run.
npx --yes lighthouse@latest "http://localhost:3003/login" \
  --output=json --output-path=/tmp/lh-sponsor-POST.json \
  --quiet --chrome-flags="--headless=new --no-sandbox" \
  --form-factor=mobile --only-categories=performance

# 3. Capture BASELINE: stash the two layout files (works pre- or post-commit;
#    only touches these two files, not the rest of the working tree).
kill $SPONSOR_PID 2>/dev/null
git stash push -m "phase-3-baseline" -- apps/sponsor/app/layout.tsx apps/sponsor/app/\(authenticated\)/\(portal\)/layout.tsx
pnpm --filter sponsor build && pnpm --filter sponsor start &
SPONSOR_PID=$!

npx --yes lighthouse@latest "http://localhost:3003/login" \
  --output=json --output-path=/tmp/lh-sponsor-BASELINE.json \
  --quiet --chrome-flags="--headless=new --no-sandbox" \
  --form-factor=mobile --only-categories=performance

# 4. Restore the Phase 3 state.
kill $SPONSOR_PID 2>/dev/null
git stash pop

# 5. Extract Speed Index numericValue:
for KIND in BASELINE POST; do
  node -e "const lh=require('/tmp/lh-sponsor-${KIND}.json'); const si=lh.audits['speed-index'];
    console.log('KIND: ${KIND}');
    console.log('  speed-index numericValue (ms):', si?.numericValue);
    console.log('  speed-index displayValue:', si?.displayValue);"
done
```

#### Tier B recipe (Vercel preview, pre-merge confirmation)

```bash
# Set PREVIEW_BASELINE (current main-branch deployment URL) + PREVIEW_POST (this PR's preview URL).
# Look up via: vercel ls wbr-sponsor --scope june-1220s-projects | head -10
# Bypass token: Vercel project Settings → Deployment Protection.

for KIND in BASELINE POST; do
  URL_VAR="PREVIEW_${KIND}"; URL="${!URL_VAR}"
  npx --yes lighthouse@latest "$URL/login" \
    --output=json --output-path="/tmp/lh-sponsor-preview-${KIND}.json" \
    --quiet --chrome-flags="--headless=new --no-sandbox" \
    --form-factor=mobile \
    --extra-headers="{\"x-vercel-protection-bypass\":\"$BYPASS_TOKEN_SPONSOR\"}" \
    --only-categories=performance
done
```

- [ ] Capture **baseline** Lighthouse run against sponsor `/login`. Record `speed-index` numericValue (ms) in `docs/smoketests/runs/phase-3-<date>.md`.
- [ ] Capture **post-change** Lighthouse run. Record numericValue in the same run log.
  - **Pass:** `post.speed_index_ms <= baseline.speed_index_ms + tolerance` where `tolerance = 200 ms` to absorb single-run Lighthouse variance on a baseline already at admin-login parity. The post-Phase-4 baseline is sub-1s, so any delta inside ±200 ms is consistent with the AC. Sub-noise improvement IS the expected outcome here — see "What this verifies" above for the finding that pre-empted the original 3.67 s → 0.85 s framing.
  - **Fail:** `post.speed_index_ms > baseline.speed_index_ms + 200` (regression beyond single-run variance). A regression at this magnitude warrants a re-run + median-of-3 read, and only after confirming the regression on the median should the phase block.

**Single-run variance disclaimer:** Lighthouse Speed Index on local prod builds carries ~5–10% variance run-to-run (higher than `total-byte-weight`'s sub-byte variance — Speed Index depends on layout + paint timing, not just transfer size). The current post-Phase-4 baseline is already at admin-login parity (~0.8 s), so the meaningful pass criterion is "no regression beyond noise," not "drop by X ms." The routing-contract steps (1 + 2) carry the load-bearing AC; Step 3 is the timing observation that confirms no unexpected regression.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Code-level inspection | contract | anywhere (source files) | |
| 2. Playwright routing-contract | contract (Playwright per §8.6) | local prod / Vercel preview | |
| 3. Lighthouse Speed Index | perf-bar tier C | local prod build (Tier B preview as confirmation) | |

## Pass / fail

The phase ships when:

- Steps 1 and 2 PASS on any valid environment — these are the load-bearing routing-contract checks.
- Step 3 PASS on Tier C (local prod build) as the pre-push gate (no regression beyond noise); Tier B (Vercel preview) confirms post-push. Sub-noise direction is the expected outcome on the current post-Phase-4 baseline.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/sponsor/app/layout.tsx`
- `apps/sponsor/app/(authenticated)/(portal)/layout.tsx`
- `apps/sponsor/middleware.ts` (auth redirect changes can break the Playwright authenticated-context navigation).
- `apps/sponsor/app/api/login/route.ts` (cookie-name or shape changes break the Playwright login helper).
- `apps/sponsor/app/api/attendees/route.ts` (URL changes invalidate the contract assertion).

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
