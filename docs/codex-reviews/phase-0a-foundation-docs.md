# Codex Adversarial Review — Phase 0a Foundation Docs

Loop run on 2026-06-27 against branch `phase-0a-foundation-docs`. Cap N=3 rounds per PRD §8.2.

**Files reviewed:**
- `README.md`
- `docs/architecture.md`
- `docs/smoketests/phase-0a-foundation-docs.md`

**Bar applied** (PRD §8.5): architectural claims must match what the codebase does; run/debug instructions must be executable from a fresh clone. AC-failing = would make PRD §6 Phase 0a acceptance criteria fail OR introduce a regression in another phase's smoketest. Style / quality / P2 findings reported but non-gating.

---

## Round 1 — 10 AC-failing findings

- **F1.** README env setup incomplete — only `apps/attendee/.env.local.example` and `apps/web/.env.local.example` exist; `meetings` and `sponsor` have none, so the documented "copy root `.env`" flow did not supply env to all four apps. Next.js loads env per-app at `process.cwd()`; the repo-root `.env.example` is reference-only.
- **F2.** Smoketest step 3 inherited F1's incomplete env setup.
- **F3.** Attendee React Query persistence claim wrong. `apps/attendee/lib/query-provider.tsx` is a plain in-memory `QueryClientProvider`; no persist dependency installed in attendee. Persist plugin lives in `meetings` and `sponsor` only.
- **F4.** API auth/header model overstated as uniform. Reality: `meetings` mostly forwarded request headers; `sponsor` mixed forwarded + `getServerSession`; `attendee` mixed `getServerSession` + header reads; `web` mostly `getServerSession` / `getToken`.
- **F5.** Middleware forwarding wrong. `meetings` and `sponsor` use `NextResponse.next({ request: { headers } })` (forwarded request headers, readable downstream). `attendee` and `web` set response headers only (not readable in downstream handlers). `x-user-sponsor-id` is set by attendee/meetings/sponsor — not sponsor-only.
- **F6.** Smoketest header spot-check would produce a false pass. The original broad `grep` could not distinguish request-forwarding from response-header-only patterns.
- **F7.** Matcher claim too broad. Only `apps/web/middleware.ts` excludes image extensions via regex; the other three apps exclude a fixed path set (`_next/static`, `_next/image`, `favicon.ico`, `icons`, `manifest.json`, `sw.js`, `workbox-*`).
- **F8.** Meetings staff queue description did not match implementation. The original claim ("APPROVED-but-unscheduled rows, assigns to TimeBlock, creating a `Meeting` record") was inherited from the dated codebase tour; the actual code loads the latest 100 requests across all statuses and creates a `SponsorMeeting` on confirm.
- **F9.** Meetings API path wrong. No `/api/meetings/staff/...` exists. Staff actions go through `apps/meetings/app/api/meeting-requests/[id]/route.ts`.
- **F10.** Toolchain versions stale. `pnpm-lock.yaml` resolves Turborepo to `2.9.1` (doc said `2.3`) and TypeScript to `5.9.3` (doc said `5.5`).

**Action.** Each finding verified directly against the codebase (middleware files, query provider, staff page, meeting-requests route, pnpm-lock, env example presence). All 10 fixes applied.

---

## Round 2 — 2 surviving AC-failing findings

- **F3 surviving.** The §The four apps attendee description was correctly updated in Round 1, but the §PWA layer section retained a separate paragraph still claiming the React Query cache was persisted to IndexedDB. Missed-by-section error.
- **F8 surviving.** Two sub-points still wrong: (a) the staff page description claimed the full `TimeBlock` set was fetched, but the code scopes by `conferenceId = 'conf-2025'`; (b) the description implied a `Meeting` record was created on confirm, but the route handler creates a `SponsorMeeting` row instead.

**Other Round-1 findings** (F1, F2, F4–F7, F9, F10): marked RESOLVED.

**Action.** Re-read `apps/meetings/app/api/meeting-requests/[id]/route.ts` to confirm the `SponsorMeeting` creation path and the `sponsorId + attendeeId` derivability guards. Updated the §The four apps meetings section and the §PWA layer paragraph.

---

## Round 3 (cap) — CONVERGED

**F3 RESOLVED.** PWA section now reads: "Offline content in attendee comes from these service-worker rules alone — there is no React Query persistence layer in attendee (`apps/attendee/lib/query-provider.tsx` is a plain in-memory `QueryClientProvider`)." Verified against the query-provider file and per-app `package.json` dependency lists.

**F8 RESOLVED.** Meetings app description now reads: "loads the latest 100 `MeetingRequest` rows (ordered by `createdAt desc`, across all statuses) plus all `TimeBlock` rows for `conferenceId = 'conf-2025'`" and "**on confirm with a time block, the route handler additionally creates a `SponsorMeeting` row** when both a `sponsorId` and an `attendeeId` can be derived from the request (it does *not* create a `Meeting` row)." Verified against `apps/meetings/app/(authenticated)/(portal)/staff/page.tsx` and `apps/meetings/app/api/meeting-requests/[id]/route.ts`.

**No regressions** on the other Round-1 findings (F1, F2, F4, F5, F6, F7, F9, F10).

### Non-breaking observation (reported, not gating)

`GET /api/meeting-requests` (the raw list endpoint) is uncapped and does not fetch `TimeBlock` rows. The Phase 0a docs only claim the `/staff` page-load path is capped at 100 and scoped to the seed conference id, and that is correctly implemented in `staff/page.tsx`. The bare-API ergonomics observation is unrelated to the foundation-doc fidelity bar and is out of scope for Phase 0a.

---

## Convergence

**Zero AC-failing findings remaining. Loop closed.**

Phase 0a foundation docs (README + architecture.md) and the Phase 0a smoketest meet PRD §6 Phase 0a acceptance criteria and PRD §8.5 verification posture.
