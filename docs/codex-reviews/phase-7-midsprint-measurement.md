# Codex N=3 adversarial review — Phase 7 mid-sprint Lighthouse re-measurement

**Phase:** 7 — Mid-sprint Lighthouse re-measurement + Tier B (engineering) gating decision
**Branch:** `phase-7-midsprint-lighthouse-remeasurement`
**Review cap:** N=3 per PRD §8.2; commit at end of cycle per `feedback_commit_at_end_of_review_cycle`.
**Reviewed deliverables:**

- `docs/perf/run-lighthouse.sh` — Lighthouse 13.4.0 runner against 9 routes × 2 profiles on production.
- `docs/perf/parse-lh.js` — JSON-to-markdown parser surfacing both observed and simulated LCP/FCP per PRD §4 amendment 2026-06-27.
- `docs/perf/README.md` — rebuild procedure (Lighthouse install, cookie capture, runner invocation).
- `docs/perf/.gitignore` — excludes `headers/` (session secrets) and `lighthouse/` (large raw reports).
- `docs/perf/phase-7-midsprint-2026-06-30.md` — measurement artifact + Tier B gating decision in writing.
- `docs/smoketests/phase-7-midsprint-measurement.md` — 6-step smoketest (5 contract + 1 perf-bar tier A).

**AC source:** PRD §6 Phase 7 + PRD §4 success criteria #1 (observed LCP ≤ 3s on the four attendee landing pages mobile) and #2 (login transfer ≤ 250KB on all four `/login` routes mobile).

## Round 1

Codex returned 10 findings: 3 AC-failing + 7 non-breaking. Adjudication per finding below; anchors to PRD / CONTRACT.md / methodology.

### R1-F1 — Cookie capture not rebuildable from scratch [AC-failing]

**Codex evidence:** `docs/perf/README.md:47` cookie-capture loop writes to `docs/perf/headers/$APP.json`, but `docs/perf/.gitignore:1` ignores `headers/` so the directory does not exist on a fresh checkout.

**Verdict:** ACCEPT. The rebuild procedure must work end-to-end without an undocumented prerequisite. The cookie-capture loop ran in the original Phase 7 build because the agent ran `mkdir -p docs/perf/headers` outside the documented procedure; a fresh runner would hit a redirect error or fail silently.

**Anchor:** PRD §6 Phase 7 fallback path ("If `/tmp` has been cleared, re-run the cookie capture per the recon doc") plus the smoketest Step 2 contract that the README procedure produces valid header files.

**Fix:** Add `mkdir -p docs/perf/headers` at the top of the cookie-capture loop in both `docs/perf/README.md` § "Rebuild from scratch" step 2 and `docs/smoketests/phase-7-midsprint-measurement.md` § Step 2.

### R1-F2 — Observed-LCP gating interpretation defensible [non-breaking]

**Codex evidence:** Phase 7 artifact gates on observed LCP and reports simulated separately; the `/schedule` 19× observed/simulated gap is explicitly called out.

**Verdict:** NO_CHANGE. Codex confirms the gating interpretation matches the amended PRD.

**Anchor:** PRD §4 amendment 2026-06-27; ADR 0004; `project_lantern_model_base64_finding`.

### R1-F3 — Route coverage + paths complete [non-breaking]

**Codex evidence:** Runner includes all 9 routes from PRD §6 Phase 7 AC; paths are correct.

**Verdict:** NO_CHANGE.

### R1-F4 — Smoketest Step 2 misclassified as contract [AC-failing]

**Codex evidence:** Step 2 carries the `[contract]` tag but its body depends on live production endpoints and valid credentials.

**Verdict:** ACCEPT. CONTRACT.md §1.1 defines contract checks as env-agnostic — depending only on code, not environment. Step 2's curl-against-production loop is environment-dependent by construction. The fix shape per CONTRACT.md established convention (Phase 14 + Phase 9): env setup goes in Prerequisites, numbered Steps assert deliverable correctness.

**Anchor:** CONTRACT.md §1.1 contract-check definition.

**Fix:** Move the cookie-capture procedure into Prerequisites (referencing the README for the executable shape); rewrite Step 2 to verify only the resulting header files' shape (env-agnostic file-system + JSON-schema checks).

### R1-F5 — Single-run variance handling acceptable [non-breaking]

**Codex evidence:** Artifact discloses single-run methodology + ±10–15% variance; smoketest's median-of-3 note is correctly placed.

**Verdict:** NO_CHANGE.

### R1-F6 — Phase 14 deployment timestamps uncited [non-breaking]

**Codex evidence:** The Vercel deployment-topology table at `phase-7-midsprint-2026-06-30.md:94` cites deployment timestamps without naming the evidence source.

