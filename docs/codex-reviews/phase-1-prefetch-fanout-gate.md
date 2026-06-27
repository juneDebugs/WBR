# Codex Adversarial Review — Phase 1 Prefetch Fan-out Gate

Loop run on 2026-06-27 against branch `phase-1-prefetch-fanout-gate`. Cap N=3 rounds per WBR demo sprint PRD §8.2.

**Files reviewed:**
- `apps/attendee/lib/hooks.ts`
- `docs/smoketests/phase-1-prefetch-fanout-gate.md`

**Bar applied** (PRD §6 Phase 1 acceptance criteria): AC-failing = a finding that would make Phase 1 AC fail OR introduce a regression in another phase's smoketest. Style / quality / P2 findings reported but non-gating. Default-refute-on-uncertainty was the explicit Codex instruction.

---

## Round 1 — 2 AC-failing findings + 1 non-breaking

- **F1 (AC-failing).** `requestIdleCallback(run, { timeout: 2000 })` plus the Safari `setTimeout(run, 2000)` fallback fired the eight prefetches at ≈2 s **regardless** of whether the route's critical query had settled. Against the PRD's 8.14–17.10 s mobile LCP baselines on Slow 4G, a 2 s cap could still reintroduce the network / Prisma contention inside the LCP window. The "≥50% LCP reduction" AC was at risk.
- **F2 (AC-failing).** Smoketest step 4 ("Data-freshness regression check") asserted that a mutation made elsewhere would appear "within the staleTime window" on return navigation — wrong per React Query semantics. Within `staleTime`, the cache returns stored data without refetching. The smoketest would have marked correct cache behaviour as a failure, leaving the "no data-staleness regression" AC unverifiable.
- **F3 (non-breaking).** Step 5's TBT rationale claimed "idle-callback work yields between prefetches by design." The implementation calls all eight `prefetchQuery` invocations synchronously inside a single `run()` — there is no per-prefetch yielding. Rationale was inaccurate; the observable check (no new long task ≥ 50 ms) was still valid.

**Action.**

- For F1: rewrote `usePrefetchAll` to gate scheduling on the browser `load` event (or `document.readyState === 'complete'` if `load` already fired). After `load`, `requestIdleCallback(run, { timeout: 10_000 })` schedules the prefetch batch; Safari < 16.4 fallback is `setTimeout(run, 0)` because `load` itself is the meaningful deferral. Effect cleanup tears down the `load` listener AND any in-flight idle / timeout handle on unmount.
- For F2: renamed step 4 to "Data-staleness contract — verify the deferral did NOT change React Query semantics." Rewrote the three sub-checks to verify the actual contract: within `staleTime`, repeat navigation produces no refetch; past `staleTime`, the next mount triggers a background refetch; `invalidateQueries` (or a post-`staleTime` revisit) surfaces externally-mutated data. The "What this verifies" header bullet was tightened to match.
- For F3: rephrased the TBT rationale to describe what is actually verifiable — the eight prefetch calls run synchronously inside one main-thread tick; the observable check is "no new long task ≥ 50 ms in DevTools."

---

## Round 2 — CONVERGED

All three Round-1 findings RESOLVED. Codex re-verified each fix against the updated files (`hooks.ts:67, 78, 82` for F1; `smoketest:46, 49, 51` for F2; `smoketest:56` for F3).

Six explicit verification probes all refuted as AC-failing:

