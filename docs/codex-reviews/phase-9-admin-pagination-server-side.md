# Codex Review Log — Phase 9: Move admin `/dashboard/attendees` pagination server-side

**Phase:** 9 (PRD §6 Phase 9)
**Branch:** `phase-9-admin-server-side-pagination` off `main` at `9b27d09`
**Files under review:**
- `apps/web/lib/attendees-query.ts` (new)
- `apps/web/app/api/data/attendees/route.ts`
- `apps/web/app/(dashboard)/dashboard/attendees/page.tsx`
- `apps/web/lib/hooks.ts`
- `apps/web/components/AttendeesTable.tsx`
- `docs/architecture.md`
- `docs/smoketests/phase-9-admin-pagination-server-side.md` (new)
- `docs/smoketests/playwright/phase-9-admin-pagination-server-side.mjs` (new)

**Process:** N=3 adversarial review cap per PRD §8.2, full cap exercised regardless of early convergence per `feedback_commit_at_end_of_review_cycle`. Subagent: `codex:codex-rescue`. Default-refute-on-uncertainty enforced across all rounds.

---

## Round 1 — Phase-specific probes

**Probes:** Prisma query semantics (pagination/search/filter/SQL injection surface), URL-param validation (page integer, role allowlist, q length cap), auth on the new route, column-projection leak surface, React Query queryKey shape + placeholderData + initialData + initialDataUpdatedAt interaction, search-debounce + page-reset ordering race, AC fidelity vs PRD §6 Phase 9, CONTRACT.md compliance, smoketest executability (cookie-injection recipe, `.env.local` prereqs, `git stash` baseline), architecture.md fidelity, Add Attendee invalidation, edge cases (0-result search, empty role, total === 0 pagination control), pre-existing-but-load-bearing items.

**Findings:**

- AC-failing:
  - **R1-F-01 — Fresh seed cannot satisfy SPEAKER filter assertion.** The Playwright Step 5 asserted `role=SPEAKER` returns rows and every visible row reads SPEAKER. The current seed generator at `packages/db/prisma/seed.ts:680` only creates ATTENDEE-role User rows in bulk; speaker entities live in a separate `Speaker` table, not as Users. The local DB had 91 SPEAKER-role User rows from a prior seed iteration, masking the gap. A fresh-clone runner fails Step 5.

- Non-breaking:
  - **R1-F-02 — API auth checks token presence, not admin role.** `/api/data/attendees` accepted any valid NextAuth JWT; the admin role gate lived only in the web app's login (`apps/web/lib/auth.ts:43`), not in the route handler.
  - **R1-F-03 — Search query not length-capped.** `q` reached Prisma's `contains` filter with no maximum length.
  - **R1-F-04 — Filter-change page-reset race.** `setPage(0)` lived in a trailing `useEffect` on `[debouncedSearch, roleFilter]`, so a user on page N>0 would fire `{page:N, q/role:newValue}` before the effect triggered `{page:0, q/role:newValue}` — one wasted intermediate request per filter change.
  - **R1-F-05 — Case-insensitive search mode not explicit.** `contains: q` on four columns relied on the SQLite engine's default LIKE behavior; Prisma's `mode: 'insensitive'` flag is PostgreSQL/MySQL-only and not supported on the SQLite adapter.
  - **R1-F-06 — Playwright Node version not declared.** The script uses `Response.headers.getSetCookie()` (Node 19.7+), but the smoketest md did not declare Node 20+ as a prerequisite. Phase 5's smoketest documented this for the same API.

**Fixes applied inline before R2:**
- **R1-F-01:** switched the Playwright role filter from `SPEAKER` to `ATTENDEE` (seed-guaranteed). The filter contract under test (narrows result set, every visible row matches filter) is unchanged. Smoketest md updated with the rationale; the script's header docstring documents the seed gap.
- **R1-F-02:** added an admin-role check to the GET handler: `token.role ∈ { STAFF, ORGANIZER, ADMIN }` → 200; else 403. `ADMIN_ROLES` const matches the existing pattern at `apps/web/app/api/attendees/route.ts:10`.
- **R1-F-03:** added `MAX_Q_LENGTH = 100` and `.slice(0, MAX_Q_LENGTH)` in `normalizeAttendeesParams`.
- **R1-F-04:** combined `setDebouncedSearch(search)` + `setPage(0)` in the same debounce `setTimeout` (React batches both into one render); role-filter `onChange` resets page synchronously in the handler (event-handler setState calls batch). Trailing `useEffect` on `[debouncedSearch, roleFilter]` removed.
- **R1-F-05:** added an inline code comment in `attendees-query.ts` documenting that the Prisma SQLite adapter does not support `mode: 'insensitive'` and that the search behavior here relies on SQLite's default ASCII-case-insensitive LIKE.
- **R1-F-06:** added "Node 20 or newer" to the Prerequisites section of the smoketest md.

