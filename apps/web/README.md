# apps/web — Admin / Organizer Dashboard

The admin-side Next.js 15 (App Router) application. Runs on port 3000 in local dev. Deploys to Vercel as the `wbr-admin` project. Gates access by `User.role ∈ {STAFF, ORGANIZER, ADMIN}`; non-admin users are bounced back to `/login` by the middleware.

Cross-cutting architecture (data flow, auth model, deployment topology, system diagram) lives in [`docs/architecture.md`](../../docs/architecture.md). This file is the working-here doc for the `apps/web` subtree.

---

## Directory map

```
apps/web/
├── app/
│   ├── (auth)/               # Login + auth-related public pages
│   ├── (dashboard)/          # Authenticated admin surface
│   │   ├── dashboard/
│   │   │   ├── access/       # Role + permission management
│   │   │   ├── app-settings/ # Conference-wide settings
│   │   │   ├── attendees/    # Server-paginated attendee table (Phase 9)
│   │   │   ├── calendar/
│   │   │   ├── chat/
│   │   │   ├── email/        # Outbound email + thread view
│   │   │   ├── export/
│   │   │   ├── integrations/ # Google OAuth integrations
│   │   │   ├── meetings/
│   │   │   ├── sessions/
│   │   │   ├── speakers/     # Speaker CRUD; calls attendee app's /api/revalidate
│   │   │   ├── sponsors/
│   │   │   └── time-blocks/
│   │   └── layout.tsx
│   ├── api/                  # Route handlers (see "API surface" below)
│   ├── globals.css
│   ├── layout.tsx
│   └── session-provider.tsx
├── components/                # React components (~50 client/server components)
├── lib/                       # App-specific helpers (see "Key files" below)
├── middleware.ts              # Auth gate + identity header forwarding
├── next.config.js
├── public/
├── types/
├── package.json
├── tsconfig.json
└── vercel.json
```

## Key files

