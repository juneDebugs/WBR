# Phase 1 Smoketest — the meetings portal enforces the onboarding gate

> Plan: `.claude/plans/wbr-uat-followups-2026-08-07.md` § Phase 1
> Requirements: `.claude/docs/prds/wbr_uat_followups_2026_08_07.md` (user stories 11 and 12; findings UF-10, UF-28, UF-30)
> Written to [`docs/smoketests/CONTRACT.md`](CONTRACT.md).

Manual verification path. Both a person and an agent are valid runners. Most of it is driven
by one script, [`playwright/phase-1-meetings-onboarding-gate.mjs`](playwright/phase-1-meetings-onboarding-gate.mjs);
steps 8 and 9 are read by eye because they are about source and about what a screen looks
like.

## What this verifies

1. A delegate with an incomplete profile signing in to the meetings portal lands on the
   checklist, which names exactly the fields that are missing — plan AC 1.
2. From that blocked state, every participant-facing data address refuses — plan AC 2.
3. From that blocked state the profile-save address accepts, and saving the last missing
   field releases the person into the portal — plan AC 3.
4. Both authenticated route groups are gated — plan AC 4.
5. A WBR-side account with a deliberately incomplete profile reaches every screen including
   the staff queue, and is refused at no data address — plan AC 5.
6. The checklist is reachable while blocked and does not redirect to itself — plan AC 6.
7. No new role list exists in the portal — plan AC 7.
8. The gate reads the required set rather than a stored completed marker — plan AC 8.
9. The profile-save address stores a name, and a save that omits a field leaves that field as
   it was — plan AC 9 and AC 10, finding UF-30.
10. Emptying a required field on the portal's own profile screen sends that person to the
    checklist without a manual reload — plan AC 11, finding UF-32.
11. An account whose role is revoked while its session is live is refused by the staff addresses
    and by the staff screen — plan AC 12, finding UF-31.
12. The save address refuses a body it cannot store, rather than answering with a server error or
    reporting success for a write that leaves the person blocked, and the checklist cannot enter a
    value that address will refuse for length — plan AC 13 and AC 14, finding UF-33.

**No perf-bar step.** This phase adds one database read to a layout that already renders
server-side, and one to each guarded address, both on the row the handler needs anyway.
Nothing here changes a payload size or a render path. The equivalent cost was measured once
already, on the sponsor portal, and recorded in `phase-5-sponsor-screen-gate.md` § Step 6.
Stated rather than omitted, per CONTRACT.md §2.4.

## Prerequisites for the runner

- The meetings portal reachable at `MEETINGS_BASE_URL`, default `http://localhost:3002`,
  **serving this branch**.
- `apps/meetings/.env.local` holding `DATABASE_URL` as an **absolute** `file:/…` path and
  `NEXTAUTH_SECRET`. A relative path does not resolve at runtime and every page fails with
  "Unable to open the database file".
- `sqlite3` on the path, for the two steps that read the database directly.
- Playwright with Chromium installed. Two of the script's checks need a real browser and say so
  in place; the rest are plain requests.

### Check what is on the port before trusting it

```
lsof -nP -iTCP:3002 -sTCP:LISTEN
ps -o pid,etime,command -p <pid>
```

An age measured in days rather than minutes means the process is not this run's server, and
it is serving code from whenever it started. That mistake cost two hours during phase 6, on a
different port, and produced a failure that looked exactly like a code fault.

### Signing in here replaces your session in the other three apps

All four applications run on `localhost` and a cookie ignores the port, so they share one
sign-in. Signing in to the portal as the demonstration delegate replaces whatever session the
admin application had. Nothing in this run needs another app open; if one is, expect to sign
in again afterwards.

### The accounts this run uses, and why

- **`onboarding-demo@test.com` / `password123`** — the canonical account held one field short
  on purpose: complete except `solutionsSeeking`, which is an empty list. It is the only
  seeded account in the blocked state, and it is admitted to this portal because its role is
  `ATTENDEE`. The script snapshots its fields on start and restores them on exit; if a run
  dies half way, `pnpm db:backfill-onboarding` returns it to the blocked state.
