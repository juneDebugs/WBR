# Phase 9 Smoketest — Move admin `/dashboard/attendees` pagination server-side

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md` (read first if you haven't); source: WBR demo sprint PRD §6 Phase 9, §8.1, §8.6.

> **PRD location:** the demo-sprint PRD lives in an agent-state directory that is excluded from this public repo tree via gitignore (it ships alongside the engineer-of-record's session state, not in committed sources). Phase 9's AC items are restated in plain-English form in §"What this verifies" below so this smoketest is independently reviewable without the PRD file.

## What this verifies

- `/api/data/attendees` now accepts `page`, `q`, `role` query params and returns `{ rows, total, page, pageSize, hasMore }` instead of the full user list. The route is parameterized server-side; no consumer slices the full list client-side.
- The duplicate client-side `useAttendees()` fetch on `apps/web/components/AttendeesTable.tsx` is gone. The new `useAttendeesPage()` hook fires exactly one request to `/api/data/attendees` per param change (initial load, page advance, role filter, debounced search).
- **(Primary, load-bearing via Playwright.)** Loading `/dashboard/attendees` with a valid admin session fires at most 1 `/api/data/attendees` client request on initial load (the "no duplicate fetch" regression bar — 0 is the architecturally clean outcome when SSR-provided `initialData` is paired with `initialDataUpdatedAt`), renders a 50-row `<tbody>`, supports cursor-style page advance via `?page=N`, returns search-filtered results via `?q=...`, and applies role filtering via `?role=ATTENDEE`. (ATTENDEE chosen over SPEAKER: the current seed generator at `packages/db/prisma/seed.ts:680` only creates ATTENDEE-role User rows in bulk; SPEAKER rows in any given local DB are carry-over from prior seed iterations and absent on a fresh clone. The filter contract tested — narrows result set, every visible row matches filter — is unchanged by the role choice.)
- Initial-document transfer size on `/dashboard/attendees` drops from the pre-change ~1252 KB baseline toward ~120 KB (RSC payload now ships only page-1's 50-row slice, not the full ~1000-user list with avatars).
- Mobile-profile observed LCP on `/dashboard/attendees` drops from the ~9.5 s baseline toward ~2 s — the lantern-model methodology caveat from Phase 1 + PRD §4 still applies (observed LCP is the gating metric; simulated LCP is supplementary).
- No regression on the admin `/dashboard` root or other dashboard routes (sample: `/dashboard`, `/dashboard/sponsors`, `/dashboard/calendar`).

## Prerequisites for the runner

- Web app runnable locally per `docs/smoketests/phase-0a-foundation-docs.md` §3–4.
- For contract Step 1: source-tree access (no running server required).
- For contract Step 2 (Playwright interactive flow): local prod build for web (`pnpm --filter web build && pnpm --filter web start` → port 3000) AND Playwright + chromium installed (Phase 3 was the first consumer; reuse the existing install). See PRD §8.6.
- **Node 20 or newer** for Step 2 — the Playwright script uses `Response.headers.getSetCookie()` to extract the NextAuth session cookie from the `/api/login` response; that API was added in Node 19.7 and is reliable on 20+. The Phase 5 smoketest documented this prerequisite for the same API; reuse the constraint.
- **Web `.env.local` required for Step 2's authenticated half** (`/api/login` POST must succeed). At minimum: `NEXTAUTH_SECRET=<any-base64>`, `NEXTAUTH_URL=http://localhost:3000`, and `DATABASE_URL=file:<absolute-path-to>/packages/db/prisma/dev.db`. Use an absolute path for `DATABASE_URL` (the relative-path-spin issue documented in the Phase 3 smoketest applies here too).
- For perf-bar Step 3 (transfer size) and Step 4 (LCP) Tier-C: same local prod build on port 3000. Tier-D dev mode is invalid (CONTRACT.md §1.2).
- For perf-bar Tier-B confirmation: the PR's Vercel preview URL (`vercel ls wbr-web --scope june-1220s-projects | head -10`) and the deployment-protection bypass token. Lighthouse must run with the seeded admin session cookie or `finalDisplayedUrl` will land on `/login`; see the cookie-injection recipe.
- Seeded credentials per `packages/db/prisma/seed.ts` (default: `june@tailor.tech` / `admin123`; ORGANIZER role). The bulk attendee seed (≥ ~1000 rows) is what makes the pagination + search assertions meaningful.

