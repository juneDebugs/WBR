# Contributing to WBR

This document records the engineering practices used during the 2026-06-22 → 2026-07-06 demo sprint. It is offered as a **starting template** for future WBR engineering work, not as a binding ruleset. Future engineers should keep what fits the work in front of them and revise what doesn't.

The companion agent-facing router lives at [`CLAUDE.md`](CLAUDE.md). Local environment setup, test credentials, and debug surface live in [`README.md`](README.md).

---

## 1. Quickstart

First-clone setup, per-app `.env.local` shape, dev-server invocation, and test credentials all live in [`README.md`](README.md) §Getting Started. This document does not repeat them.

The four apps run on ports 3000–3003 and each loads its own `.env.local` independently — there is no shared loader. The `NEXTAUTH_SECRET` must match across all four for cross-app JWT validity. See [`docs/architecture.md`](docs/architecture.md) for the auth model.

## 2. Branch conventions

We used a per-phase branch shape throughout the sprint:

```
phase-<N>[-<letter>]-<short-kebab-slug>
```

Examples from the sprint: `phase-3-sponsor-attendees-preload-relocate`, `phase-5-attendee-pwa-timeout-split`, `phase-9-admin-server-side-pagination`, `phase-11a-operational-corpus`, `phase-11b-orientation-corpus`.

Why this shape worked:

- The phase number maps 1:1 to a PRD §6 entry, so a stale branch name is self-diagnosing — if `phase-10` carries `phase-11a` content, that means the agent forgot to rename when scope pivoted.
- The kebab slug summarizes the change without leaking customer or employee identifiers (see §3).
- The letter suffix (`11a`, `11b`) lets a multi-PR phase share its number while staying greppable.

Branches are merged via **rebase-and-merge** in the GitHub UI (see §10).

## 3. Commit-msg blocklist

A Tailor-wide hook scans both the staged diff content and the proposed commit message against a customer + employee identifier blocklist before letting the commit land. The hook lives at the developer's local machine; the blocklist is sourced from `~/.config/tailor/customer-blocklist.txt`.

Practical posture used during the sprint:

- **Never `--no-verify`.** If the hook blocks the commit, the right move is to rephrase the content (or sanitize a path reference to "engineer-local, gitignored") and retry — not to bypass the check.
- **Engineer-local scratch directories at the repo root are gitignored by convention** even when not listed in `.gitignore`. Commit by explicit path; never use `git add -A` or `git add .` from the repo root, because that would accidentally stage convention-gitignored content and trip the hook on path-substring matches.
- **The hook is slow on large diffs** (multi-minute on doc-heavy PRs). Budget 9 minutes (`timeout: 540000`) when invoking from an agent shell on a doc PR.
- **Use role labels in committed engineering content**, not personal names: "engineer of record," "project owner," "sponsor," "CTO," etc. The hook enforces this at the boundary; the role-label convention prevents triggering it in the first place.

## 4. Per-phase deliverable shape

Every phase that touched code or docs shipped the same four artifacts in the same PR:

1. **Code or doc change** — the actual implementation.
2. **Smoketest** at `docs/smoketests/phase-<N>-<short-title>.md`, conforming to [`docs/smoketests/CONTRACT.md`](docs/smoketests/CONTRACT.md). See §5.
3. **Codex adversarial review log** at `docs/codex-reviews/phase-<N>-<short-title>.md`, recording the N=3 round-by-round findings + resolutions. See §6.
4. **Doc updates** — if the change altered architecture, runbook, incident-playbook, decisions, or any per-app or per-package README, those updates ship in the same PR. See §7.

Treating these four artifacts as baseline (not optional scope) is what kept the regression library coherent across nine PRs in the sprint.

## 5. Smoketest CONTRACT

The canonical shape rule for smoketests is [`docs/smoketests/CONTRACT.md`](docs/smoketests/CONTRACT.md). This document does not duplicate the rules — refer to it before authoring.

Highlights worth knowing without reading the full CONTRACT:

