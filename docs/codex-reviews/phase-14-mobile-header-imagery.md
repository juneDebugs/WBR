# Codex Adversarial Review — Phase 14 Mobile-App Header Imagery

Loop run on 2026-06-29 (US PT) against branch `phase-14-mobile-header-imagery` (cut from main at `38d2701` after the Phase 11B merge). Cap N=3 rounds per PRD §8.2. Cap-hit handling per `feedback_commit_at_end_of_review_cycle`: commit once at the end of the cycle with surviving-finding materiality read inline.

**Files reviewed:**

NEW:
- `docs/smoketests/phase-14-mobile-header-imagery.md`
- `docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs`

MODIFIED:
- `apps/attendee/components/HomeScreen.tsx` (hero render block + rollback-preservation comment)
- `apps/attendee/components/people/PeopleClient.tsx` (WBR-module avatar swap + rollback-preservation comment)
- `apps/attendee/next.config.js` (`images.remotePatterns` retention comment)
- `docs/decisions.md` (Phase 14 sprint-grade entry)

AMENDED (gitignored, not in `git diff` but reviewed in-place):
- `wbr_demo_sprint_prd_2026_06_26.md` Phase 14 entry (amended 2026-06-29 with original framing preserved at bottom for audit)
- `wbr-demo-sprint-2026-07-06.md` Phase 14 entry (mirror amendment)

**Bar applied** (amended PRD §6 Phase 14 AC, `docs/smoketests/CONTRACT.md`, `feedback_engineering_docs_no_pii_or_personality` extended to code comments, `feedback_tailor_commit_msg_blocklist`): zero requests to the two hot-linked hostnames on the two affected routes; comment-out-with-rollback shape at both code sites; gradient stops match the WBR-module reference; PII-free committed content; deterministic smoketest pass criteria; Playwright shape matches the Phase 3/5/9 conventions. AC-failing = would make the amended Phase 14 AC fail OR violate the smoketest CONTRACT OR trip the Tailor pre-commit blocklist OR fail PII compliance. Style / quality / P2 findings reported but non-gating.

---

## Round 1 — 3 AC-failing findings + 0 non-breaking

- **R1-F1** (AC-failing). `docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs:103-115` loaded `/home` and counted image requests against the forbidden hostname but never asserted the precondition that `Conference.heroImageUrl` is null. The amended PRD AC bullet 1 (engineer-local PRD, gitignored) explicitly qualifies the assertion as "when `conference?.heroImageUrl` is null" — a DB with a real hero set would silently false-pass because the conditional in `HomeScreen.tsx:702` would render the `<Image>` branch instead of the gradient branch, and the forbidden hostname would not appear regardless of whether the rollback path was active. The smoketest doc's "Prerequisites" section surfaced this requirement to the human runner but did not enforce it programmatically.

- **R1-F2** (AC-failing). `docs/smoketests/phase-14-mobile-header-imagery.md` Step 4 ("Multimodal visual identity review of the two screenshot pairs") was tagged `[contract]` but its pass criterion required the runner to "render an opinion" and record "identity preserved" or "regression: <observation>" — explicit subjective judgment. `docs/smoketests/CONTRACT.md` §3 bans subjective language as a contract-step pass criterion. The visual-identity AC bullet in the amended PRD is genuinely subjective by construction ("multimodal review confirms visual identity preserved or flags a regression for UAT-level review") and therefore cannot live as a contract step at all — it belongs in a UAT-handoff section outside the gated Steps list.

- **R1-F3** (AC-failing). `docs/smoketests/phase-14-mobile-header-imagery.md` Pass/Fail section gated on Steps 1–5 but did not surface the routing for the amended PRD AC bullet "No regression in mobile observed LCP / Speed Index on `/home` and `/people` per the Phase 13 perf delta report's measurement pass." Without an explicit routing note, a future runner reads the smoketest and concludes Phase 14 acceptance is complete without checking that the Phase 13 perf delta deliverable has been satisfied. The AC bullet is correctly scoped to Phase 13's measurement pass; the smoketest just needs to make that handoff explicit.

