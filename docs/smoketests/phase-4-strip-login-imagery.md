# Phase 4 Smoketest — Strip login background imagery on meetings + sponsor

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md` (read first if you haven't); source: WBR demo sprint PRD §6 Phase 4, §8.1.

## What this verifies

- The `<img>` rendering block in `apps/meetings/app/login/page.tsx` and `apps/sponsor/app/login/page.tsx` is commented out at source. The block is preserved (not deleted) for quick re-enablement.
- The `slides` array (URLs + headline + subtitle text) remains intact in both files; text rotation + carousel dots continue to cycle on the lg+ left panel.
- The served HTML for `/login` on meetings (port 3002) and sponsor (port 3003) contains no `https://images.unsplash.com/` substring. No Unsplash request fires during page load.
- Mobile total transfer on meetings `/login` drops from the 549 KB baseline to ≤ 250 KB (PRD §6 Phase 4 acceptance criterion #1).
- Mobile total transfer on sponsor `/login` drops from the 1289 KB baseline toward ≤ 250 KB (PRD §6 Phase 4 acceptance criterion #2; Phase 3's preload relocation contributes additively when it ships).
- No layout regression on the login form itself in Chrome and Safari mobile viewports (PRD §6 Phase 4 acceptance criterion #3).

## Prerequisites for the runner

- All four apps runnable locally per `docs/smoketests/phase-0a-foundation-docs.md` §3–4.
- For contract steps using local dev: `pnpm --filter meetings dev` (port 3002) + `pnpm --filter sponsor dev` (port 3003) running.
- For Step 4 Tier-C local prod build: `pnpm --filter meetings build && pnpm --filter meetings start` (port 3002) + the same for sponsor (port 3003). Tier-D dev mode is invalid for the perf-bar step.
- For Step 4 Tier-B Vercel preview: the PR's preview URL (`vercel ls wbr-meetings --scope june-1220s-projects | head -3` and `vercel ls wbr-sponsor --scope june-1220s-projects | head -3`) and the bypass tokens for each project (Settings → Deployment Protection).
- Chrome + Safari for Step 3.

## Steps

### Step 1 — Code-level inspection [contract]

**Verifies:** the `<img>` rendering block is commented out at source on both apps, the `slides` array (URLs + text) is preserved, and no active `<img>` tag references an Unsplash URL. Env-agnostic — the same source compiles to the same output everywhere.

- [ ] `grep -c "images.unsplash.com" apps/meetings/app/login/page.tsx apps/sponsor/app/login/page.tsx`
  - **Pass:** each file shows a count of `3` (the three URLs in the preserved `slides` array).
  - **Fail:** either file shows `0` (URLs deleted — violates re-enablement contract) or any value not equal to `3`.
- [ ] `awk '/^[[:space:]]*\{\/\*$/,/^[[:space:]]*\*\/\}$/' apps/meetings/app/login/page.tsx | grep -c "<img"` and the same for `apps/sponsor/app/login/page.tsx`. (The `awk` range extracts content between any indented `{/*` and `*/}` lines; the `<img` count inside is the commented-out image tag.)
  - **Pass:** each file shows a count ≥ `1` (the `<img` tag is inside a JSX comment block).
  - **Fail:** either file shows `0` (block deleted entirely — violates re-enablement contract; OR block uncommented — would re-introduce the Unsplash fetches).
- [ ] `grep -c "<img" apps/meetings/app/login/page.tsx apps/sponsor/app/login/page.tsx`
  - **Pass:** each file shows a count of `1` (one `<img` tag preserved in source, inside the JSX comment block per the previous check). Step 2 below is the deterministic verification that the tag is not actively rendering (curl the served HTML, confirm no Unsplash URL leaks through).
  - **Fail:** count ≠ `1` — either `0` (tag deleted) or `> 1` (extra `<img` introduced).

### Step 2 — Rendered HTML inspection [contract]

**Verifies:** the served HTML for `/login` on both apps contains no Unsplash URL substring, and the carousel headline text from the `slides` array is still present (confirms text rotation block survived the strip). Env-agnostic — Next.js renders the same JSX to HTML in dev and prod.

Run the two apps in dev (`pnpm --filter meetings dev` on port 3002, `pnpm --filter sponsor dev` on port 3003) or against a local prod build (`pnpm --filter <app> build && pnpm --filter <app> start`). Then:

```bash
# Meetings /login
curl -s http://localhost:3002/login | grep -c "images.unsplash.com"
curl -s http://localhost:3002/login | grep -c "Connect, Meet"

# Sponsor /login
curl -s http://localhost:3003/login | grep -c "images.unsplash.com"
curl -s http://localhost:3003/login | grep -c "Maximize Your"
```

- [ ] Meetings rendered HTML inspection
  - **Pass:** first command returns `0` (no Unsplash URL in served HTML). Second command returns ≥ `1` (carousel headline text "Connect, Meet" present, confirming the `slides` array still drives the text-rotation block).
  - **Fail:** first command returns ≥ `1` (Unsplash URL leaked into served HTML — `<img>` not actually commented out) OR second command returns `0` (text rotation block was inadvertently stripped along with the imagery).
- [ ] Sponsor rendered HTML inspection
  - **Pass:** first command returns `0`. Second command returns ≥ `1` (headline text "Maximize Your" present).
  - **Fail:** first command returns ≥ `1` OR second command returns `0`.

### Step 3 — Visual layout check [contract]

**Verifies:** the login form renders correctly in Chrome and Safari mobile viewports, with no layout regression introduced by the imagery removal. This is a contract check because the layout decision is driven by the served HTML + CSS; the same DOM produces the same layout regardless of where the page is served from. Either local dev, Tier-C local prod build, or Tier-B Vercel preview is valid; pick the most convenient.

- [ ] **Chrome DevTools mobile viewport.** Open Chrome DevTools, toggle device mode, pick a mobile profile (e.g., iPhone 14 Pro / 390×844). Navigate to `http://localhost:3002/login` and `http://localhost:3003/login`.
  - **Pass:** login form renders (email + password inputs + sign-in button + Google sign-in button + demo accounts block all visible). `document.documentElement.scrollWidth <= window.innerWidth` evaluates true in DevTools console. No element overflows the right edge of the viewport.
  - **Fail:** any of the form elements missing or visibly broken; OR `document.documentElement.scrollWidth > window.innerWidth`; OR horizontal scroll bar present at bottom of viewport.
- [ ] **Safari Responsive Design Mode iPhone profile.** Safari → Develop → Enter Responsive Design Mode → pick an iPhone profile (e.g., iPhone 14 Pro). Navigate to both `/login` URLs.
  - **Pass:** same observables as the Chrome step — login form renders, no horizontal overflow.
  - **Fail:** same as Chrome step.
- [ ] **Desktop layout (lg+ viewport).** Open both `/login` URLs in a desktop browser at full width (≥ 1024px width — the `lg` Tailwind breakpoint).
  - **Pass:** the left half of the screen renders the gradient backdrop (visible as the `bg-gradient-to-b from-primary/60 via-primary/30 to-[#1a1a2e]` overlay sitting on the panel's dark `bg-[#1a1a2e]` parent). The carousel headline text + subtitle text are present in the bottom-left of the left panel. The carousel dots are visible and cycle through 3 dots over 5-second intervals. No `<img>` tag is in the rendered DOM (verifiable in DevTools Elements panel — search for `img` inside the `.hidden.lg\:flex` ancestor; no matches expected).
  - **Fail:** the left panel renders fully transparent / shows the parent dark background only (means both gradient overlays were inadvertently removed); OR carousel headline / dots missing; OR the carousel does not cycle.

### Step 4 — Lighthouse mobile total transfer [perf-bar tier B]

**Verifies:** the mobile-profile total transfer for `/login` on both apps drops below the PRD §6 Phase 4 thresholds. The Lighthouse audit ID is `total-byte-weight` (numeric value = total transfer bytes for the document + all subresources).

**Environment required:** Tier B — Vercel preview deployment for the Phase 4 PR. Tier C (local prod build with `git stash`-baseline) acceptable as the pre-push proxy and is the shape the in-session second-opinion automation uses. Tier D dev mode is invalid.

**Baseline is captured by this smoketest run, not pulled from prior runs.** Phase 2 baseline numbers (549 KB meetings, 1289 KB sponsor) come from the 2026-06-18 perf recon (`recon/perf_phase2_baseline_2026_06_18.md`); they're indicative, not normative. The runner produces both pre and post measurements as part of Step 4 execution and records them in `docs/smoketests/runs/phase-4-<date>.md`.

#### Tier B recipe (Vercel preview, pre-merge gate)

```bash
# Set PREVIEW_BASELINE_<APP> + PREVIEW_POST_<APP> + BYPASS_TOKEN_<APP>:
#   PREVIEW_BASELINE = current main-branch deployment (pre-Phase-4) for the project.
#   PREVIEW_POST = the Phase 4 PR's Vercel preview URL.
# Look up via:
#   vercel ls wbr-meetings --scope june-1220s-projects | head -10
#   vercel ls wbr-sponsor  --scope june-1220s-projects | head -10
# Bypass tokens: each Vercel project's Settings → Deployment Protection.

for APP in meetings sponsor; do
  for KIND in BASELINE POST; do
    URL_VAR="PREVIEW_${KIND}_${APP^^}"
    TOKEN_VAR="BYPASS_TOKEN_${APP^^}"
    URL="${!URL_VAR}"
    TOKEN="${!TOKEN_VAR}"
    SLUG=$(echo "${URL}_${KIND}" | sed -E 's|https?://||; s|[^a-zA-Z0-9]|_|g')
    npx --yes lighthouse@latest "$URL/login" \
      --output=json \
      --output-path="/tmp/lh-${APP}-${SLUG}.json" \
      --quiet --chrome-flags="--headless=new --no-sandbox" \
      --form-factor=mobile \
      --extra-headers="{\"x-vercel-protection-bypass\":\"$TOKEN\"}" \
      --only-categories=performance
  done
done

# Extract total-byte-weight per run:
for APP in meetings sponsor; do
  for KIND in BASELINE POST; do
    URL_VAR="PREVIEW_${KIND}_${APP^^}"
    URL="${!URL_VAR}"
    SLUG=$(echo "${URL}_${KIND}" | sed -E 's|https?://||; s|[^a-zA-Z0-9]|_|g')
    node -e "const lh=require('/tmp/lh-${APP}-${SLUG}.json'); const a=lh.audits;
      console.log('APP: ${APP} KIND: ${KIND}');
      console.log('  URL: ${URL}/login');
      const tbw = a['total-byte-weight'];
      console.log('  total-byte-weight numericValue (bytes):', tbw?.numericValue);
      console.log('  total-byte-weight numericValue (KB):', Math.round((tbw?.numericValue ?? 0) / 1024));"
  done
done
```

#### Tier C recipe (local prod build with `git stash` baseline, pre-push proxy)

```bash
# Capture POST (Phase 4 branch checked out, local prod build running on ports 3002 + 3003):
#   pnpm --filter meetings build && pnpm --filter meetings start &  # port 3002
#   pnpm --filter sponsor  build && pnpm --filter sponsor  start &  # port 3003
for APP in meetings:3002 sponsor:3003; do
  NAME="${APP%%:*}"; PORT="${APP##*:}"
  npx --yes lighthouse@latest "http://localhost:${PORT}/login" \
    --output=json \
    --output-path="/tmp/lh-${NAME}-POST.json" \
    --quiet --chrome-flags="--headless=new --no-sandbox" \
    --form-factor=mobile \
    --only-categories=performance
done

# Stash the Phase 4 changes to capture the BASELINE state on the same branch:
#   git restore --staged apps/meetings/app/login/page.tsx apps/sponsor/app/login/page.tsx
#   git stash push -- apps/meetings/app/login/page.tsx apps/sponsor/app/login/page.tsx
# Rebuild and re-measure as BASELINE; then `git stash pop` to restore the Phase 4 changes.
```

- [ ] Capture the **baseline** Lighthouse run against meetings `/login` and sponsor `/login` (PREVIEW_BASELINE or git-stash baseline). Record `total-byte-weight` numericValue (in bytes and KB) in `docs/smoketests/runs/phase-4-<date>.md`.
- [ ] Capture the **post-change** Lighthouse run against meetings `/login` and sponsor `/login` (PREVIEW_POST or post-stash). Record `total-byte-weight` numericValue in the same run log.
  - **Pass (meetings):** `post.total_byte_weight_bytes ≤ 250 * 1024` (256000 bytes). This is the strict PRD §6 Phase 4 AC #1 threshold.
  - **Fail (meetings):** `post.total_byte_weight_bytes > 256000`.
  - **Pass (sponsor):** `post.total_byte_weight_bytes < baseline.total_byte_weight_bytes` by at least the three-image budget the Unsplash hot-link contributes. Documented headline budget per PRD §6 Phase 4: ≈ 428 KB (three photos × ~94–169 KB each, per `recon/perf_phase2_baseline_2026_06_18.md` §N1). Pass threshold is set at `≥ 350 * 1024` bytes — a conservative floor below the 428 KB headline that absorbs Lighthouse single-run jitter on `total-byte-weight` (~10–20 KB typical) plus per-image-CDN-response variance (Unsplash serves with variable headers + occasional bandwidth-savings transforms; the 78 KB margin between 350 KB and 428 KB covers both). Step 2's "no Unsplash URL/request" check is the hard imagery-removal proof; Step 4 is the numeric perf-bar confirmation.
  - **Fail (sponsor):** `baseline.total_byte_weight_bytes - post.total_byte_weight_bytes < 350 * 1024`.

**Single-run variance disclaimer:** Lighthouse `total-byte-weight` for static `/login` pages is stable across runs (no dynamic data prefetches involved here — the resource graph is deterministic per build). If a single run shows a value that contradicts the expected direction by more than 50 KB, re-run twice more and take the median before declaring a fail.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Code-level inspection | contract | anywhere (source files) | |
| 2. Rendered HTML inspection | contract | local dev / local prod / Vercel preview | |
| 3. Visual layout check | contract | local dev / Tier-C / Tier-B | |
| 4. Lighthouse mobile total transfer | perf-bar tier B | Vercel preview (Tier C acceptable as pre-push proxy) | |

## Pass / fail

The phase ships when:

- Steps 1, 2, 3 PASS on any valid environment.
- Step 4 PASS on Tier B (Vercel preview) before merge, OR Tier C (local prod build) as the pre-push gate with Tier B confirming post-push.
- (Optional pre-demo sanity, not gating per `feedback_doc_verification_posture` — RDM + DevTools mobile profile are the documented automated-feasible proxies.) Open both Vercel preview `/login` pages on a real iOS device (Safari mobile) and a real Android Chrome device; confirm the gradient backdrop renders cleanly, the carousel text cycles, the login form is interactive. Log any deviation as a Phase 13 perf-delta-report real-device follow-up.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/meetings/app/login/page.tsx`
- `apps/sponsor/app/login/page.tsx`
- Any phase that re-introduces image rendering on either login page (e.g., the post-Phase-4 follow-up to ship optimized local copies of the imagery).

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
