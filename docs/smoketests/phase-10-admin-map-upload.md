# Phase 10 Smoketest — the organizer's map upload

Follows [`docs/smoketests/CONTRACT.md`](CONTRACT.md).

**Source of the criteria:** the plan's § Phase 10 in [`.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`](../../.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md), and findings F-14 to F-18 in the engineer-local floor-plan requirements document. **That is the floor-plan document, not the onboarding-enforcement one** — the enforcement document states in its own § Relationship section that it leaves the floor plan untouched, and it holds none of F-14 to F-18.

**No naming collision for this phase.** `docs/smoketests/phase-9-admin-pagination-server-side.md` shows this repository carries June-sprint files at colliding numbers, and Phase 9 hit exactly that. Phase 10 does not: `phase-10-admin-map-upload.mjs` and `phase-10-negative-controls.sh` are both this phase's.

---

## What this verifies

Mapped to the acceptance criteria in the plan's § Phase 10.

1. **An organizer can upload a PNG map, which then appears in the participant viewer.** *(AC 1 — see § Residual 1 for the JPG half, which is not covered)*
2. **A PDF is refused, and the message on screen tells the organizer to save it as a JPG or PNG.** The words a person reads are asserted, not merely that the upload failed. *(AC 2, replacing the withdrawn PDF-conversion criterion — F-15)*
3. **An organizer can create several maps and set their switch order.** *(AC 3)*
4. **The order the organizer sets is the order delegates get.** *(AC 4)*
5. **An organizer can delete a map; its markers go with it and the remaining order closes the gap rather than leaving a hole.** *(AC 5)*
6. **An uploaded map's picture is served from `/api/data/map/<id>/image` and does not travel inside the `GET /api/data/map` body. A seeded map's stored path is unchanged.** *(AC 6 — F-14)*
7. **A file over 10 MB is refused with a message naming the limit, and a picture wider than 2400 pixels is refused.** *(AC 7 — F-14)*
8. **Every write to a map invalidates the participant app's `floor-plan` cache**, so a change reaches a delegate without anything clearing that cache by hand. *(AC 10)*
9. **A write to a company's tagline, website, logo, booth number or offerings does the same** — in the admin app **and** in the sponsor portal. *(AC 9 — F-13)*
10. **A server-to-server request carrying no session cookie and the correct secret reaches `/api/revalidate` and is answered 200**, and the exemption is written as exact path equality. *(AC 12 — F-17)*
11. **The same request with a wrong secret is still refused**, so the exemption moved the authentication rather than removing it. *(AC 13 — F-17)*
12. **The posting helper inspects `res.ok` and logs a refusal.** *(AC 14 — F-17)*
13. **`ATTENDEE_APP_URL` is documented in the admin app's example environment file, and the admin README no longer claims the URL is hardcoded to localhost.** *(AC 11 — F-16)*
14. **The organizer's screen is reachable from the sidebar, not merely present at an address**, which required adding the permission key `floorPlan`. *(AC 16 — F-18)*
15. **A Playwright script named for this phase covers the above.** *(AC 15)*
16. **This document exists and follows the contract.** *(AC 17)*

Five things outside the criteria are verified, each because a review round or the assessment on 2026-08-02 found that leaving it out shipped a hole:

- **The permission key is enforced at the address, not only on the screen.** Round 2. A role with the floor-plan permission switched off could otherwise still upload, reorder and delete by calling the addresses directly — including deleting a map and cascading away its markers.
- **A map belonging to an inactive conference is neither served nor deletable.** Round 1 fixed the read and left the write; round 3 found the write.
- **A delegate already looking at the map is told about a change without touching the phone**, and the connection is released when the screen closes or the stream is cut mid-flight. Rounds 1 and 3.
- **The cache-invalidation address fails closed on a missing, null or empty secret.** Round 1: the previous comparison made `undefined !== undefined` false, so with the setting absent any caller could invalidate any tag.
- **The running build matches the source before any number is trusted.** Added 2026-08-02 after the sponsor app was found serving a build seven hours older than its own source — see § Step 0.

---

## Prerequisites for the runner

- **Four apps, all in production mode**, all reading the one database at `packages/db/prisma/dev.db`. The `apps/*/dev.db` copies are inert leftovers.

  ```
  (cd apps/web      && ./node_modules/.bin/next build && ./node_modules/.bin/next start -p 3000 &)
  (cd apps/attendee && ./node_modules/.bin/next build && ./node_modules/.bin/next start -p 3001 &)
  (cd apps/sponsor  && ./node_modules/.bin/next build && ./node_modules/.bin/next start -p 3003 &)
  ```

  Use the local binary. A bare `npx next start` failed under `nohup` on the engineering machine. `next dev` is tier D and invalid for anything here.

