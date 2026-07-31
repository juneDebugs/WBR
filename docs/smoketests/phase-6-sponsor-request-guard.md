# Phase 6 Smoketest — sponsor request guard

Manual verification path. Both human and AI agents are valid runners. Authored per [`docs/smoketests/CONTRACT.md`](CONTRACT.md).

- **Plan of record:** [`.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`](../../.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md) § Phase 6
- **Requirements:** OE 17, 18, 19, 20, 23
- **Review log:** [`docs/codex-reviews/phase-6-sponsor-request-guard.md`](../codex-reviews/phase-6-sponsor-request-guard.md)
- **Predecessor:** [`phase-5-sponsor-screen-gate.md`](phase-5-sponsor-screen-gate.md), whose handler enumeration this document verifies and extends
- **Scripts:** [`playwright/phase-6-sponsor-request-guard.mjs`](playwright/phase-6-sponsor-request-guard.mjs) (the suite), [`playwright/phase-6-negative-controls.sh`](playwright/phase-6-negative-controls.sh) (proof it can fail), [`playwright/phase-6-deployed-cache-check.mjs`](playwright/phase-6-deployed-cache-check.mjs) (AC-8)

---

## What this verifies

- A sponsor representative whose exhibiting company is missing any of the six required items is refused `403` at **all nine** reading addresses (AC-1) and **all ten** guarded changing addresses (AC-2).
- A representative whose company satisfies the six is refused by **none** of the nineteen (AC-3a), and the high-value changing addresses genuinely succeed for them (AC-3b).
- The profile-save address serves an **incomplete** representative, so the checklist can still be completed, and the save actually lands in the database (AC-4).
- A representative whose account is attached to **no company** is refused at all nineteen, not allowed (AC-5).
- Every request handler in the app is enumerated and marked guarded or deliberately exempt (AC-6).
- The teammate-registration address's status is decided by **reading its caller**, and the decision and reason are recorded (AC-7).
- The buyer-directory refusal is demonstrated on a **deployed preview** with two distinct signed-in sessions, and the result recorded either way (AC-8).
- Every refusal carries the same status and body shape as the participant app's (AC-9).

**What a green run is evidence of: the assertions listed here and nothing wider.** This is not a formality in this repository. Phase 1 passed 33 of 33 while a delegate blocked from every screen could still post in a chat room. Phase 5 passed 68 of 68 while the sponsor checklist was impossible to submit in a browser. **Before citing the 121 below, read § Negative controls** — the suite has been shown to go red for each behaviour it claims to cover.

---

## Prerequisites for the runner

```sh
# Tier C — a production build, not a dev server. Kill anything on the port first:
# a server started before your change serves stale code (check with `ps -o lstart=`).
lsof -ti:3003 | xargs kill -9
pnpm --filter sponsor build
cd apps/sponsor && WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true pnpm start

# For AC-9 only — the participant app, so the two apps' refusals are compared
# against each other rather than against a literal copied into the script:
pnpm --filter attendee build && (cd apps/attendee && pnpm start)   # port 3001

node docs/smoketests/playwright/phase-6-sponsor-request-guard.mjs
```

**`WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true` is not optional for a full run.** Two of the nineteen addresses sit behind that feature switch, which answers `404` before the guard runs. With the switch off the suite reports a loud SKIP for them rather than a pass, and the totals below become 17 addresses rather than 19. See § The two AI addresses.

Each app needs its own `.env.local` with `DATABASE_URL` (absolute `file:` path) and `NEXTAUTH_SECRET`. `apps/meetings/.env.local` was missing on the machine used for Phase 5; check all four exist before a run.

**This run touches nothing seeded.** It creates its own company, three accounts and one submission form, and deletes them at the end, verifying the deletion by counting rows. Phase 5's review found a probe that emptied columns on two arbitrary seeded companies and restored them only in a `finally` block, so a crash between writes left two real companies incomplete; this run has no such window. If it is killed part-way, the exact cleanup statements are **printed on startup** and are the same ones the cleanup block runs.

---

## Steps

### Step 1 — Every reading address refuses an incomplete representative [contract, tier C]

