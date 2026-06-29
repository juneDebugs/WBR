# CLAUDE.md — agent front door

Claude Code auto-loads this file when an agent works in this repo. It is a thin router. The canonical content lives behind the links below; this file does not duplicate any of it.

## Project orientation

WBR is the conferencing app for WBR Research — a four-app Next.js monorepo backed by a shared Prisma + Turso data layer and NextAuth JWT-session identity. Each app deploys as its own Vercel project. The full architecture, including the system diagram and invariants, lives in [`docs/architecture.md`](docs/architecture.md).

## First-read file order

Before touching code, read in this order:

1. [`README.md`](README.md) — human Getting Started: prerequisites, first-clone setup, test credentials, debug surface, repo structure, full documentation corpus map.
2. [`docs/architecture.md`](docs/architecture.md) — current-state architecture: apps, data flow, auth model, PWA layer, deployment topology, system diagram, invariants, known limitations.
3. The per-app README for the subtree you are working in (table below).
4. [`docs/decisions.md`](docs/decisions.md) — chronological + topical index of engineering decisions; one paragraph per decision linking out to the relevant ADR or source doc.
5. [`CONTRIBUTING.md`](CONTRIBUTING.md) — workflow conventions used during the 2026-06-22 demo sprint, offered as a starting template rather than a binding ruleset.

For operational procedures and incident response, see [`docs/runbook.md`](docs/runbook.md) and [`docs/incident-playbook.md`](docs/incident-playbook.md).

## The four apps

| App | Role | Local port | Working-here doc |
|---|---|---|---|
| `apps/web` | Admin / organizer dashboard | 3000 | [`apps/web/README.md`](apps/web/README.md) |
| `apps/attendee` | Participant-facing PWA | 3001 | [`apps/attendee/README.md`](apps/attendee/README.md) |
| `apps/meetings` | 1-on-1 meeting coordination portal + staff queue | 3002 | [`apps/meetings/README.md`](apps/meetings/README.md) |
| `apps/sponsor` | Sponsor company portal | 3003 | [`apps/sponsor/README.md`](apps/sponsor/README.md) |

Shared packages: [`packages/db/README.md`](packages/db/README.md) (active data layer), [`packages/types/README.md`](packages/types/README.md) (deprecation stub), [`packages/supabase/README.md`](packages/supabase/README.md) (dead-code stub).

## Workflow conventions

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Highlights: per-phase deliverable shape (code + smoketest + Codex review log + doc updates in the same PR); Codex N=3 adversarial review cap with commit at end of review cycle; commit-msg + diff content scanned by a pre-commit blocklist hook (no `--no-verify`; rephrase to land); finding protocol (Analysis → Decision → Update PRD+plan → Implementation, PRD canonical); four-tier perf environment model (A production, B Vercel preview, C local prod build, D dev = invalid); rebase-and-merge for single-commit PRs.

## Architecture decisions

[`docs/decisions.md`](docs/decisions.md) is the index. Architectural-grade decisions have full ADRs in [`docs/adr/`](docs/adr/) in Nygard format: [`0001`](docs/adr/0001-monorepo-of-four-nextjs-apps.md) monorepo of four Next.js apps, [`0002`](docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md) NextAuth JWT sessions with scrypt, [`0003`](docs/adr/0003-turso-libsql-data-layer.md) Turso libSQL multi-mode data layer, [`0004`](docs/adr/0004-base64-images-in-db.md) base64 images in DB.

## Pre-existing known issues to ignore

- `apps/attendee/components/BottomNav.tsx(40,101)` carries a pre-existing `error TS2514: A tuple type cannot be indexed with a negative value.` Documented in the Phase 1, 2, and 15 Codex review logs. Do not "fix" as a side-quest. The build passes because every `next.config.js` sets `typescript.ignoreBuildErrors: true`. Run `pnpm typecheck` and `pnpm lint` manually for honest results.