- **A throwaway `STAFF` account**, created and deleted inside the run. Two reasons it is not
  `wbr@test.com`. That account is complete, so making the point would mean damaging the
  primary demonstration login — and the self-heal in `packages/db/src/test-accounts.ts`
  repairs password, role and company link only, so a broken profile would stay broken. And
  `STAFF` rather than `ORGANIZER` is the point of step 5: an exemption written by hand around
  the organizer account would pass with `ORGANIZER` and fail here.
- **A throwaway `ATTENDEE` account**, created complete and then broken, for step 7. No seeded
  account can be used, because the check needs the same person to pass and then be refused.

## Steps

### Step 1 — Run the script [contract]

**Verifies:** ACs 1 to 6 and 8 to 10. Every assertion is a binary observable — a redirect
settles somewhere or it does not, an address answers 403 or it does not, a column holds a
value or it does not.

```bash
node docs/smoketests/playwright/phase-1-meetings-onboarding-gate.mjs
```

- [ ] The run ends with a count and exits 0.
  - **Pass:** the last line reads `82 passed, 0 failed`, and the cleanup block reports
    `restored onboarding-demo@test.com: solutionsSeeking="[]"` plus one deleted row for each
    throwaway account.
  - **Fail:** any `✗` line, or a non-zero exit, or a cleanup line reporting 0 deleted rows —
    which means a throwaway account is still in the database and must be removed by hand.

What the script asserts, in the order it runs:

| Group | Assertions |
|---|---|
| AC-1, AC-6 | `/onboarding` answers 200 while blocked; the checklist renders; it names `solutionsSeeking` as missing and names none of the five fields the account holds |
| AC-4 | each of `/`, `/browse`, `/meetings`, `/requests`, `/profile` and `/staff` ends at `/onboarding` with a 200, following the whole redirect chain with a hop cap |
| AC-2 | all ten participant-facing handlers answer 403 |
| AC-3 | `PATCH /api/profile` answers 200 while blocked, the value reaches the database, `/` then answers 200, all ten addresses answer the status they owe a released caller, and clearing the field blocks the same session again |
| AC-5, AC-7 | the throwaway `STAFF` account gets 200 on all six screens, gets the exact status each address owes a released caller — 200 from the eight reading ones and 400 from the two write probes — and is redirected away from the checklist |
| AC-8 | a complete delegate reaches `/`; clearing `annualRevenue` sends the same account back to the checklist |
| AC-9 | a name sent to the save address is in the `name` column afterwards |
| AC-10 | a save carrying only the six required fields leaves a stored `solutionsOffering` untouched |
| AC-11 | `/api/staff/companies` answers 200 for a working staff account; **all nine** staff addresses then answer 403 on the same session once the role is revoked in the database; a browser sent to `/staff` while revoked lands on `/browse`; the first address answers 200 again once the role is restored |
| AC-12 | a complete delegate opens `/profile` in a browser, empties `company`, saves, and the browser moves to the checklist with no manual reload; the checklist's three text boxes stop at 1000 characters |
| AC-13 | the save address answers 400 to a JSON `null`, a bare number, a bare string, an array, unparseable text, a solutions list holding a number, and an overlong company — and still answers 200 to a well-formed body |

**Why the exact statuses matter.** The exempt-account checks assert the precise status each
address owes, not merely "something other than 403". Asserting the loose form was a real defect
in an earlier version of this script: an address answering 500 read as "not refused" and the
exemption criterion passed while the portal was broken. Recorded as UF-34.

**Why all nine staff addresses.** The claim is about the console's addresses as a group. One of
them answering correctly says nothing about the other eight, any of which could still read the
role from the session token. They are probed in the revoked state, where `requireStaff()` refuses
before any handler reads its body — so the write probes among them cannot touch the event's real
schedule.

### A note on what an HTTP status can and cannot tell you here

AC-11's screen check uses a real browser, and the reason is worth knowing before writing any
future assertion against this app.

