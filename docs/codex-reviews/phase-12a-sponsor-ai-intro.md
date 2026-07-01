# Codex Adversarial Review — Phase 12a Sponsor Portal AI Intro Drafter

Loop run on 2026-07-01 (US PT) against branch `phase-12a-sponsor-ai-intro` (cut from main at `46a7b81` after the Phase 13 merge). Cap N=5 rounds per PRD §8.2 phase-specific override (AI failure-mode space warrants deeper review than the default N=3). Cap-hit handling per `feedback_commit_at_end_of_review_cycle`: commit once at the end of the cycle with surviving-finding materiality read inline.

**Files reviewed:**

NEW:
- `apps/sponsor/lib/ai-intro.ts` — Zod schema + prompt builder + `isPresent` / `canDraft` / `getCanDraftBlockers` / `hasSparseInputs` / `groundedFieldsIncomplete` / `templateFallback` helpers + threshold constants.
- `apps/sponsor/app/api/recommendations/[attendeeId]/draft-intro/route.ts` — POST route; feature-flag gated; role-gated (sponsor users); AI SDK v7 `generateText` + `Output.object({schema})`; `gpt-4o-mini`; `temperature: 0.2`, `maxOutputTokens: 200`; pattern γ 502 on AI failure.
- `apps/sponsor/components/IntroDraftModal.tsx` — loading/ready/failed/sending/sendError state machine modal; provenance line; tiered friction with pattern γ bypass; inline send-error banner; character counter.
- `apps/sponsor/.env.local.example` — env template with `OPENAI_API_KEY` + feature flags.
- `docs/smoketests/phase-12a-sponsor-ai-intro.md` — 6 contract paths + 1 perf-bar per CONTRACT.md.
- `docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs` — pattern γ AI-failure path via `page.route()`.
- `docs/codex-reviews/phase-12a-sponsor-ai-intro.md` — this document.
- (Prior session, uncommitted:) `CONTEXT.md`, `docs/adr/0005-ai-intros-via-meeting-request-message.md`.

MODIFIED:
- `apps/sponsor/components/DashboardView.tsx` — `scoreAttendees()` local mapper adds `bio: a.bio ?? null`; threads sponsor prop into `RecommendedAttendees`.
- `apps/sponsor/components/RecommendedAttendees.tsx` — `Attendee` interface extended with `bio: string | null`; new sponsor prop; Draft intro secondary button + `canDraft` gate + `getCanDraftBlockers` tooltip; **fixed pre-existing endpoint typo** `/api/meeting-requests` → `/api/request-meeting`; modal open on Draft intro click.
- `apps/sponsor/package.json` — added `ai@^7.0.9`, `@ai-sdk/openai@^4.0.4`, `zod@^4.4.3`.
- `docs/architecture.md` — AI section edits (at-a-glance row, external-surfaces bullet, sponsor-app description, env-vars section, known-limitations rate-limit gap entry).
- `docs/decisions.md` — new Phase 12a + Phase 12b entries under AI section.

AMENDED (gitignored, not in `git diff` but reviewed in-place):
- Engineer-local sprint PRD § Phase 12a — v7 API notes; earlier session's `Output.object` casing hedge corrected in-review.
- Engineer-local sprint plan § Phase 12a — mirror of PRD amendments.

**Bar applied:** AC-failing = would make PRD §6 Phase 12a AC fail OR violate the smoketest CONTRACT (§1 categories, §3 banned language, §1.2 tier D invalid) OR trip the Tailor pre-commit blocklist on committed content (`feedback_tailor_commit_msg_blocklist`) OR fail PII compliance (`feedback_engineering_docs_no_pii_or_personality`) OR degrade the specific Phase 12a UX contracts (tiered friction shape E, pattern γ manual-send bypass, endpoint routing to `/api/request-meeting`, empty-field threshold ordering, provenance rendering). Style / quality / P2 findings reported but non-gating.

