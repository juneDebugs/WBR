# Phase 3 Smoketest Run — 2026-06-28 (independent comparison artifact)

Independent run of `docs/smoketests/phase-3-sponsor-preload-relocate.md` against branch `phase-3-sponsor-attendees-preload-relocate` (uncommitted at run time; staged for commit). Captured AFTER the original run log at `docs/smoketests/runs/phase-3-2026-06-28.md` but with fresh Playwright invocation + fresh Lighthouse JSON outputs (new file paths) so the two runs sit as parallel data points for comparison against a human runner's eventual hands-on pass.

**Independence discipline:** captured observed values straight to the artifact in the order they were produced. No back-editing to match the existing run log. Variance noted where present.

## Capability map for in-session

Re-stated up front so each step's result includes its capability tier:

- **Fully runnable in-session, no caveats:** Step 1 (source greps), Step 2 (Playwright routing-contract via headless chromium + sponsor `/api/login` POST + cookie injection), Step 3 Tier-C Lighthouse mobile Speed Index with `git stash` baseline-capture.
- **Partially runnable in-session:** none for Phase 3. The PRD §8.6 Playwright route closes the gap that existed in Phase 4 — the routing-contract observable IS the headless-Chromium-driven check, fully scriptable.
- **Not runnable in-session:** Step 2 against Tier-B Vercel preview URL (the PR branch is not yet pushed; `git push` is in user deny rules). Step 3 Tier-B Vercel preview Lighthouse (same reason). Hands-on DevTools Network panel observations on both unauth and auth paths — these are the human counterpart to the Playwright assertion and batch into the sprint UAT round.

## Environment for this run

- Local clone on branch `phase-3-sponsor-attendees-preload-relocate`, off `main` at `2a20823` (Phase 4 merged). Phase 3 changes staged but not yet committed at run time.
- Sponsor served via local production build (`pnpm --filter sponsor build && pnpm --filter sponsor start`) on port 3003.
- POST measurement: built + ran the staged working tree state (Phase 3 applied).
- BASELINE measurement: `git stash push -- apps/sponsor/app/layout.tsx apps/sponsor/app/(authenticated)/(portal)/layout.tsx` to put the two layout files back to the pre-Phase-3 state without touching the rest of the working tree. Rebuilt + restarted server. Re-measured. `git stash pop` + `git add` to restore the staged state for the pending commit.
- `apps/sponsor/.env.local` retained from the prior run (NEXTAUTH_SECRET, NEXTAUTH_URL, absolute `DATABASE_URL` pointing at `packages/db/prisma/dev.db`). Gitignored.
- Lighthouse JSON outputs written to `/tmp/lh-sponsor-{POST,BASELINE}-independent.json` (suffix `-independent` keeps them distinct from the prior run's `/tmp/lh-sponsor-{POST,BASELINE}.json` files).

## Step 1 — Code-level inspection [contract]

Result: **PASS**.

Observed (after capturing, not before):

| File | `rel="preload" href="/api/attendees"` count |
|---|---|
| `apps/sponsor/app/layout.tsx` | 0 |
| `apps/sponsor/app/(authenticated)/(portal)/layout.tsx` | 1 |

Both counts match the documented Pass criteria. Identical to the prior run log (counts are line-level grep against deterministic source content).

## Step 2 — Playwright routing-contract verification [contract]

Result: **PASS** (both halves).

Fresh script invocation: `node docs/smoketests/playwright/phase-3-sponsor-preload-relocate.mjs`. Output captured verbatim:

```
[Phase 3] Sponsor preload routing contract @ http://localhost:3003

── Step 1: unauthenticated /login fires zero /api/attendees ──
  ✓ /login emitted 0 /api/attendees requests

── Step 2: authenticated /dashboard fires ≥ 1 /api/attendees ──
  ✓ /dashboard emitted 1 /api/attendees request(s)

────────────────────────────────────────────────────────────
  Results: 2 passed, 0 failed
```

Exit code 0. Both halves of the routing contract verified on a fresh chromium launch: unauthenticated `/login` emits zero `/api/attendees` requests; authenticated `/dashboard` (with the seeded sponsor session cookie injected via `context.addCookies()`) emits exactly one. Identical assertion outcomes to the prior run log (the script is deterministic given a healthy sponsor server + correct `.env.local`).

## Step 3 — Lighthouse mobile Speed Index [perf-bar tier C]

Result: **PASS** (direction matches AC; magnitude sub-noise — see Finding F1 in the prior run log; this independent run reproduces the same sub-noise direction).

Measured Tier-C local production build using the `git stash push -- <two layout files>` pattern for baseline capture. Lighthouse mobile profile, performance category only. Two fresh runs (BASELINE + POST), distinct JSON output files.

Captured fresh on this independent run:

| Audit | BASELINE (pre-Phase-3, post-Phase-4) | POST (Phase 3 applied) | Delta |
|---|---|---|---|
| `speed-index` numericValue (ms) | 767.12 | 763.74 | **−3.38 ms** |
| `speed-index` displayValue | 0.8 s | 0.8 s | — |
| `largest-contentful-paint` numericValue (ms) | 1727.68 | 1725.60 | −2.08 ms |
| `total-blocking-time` numericValue (ms) | 1 | 5 | +4 ms (noise) |

Pass per the smoketest's Step 3 criterion: `post.speed_index_ms (763.74) <= baseline.speed_index_ms (767.12) + 200 = 967.12` → TRUE. The 3.38 ms delta sits well inside the ±200 ms tolerance and within the ~5–10% single-run Lighthouse variance window. Direction matches the AC; magnitude is sub-noise on the post-Phase-4 baseline (consistent with the prior run's read).

