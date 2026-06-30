# Phase 13 Smoketest — Pre/post-sprint performance delta report

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`; source: WBR demo sprint PRD §6 Phase 13, §4 success criteria, §8.1, §8.6.

## What this verifies

- The perf delta report exists at `docs/perf-delta-2026-07-06.md` and contains every required section per PRD §6 Phase 13. Maps to PRD §6 Phase 13 AC bullet 1 (report committed) and PRD §6 Phase 13 AC bullet 4 (required format).
- The report's pre/post delta rows are reproducible from `docs/perf/lighthouse/lh-*.json` via `node docs/perf/parse-lh.js`. Maps to PRD §6 Phase 13 AC bullet 2 (pre/post delta captured for all sprint-relevant routes).
- The visual-diff capture set lives in `docs/perf/visual-diffs/` and covers the imagery-affected surfaces named in PRD §6 Phase 13: the default-flow capture writes four mobile-viewport post-state PNGs against production; the baseline-reproduction recipe (documented later in this file) writes the additional baseline + desktop PNGs (nine PNGs total). Maps to PRD §6 Phase 13 AC bullet 6 (visual diff captured for the imagery-affected surfaces).
- The report carries both simulated and observed LCP per route per the PRD §4 amendment 2026-06-27. Maps to PRD §6 Phase 13 AC bullet 7.
- The report carries the methodology + post-sprint follow-up section pointing at Phase 16. Maps to PRD §6 Phase 13 AC bullet 8.
- The report's sprint-exit-criteria verdict matches the values surfaced by the underlying Lighthouse reports (no drift between the report's gating-table cells and the raw JSON). Maps to PRD §6 Phase 13 AC bullet 3 (sprint exit criteria verifiably passed).

## Prerequisites for the runner

- All sprint phases through Phase 14 + Phase 7 landed on production. The post-sprint deployment of all four apps must be the current canonical Vercel projects per `docs/perf/README.md` (attendee = `wbr-mobile.vercel.app`, admin = `wbr-web.vercel.app`, meetings = `wbr-meetings.vercel.app`, sponsor = `wbr-sponsor.vercel.app`).
- Phase 7 cookie-capture + Lighthouse runner already executed (`docs/perf/headers/<app>.json` and `docs/perf/lighthouse/lh-*.json` populated). If more than ~3 weeks have passed since Phase 7's measurement, re-run per `docs/perf/README.md` § "Rebuild from scratch".
- `node` available (verify `node --version` returns ≥ 18.x).
- Playwright + chromium installed for the visual-diff capture (`npx playwright install chromium` once; PRD §8.6).
- Network access to the four canonical production hosts above for the visual-diff capture.
- Seeded ORGANIZER account active on production attendee deployment: `june@tailor.tech` / `admin123` (the same credentials used by Phase 7's cookie-capture procedure).

## Steps

### Step 1 — Report exists with required sections [contract]

**Verifies:** the perf delta report at `docs/perf-delta-2026-07-06.md` contains every section named in PRD §6 Phase 13 acceptance criteria. Env-agnostic — file-system + grep observations against the working tree.

- [ ] Confirm the report file exists and is non-trivial.

  ```bash
  REPORT="docs/perf-delta-2026-07-06.md"
  if [ -f "$REPORT" ] && [ "$(stat -f%z "$REPORT" 2>/dev/null || stat -c%s "$REPORT")" -gt 4096 ]; then
    echo "ok  $REPORT"
  else
    echo "fail $REPORT"
  fi
  ```

  - **Pass:** `ok docs/perf-delta-2026-07-06.md` (file exists, > 4 KB).
  - **Fail:** `fail` — report missing or truncated.

- [ ] Grep for each required section heading. Needles match current report section names (renamed pre/post → pre/mid in R1-F2 fix; the report's measurement-column model is pre-sprint → mid-sprint → post-sprint final).

  ```bash
  for needle in \
    "Headline result" \
    "Measurement points used in this report" \
    "Sprint exit criteria" \
    "Pre/mid delta — gating routes" \
    "Pre/mid delta — login total transfer" \
    "Pre/mid delta — admin" \
    "Pre/mid delta — full metrics, mobile profile" \
    "Pre/mid delta — desktop profile" \
    "Final measurement (post-dry-run)" \
    "Visual diffs" \
    "Methodology + post-sprint follow-up" \
    "Phase 16" \
    "Known limitations" \
    "References"; do
    if grep -q "$needle" docs/perf-delta-2026-07-06.md; then
      echo "ok   $needle"
    else
      echo "fail $needle"
    fi
  done
  ```

  - **Pass:** every line prints `ok   <heading>`.
  - **Fail:** any `fail <heading>` — a required section was removed or renamed; re-add before merging.

- [ ] Confirm the report carries both LCP variants per route in the delta and full-metrics tables. The needle `LCP sim` matches the section heading "Mobile/Desktop — LCP simulated"; `LCP obs` matches "Mobile — LCP observed" and the `Mid LCP (obs)` column heading in the gating-routes table.

  ```bash
  REPORT="docs/perf-delta-2026-07-06.md"
  SIM=$(grep -c "LCP simulated\|LCP (sim)" "$REPORT")
  OBS=$(grep -c "LCP observed\|LCP (obs)" "$REPORT")
  echo "sim=$SIM obs=$OBS"
  ```

  - **Pass:** both `SIM` and `OBS` are ≥ 2 (the delta tables and the per-metric mobile + desktop sub-tables each surface both columns).
  - **Fail:** either is 0 — the report dropped one of the LCP variants; reconcile against PRD §4 amendment 2026-06-27.

### Step 2 — Pre/post delta rows reproducible from raw Lighthouse JSON [contract]

**Verifies:** the Phase 7 measurement values reproduced in the delta tables are reproducible by re-parsing `docs/perf/lighthouse/lh-*.json`. Env-agnostic — file-system + JSON inspection against the working tree.

- [ ] Run the parser and confirm the row count + LCP-column shape.

  ```bash
  node docs/perf/parse-lh.js > /tmp/phase-13-table.md
  DATA_ROWS=$(grep -c "^| attendee\|^| admin\|^| meetings\|^| sponsor" /tmp/phase-13-table.md)
  HAS_SIM=$(grep -c "LCP sim" /tmp/phase-13-table.md)
  HAS_OBS=$(grep -c "LCP obs" /tmp/phase-13-table.md)
  echo "data_rows=$DATA_ROWS has_sim=$HAS_SIM has_obs=$HAS_OBS"
  ```

  - **Pass:** `data_rows=18` (one per route × profile in the Phase 7 sprint-relevant set) and both `has_sim` and `has_obs` are ≥ 1.
  - **Fail:** any value off — the parser shape regressed or some Lighthouse JSON files were removed; re-run Phase 7's runner per `docs/perf/README.md`.

- [ ] Spot-check four gating cells (attendee mobile LCP observed) against the report's gating table. The check is exact-equal to the rounded JSON value (transcription drift, not measurement noise — variance tolerance is reserved for the fresh Lighthouse-rerun step in Step 4).

  ```bash
  node -e '
    const fs = require("node:fs");
    const dir = "docs/perf/lighthouse";
    const cells = [
      ["attendee", "home",     1861],
      ["attendee", "speakers", 645],
      ["attendee", "schedule", 447],
      ["attendee", "people",   495],
    ];
    let fails = 0;
    for (const [app, route, expected] of cells) {
      const json = JSON.parse(fs.readFileSync(`${dir}/lh-${app}-${route}-mobile.json`, "utf8"));
      const obs = Math.round(json.audits.metrics?.details?.items?.[0]?.observedLargestContentfulPaint ?? -1);
      const ok = obs === expected;
      console.log(`${ok ? "ok  " : "fail"} ${app} /${route} mobile observed LCP = ${obs}ms (report: ${expected}ms)`);
      if (!ok) fails++;
    }
    process.exit(fails === 0 ? 0 : 1);
  '
  ```

  - **Pass:** all four lines print `ok  <app> /<route> mobile observed LCP = <value>ms (report: <value>ms)`; script exits 0. The report's cells exactly match the rounded JSON values.
  - **Fail:** any line prints `fail`. Two interpretations: (a) the report's cell value is transcription-drift from the JSON — reconcile by editing the report; (b) the underlying JSON has changed since the report was authored (someone re-ran Phase 7) — re-derive the report's cells from the parser output via `node docs/perf/parse-lh.js`. Either way, an exact mismatch is an unconditional reconcile-before-merge.

### Step 3 — Visual-diff capture set is present [contract]

**Verifies:** the committed `docs/perf/visual-diffs/` directory holds the full set of PNGs the report's "Visual diffs" section references — four mobile post screenshots (from the default capture flow), two desktop post screenshots and one desktop baseline-proxy (Phase 4 lg+ panel diff), and two Phase 14 mobile baselines (pre-Phase-14 attendee `/home` + `/people`). Nine PNGs total. Env-agnostic in shape (file-system observation); env-dependent for re-capture (the default capture flow hits production; the baseline-reproduction recipe requires local prod builds against reverted source files).

- [ ] Run the default capture flow against production. Default targets are production; override via env if running against local prod or a Vercel preview. The default flow writes the four mobile post screenshots.

  ```bash
  node docs/smoketests/playwright/phase-13-visual-diffs.mjs
  ```

  - **Pass:** the script exits 0 and prints one `✓ <surface> → docs/perf/visual-diffs/<name>.png` line per surface (four lines).
  - **Fail:** the script exits non-zero, or any line prints `✗` — investigate the surfaced error (commonly: production credentials rotated, base URL changed, or chromium not installed).

- [ ] Confirm all expected screenshot files exist with non-trivial byte size. The set includes mobile post screenshots for the four imagery-affected surfaces, desktop pair (baseline + post) for the Phase 4 sponsor `/login` lg+ panel, and Phase 14 baseline pair for attendee `/home` + `/people` against pre-Phase-14 source.

  ```bash
  for f in \
      docs/perf/visual-diffs/meetings-login-mobile-post.png \
      docs/perf/visual-diffs/sponsor-login-mobile-post.png \
      docs/perf/visual-diffs/attendee-home-mobile-post.png \
      docs/perf/visual-diffs/attendee-people-mobile-post.png \
      docs/perf/visual-diffs/attendee-home-mobile-baseline.png \
      docs/perf/visual-diffs/attendee-people-mobile-baseline.png \
      docs/perf/visual-diffs/meetings-login-desktop-post.png \
      docs/perf/visual-diffs/sponsor-login-desktop-post.png \
      docs/perf/visual-diffs/sponsor-login-desktop-baseline-proxy.png; do
    if [ -f "$f" ] && [ "$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")" -gt 10240 ]; then
      echo "ok  $f"
    else
      echo "fail $f"
    fi
  done
  ```

  - **Pass:** all nine lines print `ok <path>` — each file exists and is > 10 KB.
  - **Fail:** any `fail <path>` — capture failed for that surface. Mobile-post files are re-generated by the default Step 3 first action (production capture); desktop-post + desktop-baseline + Phase-14-baseline files are regenerated via the "Pre-sprint baseline screenshot capture (reproduction)" recipe below — which involves source-file reverts and local prod builds.

### Step 4 — Sprint exit criteria pass on the production deployment [perf-bar tier A]

**Verifies:** the report's "Sprint exit criteria — verdict" table reflects the current production state, not a stale snapshot. PRD §4 success criteria #1 (attendee observed LCP ≤ 3 s) and #2 (login total transfer ≤ 250 KB) are the Lighthouse-measurable bars.

**Environment required:** Tier A (production deployments). This step inherits Phase 7's measurement; if more than ~3 weeks have elapsed since Phase 7 or any code path in the sprint-relevant route set has changed, re-run Phase 7's runner before this step. Tier D (dev mode) is invalid per CONTRACT.md §1.2.

- [ ] Re-derive the gated metrics directly from the Phase 7 Lighthouse JSON.

  ```bash
  node -e '
    const fs = require("node:fs");
    const dir = "docs/perf/lighthouse";
    const lcpGates = [
      ["attendee", "home"], ["attendee", "speakers"],
      ["attendee", "schedule"], ["attendee", "people"],
    ];
    const txGates = [
      ["attendee", "login"], ["admin", "login"],
      ["meetings", "login"], ["sponsor", "login"],
    ];
    let fails = 0;
    for (const [app, route] of lcpGates) {
      const json = JSON.parse(fs.readFileSync(`${dir}/lh-${app}-${route}-mobile.json`, "utf8"));
      const obs = json.audits.metrics?.details?.items?.[0]?.observedLargestContentfulPaint ?? Infinity;
      const passed = obs <= 3000;
      console.log(`${passed ? "ok  " : "fail"} ${app} /${route} mobile observed LCP = ${Math.round(obs)}ms (bar: ≤ 3000ms)`);
      if (!passed) fails++;
    }
    for (const [app, route] of txGates) {
      const json = JSON.parse(fs.readFileSync(`${dir}/lh-${app}-${route}-mobile.json`, "utf8"));
      const items = json.audits["resource-summary"]?.details?.items ?? [];
      const totalKB = (items.find((i) => i.resourceType === "total")?.transferSize ?? Infinity) / 1024;
      const passed = totalKB <= 250;
      console.log(`${passed ? "ok  " : "fail"} ${app} /${route} mobile total transfer = ${Math.round(totalKB)}KB (bar: ≤ 250KB)`);
      if (!passed) fails++;
    }
    process.exit(fails === 0 ? 0 : 1);
  '
  ```

  - **Pass:** all eight lines print `ok  <app> /<route> mobile <metric> = <value> (bar: ...)`; script exits 0. The report's "Sprint exit criteria — verdict" table is consistent with the underlying production measurement.
  - **Fail:** any line prints `fail`. If the failure represents real regression (not Lighthouse variance), the report's verdict table needs updating + the "known-issue we ship with" annotation per PRD §4 sign-off mechanism.

**Single-run variance note:** Lighthouse synthetic measurements carry ±10–15% noise. A failing cell within 200 ms of the 3000 ms threshold or 25 KB of the 250 KB threshold warrants a median-of-3 re-check via `for i in 1 2 3; do ./docs/perf/run-lighthouse.sh; done` before concluding regression.

### Step 5 — Methodology + Phase 16 follow-up section is load-bearing [contract]

**Verifies:** the report's methodology section explains the simulated-vs-observed LCP gap (the lantern-model + base64-storage interaction) and points to Phase 16 as the architectural unlock. Env-agnostic — grep against the working tree.

- [ ] Grep for the required methodology cues.

  ```bash
  REPORT="docs/perf-delta-2026-07-06.md"
  for needle in \
    "lantern" \
    "base64" \
    "Phase 16" \
    "observed LCP" \
    "Vercel Blob"; do
    if grep -qi "$needle" "$REPORT"; then
      echo "ok   $needle"
    else
      echo "fail $needle"
    fi
  done
  ```

  - **Pass:** all five lines print `ok   <needle>`.
  - **Fail:** any `fail <needle>` — the methodology framing is missing a load-bearing concept; cross-check against PRD §6 Phase 13 AC bullet 8 and `docs/decisions.md` § "Image content base64-encoded in the database".

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Report exists with required sections | contract | anywhere (file-system + grep) | |
| 2. Pre/post delta rows reproducible from raw Lighthouse JSON | contract | anywhere (file-system + node) | |
| 3. Visual-diff capture set is present | contract | file-system + (for re-capture) network to production or local prod build | |
| 4. Sprint exit criteria pass on production deployment | perf-bar tier A | production Lighthouse runs (via Phase 7 JSON) | |
| 5. Methodology + Phase 16 follow-up section is load-bearing | contract | anywhere (file-system + grep) | |

## Pass / fail

The phase ships when:
- Steps 1, 2, 3, 4, and 5 ALL PASS. Step 4 (the Tier A perf-bar gate against the production deployment) is required, not optional — a failing Step 4 either reflects a real regression (annotate in the report per PRD §4 sign-off mechanism's "known-issue we ship with" path before merging) or measurement noise within the variance tolerance the note below Step 4 describes (re-run before declaring regression).

### Out-of-scope AC items (verified elsewhere)

PRD §4 success criteria items #3 and #5 are NOT verified by this smoketest:

- **#3 Sponsor iOS layout verified on a real iOS device.** Real-device UAT in the PRD §4 dry-run window (2026-07-02 or 2026-07-03). Not Lighthouse-measurable. The Phase 13 report records the bar as ⏳ UAT-batched; a flagged regression at UAT routes through the same-day in/out sign-off mechanism.
- **#5 Demo paths exercised end-to-end without visible defect.** Real-device + real-flow UAT in the dry-run window. Not Lighthouse-measurable.

Phase 14's per-pixel visual-identity AC (gradient vs. photographic backdrop on `/home`; local PWA icon vs. gstatic thumbnail on `/people`) routes through Phase 14's own smoketest UAT handoff (`docs/smoketests/phase-14-mobile-header-imagery.md` § "UAT handoff — multimodal visual identity review"). Phase 13's report references the post-sprint screenshots; the per-pixel baseline-vs-post comparison happens in Phase 14's handoff window.

## Pre-sprint baseline screenshot capture (reproduction)

This procedure produces the pre-sprint baseline screenshots (`*-baseline.png` and `sponsor-login-desktop-baseline-proxy.png`) by reverting per-phase source files to their pre-phase state, building the affected apps in local production mode, capturing against `http://localhost:<port>`, then restoring source files. The procedure is the one used to author the committed baseline screenshots; re-run only when (a) the Phase 14 or Phase 4 source files change in a downstream phase and the baseline files need refresh, or (b) someone wants to regenerate from scratch for audit.

