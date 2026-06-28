# Phase 2 Smoketest — Sponsor viewport meta + attendee/meetings a11y zoom polish

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md` (read first if you haven't); source: WBR demo sprint PRD §6 Phase 2, §8.1.

## What this verifies

- The sponsor app's `viewport` export declares `width: 'device-width'` + `initialScale: 1`. iOS Safari renders sponsor pages at device width instead of the 980px desktop fallback.
- The attendee and meetings apps' `viewport` exports no longer set `userScalable: false` / `maximumScale: 1`. Both apps permit user-initiated zoom.
- Next.js emits the corresponding `<meta name="viewport">` markup in the served HTML, with no `user-scalable=no` or `maximum-scale=1` substrings on attendee + meetings.
- Sponsor mobile CLS and tap-targets Lighthouse scores hold or improve vs. the Phase 2 baseline (PRD §4 success criterion #3 + Phase 2 acceptance criterion #3).

## Prerequisites for the runner

- All four apps runnable locally per `docs/smoketests/phase-0a-foundation-docs.md` §3–4.
- For contract steps using local dev: `pnpm --filter sponsor dev`, `pnpm --filter attendee dev`, `pnpm --filter meetings dev` running concurrently (ports 3003, 3001, 3002).
- Sponsor credentials: `sponsor@shopify.com` / `sponsor123` (also `sponsor@klaviyo.com` / `sponsor123`).
- Safari on macOS for Step 3 — Develop menu enabled (`Safari → Settings → Advanced → Show features for web developers`).
- For Step 4 Vercel-preview Lighthouse: the PR's preview URL (`vercel ls wbr-sponsor --scope june-1220s-projects | head -3`) and the `wbr-sponsor` project bypass token (project Settings → Deployment Protection).

## Steps

### Step 1 — Code-level viewport export inspection [contract]

**Verifies:** the three viewport exports match the Phase 2 specification at the source level. Env-agnostic — the same code emits the same output everywhere.

- [ ] `grep -A 6 "^export const viewport" apps/sponsor/app/layout.tsx`
  - **Pass:** the export contains `width: 'device-width'` and `initialScale: 1`. It does NOT contain `userScalable: false` or `maximumScale: 1`.
  - **Fail:** missing either of the device-width / initial-scale lines, OR contains a scaling-restriction line.
- [ ] `grep -A 6 "^export const viewport" apps/attendee/app/layout.tsx`
  - **Pass:** the export does NOT contain `userScalable: false` or `maximumScale: 1`. It retains `width: 'device-width'` and `initialScale: 1`.
  - **Fail:** either restriction line is present, OR width/initialScale removed.
- [ ] `grep -A 6 "^export const viewport" apps/meetings/app/layout.tsx`
  - **Pass:** same as attendee — no `userScalable: false` or `maximumScale: 1`; width and initialScale retained.
  - **Fail:** either restriction line is present, OR width/initialScale removed.

### Step 2 — Rendered viewport meta inspection [contract]

**Verifies:** Next.js serializes the Viewport export into the served HTML with the expected viewport substrings listed below. The `<meta name="viewport">` tag's `content` attribute is the contract surface that iOS Safari (and every other mobile browser) reads. Env-agnostic — the metadata generator runs the same code in dev and prod.

Run any of the three apps in dev (`pnpm --filter <app> dev`) or against a local prod build (`pnpm --filter <app> build && pnpm --filter <app> start`). Then:

```bash
# Sponsor /login (unauthenticated route — viewport export is in root layout, applies everywhere)
curl -s http://localhost:3003/login | grep -oE '<meta name="viewport"[^>]*>'

# Attendee /login
curl -s http://localhost:3001/login | grep -oE '<meta name="viewport"[^>]*>'

# Meetings /login
curl -s http://localhost:3002/login | grep -oE '<meta name="viewport"[^>]*>'
```

- [ ] Sponsor meta inspection
  - **Pass:** output contains `width=device-width` and `initial-scale=1`. Does NOT contain `user-scalable=no` or `maximum-scale=1`.
  - **Fail:** missing device-width substring (means the viewport export didn't pick up the change), OR contains a scaling restriction substring.
- [ ] Attendee meta inspection
  - **Pass:** output contains `width=device-width` and `initial-scale=1`. Does NOT contain `user-scalable=no` or `maximum-scale=1`.
  - **Fail:** contains either scaling restriction substring (means removal didn't propagate to the served HTML).
- [ ] Meetings meta inspection
  - **Pass:** same as attendee.
  - **Fail:** same as attendee.

### Step 3 — Safari Responsive Design Mode iOS 15+ render [contract]

**Verifies:** the served HTML renders at iPhone width without the 980px desktop fallback. Safari Responsive Design Mode (RDM) is the documented viewport-render check; a real iOS device is the higher-fidelity confirmation noted under "Pass / fail" as an optional pre-demo sanity check (per `feedback_doc_verification_posture` — RDM is the automated-feasible proxy).

This is a **contract check** because the layout decision is driven by the served HTML's viewport meta tag — same input, same Safari rendering behavior regardless of where the page is served from. Either local dev, Tier-C local prod build, or Tier-B Vercel preview is valid; pick the most convenient.

- [ ] Open Safari. `Develop → Enter Responsive Design Mode`. Pick an iPhone profile that runs iOS 15+ (e.g., `iPhone 14 Pro`, `iPhone 15`).
- [ ] Navigate to sponsor `/login` (and at least one authenticated route post-login, e.g., `/` or `/dashboard`).
  - **Pass:** layout viewport width matches the iPhone profile (e.g., 390-430px). The page's content lays out at that width. No horizontal scroll bar is present at the bottom of the viewport. No element overflows the viewport's right edge — verifiable in Safari Web Inspector with `document.documentElement.scrollWidth <= window.innerWidth`.
  - **Fail:** the page renders at 980px (visible as content being shrunk far below the iPhone-profile viewport width). OR `document.documentElement.scrollWidth > window.innerWidth`. OR a horizontal scroll bar is present at the bottom of the viewport.

### Step 4 — Sponsor mobile Lighthouse CLS + tap-targets [perf-bar tier B]

**Verifies:** the viewport-meta fix does not regress sponsor mobile Lighthouse layout-shift and tap-target scores. PRD §6 Phase 2 acceptance criterion #3 mandates "CLS and tap-target Lighthouse scores on sponsor mobile improve or hold." This step measures both pre- and post-change against the same environment (the Vercel preview for the Phase 2 PR) and compares.

**Environment required:** Tier B — Vercel preview deployment for the Phase 2 PR. Tier C local prod build acceptable as a pre-push proxy. Tier D dev mode is invalid.

**Baseline is captured by this smoketest run, not pulled from prior runs.** No prior run log records sponsor CLS or tap-targets values (`docs/smoketests/runs/phase-1-2026-06-27.md` is attendee-only). The runner produces both pre and post measurements as part of Step 4 execution and records them in `docs/smoketests/runs/phase-2-<date>.md`.

```bash
# Set PREVIEW_BASELINE + PREVIEW_POST + BYPASS_TOKEN. PREVIEW URLs from Vercel project list; BYPASS_TOKEN from the Vercel project's Settings → Deployment Protection.
# PREVIEW_BASELINE = the current main-branch Vercel preview / production sponsor URL (pre-Phase-2).
# PREVIEW_POST = the Phase 2 PR's Vercel preview URL (post-Phase-2).
# Sponsor app Vercel project = `wbr-sponsor`:
# vercel ls wbr-sponsor --scope june-1220s-projects | head -10  # locate the right deployment for each