**Action.** All 3 findings addressed:

- R1-F1: added `assertHeroImageUrlIsNull(sessionToken)` precondition function to the Playwright script. The function fetches `/api/data/home` with the authenticated session cookie, parses the JSON, and throws with a clear "re-seed" error message if `data.conference.heroImageUrl` is non-null. Invoked before any browser context opens. The smoketest doc's "Prerequisites" section retains the human-readable note about re-seeding; the script now enforces the precondition machine-side.
- R1-F2: split Step 4 into two artifacts. **Step 4** is now a deterministic file-system check ("Screenshot files captured and non-trivial [contract]") that asserts each of the four PNGs exists and is larger than 10 KB — binary observable pass criterion. The multimodal review moved to a new **"UAT handoff — multimodal visual identity review (non-blocking, routed to dry-run)"** section outside the gated Steps list, where its subjective shape is appropriate. The Pass/Fail section was updated to gate on Steps 1–5 with the UAT handoff queued for the dry-run window.
- R1-F3: added an **"Out-of-scope AC bullets (verified elsewhere)"** subsection to the Pass/Fail block. It explicitly names the LCP / Speed Index regression bullet and routes it to the Phase 13 perf delta report's measurement pass, with a re-evaluation pointer if Phase 13 surfaces a regression. The amended PRD entry is unchanged — the routing was already documented there; the smoketest just needed to mirror it.

---

## Round 2 — 2 AC-failing findings + 2 non-breaking findings

- **R2-F1** (AC-failing). `docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs:93` did `const heroUrl = data?.conference?.heroImageUrl` and then accepted `undefined` as a valid pass. The amended PRD AC bullet 1 requires the precondition to gate on `heroImageUrl === null` specifically. A missing `conference` object or a missing `heroImageUrl` key both surface as `undefined` from optional chaining — indistinguishable from `null` under the original check — so a broken DB connection or a Prisma `select` regression would silently false-pass without flagging a setup failure.
- **R2-F2** (AC-failing). `docs/smoketests/phase-14-mobile-header-imagery.md` Step 3's baseline-capture procedure instructed the runner to `git stash` the Phase 14 edits and re-run the same Playwright script to capture pre-Phase-14 screenshots. The pre-Phase-14 source deterministically emits the forbidden hostnames, so the script's hot-link assertions fail and it exits non-zero. Screenshots ARE captured (the `page.screenshot` call sits after the assertion check in the function body), but the non-zero exit code interrupts `set -e` shells before the downstream `mv` commands run, and the "failure" output confuses runners during what is intentionally a baseline pass. The amended PRD AC explicitly requires "Baseline + post screenshots captured via the `git stash` pattern" — the documented procedure couldn't satisfy that AC cleanly without a capture-only flag.
- **R2-F3** (non-breaking). `docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs` lines 95-103 and 132-140 (the `ctx.addCookies` calls) omitted the `secure: true` attribute. The cookie name picks up the `__Secure-` prefix when `BASE_URL.startsWith('https://')`, but browser cookie-prefix rules require the `Secure` attribute on `__Secure-` cookies; without it, an HTTPS Vercel preview run silently rejects the injected cookie and redirects to `/login`, producing a false-pass. Non-breaking for the documented local-HTTP path but latent for any Tier-B preview run.
- **R2-F4** (non-breaking — flagged against the PRD itself). The amended PRD's "Files:" bullet citing `apps/attendee/components/HomeScreen.tsx:701-714` and the Approach bullets citing `HomeScreen.tsx:705` + `PeopleClient.tsx:561` all anchored to pre-edit line numbers. After the rollback-comment-block insertion, the HomeScreen active conditional runs ~717-731 and the rollback block runs ~732-740; the PeopleClient active `<Image>` is at ~line 569 and the rollback block at ~570-572. Off-by-~18 in the HomeScreen case; off-by-8 in PeopleClient. The references are still vaguely useful as region anchors but the literal line numbers are stale, eroding trust in downstream citations.

