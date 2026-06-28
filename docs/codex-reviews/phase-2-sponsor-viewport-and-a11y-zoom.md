# Codex Adversarial Review — Phase 2 Sponsor Viewport + A11y Zoom Polish

Loop run on 2026-06-28 against branch `phase-2-sponsor-viewport`. Cap N=3 rounds per WBR demo sprint PRD §8.2. Full cap exercised even though Round 2 had no code-level findings, per `feedback_commit_at_end_of_review_cycle.md`.

**Files reviewed:**
- `apps/sponsor/app/layout.tsx`
- `apps/attendee/app/layout.tsx`
- `apps/meetings/app/layout.tsx`
- `docs/smoketests/phase-2-sponsor-viewport-and-a11y-zoom.md`

**Bar applied** (PRD §6 Phase 2 acceptance criteria): AC-failing = a finding that would cause one of the four PRD §6 Phase 2 AC items to fail (sponsor device-width render, attendee+meetings zoom permitted, CLS + tap-targets hold-or-improve, smoketest conforms to CONTRACT.md) OR would introduce a regression in another phase's smoketest. Style / quality / P2 findings reported but non-gating. Default-refute-on-uncertainty was the explicit Codex instruction. Empirical-refutation precedent from Phase 1 R3 + Phase 15 R3 explicitly invoked: Codex was instructed to flag any claim about Next.js framework behavior or browser rendering that would require running code to verify.

---

## Round 1 — 2 AC-failing findings (smoketest only)

Round 1 found zero code-level issues across the three `layout.tsx` files. Both AC-failing findings were smoketest contract / verifiability issues.

- **R1F1 (AC-failing).** Step 4 baseline-capture path was undefined. The smoketest told the runner the sponsor mobile CLS + tap-targets baseline lived in `docs/smoketests/runs/phase-1-2026-06-27.md` "or equivalent" — but the Phase 1 run log records attendee routes only, with no sponsor CLS or tap-targets values. AC #3 ("improve or hold vs. baseline") was unverifiable as-written.
- **R1F2 (AC-failing).** Step 3's optional attendee+meetings visual-comparison block used judgment-call wording — "no visible regression vs. pre-change layout" / "layout change visible" — banned by CONTRACT.md §3 (subjective language).

**Action.**

- For R1F1: rewrote Step 4 so the runner captures the baseline AND post-change measurements as part of the same smoketest run, recorded in `docs/smoketests/runs/phase-2-<date>.md`. The recipe now runs Lighthouse against both `$PREVIEW_BASELINE` (current production / main-branch sponsor URL) and `$PREVIEW_POST` (Phase 2 PR Vercel preview) and emits CLS numericValue + tap-targets score for each. Pass criterion: `post.CLS_numericValue ≤ baseline.CLS_numericValue + 0.01` (tolerates Lighthouse single-run jitter), tap-targets `post.score ≥ baseline.score` with `null` audits treated as hold. Added a single-run-variance disclaimer instructing a re-run-and-median for absolute regressions > 0.05.
- For R1F2: removed the optional visual-comparison block. Reinforced Step 3's remaining sponsor pass criterion with the deterministic `document.documentElement.scrollWidth <= window.innerWidth` JS observable, callable from Safari Web Inspector during the RDM session.

**Codex probes refuted at R1** (durable signal for the audit surface, even when refuted):

