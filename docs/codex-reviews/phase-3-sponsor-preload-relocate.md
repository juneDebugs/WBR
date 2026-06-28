# Codex Review Log — Phase 3: Move sponsor `/api/attendees` preload off root layout

**Phase:** 3 (PRD §6 Phase 3)
**Branch:** `phase-3-sponsor-attendees-preload-relocate` off `main` at `2a20823` (post-Phase-4)
**Files under review:**
- `apps/sponsor/app/layout.tsx`
- `apps/sponsor/app/(authenticated)/(portal)/layout.tsx`
- `docs/smoketests/playwright/phase-3-sponsor-preload-relocate.mjs`
- `docs/smoketests/phase-3-sponsor-preload-relocate.md`
- `docs/smoketests/CONTRACT.md` (one-line §1.1 addition)
- `docs/smoketests/runs/phase-3-2026-06-28.md`
- `package.json` + `pnpm-lock.yaml` (Playwright root devDep)

**Process:** N=3 adversarial review cap per PRD §8.2, full cap exercised regardless of early convergence per `feedback_commit_at_end_of_review_cycle`. Subagent: `codex:codex-rescue`. Three rounds run in parallel with differentiated probe sets per the Phase 4 precedent.

---

## Round 1 — Routing-contract correctness + smoketest contract compliance

**Probes:** preload hoisting reliability from a nested App Router layout, fragment wrapper semantic equivalence, route-tree gaps where the preload may need to live elsewhere, `/api/attendees` route-handler side effects, smoketest contract structural compliance (step categorization, deterministic pass criteria, environment tier declaration, summary table + re-run trigger), binary-observable shape for the Playwright-driven contract step.

**Findings:**

- AC-failing: **None.**
- Non-breaking:
  - **R1F1 — Playwright script hard-codes `next-auth.session-token` cookie name.** Sponsor's `/api/login` route emits `__Secure-next-auth.session-token` over HTTPS (Vercel preview Tier-B environment) and `next-auth.session-token` over HTTP (local prod build). The script's authenticated-half assertion will fail against the preview URL even though the smoketest advertises `SPONSOR_BASE_URL` preview support.
  - **R1F2 — Smoketest Tier-C recipe inconsistency.** The smoketest's Tier-C recipe used `git restore --source=HEAD~1` for baseline capture; the in-session run log used `git stash`. The two are reconcilable post-commit but inconsistent for the pre-commit reader and confusable for future re-runners.

**Materiality read:** routing-contract behavior is correct (preload hoists from nested layout per React 19 + Next 15.5.15 documented behavior; fragment wrapper is semantically equivalent; no sponsor route bypasses the authenticated portal layout except `(authenticated)/page.tsx` which only redirects to `/dashboard`). `/api/attendees` route handler is side-effect-free (auth check + cached Prisma `findMany` + JSON response; no audit writes, no session refresh). Smoketest structural shape contract-compliant. Playwright's `Results: 2 passed, 0 failed` + exit 0 is a valid binary observable per CONTRACT.md §1.1.

---

## Round 2 — Reproducibility + jitter + Finding F1 defensibility

**Probes (broader than R1):** fresh-clone reproducibility (Playwright install discoverability, seed credentials availability, sponsor `.env.local` setup gap, Node version requirements), single-run jitter sources (networkidle stability with third-party requests, race between preload + client-side prefetch), Finding F1 methodological defensibility (single-stash baseline scope, finding-protocol order compliance, sufficiency of "routing contract win + regression guard" justification).

**Findings:**

- AC-failing: **None.**
- Non-breaking:
  - **R2A1 — Playwright install not surfaced in README.** `pnpm install` brings in the JS module but the `npx playwright install chromium` step is only mentioned in the smoketest prereqs; a new engineer reading top-level docs won't find it.
  - **R2A3 — Absolute DATABASE_URL workaround was only in the run log.** A relative `DATABASE_URL` in `apps/sponsor/.env.local` caused a 100% CPU hang on `/api/login`. The fix (absolute path) was documented in the run log but not in the smoketest prereqs, so the next fresh-clone runner will hit the same wall.
  - **R2A4 — No `.nvmrc` or `engines.node` constraint** for the Node 20+ requirement (the Playwright script uses `headers.getSetCookie?.()` which is Node 20+ undici). Drift risk for any engineer on an older Node.
  - **R2B3 — No documented retry policy for Playwright Step 2.** Step 3 acknowledges Lighthouse variance with a median-of-3 rule; Step 2 doesn't have an analogue, so a single transient `networkidle` stall would be treated as a contract failure.
  - **R2C1 — Finding F1 framing stronger than data strictly supports.** F1 claims "Phase 4 pre-empted Phase 3's timing AC" based on a single-stash measurement (Phase 3 alone against the post-Phase-4 baseline). The full causal chain (Phase 3 alone against the pre-Phase-4 imagery-bearing baseline) is not separately measured.
- Refuted on closer reading:
  - **R2A2** (seed credentials availability) — `packages/db/prisma/seed.ts` seeds `june@tailor.tech` / `admin123` unconditionally.
  - **R2B1** (networkidle flakiness from cross-origin) — sponsor `/login` has no live external resource loads after Phase 4 (Unsplash imagery commented out).
  - **R2B2** (preload-vs-prefetch race) — the React Query prefetch fires client-side after hydration; the Playwright `>= 1` pass criterion accommodates 1 or 2 requests.
  - **R2C2** (finding-protocol order compliance) — the run log records an explicit Decision step distinct from the Analysis prose.
  - **R2C3** (justification sufficiency) — PRD sprint success criteria do not require a Speed Index delta per Phase; routing-contract correctness is a stated deliverable.

