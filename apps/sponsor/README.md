# apps/sponsor — Sponsor company portal

The sponsor-side Next.js 15 (App Router) application. Runs on port 3003 in local dev. Any signed-in user can authenticate, and **some sponsor routes 403 unless `User.sponsorId` is non-null** — the gating is per-route, not blanket. Today only the profile-write route at `app/api/profile/route.ts:11-12` enforces the check; routes like `/api/attendees` and `/api/request-meeting` accept any authenticated user. When this app gates at all, it gates by the `sponsorId` foreign key, not by `User.role`.

Cross-cutting architecture (data flow, auth model, deployment topology, system diagram) lives in [`docs/architecture.md`](../../docs/architecture.md). This file is the working-here doc for the `apps/sponsor` subtree.

---

## Directory map

```
apps/sponsor/
├── app/
│   ├── (authenticated)/
│   │   ├── (portal)/             # Sponsor portal screens
│   │   └── layout.tsx
│   ├── api/                      # Route handlers (see "API surface" below)
│   ├── login/
│   ├── layout.tsx                # Root layout — registers PWA manifest
│   └── session-provider.tsx
├── components/
│   ├── DashboardView.tsx
│   ├── ScheduleView.tsx
│   ├── SponsorMeetingsView.tsx
│   ├── SubmissionsView.tsx
│   ├── SponsorBrowseView.tsx
│   ├── ProfileEditor.tsx ProfilePageClient.tsx
│   ├── RegisterTeammate.tsx TeamMembers.tsx
│   ├── RecommendedAttendees.tsx
│   ├── BackgroundPrefetch.tsx
│   ├── NavBar.tsx
│   └── SolutionBadge.tsx
├── lib/                          # App-specific helpers (see "Key files" below)
├── middleware.ts                 # Auth gate + identity header forwarding (incl. sponsorId)
├── next.config.js
├── public/                       # manifest.json, icons (PWA-installable shell)
├── scripts/
├── package.json
├── tsconfig.json
└── vercel.json
```

## Key files

- **`lib/auth.ts`** — NextAuth `authOptions`. **No role restriction** at the credentials provider. The Google sign-in path **self-provisions** new users as `role: 'ATTENDEE'` (line 74) if the email is unknown. `sponsorId` is read out of the DB on each login and threaded into the JWT (line 79, 89, 99) so downstream code can authorize by it without a DB round-trip.
- **`middleware.ts`** — auth-gate + identity header forwarding. Forwards **more headers than the other apps** because sponsor routes care about sponsor identity: `x-user-id`, `x-user-role`, `x-user-sponsor-id`, `x-user-sponsor-name`, `x-user-sponsor-logo-url`, `x-user-name`. Routes read these via `lib/user.ts` rather than re-decoding the JWT.
- **`lib/user.ts`** — `getUserFromHeaders()` returns the sponsor-identity headers as a typed object. Routes that require sponsorship check `user.sponsorId` directly.
- **`lib/rateLimit.ts`** — in-memory sliding-window limiter. **Broken in production:** on Vercel's multi-instance Fluid Compute runtime each instance has its own `Map`, so the limit accounting is per-instance, not global. Captured in [`docs/incident-playbook.md`](../../docs/incident-playbook.md) §12; the comment in the source file (`Works well for single-server deployments; use Redis for multi-instance.`) understates the consequence.
- **`lib/server-data.ts`** — server-side data fetchers feeding the dashboard, schedule, meetings, and submissions views. Each is `unstable_cache`'d with a `sponsor-<id>` tag; mutations on `/api/profile` call `revalidateTag('sponsor-<id>')`.
- **`lib/solutions.ts`** — solution-taxonomy lookup shared with apps/meetings.

## API surface

Sponsorship enforcement is **per-route and inconsistent**. The profile-write route enforces `user.sponsorId` (`app/api/profile/route.ts:11-12`); routes such as `app/api/attendees/route.ts` and `app/api/request-meeting/route.ts` only verify `user.id`. Document the actual posture rather than imply uniform gating.