1. **Type safety of the typed sponsor `Viewport` export** — refuted. `themeColor` is a valid field on Next.js's `Viewport` type; emission shape is runtime-equivalent to the prior untyped object literal.
2. **PWA standalone regression** — refuted as unconfirmable. The attendee manifest declares `display: 'standalone'` but no separate zoom-locking field compensates for removing `userScalable: false` / `maximumScale: 1`. The PRD-mandated AC explicitly requires the removal, so the tradeoff (iOS standalone-launched attendee now permits pinch-zoom) is intentional, not regressive.
3. **Conflicting raw `<meta name="viewport">` elsewhere** — refuted. Source-only grep across all three app trees finds zero overrides in nested layouts, page-level `head` props, or the meetings `<head>` block.
4. **`viewportFit: 'cover'` interaction with removed scaling restrictions** — refuted. Attendee retains `viewportFit: 'cover'`; the safe-area handling field is independent of zoom-policy fields.
5. **Step 2 curl|grep substring reliability** — refuted. The grep targets only the viewport meta tag (anchored on `<meta name="viewport"`), avoiding CSS inline-style false positives. Next.js 15.5 emits `maximum-scale=1` from numeric `maximumScale: 1`, so the substring check is adequate to detect the removal.

---

## Round 2 — 1 AC-failing + 2 non-breaking

Round 2 broadened the probe set per the established pattern (Phase 1 R2 example). All R1 findings were re-verified resolved, and three new findings surfaced.

- **R2F1 (non-breaking).** Step 2's "Verifies" line contained the descriptive phrase "as expected" — adjacent to the banned-language list in CONTRACT.md §3. Not in a pass criterion, so not AC-failing, but a polish item.
- **R2F2 (AC-failing).** Step 3's authenticated-route example pointed to sponsor `/portal` — which is not a real URL. The sponsor app uses `(portal)` as a Next.js route group (parenthesized, excluded from URL paths). Actual sponsor URLs include `/`, `/browse`, `/dashboard`, `/meetings`, `/profile`, `/schedule`, `/submissions`. A cold runner would 404 on `/portal`.
- **R2F3 (non-breaking).** Step 2 referenced "local prod build" without spelling out the exact command — a cold runner would have to look up the recipe.

**Action.**

- For R2F1: rewrote Step 2's "Verifies" line to "serializes the Viewport export into the served HTML with the expected viewport substrings listed below." Removes the banned-adjacent phrasing while preserving meaning.
- For R2F2: replaced the `/portal` example with `/` or `/dashboard` — both verified real authenticated sponsor routes per the `(authenticated)/(portal)/` directory layout.
- For R2F3: added the exact local-prod build command (`pnpm --filter <app> build && pnpm --filter <app> start`) to Step 2 alongside the dev-mode instruction.

**Codex probes refuted at R2** (broader probe set):

1. **Full banned-phrase scan** — refuted except for "as expected" (reported as R2F1 non-breaking). All four steps consistently tagged `[contract]` or `[perf-bar tier B]`; no Tier D path; summary table matches step tags.
2. **CLS +0.01 tolerance correctness** — refuted as a finding. Codex could not produce an empirical basis to recommend a different threshold from Lighthouse source / run logs; the 0.01 number stands per the default-refute-on-uncertainty instruction.
3. **Baseline URL recoverability post-merge** — refuted as a finding. Codex could not verify Vercel CLI listing behavior from the local file content. The smoketest is implicitly pre-merge (Tier B = Vercel preview); if Phase 2 lands and the baseline URL becomes unreachable, the Phase 13 perf delta report covers the post-merge verification gap.
4. **Step 2 grep reliability re-probe** — refuted. Next.js's `basic.js` emits `ViewportMetaKeys` in a fixed order with `width` ahead of `initial-scale`, making the `width=device-width` substring reliable. (Codex's claim verifiable by reading Next.js source; matches Phase 15 R3 empirical refutation precedent for static framework-behavior claims.)
5. **PWA standalone product-rationale re-probe** — refuted. No code comment, changelog entry, or doc anchor near the original `userScalable: false` / `maximumScale: 1` lines documents an intentional product reason for the prior zoom lock. The removal is unambiguously a PRD-mandated a11y win.
6. **Sponsor `.next` build cache contamination** — refuted. Step 2 targets `curl localhost:<port>` against a running server; Next.js dev mode invalidates the cache and `next build` overwrites it. The stale `apps/attendee/.next/server/app/*.html` files in the local build cache do not affect the smoketest path.
7. **`Viewport` typed export side-effects** — refuted. Next.js's `Viewport` type accepts `width`, `initialScale`, and `themeColor`; property emission order is governed by Next.js's `ViewportMetaKeys` constants, not by object property order.

