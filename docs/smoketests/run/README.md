# `docs/smoketests/run/` — automated second-opinion smoketest runners

## What this is

Per-phase entrypoints (`phase-N.mjs`) that chain a phase's smoketest into a single deterministic command:

1. Contract-tier source-tree greps (Step 1 of the smoketest md).
2. The phase's Playwright contract (Step 2 of the smoketest md).
3. Tier-C perf-bar Lighthouse runs (Step 3 — local prod build, cookie-injected when the route is auth-gated).

Pass/fail is captured to a run log at `docs/smoketests/runs/phase-N-<date>-independent.md`, with the same shape as the primary human-driven run log (`docs/smoketests/runs/phase-N-<date>.md`). Exit code is `0` if all checks pass and `1` otherwise.

## Why it exists

The "second-opinion" pattern Phases 3 and 4 established (`docs/smoketests/runs/phase-3-<date>-independent.md`, `phase-4-<date>-independent.md`) — a second agent runs the smoketest in a clean environment and produces their own verdict. Differences between the primary and independent runs surface:

- **Stale-state issues.** A primary runner's local DB or `node_modules` may carry leftover seed data that masks a contract gap. Codex R1 caught exactly this on Phase 9: the local DB had 91 SPEAKER-role User rows from a prior seed iteration, but a fresh-clone seed produces zero — the SPEAKER filter assertion would fail in a clean env.
- **Eyeball misreads.** Lighthouse JSON has dozens of fields. Scripted threshold parsing (`finalDisplayedUrl`, `total-byte-weight`, `observed-lcp`) is more reliable than human pattern-matching.
- **Machine-specific timing noise.** JIT cold-start, disk I/O contention, and CPU throttling vary across machines. A second run on a different machine widens the sample.

These runners ARE the script form the second agent runs.

## What's covered + what's not

| Smoketest step | Coverage in the runner | Why |
|---|---|---|
| Step 1 — source greps (contract) | ✓ fully covered | Deterministic, env-agnostic. |
| Step 2 — Playwright contract | ✓ fully covered | Already a script; the runner spawns it. |
| Step 3 — Tier-C perf-bar Lighthouse | ✓ fully covered | Local prod build + cookie capture + threshold parsing all scriptable. |
| Step 4 — Tier-B Vercel preview Lighthouse | ✗ **not covered** | Preview URL + deployment-protection bypass token are PR-time inputs. The runner can be parameterized via env vars to target a preview, but auto-discovering the URL requires `gh pr view --json` + Vercel API plumbing heavier than the win. |
| Step 5 — Tier-B no-regression on other admin routes | ✗ **not covered** | Same Tier-B constraint as Step 4. |
| Real-device steps (Phase 2 iOS, Phase 14 iOS) | ✗ **not covered** | Real devices live outside this process. |
| Visual-diff steps (Phase 14 stash-baseline screenshots) | ⚠ partially covered | Screenshot capture is scriptable; multimodal visual identity review is not, by design — the human (or a Claude session with vision) reads both PNGs. |

For Tier-B / real-device / visual-diff steps, the PR's Vercel preview check + the dry-run pass remain the second-opinion venues.

## File layout

```
docs/smoketests/run/
  README.md          ← this file
  phase-9.mjs        ← Phase 9 entrypoint (the one-command runner)
  _lib/
    server.mjs       ← detect / start / stop `next start` on a port
    auth.mjs         ← POST /api/login, extract NextAuth session cookie
    checks.mjs       ← runGrep + runPlaywright (contract-check wrappers)
    lighthouse.mjs   ← run Lighthouse with cookie + finalDisplayedUrl + thresholds
    report.mjs       ← console summary + markdown run-log writer
```

## How to use it

Per Phase 9:

```bash
# 1. Build the app (the runner does NOT rebuild — it starts the existing build).
pnpm --filter web build

# 2. Make sure apps/web/.env.local has DATABASE_URL (absolute path),
#    NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3010. See the phase
#    smoketest md prereqs.

# 3. Run the entrypoint.
node docs/smoketests/run/phase-9.mjs

# Custom port:
PORT=3015 node docs/smoketests/run/phase-9.mjs

# Different admin user:
WEB_EMAIL=admin@example.com WEB_PASSWORD=… node docs/smoketests/run/phase-9.mjs
```

