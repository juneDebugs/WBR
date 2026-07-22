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