- **`lib/auth.ts`** — NextAuth `authOptions`. Both providers (Credentials + Google) enforce the same role gate: `existing.role ∈ {STAFF, ORGANIZER, ADMIN}`. Credentials path verifies passwords via `verifyPassword` from `@conference/db` (scrypt; see [`docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md`](../../docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md)). Google path also updates `name`/`image` fire-and-forget on each sign-in. JWT strategy; 30-day cookie.
- **`middleware.ts`** — runs on every non-static request. Unauthenticated requests get a `/login` redirect (or 401 JSON for `/api/*`). Authenticated requests have `x-user-role` and `x-user-id` set on the response (`middleware.ts:25`); a code comment suggests these are intended to skip a re-decode in route handlers, but route handlers in this app currently call `getToken({ req: request })` directly (e.g. `app/api/data/attendees/route.ts:8`). The canonical `NextResponse.next({ request: { headers: ... } })` request-forwarding pattern appears only in apps/meetings and apps/sponsor; apps/attendee has the same response-only shape as this app — divergence to be aware of when porting code between apps.
- **`lib/attendees-query.ts`** — server-side pagination for `/dashboard/attendees`. `ATTENDEES_PAGE_SIZE = 50`. `normalizeAttendeesParams` clamps page, trims `q` to 100 chars, and restricts `role` to `{ATTENDEE, SPEAKER}`. The Phase 9 perf fix that moved this off client-side filtering.
- **`lib/rateLimit.ts`** — in-memory sliding-window limiter. **Works for local single-process dev only.** On Vercel's multi-instance runtime each Fluid Compute instance has its own `Map`, so the limit is per-instance, not global. Same shape as the broken sponsor-app limiter (see [`docs/incident-playbook.md`](../../docs/incident-playbook.md) §12).
- **`lib/hooks.ts`** — TanStack Query hooks (`useQuery`, `useMutation`) wrapping the `/api/data/*` endpoints. Components consume these rather than calling `fetch` directly.
- **`lib/db.ts`** — re-export wrapper around `@conference/db`'s `prisma` client. Per [`docs/adr/0003-turso-libsql-data-layer.md`](../../docs/adr/0003-turso-libsql-data-layer.md), the underlying client picks Turso embedded-replica / Turso HTTP / SQLite at runtime via the `dbConnectionMode` diagnostic.
- **`vercel.json`** — Vercel project build config: `cd ../.. && npx turbo build --filter=web`, install via `corepack enable && pnpm install`.
- **`lib/permissions.ts`** — pure, client-safe source of truth for per-role dashboard access. Defines the 14 permission keys (one per sidebar nav destination, grouped into the 5 sidebar sections), the two manageable roles (`STAFF`, `ORGANIZER`), defaults, and the anti-lockout rule (`ORGANIZER` always keeps `staff`). No server imports, so the Sidebar, the Roles & Permissions editor, and the Node test scripts all consume it. `hasPermission()` / `visibleKeysFor()` treat legacy `ADMIN` as full access.
- **`lib/role-permissions-server.ts`** — server-only persistence for role settings/permissions. Owns a `RolePermission` table via a defensive `CREATE TABLE IF NOT EXISTS` (raw SQL) so the feature works on Turso without a manual `prisma db push`; the DDL matches the `RolePermission` model in [`schema.prisma`](../../packages/db/prisma/schema.prisma) exactly, so a future push is a no-op. Reads degrade to defaults on any DB error — a permissions read never hard-fails the dashboard.
- **`lib/require-permission.tsx`** — server page guard. `permissionDenied(key, title)` returns an "Access restricted" screen (or `null`) so a page can `const denied = await permissionDenied(...); if (denied) return denied`. Applied to the Administration pages (`export`, `integrations`, `app-settings`, `access`); middleware only proves a session exists, this enforces the per-role config.
- **`app/(dashboard)/dashboard/layout.tsx`** — computes the signed-in role's allowed nav destinations server-side and passes `allowedHrefs` to `<Sidebar>`, which hides sections the role can't open (Overview is always shown).
- **`components/StaffTabsShell.tsx` + `components/RolesPermissionsPanel.tsx`** — the Staff page's `Members | Roles & Permissions` tabs. The panel is a Staff/Organizer comparison matrix of iOS-style switches with explicit save (dirty-state SaveBar + discard guard); editing is Organizer-only, everyone else sees it read-only. The Members role dropdown offers only **Staff** and **Organizer** (Attendee/Speaker are managed on the Access page).

## API surface

The admin app's API routes split into two shapes:

- **`app/api/data/*`** — read-only, TanStack-Query-fronted endpoints serving the dashboard panels. Most endpoints are `unstable_cache`'d with a 60s revalidate and a tag (`speakers`, etc.); mutations elsewhere call `revalidateTag(...)` on the matching tag. **Known exception:** `app/api/data/attendees/route.ts` is not cached — it calls `fetchAttendeesPage()` directly per the Phase 9 server-side pagination shape (query params drive the cache key, which would balloon `unstable_cache` storage). Documented in [`docs/architecture.md`](../../docs/architecture.md) §Server-side pagination.
- **`app/api/<resource>/*`** — mutation routes (POST/PATCH/DELETE) under `/api/access`, `/api/admin`, `/api/attendees`, `/api/chat`, `/api/email`, `/api/integrations`, `/api/meeting-requests`, `/api/schedule-meetings`, `/api/speakers`, `/api/sponsors`.

Cross-cutting API inventory lives in [`docs/architecture.md`](../../docs/architecture.md) §API surface.

### Company Scheduler (Meetings page → Companies tab)