**Verifies:** AC-1. Nine reading addresses, asserted by looping over a list rather than a remembered sample.

- [ ] The suite creates a disposable company satisfying all six required items, clears its tagline, and walks the list.
  - **Pass:** each of the nine answers `403` **and** carries `onboardingRequired: true` in the body.
  - **Fail:** any other status, or a `403` without that marker.

**Why the body is checked and not only the status.** Several handlers in this app answered `403` for their own reasons before this phase existed — `"No sponsor"`, `"No sponsor linked"`, `"Forbidden"`. A status-only assertion cannot tell this phase's refusal from behaviour that predates it, and would therefore pass just as happily against a guard that was never called. Negative control 5 below removes the marker and confirms this half of the assertion is load-bearing.

### Step 2 — Every guarded changing address does the same [contract, tier C]

**Verifies:** AC-2. Ten changing addresses. Same list, same pass criterion.

### Step 3 — A complete representative is refused by none of the nineteen [contract, tier C]

**Verifies:** AC-3a — over-blocking ruled out in the same run.

- [ ] The same walk with the company complete.
  - **Pass:** none of the nineteen answers `403` with `onboardingRequired`.
  - **Fail:** any one of them does.

**Note the narrowed claim.** This step proves *the guard does not refuse*. It does **not** prove those addresses work, because the changing ones are sent bodies that fail their own validation on purpose, so the run has no side effects. An earlier version of this document said "serve a complete representative normally", which claimed more than the evidence carried — a complete representative could have been broken with a `400` or a `500` on a core workflow and this step would still have passed. Raised by adversarial review round 1; Step 4 exists because of it.

### Step 4 — The high-value changing addresses genuinely succeed [contract, tier C]

**Verifies:** AC-3b. Real subjects, real successes, checked in the database.

- [ ] Attach a real disposable delegate as a teammate, then detach them.
  - **Pass:** `POST /api/profile/teammates` answers `200` **and** the delegate's `sponsorId` equals the disposable company; `DELETE` answers `200` **and** it returns to `NULL`.
- [ ] Ask a real disposable delegate for a meeting.
  - **Pass:** `POST /api/request-meeting` answers below `400` **and** a `MeetingRequest` row exists for that requester and target.
- [ ] Create a submission form with a real title.
  - **Pass:** `POST /api/submissions` answers below `400` **and** the company's form count increases by exactly one.

### Step 5 — The profile-save address stays open in both directions [contract, tier C]

**Verifies:** AC-4, and OE 20. This is the assertion that stops a future change trapping every incomplete representative permanently.

- [ ] `PATCH /api/profile` while the company is complete.
  - **Pass:** `200`.
- [ ] `PATCH /api/profile` while the company is **incomplete**.
  - **Pass:** `200`, **and** the written value is present in the database afterwards.
  - **Fail:** any refusal, or a `200` that wrote nothing — a `200` that does not save leaves the representative equally stuck.

### Step 6 — Completing the item releases every address [contract, tier C]

**Verifies:** the guard consults the required set rather than a one-time marker.

- [ ] The nineteen are re-walked after the company has been through incomplete and back.
  - **Pass:** none refused. Deliberately re-walked rather than inferred from Step 3, because the company has been emptied and refilled since.

### Step 7 — A representative with no company row is refused, not allowed [contract, tier C]

**Verifies:** AC-5, OE 23 — a missing company link is never the fail-open direction.

- [ ] A disposable `SPONSOR` account created with `sponsorId` NULL walks the nineteen.
  - **Pass:** all nineteen answer `403` with `onboardingRequired`.

No seeded account is in this state, which is why the account is created inside the run. `User.sponsor` is declared `onDelete: SetNull`, so "company row deleted" and "no company ever linked" arrive as the same state and one branch covers both. **Phase 7 owns the screen side of this case**; Step 7 is the data side and does not wait for it.

### Step 8 — The person-based exemption holds [contract, tier C]

**Verifies:** ADR 0008 in this app's request guard. Not one of Phase 6's numbered criteria, asserted anyway because it is the most severe way this phase could fail.

