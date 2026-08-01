# Phase 13 Smoketest — sponsor portal carried issues

Manual verification path. Both human and AI agents are valid runners. Authored per [`docs/smoketests/CONTRACT.md`](CONTRACT.md).

- **Plan of record:** [`.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`](../../.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md) § Phase 13
- **Requirements:** the OE document's § Carried findings from the sponsor request guard stage, where all three defects and both decisions are recorded
- **Origin:** [`phase-6-sponsor-request-guard.md`](phase-6-sponsor-request-guard.md) § Findings 2, 4 and 6 — measured there, carried, fixed here
- **Scripts:** [`playwright/phase-13-sponsor-portal-carried-issues.mjs`](playwright/phase-13-sponsor-portal-carried-issues.mjs) (the suite), [`playwright/phase-13-negative-controls.sh`](playwright/phase-13-negative-controls.sh) (proof it can fail)

---

## What this verifies

Three fixes, none of them about profile completeness. Each was measured as a defect during Phase 6 and carried rather than fixed there.

- Pressing the real **Sign out** button erases the copy of this company's data the portal keeps in the browser (AC-1), while the portal still keeps that copy during a session (AC-2) and signing in again still works (AC-3).
- The **teammate-attach address refuses an account that already belongs to another company** (AC-4), still attaches an unattached one (AC-5), and answers `404` rather than `500` for an identifier matching nothing (AC-6).
- A **colleague the portal creates can actually sign in to the portal** (AC-7), while a person who **already had an account keeps their role and their access to the meetings portal** (AC-8), and both screens say what they do and do not grant (AC-9).
- A colleague created this way is **not a way around Phases 5 and 6** (AC-10).
- Everything the run creates is removed (AC-11).

Three more were added during the adversarial review, each confirmed by measurement before the code was changed:

- The teammate addresses read the caller's company **from the database**, so a representative moved between companies mid-session can neither create a colleague at, nor read the team of, the company they left (AC-12).
- Two people attaching the same person **at the same moment** produce exactly one success and one refusal (AC-13).
- A session that ends **without the Sign out button** — expiry, an invalidated session, a deleted cookie — still leaves no stored data behind (AC-14).

**What a green run is evidence of: the assertions listed here and nothing wider.** This is not a formality in this repository. Phase 1 passed 33 of 33 while a delegate blocked from every screen could still post in a chat room. Phase 5 passed 68 of 68 while the sponsor checklist could not be submitted in a browser. **Before citing the total below, read § Negative controls.**

---

## Prerequisites for the runner

```sh
# Tier C — a production build, not a dev server. Kill the port first: a server
# started before your change serves stale code (check with `ps -o lstart=`).
lsof -ti:3003 | xargs kill -9
pnpm --filter sponsor build
cd apps/sponsor && pnpm start

# For AC-8 only — the meetings portal, so the claim that an attached delegate
# keeps their access is measured rather than reasoned about:
pnpm --filter meetings build && (cd apps/meetings && pnpm start)   # port 3002

node docs/smoketests/playwright/phase-13-sponsor-portal-carried-issues.mjs
```

**The meetings portal is not optional for a full run.** AC-8 is the criterion that says this phase does not take away access a real person already has. Without port 3002 listening, the suite reports a loud SKIP for it rather than a pass, and the most important half of that criterion goes unmeasured.

`WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` is **not** needed here. Phase 13 touches none of the AI addresses. It **is** needed for the Phase 6 regression re-run below.

**This run touches nothing seeded.** It creates three companies and four accounts, lets the app create two more, and deletes all of it, verifying by counting rows. If it is killed part-way the exact cleanup statements are **printed on startup** and are the same ones the cleanup block runs — one definition, three consumers.

---

## Steps

### Step 1 — Signing out erases this company's data from the browser [contract, tier C]

**Verifies:** AC-1, AC-2, AC-3.

The portal saves every answer it has fetched into the browser's own database under one fixed key, `sponsor-query-cache`, so a return visit renders without refetching. Until this phase nothing ever erased it.

- [ ] A representative loads the dashboard; the stored copy is read straight out of the browser's IndexedDB.
  - **Pass:** the copy exists, is non-empty, and contains this company's name — otherwise a later absence would prove nothing about *this* company's data.
- [ ] The **real Sign out button** is pressed.
  - **Pass:** after the browser reaches the sign-in page, the key is gone.
  - **Fail:** any characters remain under that key.
- [ ] Signing in again.
  - **Pass:** the portal renders, so erasing the store did not break the restore path.

