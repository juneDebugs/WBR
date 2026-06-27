# Phase 0a Smoketest — Foundation docs (README + architecture.md)

Manual verification path. Both human and AI agents are valid runners. Source: WBR demo sprint PRD §6 Phase 0a, §8.1 (smoketest contract), §8.5 (verification posture).

## What this verifies

- The `README.md` "Getting Started" flow is executable from a fresh clone.
- All four apps come up at their documented local ports.
- `docs/architecture.md` reflects the codebase's actual current state at the architectural-fidelity bar.

## Prerequisites for the runner

- POSIX shell on macOS or Linux.
- Node.js 20+ installed.
- Internet access (for `pnpm install` and `openssl rand`).
- A fresh checkout of the repo at a path with no prior `.next/`, `node_modules/`, or `dev.db` artifacts. If reusing an existing clone, run `./clean.sh` and `rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/dev.db packages/db/dev.db packages/db/prisma/dev.db` first.

## Steps

### 1. Documentation render check

- [ ] Open `README.md` and `docs/architecture.md` in a markdown viewer.
  - **Expected:** Both render without markdown errors. Section headers form a coherent table of contents. No HTML escapes leak through.
- [ ] Click every intra-repo link in both docs.
  - **Expected:** All resolve to a file in the repo. (External / future-Phase-0b links — `docs/runbook.md`, `docs/decisions.md`, `docs/incident-playbook.md` — are documented as added in Phase 0b and may not exist yet; this is acceptable.)

### 2. Toolchain bootstrap (README "Prerequisites")

- [ ] `corepack enable && corepack prepare pnpm@10.8.0 --activate`
  - **Expected:** `pnpm --version` reports `10.8.0`.
- [ ] `node --version`
  - **Expected:** Reports `v20.x` or higher.

### 3. First-clone setup (README "First-clone setup")

- [ ] `pnpm install`
  - **Expected:** Completes without errors. The root `postinstall` hook runs `prisma generate --schema=packages/db/prisma/schema.prisma` successfully.
- [ ] Generate `NEXTAUTH_SECRET` and write a `.env.local` for **each** of the four apps per the README's First-clone setup block (Next.js loads env per-app at `process.cwd()` — the repo-root `.env.example` is reference-only, not auto-loaded).
  - **Expected:** Four files exist: `apps/attendee/.env.local`, `apps/web/.env.local`, `apps/meetings/.env.local`, `apps/sponsor/.env.local`. All four share the same `NEXTAUTH_SECRET` value (required for cross-app JWT validity). `NEXTAUTH_URL` differs per app (`:3001` attendee, `:3000` web, `:3002` meetings, `:3003` sponsor).
- [ ] `DATABASE_URL="file:./packages/db/prisma/dev.db" npx prisma db push --schema=packages/db/prisma/schema.prisma`
  - **Expected:** Completes with "Database synchronized with Prisma schema." `packages/db/prisma/dev.db` now exists.
- [ ] `DATABASE_URL="file:./packages/db/prisma/dev.db" npx ts-node --compiler-options '{"module":"CommonJS"}' packages/db/prisma/seed.ts`
  - **Expected:** Completes without exceptions. Seed output references the seeded conference, speakers, sponsors, and demo users.

### 4. All four apps run

- [ ] `./dev.sh`
  - **Expected:** Output lists four servers: Admin (3000), Mobile App (3001), Meeting Portal (3002), Sponsor Portal (3003).
- [ ] `curl -sI http://localhost:3000/ | head -1` (or browse)
  - **Expected:** `307` or `302` redirect (admin redirects unauthenticated requests to `/login`).
- [ ] `curl -sI http://localhost:3001/ | head -1`
  - **Expected:** `307` or `302` redirect.
- [ ] `curl -sI http://localhost:3002/ | head -1`
  - **Expected:** `307` or `302` redirect.
