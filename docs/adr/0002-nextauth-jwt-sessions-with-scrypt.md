# ADR 0002 — NextAuth v4 with JWT sessions and scrypt password hashing

- **Status:** Accepted (current state, since 2026-06)
- **Date:** 2026-06-08 (initial codebase recon)
- **Supersedes:** None
- **Superseded by:** None

## Context

WBR needs authentication across [four independent apps](0001-monorepo-of-four-nextjs-apps.md) that share a single `User` table. The auth posture had to support:

- Email/password credentials (the primary path for the demo audience — pre-seeded test accounts).
- Google OAuth (a secondary path; the demo audience may sign in with their corporate Google identity).
- Cross-app credential consistency — the same email/password works on all four apps, even though each app issues its own session.
- Server-side rendering in Next.js App Router — auth state needs to be available in server components and route handlers without a per-request DB round-trip on the hot path.
- No managed identity provider — keeping auth in-tree avoids a third-party dependency (Auth0, Clerk, etc.) for a project that is still on personal infrastructure as of the demo sprint.

Two structural choices were debated:

1. **JWT session strategy** — the session cookie carries the user identity, signed by `NEXTAUTH_SECRET`. No DB round-trip to verify a session; the trade-off is that revoking a single user's session requires either short TTLs or a revocation list.
2. **Database session strategy** — the session cookie is an opaque ID; the DB holds the session record. Verifying a session is a DB round-trip per authenticated request. Revocation is a single DB write.

For the password-hash algorithm, three options were considered:

- **scrypt** (Node built-in via `crypto.scrypt`) — no native module dependency, supports a configurable cost factor.
- **bcrypt** (`bcryptjs` or `bcrypt`) — well-known, requires a native module for the high-performance path.
- **argon2** (`argon2`) — modern and KDF-of-record for new projects, requires native binding.

## Decision

WBR uses **NextAuth v4.24** in every app with the **JWT session strategy** (`session: { strategy: 'jwt' }`). Each app mounts NextAuth at `app/api/auth/[...nextauth]/route.ts` and exports `authOptions` from `lib/auth.ts`.

**Two providers** are configured everywhere:

- **`CredentialsProvider`** — verifies email + password against the `User` table using the project's own `verifyPassword` helper.
- **`GoogleProvider`** — verifies an OAuth token from Google. On successful Google sign-in:
  - In attendee / meetings / sponsor: auto-create a `User` row with role `ATTENDEE` if no row exists for the email.
  - In admin (`web`): the `signIn` callback rejects the sign-in unless the email already maps to a `STAFF` / `ORGANIZER` / `ADMIN` user row. This is the admin role gate.

**Password hashing uses Node's built-in `scrypt`** at cost factor `N = 2048` (8× faster than Node's default `N = 16384`, deliberate trade-off for the demo audience scale). The stored hash format encodes the cost factor inline so legacy hashes can verify against the fallback default:

```
<hex-hash>.<salt>.<N>
```

If the cost suffix is absent (legacy format), `verifyPassword` falls back to `N = 16384` automatically. The implementation lives in `packages/db/src/index.ts`:

```ts
export async function verifyPassword(password: string, hash: string): Promise<boolean>
export async function hashPassword(password: string): Promise<string>
```

**Session cookie:** `next-auth.session-token`. HTTP-only, secure in production, SameSite=Lax, 30-day expiry (NextAuth default — no override).

**Shared secret:** all four apps consume the same `NEXTAUTH_SECRET` so JWTs issued by one app are *technically* readable by the others (this enables cross-app debug tooling that the project does not currently use). Cookies are nonetheless scoped per app's domain, so a login on app A does not produce a usable session on app B.

## Consequences

**Easier:**

- **No DB round-trip to verify a session.** The JWT carries the user ID + role; the middleware (or `getServerSession`) verifies the signature with `NEXTAUTH_SECRET` and returns the identity. Critical-path latency improvement on every authenticated request.
- **Same credentials work everywhere.** The four apps share `User` and `NEXTAUTH_SECRET`. A user with a password registers once; the credential verifies against all four apps.
- **No native module dependency.** scrypt is in Node's standard library — works without rebuilds across Linux / macOS / Windows / Vercel deployment.
- **Cost-encoded hashes are migration-safe.** Re-hashing all existing passwords during a cost-factor change is not required; legacy and new hashes coexist indefinitely.
- **Per-app gating posture is explicit.** The admin app's `signIn` callback runs role-gate logic in code, not in a global config; the other three apps are open to any valid credential and gate features post-login.