- `app/api/attendees/route.ts` — attendees list for the sponsor's browse + recommend views. **Preloaded** by the portal layout via `<link rel="preload" href="/api/attendees" as="fetch">` (`app/(authenticated)/(portal)/layout.tsx:11`); this preload was moved here from the root layout in Phase 3 to avoid blocking the login page.
- `app/api/browse/route.ts` — sponsor-side people browse with filter.
- `app/api/meetings/route.ts`, `app/api/meetings-data/route.ts` — confirmed meeting list for the sponsor (reads `SponsorMeeting` rows created by apps/meetings).
- `app/api/profile/route.ts` — sponsor profile read/update. **Returns 403 if `user.sponsorId` is null.** Writes `revalidateTag('sponsor-<id>')` so cached panels rebuild.
- `app/api/profile/sponsor-data/route.ts` — cached sponsor-record fetcher used by the profile editor.
- `app/api/request-meeting/route.ts` — sponsor-initiated meeting request.
- `app/api/sponsor-data/route.ts` — dashboard tile data.
- `app/api/submissions/route.ts` — sponsor swag-submission state.
- `app/api/auth/[...nextauth]/route.ts` + `app/api/login/route.ts` — sign-in handlers.

## App-specific gotchas

- **Sponsorship enforcement is per-route and inconsistent.** A non-sponsor user can authenticate and hit any route; only some routes 403. The profile-write route enforces `sponsorId` (`app/api/profile/route.ts:11-12`); `/api/attendees`, `/api/request-meeting`, and others do not. If you add a new route that genuinely requires sponsorship, replicate the `if (!user.sponsorId) return 403` check rather than assuming an upstream gate.
- **`/api/attendees` is preloaded from the authenticated portal layout, not the root.** The preload was relocated in Phase 3 because emitting it from the root layout fired against the login page (where the call returns 401), filling the network panel with red entries and contributing to login-page LCP delay. See [`docs/smoketests/phase-3-sponsor-preload-relocate.md`](../../docs/smoketests/phase-3-sponsor-preload-relocate.md).
- **The in-memory rate limiter is broken on Vercel multi-instance.** Same shape as apps/web's and apps/meetings'. Per-instance accounting means a hot caller can exceed the intended cap by `~N_instances`. Captured for follow-up; Redis backing is the real fix.
- **The portal layout sets PWA metadata** (`app/layout.tsx` declares `manifest: '/manifest.json'`), but unlike apps/attendee this app **does not register a service worker** — there is no `next-pwa` wrapper in `next.config.js`. The manifest enables "Add to home screen" but the offline cache layer is absent.
- **No `.env.local.example` is committed for this app.** The root [`README.md`](../../README.md) §First-clone setup generates the `.env.local` inline.

## App-specific dev commands

From this directory:

```bash
pnpm dev         # next dev -p 3003 (predev clears .next)
pnpm build       # next build
pnpm start       # next start -p 3003
pnpm lint        # next lint
pnpm typecheck   # tsc --noEmit
```

Or from the repo root:

```bash
./dev.sh sponsor   # kills stale dev processes, then pnpm dev
pnpm dev:sponsor   # Turbo-coordinated
```

## Test credentials

From [`packages/db/prisma/seed.ts`](../../packages/db/prisma/seed.ts) — only `sponsorId`-bearing users get past the sponsor-only routes:

| Email | Password | Role | `sponsorId` |
|---|---|---|---|
| `sponsor@shopify.com` | `sponsor123` | ATTENDEE | Shopify |
| `sponsor@klaviyo.com` | `sponsor123` | ATTENDEE | Klaviyo |

Plain attendees (`steph@curry.com`) can sign in but hit 403 on sponsor-only routes.

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma client target (local SQLite file or Turso `libsql://`) |
| `NEXTAUTH_SECRET` | Yes | JWT signing; must match across all four apps |
| `NEXTAUTH_URL` | Yes | `http://localhost:3003` for local, the deploy URL in production |
| `TURSO_AUTH_TOKEN` | Production only | Auth for Turso libSQL connections (see ADR 0003) |
