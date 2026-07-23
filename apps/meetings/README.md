# apps/meetings — Meeting coordination portal + staff queue

The 1-on-1 meeting coordination Next.js 15 (App Router) application. Runs on port 3002 in local dev. Any signed-in user can request meetings; the **WBR staff tier** (`isWbrStaff(role)` → `WBR` / `ORGANIZER` / `ADMIN` / `STAFF`; the `wbr@test.com` account is `ORGANIZER`) operates the meeting engine at `/staff`. Note: the gate is the WBR tier, not the literal string `'STAFF'` — the earlier `role === 'STAFF'` check was unreachable by the current Brand/Sponsor/WBR test accounts.

## Meeting engine console (`/staff`)

`/staff` is a **company-centric scheduling console** (Apple-HIG, desktop) that replaced the flat request queue. Flow: a **company directory** (Sponsors, with requests / needs-review / unscheduled / confirmed / fill-rate) → open a company → an iPad-style **split view**: an **Unscheduled Bank** (approved requests awaiting a slot, each ranked by solution-match interest with a HUD popover) + a **day-tabbed calendar grid**. Staff assign a bank candidate to a time slot + room (mutual-availability + occupancy/capacity enforced), reschedule, or cancel (preserve → back to bank, or remove entirely).

- Engine logic: [`packages/db/src/meeting-engine.ts`](../../packages/db/src/meeting-engine.ts) — pure, prisma-injected (ranking, availability, occupancy, load-balance, guarded assign/reschedule/cancel). Typed `EngineError` codes map to HTTP status in [`lib/staff-api.ts`](lib/staff-api.ts).
- UI: [`components/engine/`](components/engine/) (`CompanyDirectory`, `ScheduleMatrix`, `AssignSheet`, `EditSheet`, `CancelModal`, `Sheet`). HIG classes (`.segmented`, `.split-view`, `.sheet-panel`, `.popover-card`, `.meter`) live in the shared preset.
- Schema: `SponsorMeeting` gained `location` (room/table) + `reason` (cancellation). Apply to Turso with `pnpm db:migrate-engine`.
- Design + contract: [`docs/prd/meeting-engine.md`](../../docs/prd/meeting-engine.md) and [`docs/prd/meeting-engine-hig-spec.md`](../../docs/prd/meeting-engine-hig-spec.md).
- Tests: `pnpm test:engine` (engine units + lifecycle), `pnpm test:engine:api` (`--start`), `pnpm e2e:engine` (`--start`).

Cross-cutting architecture (data flow, auth model, deployment topology, system diagram) lives in [`docs/architecture.md`](../../docs/architecture.md). This file is the working-here doc for the `apps/meetings` subtree.

---

## Directory map

```
apps/meetings/
├── app/
│   ├── (authenticated)/         # Authenticated portal
│   ├── api/                     # Route handlers (see "API surface" below)
│   ├── login/
│   ├── layout.tsx
│   └── session-provider.tsx
├── components/
│   ├── MeetingsPortal.tsx        # Top-level portal shell
│   ├── BrowseView.tsx            # Sponsor / person browse + filter
│   ├── DashboardView.tsx         # User-facing meeting dashboard
│   ├── StaffQueue.tsx            # STAFF-only request approval queue
│   ├── RecommendedMatchesClient.tsx
│   ├── FilterPanel.tsx
│   ├── PersonCard.tsx SponsorCard.tsx SponsorRepCard.tsx TeamMembers.tsx
│   ├── ProfileForm.tsx
│   ├── DataPrefetch.tsx          # Idle-time prefetch coordinator
│   ├── NavBar.tsx
│   └── SolutionBadge.tsx
├── lib/                          # App-specific helpers (see "Key files" below)
├── middleware.ts                 # Auth gate + identity header forwarding
├── next.config.js
├── public/
├── package.json
├── tsconfig.json
└── vercel.json
```

## Key files