- **The sponsor portal on 3003 is a prerequisite as of 2026-08-02.** Step 5 checks that a company representative editing their own profile in that portal reaches the participant viewer. If the portal is not answering, those two assertions are reported as **failures with the reason**, never skipped.
- **Clear the persisted map cache after any re-seed:** `rm -rf apps/attendee/.next/cache/fetch-cache`. The map read is cached for 300 seconds and Next writes that cache to disk, so it survives a restart.
- All four apps share one SQLite file, and `PRAGMA journal_mode` is `delete` rather than write-ahead logging. A script writing to it while an app runs needs `PRAGMA busy_timeout`, or it throws `database is locked` as a test failure. The Phase 10 script sets 15 seconds.
- The scripts create and remove their own disposable accounts, companies, markers and maps. No manual sign-in setup.
- **If you rebuild the database**, set `SEED_BATCH_INTERVAL_MS=0`. Without it `seed.ts` sleeps five minutes between each batch of speakers and a full seed takes about fifty minutes, which looks like a hung process.
- `timeout` does not exist on macOS. Two runs were lost to `command not found: timeout`, one of them silently producing no verdict for 36 suites.
- **Do not run `pnpm lint`** — the repository has no ESLint configuration and it cannot run. Type-check per app instead, as in Step 0.

---

## Steps

Every step is a contract check. See § Step summary for why no perf-bar step is defined.

### Step 0 — the running build matches the source [contract]

**Verifies:** that every later number in this document describes the code in the working tree, and not an older build still being served.

This step exists because of a measured incident rather than as a precaution. On 2026-08-02 the sponsor app was found serving a build from 15:22 while its own source had been changed at 22:13 — so the cross-app fix in `apps/sponsor/app/api/profile/route.ts` was present in the repository and absent from the running product. The same class of error produced three false conclusions earlier in the phase, the sharpest being six suite runs showing 3–5 failures that were read as a worsening fault when the apps were simply running a build from before the last fix.

```
for a in web attendee sponsor; do
  echo "--- apps/$a"
  find apps/$a -type f \( -name '*.ts' -o -name '*.tsx' \) \
    -not -path '*/.next/*' -not -path '*/node_modules/*' \
    -newer apps/$a/.next/BUILD_ID 2>/dev/null | grep -v '.env'
done
```

- [ ] Run the command above.
  - **Pass:** it lists **no files** for any of the three apps.
  - **Fail:** any file is listed. Rebuild and restart that app before running anything else; a measurement taken now is about code that is not running.

```
(cd apps/web && npx tsc --noEmit)
(cd apps/attendee && npx tsc --noEmit)
(cd apps/sponsor && npx tsc --noEmit)
```

- [ ] Type-check each app.
  - **Pass:** `apps/web` and `apps/sponsor` report nothing. `apps/attendee` reports **exactly one** error, `components/BottomNav.tsx(43,101): error TS2514`, which is pre-existing and documented in `CLAUDE.md` as not to be fixed as a side-quest.
  - **Fail:** any other error. Every `next.config.js` sets `typescript.ignoreBuildErrors: true`, so a build passing is not evidence here.

### Step 1 — the regression baselines still hold [contract]

**Verifies:** that any failure below belongs to this phase, and specifically that the F-14 change left Phases 8 and 9 untouched.

Run before anything else. **The Phase 8 and 9 counts are the written prediction of this phase**, recorded before any code was written: seeded maps keep their stored file paths, so the cache key suffix does not change and neither suite should move. Movement in either is a finding, not a flake.

```
pnpm test:onboarding-policy                                        # expect 44 passed, 0 failed
pnpm test:floor-plan                                               # expect 57 passed, 0 failed
pnpm test:booth-card                                               # expect 178 passed, 0 failed
pnpm test:roles                                                    # expect all unit checks passed
pnpm test:access                                                   # expect ACCESS COUNTS TEST PASSED
pnpm test:audit-db && pnpm test:audit-security                     # expect ALL PASSED
node docs/smoketests/playwright/phase-8-floor-plan-viewer.mjs      # expect 93 passed, 0 failed
node docs/smoketests/playwright/phase-9-booth-company-card.mjs     # expect 219 passed, 0 failed
```

- [ ] Run all of the above.
  - **Pass:** every count matches exactly, in both directions. Recorded 2026-08-02 on a verified-current build: **44 / 57 / 178 / all passed / passed / ALL PASSED / 93 / 219**, zero failures anywhere.
  - **Fail:** any count differs. A count that is *higher* than expected is as much a defect as one that is lower — it means the assertion set changed without this document changing.

**`test:roles` and `test:access` are in this list for a reason.** This phase adds the permission key `floorPlan`, and both scripts hold their own list of expected keys. `test:access` had never been run in this working tree before this phase and needed fixing to run at all.

**Match the output loosely, then read it.** Eleven suites in this repository report `✓ all N checks passed` rather than `Results: N passed`, and a matcher looking only for the second form reads all eleven as failures.

### Step 2 — the picture has its own address, and stays out of the list response [contract]

**Verifies:** AC 6. Sections 1 to 5 of the Phase 10 script.

The decision of record (F-14) is that `imageUrl` keeps holding a short string: a file path for a seeded map, `/api/data/map/<id>/image` for an uploaded one. The criterion requires this be proved by measuring the response body and searching it for `data:`, not by reading the code.

Covered by the script run in Step 6, sections 1 to 5, which assert: the uploaded map is present in the response; **the response body does not contain the picture**; the uploaded map points at its own address; each of the three seeded maps keeps the exact path it was seeded with; the response body stays small; the picture is served from its own address as a PNG with **the bytes served identical to the bytes stored**; the address also works for a map stored as a file path, by redirecting to the file; and a signed-out visitor and an incomplete delegate are each refused the picture, with the refusal confirmed to have actually withheld the bytes rather than merely returned a non-200.

