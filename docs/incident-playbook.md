# Incident Playbook

Symptom-to-cause catalog for WBR. Each entry follows the same four-step shape: **Symptom** (what is observed) → **Check** (how to confirm the cause) → **Likely cause** (the hypothesis the check confirms) → **Mitigation** (what to do to restore service or work around the issue).

Use this doc when something is wrong and the question is "what is wrong and how do I get it working." For routine operational tasks that are not in response to a problem, use [`runbook.md`](runbook.md). For the architecture context behind a system that's failing, use [`architecture.md`](architecture.md). For "why is it this way," use [`decisions.md`](decisions.md).

Entries are grouped by domain. The order within each group is rough — there is no severity ranking implied. Some entries are operational gaps WBR ships with knowingly (see [Known limitations](architecture.md#known-limitations-and-operational-gaps) in `architecture.md`); those are flagged inline.

## Contents

- [Deployment](#deployment)
  - [1. Vercel build fails](#1-vercel-build-fails)
  - [2. Vanity URL down](#2-vanity-url-down)
- [Data layer](#data-layer)
  - [3. Database unreachable](#3-database-unreachable)
  - [4. Embedded-replica stale read](#4-embedded-replica-stale-read)
- [Auth](#auth)
  - [5. Auth broken — user cannot log in](#5-auth-broken--user-cannot-log-in)
  - [6. Session cookie expiry](#6-session-cookie-expiry)
  - [7. Multi-app cross-login confusion](#7-multi-app-cross-login-confusion)
- [AI surfaces](#ai-surfaces)
  - [8. AI provider returns 429 or 5xx](#8-ai-provider-returns-429-or-5xx)
- [Email](#email)
  - [9. Email send fails with 503 — no integration configured](#9-email-send-fails-with-503--no-integration-configured)
- [PWA](#pwa)
  - [10. PWA serves stale content after deploy](#10-pwa-serves-stale-content-after-deploy)
- [Known limitations](#known-limitations)
  - [11. Sponsor rate limiter does not actually rate-limit](#11-sponsor-rate-limiter-does-not-actually-rate-limit)
- [Local development](#local-development)
  - [12. Local dev DB out-of-sync after schema change](#12-local-dev-db-out-of-sync-after-schema-change)
  - [13. Stray dev processes on ports 3000–3003](#13-stray-dev-processes-on-ports-30003003)

---

## Deployment

### 1. Vercel build fails

**Symptom.** A push to `main` produces a red check on the affected project's Vercel deployment. The production URL keeps serving the previous successful build; the failing build never promotes.

**Check.** Open the failing deployment in the Vercel dashboard → Build Logs. Look for the first non-zero exit line:

- `Error: Cannot find module '@conference/db'` or similar — workspace package resolution failed.
- `prisma generate ... ENOENT` — the postinstall hook (`prisma generate --schema=packages/db/prisma/schema.prisma`) didn't find the schema.
- A build-time runtime error from a server component (e.g., reading an env var that wasn't set).
- An out-of-memory failure (Vercel build worker has finite RAM).

**Likely cause.**

| Build log says | Cause |
|---|---|
| Module resolution / missing workspace | `installCommand` didn't run pnpm at repo root — check that `cd ../.. && corepack enable && pnpm install` is the install command per `apps/<app>/vercel.json` |
| Prisma schema not found | Postinstall ran from the wrong working directory; the root `package.json:7` postinstall expects the schema at `packages/db/prisma/schema.prisma` |
| Server-component reads undefined env | An env var that the build reads (e.g., during SSR or a `getStaticProps` analogue) is missing from the Vercel project's env config |
| OOM | A large server bundle or a generation step exhausts Vercel's build worker |

Note that **type errors and lint errors do NOT fail the build** — every `next.config.js` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` ([`architecture.md` → Build behavior](architecture.md#build-behavior)). A red build means the build pipeline itself failed, not a static analysis check.

**Mitigation.**

- Module / Prisma errors: reproduce locally with `pnpm install && pnpm --filter <app> build`. Fix the workspace or schema reference; re-push.
- Missing env: add the variable on the affected Vercel project (Project → Settings → Environment Variables) and redeploy via Deployments → Redeploy on the last green build, then re-push to retry the failing commit.
- OOM: split the offending build step, lazy-load a heavy import, or escalate to a higher build worker tier in Vercel project settings.

### 2. Vanity URL down

**Symptom.** A user reports `https://wbr.tailor.tech` (or another custom domain on a Vercel project) returns a Vercel error page, a certificate error, or fails to resolve.

**Check.** In order:

1. `dig wbr.tailor.tech` — does DNS resolve? If `NXDOMAIN` or no answer section, the DNS record is missing or has not propagated.
2. `curl -vsI https://wbr.tailor.tech` — does TLS terminate? Look for a `Could not resolve host` (DNS issue) vs a certificate error (TLS issue) vs a Vercel 4xx/5xx (routing reached Vercel).
3. Vercel UI → project → Settings → Domains — is the row green ("Valid Configuration") or red ("Verification Needed")? A red row means Vercel believes the DNS records are not pointing at it.
4. Same Vercel UI row → expand → does the displayed expected DNS record match what `dig` returns?

**Likely cause.**

| Check result | Cause |
|---|---|
| `dig` returns nothing | DNS record never landed or was removed at the authoritative zone |
| `dig` returns a wrong target | Stale CNAME or A record points somewhere else |
| Vercel row red, DNS row green | The TXT verification record at `_vercel.<parent>` was never added (anti-hijacking — required when the domain was linked to a different Vercel account) |
| Certificate error | Vercel did not provision a cert (domain not verified yet) or the cert is mid-rotation |
| 4xx from Vercel | The domain is verified but is not assigned to the production environment — check Settings → Domains → environment scope |

**Mitigation.**

The `tailor.tech` DNS zone is operated by Tailor JP SRE on Google Cloud DNS. DNS record changes go through the `pf-sre` Slack channel ([context](decisions.md) → "Hosting platform — pending sponsor + exec decision").

- DNS missing or wrong: capture the expected record verbatim from the Vercel UI; relay to Tailor JP SRE via the established channel.
- TXT verification missing: same path — Vercel will display both CNAME and TXT when verification is needed; both must land.
- Vercel-side scope mismatch: domain is on a non-production environment; reassign in the Vercel UI.

While the platform-policy decision is in flight ([decisions.md → Hosting platform — pending](decisions.md)), **do not make new Vercel-side or DNS-side operational changes** without sponsor + exec sign-off. Read-only diagnosis is fine.

---

## Data layer

### 3. Database unreachable

**Symptom.** Production requests that touch the database (most routes other than `/login`) return a 500. Logs show Prisma errors like `Can't reach database server`, `Connection terminated`, or `LIBSQL_HTTP: ECONNREFUSED`.

**Check.**

1. Vercel function logs (per [`runbook.md` → Inspect production logs](runbook.md#inspect-production-logs)) — capture the exact error and the affected route.
2. `dbConnectionMode` value at startup of the affected function — log it via `console.log('[startup] db mode:', dbConnectionMode)` if not already; this confirms the multi-mode client made it past initialization.
3. Turso dashboard — is the database showing as healthy? Are there usage spikes or hard limits hit?
4. Try a direct connection: `turso db shell <database-name>` against the same URL. If this fails, the issue is on Turso; if it succeeds, the issue is the integration.

**Likely cause.**

| Signal | Cause |
|---|---|
| `dbConnectionMode === 'turso-failed: <reason>'` | The libSQL adapter initialization threw at startup. The reason string in the value names the specific failure |
| Turso dashboard shows outage or rate-limit | Turso-side incident; not actionable from our side beyond waiting |
| `turso db shell` works; Vercel does not | Credentials mismatch — `TURSO_AUTH_TOKEN` on the project does not match the active token on the database |
| `dbConnectionMode === 'turso-embedded-replica'` in production | Misconfiguration — production should be `turso-http` because the `VERCEL` env var routes the client to the HTTP path. If this fires in production, the `VERCEL` env was not set, which suggests the function is running outside Vercel |

**Mitigation.**

- Credentials mismatch: rotate via [`runbook.md` → Rotate Turso auth token](runbook.md#rotate-turso-auth-token). Confirm `dbConnectionMode === 'turso-http'` post-deploy on each project.
- Turso outage: no engineer-side action; wait. Surface the incident timing in the customer comm if the demo is affected.
- Other: capture the exact error string and the `dbConnectionMode` value before escalating.

### 4. Embedded-replica stale read

**Symptom.** Local development against a Turso-backed branch returns data that is older than what the Turso dashboard shows. Refreshing the page or restarting the dev server makes the new data appear.

**Check.** Confirm the mode: log `dbConnectionMode`. If the value is `turso-embedded-replica`, the local Prisma client is reading from `file:/tmp/turso-replica.db` and syncing back to Turso on a 60-second interval ([`packages/db/src/client.ts:44`](../packages/db/src/client.ts)).

**Likely cause.** The 60-second sync interval is intentional — it gives local dev SQLite-speed reads at the cost of brief staleness after a write. The `$extends` query guard ([`client.ts:62–77`](../packages/db/src/client.ts)) awaits the initial sync on first read and triggers a background sync after every write operation, but the per-request guard does not block subsequent reads on completion of that background sync.

**Mitigation.**

- For a one-off stale-read moment: wait up to ~60s and reload. The next sync interval cycle will catch up.
- For development workflows that need read-after-write determinism: unset Turso env vars locally and use `DATABASE_URL="file:./packages/db/prisma/dev.db"` instead. That puts `dbConnectionMode === 'sqlite: file:...'` and removes the replica layer entirely. Trade-off: you lose access to remote dataset state, but reads and writes are atomic.
- For confirming that the embedded replica is actively syncing: tail the dev-server stdout — `[prisma] Embedded replica synced` is logged after the initial sync.

---

## Auth

### 5. Auth broken — user cannot log in

**Symptom.** Login attempts fail with one of: a redirect loop, a 401 from `/api/auth/callback/credentials`, a 401 from `/api/auth/callback/google`, or a "Configuration" error from NextAuth on a page reload.

**Check.**

1. Which provider? Credentials (email/password) or Google? Symptom tells you.
2. For credentials: check the Vercel function logs for the affected route around the failed login timestamp. NextAuth's credentials provider logs an error if `verifyPassword` returns false.
3. For Google: open the login page, click "Continue with Google," observe the URL the browser lands on. A redirect back to `/login` with `error=...` in the URL points at NextAuth's signIn callback rejecting; a Google-side error page (e.g., "Access blocked" or invalid client) points at the OAuth client configuration.
4. For "Configuration" errors: `NEXTAUTH_SECRET` is unset or differs between the four apps. Verify the value on each Vercel project.

**Likely cause.**

| Detail | Cause |
|---|---|
| Credentials provider rejects a known-good password | `User.password` hash format is malformed, or the cost-factor field is missing and the fallback to `N=16384` does not match the original hash's actual cost. See `verifyPassword` at [`packages/db/src/index.ts:24`](../packages/db/src/index.ts) |
| Google callback redirects with `error=AccessDenied` to `apps/web` (admin) | The signing-in email does not map to an existing `User` row whose `role` is one of `STAFF`, `ORGANIZER`, or `ADMIN`. The admin app's `signIn` callback (`apps/web/lib/auth.ts:43, 68`) gates by the row's `role` value — not by an env-var allowlist. The `ADMIN_EMAILS` env var documented in `.env.local.example` is currently not read by any runtime code |
| Google callback errors on `apps/{attendee,meetings,sponsor}` | OAuth client misconfiguration — the redirect URI for the app's URL is not in the Google Cloud client's authorized redirect URIs |
| "Configuration" error on every app | `NEXTAUTH_SECRET` unset or differs across the four projects; or `NEXTAUTH_URL` does not match the deployed origin |
| All four apps were working; one starts failing after a credential update | Mismatched secret rotation — only some projects got the new value |

**Mitigation.**

- Credentials hash format: regenerate the hash with `hashPassword` ([`index.ts:36`](../packages/db/src/index.ts)). Update the `User.password` value directly via Prisma Studio.
- Admin role gate: update `User.role` to `STAFF`, `ORGANIZER`, or `ADMIN`. For local SQLite, use Prisma Studio (see [`runbook.md` → Inspect database state](runbook.md#inspect-database-state)). For Turso production data, use `turso db shell <database-name>` or the Turso web dashboard — Prisma Studio is SQLite-only and cannot connect to libSQL. The next sign-in attempt will succeed. Setting `ADMIN_EMAILS` in the env will not help — no runtime code reads it today.
- OAuth redirect: edit the Google Cloud Console OAuth client → Authorized redirect URIs → add `<app URL>/api/auth/callback/google`.
- `NEXTAUTH_SECRET` mismatch: per [`runbook.md` → Rotate NEXTAUTH_SECRET](runbook.md#rotate-nextauth_secret-cross-app), ensure all four projects share the same value, then redeploy each.

### 6. Session cookie expiry

**Symptom.** A user reports they were "logged out" without an explicit logout. Hitting the app sends them back to `/login`.

**Check.** NextAuth issues JWT sessions with a 30-day expiry on the `next-auth.session-token` cookie. DevTools → Application → Cookies → check the cookie's expiry date. If the cookie is present but past expiry, NextAuth will treat the user as anonymous.

**Likely cause.**

- 30-day TTL reached. Expected behavior.
- The cookie was cleared by a browser action (private browsing, "clear site data," browser settings sync to a different cookie state).
- A `NEXTAUTH_SECRET` rotation invalidated all existing sessions across all four apps (intended side-effect of rotation — see [Mitigation](#5-auth-broken--user-cannot-log-in) on (5) above and [`runbook.md` → Rotate NEXTAUTH_SECRET](runbook.md#rotate-nextauth_secret-cross-app)).

**Mitigation.** Have the user log in again. The fresh JWT issues with a new 30-day TTL.

The 30-day duration is the NextAuth default; if a different duration is needed for compliance or UX, it would be set per-app on `authOptions.session.maxAge` in `apps/<app>/lib/auth.ts`. No app currently overrides this.

### 7. Multi-app cross-login confusion

**Symptom.** A user reports they "logged in" but a second WBR app still asks them to log in. Or: a new engineer asks "why does the admin login not work for the attendee app?"

**Check.** Confirm the user is hitting different apps (different ports locally; different `.vercel.app` URLs or vanity URLs in production). The four apps are independent: `apps/web` (3000), `apps/attendee` (3001), `apps/meetings` (3002), `apps/sponsor` (3003).

**Likely cause.** The four apps share `NEXTAUTH_SECRET` and the same `User` table, but **each app issues its own JWT session cookie**. There is no single-sign-on across the four. A login on the admin app does not produce a usable session on the attendee app, even though both apps trust the same secret and read the same database. Cookies are scoped to the issuing app's domain.

This is by design ([`architecture.md` → Cross-app identity](architecture.md#cross-app-identity)). Centralizing identity into a single auth gateway is not on the demo-sprint roadmap.

**Mitigation.** No fix — explain to the user (or new engineer) that each app requires its own login. The same credentials work everywhere, but each app sets its own cookie.

If the multi-login UX becomes a recurring customer complaint, the architectural unlock is a shared auth gateway with per-app token exchange. That is a Phase-2-shaped piece of work, not in any current sprint.

---

## AI surfaces

### 8. AI provider returns 429 or 5xx

**Symptom.** An AI-powered admin feature (e.g., the sponsor-reminder personalization in `apps/web`) returns a generic error in the UI. Vercel logs show a 429 (rate limit) or 5xx (provider outage) from the OpenAI SDK call.

**Check.**

1. Vercel `wbr-admin` logs around the timestamp of the failed request — look for the `openai` package's error message and the HTTP status code returned by the SDK.
2. OpenAI dashboard → Usage → check whether the project is at or near its rate or spend limit.
3. OpenAI status page (`status.openai.com`) — confirm there is no provider-side incident.

**Likely cause.**

| Signal | Cause |
|---|---|
| 429 with rate-limit headers | The OpenAI account hit its requests-per-minute or tokens-per-minute limit |
| 429 with spend-limit message | The OpenAI account hit a soft or hard spend cap |
| 5xx with no rate-limit headers | OpenAI-side outage or transient failure |
| 401 | `OPENAI_API_KEY` is invalid or was revoked |

**Mitigation.**

- Rate limit: wait for the limit to reset (rate limits roll on a minute window; spend limits roll on a billing period). For chronic rate-limit pressure, escalate to the OpenAI dashboard for a higher tier.
- Outage: surface the incident in the user-facing surface (the AI button degrades to a no-op or a placeholder); no engineer-side fix.
- 401: rotate the key per [`runbook.md` → Rotate the OpenAI API key](runbook.md#rotate-the-openai-api-key-admin-app-only).

The AI surface is designed to degrade gracefully (per PRD §6 Phase 12 constraints — feature flag, timeout, fallback UI). If a failure surface bypasses graceful degradation, that is a code bug, not an incident.

---

## Email

### 9. Email send fails with 503 — no integration configured

**Symptom.** An admin attempts to send an email from the email composer in `apps/web`. The send returns HTTP 503 with the body `{ "error": "No email integration configured. Connect Gmail or Outlook in Integrations." }`. The user-facing UI surfaces an error. No recipient receives the message.

**Check.**

1. Query `EmailLog` for the most recent row — `status` reads `FAILED` (not `SENT`). `apps/web/app/api/email/send/route.ts:62–65` writes the `FAILED` row and returns the 503 explicitly when no transporter is available.
2. Check the `Integration` table — is there a row with `provider` in (`GMAIL`, `OUTLOOK`) and `status` equal to `CONNECTED`? Without one, `getTransporter()` returns null and the route handler short-circuits.
3. If an integration exists but the token has expired, the transporter creation path may throw — server logs show the underlying transporter error before the 503 surfaces.

**Likely cause.** WBR does not currently have a transactional email service. Outbound mail goes via a user-configured Gmail or Outlook OAuth `Integration` ([`architecture.md` → Known limitations](architecture.md#known-limitations-and-operational-gaps)). Without a connected integration, the API rejects the send fast (no silent drop — the failure is explicit at both the API and the `EmailLog` layer).

**Mitigation.**

- Short-term: configure or refresh a Gmail / Outlook `Integration` for the sending mailbox via the admin Settings → Integrations page. After a successful OAuth round-trip, the row appears in `Integration` with `status: 'CONNECTED'` and the send path resumes.
- Long-term: this is an acknowledged gap. A managed transactional provider (Resend, Postmark, SendGrid) is a Phase-2-shaped follow-up that closes both the OAuth-token-rot surface and the deliverability gap.

---

## PWA

### 10. PWA serves stale content after deploy

**Symptom.** A user reports the attendee app shows old content even after a new deploy. Other users see the new content. Refreshing the page does not help.

**Check.**

1. The user is on the attendee app (other apps don't have a service worker). Confirm by app.
2. DevTools → Application → Service Workers — what version is active? Is "skipWaiting" pending?
3. DevTools → Application → Cache Storage — inspect `pages` and image-class caches. Is the cached entry's `Date` header older than the deploy time?
4. Network panel — does the failing request show `from ServiceWorker` or `from disk cache`?

**Likely cause.** Service worker held a stale page response in the `pages` cache (NetworkFirst with a 5s timeout — falls back to cache when the network does not respond in time). If the SW handed a stale page response back, subsequent navigations may stay stuck on the cached version until the next time the network returns within 5s.

The cache rules and order are documented in [`runbook.md` → Tune NetworkFirst timeout thresholds](runbook.md#tune-networkfirst-timeout-thresholds). Page rules and the `_next/data` rule are NetworkFirst with `networkTimeoutSeconds: 5`. Image-class rules are `StaleWhileRevalidate` and intentionally serve cached content (with background revalidation).

**Mitigation.** Have the user perform one of these:

- **Hard reload** — Cmd+Shift+R (or hold Shift while clicking reload). Bypasses the service worker for this request.
- **Clear site data** — DevTools → Application → Storage → Clear site data → check "Service workers" and "Cache storage." Forces re-registration of the SW from the latest deploy.
- **Wait and try again** — the SW will revalidate on the next successful network response within the rule's timeout.

For an outage-level stale-cache event affecting many users: ship a no-op deploy that bumps the SW version (the SW filename includes a hash; any rebuild produces a new one). Users will pick up the new SW on their next page load. This is the most reliable cache-bust mechanism.

---

## Known limitations

### 11. Sponsor rate limiter does not actually rate-limit

**Symptom.** Repeated requests to a rate-limited endpoint in `apps/sponsor` are accepted past the documented threshold. No 429 responses fire.

**Check.** Read the sponsor app's rate-limit middleware or helper — the limiter holds state in an in-memory Map in the function scope.

**Likely cause.** The limiter is **in-memory** but `apps/sponsor` runs on Vercel's multi-instance serverless runtime. Each function instance has its own Map; requests routed to different instances see different counter state. Effective rate per instance, multiplied across the instance pool, means the documented "N requests per minute" cap is not enforced at the application level. **This is a known limitation** ([`architecture.md` → Known limitations](architecture.md#known-limitations-and-operational-gaps)) — WBR ships with it knowingly because the demo-audience scale does not trigger abuse and a proper Redis-backed limiter is a Phase-2-shaped follow-up.

**Mitigation.** No live mitigation while WBR runs on Vercel. The correct fix is a shared backing store (Upstash Redis or equivalent — available via Vercel Marketplace). Until that lands, do not rely on the limiter for security-grade rate enforcement.

Vercel's platform-level firewall provides a separate layer of abuse-resistance independent of the app code; if rate-limiting becomes load-bearing before the Redis backing lands, escalate the platform-firewall config rather than rewriting the app limiter.

---

## Local development

### 12. Local dev DB out-of-sync after schema change

**Symptom.** After pulling a branch that changed `packages/db/prisma/schema.prisma`, the dev server throws Prisma errors like `Unknown field 'newField'` or `Table 'NewModel' does not exist`. Or: a `pnpm typecheck` run fails on a model that the schema says exists.

**Check.**

1. Did the schema change since the last `prisma db push` or `prisma generate`? `git diff main -- packages/db/prisma/schema.prisma`.
2. Is the local `dev.db` older than the schema? `stat packages/db/prisma/dev.db packages/db/prisma/schema.prisma`.
3. Is the Prisma client out of date? Run `pnpm db:generate` and check whether the generated types changed.

**Likely cause.** WBR uses `prisma db push` for schema management — there is no migration history ([`architecture.md` → Known limitations](architecture.md#known-limitations-and-operational-gaps)). Pulling a branch with schema changes does **not** automatically update the local SQLite database; the dev environment thinks the schema is whatever was last `db:push`-ed.

**Mitigation.** Run the canonical reset path:

```bash
pnpm db:push     # apply current schema to dev.db
pnpm db:generate # regenerate the Prisma client types
```

If data is needed: `pnpm db:seed` after `db:push`. If you have local data you want to keep, export it before `db:push` (the push is non-destructive for compatible changes, but breaking schema changes — column type swaps, table renames — can drop data without warning).

The full clean-start procedure lives in [`runbook.md` → Reset the local dev database](runbook.md#reset-the-local-dev-database).

### 13. Stray dev processes on ports 3000–3003

**Symptom.** `./dev.sh` reports "Address already in use" or one of the apps fails to bind to its port. Or: the listed-running apps in `dev.sh`'s output don't match what's actually reachable in the browser.

**Check.**

```bash
lsof -i :3000  # repeat for 3001, 3002, 3003
```

A line with `node` or `next-server` in it means an orphan Next.js process is still bound to the port. This is most common after a previous `./dev.sh` was killed mid-startup (Cmd+C during the 8-second sleep before the readiness message), or after a crash that did not propagate to the parent shell.

**Likely cause.** Background dev processes spawned by `./dev.sh` outlive the launcher if killed before the launcher cleans them up. The launcher only kills processes on these ports at start-of-run (`kill -9 $(lsof -ti:PORT)` in `dev.sh`), not at exit.

**Mitigation.**

```bash
./clean.sh                # kills all four ports + clears all .next/
./dev.sh                  # re-launch
```

If `./clean.sh` does not free a port (the process is bound to a slightly different port number, or `lsof` cannot see it):

```bash
lsof -i :3001                       # find the offending PID
kill -9 <PID>                       # remove it manually
ps aux | grep next-server | grep -v grep   # check for stragglers across all ports
```

If the same PID keeps reappearing, a parent process (a stale `pnpm` or `turbo` wrapper) is respawning workers. Find that parent (`ps -o ppid= -p <PID>`) and kill it first.
