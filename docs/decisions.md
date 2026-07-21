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

---

## Cross-references

- [Architecture](architecture.md) — cross-cutting current-state architecture.
- [Runbook](runbook.md) — operational procedures.
- [Incident Playbook](incident-playbook.md) — symptom-to-cause catalog.
- [ADRs](adr/) — full architectural decision records (Nygard format).
- `CONTRIBUTING.md` (Phase 11B) — sprint-trialed practices as a starting template.
