# ADR 0003 — Turso + libSQL data layer with multi-mode client

- **Status:** Accepted (current state, since 2026-06)
- **Date:** 2026-06-08 (initial codebase recon)
- **Supersedes:** A pre-Prisma Supabase prototype (residue in `packages/supabase/` and `supabase/migrations/001_initial.sql`; both dead code, scheduled for removal).
- **Superseded by:** None

## Context

WBR needs a data layer that:

- Runs on Vercel's serverless runtime (no persistent connections, fast cold-start, per-invocation client lifecycle).
- Offers local-fidelity dev — what the developer runs locally should behave identically to production data semantics.
- Supports a single Prisma schema across all [four apps](0001-monorepo-of-four-nextjs-apps.md) so the data model is one source of truth.
- Is operationally affordable for a sandbox-tier project (no full-time DBA, no Postgres cluster, no replica orchestration).
- Tolerates the "no migration history" stance the project ships with (schema management via `prisma db push`, not `prisma migrate dev`).

The previous prototype used Supabase Postgres; that stack was abandoned during the Prisma transition. Remnant code in `packages/supabase/` and `supabase/migrations/001_initial.sql` is dead and slated for removal.

Three alternative data layers were considered:

1. **Postgres (Supabase, Neon, Railway).** Industry-standard, well-tooled, but introduces per-request connection-pool overhead on serverless, requires a separate dialect from the local SQLite story.
2. **PlanetScale / managed MySQL.** Similar trade-off; the dialect mismatch against a local SQLite dev story is the bigger cost.
3. **Turso + libSQL.** SQLite semantics (so local file == prod dialect), managed hosting + replicas, HTTP-friendly client for serverless runtimes, embedded-replica mode for local-speed reads against a remote dataset.

## Decision

WBR uses **Turso (managed libSQL)** as the production database, **plain SQLite** locally, **Prisma 5.22** as the ORM, and the **`@prisma/adapter-libsql`** package to route Prisma queries through libSQL when running against Turso.

The data layer lives in **`packages/db`** (`@conference/db`) and exposes:

- The singleton `prisma` client (multi-mode per runtime context — see below).
- The `dbConnectionMode` diagnostic string for confirming which mode is active.
- Password helpers (`hashPassword` / `verifyPassword` — see [ADR 0002](0002-nextauth-jwt-sessions-with-scrypt.md)).
- Re-exports of `@prisma/client` types.
- Composite types (`SessionWithSpeaker`, `MeetingWithDetails`) and domain helpers (date grouping with timezone support, speaker conflict detection, blackout-time conflict checks).

The multi-mode client at `packages/db/src/client.ts` picks one of six runtime modes at first construction:

| Environment condition | Mode | Reason |
|---|---|---|
| `NEXT_PHASE === 'phase-production-build'` | `build-phase-sqlite` (local SQLite, no Turso) | Build phase does not have a live DB; uses a placeholder client |
| `VERCEL` set + Turso credentials present | `turso-http` (`@libsql/client/web` over HTTP) | Vercel serverless cannot hold persistent connections |
| Otherwise + Turso credentials present | `turso-embedded-replica` (libSQL replica at `file:/tmp/turso-replica.db`, 60s sync interval) | Local-speed reads against a remote dataset for long-running dev |
| Turso credentials present but adapter init throws | `turso-failed: <reason>` | Captured for diagnostics; production logs the failure at startup |
| No Turso credentials | `sqlite: <DATABASE_URL>` | Plain SQLite via `DATABASE_URL`; dev default |
| `DATABASE_URL` also unset | `no-database` | Misconfigured environment; surfaces early |

**Embedded-replica mode** wraps Prisma queries in a `$extends` guard that:

1. Awaits the initial `libsql.sync()` before any read on first invocation, so the very first query is never stale.
2. Triggers a background `libsql.sync()` after each write operation, so subsequent reads pick up the new data within the next sync cycle.

The write-op set is hardcoded at `client.ts:62` — `create`, `createMany`, `update`, `updateMany`, `delete`, `deleteMany`, `upsert`.

Schema management is via **`prisma db push`**, not `prisma migrate dev`. There is no committed migration history. The Prisma client is regenerated via `prisma generate` (run automatically by the root `postinstall` hook).

## Consequences

**Easier:**