**Why the button is pressed rather than the function called.** Phase 5's suite reported 68 of 68 while its screen could not be submitted at all, because it exercised the address instead of the control. Exercising a function is not exercising the screen.

**Why the read waits rather than reads immediately.** The persist provider writes on a throttle after a cache change, so reading straight after a page load reads too early. This is the same class of mistake as Phase 6's `networkidle` race, which reported a working feature broken. The helper waits for the outcome being asserted and lets the timeout be the failure.

**What is deliberately not claimed.** Phase 6's review round first reported this as one company's representative being shown another's data. That was measured across five screens and **did not reproduce** — the next representative's data overwrote the previous one's. What is fixed is data left at rest on the client, readable through developer tools on a shared machine.

### Step 2 — The attach address refuses another company's account [contract, tier C]

**Verifies:** AC-4, AC-5, AC-6.

- [ ] Company A's representative attaches a delegate with no company.
  - **Pass:** `200`, and the database shows the delegate at company A.
- [ ] Company B's representative attaches the same delegate.
  - **Pass:** `409`, **and** the delegate is still at company A afterwards. Both halves are required: a refusal that still wrote would be worse than no refusal.
- [ ] An identifier matching nothing.
  - **Pass:** `404`. Before this phase it reached `update`, threw, and surfaced as a `500` — a server fault reported for an ordinary bad request.
- [ ] Company A re-attaches somebody already on its team.
  - **Pass:** `200`. A repeat click is not an error, matching the registration address.

### Step 3 — A refused attach is shown to the exhibitor [contract, tier C]

**Verifies:** the screen half of AC-4.

Before this phase both teammate handlers tested `res.ok` and did nothing when it was false, so every refusal looked like a button that does not work. That mattered more once the address started refusing on purpose.

- [ ] Company B's representative opens the team screen while the delegate is still unattached; company A then attaches that delegate; B clicks the row their page is still showing.
  - **Pass:** a message appears naming the reason.
  - **Fail:** the click produces nothing.

**No request interception is used, and that is the point.** This reproduces the real situation that produces a `409`: the picker's list is a 120-second cached snapshot, not an authorization check, so a row can be stale by the time it is clicked. The refusal in this step is a genuine one from the real address.

### Step 4 — Attaching an existing person does not change who they are [contract, tier C]

**Verifies:** AC-8, AC-9.

- [ ] A delegate who already has an account is attached to a company.
  - **Pass:** their role is unchanged.
- [ ] That same delegate signs in to the **meetings portal** and reaches a screen there.
  - **Pass:** sign-in succeeds and the portal does not bounce them to its sign-in page.
  - **Fail:** either — which is what promoting them to the exhibitor-representative role would have caused, since `packages/db/src/app-access.ts` admits `ATTENDEE` and `SPEAKER` to that portal and does not admit `SPONSOR`.
- [ ] The team screen carries a note.
  - **Pass:** it states that attaching does not give portal access.

**Why the meetings portal is signed in to rather than reasoned about.** The claim being made is that a real person keeps real access. A role read out of the database is a weaker statement than a session that works.

### Step 5 — A colleague the portal creates can sign in to it [contract, tier C]

**Verifies:** AC-7.

- [ ] A representative registers a colleague through the portal's own form.
  - **Pass:** `201`, the stored role is the exhibitor-representative role, **the colleague signs in**, and the portal renders with its navigation.
  - **Fail:** any of those — sign-in answering `403` is the defect exactly as Phase 6 measured it on a deployed preview.

### Step 6 — A created colleague is not a way around Phases 5 and 6 [contract, tier C]

**Verifies:** AC-10, and the second half of AC-9.

- [ ] A representative whose **own** company is incomplete tries to create a colleague.
  - **Pass:** `403` with `onboardingRequired`, and no account is created.

**This step's first version asserted the opposite and was wrong.** It expected `201` and got `403`. The test was wrong rather than the product: the colleague-creation address is one of the nineteen Phase 6 guards, so an incomplete representative never reaches it. Recorded rather than quietly corrected, because it is a useful fact — the route this phase worried about cannot even be started from an incomplete company.

- [ ] The colleague created in Step 5 is measured again after their company is made incomplete.
  - **Pass:** they are sent to the checklist, are not handed the portal navigation, and the buyer directory refuses them with the standard body.
- [ ] The create-a-colleague form carries a note.
  - **Pass:** it states that the new account reaches the buyer directory.