The Meetings page has a third URL-param tab, **Companies** (`?tab=companies`,
drill-in `&company=<sponsorId>`): the admin-native version of the company-centric
meeting-engine console, sharing the pure engine in
[`packages/db/src/meeting-engine.ts`](../../packages/db/src/meeting-engine.ts) with
the eTail-styled `/staff` console in apps/meetings. Directory of sponsor companies
(request counts, confirmed meetings, fill meter) → per-company split view: request
bank sidebar (Inbound approve/decline, Unscheduled ranked by priority tier + fit
score, Scheduled, Declined/Removed) and a day-segmented slot grid. Assign and
reschedule run through availability-driven side sheets (exclusive slots: one
meeting per company per time block; rooms are physical table labels);
cancel is an alert dialog with preserve-request ("Return to Bank") vs remove
semantics; per-company priority auto-schedule wraps `POST /api/auto-schedule` with
a dry-run preview. API: `GET/POST/PATCH /api/admin/scheduler/*`
(`lib/scheduler-api.ts` gates every route with `roleHasPermission(role, 'meetings')`
and maps typed `EngineError` codes to 404/409/400). UI:
`components/CompanySchedulerClient.tsx` + `CompanyDirectory` / `CompanyScheduleView` /
`AssignMeetingSheet` / `RescheduleMeetingSheet` / `CancelMeetingDialog` /
`CompanyAutoScheduleButton`, per the HIG spec in
[`docs/prd/meeting-engine-hig-spec.md`](../../docs/prd/meeting-engine-hig-spec.md).
Tests: `test:admin-scheduler` (engine), `test:admin-scheduler:api` (HTTP),
`e2e:admin-scheduler` (Playwright); the HTTP/e2e scripts target :3000 by
default and honor `SMOKE_BASE_URL` when that port is taken.

The tab bar also carries a **Settings** item scoped to the Companies scheduler
(`?tab=companies&view=settings`) for the admin-configurable meeting
requirements: meetings required from each attendee
(one global number) and from each sponsor company (a global default plus
per-company overrides, stored in `MeetingRequirementSetting` and consumed by
every fill meter / per-person chip). API: `GET/PUT /api/admin/scheduler/settings`
(same `'meetings'` gate). UI: `CompanyMeetingSettings` + the shared `Stepper`,
mirroring ChatSettingsPanel's draft/snapshot + sticky-save-bar mechanics.
Tests: `test:meeting-requirements`, `test:meeting-requirements:api`; Turso DDL
via `db:migrate-meeting-requirements`.

Below the requirements panels, the same Settings view houses **Meeting Tables**
(`MeetingTablesSettings`): the admin-managed physical table inventory plus a
conference-wide assignment board of every confirmed meeting by day and time
block. Inventory rows live in `MeetingTableSetting` (defensive
`CREATE TABLE IF NOT EXISTS`; zero rows fail open to the constant
`MEETING_ROOMS` defaults, and the first write op seeds them). Renames migrate
`SponsorMeeting.location`; removal is blocked while confirmed meetings sit at
the table (`TABLE_IN_USE`) and the last table can never be removed. Assignment
capacity is a GLOBAL per-block guard (`TABLE_TAKEN`, cross-sponsor — unlike the
per-sponsor availability grid), so the board is where legacy double-bookings
surface; one-click auto-assign fills unassigned meetings and (opt-in) moves
conflicts. Engine: `getMeetingTables` / `saveMeetingTables` / `getTableBoard` /
`setMeetingTable` / `autoAssignTables` in
[`packages/db/src/meeting-engine.ts`](../../packages/db/src/meeting-engine.ts);
every rooms consumer (matrix `rooms`, availability sheets, `UNKNOWN_ROOM`
validation, auto-schedule default room, the sponsor-portal approve flow) reads
the live inventory. API: `GET/PUT /api/admin/scheduler/tables`,
`PUT …/tables/assign`, `POST …/tables/auto-assign` (same `'meetings'` gate).
Tests: `test:meeting-tables`, `test:meeting-tables:api`, `e2e:meeting-tables`
(Playwright).

### On-site Check-In (sidebar → Meetings → Check-In)

