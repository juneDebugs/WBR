# Phase 14 Smoketest — Remove external hot-linked imagery from attendee app

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`; source: WBR demo sprint PRD §6 Phase 14 (amended 2026-06-29), §8.1, §8.6.

## What this verifies

- Attendee `/home` no longer issues an image request to `agcdn-1d97e.kxcdn.com` when `Conference.heroImageUrl` is null (the every-fresh-install case the phase fixes). Maps to amended PRD §6 Phase 14 AC bullet 1.
- Attendee `/people` no longer issues an image request to `encrypted-tbn0.gstatic.com`. Maps to amended PRD §6 Phase 14 AC bullet 2.
- The hero gradient renders behind the existing z-10 black-from-top overlay (visual identity preserved or flagged for stakeholder review via multimodal diff). Maps to amended PRD §6 Phase 14 AC bullet 3.
- The `<Image>` rollback blocks at both code sites are preserved verbatim inside JSX comments; the `images.remotePatterns` entries are retained in `apps/attendee/next.config.js` with explanatory comment. Maps to amended PRD §6 Phase 14 AC bullets 4 and 5.

## Prerequisites for the runner

- Attendee app runnable locally in production mode (`pnpm --filter attendee build && pnpm --filter attendee start`) on `http://localhost:3001`. Tier D (dev mode) is **invalid** for the contract steps below because the PWA service worker is disabled in dev (`apps/attendee/next.config.js` → `disable: NODE_ENV === 'development'`), and the production-mode bundle is what the assertions hold against.
- Seeded credentials per `packages/db/prisma/seed.ts` — defaults `steph@curry.com` / `stephcurry`.
- Seeded `Conference` row with `heroImageUrl=null` (this is the seed default per `seed.ts:104-119`; if a prior session set `heroImageUrl` via `/dashboard/app-settings`, re-seed with `pnpm db:seed` before running Step 1).
- Playwright + chromium installed at the repo root (`npx playwright install chromium` once; PRD §8.6).
- `git` working tree clean enough to `git stash push` the two edited components for the baseline screenshot pass (Step 3 stashes both component files; pop restores afterward).

## Steps

### Step 1 — `/home` zero requests to `agcdn-1d97e.kxcdn.com` [contract]

**Verifies:** the hot-linked hero fallback in `apps/attendee/components/HomeScreen.tsx` (hero render block) is no longer reachable from the rendered tree when `Conference.heroImageUrl` is null. Env-agnostic — the assertion is about which hostname appears in the resulting request set, not about any quantitative perf measurement.

- [ ] Start the attendee app in local prod mode.

  ```bash
  pnpm --filter attendee build
  pnpm --filter attendee start
  ```

- [ ] Run the Playwright contract script.

  ```bash
  node docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs
  ```

  - **Pass:** Step 1 in the script's output prints `✓ /home emitted 0 image requests to agcdn-1d97e.kxcdn.com`.
  - **Fail:** any line `✗ /home emitted N image request(s) to agcdn-1d97e.kxcdn.com: <URL...>` — the gradient conditional did not take effect, or a regression reintroduced the hot-link.

### Step 2 — `/people` zero requests to `encrypted-tbn0.gstatic.com` [contract]

**Verifies:** the hot-linked WBR-module avatar in `apps/attendee/components/people/PeopleClient.tsx` (WBR module avatar render) is no longer reachable from the rendered tree. Env-agnostic — same reasoning as Step 1.

- [ ] Same Playwright invocation as Step 1 (one process runs both contract checks).

  - **Pass:** Step 2 in the script's output prints `✓ /people emitted 0 image requests to encrypted-tbn0.gstatic.com`.
  - **Fail:** any line `✗ /people emitted N image request(s) to encrypted-tbn0.gstatic.com: <URL...>`.

### Step 3 — Capture post + baseline screenshots via `git stash` pattern [contract]

**Verifies:** the multimodal visual-identity AC can be evaluated against a pair of comparable PNGs. Env-agnostic — both screenshots are captured against the same local prod build; the only difference is whether the working-tree edits are applied or stashed.