- **Two step categories.** `[contract]` checks verify functional invariants (works the same as before / doesn't regress); `[perf-bar tier <X>]` checks measure perf in a specified environment (see §8).
- **Pass criteria must be deterministic.** No "looks fast" or "feels smooth" — every step has a numeric threshold or a binary outcome.
- **Start from the template.** [`docs/smoketests/_template.md`](docs/smoketests/_template.md) is the skeleton; copy and fill it rather than authoring from scratch.

When Codex (§6) reviews a phase, it checks smoketest compliance against the CONTRACT as part of its review prompt.

## 6. Codex adversarial review loop

Each PR goes through N=3 rounds of independent adversarial review by Codex (a separate model) before commit.

How it ran during the sprint:

- **N=3 cap.** Even if an earlier round converges to zero findings, the full three rounds run. This is intentional — convergence at round 1 has happened, but the cap exists because round 3 has surfaced downstream-propagation gaps in every phase that included a round 2 fix.
- **Commit at end of cycle.** One commit per PR after all three rounds resolve, not one commit per round. Round-by-round commits create incident-playbook noise without improving signal.
- **AC-failing vs non-breaking.** Findings are classified by Codex into AC-failing (block the merge) and non-breaking (recorded, addressed if cheap, deferred if expensive). The PR cannot merge with open AC-failing findings.
- **Round 4+ supplementary passes are valid on explicit engineer-of-record request only.** Used in Phase 11A to review a post-round-3 architecture diagram addition. Do not invoke silently.
- **Codex review log goes in the same PR.** `docs/codex-reviews/phase-<N>-<short-title>.md` captures the round-by-round shape: findings, classification, resolution.

## 7. Doc-update criterion

If a change alters anything documented in `docs/architecture.md`, `docs/runbook.md`, `docs/incident-playbook.md`, `docs/decisions.md`, an ADR, or a per-app / per-package README — the doc update ships in the same PR.

What this means in practice:

- **A new external runtime dependency** (a new third-party API, a new managed service) is an architecture-diagram + invariants update.
- **A new operational procedure** (a new rotation, a new deploy step) is a runbook addition.
- **A new failure surface** (a new way the system can break that has been observed) is an incident-playbook addition.
- **A decision with a real trade-off** is a `decisions.md` index entry; if it's architectural-grade (hard to reverse, surprising without context), it's also a new ADR in [`docs/adr/`](docs/adr/).
- **A change to per-app behavior** (new key file, new gotcha, new app-specific dev command) is a per-app README edit.

Why this worked: the PRD (engineer-local, gitignored) is the canonical source for sprint-level scope. Doc updates in the same PR keep the committed docs in sync with the canonical scope without drift.

## 8. Four-tier perf environment model

Perf claims (LCP, TBT, route timings, payload sizes) only mean something if they were measured in an environment that resembles production behavior. The sprint used a four-tier model — see [`docs/smoketests/CONTRACT.md`](docs/smoketests/CONTRACT.md) for the full rules.

| Tier | Environment | Use for |
|---|---|---|
| A | Production (Vercel prod deployment, real network, real DB) | The bar of record — what users actually experience |
| B | Vercel preview deployment | Pre-merge gates; full prod-build behavior with preview-environment data |
| C | Local prod build (`pnpm build && pnpm start`) | Local sanity check before opening the PR |
| D | Dev (`pnpm dev`) | **Invalid for perf bars.** LCP and TBT run 10–13× inflated under `next dev`. Numbers are uninterpretable. |

The Lighthouse lantern-model amplification on base64-encoded inline images (see [`docs/adr/0004-base64-images-in-db.md`](docs/adr/0004-base64-images-in-db.md)) compounds the dev-mode distortion. Observed LCP on tier A is the primary acceptance criterion.

## 9. Finding protocol

Mid-phase findings (Codex surfaces a defect, the smoketest fails on an unexpected surface, a code review reveals an invariant violation) follow four steps in order:

1. **Analysis.** Verify the finding against the codebase. Is it real? What is the root cause?
2. **Decision.** Decide the fix shape: in-PR fix, scope-aware deferral, or PRD amendment.
3. **Update PRD + plan.** Amend the engineer-local PRD and sprint plan (both gitignored) before any committed-track file. The PRD is canonical; code without a PRD entry is undocumented engineering history.
4. **Implementation.** Land the fix in the PR.

Never skip step 3. The finding protocol kept the PRD load-bearing throughout the sprint; phases that deviated (none, in practice) would have drifted out of the canonical scope record.

## 10. PR ergonomics

A few small conventions that smoothed the sprint:

- **Rebase-and-merge for single-commit PRs.** The "Rebase and merge" button in the GitHub UI. Not squash; not merge-commit. This kept main's history linear and per-phase greppable.
- **Draft PR first to verify Mermaid render.** Doc PRs that include Mermaid diagrams (system diagram, sequence diagrams) should open as draft first, verify the GitHub renderer accepts the diagram, then mark ready-for-review.
- **PR body fills every section of `.github/PULL_REQUEST_TEMPLATE.md`.** Why / What changed / Validation / Rejected alternatives / Risks and mitigations / AI involvement / Links. The template exists because past PRs that skipped sections cost reviewer time.
- **The `apps/attendee/components/BottomNav.tsx(40,101)` TS2514 error is pre-existing and documented.** First captured in the Phase 1 Codex review log; pre-dates the demo sprint. It is not a regression introduced by your change; do not "fix" it as a side-quest. The build passes because every `next.config.js` sets `typescript.ignoreBuildErrors: true`; run `pnpm typecheck` manually for honest results.

---

## Source documents

Per-sprint canonical scope and plan files live engineer-local (gitignored), so they are not linked from this committed doc. The committed corpus that this document points into:

- [`README.md`](README.md) — Getting Started, test creds, debug, full corpus map
- [`CLAUDE.md`](CLAUDE.md) — agent front door
- [`docs/architecture.md`](docs/architecture.md) — architecture, system diagram, invariants
- [`docs/runbook.md`](docs/runbook.md) — operational procedures
- [`docs/incident-playbook.md`](docs/incident-playbook.md) — Symptom → Check → Cause → Mitigation
- [`docs/decisions.md`](docs/decisions.md) — decisions index
- [`docs/adr/`](docs/adr/) — full ADRs (Nygard format)
- [`docs/smoketests/CONTRACT.md`](docs/smoketests/CONTRACT.md) — smoketest shape rule
- [`docs/smoketests/_template.md`](docs/smoketests/_template.md) — smoketest skeleton