```bash
# --- Production desktop-post captures: meetings + sponsor /login on the lg+
# panel after the Phase 4 imagery strip. These commit alongside the mobile-post
# captures the default Step 3 flow produces; this command writes them before
# any source reverts so production targets are untouched by local builds.

PHASE13_VIEWPORT=desktop \
PHASE13_OUTPUT_SUFFIX=post \
PHASE13_SURFACES=meetings-login,sponsor-login \
  node docs/smoketests/playwright/phase-13-visual-diffs.mjs

# --- Phase 4 baselines: sponsor + meetings /login imagery on the lg+ left panel.
# Capture sponsor desktop baseline-proxy (also serves as the Phase 2 proxy);
# meetings uses the same Unsplash imagery pattern from the same component shape,
# so the sponsor desktop baseline visually demonstrates both apps' pre-state.

git checkout 2a20823~ -- apps/meetings/app/login/page.tsx apps/sponsor/app/login/page.tsx

pnpm --filter meetings build
pnpm --filter sponsor build
pnpm --filter meetings start --port 3002 > /tmp/p13-meetings.log 2>&1 &
pnpm --filter sponsor start --port 3003 > /tmp/p13-sponsor.log 2>&1 &
# Wait for both servers to answer 200 on /login.

# Sponsor desktop baseline-proxy (with imagery on lg+ panel).
SPONSOR_BASE_URL=http://localhost:3003 \
PHASE13_OUTPUT_SUFFIX=baseline-proxy \
PHASE13_VIEWPORT=desktop \
PHASE13_SURFACES=sponsor-login \
  node docs/smoketests/playwright/phase-13-visual-diffs.mjs

# Restore Phase 4 files + stop servers.
git restore --source=HEAD --staged --worktree \
  apps/meetings/app/login/page.tsx apps/sponsor/app/login/page.tsx
kill %1 %2 2>/dev/null
wait 2>/dev/null

# --- Phase 14 baselines: attendee /home (hot-link fallback) + /people (gstatic).
# The pre-Phase-14 source hard-codes the agcdn URL in HomeScreen.tsx's fallback
# and the gstatic.com URL in PeopleClient.tsx; the baseline screenshots render
# those hot-links against a local prod build of the attendee app.

git checkout d8b878a~ -- \
  apps/attendee/components/HomeScreen.tsx \
  apps/attendee/components/people/PeopleClient.tsx \
  apps/attendee/next.config.js

# Clear Conference.heroImageUrl in the local DB so the fallback path fires.
# (If Turso env vars are set, the embedded replica may re-sync the field;
#  unset TURSO_DATABASE_URL + TURSO_AUTH_TOKEN before starting the app for a
#  clean capture, OR run the UPDATE just before the capture and accept that
#  subsequent restarts will re-sync.)
sqlite3 apps/attendee/dev.db "UPDATE Conference SET heroImageUrl=NULL WHERE id='conf-2025';"

pnpm --filter attendee build
pnpm --filter attendee start --port 3001 > /tmp/p13-attendee.log 2>&1 &
# Wait for the server to answer 200 on /login.

ATTENDEE_BASE_URL=http://localhost:3001 \
ATTENDEE_EMAIL=june@tailor.tech \
ATTENDEE_PASSWORD=admin123 \
PHASE13_OUTPUT_SUFFIX=baseline \
PHASE13_SURFACES=attendee-home,attendee-people \
  node docs/smoketests/playwright/phase-13-visual-diffs.mjs

# Restore Phase 14 files + stop server.
git restore --source=HEAD --staged --worktree \
  apps/attendee/components/HomeScreen.tsx \
  apps/attendee/components/people/PeopleClient.tsx \
  apps/attendee/next.config.js
kill %1 2>/dev/null
wait 2>/dev/null

# The script writes nine PNGs into docs/perf/visual-diffs/ across the default
# production-capture and this baseline-reproduction recipe. Step 3 of this
# smoketest verifies the full set exists with non-trivial byte size.
```

After this procedure, `docs/perf/visual-diffs/` contains the nine PNGs Step 3 checks for. The mobile login surfaces (`meetings-login-mobile-*.png`, `sponsor-login-mobile-*.png`) commit only the post screenshot — the imagery is hidden at mobile widths by Tailwind responsive classes regardless of pre/post source, so a `mobile-baseline` PNG would be byte-identical to the `mobile-post` PNG; the desktop pair carries the visual diff.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `docs/perf-delta-2026-07-06.md` — the deliverable.
- `docs/smoketests/playwright/phase-13-visual-diffs.mjs` — the capture script.
- `docs/perf/visual-diffs/*.png` — committed visual-diff assets.
- `docs/perf/run-lighthouse.sh`, `docs/perf/parse-lh.js`, `docs/perf/README.md` — runner mechanics.
- `docs/perf/phase-7-midsprint-2026-06-30.md` — the Phase 7 measurement artifact this report cites.
- Any code path under `apps/<app>/app/`, `apps/<app>/components/`, or `apps/<app>/next.config.js` that affects the 9 sprint-relevant routes' rendering or asset shape (re-measure Phase 7 first, then update the report's cells).

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