- **One SQL dialect across dev and prod.** Same SQLite semantics in `packages/db/prisma/dev.db` locally and in Turso production. No "works locally, breaks in prod" cliffs around dialect-specific features.
- **Serverless-compatible client on Vercel.** The HTTP libSQL client (`@libsql/client/web`) is stateless per-request, with no connection pool to exhaust under burst load.
- **SQLite-speed local reads via embedded replica.** When Turso credentials are set in a long-running dev shell, the multi-mode client routes through `file:/tmp/turso-replica.db` — reads are local-disk fast, writes propagate to remote Turso in the background.
- **`dbConnectionMode` makes mode-selection bugs visible.** Logging the value at startup of any server-side path is the first diagnostic step for "is the DB working" — covered in [`incident-playbook.md` → Database unreachable](../incident-playbook.md#3-database-unreachable).
- **Low operational cost.** Turso's hosted tier handles managed backups, replicas, and access tokens; no DBA work needed for the demo audience scale.

**Harder:**

- **No migration history.** `prisma db push` does not produce or apply migrations — it diffs the schema against the current database and applies the delta. Branch checkouts that change `schema.prisma` require a manual `pnpm db:push` to bring the local DB into sync; the failure mode is the dev server throwing "Unknown field" or "Table does not exist." Captured in [`incident-playbook.md` → Local dev DB out-of-sync](../incident-playbook.md#12-local-dev-db-out-of-sync-after-schema-change). Versioned migrations are a Phase-2-shaped follow-up.
- **Embedded-replica staleness window.** A write completes and triggers a background sync; subsequent reads from the same process see the new value only after the sync lands. Worst-case delay is the 60s sync interval — captured in [`incident-playbook.md` → Embedded-replica stale read](../incident-playbook.md#4-embedded-replica-stale-read). The `$extends` guard does not block reads after a write — only the *initial* sync is blocking.
- **Two sets of env vars.** Local dev uses `DATABASE_URL`; Vercel runtime uses `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`. The multi-mode client picks the right path automatically, but the dual env-var contract is a place where misconfiguration is easy.
- **Turso outage = all four apps down.** No fallback DB; no read replica routing at the application layer. The demo audience scale tolerates this; client-facing scale would want a backup posture.
- **Native module dependency in non-Vercel runtimes.** Embedded-replica mode uses the native `@libsql/client` (not `@libsql/client/web`), which requires platform binaries. The `@prisma/adapter-libsql`, `@libsql/client`, and `libsql` packages are listed in `serverExternalPackages` in every app's `next.config.js` so Next.js does not try to bundle them.

**Neutral but worth knowing:**

- The base64-image storage pattern ([ADR 0004](0004-base64-images-in-db.md)) interacts with this ADR by sharply increasing per-row payload sizes. The Turso layer handles the bytes without complaint, but Lighthouse's lantern-model amplifies the implications. Phase 16 (post-sprint) closes that loop.
- The `$extends` mechanism wraps **all** model operations through `$allOperations`. Adding a new model is transparent — no per-model wiring needed.
- The `globalForPrisma` singleton holds the client across hot reloads in dev and across function invocations in production. Critical for performance — without it, embedded-replica mode would re-initialize on every request.

## References

- [`packages/db/src/client.ts`](../../packages/db/src/client.ts) — the multi-mode client implementation.
- [`packages/db/src/index.ts`](../../packages/db/src/index.ts) — public exports (including `dbConnectionMode`).
- [`packages/db/prisma/schema.prisma`](../../packages/db/prisma/schema.prisma) — the canonical data model.
- [`architecture.md` → Data flow](../architecture.md#data-flow) — cross-cutting data-layer description.
- [`runbook.md` → Reset the local dev database](../runbook.md#reset-the-local-dev-database).
- [`runbook.md` → Rotate Turso auth token](../runbook.md#rotate-turso-auth-token).
- [`runbook.md` → Inspect database state](../runbook.md#inspect-database-state).
- [`incident-playbook.md` → Database unreachable](../incident-playbook.md#3-database-unreachable).
- [`incident-playbook.md` → Embedded-replica stale read](../incident-playbook.md#4-embedded-replica-stale-read).
- [ADR 0004](0004-base64-images-in-db.md) — image-storage decision that interacts with this layer.