- [ ] Confirm post screenshots exist from Step 1 + Step 2 (script auto-writes them).

  - **Pass:** `/tmp/phase-14-attendee-home-post.png` and `/tmp/phase-14-attendee-people-post.png` both exist and are non-zero bytes.
  - **Fail:** either file missing or zero bytes — Playwright write step failed.

- [ ] Capture baseline screenshots by stashing the Phase 14 component edits and re-running the script in **capture-only mode** (`PHASE14_CAPTURE_ONLY=1`), which skips the forbidden-hostname assertions so the pre-Phase-14 source — which deterministically emits those hostnames — still exits 0 after writing the screenshots.

  ```bash
  git stash push -m "phase-14 baseline capture" -- \
    apps/attendee/components/HomeScreen.tsx \
    apps/attendee/components/people/PeopleClient.tsx

  # Re-build with the stashed (pre-Phase-14) source.
  pnpm --filter attendee build
  pnpm --filter attendee start  # in another shell or restart

  # Re-run the Playwright script in CAPTURE_ONLY mode — assertions are skipped,
  # screenshots are written, and exit 0 is preserved so downstream `mv` commands
  # run under `set -e` shells.
  PHASE14_CAPTURE_ONLY=1 node docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs
  mv /tmp/phase-14-attendee-home-post.png /tmp/phase-14-attendee-home-baseline.png
  mv /tmp/phase-14-attendee-people-post.png /tmp/phase-14-attendee-people-baseline.png

  # Restore the Phase 14 edits.
  git stash pop
  pnpm --filter attendee build
  pnpm --filter attendee start  # final run leaves working tree on Phase 14 source

  # Re-run once more (NO capture-only flag) to regenerate the post PNGs against
  # the active source AND re-verify the forbidden-hostname contracts.
  node docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs
  ```

  - **Pass:** all four files exist — `/tmp/phase-14-attendee-{home,people}-{baseline,post}.png` — and the final (non-CAPTURE_ONLY) run exits 0 (Phase 14 active source still satisfies the contract).
  - **Fail:** any of the four files missing, OR the final run exits non-zero (one of the regressions reintroduced a hot-link).

### Step 4 — Screenshot files captured and non-trivial [contract]

**Verifies:** the four PNGs required by the UAT visual-identity review (out of band, see "UAT handoff" below) exist with non-trivial byte size, so the review can proceed. Env-agnostic — file-system observation.

- [ ] Confirm all four screenshot files exist and are larger than 10 KB each.

  ```bash
  for f in /tmp/phase-14-attendee-home-baseline.png \
           /tmp/phase-14-attendee-home-post.png \
           /tmp/phase-14-attendee-people-baseline.png \
           /tmp/phase-14-attendee-people-post.png; do
    if [ -f "$f" ] && [ "$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")" -gt 10240 ]; then
      echo "ok  $f"
    else
      echo "fail $f"
    fi
  done
  ```

  - **Pass:** each line prints `ok <path>` — all four files exist with byte size > 10 KB.
  - **Fail:** any `fail <path>` line — file missing or zero/near-zero bytes, indicating the Playwright capture failed.

### Step 5 — Rollback path preserved verbatim [contract]

**Verifies:** the original `<Image>` render blocks remain in source at both code sites inside JSX comments, and the `images.remotePatterns` retention is documented. Env-agnostic — source-level grep against the working tree.

- [ ] Grep for the preserved rollback blocks at each code site.

  ```bash
  grep -n "Phase 14 rollback" \
    apps/attendee/components/HomeScreen.tsx \
    apps/attendee/components/people/PeopleClient.tsx

  grep -n "Phase 14" apps/attendee/next.config.js
  grep -nE "agcdn-1d97e\.kxcdn\.com|encrypted-tbn0\.gstatic\.com" \
    apps/attendee/next.config.js
  ```

  - **Pass:** the first grep returns one match per component file containing the literal phrase `Phase 14 rollback`. The second grep returns a `Phase 14` comment block in `apps/attendee/next.config.js`. The third grep returns both hostnames still present in the `images.remotePatterns` array.
  - **Fail:** any of the three greps returns zero matches — a downstream phase or revert removed the rollback path or the config retention.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. `/home` zero requests to `agcdn-1d97e.kxcdn.com` | contract | local prod build | |
