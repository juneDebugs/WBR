# WBR Architecture

Current-state architecture of the WBR conferencing app. Written for cold pickup by an engineer or AI agent — i.e. enough detail to understand how the system fits together without reading every file, and enough file references to drill down when needed.

## Contents

- [At a glance](#at-a-glance)
- [The four apps](#the-four-apps)
- [Data flow](#data-flow)
- [Identity and auth](#identity-and-auth)
- [API surface](#api-surface)
- [PWA layer (attendee only)](#pwa-layer-attendee-only)
- [Deployment topology](#deployment-topology)
- [Shared packages](#shared-packages)
- [Known limitations and operational gaps](#known-limitations-and-operational-gaps)
- [Reference map](#reference-map)

## At a glance

WBR is a **monorepo of four Next.js 15 apps** sharing one database, one identity model, and one set of utility packages. Each app deploys independently to its own Vercel project.

| Component | What it is |
|---|---|
| Monorepo orchestrator | Turborepo 2.3 + pnpm 10.8 workspaces |
| Framework | Next.js 15.5.15 (App Router) on React 19.2 |
| Styling | Tailwind CSS 3.4 — no component library |
| Identity | NextAuth v4.24 with JWT sessions |
| Data layer | Prisma 5.22 + libSQL (Turso) — SQLite locally, Turso in production |
| Hosting | Four independent Vercel projects |
| AI | OpenAI SDK in `apps/web` only |
| TypeScript | 5.5 strict mode — but build silently ignores TS + ESLint errors |

## The four apps

### `apps/web` — admin dashboard (port 3000)

Back-office tool for WBR organizers. Login is gated to `STAFF`, `ORGANIZER`, or `ADMIN` role values via the credentials provider in `apps/web/lib/auth.ts`. Surfaces:

- Conference dashboard (health metrics, sponsor readiness scorecard)
- Speaker, session, sponsor, time-block, meeting, and attendee management
- Email composer + audit log
- Conference settings + third-party integration management
- AI-assisted surfaces (OpenAI SDK; sponsor-reminder personalization is the primary current integration point)

This app is the most-developed of the four. Recent commit traffic concentrates here on dashboard performance — the server-side prefetch into React Query `initialData` pattern under `apps/web/app/(dashboard)/`.

### `apps/attendee` — participant PWA (port 3001)

Progressive Web App for conference attendees. Mobile-first. Uses `@ducanh2912/next-pwa` for service-worker generation, React Query + IndexedDB (`@tanstack/react-query-persist-client` + `idb-keyval`) for offline cache persistence.

No role restriction. Google OAuth sign-ins auto-create a `User` row with role `ATTENDEE`. Surfaces: home, schedule, my schedule (bookmarks), speakers, people directory, chat (DB-polled DMs — no websocket layer), setup (blackout times + sponsor interests).

### `apps/meetings` — meeting coordination portal (port 3002)

Desktop-oriented portal for the 1-on-1 *business* meeting workflow. Same user base as attendee — no role restriction at login. The `/staff` route is the operational core: it lists `MeetingRequest` rows in `APPROVED`-but-unscheduled status and lets a `STAFF` user assign each to a `TimeBlock`, creating a `Meeting` record.

**Attendees do not pick their own meeting times.** They request → recipient approves → staff assigns. This is deliberate manual curation, not a missing self-service feature.

### `apps/sponsor` — sponsor company portal (port 3003)

Used by employees of sponsoring companies. Access is gated by `User.sponsorId` (a foreign key into the `Sponsor` table), not by role. The presence of a non-null `sponsorId` is what tells the portal which company the current user represents.

Surfaces: dashboard, attendee browse + meeting request, inbound/outbound request management, scheduled meetings, company profile editor, custom submission forms (six types: `ABSTRACT` / `FULL_PAPER` / `SPEAKER_PROPOSAL` / `PANEL` / `SYMPOSIUM` / `CUSTOM`), team management.

## Data flow

### Schema (`packages/db/prisma/schema.prisma`)

The full domain model lives in a single Prisma schema. SQLite is the engine — as a local file in dev, transported over libSQL/HTTP via Turso in production. All four apps consume the same generated Prisma client via the `@conference/db` package.

Entities, grouped:

- **Identity** — `User` (one human; carries role + bio + B2B-matchmaking fields + optional `sponsorId`), plus NextAuth adapter tables `Account`, `Session`, `VerificationToken`.
- **Conference** — `Conference` (one event with an `active` flag), `Speaker`, `ConfSession` (named to avoid colliding with NextAuth's `Session`), `SessionBookmark`.
- **Meetings** — `TimeBlock` (empty slot with capacity), `MeetingRequest` (the ask; status moves `PENDING` → `APPROVED`/`REJECTED` → `CONFIRMED`), `Meeting` (peer-to-peer, scheduled into a `TimeBlock`), `SponsorMeeting` (sponsor-booth, separate model), `BlackoutTime` (unavailability), `ConflictLog` (auto-detected speaker double-bookings).
- **Sponsors** — `Sponsor` (company with tier, target industries/sizes/revenues for matchmaking, contact info, booth number).
- **Messaging** — `ChatRoom` (`CHANNEL` or `DIRECT`), `ChatMember`, `Message` (DB-persisted, polled — no real-time transport).
- **Sponsor forms** — `SubmissionForm`, `FormSubmission`.
- **Social (built but largely unused)** — `Follow`, `Post`, `PostLike`.
- **Operational** — `EmailLog`, `Integration`.

### User roles

`User.role` is a **free-form string column**, not an enum. Values used in practice: `ATTENDEE`, `SPEAKER`, `ORGANIZER`, `STAFF`, `ADMIN`. The schema comment only lists the first three; `STAFF` and `ADMIN` exist by convention in the seed and the auth code.

A "sponsor user" is not a role. It is `User.sponsorId` populated with a `Sponsor.id`. The user's role typically remains `ATTENDEE`. The sponsor portal gates by the presence of `sponsorId`, not by role.

Only `apps/web` enforces role at login (`STAFF` / `ORGANIZER` / `ADMIN` — see `apps/web/lib/auth.ts:43`). The other three apps allow any account in and gate features post-login.

### Database client (`packages/db/src/client.ts`)

A multi-mode client. The mode is chosen at runtime per environment:

| Env condition | Mode | Reason |
|---|---|---|
| `NEXT_PHASE === phase-production-build` | Local SQLite (no Turso) | Build phase has no live DB |
| `VERCEL` set + Turso creds | Turso HTTP (`@libsql/client/web`) | Serverless can't hold persistent connections |
| Otherwise + Turso creds | Embedded replica (local file, 60s sync interval) | Local-speed reads with eventual consistency |
| No Turso creds | Local SQLite via `DATABASE_URL` | Dev default |

Embedded-replica mode wraps queries in a `$extends` guard that:
1. Awaits the initial `libsql.sync()` before any read so the very first query is never stale.
2. After write operations, kicks off a background `libsql.sync()` so subsequent reads see fresh data.

`dbConnectionMode` (an exported mutable string) is the diagnostic hook for confirming which mode is active in a given environment.

### Local vs Turso credentials

- Local: `DATABASE_URL="file:./packages/db/prisma/dev.db"`
- Vercel runtime: `TURSO_DATABASE_URL="libsql://..."` + `TURSO_AUTH_TOKEN="..."`

`turbo.json` declares these as the env vars to plumb through the build and dev pipelines. The repo-root `.env.example` documents the local subset; per-app `.env.local.example` files (in `apps/attendee/` and `apps/web/`) document per-port `NEXTAUTH_URL` overrides.

## Identity and auth

### NextAuth v4.24

All four apps run NextAuth v4.24.x mounted at `app/api/auth/[...nextauth]/route.ts`. Each app exports its own `authOptions` from `lib/auth.ts`. Two providers are configured everywhere:

- **`CredentialsProvider`** — email/password against the `User` table. Password verification uses scrypt with `timingSafeEqual` (see `packages/db/src/index.ts` — `verifyPassword`). The stored hash format encodes the scrypt cost factor: `<hex-hash>.<salt>.<N>`. Legacy hashes without a cost field fall back to Node's default `N = 16384`.
- **`GoogleProvider`** — OAuth via Google. In attendee / meetings / sponsor: a successful Google sign-in auto-creates a `User` with role `ATTENDEE` if no row exists for the email. In admin: the `signIn` callback rejects the sign-in unless the email already maps to a `STAFF` / `ORGANIZER` / `ADMIN` row.

Sessions are JWT (`session: { strategy: 'jwt' }`). The cookie is `next-auth.session-token` — HTTP-only, secure in production, 30-day expiry.

### Middleware (`apps/<app>/middleware.ts`)

Each app's middleware decodes the JWT once per request and forwards user identity to downstream handlers via custom request headers:

- `x-user-role`
- `x-user-id`
- `x-user-sponsor-id` (sponsor app only)

Unauthenticated requests to non-auth routes get redirected to `/login` (or returned as `{ error: 'Unauthorized' }` JSON with status 401 for `/api/*`). Authenticated requests to `/login` redirect to `/dashboard` (or the app-equivalent landing route).

The middleware matcher excludes `_next/static`, `_next/image`, `favicon.ico`, `manifest.json`, and common image extensions to avoid running on static assets.

### Cross-app identity

All four apps share the same `User` table and `NEXTAUTH_SECRET`, so the same credentials log in everywhere. But each app issues its own JWT, so a user has to log into each app independently. There is no single sign-on across the four.

## API surface

Each app owns its `app/api/*` route tree. There is no shared API gateway; one app does not call another app's API.

| App | API responsibilities |
|---|---|
| `web` | Full admin surface — auth, conference + speaker + session + sponsor + time-block + meeting + attendee CRUD, email send + log, integration OAuth flows, AI surfaces (OpenAI), exports |
| `attendee` | Auth, home/schedule/speakers/people read endpoints, chat send/receive (DB-polled), bookmarks, profile editing, blackout times |
| `meetings` | Auth, meeting-request CRUD, recommended-people algorithm, staff queue under `/api/meetings/staff/...` |
| `sponsor` | Auth, sponsor profile CRUD (incl. base64 logo upload), attendee browse + meeting-request flows, submission-form CRUD, team management |

All API route handlers assume the middleware has populated `x-user-id` and `x-user-role` headers; they re-read these rather than re-decoding the JWT. This is a deliberate optimization — JWT decoding has measurable per-request cost.

## PWA layer (attendee only)

`apps/attendee/next.config.js` wraps the Next.js config in `@ducanh2912/next-pwa`'s `withPWA`. The service worker is generated at production-build time. It is disabled in `NODE_ENV === development`.

Runtime caching rules (current state):

| Rule class | URL pattern | Handler | `networkTimeoutSeconds` |
|---|---|---|---|
| App pages | same-origin, non-`/api/*` | `NetworkFirst` | 10 |
| Next/Image | `/_next/image?url=…` | `NetworkFirst` | 10 |
| RSC / data payloads | `/_next/data/*.json` | `NetworkFirst` | 10 |
| Cross-origin images | non-same-origin `*.jpg|jpeg|png|webp|svg` | `NetworkFirst` | 10 |
| Unsplash images | `images.unsplash.com/*` | `NetworkFirst` | 10 |
| Google Fonts | `fonts.gstatic|googleapis.com/*` | `CacheFirst` | — |
| Static assets | `*.js|*.css` | `StaleWhileRevalidate` | — |

The React Query cache is persisted to IndexedDB via `@tanstack/react-query-persist-client` backed by `idb-keyval`. This keeps the app usable when conference WiFi flaps mid-session.

Note that the `_next/data/*.json` rule's URL pattern is Pages-Router-shaped; under App Router the broader page rule is what fires for RSC traffic in practice.

## Deployment topology

Each app deploys as its own Vercel project (four projects total). Per-project build config — see `apps/<app>/vercel.json`:

```json
{
  "buildCommand": "cd ../.. && npx turbo build --filter=<app>",
  "installCommand": "cd ../.. && corepack enable && pnpm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

### Required env vars per Vercel project

From `turbo.json` (the canonical list of build/dev env keys):

- `DATABASE_URL` — usually unset on Vercel; Turso vars take over at runtime.
- `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` — production data layer credentials.
- `NEXTAUTH_SECRET` — must match across all four projects so JWTs and shared `User`-table reads stay consistent.
- `NEXTAUTH_URL` — per-project; matches each app's deployed URL (or the vanity URL for attendee).
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — required for Google sign-in.

The admin app additionally reads `ADMIN_EMAILS` (comma-separated allow-list) and `OPENAI_API_KEY`. Other env vars used by specific surfaces (`CONFERENCE_ID`, `SPONSOR_PORTAL_URL`) are listed in the repo-root `.env.example`.

### Build behavior

Every `next.config.js` sets `typescript: { ignoreBuildErrors: true }` and `eslint: { ignoreDuringBuilds: true }`. A failing type-check or lint run does **not** fail a Vercel build. To catch issues, run `pnpm typecheck` and `pnpm lint` manually — those are honest.

`@prisma/adapter-libsql`, `@libsql/client`, and `libsql` are declared as `serverExternalPackages` so Next.js does not try to bundle their native bindings.

## Shared packages

### `@conference/db` (`packages/db/`)

The active data layer. Exports:
- The singleton `prisma` client (multi-mode per [Data flow → Database client](#database-client-packagesdbsrcclientts))
- All generated Prisma types (re-exported from `@prisma/client`)
- The `dbConnectionMode` diagnostic string
- Password helpers (`hashPassword`, `verifyPassword` — scrypt-based with cost-factor encoding)
- A handful of composite types (`SessionWithSpeaker`, `MeetingWithDetails`) and domain helpers (date grouping with timezone support, speaker conflict detection, blackout-time conflict checks)

### `@conference/types` (`packages/types/`)

Hand-written TypeScript types. **Out of sync.** Uses snake_case field names from the abandoned Supabase data model. Do not import; read the Prisma schema instead.

### `@conference/supabase` (`packages/supabase/`)

Dead code. No app imports it. A pre-Prisma artifact. Candidate for removal in a future cleanup phase.

## Known limitations and operational gaps

Surfaced so cold readers do not have to discover these by tripping on them.

- **No CI/CD pipeline.** No `.github/workflows/` directory. Vercel auto-deploys from the main branch.
- **No automated tests** at any layer (unit, integration, E2E).
- **No error tracking.** No Sentry / Datadog / equivalent.
- **No migration history.** Schema changes go through `prisma db push`, which does not record diffs. `supabase/migrations/001_initial.sql` is stale and is not run against the current database.
- **No real file storage.** Logos, hero images, and speaker photos are external URLs or base64-encoded strings in the database.
- **No transactional email beyond manual admin sends.** Mail goes via a user-configured Gmail/Outlook OAuth `Integration`; without one, emails are logged to `EmailLog` but not delivered.
- **No in-app notifications, push notifications, or audit trail.**
- **No production-safe rate limiting.** The sponsor app's in-memory limiter is bypassed by Vercel's multi-instance runtime.
- **Type and lint errors silently ignored at build time** — see [Deployment → Build behavior](#build-behavior).

## Reference map

| When you need… | Look at |
|---|---|
| A specific code path | The relevant app's `app/`, `components/`, and `lib/` directories |
| The data model | `packages/db/prisma/schema.prisma` |
| A seeding example or demo credentials | `packages/db/prisma/seed.ts` |
| The PWA cache rules | `apps/attendee/next.config.js` |
| Auth config for an app | `apps/<app>/lib/auth.ts` and `apps/<app>/middleware.ts` |
| Vercel build config for an app | `apps/<app>/vercel.json` |
| The env-var contract | `.env.example` (root), `apps/<app>/.env.local.example`, `turbo.json` |
| Why the architecture is what it is | `docs/decisions.md` (added in Phase 0b) |
| Operational procedures | `docs/runbook.md` (added in Phase 0b) |
| Symptom-to-cause for known failures | `docs/incident-playbook.md` (added in Phase 0b) |