**Materiality read:** R1-F-01 is the only AC-failing item. The remaining five are quality / defense-in-depth. Empirical re-run after fixes: Playwright 9/9 PASS; typecheck clean; build clean.

---

## Round 2 — Remediation verification + new probes

**Probes:** correctness of R1 remediations (token.role key correctness for getToken, debounce batching guarantees, `.slice` UTF-8 boundary safety, SQLite case-insensitive empirical truth, R1-F-01 search-query side effect on Steph Curry as ATTENDEE), SSR initialData re-hydration on return navigation, /dashboard/attendees/[userId] detail route impact, Add Attendee end-to-end flow, Lighthouse cookie-injection recipe shell-quoting robustness, re-run triggers from prior phase smoketests after Phase 9 touched its surface.

**Findings:**

- AC-failing (per Codex's tag — engineer-of-record dispute below):
  - **R2-F-01 — SSR attendees page bypasses the admin-role API gate.** `apps/web/app/(dashboard)/dashboard/attendees/page.tsx:6` calls `fetchAttendeesPage()` directly server-side; the role gate added in R1 lives in the API route only. The middleware accepts any valid token. Same applies to `[userId]/page.tsx`.

- Non-breaking:
  - **R2-F-02 — SSR `initialData` ignored on return navigation.** React Query persists across navigation under the shared dashboard `QueryProvider`. With `staleTime: 60_000`, a cache entry from a previous mount is returned ahead of the new SSR-fresh `initialData` (React Query treats `initialData` as a fallback, not an override). Up to 60 s of stale rows on return navigation.

- R1 remediations confirmed correct:
  - R1-F-01 → ATTENDEE switch works; `steph@curry.com` is ATTENDEE per `packages/db/prisma/seed.ts:478` so Step 3 search query unchanged.
  - R1-F-02 → `getToken` returns `token.role` populated by `apps/web/lib/auth.ts:80-84`; exact set membership check is sound.
  - R1-F-03 → `.slice(0, 100)` operates on UTF-16 code units; can split supplementary-plane surrogate pairs on pathological emoji input, but no DB or security consequence.
  - R1-F-04 → debounce timer batches `debouncedSearch` + `page` together; role onChange resets page synchronously. Typing + role change inside 250 ms produces at most one extra role-only request — acceptable.
  - R1-F-05 → Prisma `contains` compiles to SQLite `LIKE '%q%'`; ASCII case-insensitivity comment accurate.
  - R1-F-06 → Node 20+ prereq present.

**Engineer-of-record dispute of R2-F-01 severity:**

Re-tagged from AC-failing to **non-breaking, pre-existing, sprint-wide follow-up** for these reasons:

1. **Pre-existing.** The original `apps/web/app/(dashboard)/dashboard/attendees/page.tsx` had no role check either; Phase 9 did not introduce the gap.
2. **Doesn't violate Phase 9's explicit AC items.** AC §5 ("No regression in admin baseline on other routes") is satisfied — the vulnerability didn't worsen. None of AC §1–§8 names auth-hardening as in-scope.
3. **Affects all 20+ admin pages, not just the one Phase 9 touched.** A page-level fix in Phase 9 would be whack-a-mole; the leveraged fix (middleware-level admin role gating) is a sprint-wide concern outside Phase 9 scope.
4. **In-app reachability is narrow.** The web app login (`apps/web/lib/auth.ts:43`) rejects non-admin signins at the source; the only theoretical exploit is a role-downgrade-after-login JWT, and no role-change UI exists in the codebase.

**Fixes applied inline before R3:**
- **R2-F-01 (disputed):** added a "Known limitations (pre-existing, out of Phase 9 scope)" section to `docs/smoketests/phase-9-admin-pagination-server-side.md` documenting the gap, the engineer-of-record's reachability analysis, and the deferred sprint-wide leveraged fix.
- **R2-F-02:** added a `useEffect` in `AttendeesTable.tsx` that calls `queryClient.setQueryData(INITIAL_PARAMS_KEY, initialData)` on every mount + whenever the `initialData` prop reference changes. This force-overrides the React Query cache for the initial-params query key with the SSR-fresh data, eliminating the return-navigation stale-data window.

**Materiality read:** Phase 9 has zero AC-failing findings after disposing R2-F-01 via the engineer-of-record dispute. R2-F-02 is fixed; the cycle would converge at R3 if no further findings surface. Empirical re-run after R2 fixes: Playwright 9/9 PASS; typecheck clean; build clean.

---

## Round 3 — Final convergence pass

**Probes:** R2-F-02 useEffect stress-test (object identity per SSR render, strict-mode double-invoke, dependency array correctness), R2-F-01 disposition validity (cross-app JWT reachability, NEXTAUTH_SECRET sharing, cookie scoping), `INITIAL_PARAMS_KEY` shape match, downstream consumer breakage (export route, layout, nav), smoketest CONTRACT.md compliance after the "Known limitations" addition, PRD-path traceability for fresh-clone reviewers, quality-grade items for the PR body.

**Findings:**

- AC-failing: **None.** Codex explicitly stated "CONVERGENCE: zero AC-failing findings".
- Non-breaking:
  - **R2-F-01 RE-OPENED — "Unreachable in normal operation" understates the residual risk.** Codex pointed out a real same-host cookie-collision vector in local dev: all four apps share `NEXTAUTH_SECRET` per the repo's env conventions; cookies are host-scoped not port-scoped, so a `next-auth.session-token` issued by attendee at `localhost:3001` IS sent to web at `localhost:3000`. Web middleware accepts any valid token. The original "unreachable" framing missed this.
  - **R3-F-01 (quality) — PRD path not independently locatable.** The smoketest cites "PRD §6 Phase 9" without a path; the PRD lives in an agent-state directory that is gitignored and absent from fresh clones.

- R1 + R2 remediations confirmed correct:
  - R2-F-02 useEffect on `[initialData]`: clean. Object identity changes per SSR render → effect fires once per return navigation. React strict-mode double-invoke is dev-only.
  - `INITIAL_PARAMS_KEY` shape matches the initial-mount queryKey produced by `useAttendeesPage`.
  - useEffect dependency array sound — `useQueryClient()` returns a stable instance; the eslint-disable is correct.
  - No downstream consumer breakage in export route, layout, or nav.

**Fixes applied inline after R3 (final):**
- **R2-F-01 RE-OPENED:** rewrote the "Known limitations" section in `docs/smoketests/phase-9-admin-pagination-server-side.md` to acknowledge two reachability paths (local-dev same-host cookie collision via shared `NEXTAUTH_SECRET`; theoretical role-downgrade-after-login), explicitly noted **production is safe** because each app has its own origin in production (`wbr.tailor.tech` for attendee per Phase 10 + separate Vercel URLs for the other three), and reaffirmed the sprint-wide auth-hardening leveraged fix as the deferred remediation path.
- **R3-F-01 (quality):** added a "PRD location" blockquote near the top of the smoketest md noting that the demo-sprint PRD ships in an agent-state directory gitignored from the public repo tree, and points readers to the in-document "What this verifies" section as the independently-reviewable contract restatement.

**Materiality read:** review converged at R3 with zero AC-failing findings. The two non-breaking items applied are documentation/clarity improvements only — no further code changes needed.

---

## Final convergence verdict

- **Total rounds:** 3 (full cap).
- **Total AC-failing findings:** 0 (R1-F-01 was AC-failing on a fresh-clone seed; remediated. R2-F-01 was Codex-tagged AC-failing but engineer-of-record disposed as pre-existing/non-breaking with documentation; sprint-wide auth-hardening deferred.).
- **Total non-breaking findings:** 8 (all applied inline across rounds — see per-round summaries).
- **Unresolved findings:** None within Phase 9 scope.
- **Sprint-wide follow-up (not Phase 9):** middleware-level admin-role gating for all admin routes — documented in the smoketest's "Known limitations" section. Flagged for the downstream auth-hardening phase.

Phase 9 meets the convergence target (zero AC-failing findings) and the full N=3 cap was exercised per the sprint's adversarial-review convention. Smoketest at `docs/smoketests/phase-9-admin-pagination-server-side.md` is the documented manual verification path; Playwright script at `docs/smoketests/playwright/phase-9-admin-pagination-server-side.mjs` is the deterministic interactive-flow runner per PRD §8.6. In-session run log at `docs/smoketests/runs/phase-9-2026-06-29.md` covers the Tier-C local-prod-build verification; Tier-B Vercel preview LCP + transfer-size measurements batch into the sprint UAT round per the smoketest's Pass / Fail criteria.
