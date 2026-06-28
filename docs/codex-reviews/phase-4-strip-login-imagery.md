# Codex Review Log — Phase 4: Strip login background imagery on meetings + sponsor

**Phase:** 4 (PRD §6 Phase 4)
**Branch:** `phase-4-strip-login-imagery` off `main` at `b15be68`
**Files under review:**
- `apps/meetings/app/login/page.tsx`
- `apps/sponsor/app/login/page.tsx`
- `docs/smoketests/phase-4-strip-login-imagery.md`

**Process:** N=3 adversarial review cap per PRD §8.2, full cap exercised regardless of early convergence per `feedback_commit_at_end_of_review_cycle`. Subagent: `codex:codex-rescue`. Default-refute-on-uncertainty enforced across all rounds.

---

## Round 1 — Phase-specific failure modes

**Probes:** visual regression on stripped imagery (T1 risk), gradient backdrop cross-browser safety, login form layout robustness, sponsor AC #2 interpretation, smoketest contract compliance, Step 1 grep recipe correctness, Step 4 Lighthouse audit ID correctness (`total-byte-weight`), Tier-C `git stash` baseline recipe, re-run trigger completeness.

**Findings:**
- AC-failing: **None.**
- Non-breaking: **None.**

**Materiality read:** zero confirmed findings. Code change preserves `slides` arrays + commented `<img>` blocks, grep counts match files, mobile form layout independent of lg-only imagery panel, smoketest shape contract-compliant. Sponsor Step 4 interpretation is faithful to PRD "toward ≤ 250KB" wording with Phase 3 contributing additively. No inline fixes needed before R2.

---

## Round 2 — Broader probes

**Probes (broader than R1):** JSX comment parsing edge cases (template literal interpolation inside `{/* */}`, internal `*/` substrings), dead-code surface (`currentSlide` / interval / `nextSlide` after imagery removal), JS bundle size impact (residual `slides` URL strings), other login pages in monorepo (`apps/attendee/app/login/page.tsx`, `apps/web/app/login/page.tsx`, anything else), service-worker cache invalidation on meetings + sponsor, visual carry-over of text-rotation block without imagery context, re-enablement comment specificity, smoketest Step 3 carousel-interval observability, smoketest Step 4 sponsor pass-criterion arithmetic, PRD/Plan amendment consistency.

**Findings:**

- AC-failing: **None.**

- Non-breaking:
  - **R2F1 — Sponsor Lighthouse delta threshold is looser than the stated image budget.** The smoketest names a ≈ 428 KB image budget but passes sponsor with `≥ 350 * 1024` bytes (≈ 350 KB), leaving the 78 KB gap unexplained. Materiality: medium. Suggested fix: explain inline why 350 KB is the conservative floor below the 428 KB headline.
  - **R2F2 — Re-enablement comment omits the documented follow-up path.** The in-source comment explained the disable + preservation but did not point a future engineer to the PRD §6 Phase 4 follow-up (optimized local copies of the imagery). Materiality: low. Suggested fix: add a short pointer in the code comment.

**Fixes applied inline before R3:**
- **R2F1:** updated `docs/smoketests/phase-4-strip-login-imagery.md` Step 4 sponsor Pass criterion to document the 350 KB threshold rationale — conservative floor below the 428 KB headline absorbing Lighthouse `total-byte-weight` single-run jitter (~10–20 KB typical) plus per-image-CDN-response variance from Unsplash.
- **R2F2:** updated both `apps/meetings/app/login/page.tsx` and `apps/sponsor/app/login/page.tsx` comment to read "Before re-enabling, see PRD §6 Phase 4 follow-up: prefer optimized local copies (WebP, responsive sizes, lazy loading) over the original Unsplash hot-links."

**Materiality read:** no AC-failing issues. JSX comment well-formed (no internal `*/`; template `${...}` is comment body, not evaluated). Only login pages under `apps/` are attendee + sponsor + meetings; `apps/web/app/login/page.tsx` does not exist; attendee login page has no Unsplash imagery. Meetings + sponsor configs show no service-worker caching references. Both R2 findings applied inline.

---

## Round 3 — Fresh-read convergence check

**Probes:** fresh-read both changed files for JSX well-formedness, fresh-read smoketest for grep recipe correctness + curl port assignments + Lighthouse audit ID currency + sponsor threshold rationale coherence, empirical refutation of R1 + R2 findings, PRD/plan amendment fidelity, explicit `<img` count check per file (expected 1), re-run trigger file list completeness, Next.js production-build sanity for the multi-line JSX expression comment shape.

**Findings:**
- AC-failing: **None.**
- Non-breaking: **None.**

**Convergence read:** review converged. R2's two items refuted by current content (sponsor Lighthouse rationale now inline; both source comments point at PRD §6 Phase 4 follow-up). JSX well-formed; `<img>` block inside `{/* ... */}` in both files; `slides` + text rotation + `currentSlide` + dot setters intact. Step 1 counts confirmed (`images.unsplash.com` = 3 per file, `<img` = 1 per file, commented-block `<img` = 1 per file). Package scripts confirm meetings port 3002 + sponsor port 3003. Lighthouse audit ID `total-byte-weight` current (numericValue in bytes). Sponsor 350 KB floor coherent against 428 KB headline + jitter. PRD/plan/code wording aligned. Re-run trigger names the right files + names the post-Phase-4 image-rendering-reintroduction trigger. No production-build concern with the multi-line JSX expression comment shape under Next.js + swc.

---

## Final convergence verdict

- **Total rounds:** 3 (full cap).
- **Total AC-failing findings:** 0.
- **Total non-breaking findings:** 2 (both applied inline between R2 and R3).
- **Unresolved findings:** None.
- **Materiality of unresolved findings:** N/A.

Phase 4 meets the convergence target (zero AC-failing findings) and the full N=3 cap was exercised per the sprint's adversarial-review convention. Smoketest at `docs/smoketests/phase-4-strip-login-imagery.md` is the documented manual verification path. In-session second-opinion automation produces the run log at `docs/smoketests/runs/phase-4-<date>.md` covering the contract-tier steps + the Tier-C local-prod-build Lighthouse measurement; real-device and Tier-B Vercel preview items batch into the sprint UAT round per the `feedback_finding_protocol` refinement adopted in Phase 2.
