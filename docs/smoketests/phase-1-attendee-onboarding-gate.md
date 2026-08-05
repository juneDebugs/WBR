# Phase 1 smoketest — attendee onboarding gate + checklist

Shape rule: [`docs/smoketests/CONTRACT.md`](CONTRACT.md). Source PRD and implementation plan are engineer-local (gitignored): the floor-plan + onboarding PRD dated 2026-07-21, §Phase 1 of its plan. Design of record for the later floor-plan phases: [ADR 0007](../adr/0007-floor-plan-human-authored-pins-over-raster.md).

Automated runner: [`playwright/phase-1-attendee-onboarding-gate.mjs`](playwright/phase-1-attendee-onboarding-gate.mjs).

---

## What this verifies

Every check below is a **contract check** (§1.1) — it depends on application code, not on the environment the code runs in. A redirect either happens or it does not; a field label is either listed or it is not. There are **no perf-bar checks in this phase**: Phase 1 makes no performance claim, so no tier-A/B/C measurement is required or offered.

| # | In plain language | Plan AC |
|---|---|---|
| 1 | An attendee whose profile is missing a required field cannot open any section of the app, and is put on the checklist instead. | AC-1 |
| 2 | The checklist names exactly the fields still outstanding — no extras, nothing omitted. | AC-2 |
| 3 | The checklist asks what the attendee is *seeking*, never what they are *offering*. | AC-6 |
| 4 | Filling in the outstanding fields lets the attendee into the app in a single step. | AC-3 |
| 5 | An attendee who is already complete is not made to sit on the checklist. | AC-3 |
| 6 | Leaving the "solutions seeking" picker empty counts as missing, not as filled. | AC-5 |
| 7 | Clearing a required field on the Settings screen puts the attendee back behind the gate, without needing a page reload — and Settings still edits those fields. | AC-4, AC-7 |
| 8 | Onboarding works on email and password alone, with no outside sign-in service configured. | AC-8 |
| 9 | The checklist page itself stays reachable while the attendee is blocked (no redirect loop). | AC-9 |

## Required-set definition under test

`name`, `jobTitle`, `company`, `companySize`, `annualRevenue`, and at least one `solutionsSeeking`. Held as one constant, `ATTENDEE_REQUIRED_FIELDS` in `apps/attendee/lib/profile-completeness.ts`. Photo, bio, website and LinkedIn URL are optional and must never block.

## Prerequisites

1. **Environment file.** `apps/attendee/.env.local` needs `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` per README §2.

   ⚠️ `DATABASE_URL` must be an **absolute** `file:` path. The README's relative form (`file:../../packages/db/prisma/dev.db`) does not resolve at runtime and produces `Error code 14: Unable to open the database file` on every page. Use:

   ```
   DATABASE_URL="file:/absolute/path/to/repo/packages/db/prisma/dev.db"
   ```

2. **Generated database client.** Run `pnpm db:generate`. Skipping it yields dozens of misleading `packages/db` type errors that look like broken source but are a stale generated client.

3. **Demo attendee account.** `stephcurry@test.com` / `password123`. If the row is absent from the local database it self-heals on first sign-in (`ensureCanonicalTestAccount`, `packages/db/src/test-accounts.ts`). Do not run `pnpm db:reset-test-accounts` for local setup — that script targets remote Turso and fails without Turso credentials.

4. **App running.** `pnpm --filter attendee dev` (port 3001). All checks here are contract checks, so dev mode is valid (§1.1).

5. **Playwright + chromium** installed.

## How to run

```
node docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs
```

Override the target with `ATTENDEE_BASE_URL` (for example a Vercel preview URL). The script snapshots the demo account's required fields on start and restores them on exit, so a run leaves the demo profile as it found it.

---

## Step 1 — every gated section blocks an incomplete attendee [contract]

Sign in with email and password, then clear `companySize` and `annualRevenue`. Request each of `/home`, `/schedule`, `/speakers`, `/people`, `/meetings`, `/chat`, `/my-schedule`, `/setup` without following redirects.

**Pass criterion:** all eight return a 3xx status whose `Location` header contains `/onboarding`.

## Step 2 — the checklist is reachable and lists exactly what is outstanding [contract]

Request `/onboarding` with the same blocked session, then load it in a browser and read every element matching `[data-testid^="onboarding-missing-"]`.