## Comparison vs the existing run log

The existing run log at `docs/smoketests/runs/phase-3-2026-06-28.md` captured Lighthouse measurements earlier in the same session. This run's measurements vs that one's:

| Metric | Existing run log (ms) | This independent run (ms) | Absolute delta (ms) |
|---|---|---|---|
| Sponsor `/login` BASELINE speed-index | 767.91 | 767.12 | −0.79 |
| Sponsor `/login` POST speed-index | 763.31 | 763.74 | +0.43 |
| Sponsor `/login` BASELINE LCP | 1876.86 | 1727.68 | −149.18 |
| Sponsor `/login` POST LCP | 1720.97 | 1725.60 | +4.63 |
| Sponsor `/login` BASELINE TBT | 0 | 1 | +1 |
| Sponsor `/login` POST TBT | 1 | 5 | +4 |

**Variance read:**

- **Speed Index is exceptionally reproducible** on this static unauthenticated page — both BASELINE and POST measurements agree to within ±1 ms across two independent Lighthouse runs. The Step 3 AC threshold (±200 ms tolerance) carries ~3 orders of magnitude of headroom over observed single-run variance for this audit.
- **LCP shows higher variance** — BASELINE measurements differ by ~149 ms (~8%), consistent with the ~5–10% LCP variance noted in `docs/smoketests/CONTRACT.md`. POST LCPs agree to within ~5 ms. The BASELINE LCP spread is the largest single observable in this comparison; if a phase ever names an LCP threshold in the sub-200ms-delta range, it must use a median-of-3 read, not single-run.
- **TBT is near zero on this page** (it's an unauthenticated static prerender); the 4 ms drift on POST is below any meaningful precision.
- **Phase 3 timing contribution is reproducibly sub-noise.** Across two independent runs against the same post-Phase-4 baseline, the Speed Index POST−BASELINE delta is consistent in direction (negative, i.e., improvement) but bounded in magnitude well below variance. This corroborates Finding F1 in the prior run log: Phase 4's imagery strip pre-empted the timing AC; Phase 3 ships for the routing-contract win.

The two independent runs corroborate each other on Speed Index to single-millisecond precision, on the routing contract (both halves pass identically), and on the Step 1 source-grep counts.

## Step summary (this independent run)

| Step | Category | Environment | Status |
|---|---|---|---|
| 1. Code-level inspection | contract | source files | PASS |
| 2. Playwright routing-contract | contract (Playwright per §8.6) | local prod build (Tier C) | PASS (both halves) |
| 3. Lighthouse mobile Speed Index | perf-bar tier C | local prod build with git-stash baseline | PASS (direction; sub-noise magnitude per F1) |

## Net read (independent)

The Phase 3 contract verifies cleanly across two independent automated passes. The routing contract (zero `/api/attendees` on `/login`, ≥1 on `/dashboard`) holds deterministically — both halves of the Playwright assertion fire identically on each run. The Speed Index measurement reproduces to within ±1 ms, which is well below the smoketest's variance disclaimer. Finding F1 from the prior run log is empirically supported: Phase 3's timing contribution is sub-noise on the current post-Phase-4 baseline.

A human runner following the smoketest end-to-end would PASS the same contract checks I confirmed, would PASS the perf-bar Tier-C step (reproducibility variance below ±1 ms for Speed Index per this comparison), and would additionally execute the UAT items by hand — those are the steps where the human run materially adds signal over this independent run:

- **UAT-1 / UAT-2:** Tier-B Vercel preview verification — requires the PR to be pushed.
- **UAT-3 / UAT-4:** Hands-on DevTools Network panel observation on both `/login` (unauth) and `/dashboard` (auth) — the real-browser counterpart to the Playwright assertion.