`wbr@test.com` holds the organizer role, has **no exhibiting company**, and is admitted to this portal by `APP_ALLOWED_ROLES`. If the guard asked about completeness before asking who the person is, the primary demonstration login would be refused at every address in the app, in front of the customer.

- [ ] The organizer walks the nineteen.
  - **Pass:** none answers `403` with `onboardingRequired`.

**What this step does and does not claim.** Several of the nineteen answer `403` to this account for a *different* reason — it has no company, and the handlers say `"No sponsor"`. That is behaviour that predates this phase and is unchanged by it. What is asserted is narrower and exact: the onboarding refusal did not fire. Negative control 4 removes the exemption and this step goes red at all nineteen.

### Step 9 — The refusal is the same shape as the participant app's [contract, tier C]

**Verifies:** AC-9.

- [ ] Sign in as the deliberately-incomplete delegate `onboarding-demo@test.com` on the participant app, request a guarded address there, and compare.
  - **Pass:** both apps answer `403`; both bodies carry exactly the keys `{error, onboardingRequired}`; both set `onboardingRequired: true`.
  - **Fail:** any difference in status or key set.

Compared against the other app's **live answer**, not against a literal copied into the script. A copied literal would keep passing after the participant app changed its refusal, which is the drift being guarded against.

**The human sentence differs by one clause, deliberately, and is recorded rather than asserted equal:** the sponsor app says *"Complete your company profile before using the portal"* and the participant app says *"Complete your profile before using the app"*. What a representative must complete is their exhibiting **company's** profile, not their own. The shape a caller depends on is identical.

### Step 10 — The checklist still works with the guard live [contract, tier C]

**Verifies:** that this phase has not built the trap the requirements forbid by name — a guard on an address the only screen that can release somebody depends on.

Reading the code says it cannot happen: `app/(authenticated)/onboarding/page.tsx` queries the database on the server, and the only network call in its component tree is the exempt `PATCH /api/profile`. Reading the code is what missed the last four defects, so this step measures it.

- [ ] Load `/onboarding` in a real browser as the incomplete representative.
  - **Pass:** a heading renders; no `[data-testid="portal-nav"]` is present; **no request the guard refused was made by the page**.
- [ ] Ask the browser whether any field would refuse to submit.
  - **Pass:** `form.checkValidity()` is true. Any field that fails is named with its value and the browser's own message.
- [ ] **Press the real submit button.**
  - **Pass:** the browser leaves `/onboarding` within 15 s, the portal navigation renders, the typed value is in the database, and the buyer directory now answers `200` to the same session that was refused a moment earlier.
  - **Fail:** still on `/onboarding` after 15 s.

**Why the button is pressed rather than the address called.** Phase 5's suite reported 68 of 68 while this screen could not be submitted at all, because it completed the required item by calling `PATCH /api/profile` with `fetch` instead of pressing the button. Exercising the address is not exercising the screen.

### Step 11 — The suite can go red [contract, tier C]

**Verifies:** that Steps 1 to 10 are evidence rather than decoration. See § Negative controls.

```sh
docs/smoketests/playwright/phase-6-negative-controls.sh
```

### Step 12 — The buyer-directory refusal on a deployed preview [contract, tier B]

**Verifies:** AC-8.

**Environment required:** a Vercel preview deployment plus a Protection Bypass for Automation token. Tier C cannot answer this question at all — there is no shared cache in front of a local server.

```sh
PREVIEW_URL=https://sponsor-<hash>-<org>.vercel.app \
VERCEL_PROTECTION_BYPASS=<token> \
  node docs/smoketests/playwright/phase-6-deployed-cache-check.mjs
```

- [ ] Two distinct signed-in sessions: a complete representative fetches the directory, the company is then made incomplete through the exempt save address, and a **second account** fetches it inside the 60-second window.
  - **Pass:** the second account answers `403` with `onboardingRequired`.
  - **Fail:** the second account receives the people list — a shared cache answered without reaching application code.