**Pass criterion:** `/onboarding` returns 200 (not a redirect), the element `[data-testid="onboarding-checklist"]` is present, and the listed labels are exactly `["Annual revenue", "Company size"]` — no third entry, neither one absent.

## Step 3 — seeking, never offering [contract]

Read the checklist's full rendered text and count any `[data-testid^="onboarding-solutionsOffering-"]` controls.

**Pass criterion:** the text contains `seeking`; the text contains no occurrence of `offer`; zero `solutionsOffering` controls are rendered.

## Step 4 — completing the required set releases the attendee in one hop [contract]

On the checklist, click the company-size and annual-revenue options, then submit.

**Pass criterion:** the submit control reports enabled once nothing is outstanding; after submitting, the URL path is exactly `/home`; and all eight gated sections then return 200.

## Step 5 — a complete attendee is not held on the checklist [contract]

Request `/onboarding` with a complete profile, without following redirects.

**Pass criterion:** a 3xx status whose `Location` header contains `/home`.

## Step 6 — an empty multi-select counts as missing [contract]

Write `solutionsSeeking` as the two-character string `"[]"` with every other required field populated, then request `/home`.

**Pass criterion:** `/home` returns a 3xx redirect to `/onboarding`. This is the case that matters: an empty selection persists as the string `"[]"`, which is truthy, and a plain truthiness test would wave it through as filled.

## Step 7 — clearing a required field in Settings re-blocks without a reload [contract]