**Deferred to Phase 12b** (findings that name these items are hallucinations, NOT real gaps):
- Per-user daily rate cap (proposed 20 calls/day/user).
- Per-user burst rate cap (proposed 5 calls/minute/user).
- Global daily ceiling (proposed 1000 calls/day across all users).
- `AiCallLog` Prisma model + migration + per-call write with `costEstimateUsd`.
- Idempotency-key request deduplication.
- Cap-hit disabled-button states (`Daily limit reached`, `Slow down`, `AI temporarily unavailable`) — only the feature-flag-off "button absent" state ships in 12a.
- Cost-attribution telemetry beyond the kill-switch.

---

## Round 1 — 3 AC-failing findings applied + 2 rejected + open question

Codex R1 forwarded 5 findings, one of which was hedged with an open question about PRD text availability. Adjudications:

- **R1-F1** (AC-failing, ACCEPTED). `apps/sponsor/app/api/request-meeting/route.ts:19-28`. The idempotent-duplicate short-circuit returned the existing `MeetingRequest` without merging a newly-supplied `message`, so a Connect → Draft-intro sequence on the same target would drop the AI-drafted intro on the floor and leave the persisted row's `message` NULL — violating ADR 0005's storage contract for the Draft-intro flow.
- **R1-F2** (AC-failing, ACCEPTED). `apps/sponsor/components/IntroDraftModal.tsx` + `docs/smoketests/phase-12a-sponsor-ai-intro.md` Step 6. The textarea's `maxLength={MESSAGE_MAX_CHARS}` capped input at 1000 characters; the smoketest documented a DevTools workaround for exercising the server 400, but a canonical smoketest shouldn't require in-browser attribute mutation. The client cap is good UX, so the code stays; Step 6 moves into the Playwright script's new `send-error` mode using `page.route()` to mock a 400 from `/api/request-meeting`, mirroring Step 5's AI-failure interception pattern.
- **R1-F3** (AC-failing, REJECTED — false positive). Flagged the pre-existing `"Claude Haiku"` string at `docs/decisions.md:144` as a blocklist trip. Git diff verification: the amendment hunk starts at line 150 with 6-line default context, so the diff never touches or includes line 144. The pre-commit blocklist scans DIFF content, not full file content — pre-existing terms outside the diff hunk don't trip the hook. Confirmed by the file's own commit history (it has been committed successfully with that content before). No action.
- **R1-F4** (AC-failing, PARTIALLY ACCEPTED). `docs/smoketests/phase-12a-sponsor-ai-intro.md` Prerequisites section. Codex flagged both (a) named seed identities (`sponsor@shopify.com`, `spk-3`) and (b) a verbatim quoted attendee bio. (a) was rejected — precedent from `docs/smoketests/playwright/phase-14-mobile-header-imagery.mjs` and `docs/smoketests/playwright/phase-3-sponsor-preload-relocate.mjs` uses seeded named identities extensively, and those files are committed. Seed identities are synthetic test-account references, not disclosure of real users. (b) was accepted — the verbatim bio quote crossed into "user commentary or quotes" territory. Fix: reference the seed file for lookups; runner queries the DB directly for a matching bio-length row. This is more robust anyway — the seed can evolve without invalidating the smoketest.
- **R1-F5** (AC-failing, REJECTED — Codex hedged). `apps/sponsor/lib/ai-intro.ts:145` + `IntroDraftModal.tsx:86,132`. Codex flagged `groundedFieldsIncomplete = !groundedFields.includes('attendee.bio')` as over-triggering the low-confidence confirm modal on valid drafts that ground on non-bio fields (jobTitle, company, matchedSolutions). This is PRD-locked behavior per §6 Phase 12a Empty-field thresholds: an intro that omits bio grounding IS deemed lower-confidence per the locked contract. Codex's own hedge acknowledged that PRD §6 Phase 12a text wasn't in the review context — "worth verifying F-5 against the actual PRD wording before treating it as final." Verified: the lock is intentional. No action.

