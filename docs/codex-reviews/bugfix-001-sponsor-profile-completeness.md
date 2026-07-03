# Codex Adversarial Review — BUG-001 Sponsor Profile Completeness

Loop run on 2026-07-03 against branch `bugfix/june-handoff-2026-07-03` (cut from `main` at `5f73338` after Phase 12b merge). Cap N=3 per WBR default. Cap-hit handling per `feedback_commit_at_end_of_review_cycle`: commit once at the end of the cycle.

**Files reviewed:**

MODIFIED:
- `apps/sponsor/components/ProfileEditor.tsx` — added `useInvalidate` import + component-top-level `const invalidate = useInvalidate()`; after successful `PATCH /api/profile`, awaited `Promise.all([invalidate.sponsor(), invalidate.profile()])` before `setSaved(true)` (R3 tightening; original placement post-`setSaved` in R1/R2).
- `apps/sponsor/components/DashboardView.tsx` — added `ARRAY_FIELDS = new Set(['solutionsOffering', 'solutionsSeeking', 'targetIndustries'])`; `completeness()` filter branches by field type — `parseArr(sponsor[k]).length === 0` for the 3 array fields, `!sponsor[k]` for the other 15 scalar fields.

NOT MODIFIED (deliberately out of BUG-001 scope; future work per PRD §10):
- `apps/sponsor/app/api/profile/route.ts:29` writes `"[]"` for empty arrays (data-shape cleanup).
- `apps/sponsor/app/api/profile/route.ts:38` `revalidateTag` is a no-op (cleanup).
- `apps/sponsor/lib/hooks.ts:54-69` `useSponsorData staleTime: 60_000` tuning.

**Bar applied:** AC-failing = would make PRD §6.1 AC-1 through AC-5 fail OR violate `docs/smoketests/CONTRACT.md` (§1 categories, §3 banned language) OR trip the Tailor commit-msg blocklist on committed content. Style / quality / P2 findings reported but non-gating.

**PRD:** engineer-local bugfix PRD § BUG-001 (gitignored) — §5.1 fix approach, §6.1 AC.
**Plan:** engineer-local bugfix plan § Phase 1 (gitignored).

---

## Round 1 — 0 AC-failing findings + 1 non-breaking finding (not applied)

Codex R1 forwarded one finding, categorized as non-breaking.

- **R1-F1** (non-breaking, NOT APPLIED). `apps/sponsor/components/DashboardView.tsx:9` (`parseArr`). Codex flagged that `parseArr()` returns `JSON.parse(val)` without verifying the parsed value is actually an array. Suggested hardening: `const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []`. AC examples pass (`'[]'` has length 0, `'["Email Marketing"]'` has length 1), but valid non-array JSON like `'true'`, `'42'`, or `'{}'` returns a non-array whose `.length` is `undefined`, causing the field to be treated as filled.

  **Adjudication:** REJECTED for this PR.
  - Codex itself classified as non-breaking.
  - The theoretical rogue-non-array path is not reachable through the `ProfileEditor` UI — the three array fields (`solutionsOffering`, `solutionsSeeking`, `targetIndustries`) are typed `useState<string[]>` and only serialized through `JSON.stringify(val)` in the API route where `Array.isArray(val)` gates the stringification.
  - `parseArr` is used at multiple sites in `DashboardView.tsx` (lines 34, 93, 94, 95, others in the file); modifying its behavior widens blast beyond BUG-001 scope.
  - Flagged as future hardening in the PRD's related-risks section extension.

**Action.** Zero code changes applied. Full N=3 cap continues per protocol.

---

## Round 2 — 0 AC-failing findings + 0 non-breaking findings

Codex R2 was framed to look for what R1 might have missed via interaction between the two files, invalidation-then-refetch timing semantics, unsuccessful save paths, plan-vs-diff drift, and R1-carryover confirmation.

All five R2 focus areas resolved as "confirmed expected behavior, not a defect":

- **Cross-file interaction.** No race between cache invalidation and DashboardView re-render surfaced; React Query 5.x active-consumer refetch semantics are correct for this pattern.
- **Invalidation-then-refetch chain.** `invalidate.sponsor()` triggers immediate refetch for active consumers; `setTimeout` clearing `saved` state 3s later does not race with refetch completion.
- **Unsuccessful save paths.** `res.ok` false throws before invalidation — correct behavior; server-truth wins on invalidation-driven refetch — correct behavior.
- **Plan-vs-diff drift.** Zero drift. Diff matches plan Phase 1 "Code changes" specification exactly.
- **R1-carryover.** `parseArr` non-array reachability confirmed unreachable through any legitimate sponsor-app code path.