Dedicated page at `/dashboard/meetings/check-in` (a **Check-In** item in the
sidebar's Meetings section; it started as a `?tab=checkin` URL-param tab on the
Meetings page, which now redirects here): the on-site floor
attendance portal. One master grid of every confirmed sponsor meeting for the
selected day — grouped chronologically by time slot, sorted alphabetically by
sponsor within each slot — with dual arrival check-offs (**Sponsor arrived** /
**Buyer arrived**), an internal per-meeting floor note (stored on
`SponsorMeeting.notes`). Arrivals persist as
`SponsorMeeting.sponsorArrivedAt` / `buyerArrivedAt` timestamps
(`db:migrate-checkin` adds the columns). Engine: `getCheckInBoard` /
`setMeetingCheckIn` in `packages/db/src/meeting-engine.ts`. API:
`GET /api/admin/scheduler/checkin` + `PATCH /api/admin/scheduler/checkin/[id]`
(same `'meetings'` permission gate as the rest of the scheduler). UI:
`components/CheckInBoard.tsx` (optimistic React Query mutations; the board
refetches every 30s so several floor managers converge without manual
refreshes).

Above the floor grid sits a **dashboard** (`components/CheckInDashboard.tsx`)
derived entirely from the same board payload, scoped by the same day tabs:
a per-slot **Check-In Tracker** lollipop chart (brand stem + dot = fully
checked in, light track = scheduled; the live / next-up slot is highlighted
with a value pill; hover/focus tooltips per column) with a hero completion %,
a **Time Slots** accordion list (live/upcoming/ended badges, per-slot meter,
capped with internal scroll), a **Needs Attention** chase list of half-arrived
meetings with a one-tap ✓ that checks in the missing party, a dark
**Conference at a glance** all-days totals card that jumps to the floor grid,
an **Arrival Progress** tick-strip card (sponsors / buyers / completed vs
the day's meetings), and a full-width **day summary bar** (the reconciliation
strip — meetings-happened headline + meter, per-party arrival counts, all-days
rollup; formerly the table's sticky footer, docked at the bottom of the
dashboard 2026-07-30). Pure derivation helpers live in
`lib/checkin-dashboard.ts`. Tests: `test:checkin` (engine), `test:checkin:api`
(HTTP), `test:checkin-dashboard` (dashboard derivation unit tests),
`e2e:checkin` (Playwright, includes dashboard render + chase-list quick
check-in); `scripts/visual-checkin-dashboard.mjs` seeds throwaway fixtures and
captures per-card screenshots for visual QA.

### Auto matches (Meetings page → Auto tab)

