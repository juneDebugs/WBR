# Phase 12 smoketest — "Sign in with LinkedIn" on the participant app

**Written:** 2026-08-04. **Shape rule:** [`docs/smoketests/CONTRACT.md`](CONTRACT.md).

Every step below is a **contract check** — a behaviour that depends on code rather than on the environment it
runs in, with a pass criterion that is a binary observable. **This phase makes no performance claim, so there
is no perf-bar step and no environment tier to match.**

---

## What this verifies

Mapped to the plan's § Phase 12 acceptance criteria and to the requirements document's findings F-24 to F-29.

| Verification | Criterion | Established by |
|---|---|---|
| With the credentials set, the LinkedIn provider is registered and the button is on the login screen | 1 | Step 1 |
| Pressing it builds a correct authorization redirect | 1 | Step 1 |
| A real LinkedIn sign-in pre-fills name and photo | 1 | **Step 3 — human** |
| A person carrying a name and photo sees both at the top of the checklist | 1 | Step 1 |
| After a name-and-photo pre-fill, job title and company are still hand-entered and the gate still holds | 2 | Step 1 |
| With the credentials blank, the button is hidden and email-and-password still reaches the app | 3 | Step 1 |
| An arrival with no email address is refused and the refusal names the cause | F-25 | Step 1 (rule + screen), **Step 3 — human** (no row created) |
| An unverified address may create a new account and may never join one that exists | F-27 | Step 1 (rule + screen), **Step 3 — human** (a real refused join) |
| Every refusing path carries nothing to write | F-28 | Step 1 (the decision cannot produce a write), **Step 3 — human** (the row after a real refusal) |
| The assertions above can go red | — | Step 2 |

---

## THE HONEST LIMIT, STATED BEFORE THE STEPS

**No automated assertion executes `apps/attendee/lib/auth.ts`.** Completing a real LinkedIn sign-in requires
typing a LinkedIn account password, and this project's rules forbid entering a password anywhere. So Step 1
cannot drive LinkedIn's token exchange, its member-details reply, or the sign-in callback.

**What Step 1 asserts instead**, and the distinction matters when citing a pass:

- The **rules** those behaviours are built from, as plain functions — including which account a sign-in may
  have, and whether a decision carries anything to write. This is stronger than reading the code and weaker
  than reading the database.
- The **screen**, in a real browser: the button's presence and absence, the two refusal sentences, and the
  checklist's rendering of a name and photo already on a person.

**What only Step 3 can establish**, listed individually rather than as a caveat:

1. That a real LinkedIn sign-in fills name and photo.
2. That an arrival with no email address is refused **and creates no row**.
3. That an unverified address is refused at an existing row **and mutates nothing**.
4. That a role this app does not admit is refused **and mutates nothing**.
5. That a first sign-in creates a row, a second joins it, a login is recorded, and the role and company link
   reach the session.

**A passing Step 1 is evidence about the assertions it lists and about nothing else.** It is not evidence for
items 1 to 5.

---

## Prerequisites

- **Nothing else listening on port 3001.** Step 1 starts and stops the participant app itself, twice, because
  criterion 3 is about a configuration difference and a run that cannot change the configuration cannot
  measure one. It refuses to start if the port is busy.
- A production build present: `pnpm exec turbo build --filter=attendee`
- `apps/attendee/.env.local` carrying `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL` and both
  `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`. The blank half of the run overrides the two LinkedIn
  values with empty strings in the child process; **it does not edit the file.**
- The canonical demo attendee `stephcurry@test.com` / `password123`.
- Playwright with chromium.

**The local database only.** Step 1 borrows `stephcurry@test.com`, blanks its required fields, asserts, and
restores. Pointed at a deployed app those writes would land in the production database, which preview
deployments share — so the script refuses any base address that is not `localhost`.

**No `.env.production.local` exists for `apps/attendee`**, so F-23 — a local app silently reaching the deployed
database — does not apply to this app. Checked 2026-08-04: no Turso variables in the shell, none in the app's
environment files, and no such file present.

---

### Step 1 — the automated suite [contract]

```
pnpm exec turbo build --filter=attendee
node docs/smoketests/playwright/phase-12-linkedin-sign-in.mjs
```

**Pass criterion:** exits 0, reporting **120 passed, 0 failed**, and printing
`stephcurry@test.com restored to its pre-run values`.