- **Pass:** all **17** assertions in sections 1 to 5 pass (8 / 3 / 1 / 2 / 3).
- **Fail:** any of them fails.

**Recorded by the engineer of record on 2026-08-02, not re-measured during the 2026-08-02 assessment:** the map list response fell from **44,696 bytes to 6,678** for the same four maps, and the three seeded pictures are 98,614 bytes on disk and about 131,000 as base64 text. Those two figures are the justification for the decision; the assertions above are the ongoing check.

### Step 3 — the upload handler refuses what it should [contract]

**Verifies:** AC 2 and AC 7. Section 6 of the script.

Asserted: a signed-out upload is refused; an upload by a delegate is refused; **a PDF is refused and the refusal says what to do instead**; a file over 10 MB is refused and **the message names the limit**; a picture wider than 2400 pixels is refused and **that message names the limit too**; an organizer can upload a PNG; the uploaded map is stored against the active conference; it takes the next position in the switch order; and it reaches the participant viewer.

- **Pass:** all 12 assertions in section 6 pass.
- **Fail:** any of them fails.

**Every limit is checked at the address and not only in the browser.** The organizer's screen resizes and refuses before anything is sent, which is where a person gets a useful message, but a request that did not come from that screen would walk past all of it.

**The size check runs before the body is read, and that is a message decision rather than an optimisation.** Measured while building: an 11 MB picture made `req.json()` throw, so the request was refused with "Expected a JSON body." — telling an organizer their request was malformed on the single most likely mistake.

### Step 4 — ordering and deletion [contract]

**Verifies:** AC 3, AC 4 and AC 5. Section 7 of the script.

Asserted: two uploaded maps are created on the end of the order; the organizer can set the switch order; **the new order is what is stored**; the switch order has **no gaps** after reordering; **the new order is what delegates see**; a reorder that omits a map is refused and leaves the order untouched; a delegate cannot delete a map; the organizer can; the deleted map is gone; **the markers on it went with it**; the order **closes the gap** rather than leaving a hole; and **the seeded maps were never moved** by any of it.

- **Pass:** all 13 assertions in section 7 pass.
- **Fail:** any of them fails.

**Two of these assertions used to pass while the feature did not exist**, and the fix is worth knowing about before trusting them. "No gaps after reordering" and "closes the gap" both passed before either endpoint was written, because the order was already correct and the checks would report success for doing nothing. They are now gated on the operation having succeeded, and report a **failure** — not a skip — when it did not.

**The two-pass position write is not defensive.** `VenueMap` carries a unique constraint on conference and position, and SQLite checks it per statement rather than at the end of a transaction, so a naive single-pass swap is refused with `UNIQUE constraint failed`. That was verified rather than assumed. Pass one moves every map to a negative position; pass two writes the real ones.

### Step 5 — a write reaches delegates with nothing clearing the cache by hand [contract]

**Verifies:** AC 9, AC 10, AC 12 and AC 13. Section 8 of the script, and the whole of finding F-17.

**Read this before trusting the step.** An earlier version of these checks cleared the cache explicitly and then read after the write, which passes whether or not the product invalidates anything. The cache is now primed before each write so it holds the stale value, and nothing clears it but the product.

Asserted: **a server-to-server revalidate carrying no cookie is accepted**; **the same call with a wrong secret is still refused**; and an upload, a reorder, **a company edit made in the admin app**, **a company edit made in the sponsor portal**, and a delete each reach the participant viewer with nothing clearing the cache.

- **Pass:** all 8 assertions in section 8 pass.
- **Fail:** any of them fails.

**Measured 2026-08-02 on a verified-current build**, time for the change to reach the participant app's map response:

| Write | Reached delegates in |
|---|---|
| Upload a map | 4 ms |
| Reorder maps | 4 ms |
| Edit a company in the **admin app** | 9 ms |
| Edit a company in the **sponsor portal** | 8 ms |
| Delete a map | 4 ms |

**Cross-app invalidation had never worked for any tag, in any environment, before this phase — including `speakers`, which predates it.** F-17: the participant app's middleware refused `/api/revalidate` with 401 before the route ran, because the address was not exempted from its session check and a server-to-server call carries no cookie. `fetch` does not throw on a 401 and the caller never inspected the response, so the failure was silent for the life of the feature. Measured: no cookie gave `401 {"error":"Unauthorized"}`; a signed-in cookie with the same body gave `200 {"revalidated":["floor-plan"]}`.

**The sponsor-portal assertions were added on 2026-08-02, during the assessment, and closed a real gap.** Before them, the only sponsor-app assertion in the entire suite read a documentation file — nothing drove port 3003 at all. That mattered because `apps/sponsor/lib/revalidate-attendee.ts` is a deliberate copy of the admin app's helper rather than a shared module (the four apps share a data package, not their lib folders), so the admin app's version working said nothing about the sponsor app's. The file had also never been built into the running portal at the time. See § Step 9, control 6, for the proof that these two assertions can fail.

### Step 6 — the organizer can actually do this from the screen [contract]

**Verifies:** AC 1, AC 2, AC 15 and AC 16. Section 9 of the script, and the run as a whole.