**Verdict:** ACCEPT (small). The timestamps came from `vercel project ls` output during Phase 7 setup. Cleanup: add the evidence source so a re-reader can reproduce the audit.

**Anchor:** PRD §6 Phase 7 dependencies require prior phases deployed; the artifact's claim should cite its evidence.

**Fix:** Add a one-line note under the table identifying the evidence source (`vercel project ls` run on 2026-06-30).

### R1-F7 — Topology follow-up correctly scoped out [non-breaking]

**Codex evidence:** Phase 7 artifact records the topology finding then marks follow-ups out of scope.

**Verdict:** NO_CHANGE. Phase 7 is measurement-only; the `docs/architecture.md` + `docs/decisions.md` patches land in a separate cleanup PR.

### R1-F8 — Login auth-posture drift from Phase 2 baseline [AC-failing]

**Codex evidence:** Phase 7 runner omits cookies on `/login` routes; Phase 2 baseline doc states "all auth'd with a seeded `june@tailor.tech` ORGANIZER session cookie" for the full 15-route measurement.

**Verdict:** ACCEPT. The delta comparison must be apples-to-apples. Two paths to compliance: (a) verify empirically that cookies-on-vs-cookies-off produces identical Lighthouse output on `/login` and document the equivalence; (b) re-run `/login` with cookies for direct baseline parity. Path (b) is cheaper (~80s of additional Lighthouse runs) and removes the methodology question entirely.

**Anchor:** PRD §6 Phase 7 AC #2 ("Per-route delta vs. baseline captured"). A delta is meaningful only when the methodology matches.

**Fix:** Drop the `/login` cookie conditional from `docs/perf/run-lighthouse.sh`; re-run the 4 `/login` routes × 2 profiles = 8 reports against production; verify `finalDisplayedUrl` on each = the requested `/login` path (no redirect to authenticated routes); re-parse + update artifact metrics tables + methodology section.

### R1-F9 — Parser reconstructs current multi-segment routes correctly [non-breaking]

**Codex evidence:** `parse-lh.js:20-23` correctly maps `lh-admin-dashboard-attendees-mobile.json` → `/dashboard/attendees`.

**Verdict:** NO_CHANGE for current state. Defensive future-proofing (explicit route manifest) is out of scope.

### R1-F10 — Phase 8 gating decision rigor sufficient [non-breaking]

**Codex evidence:** Attendee observed LCP max is `/home` at 1.86s, comfortably under the 3s bar.

**Verdict:** NO_CHANGE — contingent on R1-F1, R1-F4, R1-F8 fixes landing. Codex notes the gating decision is defensible once auth-parity + rebuildability are addressed.

### Round 1 — fixes to apply

- **R1-F1**: `mkdir -p docs/perf/headers` in README + smoketest.
- **R1-F4**: Restructure smoketest — cookie capture into Prerequisites; Step 2 rewrites to env-agnostic file-shape check.
- **R1-F6**: Add deployment timestamp evidence source under topology table.
- **R1-F8**: Drop `/login` cookie conditional in runner; re-run 4 `/login` × 2 profiles; verify `finalDisplayedUrl`; re-parse + update artifact.

Round 1 materiality: 3 AC-failing findings to fix before Round 2. No hallucinations; all 10 findings traced to concrete file/line evidence.

## Round 2

Codex returned 6 findings: 2 AC-failing + 4 non-breaking. Round 2 caught both propagation from R1 fixes (R2-F3, R2-F5) and net-new defects (R2-F1, R2-F2, R2-F4, R2-F6). All ACCEPT.

### R2-F1 — `finalDisplayedUrl` claim not auditable in-band [AC-failing]

**Codex evidence:** artifact methodology claims `finalDisplayedUrl` matches the requested `/login` URL on all eight reports, but the raw JSON files are gitignored and no committed check surfaces the value.

**Verdict:** ACCEPT. The claim is true but a re-reader cannot verify it from the committed artifact alone.

**Anchor:** PRD §6 Phase 7 evidence-trail expectation; reproducibility principle behind CONTRACT.md's deterministic-pass-criterion rule.

**Fix:** Add an in-band verification sub-bullet in the smoketest (extract `finalDisplayedUrl` from each `/login` JSON report and confirm it equals the requested URL). Add a cache-bypass observation in the artifact methodology — the cookie-on vs cookie-off byte-transfer parity (within 1–2KB cookie-header overhead) is empirical evidence the Vercel edge cache was not bypassed.

### R2-F2 — Smoketest Step 3 still mislabeled `[contract]` [AC-failing]