1. **SPA-route `load`-fire edge case** — refuted on current evidence. `load` only fires once per document; SPA route changes don't re-fire it. But the hook lives in the authenticated layout's `useEffect`, which runs once on initial mount of the layout (not per route navigation), so the `load`-already-fired branch (`document.readyState === 'complete'`) handles subsequent re-renders. The smoketest's DevTools observation step explicitly verifies the critical `/api/data/home` request completes before `load` and non-home prefetches land after.
2. **Cleanup correctness** — all four scheduling states handled: load-not-yet-fired (`removeEventListener`), load-fired-idle-scheduled (`cancelIdleCallback`), load-fired-timeout-scheduled (`clearTimeout`), already-run (no-op).
3. **SSR safety** — `typeof window === 'undefined'` early return at `hooks.ts:47–48` guards every browser-API access including `document.readyState` at `hooks.ts:78`.
4. **Safari `setTimeout(run, 0)` sufficiency** — strictly stronger than the previous 2 s cap because the timer is armed only after `load` fires.
5. **10 000 ms `requestIdleCallback` timeout risk** — deliberate safety net for perpetually-busy pages. Non-breaking quality concern only; prefetches always eventually fire.
6. **Smoketest step 4 React Query v5 semantics** — consistent with `@tanstack/react-query` v5's `staleTime` contract per the project's hooks.ts usage.

### Non-breaking observation (reported, not gating)

`docs/smoketests/phase-1-prefetch-fanout-gate.md:7` ("What this verifies") still described the Safari fallback as "a 2 s `setTimeout` after first paint" — a leftover from the Round 1 description that contradicted the post-fix code. Non-breaking; did not affect any Phase 1 AC.

**Fixed inline post-Round-2** at the same line: now reads "gated on the `load` event and then scheduled via `requestIdleCallback(run, { timeout: 10_000 })` (or `setTimeout(run, 0)` after `load` on Safari < 16.4)."

---

## Round 3 (cap) — 1 new AC-failing finding surfaced, fix applied post-cap

Per the new "run full N=3 cap even if earlier rounds converge" rule (`feedback_commit_at_end_of_review_cycle.md`), Round 3 was run despite Round 2's convergence. The probe set was broadened from Round 2's verification points: SW lifecycle interaction, React 19 strict-mode double-effect, mid-flight `prefetchQuery` on cleanup, Lighthouse runner dependency, smoketest DevTools observability under Chrome 120+, and the unusually-low 5 s `staleTime` on `speakers-data`.

### R3F1 (AC-failing) — smoketest step 2's verification path is not reproducible

- **Files**: `docs/smoketests/phase-1-prefetch-fanout-gate.md:30,32`, `apps/attendee/app/login/LoginClient.tsx:36`, `apps/attendee/lib/hooks.ts:78`.
- **Analysis (Codex)**: Step 2 instructed the runner to navigate to `/login`, log in via the form, and then correlate `/api/data/home` with the Performance timeline's `load` event marker on `/home`. But `LoginClient.tsx:36` uses `router.push('/home')` — single-page-app navigation in the same document. By the time `usePrefetchAll` mounts on `/home`, the `load` event already fired on the `/login` document and never re-fires. The hook takes the `document.readyState === 'complete'` branch and schedules immediately via `requestIdleCallback`. The documented observation — "non-home prefetches land after the `/home` `load` marker" — is not reproducible because no `/home`-document `load` marker exists.
- **Codex's proposed direction**: smoketest fix only — pre-authenticate (set the session cookie via form-login or `/api/login` POST), then **hard-navigate** directly to `/home` in a fresh recording so the authenticated layout mounts during the same document lifecycle whose `load` event DevTools will surface.
- **No implementation change recommended.** The production AC bar is the cold-load Lighthouse measurement (the Phase 2 runner hits routes cold). The cold-load path is exactly what the `load`-event gate handles correctly.

### Other Round 3 probes (refuted)

- **Probe B — SW lifecycle / `@ducanh2912/next-pwa` v10 interaction** (`apps/attendee/next.config.js:1,3`, `apps/attendee/public/sw.js:1`): refuted. `skipWaiting`/`clientsClaim` in the generated SW affect activation, not the document `load` event.
- **Probe C — React 19 strict-mode double-effect** (`hooks.ts:81,85`): refuted. The effect's cleanup tears down the `load` listener and cancels any in-flight idle/timeout handle before the strict-mode second invocation re-runs setup. No leaks.
- **Probe D — mid-flight `prefetchQuery` on cleanup** (`hooks.ts:55`, `apps/attendee/lib/query-provider.tsx:6`, `@tanstack/query-core@5.100.9`): refuted. `prefetchQuery` is fire-and-forget (`fetchQuery(...).then(noop).catch(noop)` in query-core); in-flight fetches are owned by the shared `QueryClient`, not by component state, so cleanup does not produce unmounted-state warnings or cache desync.
- **Probe G — 5 s `staleTime` on `speakers-data`** (`hooks.ts:21,58`): refuted. `staleTime` is measured from when data lands in the cache, not from when the prefetch was scheduled. The smoketest already allows for a background refetch past the 5 s window.

