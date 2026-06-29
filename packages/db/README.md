# @conference/db — Shared Prisma + Turso data layer

The active data layer for all four apps. Exports the Prisma client (multi-mode: SQLite / Turso HTTP / Turso embedded-replica), the scrypt password helpers, and a handful of cross-app domain helpers (schedule grouping, speaker-conflict detection, blackout-conflict checks).

Architectural rationale lives in [`docs/adr/0003-turso-libsql-data-layer.md`](../../docs/adr/0003-turso-libsql-data-layer.md) (multi-mode client) and [`docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md`](../../docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md) (password helpers).

---

## What this package exports

From [`src/index.ts`](src/index.ts):

| Export | Purpose |
|---|---|
| `prisma` | The Prisma client singleton. Auto-selects connection mode at construction. |
| `dbConnectionMode` | Diagnostic string: `build-phase-sqlite` / `turso-http` / `turso-embedded-replica` / `sqlite: <url>` / `turso-failed: <reason>` |
| `* from '@prisma/client'` | Re-exports model types so consumers don't depend on `@prisma/client` directly. |
| `verifyPassword(password, hash)` | scrypt-based verify; understands both new (`hash.salt.cost`) and legacy (`hash.salt`) shapes. |
| `hashPassword(password)` | Creates a new scrypt hash with `N=2048`, `r=8`, `p=1`, `keylen=64` and a fresh 16-byte salt. |
| `SessionWithSpeaker`, `MeetingWithDetails` | Composite types used across apps. |
| `groupSessionsByDay(sessions, timezone?)` | Returns `{ date: 'YYYY-MM-DD', sessions: [...] }[]`, sorted. |
| `detectSpeakerConflicts(prisma)` | Scans for overlapping speaker-assigned sessions, upserts `ConflictLog`, returns active conflicts. |
| `getActiveConflicts(prisma)` | Reads active conflicts from `ConflictLog` without re-scanning. |
| `checkBlackoutConflicts(prisma, userIds, startsAt, endsAt)` | Returns user-blackout overlaps for a candidate time window. |

## Multi-mode Prisma client

`src/client.ts` picks one of four modes at construction time. Inspect via `import { dbConnectionMode } from '@conference/db'` and log on app startup.

| Mode | When | Trigger |
|---|---|---|
| `build-phase-sqlite` | During `next build` | `NEXT_PHASE === 'phase-production-build'`. Pure local SQLite — Turso is never contacted during build. |
| `turso-http` | At runtime on Vercel | `VERCEL === '1'` and `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` are set. Uses `@libsql/client/web` for native-dep-free serverless. |
| `turso-embedded-replica` | At runtime off-Vercel with Turso credentials | Uses `@libsql/client` with a local replica file synced every 60s for local-speed reads. |
| `sqlite: <url>` | At runtime without Turso credentials | Falls back to whatever `DATABASE_URL` points at (the local `dev.db`). |
| `turso-failed: <reason>` | Turso connection threw | Falls back to plain SQLite + records the failure reason. |

The full rationale (build-time isolation, embedded-replica freshness lag, Vercel HTTP vs native libSQL) is in [`docs/adr/0003-turso-libsql-data-layer.md`](../../docs/adr/0003-turso-libsql-data-layer.md).

## Scripts

Five scripts are proxied from the repo root; the rest must be invoked via `pnpm --filter @conference/db <script>`.

**Root-proxied (recommended for local dev):**

```bash
pnpm db:generate    # Generate Prisma client into node_modules/.prisma
pnpm db:migrate     # Run prisma migrate dev against ./dev.db
pnpm db:push        # Push schema to ./dev.db (skips migration history)
pnpm db:seed        # Seed core data + copy dev.db to all four apps
pnpm db:studio      # Open Prisma Studio against ./dev.db
```

**Package-scoped variants** (Turso seeding + meetings seed):

```bash
pnpm --filter @conference/db db:seed-meetings         # Adds meeting fixtures, copies dev.db to all four apps
pnpm --filter @conference/db db:seed-turso            # Seeds against the DATABASE_URL in the calling env (Turso)
pnpm --filter @conference/db db:seed-meetings-turso   # Meetings seed against Turso
```

The `db:seed` and `db:seed-meetings` scripts copy the resulting `dev.db` into `apps/web/`, `apps/attendee/`, `apps/meetings/`, and `apps/sponsor/` after seeding so each app's local DB stays in sync.

## Schema

The Prisma schema at [`prisma/schema.prisma`](prisma/schema.prisma) declares `provider = "sqlite"`. The same schema serves the Turso libSQL runtime via the driver-adapter preview feature. **There is no migration history.** Schema changes go through `prisma db push`, which applies the schema to the target DB without recording diffs — there is no `prisma/migrations/` directory. Captured as an operational gap in [`docs/architecture.md`](../../docs/architecture.md) §Known limitations.

**Prisma Studio is SQLite-only.** It reads the `datasource` block directly and does not use the multi-mode runtime client — it cannot connect to Turso. For Turso inspection, use the Turso CLI (`turso db shell <db-name>`) or the Turso web dashboard.

Notable model details that have caught reviewers:

- `Speaker.photoUrl` (not `image`). Used across the speaker carousel + drill-down pages.
- `User.sponsorId` is the foreign key gating the sponsor app, not `User.role`.
- `MeetingRequest` is the negotiation lifecycle; `SponsorMeeting` is the materialized confirmed slot (created by apps/meetings on `CONFIRMED + timeBlockId + sponsor`).
- `Integration` rows store per-user Gmail/Outlook OAuth tokens for the admin email-send routes.

## Local-dev DB location

Two `dev.db` files exist in this package, and the seed scripts and app `.env.local` files do not target the same one:

- **`packages/db/dev.db`** — what the `db:push` / `db:seed` / `db:studio` scripts in this `package.json` resolve to (cwd is `packages/db`, scripts set `DATABASE_URL="file:./dev.db"`). The `db:seed` step `cp ./dev.db ../../apps/<app>/dev.db` after seeding copies this file outward.
- **`packages/db/prisma/dev.db`** — what the apps' `.env.local.example` templates target (`DATABASE_URL="file:../../packages/db/prisma/dev.db"` from each app's cwd). The root [`README.md`](../../README.md) §First-clone setup also writes here via `DATABASE_URL="file:./packages/db/prisma/dev.db" npx prisma db push ...`.

The two files can drift. The honest reading: the first-clone setup populates `prisma/dev.db` (what apps read), then the seed-script flow populates `packages/db/dev.db` and copies it into each app's local `dev.db`. If apps still point at `prisma/dev.db`, the seed never reaches them — a known foot-gun the README is calling out rather than hiding. Cleanup is a post-sprint task.
