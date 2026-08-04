# Changelog

Notable changes to the WBR conferencing app, newest first.

This file records **what changed and when**, with the commit that carries each change. Engineering *decisions* — what was chosen and why — live in [`docs/decisions.md`](docs/decisions.md) and, for architectural-grade ones, in [`docs/adr/`](docs/adr/). Per-change verification lives in [`docs/smoketests/`](docs/smoketests/).

---

## Bugs found during the onboarding and floor-plan work

Nine defects were found while building onboarding enforcement across June, July and August 2026. All nine predate that work. **Eight** were introduced during the original build of the four-app platform between 2026-04-27 and 2026-05-03, by the original codebase author. **The ninth is different on both counts** and is marked as such below: it was introduced on 2026-07-03, during this project's own later work, and it is a defect in a check rather than in the product. It is listed here because the section is about what was found, not about who wrote it.

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

**A check that never ran, and appeared in the list of checks as though it did.** *(The ninth defect — introduced 2026-07-03 during this project's own work, not in the original build, and in a check rather than in the product.)*
`pnpm test:access` compares the counts the dashboard displays against the counts in the database. It works out where the database is from `DATABASE_URL`, on the stated assumption that the path is relative to the Prisma schema directory — and joins the schema directory onto the front of it. That is correct for a relative path and wrong for an absolute one, which is equally valid to configure.

Measured 2026-08-02 on a machine configured with an absolute path: the check built `…/packages/db/prisma/Users/…/packages/db/prisma/dev.db`, failed with "Failed to connect to database", and exited before making a single comparison. **It had therefore never run at all in that environment**, while sitting in the list of available checks looking like coverage. Found by running it for the first time during Phase 10, because that work changed the permission model the neighbouring `pnpm test:roles` covers.
Introduced in `da19600` (2026-07-03, "feat(access): map dashboard tiles to their sections + add Staff management"), `scripts/test-access-counts.mjs`, verified with `git blame` against the line that joins the two paths.
Fixed 2026-08-02: an absolute path is used as it stands and only a relative one is resolved against the schema directory. The check now runs and passes — 2,528 attendees, 72 speakers and 2 staff, each matching between the dashboard and the database.

### Not fixed — partially addressed, remainder scheduled

**A representative moved between companies keeps acting as their previous company until they sign in again.**
The session token records the caller's company at sign-in and never changes, and request handlers read it from there rather than from the database. Measured: a person the database placed at one company approved a meeting request addressed to another.
This is a consequence of the session design recorded in [`docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md`](docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md), introduced in `40f29d9` (2026-04-27) in `apps/sponsor/lib/auth.ts`. It is a design choice with a documented trade-off rather than a single mistaken line.
**Four of nineteen addresses fixed** in `8e6df51` (2026-07-31) — the four behind the teammates screens now read the company from the database. Those four were brought forward because the colleague-role fix above turned the stale value from harmless into harmful: a moved representative could create a working account, with buyer-directory access, at the company they had left. Reproduced end to end before the change.

~~**Fifteen addresses remain.**~~ **Corrected 2026-08-01: twelve.** The published figure was reached by subtracting four from nineteen, which assumed every remaining address consults the company. Three never do — the buyer directory, the browse surface and the meeting-request address. Counting handler by handler rather than subtracting gives **twelve, across nine files**. Recorded here rather than quietly edited, because the wrong number was published and someone may have read it.

**The remaining twelve were fixed in `f00e9df` (2026-08-01)**, so this entry now closes. They read the company from the value the completeness guard already fetched, at no additional database read, and the helper that answered the same question for the four above was deleted so exactly one way to resolve a caller's company remains. Five of the twelve decide what a caller may change and had no coverage for one company reaching another's records; all five are now covered in both directions. See [`docs/smoketests/phase-6-5-sponsor-remaining-defects.md`](docs/smoketests/phase-6-5-sponsor-remaining-defects.md).

---

## 2026-08-04

- **Participant app: signing in with LinkedIn fills in a name and photo** (branch `linkedin-sign-in`; the commit identifier lands on merge, because every pull request here is rebased). A "Sign in with LinkedIn" button appears on the login screen only when both credentials are configured, and is absent otherwise — email and password, and Google, work exactly as before either way. A sign-in fills the name and photo at the top of the onboarding checklist. **Job title and company stay hand-typed**, because LinkedIn's sign-in product does not expose them, and the gate still demands them.

  **Filling in means filling what is blank.** A second sign-in never replaces a name or photo the person has since edited. Verified across two real sign-ins: an edited name survived and the login count rose from 1 to 2 with no other change and no second row created.

  The provider is assembled rather than taken from the sign-in library, whose LinkedIn option asks for the current permissions and then reads the member from two addresses the OpenID Connect product replaced. Every value was read from LinkedIn's own live configuration document rather than from its documentation.

  **The approval delay this was sequenced against does not exist.** "Sign in with LinkedIn using OpenID Connect" is an open permission, added by self-service with no review. The real gate is attaching the application to a company page, approved by that page's administrator. Recorded as finding F-24, because the wrong reason had been in the requirements document since 2026-07-21 and would have had the next reader planning around a wait that is not there.

  120 checks, 12 negative controls each caught by a number predicted in advance, three rounds of adversarial review, and four steps run by hand against a real LinkedIn account. See [`docs/smoketests/phase-12-linkedin-sign-in.md`](docs/smoketests/phase-12-linkedin-sign-in.md) and [`docs/codex-reviews/phase-12-linkedin-sign-in.md`](docs/codex-reviews/phase-12-linkedin-sign-in.md).

- **An address LinkedIn will not vouch for can create a new account and can never join one that exists.** Found by the first round of adversarial review. The sign-in read `email_verified` and deliberately ignored it, with a stated reason: the other ways into this app do not verify either. That reason does not hold — email and password requires a password, which is proof of control, and Google verifies the addresses it asserts, whereas LinkedIn omitting the claim is LinkedIn declining to make it. The sign-in then took the role and company link off whatever row matched the address, so an address matching an organizer's produced an organizer session. Recorded as finding F-27.

- **Every check that can refuse a sign-in now runs before anything is written.** Also found by the first review round. The blank-field fill and its write ran before the role was consulted, so a sign-in this app refuses had already overwritten that person's name and photo on the way out. Because an ordering is not observable from outside, the whole sequence is now decided by one function that returns what to do — so "a refusing outcome carries no write" is a property of a value and can be checked without completing a sign-in. Verified against a real refused sign-in as well: the name stayed empty, the login count did not move, and no row was created. Recorded as finding F-28.

- **LinkedIn sends its verification claim as the text `"true"`, not as a true-or-false value, and the strict check locked every returning delegate out.** Found by pressing the button, and by nothing else. LinkedIn's documentation types that field as true-or-false. The check accepted only that, so a real verification read as none, and the rule above then refused any address that already had an account — one sign-in created the account and no later sign-in could reach it. **Three rounds of review and twelve negative controls all missed it, because every one of them checked the code against the same wrong documentation**, and one of those controls actively held the defect in place by asserting the strict behaviour was correct. The fix accepts the true-or-false value and the text reading `true`, and nothing else: accepting anything the language treats as true would read LinkedIn saying *not verified* as verified, because the text `"false"` is one of those things. Recorded as finding F-29.

- **A documented safeguard did not exist, and a wrong prediction is what found it.** The provider named the authorization server, and a comment in three places said that naming it wrongly would be refused. The control written to demonstrate that predicted a refusal and produced an identical, correct redirect instead. Reading the library showed the name is never compared in this configuration, by two separate mechanisms. The wording is corrected everywhere it appeared, the endpoints are now stated in code rather than fetched on every sign-in, and the control is retired rather than repaired, because there is no version of it that passes. Recorded as finding F-26.

- **The role refusal in this sign-in path is unreachable with any role this system currently has.** `APP_ALLOWED_ROLES.attendee` admits every one of them, and the login screen advertises an exhibitor-representative account for this app. The check is a second safeguard that becomes live only when a role is added that this app does not admit — which is exactly when nobody will be thinking about a social sign-in. Stated because the first attempt to test it by hand could not have worked, and the reason was worth writing down rather than working around.

---

## 2026-08-02

- **Participant app: tapping a booth marker opens that company's card** (branch `floor-plan-booth-company-card`; the commit identifier lands on merge, because every pull request here is rebased). The card shows the exhibiting company's logo, name, tagline, stand number, what it offers and a link to its website, over the map and without leaving it. Dismissing it — by the close control, by tapping away, or with Escape — returns to the same map at the same zoom and position, because nothing in the card's path touches the map's position at all.

  The card's contents travel inside the map response rather than being fetched when a marker is tapped, so there is no waiting between the tap and the card on a conference wireless network. Measured: 1,913 characters across the ten exhibiting companies, 191 each, under 2.5 KB on a response requested once per visit. No schema change — every field was already stored and simply not sent.

  178 data checks, 219 browser checks driving real Chromium at phone size with all ten companies opened and compared one at a time, seven negative controls each caught by a number predicted in advance, and three rounds of adversarial review. See [`docs/smoketests/phase-9-booth-company-card.md`](docs/smoketests/phase-9-booth-company-card.md) and [`docs/codex-reviews/phase-9-booth-company-card.md`](docs/codex-reviews/phase-9-booth-company-card.md).

- **The seed now reproduces the exhibiting companies the map depends on.** Before this, `packages/db/prisma/seed.ts` refreshed only a company's name, tier and logo once its row existed, so taglines and stand numbers written at creation were never corrected — and offerings were never written to an exhibiting company at all, existing only in the working database and in no committed file.

  That was not only a content difference. The hall picture groups companies into rows of at most three by the first character of the stand number, so the row heights depend on how many companies exhibit. The database has ten, giving four rows; the seed had eight, giving three. **A database rebuilt from the seed would have placed every marker off every drawn stand on the committed picture**, and no existing check would have said so, because every one of them compares a marker to the position stored for that marker rather than to the picture. Recorded as finding F-10.

  Verified by rebuilding from nothing: ten companies, identical on every field the card shows, and 10 stands in 4 rows at 28.5 / 45.5 / 62.5 / 79.5 percent — exactly what the committed picture was drawn from.

- **A stray seed run can no longer overwrite an organizer's edits.** `createPrismaClient()` in the seed checks for Turso credentials **before** it reads `DATABASE_URL`, so `pnpm db:seed` connects to the shared production database whenever those variables are in the environment, regardless of the local path the npm script sets. The fix above briefly made that far worse by writing the full content set on every update. The seed now writes everything when it creates a company and only name, tier and logo when the row already exists; drift on an existing database is **detected** by a check and **corrected** deliberately by `scripts/migrate-sponsor-card-fields.mjs`, which reports by default and requires `--apply` to write, and which never replaces a value the database has with one the definitions lack.

- **Known and accepted for now: a company editing its own profile does not refresh its booth card for up to five minutes.** The card's tagline, website and offerings now sit in the participant map's cache, and no writer in any app invalidates that cache — the tag `floor-plan` appears in none of them. The sponsor portal shows an edit at once while delegates keep the previous values until the cache expires. Nobody sees wrong information, only information up to five minutes old, and it corrects itself. The fix belongs with the organizer's upload and pin-placement tools, where cache invalidation is already required, so that both kinds of writer are handled once. Recorded as finding F-13.

- **The seed prints a note instead of looking like it worked.** A seed run against a database that already holds these companies leaves their card fields alone by design, and used to print "Creating 20 sponsors" while doing so. It now names each company whose values differ from the definitions and gives the two commands that inspect and repair.

### How quickly a change reaches a delegate's phone — what works, what does not, and what has to be decided

This section is written in plain English and concerns one question: when an organizer uploads, reorders or deletes a venue map, how long is it before the people in the building see it. Nothing here is a matter of opinion; every figure below was measured on 2026-08-02.

**The answer before this work: never, or up to five minutes.** A delegate holding the map screen open would not have seen the change at all while they stayed on it. A delegate opening the screen fresh could still have been shown the old map for up to five minutes. Neither produced an error, and nothing appeared in any log.

**Three separate faults caused that, and each one alone was enough.** They are worth listing individually because they were introduced at different times by different pieces of work, and each was invisible.

1. **The setting that tells the admin app where the participant app lives was never set — on any deployment.** Without it the notification is sent to the machine the admin app is running on rather than to the participant app, which in production means nowhere. Measured against every project on the hosting account: absent from all of them. It also appeared in no example configuration file, so nobody deploying the system was ever prompted to supply it. Recorded as finding F-16.

2. **The participant app refused the notification before it was read.** The address the admin app calls sits behind a check that requires a signed-in person. One application calling another is not a signed-in person, so the request was rejected before the code that clears the cache ever ran. Measured: the same request with a signed-in browser's credentials succeeded; without them it was rejected. **This means the equivalent mechanism for speakers has never worked either, in any environment, since it was written.** Recorded as finding F-17.

3. **Nothing reported either failure.** The code that sends the notification only noticed outright network errors. A rejection arrives as an ordinary response, not an error, so it was treated as success. Every call reported success while doing nothing.

**All three are now fixed**, and a change made by an organizer reaches the participant app's server in 4 to 18 milliseconds, measured. The notification is now waited for rather than sent and forgotten — work started after a reply is sent can be discarded by the hosting platform before it runs, which would have reintroduced the same silent failure. A rejection is now written to the log naming the address, the reason and what was not cleared.

**One gap remains, and it is the reason further work is needed.** Clearing the participant app's server-side copy does not reach a copy already sitting in a delegate's phone. The phone keeps its own copy of the map for five minutes and does not ask again during that time. So the server can be entirely correct and a delegate still sees the old map.

**What is being built next: the server tells the phones directly.** Instead of each phone asking periodically, each phone holds an open connection and the server writes down it the moment something changes. A slower background refresh runs behind it as a safety net.

**The danger in that design, stated plainly, because it is not visible from the outside.** When the app is deployed, the hosting platform does not run one copy of it. It starts as many copies as the load requires, spreads people between them, and this is neither controlled nor visible. Each copy remembers only the phones connected to *itself*. When an organizer makes a change, the admin app sends **one** notification, and it arrives at **one** copy. That copy tells its own phones. The other copies were never asked and cannot report not having been asked.

  So with two copies running and two hundred phones, roughly half update immediately and the rest wait for the safety net. **Nothing fails, nothing is logged, and every test passes** — because a developer's machine and a lightly used deployment both run exactly one copy, where the behaviour is always correct. It begins to matter only when enough people are using the app at once, which at a conference is the demonstration itself.

  This is the same shape as faults 1 and 2 above: correct on a laptop, correct under light use, silently incomplete under real use.

**What would remove that limitation, and why it has not been done.** The copies need a shared channel to hear about changes rather than each keeping a private list. The hosting platform's marketplace offers this; it is a Redis service, listed under storage. Checked on 2026-08-02: **no third-party service of any kind is currently connected to this hosting account.** Adding one is therefore not an incremental change but the first of its type, and it carries four commitments beyond the code:

  - an account with an outside provider, created under the account holder's name, with a bill attached;
  - new credentials in every application that uses it — and this section has just described two faults caused by a setting nobody knew to supply;
  - a decision about what the system does when that service is unreachable;
  - somebody owning the account, the credentials and the bill after this work ends.

  **The recommendation is not to add it for the 2026-08-11 demonstration**, on the following grounds. At an audience in the tens the platform runs one copy, so the shared channel changes nothing at all. If the audience is larger, the consequence is not a broken demonstration: with the safety net some phones update instantly and the rest follow shortly after, rather than some updating and others never. And it would be a new outside dependency, requiring the account holder's own credentials to set up, added nine days before the date with the least time available to discover it had been misconfigured.

  **What would reverse that recommendation:** an expected audience in the hundreds, or a demonstration script in which people are watching their phones at the moment a map is edited. Either makes the difference between "all phones" and "most phones" something an audience can see. Both need to be known in advance, not on the day.

**One behaviour is measured but not yet explained, and it is recorded rather than left out.** After a change, the participant app's server either serves the new data within 20 milliseconds or is still serving the old data after 5 seconds. There is no middle case. The following have each been ruled out by experiment: coarse timekeeping in the cache, rejected notifications, mismatched credentials between the two applications, and a fault in the receiving code. The cause is not yet known. The planned safety net would hide it rather than fix it, which is a reason to keep looking rather than a reason to stop.

**Three things need a decision or an action from outside the engineering work:**

  - The setting naming the participant app's address must be added to the deployed admin app. Until it is, none of the above reaches production at all.
  - The floor-plan screen is controlled by a named permission. Any deployment where role permissions have previously been saved will not include a permission that did not exist when they were saved, so the screen will be missing from the organizer's menu with nothing on screen explaining why. It has to be switched on once, in the deployed environment. Recorded as finding F-18.
  - The expected number of people using the participant app during the demonstration. This is the single fact that decides whether the shared channel above is worth its cost, and it cannot be established from the code.

---

## 2026-08-01

- **Participant app: the venue floor plan** (branch `floor-plan-data-and-map-viewer`; the commit identifier lands on merge, because every pull request here is rebased). Two new record types in the shared schema — the first schema change in this body of work — plus a seeded demonstration venue of three maps and 25 markers, and a participant screen that shows a map with its markers, switches between maps in their set order, labels rooms, and gives booth markers a 44-pixel tap target. A sixth item in the bottom navigation reaches it. Booth markers link to exhibiting companies by identifier; tapping one opens a card, which is the next phase and is not built. 57 data checks, 48 browser checks driving real Chromium at three screen sizes, four negative controls each caught by a predicted number. See [`docs/smoketests/phase-8-floor-plan-viewer.md`](docs/smoketests/phase-8-floor-plan-viewer.md).
- **Participant app: the venue map can be zoomed and panned** (branch `floor-plan-data-and-map-viewer`). Pinch, double-tap or trackpad-pinch to zoom up to four times, drag to move around, and a "Fit map" control to get back. The markers and their labels stay the same size on screen while the picture grows underneath them, which is what makes zooming useful rather than merely bigger: a label covers a smaller share of the map the further you zoom in.

  Added after the phase was first committed, from an independent pass that found the map is not readable on a phone. The pictures are 1600 pixels wide and are shown at 366, so the text drawn into the map renders at about 4.6 pixels; the readable labels are then about as wide as the rooms they name, and **6 of 15 room labels sat on top of something else at that width, while none did at 768 or 1280**. Measured after the change: 4 collisions at fit-to-width, 0 once zoomed to 2.5x. At the default view on a phone the labels still overlap; what changed is that a delegate can do something about it. Recorded as finding F-9.
- **Participant app: floor-plan pictures are no longer redirected to the sign-in page.** `public/maps/` was not in the middleware's exclusion list, so a request for a map picture without a session cookie answered `307`. A signed-in delegate was unaffected — which is why it would have survived casual testing and failed for a service-worker prefetch. Excluded by folder name with a trailing slash, following that file's own documented rule; verified afterwards that `/maps`, `/mapsecret` and `/sponsorship` all still go through the middleware.
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
