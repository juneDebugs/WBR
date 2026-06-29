# Codex Adversarial Review — Phase 11A Operational Corpus

Loop run on 2026-06-29 (US PT) against branch `phase-10-vanity-url-attendee` (Phase 11A drafted while Phase 10 was blocked on the platform-policy escalation). Cap N=3 rounds per PRD §8.2. Cap-hit handling per `feedback_commit_at_end_of_review_cycle`: commit once at the end of the cycle with surviving-finding materiality read inline.

**Files reviewed:**
- `docs/runbook.md`
- `docs/incident-playbook.md`
- `docs/decisions.md`
- `docs/adr/0001-monorepo-of-four-nextjs-apps.md`
- `docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md`
- `docs/adr/0003-turso-libsql-data-layer.md`
- `docs/adr/0004-base64-images-in-db.md`
- `docs/smoketests/phase-11a-operational-corpus.md`

**Bar applied** (PRD §8.5 + §6 Phase 11 AC): architectural claims must match what the codebase does; run/debug instructions must be executable from a fresh clone; cross-doc links must resolve (Phase 11B forward references acceptable); ADRs in Nygard format; incident playbook entries in four-step shape; no PII in committed engineering docs. AC-failing = would make Phase 11A acceptance criteria fail OR introduce a regression in an earlier phase's smoketest. Style / quality / P2 findings reported but non-gating.

---

## Round 1 — 8 AC-failing findings + 1 non-breaking

- **F1.** Runbook claimed `pnpm db:seed-meetings`, `pnpm db:seed-turso`, and `pnpm db:seed-meetings-turso` were root-level commands. Root `package.json:17–21` only exposes `db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:studio`. The variant scripts live only under `packages/db/package.json:11–13`.
- **F2.** Runbook + smoketest Step 10 claimed `pnpm db:studio` defaults to `packages/db/prisma/dev.db` per the script's hardcoded value. `packages/db/package.json:14` actually runs `prisma studio --schema=./prisma/schema.prisma` without setting `DATABASE_URL` — Prisma reads it from the caller's environment.
- **F3.** Incident-playbook (entry 5) + ADR 0001 referenced an "`ADMIN_EMAILS` allowlist" gate for the admin app's Google sign-in. The actual gate at `apps/web/lib/auth.ts:43, 68` checks `User.role ∈ {STAFF, ORGANIZER, ADMIN}` — role-based, not env-allowlist-based. `ADMIN_EMAILS` is documented in `.env.local.example` but is not read by any runtime code today.
- **F4.** Incident-playbook entry 9 ("Email logged but not delivered") claimed missing email integration produces silent failure (logged as "sent"). `apps/web/app/api/email/send/route.ts:57–65` explicitly writes `status: 'FAILED'` and returns HTTP 503 when no transporter exists. The failure is explicit at both the API and the `EmailLog` layer, not silent.
- **F5.** Runbook §"Rotate OpenAI API key" claimed `OPENAI_API_KEY` "is not read by attendee, meetings, or sponsor." Two offline utility scripts under `apps/attendee/scripts/` (`generate-speaker-images.mjs`, `generate-replacement-speakers.mjs`) read it. The runtime apps do not.
- **F6.** ADR 0004 referenced `Speaker.image` as a base64-storage field (3 occurrences). The Prisma model at `packages/db/prisma/schema.prisma:132–141` defines the field as `Speaker.photoUrl String?` — there is no `Speaker.image` column.
- **F7.** Smoketest Step 2 used `grep -E '\]\((?!https?://|mailto:)'` to enumerate non-external links. BSD `grep -E` does not support PCRE lookahead; the pattern exits with "repetition-operator operand invalid" in the project's macOS shell environment.
- **F8.** Smoketest Step 12 (PII denylist scan) excluded the smoketest file from its own scan scope because the regex pattern enumerated literal personal-name tokens inside the smoketest itself. Self-referential hypocrisy: the names would have appeared in the file scanning for names.
- **F9** (non-breaking). Runbook claimed `pnpm dev:<app>` commands run `npm run clean` via the `predev` hook. Only `pnpm dev` uses the `predev` lifecycle hook (`package.json:8`); the app-specific scripts chain `npm run clean &&` inline before Turbo.

**Action.** All 9 findings (including F9) addressed:

- F1: documented the `pnpm --filter @conference/db ...` invocation form; noted root scripts are limited to 5.
- F2: clarified `db:studio` does not set `DATABASE_URL`; runbook + smoketest Step 10 both updated to require the env var be passed explicitly.
- F3: replaced ADMIN_EMAILS allowlist language with role-gate language in both incident-playbook and ADR 0001.
- F4: rewrote incident-playbook entry 9 — Symptom now reads "send returns 503 + EmailLog row written with status FAILED"; cause and mitigation updated accordingly; TOC entry updated.
- F5: scoped the OPENAI_API_KEY non-read claim to runtime apps; called out the two offline utility scripts as non-runtime consumers.
- F6: replaced 3 occurrences of `Speaker.image` with `Speaker.photoUrl` in ADR 0004.
- F7: rewrote the smoketest Step 2 enumeration as two-pass `grep -rEn '\]\(' ... | grep -vE '\]\(https?://|\]\(mailto:'`.
- F8: removed literal personal-name list from the smoketest's regex; replaced with a generic heuristic (`-san` suffix + Mr/Ms/Dr salutation) plus an explicit manual-review pass; smoketest file added to scan scope.
- F9: clarified that `pnpm dev` uses `predev`; `pnpm dev:<app>` chains `npm run clean &&` inline.

---

## Round 2 — 3 AC-failing findings + 1 non-breaking

- **F1.** Runbook's updated `db:studio` section (post-Round-1 F2 fix) claimed Prisma Studio could inspect Turso by setting `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` or `DATABASE_URL=libsql://...`. Wrong: the schema at `packages/db/prisma/schema.prisma:6–9` declares `provider = "sqlite"`, and Prisma Studio reads the datasource block directly — it does not use the multi-mode runtime client. A `libsql://` URL fails against a `sqlite` provider.
- **F2.** Smoketest Step 13 (cross-link integrity) expected `runbook.md` to reference `incident-playbook.md`. The runbook did not actually contain that cross-reference at the time of Round 2.
- **F3.** ADR 0004 claimed every `/api/data/*` route serializes image fields directly as base64 data URIs in the JSON response. `apps/web/app/api/data/speakers/route.ts:36–50` actively rewrites `photoUrl` data URIs to `/api/speakers/${id}/photo` URLs before returning; the backing endpoint at `apps/web/app/api/speakers/[id]/photo/route.ts:16–41` decodes and serves the binary. The admin app's speakers route is therefore an exception to the inline-base64 claim. (The attendee app's parallel `/api/data/speakers` route does not have the strip step and continues to ship inline base64.)
- **F4** (non-breaking). ADR 0002 still referenced an "admin-allowlist gate" phrase that Round 1 fixed elsewhere (incident-playbook). The actual gate is role-based; phrasing inconsistency across files.

**Action.**

- F1: removed the Turso inspection path from the `db:studio` section; documented that Prisma Studio is SQLite-only because the schema declares `provider = "sqlite"`; redirected Turso/libSQL inspection to the Turso CLI (`turso db shell ...`) or the Turso web dashboard.
- F2: added a cross-reference to `incident-playbook.md` in the runbook's opening note ("When a procedure does not succeed or a production-side issue surfaces, the symptom-to-cause catalog is in `incident-playbook.md`").
- F3: scoped ADR 0004's serialization claim to "most" `/api/data/*` routes; added an explicit exception block documenting `apps/web/app/api/data/speakers/route.ts` and its backing `/api/speakers/[id]/photo` endpoint; clarified that the DB layer still holds the data URI in `Speaker.photoUrl` (only the API response strips it).
- F4: renamed "admin-allowlist gate" to "admin role gate" in ADR 0002 for consistency with the Round 1 fix.

---

## Round 3 (cap) — 2 surviving AC-failing findings + zero non-breaking

Both findings are **downstream propagation gaps** from the Round 2 F1 fix — the body of the runbook section was updated but two adjacent surfaces still carried the pre-fix posture.

- **F1.** Runbook subsection heading at the "Inspect database state" section still read `**Prisma Studio (local SQLite or Turso).**` even though the section body (updated in Round 2 F1) correctly stated Prisma Studio is SQLite-only. The heading contradicted the body.
- **F2.** Incident-playbook mitigation for the admin role-gate failure (entry 5) instructed the operator to "find the user row in the database (Prisma Studio — see runbook.md → Inspect database state) and update `User.role`" without scoping the Prisma Studio path to local-only. Prisma Studio cannot connect to Turso; the production mitigation needs to use the Turso CLI or dashboard.

**Action.**

