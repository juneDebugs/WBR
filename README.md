# WBR

Conferencing app for WBR Research. A four-app Next.js monorepo backed by a shared Prisma + Turso data layer and NextAuth session-based identity.

Architecture and per-app responsibilities live in [`docs/architecture.md`](docs/architecture.md).

## The four apps

| App | Role | Local port |
|---|---|---|
| `apps/web` | Admin / organizer dashboard | 3000 |
| `apps/attendee` | Participant-facing PWA | 3001 |
| `apps/meetings` | 1-on-1 meeting coordination portal + staff queue | 3002 |
| `apps/sponsor` | Sponsor company portal | 3003 |

## Documentation corpus

The `docs/` tree is the load-bearing reference set for engineers and AI agents picking the project up cold.

| File | Purpose |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Current-state architecture — apps, data flow, auth, PWA, deployment topology, system diagram |
| [`docs/runbook.md`](docs/runbook.md) | Common operational tasks — reset local DB, run the apps, rotate secrets, add env vars, tune PWA timeouts, run Lighthouse, inspect DB state, descriptive current-Vercel posture |
| [`docs/incident-playbook.md`](docs/incident-playbook.md) | Symptom → check → likely cause → mitigation for 13 known failure surfaces (vanity URL, build failure, DB outage, AI provider degradation, auth, PWA cache, email, schema drift, replica staleness, cross-login, sponsor rate limiter, stray dev processes) |
| [`docs/decisions.md`](docs/decisions.md) | Chronological + topical index of engineering decisions; one paragraph per decision linking out to the relevant ADR or source doc |
| [`docs/adr/`](docs/adr/) | Architectural-grade ADRs in Nygard format: 0001 monorepo, 0002 NextAuth + JWT + scrypt, 0003 Turso + libSQL multi-mode client, 0004 base64-images-in-DB |
| `docs/smoketests/phase-N-*.md` | Per-phase manual verification checklists (regression library) — see [`docs/smoketests/CONTRACT.md`](docs/smoketests/CONTRACT.md) for the shape |
| `docs/codex-reviews/phase-N-*.md` | Per-phase Codex adversarial review logs |

## Getting Started

### Prerequisites

- **Node.js 20+** — Next.js 15 requires Node 20 or higher.
- **pnpm 10.8.0** — pinned in the root `package.json`. Easiest install: `corepack enable && corepack prepare pnpm@10.8.0 --activate`.
- **POSIX shell** — `dev.sh` and `clean.sh` are bash scripts.

### First-clone setup

```bash
# 1. Install dependencies. The postinstall hook runs `prisma generate`.
pnpm install

# 2. Create a .env.local for each app. Next.js loads env files per-app
#    (process.cwd() during `next dev`), so the repo-root `.env.example`
#    is reference-only — it is not auto-loaded by the apps. The shared
#    NEXTAUTH_SECRET is required for cross-app JWT validity.
NEXTAUTH_SECRET="$(openssl rand -base64 32)"

cat > apps/attendee/.env.local <<EOF
DATABASE_URL="file:../../packages/db/prisma/dev.db"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3001"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
EOF

cat > apps/web/.env.local <<EOF
DATABASE_URL="file:../../packages/db/prisma/dev.db"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ADMIN_EMAILS="your@email.com"
EOF

cat > apps/meetings/.env.local <<EOF
DATABASE_URL="file:../../packages/db/prisma/dev.db"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3002"
EOF

cat > apps/sponsor/.env.local <<EOF
DATABASE_URL="file:../../packages/db/prisma/dev.db"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3003"
EOF

# 3. Initialize the local SQLite database.
DATABASE_URL="file:./packages/db/prisma/dev.db" \
  npx prisma db push --schema=packages/db/prisma/schema.prisma

# 4. Seed sample data (72 speakers, 20 sponsors, ~1000 demo attendees).
DATABASE_URL="file:./packages/db/prisma/dev.db" \
  npx ts-node --compiler-options '{"module":"CommonJS"}' \
  packages/db/prisma/seed.ts
```

> **Shortcut alternative (with a caveat).** Once the local DB is initialized, `pnpm db:push`, `pnpm db:seed`, and `pnpm db:studio` from the repo root proxy through to `packages/db`. The proxied scripts use `DATABASE_URL="file:./dev.db"` from `packages/db` cwd, which resolves to `packages/db/dev.db` — **not** the `packages/db/prisma/dev.db` file the inline first-clone setup above targets and the apps' `.env.local` templates point at. The two files can drift. See [`packages/db/README.md`](packages/db/README.md) §Local-dev DB location for the full picture + the Turso-targeted variant scripts.