### Step 7 — The company comes from the database, and the write is atomic [contract, tier C]

**Verifies:** AC-12, AC-13, AC-14. Every one of these exists because the adversarial review found something, and each was reproduced before the code changed.

- [ ] A representative is moved to another company in the database while holding a session issued at the first one, then creates a colleague.
  - **Pass:** the colleague is created at the company the database names **now**.
  - **Fail:** the colleague lands at the company the caller has left — which is what happened before the fix, with `role=SPONSOR` and a working sign-in.
- [ ] The same stale session asks for its team list.
  - **Pass:** it shows the current company's team.
- [ ] Two representatives of different companies attach the same unattached person **simultaneously**.
  - **Pass:** exactly one `200` and one `409`.
  - **Fail:** two successes — measured at **15 out of 15** before the fix, so this is not a rare race.
- [ ] A session ends by the cookie becoming unusable, with the Sign out button never pressed.
  - **Pass:** on reaching the sign-in page the stored copy is gone.

**On the race, a note about method rather than result.** The first attempt at reproducing it failed — the two requests serialised and the second was correctly refused. Recording "did not reproduce" at that point would have been wrong. Repeating it with warm sessions gave 15 of 15. **One attempt at a race is not a measurement.**

### Step 8 — The suite can go red [contract, tier C]

**Verifies:** that Steps 1 to 6 are evidence rather than decoration. See § Negative controls.

```sh
docs/smoketests/playwright/phase-13-negative-controls.sh
```

---

## Negative controls — the suite has been shown to fail

```sh
docs/smoketests/playwright/phase-13-negative-controls.sh
```

**Seven controls.** Each removes one behaviour, rebuilds, runs the suite, records what went red, and restores. **Restore is by file copy, not by `git checkout`** — the phase is uncommitted while the controls run, so `git checkout -- <file>` would discard the whole phase rather than undo one control. The last block diffs all five touched files against the copies taken before the first control, and a final confirmation run proves the suite is green again.

**The driver now fails, and the numbers below may only be copied from a run of it that exited 0.** A substitution that does not apply is fatal, and so is a control that runs and leaves the suite green. That gate exists because of what adversarial review round 3 found — see below.

| # | Behaviour removed | Predicted | Measured | Caught? |
|---|---|---|---|---|
| 1 | The portal stops erasing the stored data **anywhere** | 2 | **2** | yes |
| 2 | The attach write stops being conditional | 4 | **5** | yes |
| 3 | A created colleague goes back to the delegate role | 3 | **3** | yes |
| 4 | Attaching an existing person changes their role | 2 | **2** | yes |
| 5 | The screen swallows the refusal again | 1 | **1** | yes |
| 6 | Colleague creation trusts the session token again | 1 | **1** | yes |
| 7 | The sign-in page stops erasing | 1 | **1** | yes |
| — | Everything restored | 0 | **0** | — |

All five files were confirmed byte-identical to their pre-control copies, the restored run was green, and the driver exited 0.

### Two things this section got wrong before it got them right

**The controls silently stopped working, and adversarial review round 3 caught it.** An earlier version of this document carried a five-row table reading "5 of 5 caught". That table described a run against code that no longer existed: rounds 1 and 2 changed the very lines three of the controls edited — `user.sponsorId` became `companyId`, and a read-then-write became a conditional write — so those substitutions stopped matching. The driver printed a warning, continued, and exited 0. **The one thing standing between a green suite and a green suite that proves nothing had quietly stopped working, during the rounds meant to be auditing it.** Controls 2 to 4 were rewritten against the current code, controls 6 and 7 were added for the behaviours the review's own fixes introduced, and the driver was made to fail.

**Control 1 then turned out to prove nothing either, and only running it showed that.** It removed the Sign out button's erase and was **NOT CAUGHT** — the suite stayed entirely green. The cause is round 1's fix: pressing Sign out navigates to the sign-in page, and that page now erases too, so AC-1 passes whether or not the button does anything. Control 1 now removes **both** erases, which is the honest control for "this phase erases the data at all", while control 7 removes only the sign-in page's and isolates the paths the button cannot cover.

**A residual stated rather than implied:** removing *only* the button's erase changes no observable outcome in this suite. The button's erase is kept anyway, because it also empties the in-memory cache **before** navigating, and without that the throttled writer can persist what is still in memory after the sign-in page has already deleted the stored copy. No assertion here covers that ordering. It is defended by reasoning, and this sentence exists so nobody mistakes it for something the controls proved.