**Codex evidence:** Step 3 tagged `[contract]` but executes `./docs/perf/run-lighthouse.sh` against production deployments. The R1-F4 fix moved Step 2's env-dependent body but missed the symmetric defect in Step 3.

**Verdict:** ACCEPT. Same CONTRACT.md §1.1 violation pattern as R1-F4.

**Anchor:** CONTRACT.md §1.1 contract-check definition.

**Fix:** Move the runner-invocation sub-step into Prerequisites (alongside cookie capture); rewrite Step 3 as an env-agnostic file-count check on the resulting reports.

### R2-F3 — Runner header comment contradicts post-R1 behavior [non-breaking]

**Codex evidence:** `docs/perf/run-lighthouse.sh:15-16` methodology block still says `/login` routes run without auth cookies; code body (post-R1-F8 edit) sends cookies on every route.

**Verdict:** ACCEPT. R1-F8 propagation defect — the code was edited; the comment was not.

**Anchor:** Code/comment consistency (no specific PRD clause; established engineering hygiene).

**Fix:** Update the runner's methodology comment block to describe the auth-on-all-routes posture.

### R2-F4 — Cookie-capture procedure doesn't emit the claimed `ok`/`fail` output [non-breaking]

**Codex evidence:** smoketest Prerequisites claims the README procedure prints `ok <app>` / `fail <app>` lines; the README procedure as currently written does not emit those lines.

**Verdict:** ACCEPT. The earlier (pre-R1-F4) Step 2 had the ok/fail emission; the R1-F4 move into Prerequisites referenced the README, but the README's procedure is the silent version. Either the smoketest claim needs to be removed or the README needs to add the emission.

**Anchor:** CONTRACT.md §1.1 deterministic-pass-criterion requirement.

**Fix:** Update the README's cookie-capture procedure to emit per-app `ok`/`fail` lines so the smoketest Prerequisites claim is honest.

### R2-F5 — Sprint exit criteria #4 cell carries stale pre-rerun value [non-breaking]

**Codex evidence:** Sprint exit criteria #4 (admin no-regression) cell still references "admin `/login` mobile 1.72s vs 1.51s baseline" — the pre-R1-F8 measurement. Updated tables at lines 38 and 62 show post-rerun simulated 1.51s and observed 1.37s.

**Verdict:** ACCEPT. R1-F8 propagation defect — the /login re-run updated detail tables but the summary cell was not re-written.

**Anchor:** Internal consistency across artifact tables.

**Fix:** Update the Sprint exit criteria #4 cell with post-rerun values + add a footnote on the delta table clarifying that the Δ sim column compares simulated-to-simulated only (no observed-LCP equivalent in the Phase 2 baseline).

### R2-F6 — Deployment timestamp evidence procedural, not auditable [non-breaking]

**Codex evidence:** the R1-F6 fix added the citation `vercel project ls` / `vercel inspect` on 2026-06-30 but preserves no deployment IDs or command output.

**Verdict:** ACCEPT (small). Embedding the dpl_* IDs makes the audit-grade. The IDs were captured during Phase 7 setup.

**Anchor:** PRD §6 Phase 7 evidence-trail expectation; audit-record durability.

**Fix:** Add the deployment IDs to the Vercel topology table so a re-reader can resolve the exact deploys via `vercel inspect dpl_<id>`.

### Round 2 — fixes to apply

- **R2-F1**: smoketest in-band finalDisplayedUrl check + artifact cache-bypass note.
- **R2-F2**: smoketest Step 3 restructure (runner-execution → Prerequisites; Step 3 → file-count check).
- **R2-F3**: runner header comment update.
- **R2-F4**: README cookie-capture procedure emits ok/fail per app.
- **R2-F5**: Sprint exit criteria #4 cell + delta table clarification.
- **R2-F6**: Embed deployment IDs in topology table.

Round 2 materiality: 2 AC-failing fixes required before Round 3. No hallucinations; propagation rate higher than Phase 14 R2 (3/6 propagation findings here vs 2/4 in Phase 14). The auth-on-all-routes change (R1-F8) was the dominant source of propagation, which is consistent with Phase 14's pattern of "the largest R1 fix produces the most R2 propagation."

## Round 3

Codex returned 4 findings: 2 AC-failing + 2 non-breaking. Round 3 caught one R2-F2 propagation defect (R3-F2: stale-file clear was dropped when runner-execution moved out of Step 3) and three net-new defects. All ACCEPT.

### R3-F1 — `finalDisplayedUrl` check weaker than artifact claim [AC-failing]

**Codex evidence:** artifact methodology says `finalDisplayedUrl … equals the requested /login URL`; smoketest Step 3 only checks `url.endsWith("/login")`.

