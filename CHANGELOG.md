# Changelog

Notable changes to the WBR conferencing app, newest first.

This file records **what changed and when**, with the commit that carries each change. Engineering *decisions* — what was chosen and why — live in [`docs/decisions.md`](docs/decisions.md) and, for architectural-grade ones, in [`docs/adr/`](docs/adr/). Per-change verification lives in [`docs/smoketests/`](docs/smoketests/).

---

## Bugs found during the onboarding and floor-plan work

Four defects were found while building onboarding enforcement across June and July 2026. All four predate that work — each was introduced during the original build of the four-app platform between 2026-04-27 and 2026-05-03, by the original codebase author. None was introduced by the onboarding work.

Each entry gives the commit that introduced the defect, verified with `git blame` against the code as it stood before the fix.

### Fixed

**An exhibitor could attach any account in the system to their own company.**
The address behind the "add a teammate" screen accepted an account identifier and wrote the caller's company onto it, with no check of who that account already belonged to. 

Measured: one company's representative moved a second company's representative onto their own company and received a success response.
Introduced in `40f29d9` (2026-04-27, "Major update: 4-app conference platform with full feature set"), `apps/sponsor/app/api/profile/teammates/route.ts`.
Fixed in `8e6df51` (2026-07-31). The write is now conditional on the target having no company or already being on the caller's team, evaluated by the database in one operation. A follow-up read distinguishes "no such account" (404) from "belongs to another company" (409).

**Colleague accounts created through the sponsor portal could never sign in to it.**
The "register a teammate" form created the new account with the delegate role, while the sponsor portal admits only the exhibitor-representative role and the event-operating roles, and both sign-in paths enforce that. An exhibitor filled in the form including a password, was told it succeeded, and the colleague was refused at sign-in. Measured on a deployed preview: creating returned 201, signing in returned 403.
Introduced in `19c175d` (2026-04-30, "Add teammate registration form to sponsor portal submissions page"), `apps/sponsor/app/api/profile/teammates/register/route.ts`.
Fixed in `8e6df51` (2026-07-31). Newly created colleague accounts receive the exhibitor-representative role. Accounts that already exist keep their role, because changing it would remove that person's access to the meetings portal and could not be undone by the exhibitor; both screens now state what they do and do not grant.

**A company's data stayed readable in the browser after the representative signed out.**
The sponsor portal saves everything it has fetched — including the buyer directory — into the browser's IndexedDB under one fixed key, so a return visit renders without refetching. The function that erases that store was written at the same time and never called by anything. Measured: 985,857 characters of one company's data still present after pressing the real Sign out button, readable through developer tools on a shared machine.

Introduced in `587d4a3` (2026-05-03, "Optimize sponsor portal performance: 1,536ms → 45ms avg page load"), `apps/sponsor/lib/query-client.tsx`. 

Note the ordering: the Sign out control was written on 2026-04-27, six days *before* this storage existed, and was not revisited when it was added.
Fixed in `8e6df51` (2026-07-31). Signing out empties the in-memory copy and erases the stored one; the sign-in page erases as well, which covers sessions that end by expiry or invalidation rather than by the button.

### Not fixed — partially addressed, remainder scheduled

**A representative moved between companies keeps acting as their previous company until they sign in again.**
The session token records the caller's company at sign-in and never changes, and request handlers read it from there rather than from the database. Measured: a person the database placed at one company approved a meeting request addressed to another.
This is a consequence of the session design recorded in [`docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md`](docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md), introduced in `40f29d9` (2026-04-27) in `apps/sponsor/lib/auth.ts`. It is a design choice with a documented trade-off rather than a single mistaken line.
**Four of nineteen addresses fixed** in `8e6df51` (2026-07-31) — the four behind the teammates screens now read the company from the database. Those four were brought forward because the colleague-role fix above turned the stale value from harmless into harmful: a moved representative could create a working account, with buyer-directory access, at the company they had left. Reproduced end to end before the change.
**Fifteen addresses remain.** Scheduled as a phase of its own; re-pointing them changes how every handler decides which company it is acting for, and that logic has no test coverage today.

---

## 2026-07-31

- **Sponsor portal: three carried defects closed** (`8e6df51`). The three "Fixed" entries above, plus the four-address partial fix. 31 automated checks, seven negative controls, three rounds of adversarial review. See [`docs/smoketests/phase-13-sponsor-portal-carried-issues.md`](docs/smoketests/phase-13-sponsor-portal-carried-issues.md).
- **Sponsor portal: request guard** (`bc99af1`, `a4296e6`). Nineteen request addresses refuse an exhibitor representative whose company profile is incomplete. See [`docs/smoketests/phase-6-sponsor-request-guard.md`](docs/smoketests/phase-6-sponsor-request-guard.md).
- **Sponsor portal: onboarding gate and checklist** (`6ef0d8d`, `8603a3c`). See [`docs/smoketests/phase-5-sponsor-screen-gate.md`](docs/smoketests/phase-5-sponsor-screen-gate.md).
- **Admin: open time slots widget** (`39deb8f`).