---

## Round 3 (cap) — 0 AC-failing + 1 non-breaking

Round 3 was run as a full re-read from scratch despite Round 2 convergence on code, per the cap-always-runs rule. The probe set was the broadest yet: full-file fresh read of smoketest + three layout.tsx files, end-to-end runnability dry-run, PR-readiness check, doc-update criterion (PRD §8.4) check, and empirical-refutation reminder.

- **R3F1 (non-breaking).** Step 3 pass/fail wording contained "appears" — adjacent to CONTRACT.md §3 banned-language territory. The criterion is still deterministic because it is backed by the `document.documentElement.scrollWidth <= window.innerWidth` JS observable, so this is not AC-failing.

**Action.**

- For R3F1: replaced "appears" with "is present" in both the Pass and Fail clauses of Step 3. The JS observable backing remains intact; the wording is now neutrally aligned with the banned-phrase list's spirit.

**Codex probes refuted at R3** (cap-round broadest pass):

1. **Full banned-phrase scan** — refuted for AC failure. All four steps still consistently tagged `[contract]` or `[perf-bar tier B]`; summary table consistent; no Tier D path. Only the non-breaking "appears" wording surfaced (R3F1).
2. **Full layout.tsx fresh read** — refuted. Sponsor imports `Viewport`, exports `width` / `initialScale` / `themeColor` cleanly, zero `userScalable` / `maximumScale` residue. Attendee and meetings have both fields removed with no `user-scalable` / `maximum-scale` strings anywhere in the files.
3. **End-to-end runnability dry-run** — refuted. A cold AI agent or human can execute all four steps from the smoketest text alone; commands, ports, routes, credentials, and pass criteria are stated without requiring prior context.
4. **PRD §8.4 doc-update criterion** — refuted. Viewport meta and zoom-policy edits do not change data flow, API surface, schema, auth model, or run/debug procedures, so no `architecture.md` / `runbook.md` update is triggered for Phase 2.
5. **Empirical-refutation posture** — refuted as a source of AC failures. Next.js serialization claims and browser rendering claims are appropriately deferred to Steps 2 and 3 empirical verification by the runner.

---

## Convergence

**CONVERGED at Round 3 with zero AC-failing findings remaining.** All R1, R2, and R3 findings were applied inline before commit. The full N=3 cap was exercised per the sprint's standing rule.

Phase 2 implementation (sponsor, attendee, meetings `layout.tsx`) and the Phase 2 smoketest (`docs/smoketests/phase-2-sponsor-viewport-and-a11y-zoom.md`) meet PRD §6 Phase 2 acceptance criteria pending runner execution of:

- Step 3 (Safari Responsive Design Mode iOS 15+ render) on the Phase 2 Vercel preview.
- Step 4 (sponsor mobile Lighthouse CLS + tap-targets, baseline + post) on the Phase 2 Vercel preview, with the run log committed at `docs/smoketests/runs/phase-2-<date>.md`.

The real-iOS device check is documented as an optional pre-demo sanity, not gating, per the user's direction to lean on Safari RDM as the primary automation-feasible verification path.

## Pre-existing typecheck note (not introduced by Phase 2)

`apps/attendee/components/BottomNav.tsx(40,101): error TS2514: A tuple type cannot be indexed with a negative value.` is present on `main` prior to this branch (documented in `docs/codex-reviews/phase-1-prefetch-fanout-gate.md` §"Pre-existing typecheck note"). Per PRD §3 non-goals, TypeScript build-quality enforcement is out of scope for this sprint. Phase 2's `pnpm --filter sponsor typecheck` and `pnpm --filter meetings typecheck` both pass clean; `pnpm --filter attendee typecheck` reports only the pre-existing error.