**Status: NOT YET RUN.** Blocked on the bypass token. Every request to a protected preview answers `302` to `vercel.com/sso-api`, so the app is never reached and a "refused" result would be meaningless. Generate the token at Vercel Project Settings → Deployment Protection → Protection Bypass for Automation. The same environment variable name is already used by `playwright/phase-12a-sponsor-ai-intro.mjs` and `phase-12b-ai-controls.mjs`.

**Record the cache headers with the verdict.** The bypass token is itself a signal to the platform and may change how the response is cached. If it does, a "refused" result proves the guard runs but proves nothing about the cache. The script prints the cache-related headers for every request precisely so the strength of the conclusion can be judged rather than assumed.

---

## Request handlers — the enumeration (AC-6)

**21 handlers across 17 files. 19 guarded, 3 exempt.** The counts add to 22 because the sign-in re-export publishes two methods from one file and sits outside the reading/changing split.

Reproduce:

```sh
cd apps/sponsor
for f in $(find app/api -name "route.ts" | sort); do
  n=$(grep -c "await requireCompleteProfile()" "$f")
  h=$(grep -cE "export async function (GET|POST|PATCH|PUT|DELETE)" "$f")
  printf "%-58s guarded=%s handlers=%s\n" "$f" "$n" "$h"
done
grep -rc "await requireCompleteProfile()" app/api --include="route.ts" | awk -F: '{s+=$2} END {print "guard calls: "s}'
```

**The naive search understates by one file.** `app/api/auth/[...nextauth]/route.ts` publishes its handlers as `export { handler as GET, handler as POST }`, so `grep "export async function"` does not see it. Found by reading the file, as Phase 5 recorded. It is a sign-in address and exempt either way, but an enumeration trusting the search alone reports a complete list while missing a live address.

### Reading — 9, all guarded

| # | Address | Guarded | What it returns |
|---|---|---|---|
| 1 | `GET /api/attendees` | **yes** | The buyer directory: 2,527 people with company, job title, biography, company size, annual revenue, and what each is seeking. **OE 17.** |
| 2 | `GET /api/browse` | **yes** | The same population, searchable and filtered. **OE 18.** |
| 3 | `GET /api/meetings-data` | **yes** | Inbound, outbound and scheduled meetings. |
| 4 | `GET /api/sponsor-data` | **yes** | The caller's own company data and recommendations. |
| 5 | `GET /api/profile/sponsor-data` | **yes** | Company profile plus the list of unattached users. |
| 6 | `GET /api/profile/teammates` | **yes** | The company's team list. |
| 7 | `GET /api/recommendations/quota` | **yes** | Remaining AI-draft allowance. Reachable only when the feature switch is on. |
| 8 | `GET /api/submissions` | **yes** | The company's submission forms. |
| 9 | `GET /api/submissions/[id]` | **yes** | One form and its responses. |

### Changing — 12, of which 10 guarded and 2 exempt

| # | Address | Guarded | Note |
|---|---|---|---|
| 10 | `PATCH /api/meetings/[id]` | **yes** | Approve, reject, confirm. The `STAFF` allowance in the handler is untouched — the guard releases every event-operating role before asking about completeness. |
| 11 | `POST /api/profile/teammates/register` | **yes** | The plan's open decision. See § The teammate-registration decision. |
| 12 | `POST /api/profile/teammates` | **yes** | Attach a teammate. |
| 13 | `DELETE /api/profile/teammates` | **yes** | Detach a teammate. |
| 14 | `POST /api/recommendations/[attendeeId]/draft-intro` | **yes** | Draft an introduction. Reachable only when the feature switch is on. Guard placed **before** the spend and rate-cap accounting, so a refused representative consumes no part of the allowance. |
| 15 | `POST /api/request-meeting` | **yes** | Ask a buyer for a meeting — one of the two capabilities the customer named by name. |
| 16 | `PATCH /api/submissions/[id]` | **yes** | Edit a form. |
| 17 | `DELETE /api/submissions/[id]` | **yes** | Delete a form. |
| 18 | `PATCH /api/submissions/[id]/submissions/[subId]` | **yes** | Set a response's status. |
| 19 | `POST /api/submissions` | **yes** | Create a form. |
| — | `PATCH /api/profile` | **EXEMPT** | The checklist saves through it. Guarding it makes the required items impossible to complete and traps every incomplete representative permanently. Asserted in both directions by Step 5. |
| — | `POST /api/login` | **EXEMPT** | This app's hand-written sign-in address; it mints the session cookie itself, so no session exists when it runs. |