### The one discrepancy between prediction and measurement

**Control 2 produced five failures against four predicted, and the extra one is correct behaviour.** With the condition removed, company B genuinely took the delegate, so a later step that expected to link that same delegate from company A ran into the *registration* address's own `409` — a refusal that still works. An assertion written to check that linking succeeds noticed that it no longer could. The prediction was wrong about the count, not the direction.

**Control 4 is the one to remember.** It applies the rejected alternative — giving an existing person the exhibitor-representative role — and the suite goes red on exactly the two assertions that describe the harm: the delegate's role changed, and they can no longer sign in to the meetings portal. The decision recorded in the plan is demonstrated rather than argued.

---

## Step summary

| Step | Category | Environment | Status |
|---|---|---|---|
| 1. Signing out erases the stored data; the store still works | contract | tier C | **PASS** |
| 2. The attach address refuses another company's account | contract | tier C | **PASS** |
| 3. A refused attach is shown to the exhibitor | contract | tier C | **PASS** |
| 4. Attaching an existing person does not change who they are | contract | tier C | **PASS** |
| 5. A created colleague can sign in to the portal | contract | tier C | **PASS** |
| 6. A created colleague is not a way around Phases 5 and 6 | contract | tier C | **PASS** |
| 7. The company comes from the database; the write is atomic | contract | tier C | **PASS** |
| 8. The suite can go red — seven negative controls | contract | tier C | **PASS** (7 of 7 caught, driver exited 0) |

**Suite total: 31 assertions passing, 0 failed, 0 skipped**, against a tier-C production build with the meetings portal listening.

**A skipped check now fails the run.** The earlier version exited 0 whenever nothing had failed, so a run with the meetings portal switched off reported success while AC-8 went unmeasured — this document said that portal was not optional and the script disagreed. Set `PHASE13_ALLOW_PARTIAL=1` to accept a subset deliberately; it prints loudly that the run is not evidence for the phase.

### Regression checks on earlier work

This phase edits four request handlers, three components and the sign-in page in the app Phases 5 and 6 cover, and both of their re-run triggers name those files. Both suites were re-run as part of this phase's acceptance, per `CONTRACT.md`.

**These numbers come from a run against the FINAL code, after the adversarial review AND after rebasing onto a `main` that moved during the phase.** Two earlier sets of identical-looking numbers were discarded rather than reused, for the same reason each time: a result taken before a change is not evidence about the code after it.

- The first set predated the review, which then changed four handler files, a component and the sign-in page.
- The second predated **three commits that landed on `main` mid-phase** (`176c627`, `a5ca83f`, `00f58cc`). None touches the sponsor app, but they add 428 lines to `packages/db/src/meeting-engine.ts` — a shared package all four apps import — and a `tableNumber` column with a per-conference unique constraint to the company model.

**What the rebase required, recorded so the next person does not rediscover it.** The local database did not have the new column, and this repository has no migration history, so the column was applied with the script that arrived alongside the change (`node scripts/migrate-sponsor-tables.mjs --local packages/db/prisma/dev.db`), the Prisma client was regenerated, and all three apps were rebuilt before anything was re-run. All four apps point at the same local database file, so one migration covers them. The new column is nullable and the constraint allows many nulls, so this phase's disposable companies — which never set it — are unaffected.

| Check | Result |
|---|---|
| `playwright/phase-5-sponsor-screen-gate.mjs` — the screen gate and checklist | **117 passed, 0 failed, 0 skipped** — unchanged |
| `playwright/phase-6-sponsor-request-guard.mjs` — the request guard over nineteen addresses | **121 passed, 0 failed, 0 skipped** — unchanged, with the AI feature switch on |
| `pnpm test:onboarding-policy` — the shared required-set module | **44 passed, 0 failed** — unchanged |

Phase 6's suite matters most here. This phase changes two of the addresses it guards, and one of those changes adds a new early return — if it had been placed above the guard rather than below it, an incomplete representative would have received a `404` or a `409` instead of the standard refusal, and that suite would have gone red.

`pnpm typecheck` is clean in all four apps apart from the documented pre-existing `apps/attendee/components/BottomNav.tsx(40,101) TS2514`. The type checker was shown to fail on a deliberate error before that result was trusted. `pnpm lint` cannot run — no ESLint configuration exists in this repository.

---

## Pass / fail

Phase 13 ships when:

- Steps 1 to 8 pass on a tier-C production build — **met**, 31 of 31.
- All seven negative controls are caught and the driver exits 0 — **met**.
- The full three-round adversarial review runs and every finding is reproduced before being acted on — **met**. Nine findings; eight acted on, one measured and deliberately carried. Log at [`docs/codex-reviews/phase-13-sponsor-portal-carried-issues.md`](../codex-reviews/phase-13-sponsor-portal-carried-issues.md).
- Phases 5 and 6 and the policy module hold at their recorded counts, measured against the final code — **met**.
- The dry-run with the project owner happens. **Not met for any phase yet**, including 1 through 6. Automated checks passing is never treated as done.

---

## What was NOT fixed here, and why

- **A representative moved between companies keeps write access to their old company's records — on every address except the four this phase touches.** This is the plan's **Phase 14**, which re-points the remaining handlers at a database-backed account context with no existing coverage for that logic.

  **What changed here, and why it could not wait.** The four teammate addresses — the team list, attach, detach and colleague registration — now resolve the caller's company from the database through `apps/sponsor/lib/caller-company.ts`. That is nominally Phase 14's territory and it was pulled forward because **this phase's own role change turned the stale value from inert into harmful**, which adversarial review round 1 caught and which was then reproduced end to end:

  ```
  1. a representative signs in while attached to company A   → token names A
  2. somebody moves them to company B in the database
  3. they create a colleague
     → 201, and the new account is role=SPONSOR, sponsorId=A
  4. that colleague signs in to the portal, as company A
  ```

  Before this phase the same stale write produced an `ATTENDEE` the portal refused, so nothing came of it. The role change is what made it mint a working account, with the buyer directory, at a company the caller had left. The precedent for fixing it inside the phase that made it dangerous is this project's own, applied twice: Phase 5 fixed the profile-save address, and Phase 6 changed a cache header both planning documents had put out of scope. Asserted by AC-12.

- **Newly created colleagues no longer appear as bookable representatives in the meetings portal, and that is a consequence of the role change rather than a defect in it.** Found by adversarial review round 2 and measured. `apps/meetings/components/BrowseView.tsx` and `SponsorCard.tsx` both filter attached people with `u.role !== 'SPONSOR'`, commented "show real attendees/speakers only, not demo accounts". That premise — that the sponsor role means a demonstration account — was already untrue for the seven seeded exhibitor representatives, who are hidden today.

  Measured on the local copy: of 52 people attached to a company, **45 are shown as bookable representatives and 7 are hidden**, and all 20 companies have at least one visible representative. A colleague created through the portal used to be a delegate and therefore appeared in that list; now they hold the exhibitor-representative role and do not.

  **Not changed here, deliberately.** Correcting the filter would newly expose seven seeded exhibitor representatives on a demonstration surface in a different app, eleven days before the demonstration, and deciding who should be bookable is a product question rather than a completeness or authorization one. Recorded for the project owner alongside the role decision it follows from.

- **The teammate picker offers accounts it should not.** The query behind it returns every account with no company and any role except organizer, so staff and admin accounts appear in an exhibitor's list. The handler is where an authorization rule belongs and that is where this phase put it; narrowing the list is presentation. Recorded as a residual.

- **An existing person attached as a colleague still cannot use the portal.** That is the accepted consequence of the decision recorded in the plan, not an oversight. The alternative removes their meetings-portal access and cannot be undone by the exhibitor who did it. What changed is that the screen now says so.

- **A sign-out that cannot reach the browser's storage leaves the data behind.** The erase is wrapped so that a storage failure never blocks somebody signing out. In that case the data stays, which is exactly the situation before this phase, and better than a Sign out button that does nothing.

---

## Re-run trigger

Re-run this smoketest in full whenever a later change touches:

- `apps/sponsor/lib/query-client.tsx` — the persisted store and the function that erases it
- `apps/sponsor/components/NavBar.tsx` — the only sign-out control in this app
- `apps/sponsor/app/login/page.tsx` — the second erase, the one covering every session end that is not the button
- `apps/sponsor/lib/caller-company.ts` — which company the teammate addresses act for
- `apps/sponsor/app/api/profile/teammates/route.ts` — attach and detach
- `apps/sponsor/app/api/profile/teammates/register/route.ts` — colleague creation and the role it assigns
- `apps/sponsor/components/ProfileEditor.tsx` — the team screen, its note and its error display
- `apps/sponsor/components/RegisterTeammate.tsx` — the create-a-colleague form and its note
- `packages/db/src/app-access.ts` — which role may enter which app, which is what makes the role assignment correct or not
