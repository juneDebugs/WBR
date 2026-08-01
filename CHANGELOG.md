# Changelog

Notable changes to the WBR conferencing app, newest first.

This file records **what changed and when**, with the commit that carries each change. Engineering *decisions* — what was chosen and why — live in [`docs/decisions.md`](docs/decisions.md) and, for architectural-grade ones, in [`docs/adr/`](docs/adr/). Per-change verification lives in [`docs/smoketests/`](docs/smoketests/).

---

## Bugs found during the onboarding and floor-plan work

Eight defects were found while building onboarding enforcement across June, July and August 2026. All eight predate that work — each was introduced during the original build of the four-app platform between 2026-04-27 and 2026-05-03, by the original codebase author. None was introduced by the onboarding work.

Each entry gives the commit that introduced the defect, verified with `git blame` against the code as it stood before the fix.

*Was four until 2026-08-01, and was briefly published as five. Four entries were added that day, not one: two defects found while writing the assertions for the stale-company fix, and two that had been recorded in earlier phases' review logs and never reached this file. The figure of five counted only one of the first pair and neither of the second. Corrected here rather than quietly edited, because the wrong number was published and someone may have read it.*

### Fixed

**One exhibiting company could change another company's submission responses.**
The address that sets a response's status takes two identifiers — the form and the response — and validated them independently. It confirmed the form belonged to the caller's company, then updated the response by its own identifier alone, never checking the response was one of that form's. Pairing your own form with somebody else's response passed both checks.

Measured with two representatives each correctly signed in at their own company, so this needed no stale session and no privileged position: company A sent its own form identifier with company B's response identifier, received 200, and company B's response went from PENDING to ACCEPTED. A control using company A's own response also succeeded, confirming the result was not an artefact of a malformed request.
Introduced in `40f29d9` (2026-04-27, "Major update: 4-app conference platform with full feature set"), `apps/sponsor/app/api/submissions/[id]/submissions/[subId]/route.ts`. A later commit changed only the parameter syntax and left the missing check untouched.
Fixed in `f00e9df` (2026-08-01). The write is scoped to the form as well as the response, and a pair that does not match answers 404 — the same answer the handler already gave when the form itself was not the caller's, so the two ways of getting it wrong are indistinguishable and neither confirms that another company's response exists.

**Editing or deleting another company's submission form answered "success".**
Both addresses applied the company filter inside the write itself, so a caller who did not own the form received `200 {"ok":true,"count":0}` on an edit and `200 {"ok":true}` on a delete, with the form untouched. The data was safe; the answer said the opposite. Measured 2026-08-01.
Introduced in `40f29d9` (2026-04-27), `apps/sponsor/app/api/submissions/[id]/route.ts`.
Fixed in `f00e9df` (2026-08-01). Both answer 404, matching what reading the same form already answered. Verified first that the portal's own screen tests only whether the response succeeded and never reads the count, so it keeps behaving correctly.

**An exhibitor could attach a WBR-side account to their own company, and was shown a list inviting it.**
A WBR-side account is one holding a role that operates the event rather than exhibits at it — `WBR`, `ORGANIZER`, `ADMIN` or `STAFF`, the four roles listed in `packages/db/src/app-access.ts`.

Two faults with one cause: nothing decided which kinds of account an exhibitor may add. The list offered by the "add a teammate" screen contained every account with no exhibiting company and any role except organizer, so it included staff and administrator accounts. Separately, the "register a teammate" address links an account when the posted email matches one that already exists, and it never asked what kind of account that was.

**Which way the access moves, stated plainly, because an earlier description of this had it backwards.** The WBR-side account gains a link to the exhibitor's company. No role changes, and the exhibitor gains no WBR-side access at all. What happens is that a WBR-side account starts counting as a member of an exhibiting company.

Measured before the fix: posting a staff account's email to the registration address attached it and answered `200`. That path went around both the list the screen shows and the identifier-based attach address, which Phase 13 had already hardened.
Introduced in `40f29d9` (2026-04-27) for the offered list and the identifier-based attach, `apps/sponsor/app/api/profile/sponsor-data/route.ts` and `apps/sponsor/app/api/profile/teammates/route.ts`; and in `19c175d` (2026-04-30, "Add teammate registration form to sponsor portal submissions page") for the registration address, `apps/sponsor/app/api/profile/teammates/register/route.ts`.
Fixed in `f00e9df` (2026-08-01). One rule in `apps/sponsor/lib/addable-teammate.ts` decides which roles an exhibitor may add, and all three places consult it rather than each keeping its own copy. The role refusal sits above every question about the account's current company, so an account already attached by this defect is still refused instead of matching an earlier branch. The registration path was found by adversarial review round 1 and the ordering by round 3.

