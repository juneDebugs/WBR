# Codex Adversarial Review — Phase 11B Orientation Corpus

Loop run on 2026-06-29 (US PT) against branch `phase-11b-orientation-corpus` (cut from main at `d474d61` after the Phase 11A merge). Cap N=3 rounds per PRD §8.2. Cap-hit handling per `feedback_commit_at_end_of_review_cycle`: commit once at the end of the cycle with surviving-finding materiality read inline.

**Files reviewed:**

NEW:
- `CLAUDE.md` (root)
- `CONTRIBUTING.md` (root)
- `apps/web/README.md`
- `apps/attendee/README.md`
- `apps/meetings/README.md`
- `apps/sponsor/README.md`
- `packages/db/README.md`
- `packages/types/README.md`
- `packages/supabase/README.md`
- `docs/smoketests/phase-11b-orientation-corpus.md`

REFRESHED:
- `README.md` (corpus map + stale-gotcha rewrite)
- `docs/architecture.md` (per-app surface bullets condensed; `ADMIN_EMAILS` residue claim corrected; Reference map refreshed)

**Bar applied** (PRD §8.5 + §6 Phase 11B AC): architectural and codebase-derived claims must match what the codebase does on `phase-11b-orientation-corpus`; cross-doc links must resolve; CLAUDE.md ≤70 lines and structurally complete; CONTRIBUTING.md carries the template-framing disclaimer; smoketest conforms to `docs/smoketests/CONTRACT.md`; no PII; no leading-dot scratch-directory substrings in committed content. AC-failing = would make Phase 11B acceptance criteria fail OR break a cross-doc link OR trip the Tailor pre-commit blocklist. Style / quality / P2 findings reported but non-gating.

---

## Round 1 — 3 AC-failing findings + 0 non-breaking

- **R1-F1** (AC-failing). `docs/smoketests/phase-11b-orientation-corpus.md` at lines 16, 186, 191, 196, 263 contained the leading-dot scratch-directory substring literally. The Tailor pre-commit hook scans diff content against the customer-blocklist, which includes that token; the commit would be rejected. The earlier sanitization sweep (per `feedback_tailor_commit_msg_blocklist`) caught the engineer-local PRD + plan path references but missed the smoketest's own description of Step 9.

- **R1-F2** (AC-failing). `apps/web/README.md:49` claimed `middleware.ts` forwards `x-user-role` and `x-user-id` as request headers so route handlers do not re-decode the JWT. Actual codebase: `apps/web/middleware.ts:25` sets those headers on the **response**, not on a forwarded request. Route handlers in this app continue to call `getToken({ req: request })` directly (e.g. `apps/web/app/api/data/attendees/route.ts:8`). The other three apps do use the `NextResponse.next({ request: { headers: requestHeaders } })` forwarding pattern — apps/web diverges. Claim asserted a behavior that does not happen.

- **R1-F3** (AC-failing). `packages/db/README.md:66` stated migrations are stored in `prisma/migrations/`. No such directory exists at HEAD on this branch. `docs/architecture.md` §Known limitations correctly captures that "schema changes go through `prisma db push`, which does not record diffs" — the new README contradicted that.

**Action.** All 3 findings addressed:

- R1-F1: rewrote Step 9 and its smoketest-§"What this verifies" entry to describe the engineer-local scratch directory generically. Step 9 now requires the runner to set `DOT_DIR` to the literal scratch-directory name from session memory before executing; the literal token is never committed to the smoketest. Step 9 title updated in the summary table. Final smoketest grep confirms zero occurrences of the literal substring.
- R1-F2: rewrote the `middleware.ts` key-files bullet and the corresponding gotcha bullet in `apps/web/README.md`. Both now describe the actual behavior (`response.headers.set(...)` at `middleware.ts:25`; route handlers reach for `getToken({ req: request })` directly) and call out the divergence from the other three apps. No prescriptive guidance is added — the README documents current state.
- R1-F3: rewrote the schema section of `packages/db/README.md`. Removed the false `prisma/migrations/` claim; added an explicit "**There is no migration history.** Schema changes go through `prisma db push`..." with a cross-link to the architecture.md known-limitations entry that captures the same fact.

---

## Round 2 — 6 AC-failing findings + 0 non-breaking