**Verdict:** ACCEPT. The claim is "equals"; the check is "endsWith path suffix." A redirect to a different host with the same path suffix would pass the check but violate the claim. In practice Lighthouse cannot be redirected cross-host via cookies, but the audit asymmetry is real.

**Anchor:** Artifact methodology claim alignment with the in-band verification step.

**Fix:** Build an expected-URL map per app + profile in the smoketest Step 3 node block; compare exact equality, not suffix.

### R3-F2 — Runner silently leaves stale reports after failures [AC-failing]

**Codex evidence:** `docs/perf/run-lighthouse.sh:29` creates the output directory but does not clear old `lh-*.json` files; the `|| echo … FAILED` pattern at the Lighthouse invocation does not propagate exit codes; smoketest Step 3 only counts existing files.

**Verdict:** ACCEPT. R2-F2 propagation defect — when I moved the runner-execution out of Step 3 into Prerequisites, the `rm -f docs/perf/lighthouse/lh-*.json` line that lived in Step 3 was dropped. A subsequent partial-failure run would produce N < 18 fresh reports plus stale reports from a prior run, yielding 18+ files where one or more is stale. The smoketest's `count=18` check would pass on stale data.

**Anchor:** PRD §6 Phase 7 AC #1 ("Lighthouse mobile + desktop runs completed for all sprint-relevant routes" — partial runs do not satisfy this).

**Fix:** Add `rm -f $OUT_DIR/lh-*.json` at the start of the runner; track Lighthouse invocation failures via a counter; exit non-zero at end if any invocation failed. List failed routes on exit so the runner is self-diagnosing.

### R3-F3 — Cache-bypass observation over-attributes byte deltas [non-breaking]

**Codex evidence:** artifact says deltas are "consistent with the cookie-header bytes added to the request." Arithmetic: ~400B cookie × N requests would yield deltas proportional to same-origin request count, but the artifact doesn't show the math — sponsor `/login` has 11 requests total, of which an unknown subset carry the cookie. The claim is plausible but unaudited.

**Verdict:** ACCEPT. The empirical observation (byte-transfer parity within ±2KB) IS the load-bearing evidence the cache wasn't bypassed; the cookie-byte attribution adds unverified mechanism speculation that weakens the claim's defensibility.

**Anchor:** Artifact methodology clause precision.

**Fix:** Re-word to keep the empirical observation (small byte-transfer deltas across cookie-off and cookie-on runs) without claiming the cookie-header-byte mechanism. Frame as "within Lighthouse single-run variance bounds + no evidence of cache invalidation."

### R3-F4 — Deployment timestamp precision evidence procedural [non-breaking]

**Codex evidence:** deploy_evidence sub-table gives minute-level absolute timestamps but no captured `vercel inspect` output is preserved.

**Verdict:** ACCEPT (small). The timestamps came from the `created` field of each `vercel inspect <host>` output (format: `Mon Jun 29 2026 23:14:07 GMT-0400`); the precision is real but a re-reader can't verify the source-of-truth from the artifact alone.

**Anchor:** PRD §6 Phase 7 evidence-trail expectation.

**Fix:** Add a one-line note clarifying that timestamps were taken verbatim from each `vercel inspect`'s `created` field; the re-reader can re-run `vercel inspect <deployment-id>` to verify.

### Round 3 — fixes to apply

- **R3-F1**: smoketest exact-URL match (build expected URL per app + profile; compare equality).
- **R3-F2**: runner stale-clear + fail tracking + non-zero exit.
- **R3-F3**: cache-bypass wording weakened to "variance bounds" + drop cookie-byte attribution.
- **R3-F4**: timestamp source clarification under deploy_evidence sub-table.

Round 3 materiality: 2 AC-failing fixes to apply before commit. R3 produced zero hallucinations and one propagation defect (R3-F2) — consistent with Phase 14's pattern. After these fixes, Phase 7 ready to commit.

## Summary across N=3

| Round | Findings | AC-failing | Non-breaking | Hallucinations | Propagation defects |
|---|---|---|---|---|---|
| R1 | 10 | 3 | 7 | 0 | 0 |
| R2 | 6 | 2 | 4 | 0 | 3 (R2-F3, R2-F5, partial R2-F1) |
| R3 | 4 | 2 | 2 | 0 | 1 (R3-F2) |
| **Total** | **20** | **7** | **13** | **0** | **4** |

20 findings across N=3; all 20 accepted; zero hallucinations. Propagation rate 4/20 = 20%; the dominant pattern was the auth-on-all-routes R1-F8 fix producing multiple R2 propagation defects. The Step 3 restructure (R2-F2) produced the R3-F2 propagation. Each round caught what the prior round shifted.

Single commit at end of cycle per `feedback_commit_at_end_of_review_cycle`.