### Sign-in re-export — outside both counts

| Address | Guarded | Note |
|---|---|---|
| `GET`/`POST /api/auth/[...nextauth]` | **EXEMPT** | The NextAuth sign-in address. No session exists yet. Invisible to the naive search; see above. |

**Three exemptions, not two.** The handoff into this phase described "the sign-in address and `PATCH /api/profile`". Reading the code shows "the sign-in address" is two separate ones — `/api/auth/[...nextauth]` and the hand-written `/api/login`, which mints the cookie itself. Both must stay open, for the same reason.

**Nothing at the framework level forces a new handler to call the guard.** That remains a convention backed by this enumeration and a note at the guard's definition, as FP finding F-3 settled after a route group was left open. Negative control 1 exists to show the suite catches a single forgotten call.

---

## The teammate-registration decision (AC-7)

**Decided: GUARDED, not exempt.** Answered the way the plan required — by reading the handler's caller, not by judgement.

```sh
grep -rn "teammates/register" apps/sponsor --include="*.tsx"   # → components/RegisterTeammate.tsx
grep -rn "RegisterTeammate" apps/sponsor --include="*.tsx"     # → app/(authenticated)/(portal)/submissions/page.tsx
```

`POST /api/profile/teammates/register` has exactly one caller: `components/RegisterTeammate.tsx`. That component has exactly one render site: `app/(authenticated)/(portal)/submissions/page.tsx`. That page is inside `(portal)`, the route group Phase 5's screen gate protects.

**So an incomplete representative cannot reach the screen that calls this address at all.** Guarding it therefore takes nothing away from anybody who could otherwise have used it, and leaving it open would let a representative blocked from every screen create working accounts for colleagues.

This also matches the counts the plan had already committed to before the question was answered — "nine reading handlers and ten of the twelve changing handlers" only adds up with this address guarded.

---

## The two AI addresses

`GET /api/recommendations/quota` and `POST /api/recommendations/[attendeeId]/draft-intro` both check `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` **before** anything else and answer `404` when it is off.

Adversarial review round 1 raised this as "two of the claimed nineteen are observable without the guard". Half right, and the half that matters is the wording rather than the behaviour:

- With the switch **off**, those addresses answer `404` to **everybody** — complete representative, incomplete representative and organizer alike. Nobody receives any data. The switch is a stricter refusal than the guard, not a way past it.
- With the switch **on**, both call the guard and both are covered by Steps 1, 2, 3, 7 and 8.

**The review's remedy was rejected, and the reason is recorded so it is not re-proposed.** Moving the identity checks and the guard ahead of the feature switch would answer a signed-in incomplete representative *"complete your company profile"* about a feature that does not exist on that deployment. `404` is the true answer.

**The precise claim, therefore:** nineteen addresses call the guard, and two of them are only reachable at all when the switch is on. The count of guarded addresses is nineteen either way; the count this run can produce **evidence** for is seventeen when the switch is off, and the suite says SKIP rather than pass for the other two.

**One ordering change was made inside the draft-introduction address**, and it is a behaviour change worth naming. The `OPENAI_API_KEY` check used to sit above the identity checks and now sits below them, because (a) whether a caller may use an address is a question about the caller and must not depend on whether a server credential happens to be configured — with the old order the same incomplete representative was answered `502` on a machine with no key and `403` on one with a key; and (b) with the old order an **anonymous** caller could learn whether the key was configured, since the `502` was returned before the session was looked at. An anonymous caller now gets `401` either way.

---

## Negative controls — the suite has been shown to fail

```sh
docs/smoketests/playwright/phase-6-negative-controls.sh
```

Five controls. Each breaks one behaviour, rebuilds, runs the suite, records what went red, and restores. **Restore is by file copy, not by `git checkout`**, because Phase 6 is uncommitted while the controls run and `git checkout -- <file>` would throw the whole phase away rather than undo one control. The last block diffs the touched files against the copies taken before the first control, and a final confirmation run proves the suite is green again.