`/staff` has a `loading.tsx`. That creates a suspense boundary, so the response starts streaming
before the page component has finished, and a `redirect()` inside the page is delivered **inside
a 200** rather than as a 307. Measured both ways during this phase: with `loading.tsx` in place,
a revoked account's `GET /staff` answers 200 carrying a `NEXT_REDIRECT` to `/browse` and none of
the console's content; with `loading.tsx` moved aside, the same request answers `307 /browse`.

So an HTTP-level assertion on that screen would report a screen "reached" that nobody ever sees —
a false failure, or worse, a false pass in the other direction. The AC-4 assertions above are
HTTP-level and are correct, because those redirects come from a **layout**, which runs before the
boundary exists. That is also a reason the onboarding gate belongs in the layout rather than in
each page.

### Step 2 — The redirect chain is followed, not assumed [contract]

**Verifies:** that step 1's AC-4 assertions mean what they say.

The script does not stop at "307 to somewhere". It follows each chain by hand with a cap of
six hops and asserts where it settles. A chain that never settles is reported as a failure
rather than hanging. This exists because the worst defect of an earlier session was a check
that observed one redirect, called it a pass, and never noticed the endless loop behind it.

- [ ] Read the `looped` branch in `followChain` in the script.
  - **Pass:** a chain that exceeds the cap produces a `✗` naming every hop.
  - **Fail:** the cap is absent, or exceeding it is treated as anything other than a failure.

### Step 3 — Negative controls: the script fails when the gate is removed [contract]

**Verifies:** that step 1 passing is evidence of anything at all.

Four defects were reintroduced one at a time, the script re-run, and the change reverted.
Run of 2026-08-07:

| Defect reintroduced | Result |
|---|---|
| `enforceOnboardingGate()` removed from `(portal)/layout.tsx` | 41 passed, **7 failed** |
| `enforceOnboardingGate()` removed from `staff/layout.tsx` | 47 passed, **1 failed** |
| the guard removed from one address (`/api/browse/people`) | 47 passed, **1 failed** |
| the save address returned to writing `null` over an omitted solutions list | 47 passed, **1 failed** |
| `requireStaff()` returned to reading the role from the session token | 54 passed, **1 failed** |
| the staff page returned to reading the role from the session token | 54 passed, **1 failed** |
| `router.refresh()` removed from the profile screen's save | 53 passed, **2 failed** |
| the body-shape check removed from the save address | 60 passed, **5 failed** |
| the string-element check removed from the solutions lists | 64 passed, **1 failed** |
| the 1000-character limit removed from the checklist boxes | 64 passed, **1 failed** |
| one data address made to throw a server error | 80 passed, **2 failed** |
| `requireStaff()` returned to the token role, re-run after review round 3 | 73 passed, **9 failed** |

**The pass counts differ between rows because the script grew.** The first four rows were run
against a 48-assertion script before the review cycle; the next three against 55 assertions after
round 1; the next three against 65 after round 2; the last two against the current 82. A row's
pass count is not comparable across rows — only its failure count is.

Two rows are worth reading together. `requireStaff()` on the token role failed **one** assertion
before review round 3 and **nine** after, because round 3 found that the check probed one staff
address while claiming all of them. The row above it, an address made to throw, is the control for
the other half of that finding: under the earlier loose check a server error read as "not
refused" and passed.

- [ ] Reintroduce any one of them and re-run.
  - **Pass:** the run reports at least one `✗` and exits non-zero.
  - **Fail:** the run still reports `0 failed` — the assertion covering that defect is not doing
    its job, and every earlier result that rested on it is worth less than it appeared to.

Most rows fail by exactly one assertion, which is the intended shape: each defect has one check
aimed at it. Three fail by more, for reasons that are themselves worth checking. Removing the
screen gate opens five portal screens, the staff screen behind them and the re-block check, so it
fails seven. Removing the body-shape check leaves five malformed bodies unrefused. Removing the
profile screen's refresh fails both the place the browser ends up and what reached the database.

### Step 4 — Type check [contract]

Turbo stops at the first failing package, which is always the participant app because of its
documented pre-existing error, so each is checked separately:

```bash
for app in meetings web sponsor attendee; do (cd apps/$app && npx tsc --noEmit); done
```

- [ ] Run it.
  - **Pass:** `meetings`, `web` and `sponsor` exit 0 with no output; `attendee` reports
    exactly one error, `components/BottomNav.tsx(43,101) TS2514`, which is documented in
    `CLAUDE.md` and must not be "fixed" here.
  - **Fail:** any other error, in any package.

`pnpm lint` cannot run: no app in this repository holds an ESLint configuration, so
`next lint` drops into its interactive setup and exits 1. `pnpm typecheck` is the only working
static check. Stated so a runner does not read the lint failure as this phase's doing.

### Step 5 — The checklist as a person sees it [contract]

**Verifies:** AC 1, by eye. The script asserts the missing field is named; this asserts the
screen is usable.

- [ ] Sign in at `http://localhost:3002/login` as `onboarding-demo@test.com` / `password123`.
  - **Pass:** the browser ends on `/onboarding`. The heading reads `Complete your profile`.
    The outstanding list reads `Still needed (1)` above a single entry,
    `Solutions you're seeking`. The submit button reads `1 still needed` and is disabled.
  - **Fail:** the portal opens instead; or the navigation bar renders around the checklist,
    which would let a blocked person click around the gate.
- [ ] Pick one solution chip.
  - **Pass:** the outstanding card changes to `Everything required is filled in.` and the
    button becomes enabled and reads `Enter the portal`.
  - **Fail:** the button stays disabled with every required field filled in.
- [ ] Press it.
  - **Pass:** the browser leaves `/onboarding` and the portal dashboard renders with its
    navigation bar. Pressing Back does **not** return to the checklist — measured on 2026-08-07,
    Back lands on `/login`, because the checklist replaces itself in history rather than adding to
    it. A signed-in person on `/login` is bounced back to the portal by `middleware.ts` on the
    next server round trip; the sign-in form appearing for a moment is how this app behaved before
    this phase and is not something it changed.
  - **Fail:** the checklist reappears, with or without the answers — that is the defect the
    full page load in the submit handler exists to prevent, recorded in the participant app's
    equivalent screen.
- [ ] Return the account to its blocked state afterwards. **The command needs `DATABASE_URL` in
  its environment** — it reads no `.env.local`, and without it exits 1 with
  `Set DATABASE_URL (e.g. file:./dev.db)`. Measured on the 2026-08-07 run, where the bare command
  in an earlier version of this document failed and left the account completed. Give it an
  absolute path, and look before you write:
  ```bash
  DB="file:$PWD/packages/db/prisma/dev.db"
  DATABASE_URL="$DB" pnpm db:backfill-onboarding --dry-run
  DATABASE_URL="$DB" pnpm db:backfill-onboarding
  sqlite3 packages/db/prisma/dev.db "select email, solutionsSeeking from User where email = 'onboarding-demo@test.com';"
  ```
  - **Pass:** the dry run says it would reset `onboarding-demo@test.com` and would update 0 other
    accounts; the real run ends `PASS — the only blocked account is onboarding-demo@test.com`;
    the query prints `onboarding-demo@test.com|[]`.
  - **Fail:** anything else — the demonstration prop is used up and the gate cannot be shown
    on cue.
  - **Do not reach for `pnpm db:seed` instead.** It deletes every user whose id is not in its own
    generated list, and none of this demonstration dataset carries those ids. The script's own
    header says so.

### Step 6 — The staff queue is reachable for the people who run the event [contract]

**Verifies:** AC 5, by eye, on the account that is actually used on stage.

- [ ] Sign in as `wbr@test.com` / `password123` and open `/staff`.
  - **Pass:** the meeting engine console renders. No checklist appears at any point.
  - **Fail:** any redirect to `/onboarding`.

This account is complete, so it would pass a gate that had no exemption at all. Step 1's
throwaway `STAFF` account is the one that proves the exemption exists. Both are here on
purpose: this one is the account the demonstration uses.

### Step 7 — No second list of roles [contract]