**Harder:**

- **No SSO across the four apps.** Each app issues its own JWT cookie scoped to its own origin. Users sign in to each app independently. See [`incident-playbook.md` → Multi-app cross-login confusion](../incident-playbook.md#7-multi-app-cross-login-confusion). The architectural unlock would be a shared identity gateway with per-app token exchange — Phase-2-shaped work, not in any current sprint.
- **`NEXTAUTH_SECRET` rotation invalidates every session across all four apps atomically.** Documented in [`runbook.md` → Rotate NEXTAUTH_SECRET](../runbook.md#rotate-nextauth_secret-cross-app). There is no graceful overlap mechanism — every logged-in user must log in again after a rotation.
- **JWT cannot be revoked individually.** A user whose JWT was stolen has to wait for the 30-day expiry, or every user's session must be invalidated via `NEXTAUTH_SECRET` rotation. For the demo audience scale this is acceptable; production usage at scale would want a revocation list (database session strategy, or an additional token-version field in `User`).
- **Lower scrypt cost (N=2048) is below the "production-grade" bar of N=16384+.** This is a deliberate scale trade-off — the demo audience is small and known, brute-force attack surface is minimal. If WBR scales to client-facing use, the cost factor should rise, and the cost-encoded hash format makes that transition lossless.
- **Per-app NextAuth duplication.** Four `lib/auth.ts` files; four `middleware.ts` files; four `app/api/auth/[...nextauth]/route.ts` mounts. Inherits from [ADR 0001](0001-monorepo-of-four-nextjs-apps.md). A change to auth posture (e.g., adding a new provider) is a four-place edit.
- **The middleware-pattern split.** Two of the four apps (meetings, sponsor) use request-header forwarding to surface identity to route handlers; the other two (attendee, web) use response-header-only and re-derive identity via `getServerSession` in handlers. This is a source of cognitive load when adding new route handlers — described in [`architecture.md` → Middleware](../architecture.md#middleware-appsappmiddlewarets).

**Neutral but worth knowing:**

- The `User.role` column is a **free-form string**, not a Prisma enum. Values used in practice: `ATTENDEE`, `SPEAKER`, `ORGANIZER`, `STAFF`, `ADMIN`. The schema comment only lists the first three. Captured in [`architecture.md` → User roles](../architecture.md#user-roles).
- The "sponsor user" is **not a role**. It is `User.sponsorId` populated with a `Sponsor.id`. The user's role typically remains `ATTENDEE`. The sponsor portal gates by the presence of `sponsorId`, not by role.
- The Google OAuth client referenced by the codebase was flagged as a **placeholder** during the 2026-06-26 sprint kickoff call. PRD §5 footnote captures this — confirm the client is real before relying on "Continue with Google" for the demo path.

## References

- [`packages/db/src/index.ts`](../../packages/db/src/index.ts) — `verifyPassword` + `hashPassword` implementations.
- [`architecture.md` → Identity and auth](../architecture.md#identity-and-auth) — cross-cutting auth model.
- [`architecture.md` → Middleware](../architecture.md#middleware-appsappmiddlewarets) — per-app middleware patterns.
- [`runbook.md` → Rotate NEXTAUTH_SECRET](../runbook.md#rotate-nextauth_secret-cross-app) — cross-app rotation procedure.
- [`runbook.md` → Rotate Google OAuth credentials](../runbook.md#rotate-google-oauth-credentials).
- [`incident-playbook.md` → Auth broken](../incident-playbook.md#5-auth-broken--user-cannot-log-in).
- [`decisions.md` → Architecture](../decisions.md#architecture) — index entry.
- [ADR 0001](0001-monorepo-of-four-nextjs-apps.md) — the monorepo split this ADR's per-app duplication inherits from.