| # | Behaviour removed | Predicted | Measured | Caught? |
|---|---|---|---|---|
| 1 | The buyer directory stops calling the guard | 2 | **5** | yes |
| 2 | The guard never refuses anybody | 38 | **41** | yes |
| 3 | Fail **open** when the company row is absent | 19 | **19** | yes |
| 4 | The person-based exemption removed | 19 | **19** | yes |
| 5 | The refusal drops its `onboardingRequired` marker | 39 | **40** | yes |
| — | Everything restored | 0 | **0** | — |

**The three discrepancies are explained, not waved past.** Controls 1, 2 and 5 each produced three, three and one more failures than predicted, and in every case the extra failures are Step 9 — the cross-app body-shape comparison — which uses the buyer directory as its sample. When that address stops refusing, or refuses without the marker, the comparison against the participant app's live refusal goes red too. That is correct behaviour: an assertion written to notice drift between the two apps noticed it. The predictions were written before the run and were wrong about the count, not about the direction.

Control 1 is the one worth keeping in mind for future work: it removes a **single** guard call and the suite still goes red, which is what shows the loop covers each address individually rather than in bulk. The realistic regression in this codebase is somebody adding a handler and forgetting the call, exactly as FP finding F-4 records for the participant app.

Noise a runner will see and should ignore: `Killed: 9` lines between controls are the previous production server being stopped before the next build.

---

## Findings

### 1. The buyer directory told caches to share it — fixed here

`GET /api/attendees` answered with `Cache-Control: public, max-age=60, stale-while-revalidate=600`. `public` invites any shared cache between the app and the caller to store the response and hand it to somebody else. **This is the address Phase 6 exists to guard, and the guard runs in application code** — so a shared cache answering from its own copy would defeat the refusal without the guard running at all.

Raised by adversarial review round 1 as a no-ship. Both the requirements document and the plan listed this header as out of scope, so **the change is recorded here and in both of those documents rather than made quietly.**

**Why it was changed anyway.** The project has already applied this reasoning once: Phase 5 fixed `PATCH /api/profile`, nominally Phase 6's territory, because Phase 5 was what turned a stale company link into a trap. Before Phase 6 this header was a performance choice with no guarantee behind it to undermine; Phase 6 is what turns it into a way around a refusal. A phase whose headline promise is "an incomplete representative is refused the buyer directory" cannot ship an invitation to serve that directory from a cache the guard never sees.

**Two attempts, and the first was wrong.** `private, max-age=60, stale-while-revalidate=600` was the first fix, with a comment beside it claiming the residual was bounded to 60 seconds. Review round 3 caught that the header actually permits **660** — `stale-while-revalidate=600` lets a browser serve a stale copy for ten minutes past the freshness window. Final value: **`private, no-store`**, verified on the wire:

```
status: 200 | Cache-Control: private, no-store
```

**It costs nothing.** The expensive part is the database query, and that is already cached server-side for 60 seconds by `unstable_cache` in `lib/server-data.ts` (`sponsor-attendees`, revalidate 60). This app's own client holds the result in memory for five minutes through React Query (`lib/hooks.ts`, `staleTime: 300_000`), which HTTP caching does not affect either way. The header was buying a third layer on top of two that already existed. It was also the **only** `Cache-Control` header in this app, and the participant app sets none at all on any of its fifteen guarded reading addresses.

**AC-8 still has to run.** The header change reduces what the deployed check can find but does not replace it — whether the deployed environment honours `no-store` is still a measurement, not a deduction.

### 2. Any sponsor representative can attach any user account to their own company — NOT fixed here

**Measured, not inferred.** `POST /api/profile/teammates` accepts an arbitrary `userId` and writes the caller's company onto it, with no check that the target belongs to somebody else:

```
company B's representative calls POST /api/profile/teammates {userId: <company A's representative>}
  → 200
  → the database now says A's representative belongs to company B
```

The handler is `prisma.user.update({ where: { id: userId }, data: { sponsorId: user.sponsorId } })`. `getCachedAvailableUsers` only *lists* users with `sponsorId: null`, but the handler does not enforce it.