### Run the apps locally

Start all four:

```bash
./dev.sh
```

Or one at a time:

```bash
./dev.sh web        # admin, port 3000
./dev.sh attendee   # PWA, port 3001
./dev.sh meetings   # meeting portal, port 3002
./dev.sh sponsor    # sponsor portal, port 3003
```

Equivalent via pnpm/turbo:

```bash
pnpm dev:web
pnpm dev:attendee
pnpm dev:meetings
pnpm dev:sponsor
```

### Verify all four apps respond

After `dev.sh` reports servers running, each app should redirect an unauthenticated browser to its own `/login`:

| App | URL |
|---|---|
| Admin | http://localhost:3000 |
| Attendee | http://localhost:3001 |
| Meetings | http://localhost:3002 |
| Sponsor | http://localhost:3003 |

### Test credentials (from `packages/db/prisma/seed.ts`)

| Account | Email | Password | Role | Apps it can log into |
|---|---|---|---|---|
| WBR | `wbr@test.com` | `password123` | ORGANIZER | Admin, Meetings, Sponsor, Mobile (all four) |
| Brand | `stephcurry@test.com` | `password123` | BRAND | Meetings, Mobile |
| Sponsor | `sponsor@test.com` | `password123` | SPONSOR (`sponsorId` → Tailor ERP) | Sponsor, Mobile |

Every app gates login by account access: Admin admits WBR only; Meetings admits Brand + WBR; Sponsor admits Sponsor + WBR; Mobile (attendee) admits all three.

### Debugging

- **Stale `.next` caches.** Run `./clean.sh` — kills dev processes on ports 3000–3003 and clears every app's `.next/`. Then restart with `./dev.sh`.
- **Type or lint errors not failing the build.** Intentional. Every `next.config.js` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`. Run `pnpm typecheck` and `pnpm lint` manually for honest results.
- **Inspecting database state.** `DATABASE_URL="file:./packages/db/prisma/dev.db" npx prisma studio --schema=packages/db/prisma/schema.prisma` — opens Prisma Studio against the local SQLite file.
- **Which DB mode am I in?** Import `dbConnectionMode` from `@conference/db` and log it at startup. Values: `build-phase-sqlite`, `turso-http`, `turso-embedded-replica`, `sqlite: <url>`, or `turso-failed: <reason>`.
- **Per-app env files.** Each app loads its own `.env.local` from its own directory at `next dev` time. `apps/attendee/.env.local.example` and `apps/web/.env.local.example` are tracked starting templates; `meetings` and `sponsor` follow the same shape but ship without examples (the First-clone setup above creates all four).

### Useful scripts

| Command | Purpose |
|---|---|
| `pnpm build` | Build all four apps (Turbo-coordinated) |
| `pnpm typecheck` | TypeScript check across the monorepo |
| `pnpm lint` | ESLint across the monorepo |
| `./dev.sh [app]` | Start all four apps (or one) — kills stale dev processes first |
| `./clean.sh` | Kill dev processes + clear all `.next` caches |

## Deployment

Each of the four apps deploys as its own Vercel project. Per-project build config: `cd ../.. && npx turbo build --filter=<app>`. Install: `cd ../.. && corepack enable && pnpm install`. See [`docs/architecture.md`](docs/architecture.md) §Deployment topology for the env-var matrix and Turso connection modes.

## Repository structure

```
.
├── apps/
│   ├── attendee/    # PWA, port 3001
│   ├── meetings/    # Meeting portal, port 3002
│   ├── sponsor/     # Sponsor portal, port 3003
│   └── web/         # Admin dashboard, port 3000
├── packages/
│   ├── db/          # Prisma client + Turso adapter + password helpers (@conference/db)
│   ├── types/       # Out-of-sync legacy types (@conference/types — do not trust)
│   └── supabase/    # Dead code (@conference/supabase — pre-Prisma relic)
├── scripts/         # Misc one-off scripts
├── supabase/        # Stale SQL migration (do not run)
├── docs/            # Engineer + AI agent reference docs
├── .env.example
├── dev.sh           # Multi-app dev launcher
├── clean.sh         # Cache reset
├── package.json     # Workspace root (pnpm + turbo)
└── turbo.json       # Build/dev pipeline config
```
