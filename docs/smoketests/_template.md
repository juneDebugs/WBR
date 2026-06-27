# Phase N Smoketest — <SHORT TITLE>

> **Starting from this template?** Read `docs/smoketests/CONTRACT.md` first. It defines the step categories (contract vs perf-bar), the four perf-bar environment tiers, and the banned-language list. The skeleton below enforces shape, not content — content compliance is on you. Delete this blockquote when filling in.

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`; source: WBR demo sprint PRD §6 Phase N, §8.1.

## What this verifies

- <ONE-LINE CLAIM mapped to a PRD §4 success criterion or §6 Phase N acceptance criterion>
- <ONE-LINE CLAIM mapped to ...>
- <add more lines as needed; every claim below should map to at least one step>

## Prerequisites for the runner

- <ENVIRONMENT REQUIREMENT — e.g., all four apps runnable locally per Phase 0a smoketest>
- <CREDENTIAL OR TOOLING REQUIREMENT — e.g., attendee credentials, Chrome DevTools, lighthouse CLI>
- <ANY SPECIAL ARTIFACT REQUIRED — e.g., production build via `pnpm --filter <app> build && start` for tier-C steps>

## Steps

> Tag each step with one of: `[contract]`, `[perf-bar tier A]`, `[perf-bar tier B]`, `[perf-bar tier C]`. Tier D is never valid for perf-bar. See CONTRACT.md §1.

### Step 1 — <STEP TITLE> [contract]

**Verifies:** <THE BEHAVIORAL CONTRACT THIS STEP CHECKS — what code is supposed to do, what env-agnostic invariant holds>

- [ ] <ACTION THE RUNNER TAKES — concrete, reproducible>
  - **Pass:** <BINARY OBSERVATION — "X event happens in tool Y" / "value X is present in file Y" / "Network panel shows request to URL Z">
  - **Fail:** <BINARY OBSERVATION — the opposite, or the failure shape>

(Repeat the action / pass / fail bullets as needed within the step.)

### Step 2 — <STEP TITLE> [perf-bar tier B]

**Verifies:** <THE QUANTITATIVE PERFORMANCE CLAIM — what number must hold, against what baseline>

**Environment required:** <one of: local prod build (`pnpm --filter <app> build && start`) / Vercel preview URL / production deployment>. Tier D (dev mode) is invalid for this step — see CONTRACT.md §1.2.

```bash
# Exact commands the runner executes — capture cookie, run lighthouse, parse JSON
# Adapt from the Phase 1 recipe at docs/smoketests/phase-1-prefetch-fanout-gate.md §Step 5 + §Step 6.
```

- [ ] <ACTION — run the measurement>
  - **Pass:** <MEASURED VALUE compared to NUMERIC THRESHOLD — e.g., "LCP < 3000 ms" or "TBT ≤ 150 ms" or "transfer size ≤ 250 KB">
  - **Fail:** <MEASURED VALUE crossing the threshold the wrong way>

### Step 3 — <STEP TITLE> [contract or perf-bar tier ?]

(Continue as needed — add as many steps as the phase requires. Every step gets a category tag; every pass criterion is a binary observable or a numeric threshold; no subjective wording.)

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. <TITLE> | contract | anywhere | |
| 2. <TITLE> | perf-bar tier B | Vercel preview | |
| 3. <TITLE> | <category> | <env> | |

## Pass / fail

The phase ships when:
- <CRITERION 1 — e.g., all contract steps PASS on any valid environment>
- <CRITERION 2 — e.g., perf-bar tier B step PASS on the Vercel preview before merge>
- <CRITERION 3 — e.g., tier A step PASS after merge as confirmation>

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- <FILE PATH OR FILE PATTERN — the surface area covered by this smoketest>
- <ANOTHER PATH>

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