**Fixes applied inline before R3:**
- **R1F1** (cookie name): `docs/smoketests/playwright/phase-3-sponsor-preload-relocate.mjs` — `COOKIE_NAME` now derives from `BASE_URL.startsWith('https://')`, picking `__Secure-next-auth.session-token` for HTTPS and `next-auth.session-token` for HTTP. Comment cites the sponsor `/api/login` route's `isSecure` logic.
- **R1F2** (Tier-C recipe inconsistency): `docs/smoketests/phase-3-sponsor-preload-relocate.md` Tier-C recipe rewritten to use `git stash push -- <files>` + `git stash pop` (matches the Phase 4 precedent + the in-session run log). The `git restore --source=HEAD~1` alternative noted in passing as valid post-commit.
- **R2A3** (DATABASE_URL workaround): smoketest prereqs section now documents the sponsor `.env.local` requirement (NEXTAUTH_SECRET, NEXTAUTH_URL, DATABASE_URL with the **absolute path** requirement called out + the 100% CPU symptom of the relative-path failure mode).
- **R2B3** (Playwright retry policy): smoketest Step 2 now has a "Single-retry policy" paragraph analogous to Step 3's median-of-3 disclaimer — single failure may be re-run once before being treated as a contract failure; second-run consistent failure is the real fail.
- **R2C1** (F1 framing): run log F1 Analysis now contains an explicit "Methodology caveat" paragraph noting that the single-stash measurement isolates Phase 3 against the post-Phase-4 baseline only and that the stricter framing would be "on the current post-Phase-4 baseline, Phase 3's Speed Index contribution is sub-noise — whether the preload alone would have driven the recon's 3.67 s observation is no longer separately verifiable."

**Deferred (scope-out of Phase 3):**
- **R2A1** (README Playwright install note) — README touches are out of scope for this phase. Smoketest prereqs already document it for the immediate runner. A future smoketest-tooling consolidation phase would be the natural place for this surfacing.
- **R2A4** (.nvmrc / engines.node) — repo-wide hygiene, out of scope for Phase 3. The Playwright script's `headers.getSetCookie?.()` call has an optional-chaining guard that returns `undefined` on older Node, which would surface as a clear "cookie not set" error downstream — not a silent fail.

---

## Round 3 — Fresh-read cap

**Probes:** none prompted; cold-read both layout files, Playwright script, smoketest markdown, run log, CONTRACT.md addition, and the PRD/plan amendments for any quality issue. Specific attention to Tailor commit-hook blocklist substring hits (names + customer terms).

**Findings:**

- AC-failing:
  - **R3F2 — Local-only working-directory path reference in committed run log content.** The Tailor commit-msg hook does a naive case-insensitive substring match against committed content; the internal working-docs directory name is on the blocklist (per the prior autopsy incident). The run log's Implementation paragraph referenced two file paths under that directory — would block the commit.
- Refuted:
  - **R3F1** (hardcoded company-name substring as a blocklist hit) — the company-name substring is NOT on the local blocklist (verified directly). The blocklist holds specific customer slugs, employee names, and the user's own name forms plus the internal working-docs directory; the company name itself is excluded. Existing committed files on `main` already use the company-domain email shape.
  - **F3 / SI-AC reframing concern** — explicitly documented in the run log's Finding F1 + reflected in the smoketest pass criteria. Not a new defect.

**Fix applied inline:**
- **R3F2** (path substring): run log Implementation paragraph rewritten to describe the PRD + plan changes as "local-only working artifacts (not part of the committed tree)" instead of naming the working directory. Substring scan re-run after fix confirms zero remaining blocklist hits in any committed-track Phase 3 file.

**Materiality read:** R3's blocklist scan was the highest-value Round 3 catch. R1's two findings + R2's five findings all applied inline. R2 raised three deferred items (README, .nvmrc, retry-policy refinement) that are either out of scope or already adequately covered.

---

## Final convergence verdict

- **Total rounds:** 3 (full cap).
- **Total AC-failing findings:** 1 (R3F2; applied inline pre-commit).
- **Total non-breaking findings:** 7 — 5 applied inline (R1F1, R1F2, R2A3, R2B3, R2C1), 2 deferred (R2A1 README + R2A4 .nvmrc; scope-out of Phase 3 per `feedback_engineering_baseline_not_scope` interpretation as repo-wide hygiene).
- **Unresolved findings:** None on Phase 3 scope. Two deferred items are tracked for future repo-wide hygiene phases.
- **Materiality of deferred findings:** Low — both have inline workarounds or self-surfacing failure modes.

Phase 3 meets the convergence target (zero unresolved AC-failing findings after fixes applied) and the full N=3 cap was exercised. Smoketest at `docs/smoketests/phase-3-sponsor-preload-relocate.md` is the documented manual verification path. The Playwright script at `docs/smoketests/playwright/phase-3-sponsor-preload-relocate.mjs` is the routing-contract verifier (per PRD §8.6) and is committed alongside. In-session run log at `docs/smoketests/runs/phase-3-2026-06-28.md` captures the four-step automation results + Finding F1 + UAT-deferred items.