```
node docs/smoketests/playwright/phase-10-admin-map-upload.mjs
```

- [ ] Run the script.
  - **Pass:** `Results: 92 passed, 0 failed`, and exit code 0.
  - **Fail:** any count other than 92 passed and 0 failed, in either direction.

Section 9 is the first place a person clicks. Everything above it is checked by sending requests directly, which proves the rules are enforced and says nothing about whether anybody can reach them or understand what they are told. Asserted there: **the floor plan screen is in the sidebar**; the screen opens; the upload form appears exactly once; **a PDF is refused on screen and the message says what to do**; that refusal is **visible without scrolling**; nothing was saved when the PDF was refused; an organizer can upload a map from the screen; it is listed; it can be moved later in the order; **the order on screen matches the order delegates get**; it can be deleted from the screen; and it is then gone from the list.

**The sidebar assertion is AC 16 and finding F-18.** The admin app decides sidebar entries by permission key, so a screen without one cannot be navigated to — it exists at an address and is invisible. This phase adds the key `floorPlan`.

**"The upload form appears exactly once" counts visible elements, deliberately.** It failed roughly one run in three until this was understood: React streams server-rendered content into a hidden container and then moves it into place, so for about 250 milliseconds the document holds two copies. Measured across 12 loads: two copies on 5 of them, one copy by 300 ms on all 12. Nobody ever sees two forms, and the assertion now counts what is visible rather than what is in the document.

**A crash is one named failure, not a lost run.** Everything from section 1 to Cleanup runs inside one try. An exception from a missing element used to end the process and skip cleanup, which once left this script's fixtures behind and made Phase 8 afterwards find 6 maps instead of 3.

### Step 7 — the review findings and the live update [contract]

**Verifies:** the nine findings from the three adversarial review rounds, plus the live update to an open map screen. Sections 10 to 13 of the script, covered by the same run as Step 6.

Asserted, by round:

- **Round 1** *(section 10, 8 assertions)* — a map belonging to an inactive conference is not served, with the refusal confirmed to have withheld the bytes; cache invalidation is refused when the secret field is **absent**, **null** and **empty string**; four simultaneous uploads all succeed and leave no duplicate or missing position; and the sponsor app documents `ATTENDEE_APP_URL`.
- **Round 2** *(section 11, 7 assertions)* — the floor-plan permission can be revoked for staff; uploading, reordering and deleting are then each refused; **the refusals actually changed nothing** in the database; the revoked-permission row is removed again afterwards; and deletes racing uploads leave no gap in the order.
- **Round 3** *(section 13, 6 assertions)* — a map on an inactive conference cannot be **deleted**, and both it and its markers survive the attempt; opening map screens adds connections; closing them releases every one; and **a stream aborted mid-connection releases its listener**.

**Section 12, 5 assertions, is the live update rather than a review finding:** the connection refuses a signed-out visitor and refuses a delegate with an incomplete profile; a phone on the map screen opens a connection; **a delegate on that screen sees a new map appear without touching the phone**; and **it arrived by the push rather than by the slow background refresh sitting behind it** — which is the assertion that stops this passing for the wrong reason. Recorded 2026-08-02: **41 ms** on an untouched screen, with 37 ms and 110 ms recorded earlier by the engineer of record.

- **Pass:** all **26** assertions across sections 10 to 13 pass (8 / 7 / 5 / 6).
- **Fail:** any of them fails.

**Round 3's two findings came from pointing the final round at what the earlier rounds' own fixes had introduced**, which is the same technique that produced Phase 9's highest-severity finding. Round 1 fixed the conference-scoped *read* and left the *write*; and the listener register, added during the phase, leaked an entry whenever a stream was discarded without an abort event.

**The permission is revoked through the app's own save path, not by writing the row.** The first version inserted the `RolePermission` row straight into the database. Role permissions are read through a cache cleared by the save path, so a row written behind the app's back left it serving the previous, more permissive answer — and the delete this check aimed at a seeded map therefore succeeded, destroying the exhibit hall and its ten markers. Twice, because it was re-run before being fixed. Restored both times with `node scripts/seed-floor-plan.mjs --local packages/db/prisma/dev.db`, which needs the surviving maps moved to negative positions first because the delete renumbers them.

**Everything destructive in this suite now targets rows it created**, and where it cannot create one it reports a failure rather than aiming at a seeded row. A check that damages real data when the thing it checks is broken is not a check; it does the most harm in exactly the case it exists to detect.

### Step 8 — the criteria that are not in the script [contract]

**Verifies:** AC 11, AC 12's exact-equality requirement, and AC 14. These are properties of files rather than behaviours of a running app, so they are checked here by reading rather than by assertion.

```
grep -n "ATTENDEE_APP_URL" apps/web/.env.local.example apps/sponsor/.env.local.example
grep -n "isMachineRoute" apps/attendee/middleware.ts
grep -n "res.ok" apps/web/lib/revalidate-attendee.ts apps/sponsor/lib/revalidate-attendee.ts
grep -n "hardcoded to localhost" apps/web/README.md
```