# Run Lighthouse against /login on each (unauthenticated — no session cookie needed):
for URL in "$PREVIEW_BASELINE" "$PREVIEW_POST"; do
  SLUG=$(echo "$URL" | sed -E 's|https?://||; s|[^a-zA-Z0-9]|_|g')
  npx --yes lighthouse@latest "$URL/login" \
    --output=json \
    --output-path="/tmp/lh-sponsor-${SLUG}.json" \
    --quiet --chrome-flags="--headless=new --no-sandbox" \
    --form-factor=mobile \
    --extra-headers="{\"x-vercel-protection-bypass\":\"$BYPASS_TOKEN\"}" \
    --only-categories=performance
done

# Extract CLS + tap-targets for each run:
for URL in "$PREVIEW_BASELINE" "$PREVIEW_POST"; do
  SLUG=$(echo "$URL" | sed -E 's|https?://||; s|[^a-zA-Z0-9]|_|g')
  node -e "const lh=require('/tmp/lh-sponsor-${SLUG}.json'); const a=lh.audits;
    console.log('URL:', '${URL}');
    console.log('  CLS numericValue:', a['cumulative-layout-shift']?.numericValue);
    console.log('  CLS score:', a['cumulative-layout-shift']?.score);
    console.log('  tap-targets score:', a['tap-targets']?.score);
    if (a['tap-targets']?.details?.items) {
      console.log('  failing tap targets:', a['tap-targets'].details.items.length);
    }"
done
```

- [ ] Capture the **baseline** Lighthouse run against `$PREVIEW_BASELINE/login`. Record CLS numericValue and tap-targets score in `docs/smoketests/runs/phase-2-<date>.md`.
- [ ] Capture the **post-change** Lighthouse run against `$PREVIEW_POST/login`. Record CLS numericValue and tap-targets score in the same run log.
  - **Pass:** `post.CLS_numericValue ≤ baseline.CLS_numericValue + 0.01` (tolerance for Lighthouse single-run jitter; "+0.01" treats sub-noise increases as a hold, not a regression). AND `post.tap_targets_score ≥ baseline.tap_targets_score` (where `null`/missing audit score on either side is treated as a hold, since the audit only runs when there are tap targets to evaluate).
  - **Fail:** `post.CLS_numericValue > baseline.CLS_numericValue + 0.01`. OR `post.tap_targets_score < baseline.tap_targets_score` with both scores numeric (i.e., the audit ran on both sides).

**Single-run variance disclaimer:** Lighthouse CLS is subject to single-run jitter (~0.02 absolute on quiet pages). If post crosses baseline by less than the 0.01 tolerance, treat as a hold. If a single run shows a clear regression (>0.05 absolute), re-run twice more and take the median before declaring a fail.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Code-level viewport export inspection | contract | anywhere (source files) | |
| 2. Rendered viewport meta inspection | contract | local dev / local prod / Vercel preview | |
| 3. Safari RDM iOS 15+ render | contract | local dev / Tier-C / Tier-B | |
| 4. Sponsor mobile Lighthouse CLS + tap-targets | perf-bar tier B | Vercel preview | |

## Pass / fail

The phase ships when:

- Steps 1, 2, 3 PASS on any valid environment.
- Step 4 PASS on Tier B (Vercel preview) before merge.
- (Optional pre-demo sanity, not gating per `feedback_doc_verification_posture` — RDM is the documented automated-feasible proxy.) Open the sponsor Vercel preview on a real iOS device (Safari mobile) and confirm: device-width render, no horizontal scroll, no text overflow. Pinch-to-zoom works on attendee and meetings. Log any deviation as a Phase 13 perf-delta-report real-device follow-up.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/sponsor/app/layout.tsx`
- `apps/attendee/app/layout.tsx`
- `apps/meetings/app/layout.tsx`
- Any phase that modifies global responsive layout, CSS reset, or root-level body styling on the three apps above.

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