| 2. `/people` zero requests to `encrypted-tbn0.gstatic.com` | contract | local prod build | |
| 3. Baseline + post screenshots captured via `git stash` | contract | local prod build | |
| 4. Screenshot files exist and are non-trivial | contract | anywhere (file-system) | |
| 5. Rollback path preserved verbatim | contract | anywhere (source grep) | |

## Pass / fail

The phase ships when:
- Steps 1, 2, 3, 4, and 5 PASS on the local prod build.
- The UAT handoff (below) is queued for the PRD §4 dry-run window. A flagged regression at that point does not block the phase from shipping — it routes to the rollback path documented at the code sites + in PRD §6 Phase 14 fallback.

### Out-of-scope AC bullets (verified elsewhere)

The amended PRD §6 Phase 14 AC includes one bullet that is **not** verified by this smoketest:

- **"No regression in mobile observed LCP / Speed Index on `/home` and `/people`."** This is verified during the Phase 13 perf delta report's measurement pass (PRD §6 Phase 13), not here. Phase 14 ships when this smoketest's Steps 1–5 pass; the Phase 13 deliverable's measurement pass is where the perf-regression check lands. Re-evaluate Phase 14 acceptance if the Phase 13 report shows a regression vs. baseline on either route.

## UAT handoff — multimodal visual identity review (non-blocking, routed to dry-run)

The visual-identity AC bullet in PRD §6 Phase 14 ("multimodal review confirms visual identity preserved or flags a regression for UAT-level review") is **subjective** by construction and therefore not a contract-step pass criterion per `docs/smoketests/CONTRACT.md` §3. It is captured here as a UAT handoff to be exercised in the PRD §4 dry-run window (2026-07-02 or 2026-07-03) by the stakeholder + engineer-of-record pair. The four PNGs captured in Step 3 + verified existent in Step 4 are the artifacts the UAT review reads.

Review pattern for the runner (human or multimodal AI):

- Read the `/home` baseline PNG and the `/home` post PNG.
  - Expected intentional differences: post backdrop is a violet → indigo → blue diagonal gradient; baseline backdrop is a photographic image. Both render behind the same z-10 black-from-top overlay; the title text "WBR 2027", search bar, venue/date pills, quick-link chips, and the 28px bottom curve should be positioned and styled identically.
  - Flag any unintended change (e.g., title text loses legibility, layout shifts, content disappears, the gradient triggers a contrast regression for the search bar or chips) for the dry-run conversation. A flagged change routes to the in-file rollback path documented at `apps/attendee/components/HomeScreen.tsx` (hero render block).
- Read the `/people` baseline PNG and the `/people` post PNG.
  - Expected intentional differences: post version renders the WBR PWA brand mark (`/icons/icon-192.png`) in the 44×44 circular slot at the top of the People view; baseline renders a small scrambled gstatic thumbnail. The pink-outlined glow ring and the surrounding content (search, lists) should be identical.
  - Flag any unintended change (brand mark wrong size, glow ring affected, layout shift, surrounding content broken) for the dry-run conversation. Rollback path: `apps/attendee/components/people/PeopleClient.tsx` (WBR module avatar render).

The dry-run conversation records the outcome of this review out-of-band — there is no committed artifact required for this UAT step beyond the four PNGs themselves.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/attendee/components/HomeScreen.tsx` (hero render block at lines ~701–740).
- `apps/attendee/components/people/PeopleClient.tsx` (WBR-module avatar block around line 561).
- `apps/attendee/next.config.js` `images.remotePatterns` array.
- `packages/db/prisma/seed.ts` (any change that sets `Conference.heroImageUrl` in the seed must re-verify Step 1's "fallback fires when null" precondition).
- `docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs` (the script that drives Steps 1, 2, 3).

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