- [ ] **AC 11 — the setting is documented.** **Pass:** `ATTENDEE_APP_URL` appears in both example files. Recorded 2026-08-02: line 29 of the admin app's, line 30 of the sponsor app's.
- [ ] **AC 11 — the README no longer misleads.** **Pass:** the last grep returns **exactly one line**, and that line is the dated correction which quotes the old wording in order to say it was wrong. Recorded 2026-08-02: one match at `apps/web/README.md:262`, beginning "**Corrected 2026-08-02.** This entry previously said the URL was...". **Fail:** the phrase appears anywhere as a **current** statement, or the grep returns more than that one line. The old entry said the URL was hardcoded to localhost and that in production "the request fails and the `catch` block silently no-ops"; a reader trusting that would conclude the mechanism cannot work and build a second one. Note the grep matching is therefore expected — read the line, do not just count it.
- [ ] **AC 12 — the exemption is exact path equality.** **Pass:** the middleware reads `request.nextUrl.pathname === '/api/revalidate'`. **Fail:** it uses `startsWith`. This is a criterion rather than a style preference: the same matcher in this app carries a recorded incident where three folder names were measured skipping the middleware entirely as unanchored prefixes, and written as a prefix `/api/revalidate-anything-at-all` would walk straight through.
- [ ] **AC 14 — a refusal is visible.** **Pass:** both helpers test `!res.ok` and log a warning naming the address and what to check. **Fail:** either only has a `.catch()`. `fetch` does not throw on a 401, which is exactly how F-17 went unnoticed.

### Step 8b — the cache address fails closed with no secret configured [contract]

**Verifies:** the round 1 finding, which **Step 6's suite cannot verify.** Added 2026-08-03.

```
bash docs/smoketests/playwright/phase-10-secret-fail-closed.sh
```

- [ ] Run it.
  - **Pass:** `Controls: 6 passed, 0 failed`. Recorded 2026-08-03: 6 passed, 0 failed.
  - **Fail:** any refusal that is not a 401, or a missing log line. A 200 means the cache address accepts unauthenticated callers whenever its secret setting is missing.

It starts a second copy of the participant app on a spare port with `NEXTAUTH_SECRET` hidden, then asserts that a message with no secret, a null secret, an empty secret and even **the correct secret** are all refused, that the refusal cleared no cache tag, and that the server logged why. It edits `apps/attendee/.env.local` and restores it under a trap that runs on any exit, verifying the restore by comparison; the instance already serving 3001 is untouched because it read its settings at boot.

**This step exists because three assertions inside Step 6 cannot fail.** See § The six assertions that cannot fail.

**It can fail, and that is measured, not assumed.** Against the pre-fix comparison with the secret hidden, the same request answered `HTTP 200` with body `{"revalidated":["floor-plan"],...}`. Against the fixed code it answers `401` plus `[revalidate] NEXTAUTH_SECRET is not set; refusing all cache invalidation.`

### Step 9 — the negative controls [contract]

**Verifies:** that the assertions above would notice if the product were broken. Without this step, a green run says only that the checks passed.

```
bash docs/smoketests/playwright/phase-10-negative-controls.sh
```

Five controls, each breaking exactly one shipped behaviour, each with a failure count **predicted in advance and written in the script**. It accepts an optional substring argument to run one on its own. A full pass rebuilds ten times and takes roughly half an hour.

| # | Control | Predicted new failures |
|---|---|---|
| 1 | the image address serves any conference's map | 2 |
| 2 | every map is rewritten to the image address, not just uploads | 3 |
| 3 | a PDF is refused without being told what to do instead | 1 |
| 4 | uploading ignores the floor-plan permission | 2 |
| 5 | nothing is pushed to the open connections | 2 |

- [ ] Run the controls.
  - **Pass:** `Controls: 5 passed, 0 failed`. A control caught by the **wrong number** is a finding, not a pass — it means the suite measures something other than what it claims.
  - **Fail:** any control not caught, caught by the wrong number, or whose edit did not apply.

**The driver's own machinery produced four false verdicts before it was fixed, and all five predictions were correct on the first attempt.** Every apparent failure was the measuring apparatus. Three faults, each now closed by a gate: it restarted only the app it broke, so a downed admin app made later runs die early; it judged by **counting** failures, so a control that genuinely broke three assertions read as two when an unrelated flake failed in the baseline; and `restore` put source files back **without rebuilding**, so one control's break stayed live through the next three. It now rebuilds both apps before each control and compares **which assertions fail by name** using `comm`, ignoring any that failed in both runs.

**Control 6, added 2026-08-02 during the assessment**, proves the two new sponsor-portal assertions can fail. It is not yet in the script and was run by hand:

```
# Break: replace the call in apps/sponsor/app/api/profile/route.ts
#   await revalidateAttendeeFloorPlan('sponsor profile PATCH')
# with a no-op, then rebuild and restart the sponsor app on 3003.
```

- **Prediction, written before the run:** exactly **one** assertion fails — `an edit in the SPONSOR PORTAL reaches the viewer with nothing clearing the cache` — while `the sponsor portal accepts a representative own-company profile save` keeps passing, because the save itself still works.
- **Result, 2026-08-02:** `Results: 91 passed, 1 failed`, the single failure being that assertion by name, with detail `after 5039ms the marker still shows the old tagline`. Restored, rebuilt, and re-run to `92 passed, 0 failed`.
- **Folding this into the script is § Residual 4.**