**A signed-out visitor could reach an admin page whose address happened to end in an image extension.**
The admin app's rule for what skips the signed-in check tested the whole address against a list of image file endings, instead of naming the folders images actually live in. Any page whose last part ended in `.png` was skipped too — and the company page takes its last part from the address.

Measured: `/dashboard/sponsors/anything.png` answered `200` with no session. It rendered an empty page and returned no company data, so this was a weakness rather than a disclosure. Recorded in [`docs/codex-reviews/phase-2-4-onboarding-enforcement-foundation.md`](docs/codex-reviews/phase-2-4-onboarding-enforcement-foundation.md) and carried until this work.
Introduced in `40f29d9` (2026-04-27), `apps/web/middleware.ts`. The initial commit `c487e10` excluded nothing by file ending; the image list arrived with the four-app build.
Fixed in `f00e9df` (2026-08-01) by excluding folders instead, copying the change the other three apps received in `1e56504` (2026-07-30). Verified before changing that `apps/web/public` holds only `icons/` and `sponsors/`, so nothing static falls outside the two named folders.

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

~~**Fifteen addresses remain.**~~ **Corrected 2026-08-01: twelve.** The published figure was reached by subtracting four from nineteen, which assumed every remaining address consults the company. Three never do — the buyer directory, the browse surface and the meeting-request address. Counting handler by handler rather than subtracting gives **twelve, across nine files**. Recorded here rather than quietly edited, because the wrong number was published and someone may have read it.

**The remaining twelve were fixed in `f00e9df` (2026-08-01)**, so this entry now closes. They read the company from the value the completeness guard already fetched, at no additional database read, and the helper that answered the same question for the four above was deleted so exactly one way to resolve a caller's company remains. Five of the twelve decide what a caller may change and had no coverage for one company reaching another's records; all five are now covered in both directions. See [`docs/smoketests/phase-6-5-sponsor-remaining-defects.md`](docs/smoketests/phase-6-5-sponsor-remaining-defects.md).

---

## 2026-08-01

- **Sponsor portal: the last twelve request addresses read the caller's company from the database** (`f00e9df`). Closes the stale-company entry above. The helper added in Phase 13 is deleted, so one answer to "which company is this caller acting for" remains. 52 automated checks (1 skipped), six negative controls, three rounds of adversarial review. See [`docs/smoketests/phase-6-5-sponsor-remaining-defects.md`](docs/smoketests/phase-6-5-sponsor-remaining-defects.md) and [`docs/codex-reviews/phase-6-5-sponsor-remaining-defects.md`](docs/codex-reviews/phase-6-5-sponsor-remaining-defects.md).
- **Sponsor portal: cross-company writes to submission forms and responses refused** (`f00e9df`). The first two "Fixed" entries above.
- **Sponsor portal: only accounts an exhibitor should be able to add are offered or accepted as a teammate** (`f00e9df`). The third "Fixed" entry above.
- **Admin: page protection no longer decided by how an address ends** (`f00e9df`). The fourth "Fixed" entry above.
- **Lockfile records the `packages/ui` workspace** (`f00e9df`). Not a defect and no user-visible effect; it stops a build producing an unrelated modification that the next person has to decide what to do with.

---

## 2026-07-31

- **Sponsor portal: three carried defects closed** (`8e6df51`). The three "Fixed" entries above, plus the four-address partial fix. 31 automated checks, seven negative controls, three rounds of adversarial review. See [`docs/smoketests/phase-13-sponsor-portal-carried-issues.md`](docs/smoketests/phase-13-sponsor-portal-carried-issues.md).
- **Sponsor portal: request guard** (`bc99af1`, `a4296e6`). Nineteen request addresses refuse an exhibitor representative whose company profile is incomplete. See [`docs/smoketests/phase-6-sponsor-request-guard.md`](docs/smoketests/phase-6-sponsor-request-guard.md).
- **Sponsor portal: onboarding gate and checklist** (`6ef0d8d`, `8603a3c`). See [`docs/smoketests/phase-5-sponsor-screen-gate.md`](docs/smoketests/phase-5-sponsor-screen-gate.md).
- **Admin: open time slots widget** (`39deb8f`).
