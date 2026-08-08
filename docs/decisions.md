# Decisions Index

Records of engineering decisions made on the WBR codebase — what was chosen, why, and where to read more.

This doc is a curated index. **Architectural-grade decisions** (hard to reverse, surprising without context, real trade-off) get a full ADR in [`adr/`](adr/) and a one-paragraph summary here. **Sprint-grade decisions** (smaller in scope, easier to reverse, situational) live as one-paragraph entries here without a separate ADR.

Entries are grouped by area. Within each group, ordering is roughly chronological — earlier decisions appear first.

Some entries cross-reference engineer-local documents (PRD, sprint plan, recon notes) that live in a gitignored tree at the repo root. Those documents are noted by purpose but not by path, and are not part of the committed repository.

## Contents

- [Architecture](#architecture)
- [Performance (2026-06-22 demo sprint)](#performance-2026-06-22-demo-sprint)
- [Process and quality controls (2026-06-22 demo sprint)](#process-and-quality-controls-2026-06-22-demo-sprint)
- [AI](#ai)
- [Hosting](#hosting)
- [Open questions](#open-questions)

---

## Architecture

### Four independent Next.js apps in one monorepo

WBR ships as four separate Next.js 15 apps (`web`, `attendee`, `meetings`, `sponsor`) under `apps/`, plus shared `packages/`. Each app deploys as its own Vercel project; each app owns its env-var matrix, custom-domain mapping, build cache, and build output.

The split exists because the four user-facing surfaces have meaningfully different requirements — the attendee app is a mobile-first PWA, the admin (`web`) app is a desktop dashboard with the heaviest current development, the meetings app is a desktop-oriented staff queue, and the sponsor app is a desktop portal gated by a foreign key rather than by role. A four-into-one app would couple build cache invalidation across surfaces and force every deploy to ship all four front ends together. The repo-level cost is per-app duplication of NextAuth wiring and middleware, accepted as a tractable price.

See full rationale in [`adr/0001-monorepo-of-four-nextjs-apps.md`](adr/0001-monorepo-of-four-nextjs-apps.md) and the deployment-topology section of [`architecture.md`](architecture.md#deployment-topology).

### Configurable role permissions for the admin dashboard (2026-07-04)

The admin app previously treated `STAFF`, `ORGANIZER`, and `ADMIN` identically — every admin-role gate was a flat `['STAFF','ORGANIZER','ADMIN'].includes(role)` check, so a Staff member had the same reach as an Organizer. The Staff page now exposes a **Roles & Permissions** editor (Organizer-only; read-only for everyone else) that maps each of the two managed roles (Staff, Organizer) to a set of permission keys — one per sidebar nav destination, grouped by the 5 sidebar sections. The signed-in role's permissions drive both the Sidebar (hidden sections) and a server page guard (`lib/require-permission.tsx`) on the Administration pages.

Key decisions: (1) permissions gate **nav destinations**, mirroring the sidebar grouping, because that is the unit users reason about; (2) the permission list is a client-safe pure module (`lib/permissions.ts`) with an anti-lockout invariant — `ORGANIZER` always retains `staff`, enforced server-side in `normalizePermissions`, so no payload can lock admins out of the role manager; (3) persistence uses a `RolePermission` table created via a defensive `CREATE TABLE IF NOT EXISTS` (raw SQL, matching the Prisma model) so it works on Turso without a manual `prisma db push`, consistent with the repo's no-migration-history posture (see [`adr/0003-turso-libsql-data-layer.md`](adr/0003-turso-libsql-data-layer.md)); (4) the Staff page role dropdown was narrowed from four roles to **Staff & Organizer** — Attendee/Speaker are managed on the Access page. Editing is Organizer-only at the API (`PUT /api/roles` → 403 for Staff). Tests: `pnpm test:roles` (unit), `pnpm test:roles:api` (HTTP), and `scripts/e2e-roles.mjs` (browser).

### Company-centric meeting engine console (2026-07-22)

The meetings app's `/staff` surface was a flat, single-column `MeetingRequest` queue with a plain time-block dropdown — no capacity enforcement, no room/table concept, no reschedule/cancel UX, and (after the Brand/Sponsor/WBR test-account redo) an unreachable `role === 'STAFF'` gate. It was replaced with a **company-centric scheduling console** modeled on the eTail Connect meeting-engine workflow: a Sponsor **directory** (requests / needs-review / unscheduled / confirmed / fill-rate) → per-company **split view** with an **Unscheduled Bank** (approved requests, ranked by solution-match interest, with a HUD popover) and a **day-tabbed calendar grid**; assign / reschedule / cancel via Apple-HIG sheets.

Key decisions: (1) engine logic is a **pure, prisma-injected module** (`packages/db/src/meeting-engine.ts`) so it is unit-testable from TS source with no app or client dependencies — matching the `staff-roster.ts` pattern; (2) **rooms/tables are a code constant** (`MEETING_ROOMS`), occupancy scoped per sponsor per time block, avoiding a new DB table — the only schema change is two nullable columns on `SponsorMeeting` (`location`, `reason`), applied to Turso via a defensive `ALTER TABLE ... ADD COLUMN` script (`pnpm db:migrate-engine`), consistent with the no-migration-history posture ([`adr/0003`](adr/0003-turso-libsql-data-layer.md)); (3) **availability is mutual** (candidate blackout + confirmed `SponsorMeeting`/`Meeting`, sponsor capacity, per-room occupancy) and computed server-side so sheets never offer dead-end slots; (4) **cancel is two-mode** — preserve (meeting `CANCELLED`, request back to `APPROVED` in the bank) vs remove (request `CANCELLED`) — the load-bearing reschedule/cancel semantics; (5) the operator gate is the **WBR staff tier** via a new `isWbrStaff()` helper (`WBR`/`ORGANIZER`/`ADMIN`/`STAFF`), fixing the previously-unreachable literal-`'STAFF'` check. Guarded mutations throw typed `EngineError` codes mapped to HTTP status. Contract + HIG spec: [`docs/prd/meeting-engine.md`](prd/meeting-engine.md), [`docs/prd/meeting-engine-hig-spec.md`](prd/meeting-engine-hig-spec.md). Tests: `pnpm test:engine` (units + lifecycle against the live DB with self-cleaning fixtures), `pnpm test:engine:api` (HTTP, `--start`), `pnpm e2e:engine` (browser, `--start`).

### Exclusive meeting time slots — one meeting per sponsor per block (2026-07-29)

The booth model originally gave each sponsor 12 concurrent seats per time block (8 tables + a 4-seat lounge, `totalRoomCapacity`), so Auto-Schedule legally stacked several meetings into one slot — which reads as double booking on the Companies grid — while three legacy confirm paths (the meetings-app staff queue, the sponsor-portal approve flow, and the admin sponsor-detail form) wrote `SponsorMeeting` rows with no availability checks at all, producing genuinely double-booked attendees. Slots are now **exclusive**: a sponsor holds at most ONE confirmed meeting per time block (`MEETINGS_PER_BLOCK = 1` in `meeting-engine.ts`), and an attendee at most one meeting of any kind per block (as before). Every capacity gate (matrix `capacityLeft`, availability, `assertSlotBookable`, the priority auto-scheduler and its commit-time revalidation) derives from the one constant; `MEETING_ROOMS` survives as physical table labels only. Key decisions: (1) a single exported guard, `assertBlockOpen`, is now run by **every** write path — engine mutations and all legacy confirm routes — so no path can create a booking the availability math considers impossible; (2) `findFirstOpenSlot` gives legacy auto-assign paths (sponsor-portal approve) the exact first-open-slot-for-both-sides rule the Companies Auto-Schedule button uses; (3) the legacy `/api/schedule-meetings` bulk pass now delegates to `autoScheduleByPriority` instead of maintaining a parallel scheduler; (4) `ROOM_CONFLICT` was retired from the engine error vocabulary (an occupied block is `SPONSOR_FULL`); (5) pre-existing stacked/double-booked rows are repaired by `scripts/migrate-exclusive-slots.mjs` (dry-run by default, `--apply` to write; keeps the earliest-created meeting, re-slots the rest into the first mutually open block, cancels back to the bank when none exists). Tests: `test:priority` (first-open-slot spread, cross-sponsor conflicts, simulated write race), `test:engine`, `test:admin-scheduler`, `test:auto-match` and API variants updated to assert exclusivity. A follow-up adds the **DB-level backstop**: three partial unique indexes on `SponsorMeeting` (`(sponsorId,timeBlockId)`, `(userId,timeBlockId)`, `(sponsorId,userId)`, each `WHERE status='CONFIRMED'` — `EXCLUSIVE_SLOT_INDEXES`) close the sub-millisecond TOCTOU window the read-then-write guards cannot; `exclusiveSlotConstraintError`/`commitOrConflict` map an index-caught race to the same typed 409 the guards produce (a per-pair skip in the auto-scheduler). Applied by `db:migrate-exclusive-slot-indexes`, which refuses to run until `db:migrate-exclusive-slots --apply` has cleared legacy duplicates (a unique index can't be created over collisions); verified by `test:slot-indexes`.

### NextAuth + JWT sessions + scrypt password hashing

All four apps use NextAuth v4.24 with the `jwt` session strategy. Passwords are hashed with Node's built-in `scrypt` (cost `N=2048`); stored hashes encode the cost factor inline as `<hex-hash>.<salt>.<N>` so legacy hashes (without a cost field) still verify against the fallback `N=16384`.

JWT was chosen over database-backed sessions to avoid a DB round-trip on every authenticated request — the four apps share the same `User` table and the same `NEXTAUTH_SECRET`, but each app issues its own JWT cookie scoped to its own domain. Scrypt was chosen for portability (Node built-in, no native module) and tuned to `N=2048` as a deliberate cost/security trade-off (~8× faster than the Node default while remaining secure for the demo audience scale).

See full rationale in [`adr/0002-nextauth-jwt-sessions-with-scrypt.md`](adr/0002-nextauth-jwt-sessions-with-scrypt.md) and the identity / auth section of [`architecture.md`](architecture.md#identity-and-auth).

### Turso + libSQL data layer, with a multi-mode client

The data layer is a single Prisma schema executed against SQLite locally and Turso (libSQL over HTTP) in production. The client at `packages/db/src/client.ts` picks one of six runtime modes based on the active environment — build-phase SQLite, Turso HTTP on Vercel, Turso embedded replica locally, plain SQLite for local-only dev, plus failure-mode sentinels. The mode value is exposed as `dbConnectionMode` for diagnostics.

Turso was chosen for SQLite semantics with managed hosting and replicas, avoiding the operational overhead of a standalone Postgres while keeping the data shape consistent with local development. The embedded-replica mode for long-running dev sessions buys SQLite-speed reads at the cost of a 60-second sync interval (acceptable trade-off documented in [`incident-playbook.md` → Embedded-replica stale read](incident-playbook.md#4-embedded-replica-stale-read)).

See full rationale in [`adr/0003-turso-libsql-data-layer.md`](adr/0003-turso-libsql-data-layer.md) and the data-flow section of [`architecture.md`](architecture.md#data-flow).

### Image content base64-encoded in the database

User avatars, sponsor logos, speaker photos, and other small images are stored as base64-encoded strings directly inside their owning row's `String?` field — no separate file-storage backend.

The decision was made early for prototype velocity and held through the demo sprint despite known performance implications. Verifying Phase 1's perf improvements on Vercel-preview Lighthouse on 2026-06-27 surfaced the structural cost: the lantern-model simulated-LCP inflates 2–10× over observed LCP because Lighthouse projects post-load image transfer time into the page's critical path. Phase 15 trimmed the worst single endpoint (`/api/data/chat` from ~4.2 MB to 1.5 KB by dropping unused member-avatar joins), but the remaining `/api/data/*` endpoints continue to ship inline base64 payloads.

The architectural fix (Phase 16 in the sprint PRD) is to migrate images to a file-storage backend (Vercel Blob is the recommended fit) post-demo. See full rationale + the proposed migration plan in [`adr/0004-base64-images-in-db.md`](adr/0004-base64-images-in-db.md).

### The onboarding gate is about the person, not the app (2026-07-31)

A participant whose required profile fields are empty is stopped and sent to a checklist. Who that rule does *not* apply to is stated as a kind of person rather than as a list of app names: the gate calls `isWbrStaff()` in [`packages/db/src/app-access.ts`](../packages/db/src/app-access.ts) before it asks any completeness question, so organizer, admin and staff accounts are released in every app. Participants are measured — a delegate against their own profile, a sponsor representative against their exhibiting company's profile.

The earlier wording named two never-gated apps, which left an organizer inside the participant app gated exactly like a delegate, and would have sent the primary demonstration login (`wbr@test.com`: organizer role, no exhibiting company, admitted to the sponsor portal) to a checklist whose save address answers `403 No sponsor linked` — a form it could never complete. The chosen wording also means a fifth app cannot silently gate the people running the event.

The accepted cost is that `WBR_ROLES` now answers two questions at once: which app a role may sign in to, and who is exempt from onboarding. Adding a role to that array exempts it from onboarding everywhere, immediately. Recorded at the definition.

See full rationale, the three rejected alternatives and the verification in [`adr/0008-onboarding-gate-is-about-the-person-not-the-app.md`](adr/0008-onboarding-gate-is-about-the-person-not-the-app.md).

---

## Performance (2026-06-22 demo sprint)

The 2026-06-22 demo-prep sprint addressed seven static-survey performance findings (numbered #1–#7 in the engineer-local perf-investigation recon document, gitignored) plus two follow-on findings that surfaced during in-sprint verification. Each finding shipped as one PR-sized phase per the engineer-local sprint PRD (gitignored).

### Phase 1 / Finding #1 — Gate the attendee `BackgroundPrefetch` fan-out

`BackgroundPrefetch` in the attendee authenticated layout fired eight parallel data prefetches on every layout mount, competing with the current page's critical query for bandwidth and Prisma connection. The fix gates the fan-out by route, defers behind `requestIdleCallback`, or skips on first paint. Single largest expected demo-perceived performance win. AC re-framed mid-sprint to observed-LCP-primary after Phase 1's tier-B verification surfaced the lantern-model issue (see [base64 ADR](adr/0004-base64-images-in-db.md) for the methodology context). Verification in [`smoketests/phase-1-prefetch-fanout-gate.md`](smoketests/phase-1-prefetch-fanout-gate.md).

### Phase 2 / Finding #2 — Sponsor viewport + attendee/meetings a11y zoom polish

The sponsor app's `viewport` export only set `themeColor`, causing iOS 15+ to render at 980 px desktop width with horizontal scroll. Fix: add `width: 'device-width', initialScale: 1`. Side polish: removed `userScalable: false` / `maximumScale: 1` from attendee and meetings to restore pinch-to-zoom (an accessibility regression flagged by Codex during recon review). Verification in [`smoketests/phase-2-sponsor-viewport-and-a11y-zoom.md`](smoketests/phase-2-sponsor-viewport-and-a11y-zoom.md).

### Phase 3 / Finding #5 — Move sponsor `/api/attendees` preload off root layout

The sponsor app preloaded the attendee list on every route including `/login`, where the data was never used. Fix: relocate the preload to the authenticated layout. Phase 3 was the first phase to consume the Playwright contract-verification install per PRD §8.6 — the routing contract (zero `/api/attendees` requests on `/login`; one or more on a post-auth route) is verified deterministically in [`smoketests/playwright/phase-3-sponsor-preload-relocate.mjs`](smoketests/playwright/) rather than via subjective load-time judgment. Verification in [`smoketests/phase-3-sponsor-preload-relocate.md`](smoketests/phase-3-sponsor-preload-relocate.md).

### Phase 4 / Finding #3 — Strip login background imagery (per 2026-06-26 HYBRID decision)

The meetings and sponsor `/login` pages shipped ~428 KB of hot-linked Unsplash backgrounds on every demo viewer's first page load. The 2026-06-26 stakeholder call adopted a HYBRID approach: strip imagery from `/login` (no value relative to the bandwidth cost on the highest-traffic surface) and retain branding imagery on the mobile-app headers (Phase 14 compresses these). "Strip" was clarified later as "do not serve to the user" — the `<img>` block was commented out, not deleted, so re-enablement is a single comment removal. Verification in [`smoketests/phase-4-strip-login-imagery.md`](smoketests/phase-4-strip-login-imagery.md).

### Phase 5 / Finding #4 — Split attendee NetworkFirst PWA timeout by rule class

All five NetworkFirst rules in the attendee PWA shared `networkTimeoutSeconds: 10` — too patient on congested conference WiFi. Fix: image-class rules switched to `StaleWhileRevalidate` (instant cache, background refresh); page and RSC rules kept NetworkFirst semantics but dropped the timeout to 5 s. Rule order was also fixed during review (image-class rules must precede the broader page rule, otherwise Workbox's first-match shadows them — Codex Round 1 caught the parallel issue on the static-assets rule). Verification in [`smoketests/phase-5-pwa-timeout-split.md`](smoketests/phase-5-pwa-timeout-split.md).

### Phase 7 / Mid-sprint Lighthouse re-measurement gate

A measurement-only phase: re-run the Phase 2 Lighthouse runner against the production deployment to decide whether Phase 8 (initialData wire-up) was needed. Cut from sprint after Path D was adopted (see below).

### Phase 8 / Finding #6 — `initialData` on attendee landing pages (conditional, deferred)

A contingency phase to wire `initialData` via `HydrationBoundary` on the attendee landing pages if Phase 1 alone did not close the LCP gap. With the AC re-framed to observed-LCP-primary and the base64-image structural ceiling acknowledged, Phase 8 was deferred to post-sprint along with Phase 16.

### Phase 9 / Finding #7 — Move admin `/dashboard/attendees` pagination server-side

The admin attendee list shipped the full ~1000-user table inline in the HTML response (~1252 KB). Fix: pagination, search, and filter moved to the server; the existing 50-row client paging UX retained. The duplicate `useAttendees()` client fetch was removed (the table previously fetched via React Query *and* received the full list as a prop). Playwright contract verification at [`smoketests/playwright/phase-9-admin-pagination-server-side.mjs`](smoketests/playwright/). Verification in [`smoketests/phase-9-admin-pagination-server-side.md`](smoketests/phase-9-admin-pagination-server-side.md).

### Phase 15 — Trim attendee `/api/data/chat` payload to chat-list-needed fields

Surfaced during Phase 1's tier-B verification on 2026-06-27. The chat-data prefetch shipped every member of every chat room with their full `User.image` field. The seed-data `General` CHANNEL auto-enrolled every attendee, so the API shipped hundreds of full member records with avatars on every authenticated layout mount — but the chat-list UI renders no member data on CHANNEL rooms (just a `#` gradient icon). Fix: API rewritten to omit `members` on CHANNEL rooms and return only the "other" member on DIRECT rooms. Single-endpoint reduction ~4.2 MB → ~1.5 KB. Verification in [`smoketests/phase-15-chat-payload-trim.md`](smoketests/phase-15-chat-payload-trim.md).

### Phase 14 — Remove external hot-linked imagery from attendee app (amended 2026-06-29)

Discovery during the Phase 11B follow-on session showed Phase 14's original "compress mobile-app-header imagery" scope was speculative: only the attendee app has a hero surface, and the material defect was a hot-linked fallback in `HomeScreen.tsx` (hero render block) serving an unrelated marketing image (`agcdn-1d97e.kxcdn.com/...alphagamma-eTail-2021...jpg`) whenever `Conference.heroImageUrl` was null — every dev environment and every fresh production install. A second hot-link in `PeopleClient.tsx` (WBR module avatar render — pre-edit line 561; post-edit the preserved rollback `<Image>` is in the JSX comment around line 571) — a 44×44 avatar against `encrypted-tbn0.gstatic.com` — was bundled into the same fix. Resolution: code-based linear-gradient backdrop on the hero (`linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)`, matching the existing WBR-module gradient at `PeopleClient.tsx` ~line 558) plus a local-icon swap on the avatar (`/icons/icon-192.png`, already on disk at 39 KB). Original `<Image>` blocks preserved verbatim in JSX comments at both code sites so post-UAT rollback is a single-file revert; `images.remotePatterns` entries retained in `apps/attendee/next.config.js` with explanatory comment. The PRD-original "≤80KB per header" AC was moot under the amended approach since no images are introduced. Verification in [`smoketests/phase-14-mobile-header-imagery.md`](smoketests/phase-14-mobile-header-imagery.md).

### Path D — re-frame AC to observed-LCP-primary (2026-06-27)

Adopted mid-sprint after Phase 1's tier-B verification showed that Lighthouse's lantern-model simulated LCP was dominated by the base64-image payloads in the post-load fetch chain. Observed LCP (actual paint time during the Lighthouse run) became the gating metric for in-sprint AC; simulated LCP retained as a supplementary signal for the perf delta report. The structural ceiling on simulated LCP unlocks with Phase 16 (post-sprint image-storage migration). Documented in detail in PRD §4 and PRD §6 Phase 1 "Methodology note."

### HYBRID imagery decision (2026-06-26)

A stakeholder call on 2026-06-26 settled the imagery-policy question across both Phase 4 (login backgrounds) and Phase 14 (mobile-app headers). Strip imagery from login pages (low value relative to bandwidth on the highest-traffic surface); retain compressed local imagery on mobile-app headers (brand anchor, controlled payload). Captured in the sprint PRD §6 Phase 4 and Phase 14 entries.

---

## Process and quality controls (2026-06-22 demo sprint)

The 2026-06-22 demo sprint trialed a set of engineering practices that were authored and refined in-flight. These are recorded here as a starting template for future WBR engineering work — not as enshrined rules.

### Per-phase smoketest (with explicit shape contract)

Every phase ships a smoketest at `docs/smoketests/phase-<N>-<short-title>.md` alongside the code change. The shape rules — including the two step categories (contract check vs. perf-bar check), banned subjective pass language, and the four-tier perf-bar environment model (A production / B Vercel preview / C local prod build / D dev = invalid) — are captured in [`smoketests/CONTRACT.md`](smoketests/CONTRACT.md). The contract was authored retroactively after Phase 1's smoketest surfaced two defects in the unconstrained format. A skeleton template is provided at [`smoketests/_template.md`](smoketests/_template.md).

### Codex adversarial review loop (N=3 cap, AC-failing-blocking)

Every phase undergoes a Codex adversarial review post-implementation: Codex returns AC-failing findings (breaking — block merge) and non-breaking findings (style / quality — surface, do not gate). Claude Code applies fixes for AC-failing findings between rounds; loops until zero AC-failing or the cap of three rounds is hit. The full cap is run even if earlier rounds converge — the practice is to commit only at the end of the review cycle, preserving the audit trail of what Codex found across rounds. Codex logs live at `docs/codex-reviews/phase-<N>-<short-title>.md`.

**Amendment 2026-08-08 — half of this practice is being followed and half is not, and the second half is recorded here rather than left as a silent gap.** The review rounds themselves have continued: the five phases of the 2026-08-07 acceptance follow-up sprint each ran the full three, and the findings changed the code in every case. What has stopped is the log *file*. `docs/codex-reviews/` holds no entry for any of those five phases; the substance went into the engineer-local requirements document and into the commit messages instead.

That is a real loss for anybody reading the repository alone, because an empty folder cannot distinguish "no review happened" from "the review is recorded somewhere you cannot see". **This entry does not settle which way to close it.** Two options, and the choice is a working-practice decision rather than a technical one: write the five missing logs and resume the convention, or retire the folder deliberately and name the commit message plus the smoketest as the committed record of what review found. Whoever takes it should also decide whether a log adds anything the commit message does not already carry, since the recent commit messages have been carrying the findings in full.

### Playwright contract verification (added 2026-06-28)

Several upcoming-phase AC items (Phases 3, 5, 9, 14) name *behavioral* or *timing* contracts that Lighthouse alone cannot verify deterministically — network-event routing, service-worker runtime behavior, interactive-flow controls, lazy-load timing, before/after visual identity. The 2026-06-28 amendment added Playwright as the runner for these contracts. Scripts live at [`smoketests/playwright/phase-<N>-<short-title>.mjs`](smoketests/playwright/) and execute against local production-build servers. Playwright is a smoketest runner, not a CI gate or always-on test suite — it does not contradict the sprint's non-goal on continuous integration.

### Finding protocol (mid-sprint findings flow through PRD before code)

When a finding surfaces that affects sprint scope or AC, the engineer-of-record sequence is: Analysis → Decision → Update PRD + plan → Implementation. The PRD is treated as canonical; code without a PRD entry is treated as undocumented engineering history. The full protocol lives in the engineer-of-record's session memory (engineer-local, gitignored).

### Practices recorded as a template, not enshrined as a ruleset

This sprint's practices were authored and refined in-flight as the engineer-of-record cycle surfaced what worked. They are recorded here, and a forthcoming `CONTRIBUTING.md` (Phase 11B) will capture them for a future engineer to adopt, adapt, or supersede — but they are not mandatory company-wide doctrine. Future projects may take what is useful and leave the rest. Specific practices that may not generalize cleanly include the four-app PR cadence, the N=3 Codex cap, and the gitignored engineer-local PRD/plan layout.

---

## AI

### AI demo posture — constraints-only, no production rollout planning

The 2026-06-22 sprint sets a deliberate non-goal of production-scale AI rollout. The demo includes 1–2 small AI surfaces (Phase 12 in the sprint PRD), bounded by binding constraints:

- Cheap model tier only (Gemini Flash, Claude Haiku, GPT-4o-mini equivalent — no frontier models).
- Internal-only audience for the 7/6 demo; no public-traffic exposure.
- No attendee-app hot-path placement (perf protection is sprint priority).
- Free-tier rate limits should suffice; if paid tier is needed, route via the engineering manager's Tailor AI key path.
- Feature-flagged for mid-demo kill-switch.
- Graceful UX degradation on AI-provider 429 / 5xx.

This posture exists to surface AI capability without committing to production-scale rollout planning. The three larger AI features named in the project charter (recommendation engine, smart matchmaking, conversation assistant) remain on the post-demo roadmap, not the sprint deliverable list.

### Phase 12a — Sponsor portal AI intro drafter (added 2026-07-01)

The visible AI moment in the 7/6 demo. A `Draft intro` secondary button on the existing sponsor-portal `RecommendedAttendees` cards opens an intro draft modal — the AI streams a 3-sentence personalized opener grounded in attendee bio + role + matched solution tags + sponsor tagline, and the sponsor reviews / edits / sends. The intro lands in `MeetingRequest.message` per [ADR 0005](adr/0005-ai-intros-via-meeting-request-message.md); the existing one-click Connect flow is unchanged.

Locked at implementation: `gpt-4o-mini` via AI SDK v7 (`ai@^7` + `@ai-sdk/openai@^4` + `zod@^4`); structured output via `generateText` + `Output.object({ schema })`; `temperature: 0.2`, `maxOutputTokens: 200`. Layer 1 prompt grounding ("Do NOT invent" system message + JSON-only user payload). Layer 2 Zod-validated structured output with a `groundedFields` provenance array. Layer 3 UI-level HITL: pre-flight `canDraft` input gate + tiered friction (shape E from grill) — high-confidence sends single-click, low-confidence interposes a "Limited data — Send anyway?" confirm. Graceful degradation (pattern γ): AI failure opens the modal with an empty editable textarea + `⚠ AI draft unavailable` banner; the manual-send path bypasses the confirm modal.

Kill-switched behind `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` (server, authoritative) + `NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` (client mirror, compile-time inlined — a build is required after toggling). Rate limits, cost caps, `AiCallLog` persistence, idempotency-key dedup, and cap-hit UI states are explicitly deferred to Phase 12b — the demo-audience worst-case cost is sub-dollar and the kill-switch is the compensating control for the 7/6 demo.

Full scope in the engineer-local sprint PRD § Phase 12a (gitignored). Grip competitive-intelligence lens is what motivated the surface choice: Grip's flagship AI Matchmaking is non-generative (16 ML strategies, Tinder-style swipe UX; no intro-drafting text anywhere in the matchmaking flow). Phase 12a ships generative text INTO the matchmaking flow — the differentiation angle.

### Phase 12b — AI surface production controls (added 2026-07-01)

Adds per-user + global rate limiting, cost-attribution telemetry, idempotency-key request dedup, and a graceful set of cap-hit UI states to the Phase 12a route. Closes the sponsor-side rate-limit gap for the Draft intro surface specifically; other sponsor endpoints remain in the system-wide gap.

**Locked caps** (as code constants in `apps/sponsor/lib/ai-controls.ts`; tunable in-place, promote to env vars if tuning becomes frequent post-deploy):

- per-user **burst**: 5 requests / rolling 60s window
- per-user **daily**: 20 requests / rolling 24h window
- **global daily**: 1000 requests / rolling 24h window (all users combined)

**Response matrix (locked):** burst-cap → HTTP 429 `{error: "burst_limit"}`; user-daily-cap → HTTP 429 `{error: "daily_limit"}`; global-daily-cap → HTTP 503 `{error: "global_limit"}`. Route checks in order (burst → user-daily → global-daily); first hit wins.

**AiCallLog Prisma model** persists per-call metadata (`userId`, `attendeeId`, `surface`, `createdAt`, `costEstimateUsd`, `idempotencyKey`, `responsePayload`, `expiresAt`) with three composite indexes on `(userId, surface, createdAt)` / `(surface, createdAt)` / `(userId, attendeeId, idempotencyKey, expiresAt)` and a unique constraint on `(userId, attendeeId, idempotencyKey)` for race-safe atomic first-write-wins under concurrent same-key requests. No FK relations — matches the `EmailLog` precedent so the audit trail survives user/attendee deletion.

**Request flow:** dedup lookup → cap pre-flight → attendee/sponsor DB fetch + `canDraft` gate → AI call → `insertOrDedup` (row write with unique-violation fallback that returns the winner's payload for concurrent same-key races). Client generates a fresh `idempotencyKey` UUID per Draft intro button click; the 5-second dedup window absorbs retry loops without new AI cost. `GET /api/recommendations/quota` returns `{remaining, capHit}` for pre-flight button-level state.

**Cap-hit UI copy** (locked):

- burst_limit → `Slow down — try again in a minute.`
- daily_limit → `Daily limit reached. Resets at midnight.`
- global_limit → `AI temporarily unavailable.`

Landed in the sprint per the 7/1 tech-check headroom. Full scope in the engineer-local PRD § Phase 12b (gitignored).

---

## Hosting

### Vanity URL, not a full hosting migration

The original sprint plan targeted a vanity URL (`wbr.tailor.tech`) on the attendee Vercel project as the demo-visible host, with the other three apps retained at their `.vercel.app` URLs. This was a deliberate choice over a full migration to Tailor-managed infrastructure — the time cost of a platform migration competes directly with demo-prep, and the vanity URL captures the customer-facing brand value without the migration's risk surface. Captured in the project charter §3.4 and the sprint PRD §6 Phase 10.

The vanity URL provisioning itself stalled on a platform-policy escalation (see [Open questions](#open-questions) below).

---

## Open questions

### Hosting platform — pending sponsor + exec decision (as of 2026-06-30 JST)

The Phase 10 vanity-URL provisioning surfaced a corporate platform-policy question: Vercel is on the unauthorized-platforms list at the parent organization. Three options under sponsor + executive review:

1. Exception path — secure a Vercel exception for the 7/6 demo plus a commitment to migrate post-demo.
2. Rapid migration — move the four WBR apps to the sanctioned platform before 7/6.
3. Customer-side adjustment — adapt the demo scope, schedule, or format to fit within current platform policy.

This decision blocks any new Vercel-touching operational work (deploys, custom domains, project re-link). Documenting the current Vercel posture descriptively (in [`runbook.md`](runbook.md) and [`architecture.md`](architecture.md)) is not blocked by the decision — it captures existing state, not new operations. The Vercel-as-platform-of-record ADR is deferred until the decision lands; whichever option lands becomes the basis for that ADR.

Detailed escalation context lives in the engineer-of-record's local handoff doc (gitignored).

---

## Unified HIG design system across all four apps (2026-07-04)

The four apps had drifted into four near-identical-but-forked styling setups: each
`tailwind.config.ts` redefined the brand color (with divergent `primary-light`
values — `#818cf8` vs `#a5b4fc`), each `globals.css` re-declared overlapping component
classes with `@apply`, "Inter" was declared in every config but **never actually loaded**
(so everything silently fell back to system fonts), and pages had accreted parallel
color systems (an Apple-blue `#007AFF`/`#FF3B30` set in web speakers, a blue→pink
gradient nav, four un-tokenized beiges + an iOS palette in attendee, four conflicting
meeting-status color maps, ~45 raw hexes in one sponsor view).

Decision: a **single source of truth** — [`packages/ui/preset.cjs`](../packages/ui/preset.cjs),
a Tailwind **preset** that every app's `tailwind.config.ts` `require()`s by relative
path. It defines the token scale (Apple-grounded neutrals: `#f5f5f7` canvas, `#1d1d1f`
ink ramp, `#e5e5ea` hairline; the brand indigo ramp anchored on the pre-existing
`#6366f1`; Apple system-color status set) and injects the shared base + component layers
(`.card`, `.btn-*`, `.input`, `.badge*`, `.chip*`, `.tab-bar`, `.section-title`,
`:focus-visible` rings, `prefers-reduced-motion`). The full spec is
[`docs/design-system.md`](design-system.md).

Delivery is **build-time only** (a preset read by PostCSS) — so it needs no
`transpilePackages`, no workspace symlink, and ships **no runtime JS**. The HIG-correct
font choice is the **system stack** (SF Pro on Apple devices), which is also a zero-byte
download — resolving the never-loaded-Inter gap for free. Net performance impact measured
against a pre-change baseline: shared First Load JS unchanged (102/104/102/102 kB) and the
largest per-route First-Load delta across all four apps is **+0.0 kB**. Guarded by
`scripts/test-design-system.mjs` (alias `pnpm test:design`), which asserts every app wires
the preset, the preset exposes the expected token + component surface, and no app
reintroduces the retired rogue-color systems. No separate ADR filed — this is a
styling-layer convergence, not an architectural boundary change.

### Primary CTA restyle — gradient → solid "glow" button (2026-07-06)

The signature primary CTA was a blue→pink gradient (`.btn-primary`,
`BRAND_GRADIENT = linear-gradient(135deg, #3b82f6, #ec4899)`). Design direction moved
it to a **solid indigo fill (brand-600 `#4f46e5`) with a light lavender edge
(brand-300) and a soft violet halo** — the "new style button." Because the CTA look
lives in exactly one place — `.btn-primary` in [`packages/ui/preset.cjs`](../packages/ui/preset.cjs) —
the change is a **single edit that repaints all 79 primary buttons across the four
apps at once**; no per-call-site churn was needed for the shared class.

Decisions & scope: (1) the change is **buttons only** — the blue→pink gradient is
**retained** for non-interactive identity marks (`.brand-gradient` /
`bg-brand-gradient`: logo squares, avatar/icon fallbacks), which is what that gradient
now exists for; (2) the glow is built purely from `color` + `box-shadow` (a spread
ring + halo), so it changes **zero layout** — no border box-model shift — and keeps the
44px HIG touch target, tap-scale, focus-visible ring and disabled state from `btnBase`;
(3) three one-off gradient/near-CTA buttons were folded into the shared class for
consistency: the two per-integration "Connect" buttons in `apps/web` IntegrationsClient
(their inline accent gradient dropped; service identity stays on each card's icon +
accent strip), the attendee global-chat send button (flattened to the solid brand-600
fill), and the `apps/meetings` login button (was a hand-rolled `bg-primary`, now
`.btn-primary`); (4) the violet halo is defined in the preset in `rgba()` form, keeping
it out of app source and clear of the retired-hex-literal guard in `test:design`. The
category-color solution chips (a deliberate categorical data-color system, exempted in
`test:design`) are intentionally left untouched. Guarded by
`scripts/test-button-style.mjs` (alias `pnpm test:buttons`): asserts `.btn-primary`
paints no gradient, keeps the glow recipe + HIG affordances, preserves the decorative
`.brand-gradient`, and that no `<button>` reintroduces a gradient fill. No ADR — a
styling-layer restyle, not an architectural change.

## Scheduled chat broadcasts — read-path dispatch, no job queue (2026-07-10)

Admins can pre-schedule Global Broadcast messages from the Chat page. Rows live in a new
`ScheduledMessage` table (`PENDING | SENT | CANCELED | FAILED`); due rows are
materialized into real `Message` rows by `dispatchDueScheduledMessages()` in
`packages/db/src/scheduled-messages.ts`. **Delivery decision:** the stack has no job
queue (see ADR 0001/0003 constraints), so dispatch runs opportunistically on the chat
read paths — the admin page's scheduled-queue poll (30s), `/api/data/chat`, and the
attendee global-chat polls (15s) — plus a Vercel cron on `apps/web`
(`/api/chat/scheduled/dispatch`, per-minute, `CRON_SECRET`-authorized). Every caller may
race; correctness comes from an atomic per-row claim (`updateMany` guarded on
`status: PENDING` — a single conditional UPDATE), so a message is delivered at most once
even across concurrent serverless instances. A send failure after claim marks the row
`FAILED` (surfaced in the UI history; never silently dropped, never double-sent). Edits
and cancels use the same status guard and return 409 once the row stops being PENDING.
**Schema on Turso:** `prisma db push` cannot target `libsql://`, so the DDL is replayed
by `scripts/migrate-scheduled-messages.mjs` (alias `pnpm db:migrate-scheduled`;
idempotent, also handles local files via `--local`). Guarded by
`scripts/test-scheduled-messages.mjs` (validation + dispatch atomicity/idempotence/
failure paths against a scratch DB) and `scripts/test-scheduled-messages-api.mjs`
(HTTP acceptance: auth, validation, CRUD, live delivery, cache revalidation).

---

## Instagram-style Feed redesign — social layer on the Message stream (2026-07-10)

The People→Feed tab was fully redesigned as an Instagram-style feed (light mode,
HIG-compliant, design-system tokens only): WBR wordmark header, gradient-ring stories
rail (`bg-brand-gradient`), edge-to-edge post cards with like/comment/share/bookmark
actions, a "New post" bottom-sheet composer with client-side image downscaling
(canvas → JPEG ≤1080px), and a comments bottom sheet. UI lives in
`apps/attendee/components/people/FeedTab.tsx`; `PeopleClient.tsx` keeps the other tabs
and the DM modal untouched. **Model decision:** the feed stays on the `room-general`
`Message` stream (scheduled-broadcast dispatch and the DM layer keep working unchanged)
rather than reviving the orphaned `Post`/`PostLike` models — social features are
additive: `Message.imageUrl` (base64 data URI per ADR 0004, ≤2M chars validated
server-side), new `MessageLike` (unique per user+message) and `MessageComment` tables,
enriched feed payloads (`likeCount`/`commentCount`/`likedByMe`), and
`/api/feed/[messageId]/like` + `/comments` routes. Like/comment endpoints are guarded
to `room-general` so they can never touch DM rooms. **Schema on Turso:** replayed by
`scripts/migrate-feed-social.mjs` (alias `db:migrate-feed`; idempotent, `--local` for
sqlite files), mirroring the scheduled-messages pattern. Guarded by the extended
`test:feed` (logic), `test:feed:api` (HTTP acceptance incl. DM-leak guards), and
`e2e:feed` (Playwright: stories, create, like persistence, comments) suites.

## Friend requests replace one-way follows — mutual Follow edges, DM gated on friendship (2026-07-11)

The People→Feed "Follow → Following" button became a friend-request flow: **Friend**
(request sent) → **Pending** (tap cancels) → the recipient sees **Accept** (feed button,
people rows, and a "Requests" section in the Friends tab, with a decline ✕) → **Friends**
(terminal, inert in the feed; unfriend lives behind a confirm on the people rows).
**Model decision:** friendship is represented as MUTUAL `Follow` edges — one row is a
pending request, both rows are a friendship — so the feature needed NO schema change
(hand-replayed Turso DDL is the costly step per the scheduled/feed precedents). The
derivation helpers live in `packages/db/src/friends.ts` (`FriendStatus`,
`applyFriendAction` with auto-advance and explicit `remove`, `deriveFriendStatusMap` as
the single classifier); `/api/friend/[userId]` (GET status, POST action) replaced the
deleted `/api/follow/[userId]`. **DM gating decision:** only friends can start a DM —
`getOrCreateDirectRoom` refuses to create a new DIRECT room with `code: 'NOT_FRIENDS'`
(HTTP 403 from `POST /api/chat/rooms`), while EXISTING rooms are grandfathered: they
still open and still accept messages after an unfriend (`postRoomMessage` stays
membership-gated by design; test-asserted). All DM entry points honor the gate: the
People DM modal shows an inline friendship gate with the contextual action, `chat/new`
lists only friends, `chat/dm/[userId]` routes through the gated data-layer path, and the
meetings/my-schedule "Message" buttons fall back to the person's profile (where the
friend-request tile lives). **Cutover:** rows created under the one-way model would read
as mere pending requests, so `scripts/migrate-friends-backfill.mjs` (alias
`db:backfill-friends`; idempotent) mirrors every one-directional edge, converting each
pre-existing follow into a friendship. Guarded by `test:friends` (62-check data-layer
suite), `test:friends:api` (HTTP acceptance: lifecycle, 401/400/404, DM gate 403 →
friends → 200, grandfathering), and the extended `test:feed` / `test:feed:api` /
`e2e:feed` suites.

---

## Admin Chat: remove the Direct Messages viewing surface (2026-07-20)

The admin (`apps/web`) Chat page previously stacked two sections: **Global Broadcast**
(top) and a **Direct Messages** viewer (bottom) — a "Direct Messages — N conversations"
list where an organizer could expand any DIRECT room and read two attendees' entire
private thread. That viewer was removed; the Chat page is now the Global Broadcast
surface alone. **Why:** a back-office reader of every attendee's private DMs is a privacy
liability, and the surface had no membership gate (`GET /api/chat/rooms/[roomId]` returned
any room's full history to any admin session). **Scope decision — surgical, not a chat
teardown:** the viewer was self-contained and read DM data through *raw inline Prisma*
(`chatRoom.findMany({ where: { type: 'DIRECT' } })`) in the route and server page, calling
**no** `packages/db/src/chat.ts` function — so the shared chat data layer was left
untouched and the attendee DM system (`getOrCreateDirectRoom` / `listRoomMessagesForUser`
/ `postRoomMessage`, and the attendee `/api/chat/rooms*` routes) is unaffected. Deleted:
`components/DMRoomsClient.tsx` (whole file) and `app/api/chat/rooms/[roomId]/route.ts`
(whole route — `DMRoomsClient` was its only caller). Stripped: the DIRECT-room query and
`rooms` payload from `app/api/data/chat/route.ts` and `app/(dashboard)/dashboard/chat/page.tsx`,
and the DM list + its loading skeleton from `ChatPageClient.tsx` / `loading.tsx`. Preserved
untouched: Global Broadcast, scheduled broadcasts, the Sidebar Chat entry, and the `chat`
permission key. The DIRECT `ChatRoom` rows themselves stay — they are a shared model the
attendee DM feature depends on; only the admin *viewing* of them is gone. Guarded by
`test:chat-no-dm` (42-check source contract: files deleted, DM markup/queries/`rooms`
gone, broadcast + attendee DM layer + nav/permission all intact) and `test:chat-no-dm:api`
(HTTP acceptance: `/api/data/chat` drops `rooms` while keeping the broadcast payload, the
deleted DM route 404s for an authed admin, `/api/chat/scheduled` still 200s, and
`/dashboard/chat` renders "Global Broadcast" but not "Direct Messages").

### Chat Settings — admin-controlled friend/message gating

The admin Chat page (`apps/web` → `/dashboard/chat`) gained a **Settings** tab
(alongside the existing **Broadcast** tab) that gates who may *initiate* contact —
send a friend request or open a new DM — across the conference. Three controls:
(1) a **global master switch** for all vendor → attendee/speaker outreach;
(2) **per-vendor** switches (per Sponsor company) for Attendees and/or Speakers;
(3) **per-staff** switches (per WBR Staff member) for Attendees, Vendors and/or
Speakers. Defaults are permissive (everything enabled), so the feature is a pure
opt-in restriction layer over the existing mutual-Follow friendship gate; existing
conversations are grandfathered (mirrors the `NOT_FRIENDS` behavior).

Persistence follows the `RolePermission` precedent — a `ChatMessagingPermission`
table (`(scope, subjectId)` PK, JSON `settings`) owned by a defensive
`CREATE TABLE IF NOT EXISTS` in `packages/db/src/chat-settings.ts`, so it works on
Turso before a `prisma db push`; the model shape in `schema.prisma` matches the DDL
exactly (push stays a no-op). `chat-settings.ts` has **no relative imports** (it is
type-strip tested and re-exported from `@conference/db`), holding the same
discipline as `chat.ts`/`friends.ts`. The single composite gate
`checkMessagingPermission()` fails **open** on any DB error — a moderation toggle
never hard-breaks messaging. Enforcement is wired at the attendee choke points via
`apps/attendee/lib/messaging-guard.ts`: `POST /api/friend/[userId]` (the `request`
initiation only), `POST /api/chat/rooms`, and the `chat/dm/[userId]` server page.
UI reuses the Staff page's tab-shell + iOS-switch + dirty/SaveBar idioms (HIG). New
Turso environments run `pnpm db:migrate-chat-settings`. Tests: `test:chat-settings`
(pure logic + persistence), `test:chat-perm` (composite enforcement against real
User/Sponsor rows), `test:chat-settings:api` (HTTP GET/PUT auth + persistence,
self-restoring).

---

## Admin Company Scheduler — engine capability shared into apps/web, HIG-native UI (2026-07-26)

The company-centric meeting-engine capability (company directory → per-company
schedule matrix with an unscheduled request bank, availability-driven assign/
reschedule with per-room occupancy, cancel with preserve-vs-remove-request
semantics, priority auto-schedule) was integrated into the admin app as a third
Meetings tab (**Companies**, `?tab=companies&company=<id>`), rather than linking
admins out to the eTail-styled `/staff` console in apps/meetings. Rationale: the
engine (`packages/db/src/meeting-engine.ts`) was already pure and prisma-injected,
so the admin app adds only a thin permission-gated API
(`/api/admin/scheduler/*`, gated by `roleHasPermission(role,'meetings')` — the
finer-grained layer the older meetings routes predate) and an HIG-native UI per
`docs/prd/meeting-engine-hig-spec.md` (split view, side sheets, alertdialog
cancel, segmented day switcher — all existing preset classes). One engine change
rode along: `getSponsorScheduleMatrix` now surfaces CANCELLED requests in the
sidebar `misc` list as `'Removed'` (previously cancel-with-remove made the request
vanish, since `misc` only read REJECTED). Tests: `test:admin-scheduler`,
`test:admin-scheduler:api` (admin app on :3200), `e2e:admin-scheduler`.

---

## Scheduling lanes — the Auto lane owns every sponsor↔attendee Best Fit request (2026-07-28)

The mutual-Best-Fit rule (both sides pick each other → the match auto-schedules
onto the Auto tab and both schedules) left a hole: the admin Meeting Requests
board queried `MeetingRequest` with no exclusion, so Best Fit picks — mutual
pairs awaiting the next Auto-tab view, and one-sided picks with nowhere else to
live — piled up in the "Needs Review" queue as if they wanted manual approval.
Fixed by splitting scheduling into two lanes with one canonical rule in the
engine (`autoLaneRequestWhere` / `requestBoardWhere` /
`REQUEST_BOARD_PRIORITIES` in `packages/db/src/meeting-engine.ts`): every
sponsor↔attendee `BEST_FIT` request is the Auto lane's — mutual pairs schedule
automatically, one-sided picks show on the Auto board as **Awaiting
Reciprocation** half-match cards (`AutoMatchBoard.halfMatches`, with the other
side's live Med/Low pick surfaced when it exists) — while the Meeting Requests
board owns Med/Low requests (full and half matches) plus peer-to-peer requests,
which have no Auto lane. Enforcement is where-fragment reuse, not UI filtering:
`GET /api/data/meetings` filters with `requestBoardWhere` and runs the
idempotent `syncAutoMatches` sweep before every read (the same read-path
dispatch pattern as the Auto board and scheduled broadcasts), the **global**
bulk schedulers default to `REQUEST_BOARD_PRIORITIES` so "Auto-Schedule by
Priority"/"All" never reach into the Auto lane, and an admin Best Fit
re-tier triggers the sweep in the PATCH route. A one-off CLI sweep
(`db:sweep-auto-matches`) backfills environments seeded before the rule.
Tests: `test:auto-match`, `test:auto-match:api`, `e2e:auto-match`.

**Refinement (2026-07-29):** the *per-sponsor* Companies-tab Auto-Schedule is the
one bulk path that DOES pull every tier. An admin working a single sponsor's
schedule wants every unscheduled approved request placed — including Best Fit
bank items sitting unreciprocated — so `POST /api/auto-schedule` takes an
optional `priorities` body param and the Companies button passes all three
tiers; the default (used by the global buttons) still excludes Best Fit.
Scheduling a Best Fit request here can't conflict with the Auto sweep — exclusive
slots + the pair guard + the unique index make the second writer a no-op skip.

## Auto-schedule ordering — load balancing first (2026-07-29)

`autoScheduleByPriority` (the engine behind every Auto-Schedule button) used to
order candidates by priority tier → fit score → age. The product rule is now
**load-balanced**: the attendee with the FEWEST confirmed meetings is scheduled
first (least → most), so meetings spread evenly across people instead of piling
onto a few popular attendees; ties break by priority tier (Best Fit → Med → Low),
then fit/rank score, then oldest request. The "load" is each attendee's confirmed
`SponsorMeeting` count across all companies — the same "N confirmed" number the
Companies bank shows. It is evaluated **live**: placing a meeting raises that
attendee's load mid-run, so a heavily-booked attendee keeps yielding to lighter
ones (matters when one attendee has requests to several sponsors in a global
pass). Implemented as a greedy select-min loop rather than a one-shot sort. This
is why, in the Companies bank, a rank-3 attendee with 0 meetings is scheduled
ahead of a rank-1 attendee with 5. Verified by the load-balancing section of
`test:priority` and the all-tiers scope checks in `test:admin-scheduler:api`.

## On-site Check-In portal — arrival timestamps on SponsorMeeting, admin-only tab (2026-07-28)

The eTail operational ask "a screen that has all the meetings by time slot …
check, check" (Directions/discovery transcript 41:01–44:44) became a fourth
Meetings tab (**Check-In**, `?tab=checkin`; since promoted to its own sidebar
page at `/dashboard/meetings/check-in`, the old tab URL redirects) in the admin
app rather than a new
app or a `/staff` clone: floor managers are admin/staff users already covered by
the `'meetings'` permission, and the grid is one aggregate query. Attendance is
persisted as two nullable timestamps on `SponsorMeeting`
(`sponsorArrivedAt` / `buyerArrivedAt`, added by the idempotent
`db:migrate-checkin` script) instead of booleans — a timestamp is a free audit
trail ("when did they arrive") and un-ticking simply nulls it. The floor note
reuses `SponsorMeeting.notes` (cancellation notes and floor notes are mutually
exclusive lifecycles: a meeting is either CONFIRMED on the board or CANCELLED
off it). Engine functions (`getCheckInBoard`, `setMeetingCheckIn`) live in the
same self-contained `meeting-engine.ts` so the staff console can adopt them
later without a schema or API change; `setMeetingCheckIn` takes partial input
(undefined = untouched) so concurrent checkbox ticks and note edits never
clobber each other. Sorting follows the PRD exactly: chronological by slot,
alphabetical by sponsor within a slot; the footer reconciles completed
(both arrived) vs total per day and overall. Tests: `test:checkin`,
`test:checkin:api`, `e2e:checkin`.

---

## Meeting requirements — admin-configurable attendee/sponsor targets (2026-07-29)

The two hardcoded engine constants — `FILL_TARGET` (confirmed meetings each
sponsor company should fill, 10) and `REQUIRED_MEETINGS_PER_PERSON` (meetings
each attendee is expected to book, 5) — became admin-editable settings behind a
new **Settings** item in the Meetings tab bar, scoped to the Companies
scheduler (`?tab=companies&view=settings`).
Storage copies the `ChatMessagingPermission` precedent verbatim: a
`MeetingRequirementSetting` table keyed `(scope, subjectId)` with JSON
`{ required }` payloads — `ATTENDEE_GLOBAL`/`SPONSOR_DEFAULT` rows (subjectId
`''`) plus per-company `SPONSOR` rows, created defensively at runtime and
replayed on Turso by the idempotent `db:migrate-meeting-requirements` script.
The settings code lives inside `meeting-engine.ts` itself (the engine file is
type-stripped directly by Node test scripts, so it cannot gain relative
imports); reads fail open to the old constants, writes propagate errors, values
clamp to integers in [0, 99] and `required: 0` means "no requirement" (fill
meters read fully met). `getCompanyDirectory` and `getSponsorScheduleMatrix`
now carry `requiredMeetings` / `requiredMeetingsPerPerson` so every fill meter
and per-person chip uses the live values; the `meetings-ui.ts` mirror constants
remain only as fallbacks. The API (`/api/admin/scheduler/settings`, GET/PUT
behind `requireSchedulerAccess`) returns settings plus the active conference's
sponsor roster; the panel mirrors ChatSettingsPanel's draft/snapshot +
sticky-save-bar mechanics with a shared HIG `Stepper`. Per-company overrides
are diff-only writes; `required: null` deletes the override row. Tests:
`test:meeting-requirements`, `test:meeting-requirements:api`.

---

## The booth number has one author — the organizer, editing it on the marker (2026-08-07)

`Sponsor.boothNumber` had exactly one write path and it was in the wrong app: the
sponsor's own portal profile. `CONTEXT.md` had meanwhile stated since the
onboarding work that the organizer assigns the number, and used that as the
reason the onboarding gate does not block a sponsor on it — so the glossary and
the code said opposite things. An organizer looking at a marker labelled
`no booth number yet` had no box to fix it in and had to ask the exhibitor to
sign in and type it themselves.

The number is now set from the floor plan screen, in one text box that appears
beside the company picker while a marker is being placed and again when a saved
marker is selected, and the sponsor side becomes read-only:
`apps/sponsor/components/ProfileEditor.tsx` renders it as plain text and
`apps/sponsor/app/api/profile/route.ts` refuses the field with `403` rather than
ignoring it. Key decisions: (1) the rules for what a booth number may be live in
one pure module, [`apps/web/lib/booth-number-input.ts`](../apps/web/lib/booth-number-input.ts),
read by both the screen and the write address, so the two cannot disagree about
length or emptiness — the same reasoning as `lib/pin-input.ts` and
`packages/db/src/onboarding-policy.ts`; a blank value stores `null` rather than
spaces, because a stored blank satisfies every truthiness check in the four apps
while being no stand number at all. (2) The write address sits at
`apps/web/app/api/floor-plan/sponsors/[sponsorId]/booth-number/route.ts`, beside
the marker addresses rather than under `sponsors`, and is guarded by the
`floorPlan` permission alone — its neighbour already lets that same caller attach
or detach a company entirely, so demanding a second permission to type that
company's stand number would be stricter on the smaller action, and would put a
box on screen that the server then refuses. (3) The number stays on the company
record and is read through the marker's company relation rather than copied onto
the marker, per [`adr/0007-floor-plan-human-authored-pins-over-raster.md`](adr/0007-floor-plan-human-authored-pins-over-raster.md):
seed and database have already drifted apart on booth numbers while identifiers
have not. One company therefore holds one number, and a company pinned on two
maps reads the same on both. (4) The box appears only once a company is chosen,
because a booth marker with no company has nowhere to put the value. (5) Changing
the chosen company empties the typed number, while the Booth/Room toggle keeps
what was entered — the rule is what the value belongs to: a room name belongs to
the marker, a booth number belongs to the company and cannot follow the picker to
a different one. (6) The organizer's own marker label still reads the company
name; the number is what a delegate's map shows, falling back to the company name
only when none is set. The two screens label a marker differently on purpose.

Two behaviours were examined and deliberately left as they are. A second
organizer writing between this address's write and its read-back means the first
is told the other value — kept, because reporting what the database actually
holds is truer than reporting what this request sent while the row holds
something else. And the sponsor portal's own cached view of the number can lag a
change by up to about a minute, and survives a reload of an open tab; closing
that means admin-to-sponsor cross-app cache invalidation, which is new
infrastructure. A stale screen can no longer cause an unwitting overwrite: the
floor plan's local override now records the server value it replaced and yields
the moment the server reports anything else.

Verified by `docs/smoketests/phase-6-booth-number-from-map.md`, run on a live
workspace rather than only written.

---

## The meetings portal enforces the onboarding gate, on both of its route groups (2026-08-07)

The participant application and the sponsor portal both stopped a person whose required profile fields were empty and sent them to a checklist. The meetings portal did not, so the same person was refused in one place and admitted in another. It now carries the gate.

The measure is the existing delegate required set — name, job title, company, company size, annual revenue, solutions seeking — read from the same policy module the participant application reads. **No second definition of "complete" was introduced, and that is the point**: one person opening two applications must not get two answers, which is the outcome [ADR 0008](adr/0008-onboarding-gate-is-about-the-person-not-the-app.md) exists to prevent. WBR-side roles are released before any completeness question by the same role test that decides who may sign in at all, which is what keeps the staff queue reachable without anything being written for it.

Key decisions. (1) **Both enforcement points, because either alone leaves the other open.** Screens are gated from the layout of every authenticated route group — this portal has two, and the staff group had no layout at all, so one was added whose only job is that call. A gate on the first group alone would have repeated finding F-3, where one of the participant application's two groups was left open and a blocked person could still reach a chat room. Data addresses carry their own guard, called by all nine participant-facing handlers, because a request handler is not rendered inside a layout and the screen gate never runs for it. (2) **The checklist sits outside both gated groups**, at `/onboarding`, so the gate cannot redirect it to itself. (3) **The profile-save address stays unguarded on purpose** — guarding the address the checklist writes through would trap every incomplete person permanently.

One pre-existing defect was fixed here rather than left, because the argument for leaving the staff addresses unguarded rests on it: those addresses authorised on the role carried in the session token rather than the role in the database, so an account whose role was revoked kept control of the meeting engine until it next signed in. The new gate reads the database, which made the disagreement visible — a demoted account was refused everywhere a participant goes while still assigning meetings.

Verified by [`smoketests/phase-1-meetings-onboarding-gate.md`](smoketests/phase-1-meetings-onboarding-gate.md).

---

## The gate demonstration account restores its own incompleteness (2026-08-07)

The onboarding gate is shown on stage using one account held deliberately short of one required field. Completing that profile during a rehearsal used the account up: the self-repair that already ran on sign-in compared password, role and company link only, so a profile completed by hand stayed completed until somebody ran a reset.

The health check now also compares the six delegate required fields against the account's definition, for accounts carrying a flag that asks for it. Key decisions. (1) **Only the demonstration account carries the flag.** The other three canonical accounts are compared exactly as before and are never written by the extended check — containment is the property of this change, not a side note, and it is asserted per account rather than assumed. (2) **Only fields the repair actually writes are compared**, so a definition value left empty cannot make the account write on every single sign-in forever. (3) **The restore runs on the sign-in path and nowhere near the token callback**, which runs repeatedly during a session — a restore there would blank the field while somebody was filling the checklist in, and the save would appear to undo itself. (4) **A code-side flag on the existing account registry, not a new column**: no schema change and no migration against the shared database.

The property is "restored on password sign-in" specifically. The Google and LinkedIn callbacks find or create a row by email address and issue a session without consulting the repair, so an account arriving that way is not restored. That rests on an operational assumption rather than an enforced rule — a demonstration address is at `@test.com` and nobody is expected to hold a Google or LinkedIn account there — and nothing in the code enforces it. Recorded at the definition rather than fixed, and it would need looking at again for a demonstration account at a real address.

Verified by [`smoketests/phase-2-demo-account-restore.md`](smoketests/phase-2-demo-account-restore.md).

---

## The company card sits below the map on a phone, and the map takes a width limit (2026-08-07)

Tapping a marker low on the venue map opened the company card over the very spot just tapped, so a delegate could not see what they had selected. How much of the map was covered was decided by the shape of whatever picture an organizer had uploaded, because the map window takes its height from the picture's proportions.

Below 768 pixels — the styling toolkit's own threshold, which supersedes the 600 named during the acceptance run — three things change together. The map takes a size limit, so the room beneath it is the same whatever is uploaded. The card becomes an ordinary block under the map rather than an overlay, so none of the map is covered. And the shading behind the card is gone, so a tap meant for a second marker switches the card in one tap instead of being spent closing the first. With that shading gone every marker behind the card is reachable, so the card stops describing itself as a modal dialog and stops holding the Tab key — claiming otherwise would describe the screen wrongly to somebody using a screen reader while a sighted person taps freely.

**The limit is applied as a width, and that is the load-bearing decision.** A maximum height would have been the obvious way to write it and would have been a defect: the window hides what overflows it, and the picture takes its height from its own proportions rather than from the window, so a height limit would not shrink a tall picture — it would cut the bottom off it and put every marker down there out of reach. On a portrait floor plan that is the lower third of the hall. Limiting the width scales the whole picture instead, and keeps the window exactly the picture's box, which is the rule every marker position depends on.

**The number was measured rather than chosen.** A predecessor attempt picked 80% of the map window without measuring, which on a 390-pixel phone gave the card 220 pixels against the 317 the tallest company card needs, and put the website link off the bottom for every company — while every automated assertion passed, because they all read the markup. This time the browser was measured first at 390 by 844, and the limit set from what that measurement required.

At 768 pixels and above nothing changes. The same fault exists there at a smaller scale and is deliberately left: this application is used on a phone at a venue, and a limit expressed as a share of the window would shrink a portrait floor plan to about half its size on a laptop, which is a loss on a screen with the room to spare.

Verified by [`smoketests/phase-7-map-card-below-map.md`](smoketests/phase-7-map-card-below-map.md), measured from the rendered screen rather than from the markup.

---

## Sign in with LinkedIn on all three participant-facing apps, and the role is asked before any account is created (2026-08-08)

Only the participant application offered "Sign in with LinkedIn". The meetings portal and the sponsor portal are how a delegate and an exhibiting company's representative actually get in, so the absence mattered more there than on the application it already worked on.

The rules module moved from inside the participant application to [`packages/db/src/linkedin-identity.ts`](../packages/db/src/linkedin-identity.ts) and all three applications deep-import it by module path, matching the precedent set by `app-access.ts`, `onboarding-policy.ts` and `staff-roster.ts`. The rejected alternative was moving only the decision half and leaving the provider configuration duplicated per application — three copies of endpoint configuration is how three copies stop agreeing.

**The module now imports nothing at all, not even a type, and the reason is worth recording because it is not obvious.** It previously declared the provider as the sign-in library's own `OAuthConfig`. That stopped compiling the moment it moved. The participant application is the only one of the four carrying `@ducanh2912/next-pwa`, which brings a compiler package with it, and the package installer resolves optional peer dependencies per package — so that one extra dependency gives the participant application its own physical copy of `next` and, through it, its own copy of the sign-in library. Two copies declare two `OAuthConfig` types that refer to themselves several levels down, and the compiler stops trying to match them and calls them different. A module outside every application therefore cannot hand back either one. Adding the library as a development dependency of the shared package creates a fifth copy and makes it worse; declaring it a peer dependency does nothing, because the shared package is one physical directory in this workspace. The provider's shape is now written out in the module and checked against each application's own copy at the three places it is registered — which is where the object is used, and so the right place for the check.

**The admitted-role test now runs on the create path as well as the join path.** Until this change the decision returned "create" for anyone with no account before anything consulted whether the application takes that role; the role was checked only when a row already existed. On the participant application and the meetings portal that is invisible, because the role a new account is given is one they admit. On the sponsor portal — which admits sponsor representatives and WBR-side roles only — it meant a row written for every stranger who pressed the button and then a refusal: a write on a path whose entire purpose is to refuse, which is the same shape an earlier finding on this module had already recorded as a mistake. Two supporting decisions: the role a new account would be given is a **required** argument, stated by each application rather than defaulted, so a fourth application cannot quietly inherit a role its own gate would turn away; and the role travels back out on the result so the caller writes that rather than repeating a literal, which is what stops the tested role and the stored role drifting apart later.

Each portal registers the provider only when both credential values are present, draws the button only when the running application reports the provider, and turns each refusal into its own sentence. The sponsor portal carries one the others cannot produce — no account here, ask the event organizer for one — because that portal is not open to the public and a generic refusal reads as a broken button.

Two pre-existing defects on the sponsor portal were examined and deliberately left, both recorded in the engineer-local requirements document: its Google sign-in writes a row and then refuses the person, the same shape fixed here for LinkedIn on the same portal; and it admits WBR-side roles that one of its own request handlers does not recognise, so such an account is admitted and then refused by that handler. Neither is reachable by anything this change adds, and choosing the second's fix is a decision about who may operate the portal.

Verified by [`smoketests/phase-4-5-linkedin-two-portals.md`](smoketests/phase-4-5-linkedin-two-portals.md). The real sign-in half cannot be scripted — the provider asks for an account password — so it was run by hand and its results recorded step by step in that document.

---

## The sponsor portal's onboarding gate becomes demonstrable, through a second restore mechanism (2026-08-08)

The sponsor portal has refused an exhibiting company with an incomplete profile since the onboarding sprint. It could not be shown to anybody, because there was no account it would stop: the account documented as reaching all four applications holds the organizer role, and the gate releases every WBR-side role before asking any completeness question. That is [ADR 0008](adr/0008-onboarding-gate-is-about-the-person-not-the-app.md) behaving exactly as specified — the gate is about the person, not the application — rather than a defect, which is why the answer is a new account and not a change to the gate.

So there is now a second `gate demonstration account`: a sponsor representative attached to a new exhibiting company, `Gate Demo Exhibitor`, that satisfies five of the six items the sponsor gate blocks on and is deliberately short the sixth.

**The sixth is its contact, and the choice is doing real work.** Contact spans both the contact name and the contact email, so a company missing it holds no address at all — and the organizer's reminder screen does send over SMTP, addressing exactly that column. This demonstration data therefore cannot be mailed to anybody, closed by construction rather than by relying on no mail account being connected, which is a reason that survives somebody connecting one later. Traced through both cases while building it: with no mail account the route records the attempt as failed and then answers success to the browser, so a 200 there is not evidence that mail went out.

**It needed a second mechanism, not the flag the previous phase built, and that is the decision worth recording.** The delegate demonstration account restores its own six profile fields on every password sign-in. A sponsor representative is never measured on their own profile — the sponsor gate reads the six required items of the exhibiting company they are attached to — so the existing flag would have restored fields nothing on that portal consults and left the company completed, and a rehearsal would still have used the demonstration up. The scope note written at that flag's definition had already said as much. Account definitions may now carry a second, independent field naming columns on the attached company and the values to pin them to.

Three properties were carried across from the delegate half deliberately, because the same traps apply. The restore writes only the columns it names and only when they disagree, so the company's tagline, description, logo, website and offerings are never rewritten — a restore wider than its comparison produces a row that is unhealthy forever and writes on every single sign-in. An account carrying no such field is never compared and its company is never read, which is what keeps the mechanism away from `Tailor ERP`, a real exhibiting company that a real demonstration account is attached to. And a wrong password remains a total no-op.

**It does not create a missing company, and that limit is deliberate.** A company belongs to a conference, and a sign-in path that goes looking for one in order to write event content is doing more than a self-repair should. A deleted demonstration company is restored by the reset script or by a reseed instead; until then the portal shows its existing "no exhibiting company attached" refusal, which is a visible state rather than a silent wrong one.

**The company does not exhibit.** It carries no booth number, so it never reaches the floor plan. The committed exhibit-hall picture was drawn from the layout that exactly ten booth-carrying companies produce, and an eleventh moves every marker off its drawn stand — which had already happened once, when eight companies gave three rows instead of four. The booth item is one of the three the gate does not block on, since the number is the organizer's to assign, so its absence costs the demonstration nothing.

**The most important thing this phase found is that neither demonstration account restored itself on the path anybody actually signs in on.** The repair was called from the sign-in callback the credentials provider runs — and no login screen in this product uses that provider. All four apps post their password form to their own route, which looks the person up, checks the password and issues its own session without consulting the account registry. So the property written into the glossary, the code comments and the previous phase's verification — that a demonstration account's incompleteness comes back when it signs in with its password — was true of a direct call to the function and of an endpoint nothing reaches from a browser, and false of every sign-in a person could perform.

It was measured rather than argued: with the company completed by hand, signing in through the form left it completed and admitted the account to the dashboard, while signing in through the other endpoint on the same running server one minute later put the contact back and sent the account to the checklist. The repair is now called from all four password routes as well, before each one reads the person's row. All four rather than only the sponsor one, because the delegate demonstration account was broken in precisely the same way and the fix was already written beside it.

The lesson is worth stating on its own, because it is not about this feature. Every automated check called the shared function directly, which is the right way to test what that function does and can never discover that nothing calls it. The verification now reads all four route files and asserts each one calls the repair, and calls it before reading the row — a check about wiring rather than about behaviour.

Three further pre-existing defects surfaced while verifying this and were recorded rather than fixed. The seed upserts canonical accounts by email address but its cleanup deletes by identifier, so an account whose stored row was created by a maintenance script rather than by the seed is updated and then deleted in the same run — which is what happens to the delegate demonstration account, and it is repaired by that account's own registry entry on the next password sign-in. An older phase's check encoded the exhibitor count; rather than restating it to include a test prop, the prop is now excluded from the figure it was measuring and asserted separately, so the roster number stays comparable across phases and the prop's incompleteness becomes standing coverage. And the canonical account list is exported in a form any code in the process can modify, which is how a real company could be written by a mechanism meant for a prop; that is left alone deliberately, because two verification scripts rely on modifying those definitions to prove their own containment checks are capable of failing.

Verified by [`smoketests/phase-3-sponsor-gate-demo-account.md`](smoketests/phase-3-sponsor-gate-demo-account.md).

---

## Cross-references

- [Architecture](architecture.md) — cross-cutting current-state architecture.
- [Runbook](runbook.md) — operational procedures.
- [Incident Playbook](incident-playbook.md) — symptom-to-cause catalog.
- [ADRs](adr/) — full architectural decision records (Nygard format).
- `CONTRIBUTING.md` (Phase 11B) — sprint-trialed practices as a starting template.