Fifth URL-param tab, **Auto** (`?tab=auto`): every pair where the sponsor and
the attendee each picked the other as **Best Fit** through their portals. A
match is derived live from `MeetingRequest` rows (a `BEST_FIT` request in both
directions, statuses `PENDING`/`APPROVED`/`CONFIRMED`), and **its meeting is
scheduled automatically** — at pick time (both portal request routes call
`syncAutoMatches` after a Best Fit create/re-tier) plus a self-healing sweep
on every board `GET` (the scheduled-broadcasts read-path dispatch pattern),
which also catches pairs that were unschedulable earlier. The sponsor-side
request is used so the meeting inherits the rep who made the pick; all engine
booking constraints apply. Every transition is recorded in the
**`AutoMatchEvent` audit log** (`MATCHED` when both picks exist, `SCHEDULED`
with room + slot once the meeting lands — whichever path created it — plus
`RESCHEDULED` / `CANCELLED` from the card actions) — relation-free and
name-denormalized so history survives deletions; `db:migrate-auto-match`
creates the table on Turso. The board sections matches **by company** (tier +
`N of M scheduled` per section; cards carry fit score, matched solutions, both
picks' provenance, and slot/room or an "Awaiting slot" state) with the
activity log in a side rail. Each scheduled card offers **Reschedule** (slot +
room picker over the shared availability endpoint) and **Cancel** — cancelling
deliberately dissolves the match by withdrawing every live Best Fit pick
between the pair (anything less and the next sweep would re-schedule the
meeting the admin just cancelled); a fresh mutual pick re-forms the match, and
the sweep's log dedup is cancellation-aware so the re-match logs fresh events.
Engine: `getAutoMatchBoard` / `syncAutoMatches` / `scheduleAutoMatches` /
`getAutoMatchLog` / `rescheduleAutoMatchMeeting` / `cancelAutoMatchMeeting` in
`packages/db/src/meeting-engine.ts`. API: `GET /api/admin/scheduler/auto`,
`PATCH /api/admin/scheduler/auto/meetings/[id]`, `POST
/api/admin/scheduler/auto/meetings/[id]/cancel` (same `'meetings'` permission
gate). UI: `components/AutoMatchBoard.tsx` (React Query, 30s poll). Demo data:
`seed:auto-matches`. Ops: `db:sweep-auto-matches` runs the idempotent sweep
once from the CLI (backfill after seeding or direct DB writes). Tests:
`test:auto-match` (engine), `test:auto-match:api` (HTTP), `e2e:auto-match`
(Playwright).

#### Scheduling lanes — Best Fit never sits in the review queue

Every **sponsor↔attendee `BEST_FIT` request belongs to the Auto lane**, in
either direction and any status: a mutual pair auto-schedules (above), and a
**one-sided pick surfaces on the Auto board as "Awaiting Reciprocation"** (a
half match — card shows who picked, the fit score, and the other side's
current Med/Low pick when one exists) instead of appearing in the Meeting
Requests review queue. The Requests board owns everything else: **Med and Low
requests (full and half matches alike)** plus peer-to-peer attendee requests,
which have no Auto lane. The rule is encoded once in the engine as Prisma
where fragments — `autoLaneRequestWhere` / `requestBoardWhere` /
`REQUEST_BOARD_PRIORITIES` — shared by `GET /api/data/meetings` (which also
runs the self-healing sweep before every read, so a pair formed by seeds or
direct DB writes schedules before the board renders), the bulk schedulers
(`POST /api/auto-schedule` and `POST /api/schedule-meetings` are scoped to
Med+Low so they never reach into the Auto lane), and
`PATCH /api/meeting-requests/[id]`, whose Best Fit re-tier hands the request
to the Auto lane and triggers the sweep immediately.

### Scheduled broadcasts (Chat page)

Admins can pre-schedule Global Broadcast messages. `POST/GET /api/chat/scheduled`
creates/lists them, `PATCH/DELETE /api/chat/scheduled/[id]` edits/cancels pending ones
(409 once no longer pending), and `GET|POST /api/chat/scheduled/dispatch` is the
delivery tick (staff session or `Authorization: Bearer $CRON_SECRET`; wired as a
per-minute Vercel cron in `vercel.json`). Delivery does not rely on the cron alone:
the scheduled-list GET, `/api/data/chat`, and the attendee global-chat polls all run
`dispatchDueScheduledMessages()` from `@conference/db`, which claims each due row
atomically so overlapping ticks never double-send. UI lives in
`components/ScheduledBroadcasts.tsx` (schedule dialog + pending queue with edit/cancel
and sent/failed history) wired into `components/GlobalChatAdmin.tsx`. Decision log:
[`docs/decisions.md`](../../docs/decisions.md) §Scheduled chat broadcasts. Tests:
`pnpm test:scheduled` (logic) and `pnpm test:scheduled:api` (HTTP acceptance). New
environments need the `ScheduledMessage` table on Turso: `pnpm db:migrate-scheduled`.

### Chat Settings (Chat page → Settings tab)

The Chat page is a two-tab shell (`components/ChatTabsShell.tsx`): **Broadcast**
(the existing `GlobalChatAdmin`) and **Settings** (`components/ChatSettingsPanel.tsx`).
The Settings tab controls who may *start* a conversation (friend request / new DM):
a global vendor master switch, per-vendor (Sponsor company) switches for Attendees/
Speakers, and per-WBR-Staff switches for Attendees/Vendors/Speakers. `GET|PUT
/api/chat/settings` (staff/organizer/admin) reads/writes via `lib/chat-settings-server.ts`,
which joins the Sponsor + Staff rosters with the `ChatMessagingPermission` rows from
`@conference/db` (`packages/db/src/chat-settings.ts`). Enforcement lives in the
attendee app (`apps/attendee/lib/messaging-guard.ts` → `checkMessagingPermission`),
not here. Defaults are permissive; existing threads are grandfathered. New Turso
DBs: `pnpm db:migrate-chat-settings`. Tests: `pnpm test:chat-settings`,
`pnpm test:chat-perm`, `pnpm test:chat-settings:api`.

## App-specific gotchas

- **`ADMIN_EMAILS` env var is documentation residue.** It appears in `.env.local.example` but no runtime code reads it. The admin sign-in gate is role-based — `lib/auth.ts:43, 68` checks `User.role ∈ {STAFF, ORGANIZER, ADMIN}`. To grant or revoke admin access, update the user's `User.role` in the DB; do not touch `ADMIN_EMAILS`.
- **`OPENAI_API_KEY` is required** for the sponsor-reminder route at `app/api/sponsors/remind/route.ts:6`. Without it the route returns 503. Other admin surfaces do not require OpenAI. The key is admin-app-only — not consumed by attendee, meetings, or sponsor.
- **`app/api/data/speakers/route.ts` strips data-URI photoUrls.** When a `Speaker.photoUrl` starts with `data:`, the API rewrites it to `/api/speakers/${id}/photo`, and the backing endpoint decodes and serves the binary. The DB still stores the data URI. This is admin-only behavior — the parallel `apps/attendee/app/api/data/speakers/route.ts` does **not** strip and serves the inline data URI directly. Partial precedent for the Phase 16 image-storage migration; see [`docs/adr/0004-base64-images-in-db.md`](../../docs/adr/0004-base64-images-in-db.md).
- **App-to-app API call (cross-app, not cross-process).** `app/(dashboard)/dashboard/speakers/[id]/page.tsx:13` and `app/api/speakers/[id]/route.ts:8` both `fetch('http://localhost:3001/api/revalidate', ...)` on speaker updates so the attendee PWA's `unstable_cache` rebuilds. URL is hardcoded to localhost; works in local dev; in production the request fails and the `catch` block silently no-ops. Documented as the system's only app-to-app traffic in [`docs/architecture.md`](../../docs/architecture.md) §System diagram (dotted arrow).
- **Google OAuth integrations (admin-app-only) live at `app/api/integrations/google/callback/route.ts`.** This is a separate OAuth flow from sign-in: it stores per-user `Integration` records that the email-send routes use to send mail on behalf of the user. Configured via the admin dashboard, not by env var.
- **The middleware sets `x-user-role` + `x-user-id` on the response, not on the forwarded request.** Route handlers in this app decode identity from the JWT via `getToken({ req: request })`. apps/attendee shares this response-only middleware shape; only apps/meetings and apps/sponsor use the canonical `NextResponse.next({ request: { headers } })` request-forwarding pattern. Whether the apps/web shape is intentional or a bug is out of scope for this README; document the actual behavior and reach for `getToken` when writing new admin route handlers.

## App-specific dev commands

From this directory:

```bash
pnpm dev         # next dev -p 3000 (kills .next cache first via predev)
pnpm build       # next build
pnpm start       # next start -p 3000 (prod-mode local)
pnpm lint        # next lint
pnpm typecheck   # tsc --noEmit
```

Or from the repo root:

```bash
./dev.sh web     # kills stale dev processes, then pnpm dev
pnpm dev:web     # Turbo-coordinated
```

## Test credentials

From [`packages/db/prisma/seed.ts`](../../packages/db/prisma/seed.ts) — only the WBR organizer account can log in here:

| Email | Password | Role |
|---|---|---|
| `wbr@test.com` | `password123` | ORGANIZER |

Brand and sponsor accounts are accepted by other apps but bounced from this one.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma client target (local SQLite file or Turso `libsql://`) |
| `NEXTAUTH_SECRET` | Yes | JWT signing; must match across all four apps for cross-app validity |
| `NEXTAUTH_URL` | Yes | `http://localhost:3000` for local, the deploy URL in production |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | If using Google sign-in | OAuth credentials for the GoogleProvider |
| `OPENAI_API_KEY` | If using sponsor reminders | Consumed only by `app/api/sponsors/remind/route.ts` |
| `ADMIN_EMAILS` | **No (documentation residue)** | Present in `.env.local.example`; not read at runtime |
| `TURSO_AUTH_TOKEN` | Production only | Auth for Turso libSQL connections (see ADR 0003) |