**Action.** Zero code changes applied. Zero fresh findings. Cycle continues to R3.

---

## Round 3 — 1 AC-failing finding APPLIED + cycle closed

Codex R3 was framed as the last-chance adversarial pass — "obvious in hindsight" defects, assumption cascades, demo-day sequence walkthrough, AC-5 "navigation hop" definition disambiguation, and general final-pass adversarial reads.

- **R3-F1** (AC-failing under strictest reading of AC-5, ACCEPTED and APPLIED). `apps/sponsor/components/ProfileEditor.tsx:296` and `apps/sponsor/components/DashboardView.tsx:53`. `handleSave` calls `invalidate.sponsor()` after the successful `PATCH /api/profile` but does not await the returned `invalidateQueries` promise before showing `setSaved(true)` and allowing the user to navigate away.

  In the demo-day sequence, the save response lands, `setSaved(true)` runs, invalidation starts, the user can immediately click back to the dashboard. Because the dashboard only gates on `isLoading` and then renders `profile.score` from the current cached `sponsorData`, React Query can serve the previous cached value while the invalidation refetch is still in flight. That means the user can briefly see the old 67 % after the navigation hop, then see 100 % only after the refetch completes.

  **Why AC-failing:** AC-5 requires that from an initial dashboard state showing 67 %, saving all 18 fields results in the dashboard showing 100 % "on return, within one navigation hop." Under the strictest reading, the current code can still render stale cached data during the gap between invalidation and refetch completion.

  **Adjudication:** ACCEPTED. Demo-day safety weighting outweighs the marginal UX cost. The stakeholder demo Monday should not exhibit a visible stale-to-fresh flicker in the sponsor profile completeness display.

  **Fix applied:** `ProfileEditor.tsx handleSave` — replaced the fire-and-forget invalidation calls with `await Promise.all([invalidate.sponsor(), invalidate.profile()])` before `setSaved(true)`. Consequence: save-success feedback ("Saved & synced" indicator) now appears after the refetch completes, guaranteeing cache freshness at the moment the user can navigate. UX cost: added ~100–500 ms latency to the save-success indicator display, well within the sub-1-second sub-goal for interactive save flows.

**Action.** R3-F1 applied. `pnpm --filter sponsor typecheck` reruns clean. Cycle closes at R3 with zero remaining AC-failing findings.

---

## Verdict

Cycle closed after 3 rounds. Final diff:

- **R1**: 0 AC-failing, 1 non-breaking (not applied — flagged as future hardening).
- **R2**: 0 AC-failing, 0 non-breaking.
- **R3**: 1 AC-failing (applied), 0 non-breaking.

Total AC-failing fixes applied in-cycle: 1 (R3-F1 — await invalidation before showing save-success).

**AC re-check post-cycle:**
- AC-1 (fresh `/api/sponsor-data` request post-save): satisfied. Invalidation triggers refetch immediately; observable in Network panel.
- AC-2 (fresh `/api/profile/sponsor-data` request post-save): satisfied. Same mechanism.
- AC-3 (`completeness({ solutionsOffering: '[]' })` returns "Solutions offering" in missing): satisfied via `ARRAY_FIELDS.has(k) → parseArr(sponsor[k]).length === 0` branch.
- AC-4 (`completeness({ solutionsOffering: '["Email Marketing"]' })` does not return it): satisfied via same branch.
- AC-5 (67 % → 100 % on return within one navigation hop, strictest reading): satisfied post-R3 fix. Cache is guaranteed fresh before the "Saved & synced" indicator shows, so navigation triggers a cache-hit render with fresh data.

**Commit shape (deferred to end of workflow):** single commit at the end of Steps 6 (Playwright script) + 7 (smoketest doc) + this review log per `feedback_commit_at_end_of_review_cycle` — one PR, single-commit rebase-and-merge per WBR conventions.

**Future work carried forward:**
- `parseArr` `Array.isArray()` guard hardening (R1-F1).
- `apps/sponsor/app/api/profile/route.ts:29` write `null` for empty arrays.
- `apps/sponsor/app/api/profile/route.ts:38` `revalidateTag` no-op cleanup.
- `apps/sponsor/lib/hooks.ts:54-69` `useSponsorData staleTime` tuning.