**Action.** All 4 findings addressed:

- R2-F1: replaced the lax optional-chain check with strict, distinct assertions in `assertHeroImageUrlIsNull`. The function now (a) verifies `data` is a non-null object, (b) verifies `data.conference` is a non-null object with a distinct "no active Conference row" error message, (c) verifies `conference` owns the `heroImageUrl` property with a distinct "schema regression in the route's Prisma select" error message, and (d) verifies `heroImageUrl === null` strictly (treating `undefined`, empty string, and any string value as fail). Each failure mode throws with a recovery hint.
- R2-F2: added `CAPTURE_ONLY` environment-driven mode to the Playwright script. When `PHASE14_CAPTURE_ONLY=1` is set, the hot-link assertions in `checkHome` and `checkPeople` are bypassed via a top-of-script `CAPTURE_ONLY` constant; the matched-count is still logged for visibility but does not contribute to `failCount`. Screenshots are written and the script exits 0. Step 3 of the smoketest doc was updated to invoke the script with `PHASE14_CAPTURE_ONLY=1` for the baseline pass and without the flag for the final post-restore verification. The "Pass:" criterion was tightened to require the final (non-CAPTURE_ONLY) run to exit 0.
- R2-F3: added `secure: BASE_URL.startsWith('https://')` to both `ctx.addCookies` calls. The cookie now matches the cookie-prefix rules whichever protocol the runner uses.
- R2-F4: widened the PRD's "Files:" reference to `apps/attendee/components/HomeScreen.tsx` (hero render block — approximately lines 701–740 post-edit, including the active conditional and the preserved rollback block in a JSX comment). The Approach bullets were rewritten to use region descriptors instead of literal lines: `HomeScreen.tsx, hero render block` and `PeopleClient.tsx, WBR module avatar render, ~lines 555-573 post-edit`. The plan §Phase 14 entry got a mirror update. The decisions.md entry's `:705` and `:561` references were rewritten similarly. Inline rollback comments in `HomeScreen.tsx` and `PeopleClient.tsx` still cite their cross-site partner code by line number — those cross-references survive the edit because they point at structural anchors (the WBR-module gradient definition at line 558 stayed at line 558; the HomeScreen relative div opener at line 701 stayed at line 701). No further drift in the inline rollback comments.

---

## Round 3 — 1 AC-failing + 1 non-breaking

- **R3-F1** (AC-failing). `docs/smoketests/phase-14-mobile-header-imagery.md` Steps 1 and 3 (the build/start command blocks at the top of each step) used `pnpm --filter @conference/attendee build` and `pnpm --filter @conference/attendee start`. The actual package name in `apps/attendee/package.json:2` is `attendee` (not `@conference/attendee`); only `packages/db/package.json` uses the `@conference/*` scope. Phase 5's smoketest and Phase 9's smoketest both use the correct `pnpm --filter attendee ...` shape. The runner following the documented commands would get pnpm's "No projects matched the filters" error before either contract step could execute. Notably, the smoketest's own "Prerequisites" section at line 14 cited the correct `pnpm --filter attendee` shape — so this was a downstream-drift defect from the prereqs to the per-step command blocks, not a model of the project structure.