**Verifies:** AC 7, structurally. Read rather than asserted, because a test that names a
function breaks on a rename while passing through a real behaviour change.

- [ ] `grep -rn "ORGANIZER\|ADMIN\|'STAFF'" apps/meetings/lib apps/meetings/app`
  - **Pass:** no role name appears in `lib/onboarding-gate.ts`,
    `lib/require-complete-profile.ts` or `app/(authenticated)/onboarding/page.tsx`. All three
    call `isWbrStaff()` from `packages/db/src/app-access.ts`, which is the same function
    `APP_ALLOWED_ROLES` is built from.
  - **Fail:** a role name written out in any of those three files.

The behavioural half is step 1's AC-5 group, and it is the half that can go wrong: the
account used there holds `STAFF`, so a list hand-written around `ORGANIZER` fails.

### Step 8 — The required set has one definition [contract]

**Verifies:** the decision recorded in ADR 0008's amendment — that this portal did not gain a
second answer to "is this profile complete?".

- [ ] `grep -rn "DELEGATE_REQUIRED\|missingDelegateFields\|isRequiredSetComplete" apps/meetings`
  - **Pass:** every hit resolves to `@conference/db` or the deep import
    `@conference/db/src/onboarding-policy`. No field list is written out inside
    `apps/meetings`.
  - **Fail:** a list of field names declared in this app.

The eight-field percentage on this portal's dashboard (`components/DashboardView.tsx`) is
untouched and is not a hit for this grep. It is a nudge, not a block, and it is left as it
was.

## Step summary

| Step | Category | Environment | Status (2026-08-07 run) |
|---|---|---|---|
| 1. Run the script | contract | local production build (tier C) | PASS — 82 passed, 0 failed |
| 2. Redirect chain is followed | contract | reading the script | PASS |
| 3. Negative controls | contract | local dev and production build | PASS — 9 defects reintroduced, 9 caught |
| 4. Type check | contract | anywhere | PASS — `meetings`, `web`, `sponsor` clean; `attendee` reports only the documented `BottomNav.tsx` error |
| 5. The checklist by eye | contract | local production build | PASS — see below |
| 6. Staff queue reachable | contract | local production build | PASS — the console renders for `wbr@test.com`, no checklist |
| 7. No second role list | contract | reading source | PASS |
| 8. One required-set definition | contract | reading source | PASS |

### What the 2026-08-07 run recorded for step 5

Landed on `/onboarding` after signing in. Heading `Complete your profile`. Outstanding card
`STILL NEEDED (1)` above `Solutions you're seeking`. Button `1 still needed`, disabled. **No
navigation bar on the checklist** — which is what stops a blocked person clicking around the gate.
Picking one solution changed the card to `Everything required is filled in.` and the button to
`Enter the portal`, enabled. Pressing it landed on `/` with the navigation bar present. Back went
to `/login`, not to the checklist.

Two defects in this document were found by running it, both in step 5 and both now fixed here: the
restore command was given without `DATABASE_URL` and fails without it, and the Back criterion said
only what must not happen without saying what does.

## Pass / fail

The phase ships when every step above passes on a running workspace, and the demonstration
account is verified back in its blocked state afterwards. Local type-check passing is not one
of the conditions on its own — it is step 4 of eight.

## Re-run trigger

Re-run this in full whenever a later phase touches:

- `apps/meetings/lib/onboarding-gate.ts` or `apps/meetings/lib/require-complete-profile.ts`
- `apps/meetings/lib/staff-api.ts` — its role read is asserted here (UF-31)
- `apps/meetings/components/ProfileForm.tsx` — its refresh after saving is asserted here (UF-32)
- any layout under `apps/meetings/app/(authenticated)/`, and `staff/loading.tsx`, whose presence
  decides whether that page's redirect is a 307 or is streamed inside a 200
- any handler under `apps/meetings/app/api/` that a participant can reach
- `packages/db/src/onboarding-policy.ts` or `packages/db/src/app-access.ts`
- `packages/db/src/test-accounts.ts` — phase 2 of this plan changes it, and this run depends
  on the demonstration account's blocked state