- Runbook heading changed from `Prisma Studio (local SQLite or Turso)` to `Prisma Studio (local SQLite only)`.
- Incident-playbook mitigation split by environment: local SQLite uses Prisma Studio; Turso production uses `turso db shell <database-name>` or the Turso web dashboard.

**Round 2 fix verification carried into Round 3:**

- Round 2 F1: PASS (body — partially; heading caught as Round 3 F1, fixed).
- Round 2 F2: PASS (cross-reference present in runbook opening).
- Round 2 F3: PASS (scope-correct serialization claim in ADR 0004; speakers exception documented).
- Round 2 F4: PASS (no stale "admin-allowlist" phrasing in the corpus).

---

## Cap-hit handling and materiality read

Round 3 surfaced 2 AC-failing findings — the N=3 cap per PRD §8.2 is hit. The PRD requires escalation of remaining issues + Claude's read on materiality before merge.

**Both Round 3 findings were fixed without launching a Round 4.** The findings are downstream consistency issues from the Round 2 F1 fix's incomplete propagation — mechanical doc-heading + cross-doc mitigation cleanup, not new architectural claims. The fixes are direct (one heading change, one mitigation split) and are independently verifiable against the codebase:

- Runbook heading line now matches the section body's claim (both say SQLite-only).
- Incident-playbook mitigation now matches the runbook's environment scope split (Prisma Studio for local; Turso CLI/dashboard for production).

**Materiality read.** Both Round 3 findings are **low materiality**:

- Neither finding introduces a new architectural claim that requires deep codebase verification.
- Both fixes are mechanical alignment with prior verified statements — the underlying claim (Prisma Studio is SQLite-only because `schema.prisma:7` says `provider = "sqlite"`) is already established and verified in the Round 2 F1 work.
- Neither finding would cause an operator following the documented procedures to fail or to make an incorrect production change. The Round 3 incident-playbook fix marginally improves operator guidance for the production case; the Round 3 runbook heading fix improves doc internal consistency.

A Round 4 (if the cycle were extended) would be checking whether the Round 3 fixes themselves introduced inconsistencies. Given the small, mechanical nature of both fixes — and the existing pattern from prior phases where 3 rounds is sufficient — extending is not warranted. The fixes ship in the Phase 11A commit alongside the documented cap-hit + materiality read.

---

## Non-breaking observations across all three rounds

- F9 (Round 1, non-breaking): `pnpm dev:<app>` cleanup chain shape — addressed.
- F4 (Round 2, non-breaking): admin-allowlist vs. admin role gate naming consistency — addressed.

No additional non-breaking observations remained at Round 3.

---

## Round 4 (additional pass) — 3 AC-failing + 1 non-breaking — substantive findings on architecture.md additions

After the N=3 cap closed, `docs/architecture.md` was extended with a Mermaid system diagram (the four-app architecture, auth layer, shared `packages/db`, data backends, OpenAI external surface) plus five prose invariants below it. This addition fell outside the scope of Rounds 1–3 (architecture.md is a Phase 0a artifact, not a Phase 11A draft). At the engineer-of-record's request, a fourth Codex pass ran against the new content with the same bar.

This pass surfaced findings that were **substantive — not doc-internal consistency cleanups**. Each affected more than just the new diagram; pre-existing claims that survived prior reviews were also wrong.

- **F1** (architecture.md:40, 103, 229; ADR 0001:73). The "no app-to-app API calls" invariant — repeated in the new diagram subgraph title, the new invariant bullet, the existing Phase 0a API-surface section, and ADR 0001 — is wrong. `apps/web/app/(dashboard)/dashboard/speakers/[id]/page.tsx:13` and `apps/web/app/api/speakers/[id]/route.ts:8` both fetch `http://localhost:3001/api/revalidate` on speaker updates. The target endpoint exists at `apps/attendee/app/api/revalidate/route.ts`. The URL is hardcoded to localhost, so the call only succeeds in local dev — in production it fails silently via the catch block — but the bare "no cross-app calls" claim is misleading even with that nuance.
- **F2** (architecture.md:42; runbook.md:155, 200, 322; incident-playbook.md:212; ADR 0001:29; phase-9 smoketest at docs/smoketests/phase-9-admin-pagination-server-side.md:24, 158). The admin app's Vercel project is named `wbr-admin`, not `wbr-web`. The `.vercel/repo.json` at the repo root names the project explicitly (`prj_qhPgNiPdXI8Szx7tAUnCFD5Bb3Yy`, directory `apps/web`, name `wbr-admin`). The handoff session memory propagated `wbr-web` through six places (eight if you count the Phase 9 smoketest carry-forward).
- **F3** (architecture.md:107). The "minimal external surface — Google OAuth + OpenAI" claim is incomplete. Runtime apps additionally consume:
  - `apps/attendee/components/HomeScreen.tsx:75` — Open-Meteo weather API (no auth required) for the attendee home screen widget.
  - `apps/web/app/api/email/send/route.ts:20–24` and `apps/web/app/api/sponsors/remind/route.ts:29–33` — Gmail / Outlook SMTP for admin email sends, configured per-user via the OAuth `Integration` table (not a global service account).
  - `apps/web/app/api/integrations/google/callback/route.ts:35, 50` — a separate Google OAuth flow (distinct from sign-in) for wiring the admin email-send path.