**Action.** R1-F1, R1-F2, R1-F4 applied:

- R1-F1: `/api/request-meeting/route.ts` idempotent branch now checks whether the incoming request supplied a message AND the existing record has a null message. If so, updates the row with the new message and returns the updated row. If both sides have messages, the existing one wins (early-sent intros are the source of truth; later drafts don't overwrite).
- R1-F2: Playwright script (`docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs`) extended with a `PHASE12A_MODE=send-error` mode. The new mode intercepts `POST /api/request-meeting` and returns a 400 with `{error: "Message too long (max 1000 chars)"}`, then asserts (a) inline banner rendered with server text, (b) textarea contents preserved, (c) Send button re-enabled, (d) modal did not auto-close. Smoketest Step 6 markdown rewritten to invoke this mode. The textarea's `maxLength` attribute stays in place — good UX and no longer blocks the smoketest.
- R1-F4: Prerequisites section rewritten to reference the seed file for account/bio-length lookups rather than embedding a verbatim bio quote. Step 3 rewritten to substitute `<attendee-id>` and `<sponsor-email>` placeholders driven by the runner's seed-file lookup rather than hard-coding one row.

---

## Round 2 — R1-F1 verified + 3 propagation-gap AC-failing findings applied + 0 fresh findings

Codex R2 verified R1-F1 (idempotent-duplicate message-merge) as correctly fixed and surfaced three propagation gaps from R1 fixes. All accepted; zero fresh findings.

- **R2-F1** (AC-failing, ACCEPTED). `docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs` send-error mode. R1-F2's textarea-preservation assertion checked only non-emptiness — a regression that mutated but did not clear the textarea would false-pass. Fix: snapshot the pre-send textarea value into `preSendValue` and check equality (`preservedValue === preSendValue`) after the intercepted 400 lands. Two distinct fail branches added — one for `preservedValue.trim() && !==` (mutation), one for empty-after-send (cleared).
- **R2-F2** (AC-failing, ACCEPTED). `docs/smoketests/phase-12a-sponsor-ai-intro.md:98` referenced a `--phase12a-send-error` CLI flag, but the Playwright script actually gates the mode via the `PHASE12A_MODE=send-error` env var. Additionally, both Step 5 and Step 6 pass criteria described a single combined success line, whereas the script emits multiple `ok()` lines (one per check). Fix: Step 6 rewritten to specify the env var and enumerate the five separate checks; Step 5 mirrored with its seven separate checks.
- **R2-F3** (AC-failing, ACCEPTED). `docs/smoketests/phase-12a-sponsor-ai-intro.md:70` retained a sponsor-specific verbatim tagline quote in Step 4 (`Shopify's is "Making commerce better for everyone", 37 chars`) — same class of over-line as R1-F4's bio quote but a spot the R1 cleanup missed. Fix: Step 4 rewritten to point at the DB for tagline lookup with a `<sponsor-email>` placeholder, and to describe the temporarily-shorten workflow abstractly.

**Action.** All three findings applied. Zero fresh findings. R1-F1 verified in place.

---

## Round 3 — 0 AC-failing findings + 4 non-breaking doc-drift findings (3 applied, 1 rejected)

Codex R3 returned zero AC-failing findings and zero propagation gaps. All four flagged items were non-breaking documentation drift. The four PRD-locked behaviors I explicitly asked Codex to sanity-check (module-scope `NEXT_PUBLIC_*` reference, `wasAiFailed` bypass, `AI_DRAFT_INTRO_ENABLED` client guard, sponsor-prop null-check) were re-verified as clean.

Codex forwarded only the referenced paths, not the full finding text. Adjudicated each by inspecting the cited lines:

- **R3-F1** (non-breaking, ACCEPTED). `docs/smoketests/phase-12a-sponsor-ai-intro.md` Step 5 pass description said "six separate checks" but the enumeration listed 7 items with the Pass line asserting "Results: 7 passed." Off-by-one count drift. Fix: relabeled to "seven separate checks" and re-numbered the parenthetical enumeration.
- **R3-F2** (non-breaking, ACCEPTED). `docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs:21` docstring referenced `PHASE12A_DRAFT_MODE below` — no such env var; only `PHASE12A_MODE` exists (and no separate draft mode). Fix: rewrote the send-error mode docstring to describe the actual pass-through behavior without referencing the phantom var.
- **R3-F3** (non-breaking, REJECTED). `docs/adr/0005-*.md:10,31` two mentions of the "pre-existing typo POSTing to `/api/meeting-requests`" in the Context section and the Endpoint-naming note. These are intentional audit-trail framing per ADR conventions (the ADR was accepted at the point the typo fix landed alongside the surface). The Nygard format's Context section documents the pre-decision state; the Endpoint-naming note is a standing footnote for future readers. No change needed.
- **R3-F4** (non-breaking, ACCEPTED). `apps/sponsor/README.md:72` said `.env.local.example` was NOT committed — now stale, Phase 12a added the file. `apps/sponsor/README.md:106` env-vars table lists only DATABASE_URL / NEXTAUTH_SECRET / NEXTAUTH_URL — missing the new `OPENAI_API_KEY`, `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED`, `NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` entries. Fix: bullet at line 72 rewritten to reference the now-committed template; env-vars table extended with three new rows per PRD §6 Phase 12a env spec.

Two other cited paths (`apps/sponsor/.env.local.example:4`, `apps/sponsor/components/RecommendedAttendees.tsx:71`) inspected and left unchanged — the "(Phase 12a)" comment qualifier and the connect() endpoint respectively are correct, not drift.

**Action.** 3 of 4 findings applied; 1 rejected with rationale. Zero AC-failing findings; zero propagation gaps from R2.

---

## Round 4 — 0 findings + R3 fixes verified + state-machine adversarial probe clean

Codex R4's first attempt exceeded the 2-minute forwarder budget and returned a placeholder notification — same infra failure mode as the Phase K R3 attempts. Retried with a narrow-scope prompt targeting two probes only: (1) verify R3 fixes stuck, (2) adversarial probe on IntroDraftModal state-machine / race conditions. Narrow scope completed in 58s.

R4 confirmed:

- Q1 (a): Step 5 pass description at `docs/smoketests/phase-12a-sponsor-ai-intro.md:90` says "seven separate checks" with correct enumeration (1)-(7) and Pass line asserting "Results: 7 passed, 0 failed."
- Q1 (b): Playwright docstring at `docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs:17-30` references only `PHASE12A_MODE=ai-failure (default) | send-error`; no phantom `PHASE12A_DRAFT_MODE`.
- Q1 (c): `apps/sponsor/README.md:72` reflects `.env.local.example` is committed; env-vars table lists the three new keys.
- Q2: zero adversarial findings on the IntroDraftModal state machine:
  - Abort/cleanup: `AbortController` at IntroDraftModal.tsx:50-57, cleanup aborts at :79, `AbortError` returns without state updates at :71-72 — verified clean.
  - Double-send guard: `canSend` excludes `sending`/`loading` states at :91-96; button `disabled={!canSend}` at :208-212 — verified clean.
  - `sendError` → `sending` recovery: not stuck; `sendError` state remains eligible for retry via `actuallySend()` at :105-106, :128-138 — verified clean.
  - Schema-parse failure: `IntroSchema.safeParse` throw at :61-64 falls into catch that sets `failed` and clears message and grounded fields at :71-76 — verified clean (no stuck `loading`).

**Action.** No fixes needed. R3 verified in place; state machine + race conditions verified clean.

---

## Round 5 — 1 AC-failing + 1 non-breaking finding, both applied

Codex R5's initial forwarder returned a summary tag without the full finding text — same information-loss mode as R3. A narrow-scope re-query fetched the specifics:

- **R5-F1** (AC-failing, ACCEPTED). `apps/sponsor/app/api/recommendations/[attendeeId]/draft-intro/route.ts:52`. The Prisma `Promise.all` fetch of `attendeeRow`/`sponsorRow` ran BEFORE the only `try/catch` in the route (which wrapped the AI call). If either `findUnique` rejected (DB down, invalid ID format, connection timeout), it bypassed the pattern-γ 502 handler and surfaced as an uncontrolled 5xx with whatever Next.js emits by default (potentially a stack trace). The client's `.catch()` in IntroDraftModal treats any non-2xx as pattern γ, so the modal-side UX contract still held — but the SERVER-side contract (return normalized `{error: "ai_unavailable"}` at 502) broke.
- **R5-F2** (non-breaking, ACCEPTED). `apps/sponsor/app/api/recommendations/[attendeeId]/draft-intro/route.ts:17`. The `parseArr` helper did `JSON.parse(val)` without verifying the result is an array. A malformed-but-valid JSON value stored in `solutionsSeeking`/`solutionsOffering`/`targetIndustries` (e.g. `"null"` parses to `null`, `"{}"` parses to `{}`, `"42"` parses to a number) would then hit the spread operations, either throwing (non-iterable object spread) or producing garbage. Same failure mode as F-1: uncontrolled 5xx bypassing the pattern-γ handler.
- **R5-F3** (non-breaking, ACCEPTED — self-caught before R5 finding-text arrived). `matchedTags` computation in the route didn't dedup, but the client's `DashboardView.tsx` `scoreAttendees()` mapper does. A sponsor listing the same solution in both `solutionsOffering` and `solutionsSeeking` would send duplicated entries into the AI prompt's `matchedSolutions` array, wasting tokens and biasing grounding.

**Action.** All three findings applied:

- R5-F1: Prisma `Promise.all` wrapped in a `try/catch` that returns `{error: "ai_unavailable"}` at 502. Refactored to an IIFE-style `dbFetch = async () => Promise.all([...])` closure so TypeScript can infer the narrowed row types from the select-shape; captured `sponsorIdNarrowed` locally to preserve the null-narrowed type across the closure boundary.
- R5-F2: `parseArr` now checks `Array.isArray(parsed)` on the parse result and filters to string elements only. A DB value that parses to a non-array, an object, or an array with non-string entries all coerce to a safe empty array.
- R5-F3: `matchedTags` computation now applies `[...new Set(...)]` to match the client's dedup behavior. Inline comment documents the cross-file consistency requirement.

---

## Cycle close — N=5 cap reached

Five rounds of Codex adversarial review completed against the Phase 12a implementation:

| Round | AC-failing | Non-breaking | Fresh vs propagation | Signal quality |
|---|---|---|---|---|
| R1 | 3 | 0 | 3 fresh | High — surfaced the AC-critical issues (message-merge, smoketest client-cap collision, PII-quote drift) |
| R2 | 3 | 0 | 0 fresh (3 propagation) | Propagation-only — R1 fixes were mostly good but incomplete |
| R3 | 0 | 3 applied + 1 rejected | 3 fresh doc-drift | Zero AC-failing — signals convergence at code contract level |
| R4 | 0 | 0 | 0 | State-machine + race conditions verified clean |
| R5 | 1 | 2 | 3 fresh | Late-round catch on hygiene issues (DB error handling + parseArr shape check + matchedTags dedup) |

Total: 7 AC-failing findings caught + fixed, 5 non-breaking findings caught + 4 fixed, 3 rejected (with rationale). Every accepted finding closed with typecheck-clean code afterward. Zero hallucinated findings — Codex respected the deferred-to-Phase-12b list and the PRD-locked-behavior list throughout.

**Commit follows.**