**Recorded run, 2026-08-04: 120 passed, 0 failed**, account restored. The count rose from 113 when F-29 added
nine assertions about which shapes of the verification claim are accepted, and one about the returning-delegate
journey the defect broke. Two preconditions were checked first,
because the handoff records both as having produced false results before: the persisted fetch cache at
`apps/attendee/.next/cache/fetch-cache` was cleared, and no source file was newer than
`apps/attendee/.next/BUILD_ID`, so the build under test matched the source.

Five groups. C is the rules, checked directly. A is the configured state. D is the checklist. E is the two
refusal sentences. B is the blank-credentials state.

**Two assertions that exist because an earlier version could pass without measuring anything:**

- **B4a and B4b.** The button is absent until the page's own request for the provider list returns. An earlier
  B5 waited four times as long as the button had taken to appear *in the other server configuration* and then
  concluded absence — which a slow or failed request would satisfy identically. The run now waits for that
  page's actual provider response and asserts the reply does not name LinkedIn, before looking for the button.
- **B6.** The Google button is asserted present at the same moment B5 finds no LinkedIn button, so "nothing
  found" cannot mean "the page never rendered".

**C29 to C33 are pinned values, not live checks.** They compare a constant in the script to a constant in the
module. Nothing reads LinkedIn. The five were verified once by hand on 2026-08-04:

```
$ curl -s https://www.linkedin.com/oauth/.well-known/openid-configuration
{
  "issuer" : "https://www.linkedin.com/oauth",
  "authorization_endpoint" : "https://www.linkedin.com/oauth/v2/authorization",
  "token_endpoint" : "https://www.linkedin.com/oauth/v2/accessToken",
  "userinfo_endpoint" : "https://api.linkedin.com/v2/userinfo",
  "jwks_uri" : "https://www.linkedin.com/oauth/openid/jwks",
  "scopes_supported" : [ "openid", "profile", "email" ],
  ...
}
```

They are kept as tripwires because C31 is what went red when a control reverted the member-details address to
the retired `/v2/me` — the mistake the library's own LinkedIn provider makes. Fetching that document from the
suite would make it fail whenever LinkedIn is unreachable, which the contract forbids for a contract check.

---

### Step 2 — the negative controls [contract]

```
bash docs/smoketests/playwright/phase-12-negative-controls.sh
```

**Pass criterion:** exits 0, reporting **Controls: 12 of 12 caught by their prediction**.

Recorded run, 2026-08-04: **12 of 12.** Every prediction was written into the script before it ran. Five gates
per control: the substitution must apply exactly once, the build must succeed, the port must be free, the suite
must be caught, and it must be caught by the predicted number. A crashed run reports 999, which no prediction
matches, so a crash can never score as a catch.

**Four predictions across this phase were wrong, and all four are kept as written rather than adjusted to fit.**
Two were caught by a run disagreeing with them, which is the mechanism working:

| Control | Predicted | Caught | What the wrong prediction showed |
|---|---|---|---|
| the issuer control (retired) | a refusal | an identical correct redirect | the declared issuer is inert — **F-26** |
| NC-2, first version | 3 | 2 | B4 guards a property no single substitution can redden |
| NC-3, after F-29 | 3 | 4 | a fourth assertion reads `prefillFields` through the returning-delegate check |
| NC-10, after F-29 | 5 | 4 | `null` is falsy, so this control cannot redden C38a at all — that assertion stands alone |

Three further predictions were recomputed **in advance** as the suite grew, which is different from being wrong:
NC-2 to 4 when the provider-reply assertion was added, NC-3 to 3 and NC-4 to 7 when the F-27 and F-28 assertions
were added.

**A thirteenth control is absent on purpose and its absence is the record of F-26.** It substituted the
declared issuer with the value LinkedIn's documentation page prints, and predicted a refusal. The prediction
was wrong: the substituted build produced an identical, correct redirect. Reading the library to explain that
found the declared issuer is inert in this configuration, so a safeguard described in three places did not
exist. There is no version of that control which passes, because it tested a mechanism that is not there.

**Three predictions were recomputed as the suite grew** — NC-3 from 2 to 3, NC-4 from 3 to 7, NC-2 from 3 to
4 — each recomputed in advance, and each because new assertions reach code the control already broke. None was
adjusted after a disagreement.

**What no control reddens**, established by round 3 of the review and recorded rather than left implicit: the
authorization, token and signing-key addresses; the scope string; `checks: ['state']`; the absence of PKCE;
`client_secret_post`; every write the callback performs; `recordLogin` on a LinkedIn path; attaching the role
and company link to the session; the onboarding page's widened read. The callback ones are the material
absences, and they are the same ones Step 3 exists for. The endpoint values are at least asserted directly by
Step 1, even where no control reddens them.