### Step 9b — the independent probes [contract]

**Verifies:** seven of the nine review findings, by talking to the running programs directly rather than through the Phase 10 suite. Added 2026-08-03.

These exist because the suite shares its fixtures, its helpers and its author's assumptions with the code it measures, so a blind spot in the assumption is inherited rather than caught. These three share nothing with it — their own conference, maps, markers, accounts and sign-in.

```
node scripts/third-opinion-phase-10-conference-scoping.mjs        # expect 9 passed, 0 failed
node scripts/third-opinion-phase-10-permission-and-listeners.mjs  # expect 10 passed, 0 failed
node scripts/third-opinion-phase-10-listener-count.mjs            # expect 3 passed, 0 failed
```

- [ ] Run all three.
  - **Pass:** 9, 10 and 3, zero failures. Recorded 2026-08-03: all three met exactly.
  - **Fail:** any count differs.

**Every finding is checked in both directions, and that is the point of them.** A handler that refused every request would satisfy every scoping and permission assertion in this phase while being useless, so each refusal is paired with its positive counterpart — the same organizer *can* delete on the active conference, the same delegate *can* read an active-conference picture, staff *can* upload when the permission is granted.

That pairing earned its place immediately: the first run of the scoping probe reported 7 passed, 2 failed, and one failure was a delegate account built with the wrong fields, so it was refused everything. **The scoping assertion still passed** — a refusal is what it looks for — and only the counterpart revealed the pass was meaningless.

What each covers, mapped to `docs/codex-reviews/phase-10-admin-map-upload.md`: the first covers R1-a and R3-a; the second covers R2-a and R3-b; the third covers NC5-a, by patching one write to fail so the connection count and the delivery count diverge, and asserting the field reports the connection count. Recorded 2026-08-03: with three screens open and one write failing, the log read `3 open connection(s) on this instance, 2 written to successfully` and the response reported **3**.

### Step 10 — nothing was left behind [contract]

**Verifies:** that a run is repeatable and that no later suite inherits this one's fixtures.

```
sqlite3 packages/db/prisma/dev.db "
  SELECT 'maps', COUNT(*) FROM VenueMap UNION ALL
  SELECT 'pins', COUNT(*) FROM Pin UNION ALL
  SELECT 'sponsors', COUNT(*) FROM Sponsor UNION ALL
  SELECT 'phase10 maps', COUNT(*) FROM VenueMap WHERE id LIKE 'phase10%' OR name LIKE 'Phase 10%' UNION ALL
  SELECT 'phase10 sponsors', COUNT(*) FROM Sponsor WHERE id LIKE 'phase10%' UNION ALL
  SELECT 'phase10 pins', COUNT(*) FROM Pin WHERE id LIKE 'phase10%' UNION ALL
  SELECT 'phase10 users', COUNT(*) FROM User WHERE id LIKE 'phase10%' OR email LIKE 'phase10%' UNION ALL
  SELECT 'STAFF role rows', COUNT(*) FROM RolePermission WHERE role = 'STAFF';"
```

- [ ] Run after the script.
  - **Pass:** **3 maps, 25 markers, 20 companies**, and **zero** rows in every `phase10` count and in `RolePermission` for `STAFF`. The script's own Cleanup section asserts the same thing from the other direction: that the app serves exactly the maps it served before the run.
  - **Fail:** any leftover row, or a seeded count that moved.

**Recorded 2026-08-02** across four consecutive full runs plus one negative control: 3 / 25 / 20 and zero leftovers every time. The `RolePermission` check matters because that table was empty before the run, and a row left behind changes how every later permission check resolves — including the whole point of F-18.

---

## Step summary

| Step | Category | Environment | Expected | Status (filled by runner) |
|---|---|---|---|---|
| 0. Build matches source | contract | local prod build | no files listed; 1 known TS error | |
| 1. Regression baselines | contract | local prod build | 44 / 57 / 178 / 93 / 219, all 0 failed | |
| 2. Picture's own address | contract | local prod build | sections 1–5 pass (17) | |
| 3. Upload handler refusals | contract | local prod build | section 6 passes (12) | |
| 4. Ordering and deletion | contract | local prod build | section 7 passes (13) | |
| 5. Writes reach delegates | contract | local prod build + sponsor 3003 | section 8 passes (8) | |
| 6. The organizer's screen | contract | local prod build | section 9 passes (12); **92 total, 0 failed** | |
| 7. Review findings + live update | contract | local prod build | sections 10–13 pass (26) | |
| 8. Criteria not in the script | contract | anywhere | 4 file properties hold | |
| 8b. Fails closed with no secret | contract | local prod build + spare port | Controls: 6 passed, 0 failed | |
| 9. Negative controls | contract | local prod build | Controls: 5 passed, 0 failed | |
| 9b. Independent probes | contract | local prod build | 9 / 10 / 3, zero failures | |
| 10. Nothing left behind | contract | anywhere | 3 / 25 / 20, zero leftovers | |

**Step 6's 92 includes six assertions that cannot fail**, so the number to read it as is **86 real assertions plus Step 8b's 6**. See § The six assertions that cannot fail.

