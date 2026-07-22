# apps/attendee — Participant-facing PWA

The attendee-side Next.js 15 (App Router) application, wrapped as a Progressive Web App. Runs on port 3001 in local dev. Deploys to Vercel as the `wbr` project. Any signed-in user can use this app — there is no role gate; per-feature gates apply post-login.

Cross-cutting architecture (data flow, auth model, PWA layer, deployment topology, system diagram) lives in [`docs/architecture.md`](../../docs/architecture.md). This file is the working-here doc for the `apps/attendee` subtree.

---

## Directory map

```
apps/attendee/
├── app/
│   ├── (authenticated)/
│   │   ├── (app)/                # Bottom-nav-bearing screens (home, schedule, people, ...)
│   │   ├── (fullscreen)/         # Modal-style routes (chat threads, profile editor, ...)
│   │   ├── layout.tsx            # Authenticated shell, bottom nav, header
│   │   └── page.tsx
│   ├── api/                      # Route handlers (see "API surface" below)
│   ├── login/
│   ├── layout.tsx                # Root layout — wraps session provider, PWA install
│   ├── session-provider.tsx
│   └── globals.css
├── components/
│   ├── BottomNav.tsx             # Sticky bottom navigation
│   ├── HomeScreen.tsx            # Home tile grid (weather, schedule, meetings)
│   ├── BackgroundPrefetch.tsx    # Idle-time prefetch coordinator
│   ├── PushNotificationSetup.tsx
│   ├── chat/ meetings/ my-schedule/ people/ schedule/ setup/ speakers/
├── lib/                          # App-specific helpers (see "Key files" below)
├── middleware.ts                 # Auth gate + identity header forwarding
├── next.config.js                # PWA wrapper + Workbox runtime caching rules
├── public/                       # Generated `sw.js`, `workbox-*.js` after `pnpm build`
├── scripts/
├── types/
├── package.json
├── tsconfig.json
└── vercel.json
```

## Key files

- **`next.config.js`** — wraps Next with `@ducanh2912/next-pwa`. Defines the **Workbox runtime caching rules**. Rule order matters because Workbox uses first-match: image-class rules (StaleWhileRevalidate, 128 entries, 24h) come before the broader page rule (NetworkFirst, 5s timeout). The rule-class split — distinct `networkTimeoutSeconds` for image vs page vs data — is the Phase 5 deliverable; see [`docs/smoketests/phase-5-pwa-timeout-split.md`](../../docs/smoketests/phase-5-pwa-timeout-split.md). The PWA is **disabled in dev** (`disable: process.env.NODE_ENV === 'development'`) — service worker only registers on `next build && next start` or a deploy.
- **`middleware.ts`** — auth gate: unauthenticated routes redirect to `/login` (or 401 for `/api/*`); authenticated users on `/login` redirect to `/home`. The middleware sets `x-user-id`, `x-user-role`, and `x-user-sponsor-id` on the `NextResponse.next()` response (`middleware.ts:26-31`), **not on a forwarded request**. This diverges from apps/meetings and apps/sponsor, which use the `NextResponse.next({ request: { headers } })` pattern. As a result, `lib/user.ts:getUserFromHeaders()` reads request headers via `headers()` and returns null when they are absent — be mindful when relying on its return value.
- **`lib/hooks.ts`** — TanStack Query (`useQuery`, `useMutation`) hooks for the `/api/data/*` endpoints. Components consume these, not `fetch` directly. Query keys + cache invalidation patterns live here.
- **`lib/auth.ts`** — NextAuth `authOptions`. No role restriction at the credentials provider (unlike apps/web); any user with a valid password gets through. JWT strategy; 30-day cookie. `NEXTAUTH_SECRET` must match the other three apps for cross-app JWT validity.
- **`lib/db.ts`** — `@conference/db` re-export. Multi-mode Prisma client picks Turso embedded-replica / Turso HTTP / SQLite at runtime (see [`docs/adr/0003-turso-libsql-data-layer.md`](../../docs/adr/0003-turso-libsql-data-layer.md)).
- **`lib/user.ts`** — `getUserFromHeaders()` reads `x-user-id` / `x-user-role` / `x-user-sponsor-id` from request headers via Next.js `headers()` and returns null if `x-user-id` is missing. Note the middleware divergence above — request headers are not always set in this app, so callers should handle the null case.
- **`app/api/data/chat/route.ts`** — chat-room list endpoint. Response shape was trimmed in Phase 15 (removed the per-room `members` array; sole consumer is `components/chat/ChatClient.tsx`). The file has an inline contract comment; re-verify if adding a second consumer.
- **`app/api/revalidate/route.ts`** — receives cross-app revalidate pings from apps/web on speaker mutations (see [`docs/architecture.md`](../../docs/architecture.md) §System diagram — the dotted arrow). The caller's URL is hardcoded to localhost:3001 so the ping only fires in local dev; production silently no-ops.
- **`vercel.json`** — `cd ../.. && npx turbo build --filter=attendee`, install via `corepack enable && pnpm install`.

## API surface

The attendee app's API splits into three shapes:

- **`app/api/data/*`** — read-only, TanStack-Query-fronted endpoints powering the screens. `chat`, `home`, `meetings`, `my-schedule`, `people`, `schedule`, `setup`, `speakers`. Each is cached with a tag; mutations elsewhere call `revalidateTag`.
- **`app/api/<resource>/*`** — write routes for `chat`, `feed`, `friend`, `meeting-requests`, `meetings`, `posts`, `profile`, `push-token`, `setup`. The `feed/[messageId]/like` + `feed/[messageId]/comments` routes power the Instagram-style People→Feed tab (`components/people/FeedTab.tsx`); they are guarded to `room-general` messages only. Feed posts may carry a base64 `imageUrl` (ADR 0004); schema DDL for `MessageLike`/`MessageComment`/`Message.imageUrl` is replayed on Turso via `db:migrate-feed`. `friend/[userId]` (GET status, POST action) drives the friend-request system — friendship is MUTUAL `Follow` edges (`packages/db/src/friends.ts`); it replaced the one-way `follow/[userId]` route. Creating a NEW DM room requires `friends` status (`POST /api/chat/rooms` → 403 `code: 'NOT_FRIENDS'`); existing rooms keep working after an unfriend. One-way rows from the follow era are mirrored by `scripts/migrate-friends-backfill.mjs` (alias `db:backfill-friends`).
- **`app/api/revalidate/route.ts`** — the cross-app inbound endpoint (admin calls in to bust caches after a speaker edit).

Note: **`app/api/data/speakers/route.ts` does NOT strip data-URI photoUrls.** It returns whatever the DB has. The parallel admin endpoint at `apps/web/app/api/data/speakers/route.ts` does strip — this divergence is intentional and noted in the admin README. See [`docs/adr/0004-base64-images-in-db.md`](../../docs/adr/0004-base64-images-in-db.md) for the surrounding decision.

## External runtime dependencies

- **Open-Meteo weather API** at `components/HomeScreen.tsx:75`. No auth required, no key. The home-screen weather tile fetches `api.open-meteo.com/v1/forecast` directly from the client. If Open-Meteo returns 5xx the tile renders empty rather than blocking the home screen.
- **Service worker (Workbox).** Generated by `next-pwa` at build time into `public/sw.js`. Re-registers on every navigation per `cacheOnFrontEndNav: false` + `reloadOnOnline: true`.
- **Push notifications.** Subscription tokens land in `app/api/push-token/route.ts`; `components/PushNotificationSetup.tsx` drives the opt-in UI. Server-side push send is not implemented in this app — the token endpoint is the receiving end.

## App-specific gotchas

- **`apps/attendee/components/BottomNav.tsx(40,101)` carries a pre-existing `error TS2514: A tuple type cannot be indexed with a negative value.`** First captured in the Phase 1 Codex review log; pre-dates the demo sprint. The line is `ICON_PATHS[tab.pathIdx]` where `tab.pathIdx` is narrowed by a `>= 0` runtime check that TypeScript cannot follow into the tuple-index lookup. **Do not "fix" as a side-quest** — TS build-quality enforcement is out of sprint scope per PRD §3 non-goals, and the build passes because `next.config.js` sets `typescript.ignoreBuildErrors: true`. Run `pnpm typecheck` manually for honest results.
- **The PWA is disabled in dev.** `next dev` does not register the service worker or generate `public/sw.js`. To exercise the PWA layer locally, run `pnpm build && pnpm start` (tier C per [`docs/smoketests/CONTRACT.md`](../../docs/smoketests/CONTRACT.md)). Lighthouse PWA audits against `next dev` are invalid (see runbook §Run Lighthouse against each tier).
- **Stale service worker between runs.** When the SW changes, browsers may serve the old SW until tabs close. If a deploy ships a SW change and the cache misbehaves, the user-facing mitigation is "close all tabs of the app and reopen." Local dev mitigation: `./clean.sh` from the repo root (kills dev procs + clears `.next`) then `pnpm build && pnpm start`.
- **Embedded-replica reads lag writes by ~60s.** The default Turso libSQL embedded-replica sync interval is 60s. A write on apps/web may not appear in an attendee read for up to a minute. See [`docs/incident-playbook.md`](../../docs/incident-playbook.md) §10 for the diagnostic flow.
- **No SSO across apps.** Each app issues its own JWT signed with the shared `NEXTAUTH_SECRET`. A session on apps/attendee is not automatically a session on apps/web. Cross-app links land on `/login` and require re-credentialing.
- **iOS PWA storage floor.** The 128-entry / 24h-TTL cache sizing in `next.config.js` was chosen against historical low iOS PWA storage floors. Workbox LRU eviction past the cap is acceptable degradation, not a contract violation.

## App-specific dev commands

From this directory:

```bash
pnpm dev         # next dev -p 3001 (predev clears .next)
pnpm build       # next build — generates public/sw.js
pnpm start       # next start -p 3001 (prod-mode local; PWA active)
pnpm lint        # next lint
pnpm typecheck   # tsc --noEmit (will surface the pre-existing BottomNav TS2514)
```

Or from the repo root:

```bash
./dev.sh attendee   # kills stale dev processes, then pnpm dev
pnpm dev:attendee   # Turbo-coordinated
```

## Test credentials

From [`packages/db/prisma/seed.ts`](../../packages/db/prisma/seed.ts) — the mobile app accepts all three test accounts:

| Email | Password | Role |
|---|---|---|
| `wbr@test.com` | `password123` | ORGANIZER |
| `brand@test.com` | `password123` | BRAND |
| `sponsor@test.com` | `password123` | SPONSOR (`sponsorId` → Tailor ERP) |

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma client target (local SQLite file or Turso `libsql://`) |
| `NEXTAUTH_SECRET` | Yes | JWT signing; must match across all four apps |
| `NEXTAUTH_URL` | Yes | `http://localhost:3001` for local, the deploy URL in production |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | If using Google sign-in | OAuth credentials |
| `TURSO_AUTH_TOKEN` | Production only | Auth for Turso libSQL connections |