With a complete profile: enter the app, visit `/people` and return to `/home` (so `/people` is in the browser's page cache — the hard case, see the known limit below). Open `/setup`, un-tick every "Solutions I'm Seeking" chip through the real Settings UI, and save. Then attempt an in-app navigation.

**Pass criterion:** the Settings save returns HTTP 200; at least one seeking chip was selected beforehand (confirming Settings still edits these fields, AC-7); and without any page reload the attendee ends on `/onboarding` with the outstanding list containing exactly `Solutions you’re seeking`.

## Step 8 — no outside sign-in service required [contract]

Every preceding step authenticates with email and password only. Additionally, read `/api/auth/providers`.

**Pass criterion:** a `credentials` provider is configured. A `linkedin` provider is expected to be absent before Phase 7; its presence is reported but does not fail the run.

## Step 9 — the full-screen chat route group is gated too [contract]

Regression guard for a hole adversarial review found after the first eight steps were already passing. The attendee app has **two** authenticated route groups with their own layouts: the tabbed `(app)` group, and `(fullscreen)`, which holds `/chat/[roomId]`. The first cut of the gate guarded only `(app)`. Measured result at the time: `/chat` returned a 307 to the checklist while `/chat/room-general` returned 200 — an attendee with an empty required field was blocked from every section yet could still open a chat room and post in it.

The original steps missed it because they exercised `/chat` (the conversation list, inside `(app)`) and never `/chat/[roomId]` (the room, in a different group).

Request `/chat/gate-probe-room` with an incomplete profile, then with a complete one. No room membership is required: the layout runs before the page's membership check, so the redirect happens for any room id. That keeps the check free of seed-data dependencies and working against a preview deployment.

**Pass criterion:** while incomplete, the request returns a 3xx whose `Location` contains `/onboarding`; once complete, the same request does **not** redirect to `/onboarding` (ruling out over-blocking).

**Standing risk this does not remove:** nothing at the framework level forces a *new* authenticated route group to call the gate. The check is a shared function (`apps/attendee/lib/onboarding-gate.ts`) called from each group's layout, so adding a group means adding a call. That is a convention, not an enforcement — a future group added without it reopens exactly this hole.

## Step 10 — API calls that change data are gated too [contract]

Regression guard for the second hole adversarial review found. The gate is a check inside route-group layouts. **API route handlers are not rendered inside any layout**, so it never ran for them. Measured before the fix: an attendee blocked from every page could still `POST /api/friend/<id>` and receive `200 {"status":"pending_outgoing"}` — creating a pending friend request against another attendee. It could also read the attendee list (45,914 bytes) and the schedule (1,447,106 bytes).

Against AC-1's literal wording this is arguable, since it names sections rather than endpoints. Against user story 3 it is not: *"so that I cannot half-use the app with a broken profile."*

The fix is a shared guard, `apps/attendee/lib/require-complete-profile.ts`, returning 403, applied to the 13 route files that change data (15 handlers).

**Pass criterion:** while incomplete, `POST /api/friend/…`, `/api/posts/…/like`, `/api/chat/global` and `/api/sessions/…/bookmark` all return **403**; `PATCH /api/profile` returns **200**; once complete, the first of those is **not** 403.

**Why `PATCH /api/profile` is deliberately exempt:** the checklist saves through it. Guarding it would make the required set impossible to fill in and trap every incomplete attendee behind the gate permanently. That exemption is asserted explicitly, because getting it wrong is far worse than the hole it patches.

**Why the once-complete assertion is "not 403" rather than a specific success code:** the probe uses ids that do not exist, so the route's own validation may legitimately reject the request with 400 or 404. "Not 403" isolates the question actually being asked — did the guard step aside — without depending on seed data.

**Still open, deliberately:** read-only endpoints are **not** guarded. An incomplete attendee can still `GET` the attendee list and schedule. Acting as a half-registered attendee is the sharper problem and is now closed; gating every read is a much wider change across ~30 route files. Recorded as a follow-up rather than quietly dropped.

---

## Known limit — measured, not assumed

The gate is a server-side check on the attendee app shell (`apps/attendee/app/(authenticated)/(app)/layout.tsx`). It fires on a fresh page load, on direct entry to any URL, and on in-app navigation to a section not yet visited in the session.

It does **not** fire on in-app navigation to a section already visited, because `apps/attendee/next.config.js` sets `experimental.staleTimes.dynamic = 300`: the browser reuses that page for five minutes without asking the server, so no server code runs to redirect. Measured directly — a `template.tsx` in place of the layout was tried and behaved identically, so the placement is not the cause.

| In-app navigation to… | Server gate fires? |
|---|---|
| a section never visited this session | yes |
| a section already visited this session | no — browser reuses the cached page |
| any URL after a full page load | yes |

This is closed at the only in-app place a required field can be cleared: the Settings screen calls `router.refresh()` after saving, which drops the browser's cached pages. Step 7 verifies that path end to end.

**What remains uncovered:** a required field changed from outside this browser tab — an organizer editing the profile in the admin app, or the same person on another device — leaves the open tab able to browse already-visited sections for up to five minutes. Lowering `staleTimes.dynamic` would close this, but that setting is a deliberate performance decision from an earlier phase and reversing it is not in Phase 1's scope. Recorded as a follow-up rather than silently accepted.

---

## Seeded data does not satisfy the required set (open item)

Measured on the local seeded database after this phase landed: of 560 accounts able to sign in to the attendee app, **297 (53%) are blocked by the gate** — 297 missing `solutionsSeeking`, 6 company size, 6 annual revenue, 1 job title, 1 company. The canonical demo-attendee definition itself omits company size and annual revenue, so a freshly seeded or self-healed demo account starts out blocked.

The gate is behaving as specified; the seed was authored before a required set existed. Recorded as **Finding F-2** in the PRD with options and a recommendation. Nothing has been backfilled — seed changes are outside this phase's scope, and what the 2026-08-11 demo should show is a decision for the engineer of record with the project owner.

**Consequence for anyone running this smoketest:** the script restores the demo account to whatever state it found. If that state was already blocked, the run ends with a loud `[warn]` saying so, and the account needs its required fields populated before anyone demos with it. A clean run ends with `demo profile restored; the account is past the gate and usable` — that line is produced by asking the running gate, not by assuming the restore worked.

---

## Summary

| Step | Category | Tier | Plan AC | Status |
|---|---|---|---|---|
| 1 — every gated section blocks | contract | n/a | AC-1 | ✅ pass (8/8 sections) |
| 2 — checklist reachable, lists exactly | contract | n/a | AC-2, AC-9 | ✅ pass |
| 3 — seeking never offering | contract | n/a | AC-6 | ✅ pass |
| 4 — completing releases in one hop | contract | n/a | AC-3 | ✅ pass (8/8 sections open) |
| 5 — complete attendee leaves checklist | contract | n/a | AC-3 | ✅ pass |
| 6 — empty multi-select counts as missing | contract | n/a | AC-5 | ✅ pass |
| 7 — Settings clear re-blocks, no reload | contract | n/a | AC-4, AC-7 | ✅ pass |
| 8 — no outside sign-in required | contract | n/a | AC-8 | ✅ pass |
| 9 — full-screen group gated too | contract | n/a | AC-1 (regression) | ✅ pass |
| 10 — data-changing API calls gated | contract | n/a | AC-1 (regression) | ✅ pass |
| 11 — malformed optional array does not break Settings | contract | n/a | AC-7 (regression) | ✅ pass |

## Step 11 — a malformed optional array does not break Settings [contract]

The multi-select columns hold JSON-encoded arrays as text. The Settings screen used a bare parse with no error handling, so a malformed value threw during render. The reachable case is the **optional** "solutions offering" field: a malformed value there does not trip the gate, so an otherwise-complete attendee reaches Settings and it fails. (Malformed "solutions seeking" is not reachable this way — it reads as missing, so the gate blocks the screen first.)

Measured before the fix: with the value set to `{`, the Settings heading never rendered and body text collapsed from 1,283 characters to 127, with a JSON parse error thrown in the browser.

**This is invisible over HTTP.** The server returns 200 either way, because the component renders in the browser. A status-code check cannot see it; the assertion needs a real page load.

**Pass criterion:** for each of `{`, `not json at all`, `"a string"` and `42` written to `solutionsOffering`, the Settings heading renders, body text is at least 80% of the same run's baseline length, and zero page errors are raised. Baseline is measured in the same run rather than hard-coded.

## Verified by hand, not scripted — the fail-closed guard

One round-3 finding cannot be asserted by this script, because it needs a user row deleted and there is no endpoint for that. Verify manually when touching the API guard:

```
# create a throwaway attendee, sign in, keep the cookie
# then delete its user row and call a data-changing endpoint
POST /api/friend/<someone>   with row present  -> 200
POST /api/friend/<someone>   with row DELETED  -> 403   (must not be 200)
```

Before the fix this returned 200 and created a friend request on behalf of a user that no longer existed — several handlers upsert a minimal user before acting, so a guard that allowed the request let them recreate an incomplete account and proceed. This matters in practice because the seed script deletes thousands of users, so sessions pointing at deleted rows are an ordinary consequence of reseeding.

**Run record:** 53 assertions passed, 0 failed. Local dev server (port 3001), 2026-07-29. Valid tier for this phase: all steps are contract checks, so dev mode is a valid environment per §1.1; no perf-bar check exists to require tier B or C.

**Run record, 2026-08-05:** 54 assertions passed, **1 failed**. Local dev server and, separately, a local production build; the same result in both.

- The added assertion is **Step 4b**, a regression guard described below.
- The failure is `POST /api/posts/no-such-post/like -> 404 while incomplete — expected 403`. It is **not** caused by the 2026-08-05 change, which touched only a browser component and a test file: the failure was measured before that change was made. Something between 2026-07-29 and 2026-08-05 made that address answer "not found" before the guard runs. Recorded here rather than adjusted away, and left open.

**Step 4b, added 2026-08-05 — the checklist hands off with a full page load.**

The defect: completing the checklist ran `router.refresh()` then `router.replace('/home')`. `refresh()` returns nothing to wait for, so the navigation began before it finished, and `next.config.js` sets `experimental.staleTimes.dynamic` to 300 — the browser keeps a visited dynamic page for five minutes. The delegate was handed that cached copy: the checklist again, with their answers dropped. Pressing the button again repeated it. Found by a person completing the checklist on the deployed site.

What the save and the server did was correct throughout, and that is what made it hard to see. The answers reached the database, and a fresh request for `/onboarding` redirected to `/home` as designed. Only the browser was showing something stale.

**This step asserts the source, which breaks this plan's own rule against asserting implementation details.** The exception is earned because the behaviour is unobservable where it can be measured. Three behavioural assertions were written to catch it and all three measured green **with the defect reinstated** — a 20-second wait, a 5-second wait, and a check that the checklist had stopped rendering — in a development server and in a local production build, at 361 ms, 131 ms and 65 ms. The stale render needs a race that a machine talking to itself wins every time.

Step 4b instead reads the component, strips comments so the prose describing the defect does not trip it, and fails if `router.refresh()` and `router.replace()` are both called or if no full page load to `/home` is present. Verified to fail with the defect reinstated: 52 passed, 3 failed. Precedent for asserting source in this repository: `scripts/test-onboarding-policy.mjs` asserts the policy module carries no imports, for the same reason — getting it wrong is silent.

Step 4 keeps its original 20-second assertion, with a note recording that it measured green throughout the defect.

**History worth keeping:** the first eight steps passed 33/33 while a real AC-1 violation was live — the ungated `(fullscreen)` chat room. Green steps proved only what they exercised. Adversarial review found it; steps 8 and 9 grew out of that. Treat a green run as evidence about the listed assertions and nothing wider.