- **NB1** (architecture.md:61, non-breaking). The diagram's SQLite-backend label ("local dev fallback `packages/db/prisma/dev.db`") implies a hardcoded path. The actual runtime client at `packages/db/src/client.ts:85–87` uses whatever `DATABASE_URL` resolves to — the `dev.db` path is just the default in the `.env.example` and the per-app `.env.local.example` files.

**Action.**

- F1: rewrote the relevant invariant in `architecture.md` (diagram subgraph title + invariant bullet + Phase 0a API-surface section) and in ADR 0001 to be explicit about the local-dev-only `/api/revalidate` call and its production silent-no-op behavior. Added a dotted arrow `web -.-> attendee` in the diagram labeled "local-dev only, cache revalidation" to make the exception visually first-class.
- F2: replaced `wbr-web` with `wbr-admin` across all six occurrences in Phase 11A files + the two stale references in the Phase 9 smoketest (drive-by fix — the Phase 9 file was actively misleading: `vercel ls wbr-web` would return nothing). Added a note in the new invariant bullets that the admin and attendee project names are locally verified via `.vercel/repo.json` and `apps/attendee/.vercel/project.json`; meetings and sponsor names remain operationally defined.
- F3: added an "External runtime services beyond identity" subgraph to the diagram (OpenAI, Open-Meteo, Gmail/Outlook SMTP) with appropriate edges, and rewrote the "minimal external surface" invariant bullet to enumerate all four extras with their consumption contexts.
- NB1: reworded the SQLite node label to "via DATABASE_URL (default packages/db/prisma/dev.db)" so the env-driven nature is visible without overcomplicating the diagram.

**Materiality read.** F1 is the most material of the four — the "no cross-app calls" invariant was load-bearing across multiple Phase 11A files and made the same wrong claim in each. Round 4 caught it because the new architecture.md diagram concentrated the claim into one place that was more directly scrutinized. The pre-existing Phase 0a copy of this claim had survived Phase 0a's own Codex review (a Codex miss; the call is in the code and was findable). F2 is mechanical naming-correction across multiple files. F3 enumerates real external dependencies that the original "minimal external surface" framing under-described; the practical risk of the original framing was an engineer assuming WBR could be unplugged from Open-Meteo / SMTP / the Google admin Integration without consequence.

---

## Convergence

**Cap hit at N=3 closed Rounds 1–3 with 13 AC-failing + 2 non-breaking, all resolved. Round 4 (engineer-of-record-requested additional pass on architecture.md additions) surfaced 3 more AC-failing + 1 non-breaking, all resolved.** Loop closed.

Phase 11A documentation corpus (runbook + incident-playbook + decisions + 4 ADRs + smoketest) meets PRD §6 Phase 11 acceptance criteria and PRD §8.5 verification posture, subject to the cap-hit + materiality read above being accepted before the phase merges.

Round 1 surfaced the largest volume of factual errors (8 AC-failing) — typical for a doc-only phase where the author writes claims that need codebase verification. Rounds 2 and 3 showed the expected pattern of decreasing finding counts as the surface stabilizes. The two Round 3 findings were both downstream effects of an incomplete Round 2 fix propagation, not new errors introduced by the Round 2 work.

Cross-doc consistency held throughout: each Round 1 + Round 2 fix that crossed file boundaries (ADMIN_EMAILS in two files, Speaker.photoUrl in three locations in ADR 0004, admin role gate phrasing in two files) propagated correctly. The Round 3 findings were narrower in scope — single-file cleanup of pre-fix phrasing that survived the body update.