- **`lib/auth.ts`** — NextAuth `authOptions`. **No role restriction** at the credentials provider. The Google sign-in path **self-provisions** new users: if the Google email is unknown, it creates a `User` row with `role: 'ATTENDEE'` rather than rejecting (`lib/auth.ts:62-68`). apps/attendee and apps/sponsor share this self-provisioning shape; only apps/web rejects unknown Google emails.
- **`lib/user.ts`** — `getUserFromHeaders()` reads the middleware-forwarded `x-user-id` / `x-user-role`. Returns `role` as a string; routes that gate on STAFF compare directly.
- **`lib/mem-cache.ts`** — in-memory L1 cache with stale-while-revalidate semantics. Sub-1ms on hit; per-Node-process. On Vercel's multi-instance runtime each Fluid Compute instance has its own `Map`, so warmth is per-instance, not global.
- **`lib/rateLimit.ts`** — in-memory sliding-window limiter, same shape as apps/web's. Same multi-instance caveat (see [`docs/incident-playbook.md`](../../docs/incident-playbook.md) §12 for the parallel sponsor-app gotcha).
- **`lib/dashboard-data.ts` / `lib/meetings-data.ts`** — server-side data fetchers feeding the dashboard and meetings views. Both use `mem-cache.ts` for hot-path requests.
- **`lib/solutions.ts`** — taxonomy/lookup for the solution-badge filter.
- **`middleware.ts`** — auth gate (redirect to `/login`, 401 JSON for `/api/*`) **plus the canonical `NextResponse.next({ request: { headers } })` request-forwarding pattern** (`middleware.ts:30-37`). Shares this shape with apps/sponsor; apps/web and apps/attendee diverge and set identity headers on the response instead. Route handlers in this app read identity via `lib/user.ts:getUserFromHeaders()`, which sees the forwarded request headers correctly.
- **`app/api/meeting-requests/route.ts`** — POST creates a `MeetingRequest` row (status `PENDING`). Rate-limited (10 req/min/IP). Rejects self-targeted requests, duplicate active requests (`PENDING`/`APPROVED`/`CONFIRMED`), and messages over 1000 chars.
- **`app/api/meeting-requests/[id]/route.ts`** — PATCH updates request status. **Only `User.role === 'STAFF'` may approve/reject/confirm.** When status transitions to `CONFIRMED` **and** a `timeBlockId` is set **and** the request involves a sponsor (either side), the handler additionally creates a `SponsorMeeting` row (not a `Meeting` row). This split — `MeetingRequest` for the negotiation lifecycle, `SponsorMeeting` for the confirmed sponsor-touching slot — is the load-bearing schema detail for this subtree.

## API surface

- `app/api/auth/[...nextauth]/route.ts` — NextAuth handler.
- `app/api/bootstrap/route.ts` — initial-load data for the portal shell.
- `app/api/browse/route.ts` — paginated/filtered people + sponsors list for `BrowseView`.
- `app/api/dashboard/route.ts` — user-facing dashboard data.
- `app/api/meeting-requests/` — POST (create), PATCH `[id]` (status transition, STAFF only).
- `app/api/meetings/route.ts` — confirmed-meeting list.
- `app/api/staff/*` — meeting-engine console (all WBR-staff gated via `lib/staff-api.ts:requireStaff`): `GET companies` (directory), `GET companies/[sponsorId]/schedule` (matrix), `GET companies/[sponsorId]/availability?requestId=` + `GET meetings/[id]/availability` (mutual-free slots), `POST meetings/assign`, `PATCH meetings/[id]` (reschedule), `POST meetings/[id]/cancel`, `PATCH requests/[id]` (approve/reject).
- `app/api/profile/route.ts` — user profile read/update.
- `app/api/login/route.ts` — credentials-login helper.

## App-specific gotchas

- **The Google sign-in path self-provisions ATTENDEE rows.** A first-time Google sign-in with an unknown email succeeds and creates a new user (`lib/auth.ts:62-68`). apps/attendee (`lib/auth.ts:42-48`) and apps/sponsor (`lib/auth.ts:68-74`) do the same; only apps/web rejects unknown Google emails (`lib/auth.ts:64-68`). If onboarding controls depend on a pre-existing `User`, three of the four apps will silently bypass them.
- **Confirming a sponsor meeting creates a `SponsorMeeting`, not a `Meeting`.** Per [`app/api/meeting-requests/[id]/route.ts`](app/api/meeting-requests/%5Bid%5D/route.ts) — the schema separates negotiation (`MeetingRequest`) from the materialized sponsor slot (`SponsorMeeting`). Code that wants to list "all sponsor meetings happening at conference time" reads `SponsorMeeting`, not `MeetingRequest`.
- **In-memory caches and rate limiters are per-process.** Both `lib/mem-cache.ts` and `lib/rateLimit.ts` live in the Node process Map. On Vercel multi-instance deploys, cache warmth and rate-limit accounting do not span instances. Acceptable for the demo scale; a real fix requires Redis.
- **No `.env.local.example` is committed for this app.** The root [`README.md`](../../README.md) §First-clone setup generates the `.env.local` inline. Required vars are listed below.

## App-specific dev commands

From this directory:

```bash
pnpm dev         # next dev -p 3002 (predev clears .next)
pnpm build       # next build
pnpm start       # next start -p 3002
pnpm lint        # next lint
pnpm typecheck   # tsc --noEmit
```

Or from the repo root:

```bash
./dev.sh meetings   # kills stale dev processes, then pnpm dev
pnpm dev:meetings   # Turbo-coordinated
```

## Test credentials

From [`packages/db/prisma/seed.ts`](../../packages/db/prisma/seed.ts):

| Email | Password | Role | Use for |
|---|---|---|---|
| `wbr@test.com` | `password123` | ORGANIZER | Staff queue approval flow |
| `stephcurry@test.com` | `password123` | BRAND | Requesting meetings |

Sponsor accounts are bounced from this app (Meetings admits Brand + WBR only).

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma client target (local SQLite file or Turso `libsql://`) |
| `NEXTAUTH_SECRET` | Yes | JWT signing; must match across all four apps |
| `NEXTAUTH_URL` | Yes | `http://localhost:3002` for local, the deploy URL in production |
| `TURSO_AUTH_TOKEN` | Production only | Auth for Turso libSQL connections (see ADR 0003) |
