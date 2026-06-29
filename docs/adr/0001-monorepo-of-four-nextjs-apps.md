# ADR 0001 — Four independent Next.js apps in one monorepo

- **Status:** Accepted (current state, since 2026-06)
- **Date:** 2026-06-08 (initial codebase recon)
- **Supersedes:** None
- **Superseded by:** None

## Context

WBR has four meaningfully different user-facing surfaces:

- **Admin** (`web`) — desktop dashboard used by conference organizers. Role-gated. Heaviest current development; primary AI integration target.
- **Attendee** — mobile-first PWA used by conference participants. Service worker, offline cache rules, install prompt. No role restriction at login.
- **Meetings** — desktop-oriented staff queue + meeting coordination portal. Role-influenced UX (the `/staff` route is the operational core).
- **Sponsor** — desktop portal used by employees of sponsoring companies. Access gated by `User.sponsorId` (foreign key into the `Sponsor` table), not by role.

The four surfaces share a single domain model — one `User` table, one `Conference`, one set of `MeetingRequest` and `Meeting` rows. They differ in UX shape, in target device, in the data subset each consumes, in the auth gating posture, and in the deploy cadence each is likely to want.

Three options were considered for codebase layout:

1. **One Next.js app with route-level UX divergence.** All four surfaces under `apps/main/`, with `app/(admin)/...`, `app/(attendee)/...`, etc.
2. **Four independent repos.** One repo per app, each with its own copy of the shared types and DB helpers, kept in sync by hand or by published packages.
3. **One monorepo, four apps under `apps/`, shared code under `packages/`.** This is the choice that was made.

## Decision

WBR ships as a monorepo containing four Next.js 15 apps:

- `apps/web` — admin dashboard, port 3000 locally, deployed as Vercel project `wbr-admin` (confirmed via `.vercel/repo.json` at the repo root).
- `apps/attendee` — participant PWA, port 3001, deployed as Vercel project `wbr` (the attendee app inherited the canonical project name).
- `apps/meetings` — meeting portal + staff queue, port 3002, deployed as Vercel project `wbr-meetings`.
- `apps/sponsor` — sponsor portal, port 3003, deployed as Vercel project `wbr-sponsor`.

Plus shared `packages/`:

- `packages/db` (`@conference/db`) — Prisma client + multi-mode connection logic + password helpers + composite types + domain helpers.
- `packages/types` (`@conference/types`) — legacy hand-written types from a pre-Prisma Supabase prototype. **Out of sync; do not import.** Scheduled for removal.
- `packages/supabase` (`@conference/supabase`) — dead code; pre-Prisma artifact. Scheduled for removal.

The orchestrator is **Turborepo 2.x + pnpm 10.8 workspaces**. The root `turbo.json` declares build / dev / lint / typecheck pipelines and the shared env-var contract (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).

Each app deploys as its own Vercel project. Per-project `vercel.json` filters the build to that app's slice via Turbo:

```json
{
  "buildCommand": "cd ../.. && npx turbo build --filter=<app>",
  "installCommand": "cd ../.. && corepack enable && pnpm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

## Consequences

**Easier:**

- **Per-app deploys.** A push to `main` builds all four projects in parallel; a build failure in one does not block the others.
- **Per-app env-var matrix.** `OPENAI_API_KEY` lives only on the admin project; the PWA service-worker config affects only the attendee project. No cross-app variable pollution. (The admin app's `.env.local.example` lists `ADMIN_EMAILS`, but the runtime sign-in gate at `apps/web/lib/auth.ts` is role-based against the `User` table, not an env-var allowlist — so `ADMIN_EMAILS` is documentation residue today, not load-bearing config.)
- **Per-app custom-domain mapping.** The vanity URL targets the attendee project alone; the other three remain on `.vercel.app` URLs without needing a routing shim.
- **PWA isolation.** `@ducanh2912/next-pwa` generates a service worker for `apps/attendee` only. The other three apps remain standard SSR / CSR — no SW interference, no `clean.sh` cache invalidation needed across apps for non-attendee changes.
- **Shared data layer without code duplication.** The Prisma client + scrypt helpers live in `packages/db` and are imported as `@conference/db` from any of the four apps.

**Harder:**

- **Per-app NextAuth + middleware duplication.** Each app has its own `lib/auth.ts` and `middleware.ts`. Auth posture changes (e.g., a new provider, a `NEXTAUTH_SECRET` rotation, a session-cookie expiry change) ripple across four files. The middleware split between request-header forwarding (meetings, sponsor) and response-header-only (attendee, web) is itself a source of inconsistency — described in [`architecture.md` → Middleware](../architecture.md#middleware-appsappmiddlewarets).
- **No SSO across apps.** Each app issues its own JWT cookie, scoped to its own domain. A user logs into each app independently using the same credentials. Captured in detail in [`incident-playbook.md` → Multi-app cross-login confusion](../incident-playbook.md#7-multi-app-cross-login-confusion). A future shared-auth-gateway design would close this, at the cost of central-service operational complexity.
- **Cross-app schema changes ripple to all four.** A `prisma db push` against a new schema requires every app to be rebuilt because the generated Prisma client lives at the package level.
- **Cross-app env-var changes are a four-place edit.** `NEXTAUTH_SECRET` rotation requires every Vercel project updated atomically; missing one breaks the cross-app credential consistency (described in [`runbook.md` → Rotate NEXTAUTH_SECRET](../runbook.md#rotate-nextauth_secret-cross-app)).
- **Local dev launches four servers.** `./dev.sh` runs all four in parallel, holding four Next.js dev workers + four ports. Resource cost is acceptable on a modern dev machine; surfaced under load on lower-spec hardware.

**Neutral but worth knowing:**

- The four-app split exists at the deploy and routing layer, not at the data layer. There is no application-level service boundary between apps — each app talks directly to the shared Prisma client. One narrow exception: `apps/web` fetches `http://localhost:3001/api/revalidate` (the attendee app's `revalidateTag` endpoint) on speaker updates. The URL is hardcoded to localhost, so the call only succeeds in local dev; in production the cross-app revalidation silently no-ops via the catch block (`apps/web/app/(dashboard)/dashboard/speakers/[id]/page.tsx`, `apps/web/app/api/speakers/[id]/route.ts`).
- The `wbr` vs. `wbr-mobile` Vercel project naming has a stale duplicate (`wbr-mobile` appears to be an early experiment); the canonical attendee project is `wbr`. Future cleanup should remove the duplicate.

## References

- [`architecture.md`](../architecture.md) — the cross-cutting architecture document.
- [`architecture.md` → Deployment topology](../architecture.md#deployment-topology) — per-project Vercel config.
- [`architecture.md` → Shared packages](../architecture.md#shared-packages) — full inventory of `packages/`.
- [`decisions.md` → Architecture](../decisions.md#architecture) — index entry.
- Future ADRs that reference this one: [0002](0002-nextauth-jwt-sessions-with-scrypt.md) (auth posture inherits the per-app split), [0003](0003-turso-libsql-data-layer.md) (the shared data layer this monorepo concentrates in `packages/db`).