- **R3-F2** (non-breaking). Six locations across the smoketest, `next.config.js`, and `PeopleClient.tsx` still used literal `:701` / `:705` / `:561` line anchors after R2-F4 widened the equivalent PRD / plan / decisions references to region descriptors. Of the six: the `:705` and `:561` refs were genuinely stale (the lines they originally pointed at no longer hold the content described — `:705` is now a comment line, `:561` is now the opening of a JSX comment block); the `:701` refs were durable (they point at the hero `<div className="relative overflow-hidden">` opener, which doesn't move). Codex correctly tagged the finding non-breaking — the durable ones still navigate correctly, and the stale ones still serve as approximate region anchors. The structural argument was: R2-F4's spirit was to move away from brittle line anchors in engineering-doc prose, and the same shape was repeated downstream.

**Action.** Both findings addressed:

- R3-F1: replaced all `pnpm --filter @conference/attendee` invocations in the Phase 14 smoketest with `pnpm --filter attendee` (six occurrences across Steps 1 and 3) via a single Edit with `replace_all=true`. The prereqs line was already correct and survived unchanged.
- R3-F2: applied region descriptors at all six cited locations.
  - `docs/smoketests/phase-14-mobile-header-imagery.md:24` (Step 1 "Verifies"): `HomeScreen.tsx:705` → `HomeScreen.tsx (hero render block)`.
  - `:44` (Step 2 "Verifies"): `PeopleClient.tsx:561` → `PeopleClient.tsx (WBR module avatar render)`.
  - `:162` (UAT handoff rollback ref): `HomeScreen.tsx:701` → `HomeScreen.tsx (hero render block)`.
  - `:165` (UAT handoff rollback ref): `PeopleClient.tsx:561` → `PeopleClient.tsx (WBR module avatar render)`.
  - `apps/attendee/next.config.js:160-161` (config retention comment): both `:701` and `:561` literal anchors replaced with `(hero render block)` and `(WBR module avatar render)` region descriptors.
  - `apps/attendee/components/people/PeopleClient.tsx:564` (cross-file rollback reference inside the WBR-module rollback header): `HomeScreen.tsx:701` → "the hero render block in HomeScreen.tsx".

  Trade-off considered: the `:701` references were durable and supported Cmd+Click navigation, but consistency with R2-F4's region-descriptor pattern was preferred to mixed line-and-descriptor usage. Engineers can still locate the hero render block by searching for the `Full hero — image behind everything` comment in HomeScreen.tsx.

---

## Materiality read (end of N=3 cycle)

**Convergence:** Round 3 surfaced one final AC-failing defect (R3-F1, the broken pnpm filter) and one non-breaking downstream-propagation finding (R3-F2). Both were accepted and fixed. No hallucinated AC requirements surfaced in R3 (the Phase 11B R3-F4/F5 precedent did not recur). All other categories audited explicitly by Round 3 — rollback JSX fidelity at both code sites, gradient stop exact-string match between `HomeScreen.tsx:728` and `PeopleClient.tsx:558`, CAPTURE_ONLY gating semantics, strict `heroImageUrl === null` precondition with distinct setup-failure error messages, localhost cookie behavior under the new `secure` flag, PRD/plan/decisions AC-bullet-to-artifact mapping — are clean in the post-R3 tree.

**Unresolved findings:** none. All 9 surfaced findings (R1: 3 AC-failing; R2: 2 AC-failing + 2 non-breaking; R3: 1 AC-failing + 1 non-breaking) were accepted and fixed.

**Engineering-judgment rejections:** none. Unlike Phase 11B (where R3-F4 and R3-F5 invented section-structure AC requirements not in the PRD), every Codex finding in this cycle anchored to a real defect against the amended PRD, the smoketest CONTRACT, or established codebase conventions.

**Cap-hit handling:** N=3 cap is the documented bound (PRD §8.2). The cycle did not converge at any round — each round surfaced new findings, including downstream propagation gaps from the prior round's fixes. The end-state is clean, but the propagation pattern is worth noting: R2-F4 widened PRD/plan/decisions line refs, and R3-F2 found six more locations with the same shape that hadn't been swept. A Round 4 (if it were authorized) might surface a seventh tier of downstream propagation; the empirical pattern across Phase 11B + Phase 14 is that each round catches what the prior round propagated. Per `feedback_commit_at_end_of_review_cycle`, the cycle commits at N=3 regardless; the engineer-of-record can authorize a supplementary R4 pass if a specific surface remains undertaken.

**Recommendation:** Phase 14 is ready to commit. The working tree satisfies the amended PRD §6 Phase 14 AC, the smoketest CONTRACT, and the established codebase conventions (cookie shape, package names, region-descriptor pattern, comment-out-with-rollback shape, gradient stop consistency).