Output:
- Live progress on stdout (per-step ✓/✗ with per-check actual vs expected).
- A markdown run log at `docs/smoketests/runs/phase-9-<date>-independent.md`.
- Exit code `0` on full pass, `1` otherwise.

## Template for a new phase entrypoint

A new phase's `phase-N.mjs` is ~80 lines wiring the shared helpers:

```js
#!/usr/bin/env node
import { ensureServer } from './_lib/server.mjs'
import { captureSessionCookie } from './_lib/auth.mjs'
import { runGrep, runPlaywright } from './_lib/checks.mjs'
import { runLighthouse } from './_lib/lighthouse.mjs'
import { summarize, writeRunLog } from './_lib/report.mjs'

const PORT = parseInt(process.env.PORT ?? '<phase-port>', 10)
const BASE = `http://localhost:${PORT}`
const results = []
const startedAt = new Date()

// Step 1 — greps for source-tree contracts.
for (const check of [
  { cmd: '...', expect: 0 | '>=N' | '>N', label: '...' },
  // ...
]) {
  results.push(await runGrep(check))
}

// Bring up the prod build if needed.
const server = await ensureServer({ app: '<app>', port: PORT })
try {
  // Step 2 — Playwright contract.
  results.push(await runPlaywright({
    script: 'docs/smoketests/playwright/phase-N-<title>.mjs',
    env: { <APP>_BASE_URL: BASE },
  }))

  // Step 3 — Tier-C Lighthouse (skip if the phase has no perf-bar Tier-C step).
  const cookie = await captureSessionCookie({ baseUrl: BASE, email, password })
  const lh = await runLighthouse({
    url: `${BASE}/<route>`,
    cookie,                                  // omit for anonymous routes
    expectedUrl: `${BASE}/<route>`,          // catches silent-redirect-to-/login
    thresholds: { '<audit-key>': { max: N } },
  })
  results.push({ type: 'lighthouse', label: '...', /* ... */ pass: lh.pass, audits: lh.audits, /* ... */ })
} finally {
  if (server.started) await server.stop()
}

const { failed } = summarize(results)
await writeRunLog(`docs/smoketests/runs/phase-N-${startedAt.toISOString().split('T')[0]}-independent.md`, results, {
  phase: 'Phase N', date: startedAt.toISOString().split('T')[0],
  tier: 'C (local prod build)', branch: '<branch-name>', entrypoint: 'phase-N.mjs',
})
process.exit(failed > 0 ? 1 : 0)
```

## When to adopt for a phase

Adopt the runner when the phase's smoketest md contains:

- **Grep checks** worth re-running on every code change in the affected files (Phases 1, 3, 4, 5, 9, 14, 15 all do).
- **A Playwright contract** that's already a script (Phases 3, 5, 9, 14 — per PRD §8.6 applicability table).
- **A Tier-C perf-bar Lighthouse step** with a deterministic numeric threshold (Phases 1, 3, 4, 9, 14).

Phases without one of those three shapes can skip the runner entirely or adopt only the grep half:

- **Phase 2 (sponsor viewport, attendee/meetings a11y zoom)** — real-device only. Skip.
- **Phase 0a / 0b (foundation + operational docs)** — doc fidelity. Adopt only grep checks (existence of headings, executable code-block syntax checks).
- **Phase 13 (perf delta report)** — the deliverable IS the report; running the runner would be circular. Skip.

## Pre-existing-but-load-bearing notes

- **Tier B Vercel preview is the binding perf-bar gate per PRD §4 amendment.** The Tier-C runs the entrypoint produces are pre-push smoke; the PR's preview check remains the second-opinion venue for observed-LCP claims.
- **Median-of-3 not built in.** Single-run Lighthouse can wobble ±200 ms on cold-start-sensitive routes (per Phase 5 finding). For routes in that regime, run the entrypoint two more times manually and take the median. The thresholds in each `phase-N.mjs` carry an implicit ±200 ms buffer per the Phase 5 disclaimer.
- **No CI integration.** PRD §3 non-goals explicitly exclude CI gates this sprint. These runners are tools, not gates. A downstream phase could wire them into a GitHub Actions workflow without changing the runner shape.