- **R2-F1** (AC-failing, downstream propagation gap from R1-F2). `apps/attendee/middleware.ts:26-31` sets identity headers on `NextResponse.next()` response — same response-only shape as apps/web. My R1 fix to `apps/web/README.md` said "the canonical `NextResponse.next({ request: { headers } })` request-forwarding pattern in apps/attendee / apps/meetings / apps/sponsor does not appear here." Wrong about apps/attendee — only apps/meetings and apps/sponsor use the canonical pattern. The attendee README's own middleware bullet and `lib/user.ts` bullet also implied successful forwarding.
- **R2-F2** (AC-failing, missed by R1). `apps/sponsor/README.md` opener + API surface intro + gotcha all stated sponsor-specific routes "403 unless `User.sponsorId` is non-null." Actual: only the profile-write route at `app/api/profile/route.ts:11-12` enforces this. `app/api/attendees/route.ts:6-8` and `app/api/request-meeting/route.ts:11-12` accept any authenticated user — they check `user.id`, not `user.sponsorId`. The README implied uniform gating; the codebase has per-route inconsistent gating.
- **R2-F3** (AC-failing, missed by R1). `apps/meetings/README.md` claimed self-provisioning ATTENDEE rows on first-time Google sign-in is unique to meetings; "the other three apps reject unknown emails." Actual: `apps/attendee/lib/auth.ts:42-48` and `apps/sponsor/lib/auth.ts:68-74` also `prisma.user.upsert({...create: {role: 'ATTENDEE'}})`. Only apps/web rejects (`apps/web/lib/auth.ts:64-68` does `findUnique` + role check, no create).
- **R2-F4** (AC-failing, missed by R1). `docs/architecture.md` PWA layer table listed every rule as `NetworkFirst` with `networkTimeoutSeconds: 10`. Actual `apps/attendee/next.config.js`: image-class rules and static assets use `StaleWhileRevalidate` with no timeout; `/_next/data/*.json` and same-origin page rules use `NetworkFirst` with `networkTimeoutSeconds: 5`. The Phase 5 rule-class split — captured in `apps/attendee/README.md` and in [`docs/smoketests/phase-5-pwa-timeout-split.md`](../smoketests/phase-5-pwa-timeout-split.md) — wasn't reflected in the architecture.md table.
- **R2-F5** (AC-failing, missed by R1). `apps/web/README.md` API-surface section said "Each endpoint is `unstable_cache`'d." Actual: `app/api/data/attendees/route.ts:1-21` is not cached — it calls `fetchAttendeesPage()` directly per the Phase 9 server-side pagination shape (query-param-driven cache keys would explode `unstable_cache` storage). The exception is already documented in `docs/architecture.md` §Server-side pagination; the README contradicted it.
- **R2-F6** (AC-failing, missed by R1). `packages/db/README.md` "Local-dev DB location" section said `packages/db/prisma/dev.db` is the canonical local DB that `prisma db push` and `db:studio` target. Actual: the `packages/db/package.json` scripts use `DATABASE_URL="file:./dev.db"` from cwd `packages/db`, which resolves to `packages/db/dev.db` (not the `prisma/` subpath). Both files exist on disk (3.2M and 4.4M respectively); the seed flow writes to `packages/db/dev.db` and copies outward, while the first-clone setup and apps' `.env.local` target `packages/db/prisma/dev.db`. The README hid a foot-gun by asserting a single canonical path.

**Action.** All 6 findings addressed:

- R2-F1: rewrote the `middleware.ts` and `lib/user.ts` key-files bullets in `apps/attendee/README.md` to describe the actual response-only header shape + the divergence from apps/meetings and apps/sponsor; downstream-fixed the `apps/web/README.md` claim (both the key-files bullet and the gotcha) to scope the canonical-pattern claim correctly to meetings + sponsor only.
- R2-F2: rewrote the `apps/sponsor/README.md` opener, API-surface intro, and gotcha bullet to describe the per-route inconsistent gating instead of implying uniform `sponsorId` enforcement. Noted the profile-write route as the only enforcer today; documented that new sponsor-only routes must replicate the check.
- R2-F3: rewrote the `apps/meetings/README.md` key-files bullet and the matching gotcha to scope self-provisioning to attendee + sponsor + meetings (three apps), with apps/web as the lone reject path.
- R2-F4: replaced the `docs/architecture.md` PWA table to match the actual `next.config.js` — split into image/asset SWR rows (no timeout), CacheFirst for fonts, and NetworkFirst rows for data + pages with `networkTimeoutSeconds: 5`. Added a follow-up paragraph explaining rule-order semantics.
- R2-F5: widened the `apps/web/README.md` API-surface bullet from "Each endpoint" to "Most endpoints" and added an explicit "Known exception" call-out for `app/api/data/attendees/route.ts` with the Phase 9 rationale.
- R2-F6: rewrote the `packages/db/README.md` "Local-dev DB location" section to document both `dev.db` files, the divergent paths between the seed scripts and the apps' `.env.local` targets, and the resulting drift hazard.

---

## Round 3 — 4 AC-failing findings + 0 non-breaking (2 Codex findings rejected with reasoning)