**Pre-existing and unchanged by this phase.** It behaves identically on `main` today. Phase 6 guards this address, which means an *incomplete* representative can no longer do it — a narrowing, not a fix.

**Not fixed here** because it is a tenant-authorization defect rather than a completeness one, and because the fix needs a decision about what should happen to an already-attached target. Recorded in the plan and the requirements document as a carried finding.

### 3. A moved representative keeps write access to their old company — NOT fixed here

**Measured end to end.** The guard reads the company from the database; every handler still reads `user.sponsorId` off the session token for its own work. A token is issued at sign-in and never changes:

```
1. representative R signs in while attached to company A   → token carries company A
2. company B's representative moves R onto company B       → 200 (finding 2 above)
3. R, still holding the old token, calls
   PATCH /api/meetings/<a request addressed to company A> {status: 'APPROVED'}
   → 200
   → the request addressed to company A is now APPROVED
   → the guard consulted company B and passed; the handler consulted company A and acted
```

Raised by adversarial review round 2 as a no-ship and reproduced before any decision was taken.

**Pre-existing and not caused by this phase.** Without the guard the same `PATCH` succeeds identically — there is simply no second opinion to disagree with. Phase 6 cannot grant access that was not already there, and in one direction it *reduces* the exposure: if the new company is incomplete, the guard now refuses the moved representative at all nineteen addresses.

**Not fixed here.** The review's recommendation — have the guard return a database-backed account context and re-point every handler's authorization at it — is the right shape and is a phase of its own. It changes how nineteen handlers decide which company they are acting for, with no existing test coverage for that logic, eleven days before the demonstration. Recorded rather than attempted.

### 4. One company's data survives sign-out in the browser — NOT fixed here, and the predicted consequence did not reproduce

Adversarial review round 2 claimed the persisted query cache lets one company's representative see another's data. **Measured, and the answer is split.**

The mechanism is real. `lib/query-client.tsx` persists all query state to IndexedDB under one fixed key `sponsor-query-cache` with a 30-minute lifetime, and the query keys are company-agnostic — `['sponsor-data']`, `['meetings-data']`, `['attendees']`. Nothing calls `removeClient`, and `signOut({callbackUrl:'/login'})` does not clear it:

```
1. representative A of company ALPHA loads the dashboard
   persisted cache: 985,857 chars, contains ALPHA        ✓
2. A presses the real Sign out button, lands on /login
   persisted cache: 985,857 chars, still contains ALPHA  ← not cleared
3. representative B of company BETA signs in, same browser
   /dashboard    ALPHA-derived content: no
   /meetings     ALPHA-derived content: no
   /profile      ALPHA-derived content: no
   /submissions  ALPHA-derived content: no
   /browse       ALPHA-derived content: no
4. persisted cache while B is signed in: 1,024,864 chars, contains ALPHA: no
```

**The cross-company display leak did not reproduce.** B's data overwrote A's rather than A's being served to B, on all five screens, both immediately after load and after settling.

**What is real and worth its own look:** roughly 1MB of one company's data — including the buyer directory — remains readable in the browser's IndexedDB after that representative signs out. On a shared machine, somebody with access to the browser profile could read it through developer tools without signing in. That is data at rest on the client, a different finding from the one raised, and outside anything Phase 6 touches. The fix is to call `removeClient` on sign-out.

### 5. Two smaller observations, neither actioned

- **The `(portal)` layout preloads the buyer directory without credentials.** `<link rel="preload" href="/api/attendees" as="fetch" crossOrigin="anonymous" />` sends no cookie, so the guard sees no session, returns `null`, and the handler's own `if (!user.id)` answers `401`. The preload warms nothing. Pre-existing and unchanged by this phase, but it is dead weight rather than an optimisation.
- **My own assertion had a race that reported the product broken.** The first version of Step 10 used `waitForLoadState('networkidle')` after pressing submit, which returns immediately when the network is idle at that instant — which it was, because the click's request had not started. It read the page address and the database before the save was sent, and reported three failures against a feature that worked. Recorded because a test that reports a working feature broken costs the same as one that reports a broken feature working: both send somebody looking in the wrong place.