**No perf-bar step is defined for this phase, and that is a decision rather than an omission.** The phase's one performance-relevant change makes the map list response *smaller*, not larger — the picture leaves the response body and moves to its own address, recorded at 44,696 bytes down to 6,678 for four maps. Step 2's "the response body stays small" assertion is the ongoing guard on that quantity. A Lighthouse measurement would also be uninterpretable here for a reason specific to this repository: the lantern model amplifies inline base64 images into simulated scores five to ten times the observed value, and this phase's whole purpose is to remove such an image from a response. The image-storage migration that would change this is tracked as Phase 16, after the sprint.

---

## Pass / fail

**Pass** when all thirteen steps meet their criteria — 0 through 8, then 8b, 9, 9b and 10 — with Step 0 run first.

**Step 6 alone is not enough, and this is now measured rather than cautionary.** Six of its 92 assertions pass on a broken build. Step 8b is what covers the secret half; nothing local can cover the ordering half. A run that reports `92 passed` without Step 8b has not tested the round 1 security fix at all.

**Fail** on any count that differs from the expected value, in either direction. A suite reporting *more* passes than expected is as much a defect as one reporting fewer: it means the assertion set changed without this document changing. The count moved from 90 to 92 on 2026-08-02 when the two sponsor-portal assertions were added, and this document was updated in the same change.

**A green run is not the release gate.** The release gate is a dry-run with the project owner, and it has not happened for this phase or any earlier one.

---

## Re-run trigger

Re-run in full when any of these change:

- `apps/web/app/api/floor-plan/maps/route.ts` or `apps/web/app/api/floor-plan/maps/[id]/route.ts`
- `apps/web/components/FloorPlanClient.tsx` or `apps/web/app/(dashboard)/dashboard/floor-plan/`
- `apps/web/lib/image-dimensions.ts`, `apps/web/lib/floor-plan-order.ts` or `apps/web/lib/revalidate-attendee.ts`
- `apps/web/lib/permissions.ts` or `apps/web/components/Sidebar.tsx` — the permission key and the sidebar entry are AC 16
- `apps/attendee/middleware.ts` or `apps/attendee/app/api/revalidate/route.ts` — the F-17 exemption and the secret check
- `apps/attendee/app/api/data/map/` (including `[id]/image` and `stream/`), `apps/attendee/lib/floor-plan-data.ts`, `apps/attendee/lib/floor-plan-events.ts` or `apps/attendee/lib/hooks.ts`
- `apps/sponsor/app/api/profile/route.ts` or `apps/sponsor/lib/revalidate-attendee.ts` — Step 5's sponsor-portal half
- The `VenueMap` or `Pin` models in `packages/db/prisma/schema.prisma`
- `scripts/test-role-permissions.mjs` or `scripts/test-access-counts.mjs` — both hold their own list of permission keys

Steps 0 and 9 in particular. Step 0 is the only one that would notice a stale build, which has produced false conclusions in this phase three times. Step 9 is the only one that would notice the assertions having stopped measuring anything.

---

## The six assertions that cannot fail

**Established 2026-08-03 by an independent verification pass.** Six of Step 6's 92 assertions print a pass whether the product works or is broken. Each was proved by breaking the product and running the suite against the broken build. **Real coverage is 86, not 92.**

Neither group indicates a defect in Phase 10. Both are defects in the evidence.

### The three about the shared secret

`cache invalidation with no secret field at all / a null secret / an empty-string secret is refused`

The pre-fix comparison was put back into `apps/attendee/app/api/revalidate/route.ts`, the app was rebuilt, and the hole was confirmed live first — a body carrying no secret answered **HTTP 200** against a copy started with the setting hidden. The suite then ran against that build and reported `Results: 92 passed, 0 failed` with all three ticked.

The cause: the suite talks to an app that **has** a secret configured. The unfixed line was `secret !== process.env.NEXTAUTH_SECRET`, so a body with no secret is `undefined !== "<44 chars>"`, which is true, and it refuses — the same answer the fixed code gives. The hole opens only when the secret is absent from the server, and a script talking to an already-running app cannot create that condition.

**This is the more serious of the two groups.** The defect is reachable, it is a security hole, and three assertions point straight at it and pass anyway. They read as security coverage and would sign off a build carrying the hole.

**Covered instead by § Step 8b**, which starts the app without the setting. Those three assertions are kept and relabelled rather than deleted, because they still cover a different future defect: a change that compared a missing or null secret loosely while a secret is configured.

### The three about upload ordering

`four simultaneous uploads all succeed` / `the switch order has no duplicate or missing positions after them` / `deletes racing uploads leave no gap in the switch order`

The retry loop was cut from five attempts to one and the renumber was deleted from the create transaction. Eight rounds of up to eight simultaneous uploads: no upload lost, no gap, all three still passing.

The cause is the database, not the code. This machine uses SQLite, which permits one writer at a time. Measured: **one upload 183 ms, four concurrently 749 ms, a ratio of 4.09** — they queue rather than overlap, so the second cannot read the maximum until the first commits. The two-statement gap both fixes protect does not exist here. Widening it deliberately with a 150 ms pause between the read and the insert still produced no collision.

**Both fixes stay.** The deployed environment does not use SQLite — all four apps read Turso, which is reached over a network by many callers at once and has no single-writer restriction, so both races are plausible in production. The fixes are right for the environment that matters and cannot be exercised from a laptop. **No local assertion can close this**, and the labels now say so rather than implying otherwise.

