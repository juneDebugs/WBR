# Phase 7 Smoketest — Mid-sprint Lighthouse re-measurement + Tier B gating decision

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`; source: WBR demo sprint PRD §6 Phase 7 + §4 success criteria + §8.1.

## What this verifies

- The runner machinery is durable in-repo and reproducible from scratch (`docs/perf/run-lighthouse.sh`, `docs/perf/parse-lh.js`, `docs/perf/README.md`). Maps to the bus-factor requirement implicit in PRD §6 Phase 7 — the prior `/tmp/wbr-perf/` runner was lost on reboot.
- The cookie-capture procedure documented in `docs/perf/README.md` produces four valid session-cookie JSON files when run against the four canonical production deployments. Maps to PRD §6 Phase 7 dependency on auth'd Lighthouse runs.
- The runner produces exactly 18 Lighthouse JSON reports (9 routes × 2 profiles) when executed. Maps to PRD §6 Phase 7 AC #1 ("Lighthouse mobile + desktop runs completed for all sprint-relevant routes").
- The parser converts the 18 reports into a markdown delta table. Maps to PRD §6 Phase 7 AC #2 ("per-route delta vs. baseline captured").
- The Phase 7 artifact at `docs/perf/phase-7-midsprint-2026-06-30.md` records observed LCP ≤ 3s on the four attendee landing pages and ≤ 250KB transfer on the four `/login` routes. Maps to PRD §4 success criteria #1 and #2.
- The Phase 7 artifact contains an explicit Tier B gating decision in writing. Maps to PRD §6 Phase 7 AC #3 ("Tier B gating decision documented in writing").

## Prerequisites for the runner

- `lighthouse@13.4.0` installed globally (`npm i -g lighthouse@13.4.0`). Verify with `lighthouse --version` → `13.4.0`.
- Google Chrome installed at `/Applications/Google Chrome.app/` (or any Chrome that `lighthouse` can auto-discover on macOS).
- `node` available (verify `node --version` returns ≥ 18.x).
- `python3` available (the runner uses it to parse JSON cookie files for the curl warmup step).
- Network access to the four canonical production hosts: `wbr-mobile.vercel.app`, `wbr-web.vercel.app`, `wbr-meetings.vercel.app`, `wbr-sponsor.vercel.app`. The mapping is documented in `docs/perf/README.md` § "Production app → Vercel host mapping" — re-confirm with `vercel project ls` before running if more than ~1 week has passed since this smoketest was last exercised.
- Seeded ORGANIZER account active on production: `june@tailor.tech` / `admin123`.
- **Cookie capture executed.** Before running the numbered steps below, execute the cookie-capture procedure at `docs/perf/README.md` § "Rebuild from scratch" step 2 to populate `docs/perf/headers/{attendee,admin,meetings,sponsor}.json`. This step depends on the live production endpoints and seeded credentials — it is **environment-dependent setup**, not an env-agnostic contract check (per `docs/smoketests/CONTRACT.md` §1.1), so it sits in Prerequisites rather than the numbered Steps. The procedure prints `ok <app>` lines on success; any `fail <app>` line means credentials wrong, endpoint unreachable, or the `/api/login` response shape changed.
- **Lighthouse runner executed.** Run `./docs/perf/run-lighthouse.sh` once to populate `docs/perf/lighthouse/lh-<app>-<route-slug>-<profile>.json` for the 9 sprint-relevant routes × 2 profiles. Wall-clock: ~4–8 minutes depending on network + production cold-start latency. This step depends on the live production deployments and the captured cookies — also **environment-dependent setup**, parked in Prerequisites for the same CONTRACT.md §1.1 reason.

## Steps

### Step 1 — Runner machinery present in repo [contract]

**Verifies:** the runner script, parser, README, and gitignore exist under `docs/perf/` and are non-empty. Env-agnostic — file-system + grep observations against the working tree.

- [ ] Confirm the four runner files exist with non-trivial size.

  ```bash
  for f in docs/perf/run-lighthouse.sh docs/perf/parse-lh.js docs/perf/README.md docs/perf/.gitignore; do
    if [ -f "$f" ] && [ "$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")" -gt 100 ]; then
      echo "ok  $f"
    else
      echo "fail $f"
    fi
  done
  ```

  - **Pass:** all four lines print `ok <path>` (each file > 100 bytes).
  - **Fail:** any `fail <path>` line — a downstream phase removed or truncated the runner.

- [ ] Confirm `run-lighthouse.sh` is executable.

  ```bash
  test -x docs/perf/run-lighthouse.sh && echo ok || echo fail
  ```

  - **Pass:** `ok`.
  - **Fail:** `fail` — the executable bit was dropped (re-add with `chmod +x docs/perf/run-lighthouse.sh`).

- [ ] Confirm the runner declares the canonical production host mapping.

  ```bash
  grep -E "wbr-mobile\.vercel\.app|wbr-web\.vercel\.app|wbr-meetings\.vercel\.app|wbr-sponsor\.vercel\.app" docs/perf/run-lighthouse.sh | wc -l
  ```

  - **Pass:** the count is `4` (one line per canonical host).
  - **Fail:** count `< 4` — the mapping was edited away from the canonical set.

### Step 2 — Header files exist with the expected shape [contract]

**Verifies:** after the Prerequisites cookie-capture step ran, the resulting `docs/perf/headers/<app>.json` files exist for all four apps with the correct JSON shape. Env-agnostic — file-system + JSON-schema observation against the working tree; no network calls.

- [ ] Confirm the four header files exist.

  ```bash
  for app in attendee admin meetings sponsor; do
    if [ -f "docs/perf/headers/$app.json" ]; then
      echo "ok   docs/perf/headers/$app.json"
    else
      echo "fail docs/perf/headers/$app.json (run the Prerequisites cookie-capture procedure)"
    fi
  done
  ```

  - **Pass:** all four lines print `ok docs/perf/headers/<app>.json`.
  - **Fail:** any `fail` line — the Prerequisites cookie-capture procedure was skipped or partially failed. Re-run it before proceeding.

- [ ] Confirm each header file is valid JSON with a `Cookie` key whose value starts with the expected NextAuth secure-session prefix.

  ```bash
  for f in docs/perf/headers/*.json; do
    if python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert 'Cookie' in d and d['Cookie'].startswith('__Secure-next-auth.session-token=')" "$f" 2>/dev/null; then
      echo "ok  $f"
    else
      echo "fail $f"
    fi
  done
  ```

  - **Pass:** all four lines print `ok <path>`.
  - **Fail:** any `fail <path>` — the cookie JSON shape is wrong; check the capture script's `sed` extraction in `docs/perf/README.md` § "Rebuild from scratch" step 2.

### Step 3 — Lighthouse reports exist with expected shape and no auth-redirect [contract]

**Verifies:** after the Prerequisites runner-execution step ran, the resulting `docs/perf/lighthouse/lh-*.json` files exist for all 9 routes × 2 profiles, and the 8 `/login` reports show no redirect to authenticated routes (`finalDisplayedUrl` equals the requested `/login` URL). Env-agnostic — file-system + JSON inspection against the working tree; no network calls.

- [ ] Confirm exactly 18 JSON files exist with the expected naming pattern.

  ```bash
  COUNT=$(ls docs/perf/lighthouse/lh-*.json 2>/dev/null | wc -l | tr -d ' ')
  echo "count=$COUNT"
  ls docs/perf/lighthouse/lh-*.json | sort
  ```

  - **Pass:** `count=18` and the file list contains one entry per `<app>-<route-slug>-<profile>` combination for the 9 routes × {mobile, desktop} matrix: attendee {/login, /home, /speakers, /schedule, /people}, admin {/login, /dashboard/attendees}, meetings {/login}, sponsor {/login}.
  - **Fail:** `count != 18` — one or more Lighthouse runs failed (check the Prerequisites runner-execution stderr output for `[<app> <route> <profile>] FAILED` lines); OR the route list in `run-lighthouse.sh` was edited (re-confirm against PRD §6 Phase 7 AC).

- [ ] Confirm the 8 `/login` reports show `finalDisplayedUrl` equal to the exact requested URL per app (no cross-host or path-suffix redirect).

  ```bash
  node -e '
    const fs = require("node:fs");
    const dir = "docs/perf/lighthouse";
    const APP_HOST = {
      attendee: "wbr-mobile.vercel.app",
      admin:    "wbr-web.vercel.app",
      meetings: "wbr-meetings.vercel.app",
      sponsor:  "wbr-sponsor.vercel.app",
    };
    const profiles = ["mobile", "desktop"];
    let fails = 0;
    for (const [app, host] of Object.entries(APP_HOST)) {
      const expected = `https://${host}/login`;
      for (const profile of profiles) {
        const file = `${dir}/lh-${app}-login-${profile}.json`;
        const json = JSON.parse(fs.readFileSync(file, "utf8"));
        const url = json.finalDisplayedUrl ?? "";
        const ok = url === expected;
        console.log(`${ok ? "ok  " : "fail"} ${app} /login ${profile} finalDisplayedUrl=${url} expected=${expected}`);
        if (!ok) fails++;
      }
    }
    process.exit(fails === 0 ? 0 : 1);
  '
  ```

  - **Pass:** all 8 lines print `ok  <app> /login <profile> finalDisplayedUrl=<exact-url> expected=<same-exact-url>`; script exits 0.
  - **Fail:** any `fail` line — the auth cookie triggered a redirect (e.g., to `/home` or `/dashboard`), OR a cross-host redirect occurred (configuration change to one of the four canonical hosts). The auth-on-all-routes methodology relies on no redirect happening; a fail here invalidates the `/login` delta numbers in the artifact and requires either dropping cookies on `/login` (with a documented methodology divergence) or investigating which app's `/login` handler changed.

### Step 4 — Parser emits the markdown delta table [contract]

**Verifies:** `node docs/perf/parse-lh.js` reads the 18 reports and emits a markdown table with 18 data rows + the header + separator lines.

- [ ] Run the parser and count rows.

  ```bash
  node docs/perf/parse-lh.js > /tmp/phase-7-table.md
  TOTAL_LINES=$(wc -l < /tmp/phase-7-table.md | tr -d ' ')
  DATA_ROWS=$(grep -c "^| attendee\|^| admin\|^| meetings\|^| sponsor" /tmp/phase-7-table.md)
  echo "total_lines=$TOTAL_LINES data_rows=$DATA_ROWS"
  ```

  - **Pass:** `data_rows=18` and `total_lines=20` (18 data rows + 1 header row + 1 separator row). The table includes columns for `LCP sim`, `LCP obs`, `FCP sim`, `FCP obs` per the PRD §4 observed/simulated amendment.
  - **Fail:** `data_rows != 18` (parser missed some reports or filename pattern broke) OR `total_lines < 20` (parser output truncated).

- [ ] Confirm the parser surfaces both LCP variants.

  ```bash
  head -2 /tmp/phase-7-table.md
  ```

  - **Pass:** the header row contains both `LCP sim` and `LCP obs`.
  - **Fail:** either column missing — the parser was modified to drop the dual-LCP shape; re-check against PRD §4 amendment 2026-06-27.

### Step 5 — Sprint exit criteria pass on production [perf-bar tier A]

**Verifies:** the observed LCP and login transfer-size gates from PRD §4 (success criteria #1 and #2) hold on the current production deployments.

**Environment required:** Tier A (production). This is the binding measurement per PRD §6 Phase 7 mechanics — Phase 7's purpose is to verify the production deployment, not a preview. Tier D (dev mode) is invalid for this step per CONTRACT.md §1.2.

- [ ] Extract the gated metrics directly from the 18 Lighthouse reports.

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
      const obsLcp = json.audits.metrics?.details?.items?.[0]?.observedLargestContentfulPaint ?? Infinity;
      const ok = obsLcp <= 3000;
      console.log(`${ok ? "ok  " : "fail"} ${app} /${route} mobile observed LCP = ${Math.round(obsLcp)}ms (bar: <= 3000ms)`);
      if (!ok) fails++;
    }
    for (const [app, route] of txGates) {
      const json = JSON.parse(fs.readFileSync(`${dir}/lh-${app}-${route}-mobile.json`, "utf8"));
      const items = json.audits["resource-summary"]?.details?.items ?? [];
      const total = (items.find((i) => i.resourceType === "total")?.transferSize ?? Infinity) / 1024;
      const ok = total <= 250;
      console.log(`${ok ? "ok  " : "fail"} ${app} /${route} mobile total transfer = ${Math.round(total)}KB (bar: <= 250KB)`);
      if (!ok) fails++;
    }
    process.exit(fails === 0 ? 0 : 1);
  '
  ```

  - **Pass:** all eight lines print `ok  <app> /<route> mobile <metric> = <value> (bar: ...)`; script exits 0.
  - **Fail:** any line prints `fail <app> /<route> ...`; script exits 1. A failing observed LCP means a regression landed since the artifact was authored — investigate the responsible commit + re-evaluate the Tier B gating decision. A failing transfer-size gate means imagery, JS, or HTML payload regressed past the 250KB ceiling.

**Single-run variance note:** Lighthouse synthetic measurements carry ±10–15% noise. A single failing cell within 200ms of the 3000ms threshold (or within 25KB of the 250KB threshold) warrants a median-of-3 re-check via `for i in 1 2 3; do lighthouse "<URL>" ... ; done` before concluding regression.

### Step 6 — Phase 7 artifact contains required sections [contract]

**Verifies:** the Phase 7 measurement artifact at `docs/perf/phase-7-midsprint-2026-06-30.md` records the Tier B gating decision in writing + the per-route delta + the methodology section, per PRD §6 Phase 7 AC #2 and #3.

- [ ] Grep for each required section heading.

  ```bash
  ART="docs/perf/phase-7-midsprint-2026-06-30.md"
  for needle in \
    "Tier B gating decision" \
    "Sprint exit criteria" \
    "Phase 2 baseline" \
    "Full metrics" \
    "Methodology" \
    "References"; do
    if grep -q "$needle" "$ART"; then echo "ok   $needle"; else echo "fail $needle"; fi
  done
  ```

  - **Pass:** all six lines print `ok   <heading>`.
  - **Fail:** any `fail <heading>` — a required section was removed or renamed; re-add before merging.

- [ ] Confirm the artifact explicitly records the Tier B (engineering) gating decision.

  ```bash
  grep -A 1 "## Tier B gating decision" docs/perf/phase-7-midsprint-2026-06-30.md | head -3
  ```

  - **Pass:** the line after the heading begins with `**No additional engineering required.**` (or a future re-measurement's equivalent verdict that explicitly addresses whether Phase 8 / `initialData` wire-up needs to trigger).
  - **Fail:** the section is empty or the verdict on Phase 8 is missing — the gating-decision AC is unmet.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Runner machinery present in repo | contract | anywhere (file-system) | |
| 2. Header files exist with the expected shape | contract | anywhere (file-system + JSON) | |
| 3. Lighthouse reports exist with expected shape and no auth-redirect | contract | anywhere (file-system + JSON) | |
| 4. Parser emits the markdown delta table | contract | node available | |
| 5. Sprint exit criteria pass on production | perf-bar tier A | production deployments | |
| 6. Phase 7 artifact contains required sections | contract | anywhere (file-system) | |

## Pass / fail

The phase ships when:
- Steps 1, 2, 3, 4, and 6 PASS.
- Step 5 PASSES on the production deployment (all eight gated metrics meet their thresholds).

### Out-of-scope AC items (verified elsewhere)

PRD §4 success criteria items #3 and #5 are NOT verified by this smoketest:

- **#3 Sponsor iOS layout verified on a real iOS device.** Real-device UAT in the PRD §4 dry-run window (2026-07-02 or 2026-07-03). Not Lighthouse-measurable.
- **#5 Demo paths exercised end-to-end without visible defect.** Real-device + real-flow UAT in the dry-run window. Not Lighthouse-measurable.

Visual diffs for the imagery-affected pages (Phase 4 login imagery strip + Phase 14 hero gradient) are deferred to Phase 13's perf delta report per PRD §6 Phase 13.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `docs/perf/run-lighthouse.sh` — runner mechanics.
- `docs/perf/parse-lh.js` — parser shape.
- `docs/perf/README.md` — rebuild procedure documentation.
- `docs/perf/phase-7-midsprint-2026-06-30.md` — the measurement artifact.
- The production Vercel deployments for any of the four apps (config / domain / build pipeline change).
- The route handlers for any of the 9 measured paths.
- `apps/<app>/app/api/login/route.ts` (any of the four) — cookie capture procedure depends on this shape.
- `packages/db/prisma/seed.ts` — if the seeded ORGANIZER account or its credentials change.

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
