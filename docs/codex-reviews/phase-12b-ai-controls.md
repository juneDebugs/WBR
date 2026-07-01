# Phase 12b — Codex Adversarial Review Log

**Phase:** 12b — AI surface production controls (rate limit + cost caps).
**Codex N:** 3 (default; rate-limit failure modes are narrower than the AI failure modes that motivated 12a's N=5).
**Branch:** `phase-12b-ai-controls`.
**Base:** `main` @ `a0f3006` (Phase 12a merged).
**Reviewer:** Codex (GPT-5.x class via `codex:codex-rescue` forwarder).
**Adjudicator:** engineer-of-record (Claude Code on behalf of).

Findings adjudication legend:

- **ACCEPTED** — real defect, applied fix at end of review cycle per `feedback_commit_at_end_of_review_cycle`.
- **REJECTED** — false positive; rationale below.
- **DEFERRED** — real signal, but out of Phase 12b scope; captured for follow-up.

---

## Deferred-items list carried into each round

The reviewer was told these are NOT Phase 12b scope; any finding that names one is REJECTED with pointer:

- Upstash / Redis migration (post-sprint architectural).
- System-wide rate-limit gap closure (Phase 12b closes only the Draft intro surface).
- Admin `sponsors/remind` route rate limits (separate surface; needs its own PRD entry).
- Cost dashboards / reports beyond the `costEstimateUsd` column.
- Env-var promotion of the cap constants.
- Prisma migration history introduction (WBR convention is `prisma db push`).
- Cross-tab live-updating quota display.
- Phase 12c / later AI surfaces.

## PRD-locked-behavior list carried into each round

Any finding that questions one of these is REJECTED as PRD-locked:

- Cap numbers: 5/min burst, 20/day user, 1000/day global.
- Response matrix: burst→429 `burst_limit`, user-daily→429 `daily_limit`, global-daily→503 `global_limit`.
- Cap-hit copy strings (verbatim, including em-dash).
- Idempotency window: 5 s. Rolling windows: 60 s burst, 24 h daily.
- Race semantics: unique constraint on `(userId, attendeeId, idempotencyKey)`, first-write-wins; both racing AI calls do fire.
- Client generates fresh UUID per Draft intro click.
- Order of route checks: dedup → burst → user-daily → global-daily → AI → insertOrDedup.
- `AiCallLog` has no FK relations (matches `EmailLog`).
- gpt-4o-mini pricing constants ($0.15 / $0.60 per 1M tokens).
- Cap constants as code (not env vars).
- "Resets at midnight" copy is aspirational vs. rolling 24 h — do not flag as misleading.

---

## Round 1

**Prompt shape:** narrow-scope, targeting bugs + contract compliance + data integrity + client-server invariants + Playwright defects + doc drift. Repo-root `git diff` as source. Forwarder duration: 244 s (one call).

### Findings

**R1-F1 — Expired idempotency-key collision returns stale payload** [AC_FAILING].
- File: `apps/sponsor/lib/ai-controls.ts:187-196` (the P2002 fallback in `insertOrDedup`).
- What: The fallback `findFirst` did not filter by `expiresAt > now`. A retry that reuses the same `idempotencyKey` past the 5 s window would miss `findFreshIdempotencyHit` (which does filter on `expiresAt`), fire a fresh AI call, hit the permanent unique constraint on `(userId, attendeeId, idempotencyKey)`, then return the ancient stored payload — no new row written, cost uncounted, client sees minutes/hours-old content.
- Why it matters: In practice the client generates a fresh UUID per click so this path is only reachable via a client bug or a retry-loop, but the code path is real and the payload staleness is a correctness defect.

**R1-F2 — Post-AI audit write failure returns 200 without a row** [AC_FAILING].
- File: `apps/sponsor/app/api/recommendations/[attendeeId]/draft-intro/route.ts:290-298` (the outer catch after `insertOrDedup`).
- What: The catch returned `NextResponse.json(output)` — a 200 with a fresh, unlogged AI payload. This violates the PRD AC "AiCallLog row written on every successful AI call" — a real DB flake could ship an intro with zero audit trail.
- Why it matters: Cost-attribution + cap-accounting both depend on the log being complete. A 200 without a row is an untracked AI call.

### Adjudication

- **R1-F1: ACCEPTED.** Added `expiresAt: { gt: new Date() }` to the P2002 fallback SELECT in `ai-controls.ts`. Expired collisions now leave `winner` null → the P2002 error re-throws → the route's outer catch normalizes to pattern γ.
- **R1-F2: ACCEPTED.** Route's outer catch now returns `502 { error: "ai_unavailable" }` instead of the fresh `output`. Loses the AI-token spend on this rare path — accepted trade-off in favor of AC compliance.
- The two fixes compose: an expired-key collision now surfaces as a 502 ai_unavailable, matching the AC contract that every successful (200) response has a corresponding audit row.

### Not flagged by Codex — no findings in

- Category 3 (data integrity) — SQLite/Turso index + unique-constraint semantics OK.
- Category 4 (client-server invariants) — quota response shape matches, modal handles malformed responses via pattern γ.
- Category 5 (Playwright defects) — script parses (verified with `node --check` pre-Codex per handoff M4).
- Category 6 (doc drift) — architecture.md + decisions.md accurate.

Codex did not emit explicit "no findings" lines for categories 1 + 2 despite the prompt instruction; both surfaced findings fall under those categories, so the omission is inferable.

---

## Round 2

**Prompt shape:** narrow probes on `IntroDraftModal.tsx` (3 questions) + `phase-12b-ai-controls.mjs` (2 questions). First R2 attempt was broader-scope and hit the 74 s forwarder timeout — Codex returned a placeholder ("task running in background") which per handoff M6 is never followed up. Retried with narrow scope; 48 s completion.

### Findings

**R2-F1 — Modal doesn't reset local state on prop change** [NON_BREAKING].
- File: `apps/sponsor/components/IntroDraftModal.tsx:67-125` (the `useEffect`).
- What: When the effect re-runs (e.g. parent re-uses the modal instance with a different attendee), `phase`/`message`/`groundedFields`/`wasAiFailed`/`confirmOpen` aren't cleared. A pre-hydration render could briefly show the prior attendee's draft in the textarea and (worse) allow sending stale text against the new attendee.id before the new fetch settles.
- Why it matters: In our current design the modal backdrop (`fixed inset-0 z-50 bg-black/40`) blocks clicks on underlying cards while the modal is open, so this defect is not reachable via UI. Defense in depth is cheap insurance if the backdrop invariant is ever broken.

**R2-F2 — Playwright `.first()` doesn't guarantee same-card second click** [NON_BREAKING].
- File: `docs/smoketests/playwright/phase-12b-ai-controls.mjs:150-153` (via the second click in `runIdempotencyKeyMode`).
- What: `waitForEnabledDraftButton` picks the first-in-DOM enabled Draft-intro button. If tanstack-query invalidates between clicks and refetches recommendations with a different order, the second click could hit a different card. The smoketest would pass, but not for the "fresh key per SAME-card click" reason.
- Why it matters: In our mocked-quota + no-quota-mutation setup, refetch shouldn't reorder anything. Still, capturing the first card's attendee-name identity and scoping the second lookup to that name closes the loophole.

### Adjudication

- **R2-F1: ACCEPTED.** Added a state-reset block at the top of the `useEffect` (setPhase loading, message '', groundedFields [], wasAiFailed false, confirmOpen false) so re-mounts start fresh regardless of what the prior render left behind.
- **R2-F2: ACCEPTED.** After the first click captures the modal's attendee-name from its H2 heading, the second click's locator scopes to a card `div` containing that name filtered by an enabled Draft-intro button. Explicit failure branch if the same card can't be re-located.

### Not flagged by Codex — no findings in

- The narrow probes on `useEffect` deps stability (Probe A1), `capHit` phase transition correctness (Probe A2), and Playwright regex `text=/AI draft(s)? remaining today/` validity (Probe B1). Two of the three A-probe questions and one of the two B-probe questions returned clean.

---

## Round 3

**Prompt shape:** four narrow probes covering the files R1 + R2 didn't hit — `RecommendedAttendees.tsx`, `quota/route.ts`, `schema.prisma` AiCallLog block, `decisions.md` + `architecture.md` Phase 12b entries. 112 s completion.

### Findings

**R3-F1 — Quota DB failure returns HTTP 200** [NON_BREAKING].
- File: `apps/sponsor/app/api/recommendations/quota/route.ts:38-44` (the outer catch).
- What: On DB failure the route logged + returned `{ remaining: null, capHit: null }` with HTTP 200. Status-based monitoring can't see the quota-side outage; only the downstream draft-intro POST's 502 exposes it.
- Why it matters: WBR has no Sentry / Datadog wired in today (see architecture.md known-limitations), so the immediate impact is small — but a future observability layer that watches 5xx rates would silently miss quota-endpoint outages.

**R3-F2 — 4-column index redundant with unique constraint** [NON_BREAKING].
- File: `packages/db/prisma/schema.prisma` (the `AiCallLog` `@@index([userId, attendeeId, idempotencyKey, expiresAt])`).
- What: The 4-column index is a prefix extension of the unique constraint's index; the dedup query narrows to at most one row via the unique index already, so the extra column adds write/storage overhead without lookup benefit.
- Why it matters: Minor storage + write-amp waste per AiCallLog row.

### Adjudication

- **R3-F1: ACCEPTED.** Changed the fail-open catch to return `NextResponse.json(..., { status: 500 })`. Client hook (`useAiQuota`) already treats non-ok as `{ remaining: null, capHit: null }`, so UX behavior is unchanged; the 500 exposes the DB outage to any future status-based monitoring.
- **R3-F2: REJECTED — PRD-locked.** The engineer-local PRD § Phase 12b explicitly enumerates the three composite indexes and names this one specifically ("for dedup lookups"). The rationale given in the PRD is technically incorrect (the unique index already covers dedup) but the PRD's index list is prescriptive, and diverging from it mid-sprint is a finding-protocol Step 3 event (update PRD first). Deferred to a post-Phase-12b PRD amendment; the write-amp cost per row is small enough that in-sprint churn isn't worth it.

### Not flagged by Codex — no findings in

- Probe A (RecommendedAttendees state machine — no race conditions in `pendingKey`/`draftTarget` state; `useAiQuota` loading/error states OK; `blockers > capHit > default` label precedence acceptable).
- Probe D (docs.md drift — `decisions.md` § Phase 12b + `architecture.md` known-limitations bullet both accurate).

---

## Convergence summary

**Rounds completed:** 3 (default N per PRD § Phase 12b; not extended to N=5 because rate-limit failure modes are narrower than AI failure modes).

**Findings breakdown:**

| Round | AC_FAILING | NON_BREAKING | Rejected | Fresh vs propagation |
|---|---|---|---|---|
| R1 | 2 accepted | 0 | 0 | 2 fresh (expired-key P2002 fallback; audit-write-failure returning 200) |
| R2 | 0 | 2 accepted | 0 | 2 fresh (modal state carry-across-mounts; Playwright same-card guarantee) |
| R3 | 0 | 1 accepted + 1 rejected | 1 | 2 fresh (quota HTTP status observability; redundant AiCallLog index) |

**Total:** 4 findings applied (2 AC_FAILING + 2 NON_BREAKING), 1 rejected with rationale.

**Highest-signal round:** R1 — both R1 findings closed AC gaps (spec-locked contracts that the initial implementation missed). R2 caught defensive-programming gaps in areas R1 didn't touch. R3 was clean on the state machine + docs and caught one observability nit + one PRD-locked flag.

**Signal quality:** R1 > R2 > R3 (expected — R1 targets the largest surface). No AC_FAILING finding emerged in R2 or R3, consistent with the R1 findings + fixes fully closing the AC gaps.

**Convergence:** R2 and R3 surfaced only NON_BREAKING findings, all addressable in-place with small edits. No cross-file propagation gaps observed. Codex verifier register aligned with the PRD-locked list every round (except R3-F2 which is a soft PRD violation that Codex correctly flagged as an engineering observation).

**One PRD amendment candidate deferred to post-Phase-12b:** remove the `(userId, attendeeId, idempotencyKey, expiresAt)` index from the AiCallLog model — it's redundant with the unique constraint's index. Small write-amp saving per row; PRD § Phase 12b's index list would need editing.

**Commit posture:** ready. Single commit at end of review cycle per `feedback_commit_at_end_of_review_cycle`.