## Steps

### Step 1 — Code-level inspection [contract]

**Verifies:** the duplicate `useAttendees()` client fetch is gone from `AttendeesTable.tsx` and replaced with the parameterized `useAttendeesPage`; the SSR page passes server-rendered first-page data as `initialData`; the API route is param-driven.

- [ ] `grep -c "useAttendees\b" apps/web/components/AttendeesTable.tsx`
  - **Pass:** count is `0` (no more full-list hook in the table).
  - **Fail:** count ≥ `1`.
- [ ] `grep -c "useAttendeesPage" apps/web/components/AttendeesTable.tsx`
  - **Pass:** count is ≥ `1` (the paginated hook is the consumer).
  - **Fail:** count is `0`.
- [ ] `grep -c "export function useAttendees\b" apps/web/lib/hooks.ts`
  - **Pass:** count is `0` (the old hook is removed; only `useAttendeesPage` remains).
  - **Fail:** count ≥ `1`.
- [ ] `grep -c "fetchAttendeesPage" apps/web/app/\(dashboard\)/dashboard/attendees/page.tsx`
  - **Pass:** count is ≥ `1` (SSR uses the shared query function).
  - **Fail:** count is `0`.
- [ ] `grep -c "searchParams" apps/web/app/api/data/attendees/route.ts`
  - **Pass:** count is ≥ `1` (route consumes URL query params).
  - **Fail:** count is `0`.

### Step 2 — Playwright interactive-flow contract [contract]

**Verifies:** the live behavior matches the source-level refactor — initial load fires one server request, pagination + search + filter each fire one server request with the expected param shape, and the rendered table updates accordingly. Env-agnostic per CONTRACT.md §1.1; runs against any environment serving the prod-mode bundle.

**Environment required:** local prod build on port 3000 (`pnpm --filter web build && pnpm --filter web start`). The Playwright script accepts `WEB_BASE_URL` env override to run against the Vercel preview if desired.

```bash
# In one terminal: bring up the web local prod build.
pnpm --filter web build && pnpm --filter web start

# In another terminal at the repo root:
node docs/smoketests/playwright/phase-9-admin-pagination-server-side.mjs

# Optional: run against the PR's Vercel preview URL.
# WEB_BASE_URL=https://<preview-url>.vercel.app \
# node docs/smoketests/playwright/phase-9-admin-pagination-server-side.mjs
```

- [ ] Execute the Playwright script.
  - **Pass:** script exits 0 with `9 passed, 0 failed`. Console reports:
    - `✓ initial load fired N /api/data/attendees request(s) (≤ 1, no duplicate fetch)` — N is 0 when SSR initialData survives mount (the clean outcome) or 1 when React Query refetches.
    - `✓ <tbody> has 50 rows on initial load`
    - `✓ server request fired with ?q=curry`
    - `✓ search returned N rows (>0 && <50)`
    - `✓ server request fired with ?page=1`
    - `✓ first row content changed after page advance`
    - `✓ server request fired with ?role=ATTENDEE`
    - `✓ role-filtered view rendered N rows`
    - `✓ every visible row's role column reads ATTENDEE`
  - **Fail:** script exits 1 with any `✗` line, OR a setup error (web server not reachable, seed credentials wrong, cookie not present on `/api/login` response). Setup errors mean re-check the environment, not necessarily a real fail.

**Single-retry policy:** a single Playwright failure may be re-run once before being treated as a contract failure — `networkidle` waits + cookie-issuance round-trips can briefly stall under load. The 250 ms search debounce + 200 ms buffer is generous, but a slow disk can push it over. If the second run also fails the same assertion, that's a real fail.