---

## Step summary

| Step | Category | Environment | Status |
|---|---|---|---|
| 1. Nine reading addresses refuse an incomplete representative | contract | tier C | **PASS** |
| 2. Ten guarded changing addresses do the same | contract | tier C | **PASS** |
| 3. A complete representative is refused by none of the nineteen | contract | tier C | **PASS** |
| 4. High-value changing addresses genuinely succeed | contract | tier C | **PASS** |
| 5. The profile-save address stays open in both directions | contract | tier C | **PASS** |
| 6. Completing the item releases every address | contract | tier C | **PASS** |
| 7. No company row → refused, not allowed | contract | tier C | **PASS** |
| 8. The person-based exemption holds | contract | tier C | **PASS** |
| 9. Refusal shape matches the participant app's | contract | tier C | **PASS** |
| 10. The checklist still works, real button pressed | contract | tier C | **PASS** |
| 11. The suite can go red — five negative controls | contract | tier C | **PASS** (5 of 5 caught) |
| 12. Deployed-preview cache check | contract | tier B | **NOT RUN** — needs a bypass token |
| AC-6 enumeration | document deliverable | — | **PASS** (§ Request handlers) |
| AC-7 teammate decision | document deliverable | — | **PASS** (§ The teammate-registration decision) |

**Suite total: 121 assertions passing, 0 failed, 0 skipped**, with the AI feature switch on, against a tier-C production build.

### Regression checks on earlier work

Phase 6 edits 14 request-handler files in the app Phase 5 covers, so Phase 5's suite was re-run as part of this phase's acceptance, per `CONTRACT.md`. Phase 5's own re-run trigger does not literally list "a request handler is edited" — it names the gate, the checklist, the middleware, the role test and the policy module — but changing fourteen files in that app and then not re-running its suite would be trusting a list over the change actually made.

| Check | Result |
|---|---|
| `playwright/phase-5-sponsor-screen-gate.mjs` — the screen gate and checklist | **117 passed, 0 failed, 0 skipped** — unchanged from Phase 5 |
| `pnpm test:onboarding-policy` — the shared required-set module the guard reads | **44 passed, 0 failed** |

Phase 5's suite matters most here because it exercises `PATCH /api/profile` and loads the checklist screen. If this phase's guard had reached either, that suite would have gone red. Its finding-7b block is also the one that proves a representative moved between companies can still finish, which is the behaviour finding 3 above describes from the other side.

The participant app was not re-run: Phase 6 changes no file in it. Its refusal is read live by Step 9, which is a check on this phase, not on that one.

`pnpm typecheck` clean in all four apps apart from the documented pre-existing `apps/attendee/components/BottomNav.tsx(40,101) TS2514`. The type checker was shown to fail on a deliberate error before that result was trusted; `pnpm lint` cannot run, as no ESLint configuration exists in this repository.

---

## Pass / fail

Phase 6 ships when:

- Steps 1 to 11 pass on a tier-C production build — **met**.
- All five negative controls are caught — **met**.
- Step 12 runs on a Vercel preview and its result is recorded either way — **NOT met.** This is the one outstanding item and it needs a Protection Bypass for Automation token.
- The dry-run with the project owner happens. **Not met for any phase yet**, including 1 through 5. Automated checks passing is never treated as done.

---

## Re-run trigger

Re-run this smoketest in full whenever a later change touches:

- `apps/sponsor/lib/require-complete-profile.ts` — the guard
- `apps/sponsor/lib/onboarding-gate.ts` — the screen gate it partners
- `apps/sponsor/app/api/**/route.ts` — **any** handler, added or edited. Nothing at the framework level will remind you.
- `packages/db/src/onboarding-policy.ts` — the required set and the emptiness rules
- `packages/db/src/app-access.ts` — `isWbrStaff`, the exemption
- `apps/sponsor/app/(authenticated)/onboarding/**` — the checklist Step 10 presses
- `apps/sponsor/lib/query-client.tsx` or `lib/hooks.ts` — the caching finding 4 describes