**R2 resolution verification.** All six R2 fixes confirmed landed and correct (R2-F1 through R2-F6). No over-correction introduced.

Round 3 findings, in the order Codex surfaced them:

- **R3-F1** (AC-failing, downstream propagation gap from R2-F1). `apps/meetings/README.md:48` still said the middleware is "same shape as the other apps" with headers "forwarded" — implying uniform middleware behavior after R2-F1 explicitly established the two-pattern split (canonical request-forwarding in meetings + sponsor; response-only in web + attendee).

- **R3-F2** (AC-failing, downstream propagation gap from R2-F6). `README.md:89` shortcut-alternative note still hid the dual-`dev.db` foot-gun. `packages/db/README.md` §Local-dev DB location now calls this out; the root README needs the same warning so a cold engineer sees it before reaching the package doc.

- **R3-F3** (AC-failing, downstream propagation gap from R2-F6). `docs/runbook.md:48,62` (committed Phase 11A content) still asserted the single-canonical-path model: reset removes only `packages/db/prisma/dev.db`; `db:seed` claimed to run against `prisma/dev.db`. After R2-F6 established the seed targets `packages/db/dev.db` (cwd-relative), the runbook procedure can leave engineers running apps against a different SQLite file than the one the seed populated.

- **R3-F4** REJECTED (Codex hallucinated the AC). Codex claimed CLAUDE.md must cover "project overview, quick start, dev commands, architecture summary, contributing pointer, and relevant conventions." The actual Phase 11B AC (PRD §6 + shared-understanding doc §6) specifies the six sections as: Project orientation, First-read file order, The four apps, Workflow conventions (→ CONTRIBUTING.md), Architecture decisions (→ decisions.md + adr/), Pre-existing known issues. `CLAUDE.md:5,9,21,32,36,40` carries exactly those six headers. CLAUDE.md is structurally complete per the actual AC.

- **R3-F5** REJECTED (Codex hallucinated the AC). Codex claimed CONTRIBUTING.md must cover "purpose, prerequisites, repo structure, local setup, running tests, branching strategy, commit conventions, PR process, common gotchas, references/links." The actual Phase 11B AC (PRD §6 + shared-understanding doc §6) specifies the ten sections as: Quickstart, Branch conventions, Commit-msg blocklist, Per-phase deliverable shape, Smoketest CONTRACT, Codex adversarial review loop, Doc-update criterion, Four-tier perf environment model, Finding protocol, PR ergonomics. `CONTRIBUTING.md:9,15,33,44,55,67,79,93,106,117` carries exactly those ten headers in order. CONTRIBUTING.md is structurally complete per the actual AC.

- **R3-F6** (AC-failing, missed by both earlier rounds). `docs/architecture.md:113` named the project-owner's Vercel team slug as a personal identifier (`<personal-name>-1220s-projects`). The PRD's no-PII bar for committed engineering docs prohibits personal/internal identifiers; the slug fails the bar. Phase 11A shipped this; Phase 11B is touching the file anyway for the refactor pass, so the fix is in scope.

**Action.** All 4 accepted findings addressed; 2 rejections recorded above:

- R3-F1: rewrote the `apps/meetings/README.md:48` middleware bullet — names the canonical request-forwarding pattern as shared with apps/sponsor, calls out the apps/web + apps/attendee divergence, references the line range in `middleware.ts:30-37`.
- R3-F2: rewrote `README.md:89` shortcut-alternative note — explicitly states the proxied scripts target `packages/db/dev.db`, not `packages/db/prisma/dev.db`; points at `packages/db/README.md §Local-dev DB location` for the full picture.
- R3-F3: rewrote the `docs/runbook.md` reset procedure — step 1 now removes both `packages/db/dev.db` and `packages/db/prisma/dev.db` (plus the per-app copies); added an explicit step 4 to re-sync `prisma/dev.db` via a `DATABASE_URL`-overridden `prisma db push` + a `cp` so the apps' default `.env.local` keeps working; rewrote the "Why two dev.db files" explanation to match R2-F6's framing.
- R3-F6: replaced `<personal-name>-1220s-projects` with "the project-owner's team" in `docs/architecture.md:113`. Role-label substitution per the engineering-docs-no-PII bar.

**End-of-round summary.** 4 AC-failing findings accepted and fixed; 2 hallucinated findings rejected. Convergence is reached for the N=3 cap: the cap closes after this round per PRD §8.2 + `feedback_commit_at_end_of_review_cycle`. Engineering judgment was required twice to reject Codex over-reach into invented AC requirements — flagged here for future Codex-review calibration.

**Recommended next step.** Commit the full Phase 11B set in a single commit per the commit-at-end-of-review-cycle rule. Surface push + PR commands for engineer-of-record's terminal.

---