---

### Step 3 — the real LinkedIn round trip [contract] — HUMAN, REQUIRED BEFORE THIS PHASE IS CALLED DONE

**Nothing automated covers any part of this step.** It has to be run by a person, because it needs a LinkedIn
password typed into LinkedIn.

**Run it against `http://localhost:3001` and the local database only.** Signing in against a deployment writes
a real person row into the production database.

```
pnpm exec turbo build --filter=attendee
cd apps/attendee && npx next start -p 3001
```

**3a — the pre-fill.** In a browser, open `http://localhost:3001/login`. **Pass criterion:** a
"Sign in with LinkedIn" button is on screen. Press it, complete the LinkedIn sign-in, and land back in the app.
**Pass criterion:** the checklist at `/onboarding` shows your LinkedIn name in the Name field and your LinkedIn
photo as a round picture above the form.

**3b — job title and company are still demanded.** **Pass criterion:** on that same checklist, Job Title and
Company are empty and both are listed under "Still needed", and the app cannot be reached until they are
filled.

**3c — an edit survives the next sign-in.** Change the Name field to something different, save, sign out, and
sign in with LinkedIn again. **Pass criterion:** the edited name is still there, not replaced by the LinkedIn
one.

**3d — a refused role writes nothing.**

**THE FIRST DESIGN OF THIS STEP COULD NOT WORK, AND FINDING THAT OUT IS PART OF THE RECORD.** It pointed an
exhibitor-representative row at the tester's LinkedIn address and expected a refusal. **The participant app
admits every role that exists** — `APP_ALLOWED_ROLES.attendee` in `packages/db/src/app-access.ts:78` lists
`BRAND`, `SPONSOR`, `ATTENDEE`, `SPEAKER`, `WBR`, `ORGANIZER`, `ADMIN` and `STAFF` — and the login screen even
advertises `sponsor@test.com` as a demo account for it. So no refusal was possible: the sign-in correctly
joined that row, correctly filled its blank name from LinkedIn, and correctly admitted the tester.

**Consequence worth stating on its own: the role-refusal branch in the LinkedIn sign-in is unreachable with any
role this system currently has.** It is defence in depth. It becomes reachable the moment a role is added that
this app does not admit, which is exactly when nobody will be thinking about LinkedIn.

**The step as run.** A role outside the admitted set is given to the row, which is precisely the condition
under test:

```
# arm — save role and name first
sqlite3 packages/db/prisma/dev.db \
  "UPDATE User SET role='FORMER_DELEGATE', name=NULL WHERE email='<your-linkedin-address>';"

# sign out, press "Sign in with LinkedIn", then read the row back
sqlite3 packages/db/prisma/dev.db \
  "SELECT role, name, loginCount FROM User WHERE email='<your-linkedin-address>';"

# restore
sqlite3 packages/db/prisma/dev.db \
  "UPDATE User SET role='ATTENDEE', name='<the saved name>' WHERE email='<your-linkedin-address>';"
```

**Pass criterion:** the sign-in is refused with the sign-in library's own `Access Denied` screen, which names no
cause by design; and afterwards `name` is still empty, `loginCount` is unchanged, and no row was created.

---

## Recorded outcomes of Step 3, run 2026-08-04

**3a — PASS.** The button was on the login screen. A real LinkedIn sign-in created a row and landed on the
checklist with the name and photo filled in. The row, read directly: `role` `ATTENDEE`, name set, `image` on
`media.licdn.com`, no password, `loginCount` 1, no company link. **This is the only evidence that the callback's
create path works**, and it also establishes that `recordLogin` fires and that the delegate role is what gets
assigned.

**3b — PASS.** Job title and company were empty on arrival and had to be typed; the gate held the tester on the
checklist until the required set was complete. LinkedIn supplies neither field, which is why FP 12 exists.

**3c — PASS, and it proves the join path.** The name was changed by hand to `Edited By Hand`, then a second real
LinkedIn sign-in was completed. Afterwards: `name` still `Edited By Hand` — **LinkedIn did not overwrite the
edit** — `loginCount` 1 → 2, and the total row count unchanged, so the sign-in joined the existing row rather
than creating a second. Nothing automated covers this branch.

**3d — PASS.** With a role outside the admitted set and a blank name, the sign-in was refused with
`Access Denied`. Afterwards `name` was still empty, `loginCount` was still 2, and the row count was unchanged
at 2541. **F-28 holds against a real refused sign-in**, not only at the rule level.