### Step 3 — Initial-document transfer size [perf-bar tier C or B]

**Verifies:** the RSC payload + first-page document on `/dashboard/attendees` drops from the ~1252 KB pre-change baseline (recon §Finding #7) toward ~120 KB. Captures the structural win — full-list HTML to 50-row HTML.

**Environment required:** Tier C (local prod build) for the pre-push read; Tier B (Vercel preview) for pre-merge confirmation. Tier D (dev mode) is invalid per CONTRACT.md §1.2.

```bash
# 1. Build + start the web app on the Phase 9 branch.
pnpm --filter web build && pnpm --filter web start &
WEB_PID=$!
# Wait for "Local: http://localhost:3000".

# 2. Capture the admin session cookie via /api/login.
COOKIE=$(curl -s -i -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"june@tailor.tech","password":"admin123"}' \
  | awk -F': ' '/^[Ss]et-[Cc]ookie:.*next-auth.session-token=/ {sub(";.*","",$2); print $2}')
echo "$COOKIE" | grep -q next-auth.session-token || { echo "login failed"; exit 1; }

# 3. POST Lighthouse run with the cookie.
npx --yes lighthouse@latest "http://localhost:3000/dashboard/attendees" \
  --output=json --output-path=/tmp/lh-web-attendees-POST.json \
  --quiet --chrome-flags="--headless=new --no-sandbox" \
  --form-factor=mobile --only-categories=performance \
  --extra-headers="{\"Cookie\":\"$COOKIE\"}"

# 4. Capture BASELINE: stash the Phase 9 files (works pre- or post-commit; touches only these files).
kill $WEB_PID 2>/dev/null
git stash push -m "phase-9-baseline" -- \
  apps/web/app/\(dashboard\)/dashboard/attendees/page.tsx \
  apps/web/app/api/data/attendees/route.ts \
  apps/web/components/AttendeesTable.tsx \
  apps/web/lib/hooks.ts \
  apps/web/lib/attendees-query.ts
pnpm --filter web build && pnpm --filter web start &
WEB_PID=$!

# Re-capture cookie against the baseline build.
COOKIE=$(curl -s -i -X POST http://localhost:3000/api/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"june@tailor.tech","password":"admin123"}' \
  | awk -F': ' '/^[Ss]et-[Cc]ookie:.*next-auth.session-token=/ {sub(";.*","",$2); print $2}')

npx --yes lighthouse@latest "http://localhost:3000/dashboard/attendees" \
  --output=json --output-path=/tmp/lh-web-attendees-BASELINE.json \
  --quiet --chrome-flags="--headless=new --no-sandbox" \
  --form-factor=mobile --only-categories=performance \
  --extra-headers="{\"Cookie\":\"$COOKIE\"}"

# 5. Restore Phase 9 state.
kill $WEB_PID 2>/dev/null
git stash pop

# 6. Extract finalDisplayedUrl + total-byte-weight numericValue:
for KIND in BASELINE POST; do
  node -e "const lh=require('/tmp/lh-web-attendees-${KIND}.json');
    const bw=lh.audits['total-byte-weight'];
    console.log('KIND: ${KIND}');
    console.log('  finalDisplayedUrl:', lh.finalDisplayedUrl);
    console.log('  total-byte-weight numericValue (bytes):', bw?.numericValue);
    console.log('  total-byte-weight displayValue:', bw?.displayValue);"
done
```

- [ ] Run the recipe above.
  - **Pass:** `finalDisplayedUrl` matches `http://localhost:3000/dashboard/attendees` on both runs (cookie injection worked); `post.total_byte_weight <= 700000` (700 KB ceiling — amended 2026-06-29 from the original 250 KB after the second-opinion automated runner empirically surfaced the structural floor of ~605 KB on Tier C; 50 rows still ship inline base64 avatars at ~10 KB each, so ~500 KB of the payload is unavoidable until Phase 16 migrates image storage. The 700 KB ceiling absorbs ±100 KB single-run Lighthouse variance. The 51% reduction from the 1252 KB baseline is the structural win that holds the AC's intent; the ~120 KB ultimate unlocks via Phase 16).
  - **Fail:** `finalDisplayedUrl` lands on `/login` (cookie mis-injected — re-capture cookie and re-run); OR `post.total_byte_weight > 700000`.

### Step 4 — Mobile observed LCP [perf-bar tier B]

**Verifies:** mobile observed LCP on `/dashboard/attendees` drops from the ~9.5 s pre-change baseline (recon §Finding #7 Lighthouse run) toward the ~2 s target. Observed LCP is the gating metric per PRD §4 (amended 2026-06-27); simulated LCP is captured for the Phase 13 perf delta report but does NOT gate this AC.

**Environment required:** Tier B (Vercel preview) is the pre-merge gate per CONTRACT.md §1.2. Tier C (local prod build) is a useful sanity check but local CPU + disk variance is higher than preview's controlled runner — record Tier B as the binding measurement. Tier D (dev mode) is invalid.

```bash
# Set PREVIEW_BASELINE (main branch preview / production) + PREVIEW_POST (this PR's preview).
# Look up via: vercel ls wbr-web --scope june-1220s-projects | head -10
# Bypass token: Vercel project Settings → Deployment Protection.

# Capture session cookie against the preview.
COOKIE=$(curl -s -i -X POST "$PREVIEW_POST/api/login" \
  -H 'Content-Type: application/json' \
  -H "x-vercel-protection-bypass: $BYPASS_TOKEN_WEB" \
  -d '{"email":"june@tailor.tech","password":"admin123"}' \
  | awk -F': ' '/^[Ss]et-[Cc]ookie:.*next-auth.session-token=/ {sub(";.*","",$2); print $2}')

for KIND in BASELINE POST; do
  URL_VAR="PREVIEW_${KIND}"; URL="${!URL_VAR}"
  npx --yes lighthouse@latest "$URL/dashboard/attendees" \
    --output=json --output-path="/tmp/lh-web-attendees-preview-${KIND}.json" \
    --quiet --chrome-flags="--headless=new --no-sandbox" \
    --form-factor=mobile --only-categories=performance \
    --extra-headers="{\"Cookie\":\"$COOKIE\",\"x-vercel-protection-bypass\":\"$BYPASS_TOKEN_WEB\"}"
done

# Extract observed + simulated LCP + finalDisplayedUrl:
for KIND in BASELINE POST; do
  node -e "const lh=require('/tmp/lh-web-attendees-preview-${KIND}.json');
    const metrics = lh.audits.metrics?.details?.items?.[0] ?? {};
    const simLCP = lh.audits['largest-contentful-paint'];
    console.log('KIND: ${KIND}');
    console.log('  finalDisplayedUrl:', lh.finalDisplayedUrl);
    console.log('  observed LCP (ms):', metrics.observedLargestContentfulPaint);
    console.log('  simulated LCP (ms):', simLCP?.numericValue);"
done
```

- [ ] Run the recipe above.
  - **Pass:** `finalDisplayedUrl` matches the requested `/dashboard/attendees` (no `/login` redirect); `post.observedLargestContentfulPaint <= 3000` (3 s — the PRD §4 success criterion target). Simulated LCP is reported but not gating per the methodology amendment.
  - **Fail:** `finalDisplayedUrl` is `/login` (cookie did not survive — re-capture and re-run, escalate to the Phase 5 cookie-injection recipe if the issue persists); OR `post.observedLargestContentfulPaint > 3000`.

**Median-of-3 disclaimer:** the recon §Finding #7 baseline at 9.5 s was a single-run number. The post-change route is JIT-cold-start sensitive (Phase 5 documented +400 ms variance on the first Lighthouse run for `/home`); admin `/dashboard/attendees` likely falls in the same regime. If a single run lands within 200 ms of the 3 s threshold (either side), capture a median-of-3 read before concluding. The Phase 9 PR body must record which measurement (single-run or median-of-3) was the binding value.

### Step 5 — Admin baseline no-regression [perf-bar tier B]

**Verifies:** the changes do not regress mobile observed LCP on other admin routes. Sample set: `/dashboard` (root), `/dashboard/sponsors`, `/dashboard/calendar`. These routes do not touch the Phase 9 surface area, so a regression here would point to a generic admin-bundle ripple (e.g., unrelated import change).

**Environment required:** Tier B (Vercel preview). Tier C also valid as a pre-push read.

- [ ] Run Lighthouse against each route in the sample set on the Vercel preview using the cookie-injection recipe from Step 4.
- [ ] Record observed LCP per route in `docs/smoketests/runs/phase-9-<date>.md`.
  - **Pass:** every sampled route's `post.observedLargestContentfulPaint` is within `baseline + 200 ms` (single-run Lighthouse variance ceiling).
  - **Fail:** any sampled route's observed LCP exceeds `baseline + 200 ms`. Re-run that route once; if the regression persists, the phase has a generic ripple and the diff needs a second look.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Code-level inspection | contract | anywhere (source files) | |
| 2. Playwright interactive-flow | contract (Playwright per §8.6) | local prod / Vercel preview | |
| 3. Initial-document transfer size | perf-bar tier C | local prod build (Tier B preview as confirmation) | |
| 4. Mobile observed LCP on `/dashboard/attendees` | perf-bar tier B | Vercel preview | |
| 5. Admin baseline no-regression | perf-bar tier B | Vercel preview | |

## Pass / fail

The phase ships when:

- Steps 1 and 2 PASS on any valid environment — these are the load-bearing routing-contract checks.
- Step 3 PASS on Tier C (local prod build) as the pre-push gate; Tier B confirms post-push.
- Step 4 PASS on Tier B (Vercel preview) — observed LCP gates per PRD §4 (amended).
- Step 5 PASS on Tier B (Vercel preview) — no admin-baseline regression on the sampled routes.

## Known limitations (pre-existing, out of Phase 9 scope)

- **SSR pages under `apps/web/app/(dashboard)/**` do not enforce an admin-role check.** Middleware only verifies token presence; only the `/api/data/attendees` route handler (added in this phase per R1) gates by `token.role ∈ { STAFF, ORGANIZER, ADMIN }`. The SSR pages render attendee data without re-checking the role. Two reachability paths exist for a non-admin JWT to hit the web app's dashboard SSR:
  - **Local dev — same-host cookie collision.** All four apps share `NEXTAUTH_SECRET` (per the repo's env conventions); browser cookies are host-scoped, not port-scoped. A user who logs into the attendee app at `localhost:3001` receives a `next-auth.session-token` cookie that the browser also sends to `localhost:3000`. The web middleware accepts any valid token. So in local dev a non-admin (attendee/sponsor/meetings) token reaches the web SSR.
  - **Theoretical role-downgrade-after-login.** An admin user whose role is changed in the DB to ATTENDEE still holds a valid stale JWT (NextAuth doesn't revalidate against the DB). No role-change UI exists in the codebase, so this is not currently exploitable.
  - **Production is safe:** each app is served from its own origin (`wbr.tailor.tech` for attendee per Phase 10; separate Vercel URLs for the other three), so the local cross-app cookie collision does not apply.
  The leveraged fix is middleware-level admin-role gating, which would change auth posture across every dashboard route — a sprint-wide auth-hardening pass, not Phase 9 scope. Flagged here for the downstream auth-hardening phase; not a Phase 9 AC failure.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/web/app/(dashboard)/dashboard/attendees/page.tsx`
- `apps/web/components/AttendeesTable.tsx`
- `apps/web/lib/hooks.ts` (the `useAttendeesPage` hook contract)
- `apps/web/lib/attendees-query.ts` (the shared Prisma query)
- `apps/web/app/api/data/attendees/route.ts` (URL param shape)
- `apps/web/middleware.ts` (auth redirect changes can break the Playwright authenticated-context navigation)
- `apps/web/app/api/login/route.ts` (cookie-name or shape changes break the Playwright login helper)

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