### How this survived the review

All three adversarial review rounds and all five negative controls were asking whether the **code** was right. None asked whether the **assertions could fail**. Those are different questions and only the second finds this. The five existing controls each break a shipped behaviour and confirm the suite notices; none of them targeted these six paths.

**Recommended addition to the control script:** a sixth and seventh control covering the sponsor-portal invalidation (already run by hand, see § Step 9) and, if a way is found, the ordering fixes.

---

## Residuals — recorded, not fixed

### Residual 1 — the JPG half of AC 1 is not covered

AC 1 and AC 15 both name **a JPG and a PNG**. The script uploads PNGs only: the string `image/jpeg` appears nowhere in it. The handler accepts both and refuses everything else, and `readImageSize` has a JPEG branch that walks the segment chain with bounds checks at every step — but **no assertion exercises it**, so the JPEG path is unproven by test.

This is a coverage gap rather than a suspected defect. The fix is a fixture: one small JPEG data URL and one added upload assertion, in the same shape as the PNG one.

### Residual 2 — the warning when the cross-app link is unconfigured is not asserted

AC 8 requires that with `ATTENDEE_APP_URL` unset, an upload still saves the map and the organizer sees a warning that delegates may not see the change for up to five minutes, rather than the save being reported as failed.

The behaviour is built — `apps/web/components/FloorPlanClient.tsx` carries that message at three write paths and a standing notice — but no assertion covers it, because reproducing it means running the admin app with the setting removed. Verified by reading the component on 2026-08-02; not verified by running.

### Residual 3 — the deployed environment is untested, and two actions belong to a person

- **`ATTENDEE_APP_URL` is set on no hosting project.** Until it is, no cross-app invalidation reaches production, however green everything above is. The live pair confirmed on 2026-08-02 is the admin project `wbr-web` pointing at `https://wbr-mobile.vercel.app`. **There are duplicate projects** — `wbr-web` and `wbr-admin` both build `apps/web`, and `wbr` and `wbr-mobile` both build `apps/attendee` — so setting it on the wrong one does nothing and looks done.
- **Whether the floor-plan permission is switched on for the organizer role in the deployed admin app has not been checked** (Staff → Roles & Permissions). F-18: a key added after a role's permissions were saved is not in that saved list, so the screen is invisible with nothing explaining why, and it reads as the feature not having been deployed. The development database has no saved role config, so the key is granted automatically there and **every local check passes**. One-time per environment, not per deploy.

### Residual 4 — control 6 is not in the control script

The sponsor-portal control described in Step 9 was run by hand and its result recorded there. It should be added to `phase-10-negative-controls.sh` as a sixth `run_control` entry with predicted count 1, so it cannot go stale unnoticed — which is the exact failure the driver's own gates exist to prevent.

### Residual 5 — an unexplained timing pattern, mitigated but not understood

After a change, the participant app's server either serves the new data in 4–18 milliseconds, or is still serving the old data after 5 seconds. Never in between.

Ruled out by experiment: coarse timestamps in the cache, rejected notifications, mismatched secrets between the apps, and a fault in the receiving route. **Cause unknown.** It has not appeared in the last nine consecutive runs, including four during the 2026-08-02 assessment. It has previously cost the suite 0 to 3 assertions on some runs.

The push to open connections hides it from delegates, since their phones are told to refetch regardless. That is a mitigation and also a reason to keep looking rather than to stop.

---

## What green here does not mean

Green is evidence about the assertions listed above and nothing wider.

- **It says nothing about markers.** Placing them is Phase 11. A map uploaded through this phase reaches the participant viewer with nothing on it, which is why Phases 10 and 11 are one demonstrable unit rather than two.
- **It says nothing about the push reaching every delegate.** The register of open connections is an ordinary variable in the memory of **one** copy of the participant app, and one notification arrives at one copy. Under load the platform runs several; the others are never asked and cannot report not having been asked. Nothing errors, nothing is logged, and every test passes, because a development machine runs exactly one copy — so this limit **cannot be observed here** and no assertion above should be read as evidence against it. A slow background refresh sits behind it so unreached phones still converge. Removing the limit needs a shared channel, which was weighed on 2026-08-02 and deliberately not taken for the demonstration; the reasoning and its four commitments are in `CHANGELOG.md` under "How quickly a change reaches a delegate's phone". What would reverse that decision: an audience in the hundreds, or a demonstration where people watch phones while a map is edited.
- **It says nothing about real pictures.** The size and dimension limits are checked with small generated files carrying declared sizes in their headers, not with a photograph or a real venue plan.
- **It says nothing about the deployed environment** — see § Residual 3.
- **Five assertions in the Phase 1, 3 and 4 gate suites aim at addresses that no longer exist**, and are counted as passes in Step 1's baselines. `/api/posts/[id]/like` does not exist in the participant app, so it answers 404 where 403 is expected; `/api/chat/rooms` exports only `POST`, so a GET gets 405. Nothing under `posts` or `chat` was modified by this phase. Those assertions cannot detect a broken gate — they are coverage that reads as real and is not. Outside this phase, and a genuine gap in onboarding-gate coverage.