**F-29 was found by this step and by nothing else.** Between 3a and 3c the second real sign-in was refused with
the unverified-address message. LinkedIn sends `email_verified` as the **string** `"true"` while its
documentation types it Boolean, so the strict check read a real verification as none and the binding rule then
locked out every returning delegate. Three review rounds and twelve negative controls all missed it, because all
of them checked the code against the same wrong documentation. Full analysis in **F-29**.

**Still not established by anything, and not claimed.** That an arrival with **no email address** is refused
without creating a row. LinkedIn sent an address on every attempt, so the case could not be produced. It is
asserted at the rule level only.

**Everything borrowed was put back**, verified by reading the rows: the seeded exhibitor row at
`sponsor@test.com` / `SPONSOR` / `Sponsor`, the tester's row at `ATTENDEE` / `Edited By Hand`, and 2541 rows
with an address — the same count as before Step 3, plus the one row the first sign-in legitimately created.

---

## Residuals

Recorded rather than fixed. Each is a known limitation of what is being shipped, not a step that was skipped.

1. **A crash between the suite's blanking write and its restore leaves `stephcurry@test.com` blanked.** The
   restore now counts a failure and prints the values needed to put the row back by hand, so a failed restore
   cannot be mistaken for success. Removing the exposure entirely means borrowing a throwaway account rather
   than a demo one, which needs a password hash the script does not create.
2. **A row whose stored address is not already lowercase would be missed, and a second row created for the
   same person.** `User.email` is `TEXT` with a plain unique index and no case-insensitive collation, so
   `Alice@Example.com` and `alice@example.com` are distinct values. **Not reachable from this codebase:** all
   seven call sites of `prisma.user.create` and `prisma.user.upsert` lowercase first, as does the seed, and of
   2540 stored addresses 0 are not entirely lowercase, 0 carry padding, and 0 pairs differ only by case. If
   such a row ever appeared — a manual insert, a future import — the original password-bearing account would
   become unreachable, because the ordinary login path would resolve to the new passwordless row.
3. **The button stays hidden when the provider list is slow or unreachable.** Deliberate: it fails closed, and
   never draws a button that cannot complete a sign-in. A person with JavaScript disabled sees neither this
   button nor the Google one, which is existing behaviour.
4. **Google's branch still overwrites name and photo on every sign-in and still manufactures a name from the
   email address.** Out of scope for this phase and deliberately unchanged. LinkedIn's branch does neither, so
   the two differ; the difference is recorded in both files.
5. **The declared issuer does nothing in this configuration.** Kept at the correct value because openid-client
   needs one to construct with, and because it becomes a real check the moment anyone sets `idToken: true`.
   F-26.
6. **`restore_all()` in the controls script does not verify file content after copying.** A partial restore is
   caught only by the next control's baseline check. Round 3 of the review raised it; not changed.
7. **`pnpm lint` cannot run anywhere in this repository.** No app has an ESLint configuration, so `next lint`
   drops into an interactive setup prompt. Pre-existing and untouched by this phase. `pnpm typecheck` runs and
   is clean apart from the documented pre-existing `components/BottomNav.tsx` error.
8. **Two unrelated files share this phase's number.** `docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs`
   and `phase-12b-ai-controls.mjs` are June-sprint work. Nothing here supersedes them.
9. **Both login pages print working credentials on screen.** Carried from Phase 11; raised, not acted on.

---

## Summary

| Step | Category | Tier | Status |
|---|---|---|---|
| 1 — the automated suite, 120 assertions | contract | n/a | **PASS**, 2026-08-04 |
| 2 — the negative controls, 12 of 12 | contract | n/a | **PASS**, 2026-08-04 |
| 3a — a real sign-in pre-fills name and photo | contract | n/a | **PASS**, 2026-08-04 (human) |
| 3b — job title and company still demanded after a real sign-in | contract | n/a | **PASS**, 2026-08-04 (human) |
| 3c — an edit survives the next real sign-in | contract | n/a | **PASS**, 2026-08-04 (human) |
| 3d — a refused role writes nothing | contract | n/a | **PASS**, 2026-08-04 (human) |

**Every step passes.** Steps 3a to 3d are the only evidence for anything the sign-in callback does, and running
them found **F-29** — a defect that had passed three review rounds and twelve negative controls.

**One case remains unproduced and is not claimed anywhere as passing:** an arrival with no email address. LinkedIn
sent an address on every attempt, so the refusal could not be triggered. It is asserted at the rule level only.
