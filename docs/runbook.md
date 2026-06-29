# Operational Runbook

Common operational procedures for engineers working on WBR — what to run, when to run it, and what to expect when each step succeeds. Written so a cold engineer (or AI agent) can execute each procedure end-to-end without reading code or asking for help.

This runbook documents the **current state** of the system. Where a procedure depends on a third-party platform (Vercel, Turso, Google Cloud), the runbook describes how the deployed system works today; it does not prescribe new platform-touching operations.

If a procedure here disagrees with the code, the code is canonical. Open a fix; the doc and the code change ship together.

When a procedure does not succeed or a production-side issue surfaces, the symptom-to-cause catalog is in [`incident-playbook.md`](incident-playbook.md).

## Contents

- [Local development](#local-development)
  - [Reset the local dev database](#reset-the-local-dev-database)
  - [Run all four apps locally](#run-all-four-apps-locally)
  - [Inspect database state](#inspect-database-state)
- [Credentials and secret rotation](#credentials-and-secret-rotation)
  - [Rotate NEXTAUTH_SECRET (cross-app)](#rotate-nextauth_secret-cross-app)
  - [Rotate Turso auth token](#rotate-turso-auth-token)
  - [Rotate Google OAuth credentials](#rotate-google-oauth-credentials)
  - [Rotate the OpenAI API key (admin app only)](#rotate-the-openai-api-key-admin-app-only)
  - [Add a new env var across all four projects](#add-a-new-env-var-across-all-four-projects)
- [Service-worker tuning (attendee PWA only)](#service-worker-tuning-attendee-pwa-only)
  - [Tune NetworkFirst timeout thresholds](#tune-networkfirst-timeout-thresholds)
- [Performance measurement](#performance-measurement)
  - [Run Lighthouse against the four environment tiers](#run-lighthouse-against-the-four-environment-tiers)
  - [Wire a real iOS device to local dev](#wire-a-real-ios-device-to-local-dev)
  - [Run a Playwright smoketest](#run-a-playwright-smoketest)
- [Current deployment posture (descriptive)](#current-deployment-posture-descriptive)
  - [Deploy a single app to production](#deploy-a-single-app-to-production)
  - [Add a custom domain on a Vercel project](#add-a-custom-domain-on-a-vercel-project)
  - [Re-link a Vercel project to a different repo](#re-link-a-vercel-project-to-a-different-repo)
  - [Inspect production logs](#inspect-production-logs)
- [Open](#open)
  - [Hosting platform decision — pending](#hosting-platform-decision--pending)

---

## Local development

### Reset the local dev database

Wipe the SQLite database and reseed with the standard demo dataset (~1000 attendees, 72 speakers, 20 sponsors, plus all conference, sponsor, meeting, and chat seed data).

```bash
# 1. From repo root: stop any running dev servers, then remove BOTH local SQLite files
#    plus the per-app copies. The two packages/db files exist because db:push and the
#    apps' .env.local templates target different paths — see packages/db/README.md
#    §Local-dev DB location.
./clean.sh
rm -f packages/db/dev.db packages/db/prisma/dev.db apps/*/dev.db

# 2. Recreate the schema from prisma/schema.prisma.
#    pnpm db:push proxies to packages/db with DATABASE_URL="file:./dev.db" — writes
#    packages/db/dev.db, not packages/db/prisma/dev.db.
pnpm db:push

# 3. Seed. This runs packages/db/prisma/seed.ts (against packages/db/dev.db) and
#    copies the resulting file into each app directory.
pnpm db:seed

# 4. Recreate the prisma/dev.db file the apps' .env.local templates point at, by
#    pushing + copying from the seeded packages/db/dev.db. (If you only ever invoke
#    db:* scripts and never run the apps via their .env.local, you can skip this.)
DATABASE_URL="file:./packages/db/prisma/dev.db" \
  npx prisma db push --schema=packages/db/prisma/schema.prisma
cp packages/db/dev.db packages/db/prisma/dev.db

# 5. Restart the apps.
./dev.sh
```

**Why two `dev.db` files.** `pnpm db:push` / `pnpm db:seed` resolve `DATABASE_URL="file:./dev.db"` from `packages/db` cwd → `packages/db/dev.db`. The per-app `.env.local` templates point at `../../packages/db/prisma/dev.db` from each app's cwd → `packages/db/prisma/dev.db`. The two paths are different files on disk and can drift if only one path is updated. The seed step copies `./dev.db` outward to each app's own `dev.db` as a safety net for code that reads the local copy directly. Step 4 above re-syncs the `prisma/dev.db` path so the apps' default `.env.local` continues to work.

**Variants.** Defined inside `packages/db/package.json:11–13` — not exposed as root-level shortcuts. Invoke via filter:

- `pnpm --filter @conference/db db:seed-meetings` — runs `seed-meetings.ts` instead, which seeds a meeting-focused dataset for testing the staff queue.
- `pnpm --filter @conference/db db:seed-turso` and `pnpm --filter @conference/db db:seed-meetings-turso` — same seed scripts, but without the local-file copy step. Use these when seeding a remote Turso database (set `DATABASE_URL` or the Turso env vars before invoking).

Root `package.json:17–21` only proxies the five base scripts (`db:generate`, `db:migrate`, `db:push`, `db:seed`, `db:studio`).

**Pass criteria.**
- `pnpm db:push` reports `🚀 Your database is now in sync with your Prisma schema.`
- `pnpm db:seed` runs to completion without throwing; the script prints progress logs as records are created.
- Each app at `localhost:300{0,1,2,3}` accepts the test credentials documented in [`README.md`](../README.md#test-credentials-from-packagesdbprismaseedts).

### Run all four apps locally

See [`README.md` → Getting Started → Run the apps locally](../README.md#run-the-apps-locally) for the cold-start path (env files, install, db push, seed).

To restart after a hot-reload glitch:

```bash
./dev.sh           # all four
./dev.sh attendee  # one (web | attendee | meetings | sponsor)
```

`./dev.sh` kills any process bound to the corresponding port (3000–3003), removes that app's `.next/` cache, sleeps 1 second, then runs `npx pnpm --filter <app> dev` in the background. It sleeps 8 seconds before printing the "Servers running" message — that is a fixed wait, not a readiness check. Browser at `http://localhost:300X` is the actual readiness signal.

If `./dev.sh` reports "Address already in use" or a port stays unhealthy after restart:

```bash
./clean.sh                       # kills 3000–3003 + clears all .next/
lsof -i :3000                    # confirm the port is free
./dev.sh                         # restart
```

The root `pnpm dev` and `pnpm dev:<app>` commands also work — they go through Turbo and run `npm run clean` first. `pnpm dev` uses the `predev` lifecycle hook (root `package.json:8`); the app-specific `pnpm dev:<app>` scripts (`package.json:11–14`) chain `npm run clean &&` inline before invoking Turbo, not via the hook.

### Inspect database state

**Prisma Studio (local SQLite only).** Visual table browser.

```bash
pnpm db:studio
```

Opens a browser tab on `http://localhost:5555`. The schema is taken from `packages/db/prisma/schema.prisma`. The data comes from whichever `DATABASE_URL` is set when the command runs.

Unlike the other `db:*` scripts (`db:push`, `db:seed`) which hardcode `DATABASE_URL="file:./dev.db"`, `db:studio` does **not** set `DATABASE_URL` — Prisma reads it from the caller's environment. To inspect the canonical local SQLite file from the repo root:

```bash
DATABASE_URL="file:./packages/db/prisma/dev.db" pnpm db:studio
```

Prisma Studio is **SQLite-only** for this project — the schema at `packages/db/prisma/schema.prisma:6–9` declares `provider = "sqlite"`, and Prisma Studio reads the datasource block directly (it does not use the multi-mode runtime client in `packages/db/src/client.ts`). Passing `DATABASE_URL=libsql://...` to `db:studio` will fail. For Turso/libSQL inspection, use the Turso CLI (`turso db shell <database-name>`) or the Turso web dashboard.

**Which connection mode is active.** The Prisma client at `packages/db/src/client.ts` picks one of six modes based on env vars and runtime context, and exports the chosen value as `dbConnectionMode`. Possible values:

| Value | When it fires |
|---|---|
| `build-phase-sqlite` | During `next build` (`NEXT_PHASE === 'phase-production-build'`) — never uses Turso |
| `turso-http` | On Vercel (`VERCEL` env set) with `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` |
| `turso-embedded-replica` | Locally with Turso env vars set — pulls a replica to `file:/tmp/turso-replica.db` and syncs every 60s |
| `sqlite: <DATABASE_URL>` | No Turso env vars; falls back to whatever `DATABASE_URL` resolves to |
| `no-database` | `DATABASE_URL` unset, no Turso vars (only happens if env is misconfigured) |
| `turso-failed: <reason>` | Turso adapter initialization threw — the error is logged at startup |

To confirm at runtime, import and log the value from any server-side entry point:

```ts
import { dbConnectionMode } from '@conference/db'
console.log('[startup] db mode:', dbConnectionMode)
```

The value is set the first time `prisma` is constructed, so the log is reliable from request 1 onward.

---

## Credentials and secret rotation

### Rotate NEXTAUTH_SECRET (cross-app)

`NEXTAUTH_SECRET` signs the JWT session cookie that NextAuth issues per app. **The four apps must share the same value** — they read each other's User table and rely on session JWT consistency across deploys.

```bash
NEW_SECRET="$(openssl rand -base64 32)"
echo "$NEW_SECRET"
```

Then update the value in every place the secret is read:

| Where | What changes |
|---|---|
| Local: `apps/attendee/.env.local`, `apps/web/.env.local`, `apps/meetings/.env.local`, `apps/sponsor/.env.local` | Set `NEXTAUTH_SECRET=<NEW_SECRET>` in each file (identical value) |
| Vercel: each of the four projects (`wbr`, `wbr-admin`, `wbr-meetings`, `wbr-sponsor`) | Environment Variables → `NEXTAUTH_SECRET` → Edit. Production + Preview + Development scopes get the same value. Redeploy each project once |

**Effect on users.** Every active session JWT becomes invalid the moment the new secret takes effect on each project. All logged-in users are forced to log in again. There is no graceful overlap mechanism.

**When to rotate.** On suspected leak; on a contributor with shared local access leaving the project; on a routine cadence the project owner sets.

**Pass criteria.** After redeploy, an existing browser session at any app prompts for login. A fresh login succeeds on all four apps and produces a working session cookie scoped to each.

### Rotate Turso auth token

The Turso auth token is issued by the Turso CLI or dashboard. Replace it in two locations.

1. Issue a new token via the Turso UI or CLI:

```bash
turso db tokens create <database-name>
```

2. Update `TURSO_AUTH_TOKEN` on each of the four Vercel projects. Redeploy each.

3. (Optional) After confirming the new token works, revoke the old one in the Turso dashboard.

`TURSO_DATABASE_URL` typically does not change during a rotation — only the token does.

**Pass criteria.** Each Vercel project's logs show `dbConnectionMode === turso-http` post-deploy. A request that performs a DB read (any authenticated route) returns its expected data without error.

### Rotate Google OAuth credentials

Google OAuth is configured via a single OAuth 2.0 client in Google Cloud Console. The same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` pair is used across all four apps; each app's `NEXTAUTH_URL` defines a separate authorized redirect URI under the same client.

1. In Google Cloud Console → APIs & Services → Credentials, edit the OAuth 2.0 Client used by WBR. Either:
   - Rotate by regenerating the client secret (preserves the client ID), or
   - Create a new client and migrate (issues a new client ID and secret).
2. If rotating only the secret: update `GOOGLE_CLIENT_SECRET` on every local `.env.local` and on every Vercel project. Redeploy each project. Existing user sign-ins on Google continue to work after redeploy (the consent state lives on Google's side, keyed by client ID).
3. If creating a new client: also update `GOOGLE_CLIENT_ID`. Confirm the new client's "Authorized redirect URIs" list contains `<NEXTAUTH_URL>/api/auth/callback/google` for every app's deployed URL plus every local development URL (`http://localhost:300{0,1,2,3}/api/auth/callback/google`).

**Footnote, per PRD §5.** The OAuth client referenced by the codebase was flagged as a placeholder during the 2026-06-26 sprint kickoff call. Confirm the client is real before relying on Google sign-in for the demo path. If the "Continue with Google" button is non-functional in production, the engineer-of-record's decision is to provision a real client before 7/6 or strip the button.

**Pass criteria.** "Continue with Google" on each app at production URL completes the OAuth round-trip and lands the user on the app's authenticated landing page.

### Rotate the OpenAI API key (admin app only)

The OpenAI key powers the AI surfaces in `apps/web` (sponsor-reminder personalization is the current primary integration point). The key is not read by the runtime `attendee`, `meetings`, or `sponsor` apps. Two offline utility scripts under `apps/attendee/scripts/` (`generate-speaker-images.mjs` and `generate-replacement-speakers.mjs`) read `OPENAI_API_KEY` for one-off image generation — these are not part of the running app surface and are typically invoked by hand during dataset prep.

1. Generate a new key in the OpenAI dashboard (Project → API keys → Create new).
2. Update `OPENAI_API_KEY` in `apps/web/.env.local` and on the `wbr-admin` Vercel project. Redeploy.
3. After confirming the new key works (any admin AI feature returns a successful response), revoke the old key in the OpenAI dashboard.

**Pass criteria.** An admin AI feature (e.g., generate-sponsor-reminder) returns a populated response without a 401 from OpenAI. Logs do not show `Invalid API key` errors.

### Add a new env var across all four projects

When introducing a new shared env var (e.g., a feature flag that all four apps read):

1. Add the variable name to `turbo.json`'s `tasks.build.env` and `tasks.dev.env` arrays (currently lines 7 and 12). Without this, Turbo will not plumb the variable through the build cache, and locally-set values will not be visible to `next build` / `next dev`.
2. Add the value to each of the four `apps/<app>/.env.local` files for local development.
3. For Vercel: set the value on each of the four projects via Project → Settings → Environment Variables. Scope to Production + Preview + Development as needed.
4. If the variable is referenced in a build-time path (read inside `next.config.js`, used in a server component during SSR, or feeds a generated artifact), redeploy each project so the new value is captured during the build.
5. Document the variable in the repo-root `.env.example` so contributors see it without grepping.

**Pass criteria.** `grep <VAR_NAME> turbo.json` returns the line; each `.env.local` has the value; each Vercel project's dashboard lists the variable; the running app reads the value successfully (server-side `console.log(process.env.<VAR_NAME>)` at startup is a simple confirmation).

---

## Service-worker tuning (attendee PWA only)

Only the attendee app ships a service worker; the other three apps are standard SSR/CSR without offline behavior. The service worker is generated at production-build time by `@ducanh2912/next-pwa` and is disabled in `NODE_ENV === development` (so you will not see the SW in `pnpm dev`).

### Tune NetworkFirst timeout thresholds

The SW runtime caching rules live at `apps/attendee/next.config.js`, inside `withPWA({ workboxOptions: { runtimeCaching: [...] } })`. The rule order in the array matters — Workbox uses first-match. The rule classes are:

| Rule class | Handler | Network timeout | Cache name |
|---|---|---|---|
| Next.js image optimization (`/_next/image?url=...`) | `StaleWhileRevalidate` | n/a | `next-image` |
| Cross-origin images (`*.jpg|jpeg|png|webp|svg`) | `StaleWhileRevalidate` | n/a | `cross-origin-images` |
| Unsplash (`images.unsplash.com/*`) | `StaleWhileRevalidate` | n/a | `unsplash-images` |
| Google Fonts | `CacheFirst` | n/a | `google-fonts` |
| Static assets (`*.js|*.css`) | `StaleWhileRevalidate` | n/a | `static-assets` |
| Next.js Pages-Router data (`/_next/data/*.json`) | `NetworkFirst` | 5s | `next-data` |
| App pages (same-origin, not `/api/*`) | `NetworkFirst` | 5s | `pages` |

**To change a timeout.** Edit the `networkTimeoutSeconds` value on the relevant rule, then rebuild the attendee app (`pnpm --filter attendee build`) — the SW is regenerated each build, so the new value takes effect on the next deploy or local production-build run.

**Calibration follow-up (Phase 5).** The 5s page-rule timeout is the working target derived from simulated slow-4G testing. Real conference WiFi calibration was not completed during the 2026-06-22 demo sprint; the in-event observation can adjust this value if pages still feel stuck past 5s under congested WiFi. Raise to 7s and re-test if stale-data symptoms surface on schedule/meeting routes; lower to 3s and re-test if 5s is too patient on real WiFi.

**Why some rules are `StaleWhileRevalidate` not `NetworkFirst`.** Per Phase 5's Codex review: images should serve instantly from cache (a 5–10 s network wait on stalled WiFi for a face avatar is worse than a marginally stale avatar). Pages must keep network-first semantics — stale schedule or meeting state during a live event is worse than slow render.

**Why the rules are ordered the way they are.** Image-class rules come before the broader page rule because Workbox first-matches; leaving `/_next/image?url=...` to the page rule would shadow the image rule entirely. Static-assets rule (`*.js|*.css`) is also before the page rule for the same shadow reason — this was caught in Phase 5 by the Codex Round 1 review.

**Pass criteria.** A production build of attendee shows the SW registering at first load (DevTools → Application → Service Workers). With the page offline (DevTools → Network → Offline), reload — the page renders from cache. Image-class responses on reload have `from ServiceWorker` in the Network panel.

---

## Performance measurement

### Run Lighthouse against the four environment tiers

The four tiers are defined in [`docs/smoketests/CONTRACT.md`](smoketests/CONTRACT.md#12-perf-bar-check-env-specific). Use the right tier for the claim being verified.

| Tier | When to use | How to run |
|---|---|---|
| **A — production** | Confirming AC after merge | Lighthouse via Chrome DevTools or `lighthouse <url>` CLI against the production URL |
| **B — Vercel preview** | Pre-merge gate; most reliable AC check | Look up the PR's preview URL via `gh pr view <num> --json statusCheckRollup` or the PR's check list; Lighthouse against that URL |
| **C — local production build** | Pre-push smoke; catches build errors | `pnpm --filter <app> build && pnpm --filter <app> start`, then Lighthouse on `http://localhost:300X` |
| **D — local dev** | **Not valid for perf-bar claims.** Dev-mode JS inflates LCP / TBT by an order of magnitude | n/a — do not use |

**Authenticated routes.** Most AC routes require a session cookie. Capture one via DevTools (Application → Cookies → `next-auth.session-token`) and supply it to Lighthouse with `--extra-headers` (CLI) or by signing in via the same Chrome profile (DevTools).

**Mobile profile.** All sprint AC claims are mobile-profile. Lighthouse defaults to mobile in modern Chrome DevTools; in the CLI, pass `--preset=mobile` or use a config that enables mobile throttling + screen emulation.

**Both observed and simulated LCP.** Per the 2026-06-27 methodology amendment to PRD §4, capture both. Observed LCP (`audits.metrics.details.items[0].observedLargestContentfulPaint`) is the gating metric for in-sprint AC. Simulated LCP (`audits["largest-contentful-paint"].numericValue`) is captured for the perf delta report but is contaminated by the base64-in-DB image-storage pattern (lantern-model amplification) — a Phase 16 (post-sprint) architectural unlock.

**Pass criteria.** A complete Lighthouse report writes to disk with both Performance score + per-metric values. The runner notes the tier used per-step in the smoketest log, per the CONTRACT.

### Wire a real iOS device to local dev

Required for verifying Safari iOS-only regressions (Phase 2 viewport, mobile-app header imagery per Phase 14). Lighthouse mobile-profile does not catch viewport regressions reliably.

1. Connect the iOS device to the dev machine via USB. Trust the prompt on the device.
2. On the iOS device: Settings → Safari → Advanced → enable **Web Inspector**.
3. On the dev machine: Safari → Settings → Advanced → enable **Show Develop menu**.
4. Start the dev server (`./dev.sh attendee` or whichever app).
5. On the iOS device: open Safari, navigate to `http://<dev-machine-LAN-IP>:300X` (e.g., `http://192.168.1.42:3001`). The LAN IP is `ipconfig getifaddr en0` on macOS. The dev server binds to all interfaces by default; no `next dev -H 0.0.0.0` flag needed.
6. On the dev machine: Safari → Develop → `<iOS device name>` → the page is now inspectable. Layout debugging matches a real iOS render path.

**Fallback if no device.** Safari → Develop → Responsive Design Mode → choose an iOS 15+ profile. Useful for layout sanity checks but does not reproduce all iOS-specific quirks (smooth scrolling momentum, viewport-height behavior under URL-bar collapse, etc.).

**Pass criteria.** The target page renders on the iOS device; Safari Web Inspector on the dev machine shows the iOS render tree; layout looks correct (no horizontal scroll on a viewport-correct page, no text overflow).

### Run a Playwright smoketest

Phases 3, 5, 9, and 14 ship a Playwright-driven contract script at `docs/smoketests/playwright/phase-<N>-<title>.mjs`. The script drives a headless Chromium against a local production build to deterministically verify behavioral or timing contracts that Lighthouse cannot measure.

**One-time install** (per PRD §8.6 — already done on the engineer-of-record machine, included for cold-clone setup):

```bash
npx playwright install chromium
```

**To run a single script:**

```bash
# 1. Build and start the target app in production mode (Tier C).
pnpm --filter attendee build
pnpm --filter attendee start &      # or use a separate terminal
sleep 5                              # let the server settle

# 2. Run the script.
node docs/smoketests/playwright/phase-5-pwa-timeout-split.mjs

# 3. Stop the server.
kill %1
```

The script prints pass/fail per assertion to stdout, and exits non-zero on failure. The script is part of the per-phase smoketest evidence — its output is what the runner captures into the smoketest log.

**Pass criteria.** The script exits 0; each assertion logs a PASS line; the smoketest markdown records the run + the assertion summary per `docs/smoketests/CONTRACT.md`.

---

## Current deployment posture (descriptive)

The following procedures document how the four-app deployment works on Vercel as of the 2026-06-22 demo sprint. They are descriptive — for the engineer who needs to read or debug production, not for new platform-touching operations. A platform-policy decision is in flight (see [Open](#open) below); operational changes to the Vercel deployment are paused until that decision lands.

### Deploy a single app to production

Each app deploys as its own Vercel project. The four projects are `wbr` (attendee), `wbr-admin` (admin), `wbr-meetings`, and `wbr-sponsor`. Each project is configured with `apps/<app>/vercel.json`:

```json
{
  "buildCommand": "cd ../.. && npx turbo build --filter=<app>",
  "installCommand": "cd ../.. && corepack enable && pnpm install",
  "framework": "nextjs",
  "outputDirectory": ".next"
}
```

**How a deploy happens today.** Vercel auto-deploys from the `main` branch of the connected GitHub repo. A push to `main` triggers all four project builds in parallel; each project filters its build to its own app via Turbo. Preview deployments are issued automatically per pull request.

**Why each app is a separate Vercel project.** Per [`docs/decisions.md`](decisions.md) and [`docs/architecture.md`](architecture.md#deployment-topology): each app owns its env-var matrix, its custom-domain mapping, its build cache, and its build output. A failure in one app's build does not block the others. A four-into-one Vercel project would couple build cache invalidation across apps and lose this isolation.

### Add a custom domain on a Vercel project

The current vanity URL target is `wbr.tailor.tech` on the attendee project. The Phase 10 attempt to provision this domain captured the following mechanics for reference:

1. Vercel UI → project → Settings → Domains → Add Domain → enter the desired hostname → select Production environment.
2. Vercel returns one or two DNS records:
   - A **CNAME** for the routing target (current Vercel IP range value: `<hash>.vercel-dns-017.com.` — the legacy `cname.vercel-dns.com` still works as a fallback).
   - A **TXT** record at `_vercel.<parent-domain>` for ownership verification, if the domain is already linked to a different Vercel account.
3. The DNS records need to land on the domain's authoritative DNS zone. Tailor's `tailor.tech` zone lives in Google Cloud DNS and is operated by the Tailor JP SRE team via the `pf-sre` Slack channel.
4. Once the records propagate, Vercel verifies the domain (the "Verification Needed" red tag on the domain row clears) and provisions an HTTPS certificate automatically. Status moves to active.
5. The attendee app is now reachable at the vanity URL. Update `NEXTAUTH_URL` for the attendee Vercel project to the vanity URL if the production sign-in flow should be canonical at the vanity URL rather than at the `.vercel.app` URL.

The Phase 10 attempt halted at step 3 (DNS records not provisioned, pending the platform-policy decision). The captured CNAME + TXT pair is preserved in the session scratchpad for the engineer of record; the domain row on Vercel remains in "Verification Needed" state.

### Re-link a Vercel project to a different repo

Documented for the Phase 6 repo-migration mechanics (currently gated on the project-owner clicking the GitHub transfer button).

1. Document the project's current environment variables and integration settings before disconnecting. Vercel preserves env vars across re-link on the same project, but the snapshot removes ambiguity.
2. Vercel UI → project → Settings → Git → Disconnect.
3. Vercel UI → project → Settings → Git → Connect → select the new org/repo + branch.
4. Trigger a build via the Vercel UI (Deployments → Redeploy on the latest production deployment) to confirm the new connection produces a working build with the preserved env vars and settings.
5. Repeat for the other three projects in the same way.

**Pass criteria.** Each project's Deployments tab shows a green build from the new repo; the production URL serves traffic correctly; the previous `.vercel.app` URL continues to work (Vercel preserves URLs across re-link on the same project).

### Inspect production logs

Three paths, in order of immediacy.

**Vercel dashboard.** Project → Deployments → click the production deployment → Functions tab → click a function to see its recent invocations and per-invocation logs. The "Logs" tab on the deployment page shows the last hour of streamed logs.

**Vercel CLI.**

```bash
npx vercel login          # one-time per machine
npx vercel link           # one-time per repo clone; pick the project
npx vercel logs --follow  # stream live logs
```

The `--follow` flag tails like `tail -f`. Without it, the command prints the most recent logs and exits.

**Server-side print at startup.** Logs from server components and route handlers print to the function logs above. For startup-level diagnostics (e.g., confirming the active `dbConnectionMode`), add a `console.log` at the top of any server-side entry point — it surfaces in the Vercel logs on each function cold-start.

---

## Open

### Hosting platform decision — pending

The four-app Vercel deployment posture documented above is on hold pending a sponsor + exec platform-policy decision (status as of 2026-06-30 JST: not yet landed). The three options under sponsor + exec review:

1. Continue on Vercel with an exception granted for the 7/6 demo, with a commitment to migrate post-demo.
2. Migrate the four apps to the Tailor Platform (the sanctioned alternative) before 7/6.
3. Adjust the demo scope or schedule to fit within current platform policy.

This runbook will be extended with platform-specific deploy / custom-domain / re-link procedures for whichever option lands. Until the decision is made, the engineer-of-record's posture is to make no Vercel-touching operational changes; descriptive sections above (Deploy / Custom domain / Re-link / Production logs) describe how the existing deployment works without committing to new operations.

The detailed context lives in the engineer-of-record's local handoff doc (session-local, gitignored — not part of the committed repository). The decision itself, when it lands, will surface in [`docs/decisions.md`](decisions.md) → "Hosting platform — pending sponsor + exec decision."