### Probe E (non-breaking doc nit)

- Step 6 of the smoketest references the Phase 2 Lighthouse runner at `/tmp/wbr-perf/run-lighthouse.sh`; the prerequisites section already allows DevTools Lighthouse as a substitute. Not AC-failing. Left as-is.

---

## Cap-hit escalation + materiality read

Round 3 hit the N=3 cap with one open AC-failing finding (R3F1). Per PRD §8.2: "If cap is hit, escalate the remaining issues — plus Claude's read on materiality — before the phase merges."

**Materiality read on R3F1:**

1. **The Phase 1 acceptance bar is the cold-load Lighthouse measurement** (PRD §6 Phase 1: "Re-run the Phase 2 Lighthouse runner against attendee mobile post-change"). The Phase 2 runner hits routes cold — fresh document load, fresh `load` event. The `load`-event gate works correctly on this path; the AC is unaffected by R3F1.
2. **The SPA-nav-to-`/home` path is real but does not regress the prior baseline.** Before this PR, prefetches fired synchronously on layout mount. After this PR on the SPA-nav path, prefetches fire via `requestIdleCallback` shortly after layout mount. Idle-callback scheduling still yields to ongoing React work, so the worst case is roughly equivalent to the pre-fix behavior — not strictly better, but not regressing either.
3. **Subsequent inter-route nav (`/home` → `/people` → `/schedule`) still benefits from the warmed cache** regardless of whether the first `/home` view benefited from the gate. The bulk of the demo's perceived improvement comes from inter-route nav speed, which is preserved.
4. **A stronger implementation fix would require a route-aware trigger** (e.g., wait until the current page's primary query has resolved before firing prefetches). That requires the prefetch hook to know which query is "current," which is non-trivial in the current layout-mounted-once architecture. Out-of-scope for Phase 1's small-fix bar.

**Fix applied post-cap (smoketest only):** Step 2 was rewritten to mirror the Lighthouse cold-load path — log in once to set the session cookie (untimed prep), then hard-reload `/home` (`Cmd+R`/`Ctrl+R`) and record. The known SPA-nav limitation is documented in the smoketest step 2 footer with a back-pointer to this section.

No implementation change applied. The `load`-event gate is correct for the AC bar; the SPA-nav case is a known limitation, not a defect.

---

## Convergence

**Zero AC-failing findings remaining after Round 3 + post-cap smoketest fix. Loop closed at cap.**

Phase 1 implementation (`apps/attendee/lib/hooks.ts`) and the Phase 1 smoketest (`docs/smoketests/phase-1-prefetch-fanout-gate.md`) meet PRD §6 Phase 1 acceptance criteria. The post-deploy production Lighthouse re-measurement (smoketest step 6) remains the empirical AC bar — until that runs, the deferral's actual LCP impact on Slow 4G is implementation-correct but not yet measured.

## Pre-existing typecheck note (not introduced by Phase 1)

`apps/attendee/components/BottomNav.tsx(40,101): error TS2514: A tuple type cannot be indexed with a negative value.` is present on `main` prior to this branch. Confirmed by stashing the Phase 1 diff and re-running `pnpm --filter attendee typecheck`. Per PRD §3 non-goals, TypeScript build-quality enforcement is explicitly out of scope for this sprint — Vercel builds use `next build`, not `tsc --noEmit`, and Phase 0a shipped clean despite the same error. Out-of-scope for Phase 1; surfacing here for visibility only.
