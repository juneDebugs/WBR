# Smoketest Contract

This document is the **shape rule** for every per-phase smoketest in the WBR demo sprint. It sits alongside PRD §8.1 (which says smoketests exist and what shape they take) and adds the constraint missing from the PRD: **pass criteria must be deterministic, and the verification environment must match what's being verified**.

Applies to every phase's smoketest under `docs/smoketests/phase-N-<short-title>.md`. Phases 0a and 0b were authored before this contract existed; their smoketests are valid for the contract checks they perform but should be reviewed against §"Step categorization" below before being cited as regression checks for later phases.

---

## 1. Two categories of step

Every smoketest step falls into exactly one of these categories. The step must declare its category in the heading.

### 1.1 Contract check (env-agnostic)

A **contract check** verifies a behavioral contract that depends only on code, not on the environment the code runs in. Examples:

- React Query cache mechanics — does navigating to a route with prefetched data avoid issuing a new `/api/data/*` request? The cache lookup logic is the same in dev and prod.
- React Query `staleTime` semantics — does the cache return stored data within the stale window, then refetch on the next mount past it? Same code, same outcome.
- Auth gating — does the middleware redirect an unauthenticated user to `/login`? Same code, same outcome.
- Effect cleanup — does unmounting a component cancel an in-flight idle callback? Same code, same outcome.

**Where contract checks may run:** anywhere. Local dev server is fine. The verification's validity does not depend on environment fidelity.

**How contract checks may be driven:** by hand (DevTools Network panel, console logs, source greps) OR by a Playwright script per PRD §8.6. Playwright is the *runner*, not a new step category — pass criteria remain binary observables. Per-phase Playwright applicability is decided in PRD §8.6; scripts live at `docs/smoketests/playwright/phase-N-<short-title>.mjs`.

**Pass criterion shape:** binary observable event. Either a request fires or it doesn't; a redirect happens or it doesn't; a cleanup function runs or it doesn't. Pass criteria must NOT use subjective language ("feels fast", "renders instantly", "no jank"). If the criterion isn't expressible as "X happens" / "X does not happen" in a deterministic observation tool (DevTools Network panel, console logs, React Query DevTools, etc.), it's not a valid contract-check pass criterion.

### 1.2 Perf-bar check (env-specific)

A **perf-bar check** verifies a quantitative performance claim — an LCP target, a TBT bound, a payload budget. These depend on the JS bundle being production-built (minified, tree-shaken, no dev runtime), the database being the production replica, and the network being real (or realistically simulated).

**Where perf-bar checks may run, in order of fidelity:**

| Tier | Environment | Use when |
|---|---|---|
| **A — production deploy** | Vercel production deployment, real Turso, real CDN | Confirming AC after merge (PRD §6 Phase 7 mechanics). The empirical bar. |
| **B — Vercel preview deploy** | Vercel preview deployment for the PR | Pre-merge verification. Same build pipeline + same env as production; only the URL is per-branch. Recommended pre-merge gate. |
| **C — local production build** | `pnpm --filter <app> build && pnpm --filter <app> start`, local DB | Pre-push smoke. Catches build errors + lets you Lighthouse the production-mode bundle locally. JS bundle = prod. Network = local (you must simulate slow-4G via Lighthouse throttling flags). DB = local SQLite. |
| **D — local dev mode** | `pnpm --filter <app> dev` | **Not valid for perf-bar checks.** Dev-mode JS inflates LCP / TBT by an order of magnitude. Lighthouse numbers from dev mode are uninterpretable. |

**Pass criterion shape:** a numeric threshold from the PRD (e.g., "LCP < 3 s", "TBT ≤ 100 ms baseline"). Pass when the measured value meets the threshold.

**Vercel preview Lighthouse — the practical pre-merge gate.** Every PR to `main` produces a Vercel preview URL (look up the URL via `gh pr view <number> --json statusCheckRollup` or the PR's check list). Run Lighthouse against that URL with the production session cookie and mobile throttling — this is Tier B verification and is the most reliable pre-merge AC check.

---

## 2. Required smoketest structure

Every per-phase smoketest must:

1. Open with a "What this verifies" header listing each verification in plain language, mapped to the PRD AC items.
2. Tag each step with its category — `### Step N — <title> [contract]` or `### Step N — <title> [perf-bar tier B]`.
3. State each step's pass criterion as a deterministic observable. Subjective language is banned.
4. Surface the run-environment explicitly in each perf-bar step (dev / local-prod / preview / production). Mismatch between perf-bar tier and AC expectation is a smoketest defect — flag it in review.
5. Include a final summary table tying each step to its category + pass status + tier, so the human runner can see at a glance what was verified where.

---

## 3. Banned language

These phrases are not valid pass criteria:

- "Feels fast / responsive / snappy"
- "Renders instantly"
- "No perceptible delay"
- "Flashes for less than a frame"
- "Snappy navigation"
- Any other phrasing that asks the runner to make a subjective judgment.

Allowed substitutions (binary, observable):

- Instead of "feels fast" → "Lighthouse LCP < `<threshold>` ms" (perf-bar) or "no fresh `<URL>` request in Network panel" (contract).
- Instead of "renders instantly" → "page reaches `interactive` state within `<X>` ms per Lighthouse" or "no new request fires in Network panel during navigation."
- Instead of "no perceptible delay" → "interaction-to-next-paint < `<X>` ms per DevTools Performance recording."

---

## 4. Common pitfalls (caught while authoring Phase 1)

| Pitfall | Symptom | Fix |
|---|---|---|
| Running Lighthouse against `pnpm dev` | LCP / TBT 10–13× inflated; numbers uninterpretable | Use local-prod build (`pnpm build && pnpm start`) or Vercel preview |
| Subjective pass language | "Feels fast" / "skeletons flash" — runner can't be sure | Rewrite to binary observable; see §3 |
| Verifying perf claims on dev | False pass when prod-mode build behaves differently | Move to perf-bar tier B or C; never tier D |
| Using SPA-nav for cold-load verification | Document's `load` event already fired on a prior route; gate doesn't engage | Hard-reload (`Cmd+R`) to force a fresh document load, OR pre-set the session cookie and load the target URL directly |
| Single-tier "production Lighthouse" gate | Verification deferred entirely until post-merge; merge ships blind | Add Tier B (Vercel preview Lighthouse) as the pre-merge gate; Tier A confirms post-merge |

---

## 5. Re-categorization of existing smoketest content

Where an existing step's pass criterion is subjective, treat the smoketest as defective and rewrite the step before citing it as a regression check for later phases. The corpus is small enough today (Phase 0a + Phase 1) that retroactive cleanup is cheap.

---

## 6. Cross-references

- PRD §8.1 — "Per-phase smoketest" (canonical for the requirement that every phase ships a smoketest).
- PRD §8.5 — Verification posture for §6 Phase 0 docs (architectural-fidelity bar + executable run/debug instructions).
- `docs/codex-reviews/phase-1-prefetch-fanout-gate.md` — first phase to exercise the contract; Round 3 + materiality read surface the pre-merge / post-merge gap that motivated this doc.