- [ ] `curl -sI http://localhost:3003/ | head -1`
  - **Expected:** `307` or `302` redirect.

### 5. Credential login per app (verifies seed data + auth wiring)

Using credentials documented in README "Test credentials":

- [ ] Admin (web) — http://localhost:3000/login → `june@tailor.tech` / `admin123`.
  - **Expected:** Redirects to `/dashboard`. Conference dashboard renders.
- [ ] Meetings staff queue — http://localhost:3002/login → `staff@wbr.com` / `staff123`.
  - **Expected:** Login succeeds. The `/staff` route is reachable.
- [ ] Attendee — http://localhost:3001/login → `steph@curry.com` / `stephcurry`.
  - **Expected:** Redirects to attendee `/home`. Conference info, profile prompts, and recent activity render.
- [ ] Sponsor — http://localhost:3003/login → `sponsor@shopify.com` / `sponsor123`.
  - **Expected:** Redirects to sponsor dashboard. Profile editor shows Shopify-tagged content.

### 6. Role gating matches architecture.md

- [ ] Attempt admin login at http://localhost:3000/login with `steph@curry.com` / `stephcurry`.
  - **Expected:** Login rejected (role `ATTENDEE` is not in the `STAFF` / `ORGANIZER` / `ADMIN` allow list per `apps/web/lib/auth.ts:43`).
- [ ] Log into sponsor app with `staff@wbr.com` / `staff123`.
  - **Expected:** Login succeeds, but the sponsor portal does not show a sponsor company context — staff has no `sponsorId`.

### 7. Tooling restart cycle

- [ ] `./clean.sh`
  - **Expected:** Kills dev processes on 3000–3003, clears each app's `.next/`. No errors.
- [ ] `./dev.sh` again
  - **Expected:** All four apps come back up at the same ports.

### 8. Architectural-fidelity spot-checks (architecture.md claims that benefit from runtime confirmation)

- [ ] `packages/db/prisma/schema.prisma` contains the entity groups documented in `docs/architecture.md` §Data flow (Identity, Conference, Meetings, Sponsors, Messaging, Sponsor forms, Social, Operational).
  - **Expected:** Every named entity in architecture.md resolves to a Prisma model in the schema file.
- [ ] In one of the running apps' logs (e.g. attendee), the `[prisma]` lines reference SQLite mode.
  - **Expected:** No `Embedded replica synced` message (local mode); no `Turso adapter failed` message. If a Turso URL is set in `.env`, `[prisma] Embedded replica synced` should appear instead — also acceptable.
- [ ] `apps/<app>/middleware.ts` files split into two patterns per architecture.md §Middleware:
  - `meetings` and `sponsor` use `NextResponse.next({ request: { headers: requestHeaders } })` to forward identity to downstream route handlers.
  - `attendee` and `web` set `x-user-*` headers on the response object only — route handlers re-derive identity via `getServerSession` / `getToken`.
  - **Expected:** `grep -l "NextResponse.next({ request:" apps/*/middleware.ts` matches `meetings` and `sponsor` only. `grep -L "NextResponse.next({ request:" apps/*/middleware.ts` matches `attendee` and `web` only.
- [ ] Sponsor middleware sets the extended header set (`x-user-sponsor-name`, `x-user-sponsor-logo-url`, `x-user-name`) beyond the base trio.
  - **Expected:** `grep -l "x-user-sponsor-name" apps/*/middleware.ts` matches sponsor only.

## Pass / fail

Smoketest **passes** when every checked item produces its expected outcome. Any failure during steps 1–5 is an AC-failing finding for Phase 0a (per PRD §8.2) — README or architecture.md must be updated until the flow runs clean on a fresh clone. Failures in steps 6–8 are architectural-fidelity gaps in architecture.md — same gating.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches: the `pnpm install` flow, the `.env` contract, the dev-script set (`dev.sh`, `clean.sh`, root `package.json` scripts), the Prisma schema, or the auth model. Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
