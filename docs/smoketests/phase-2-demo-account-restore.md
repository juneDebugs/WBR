# Phase 2 smoketest — the gate demonstration account restores its own incompleteness

**Phase:** 2 of `.claude/plans/wbr-uat-followups-2026-08-07.md` (engineer-local).
**Requirements:** `.claude/docs/prds/wbr_uat_followups_2026_08_07.md`, item 3, findings `UF-9` and `UF-40`.
**Contract:** every step below is a contract check per [`CONTRACT.md`](CONTRACT.md) §1.1 — a binary
observable. No step is environment-sensitive, so there is no perf-bar section; §"Perf-bar" at the end
records why.

---

## What this verifies

| AC | Claim |
|---|---|
| AC-1 | Signing in as the delegate demonstration account on the participant application shows the checklist. |
| AC-2 | Completing the checklist releases the account into the application, as before. |
| AC-3 | Signing out and signing in again shows the checklist again. |
| AC-4 | The same three hold on the meetings portal, through the gate phase 1 built. |
| AC-5 | **Containment.** For each of the three non-demonstration canonical accounts: read its required fields from the database, sign in, read them again — the values are identical. |
| AC-6 | An account not carrying the flag is unaffected, including when its profile is deliberately incomplete. |
| AC-7 | The restore happens on the sign-in path only; a session left open while the checklist is completed does not have the field blanked underneath it. |

**AC-5 is the point of this phase, not a footnote.** The mechanism rewrites a whole account
definition when it fires, and one early return is what stops it reaching three real demonstration
logins. Everything in step 3 exists to make that early return's failure loud.

---

## What changed, in one paragraph

`packages/db/src/test-accounts.ts` holds four canonical accounts and one function,
`ensureCanonicalTestAccount()`, which every application's `authorize()` calls before its credential
check. Its health check compared four things — the row exists, the password verifies, the role
matches, the company link matches — and no profile field, so a demonstration account whose profile
had been completed by hand stayed completed (`UF-9`). Account definitions may now carry
`restoreRequiredFields`; for one that does, the health check also compares the six
`DELEGATE_REQUIRED_FIELDS` values against the definition, so a completed profile counts as unhealthy
and the repair that already existed puts it back. Exactly one account carries the flag. No schema
change, no migration, no new route.

---

## Prerequisites

- **A production build of both applications, from this branch.** Phase 7 measured a case that passed
  on a development server and failed on a production build, so this runs on production builds.

  ```bash
  rm -rf apps/attendee/.next apps/meetings/.next
  pnpm --filter attendee build
  pnpm --filter meetings build
  ( cd apps/attendee && npx next start -p 3001 & )
  ( cd apps/meetings && npx next start -p 3002 & )
  ```

- **Check what is actually on each port.** A server built before the change under test will report a
  failure that is not real.

  ```bash
  lsof -nP -iTCP:3001 -iTCP:3002 -sTCP:LISTEN
  ps -o pid,etime,command -p <pid>
  ```

  An age measured in days or in more minutes than the build took is not this run's server.

- **`apps/attendee/.env.local` and `apps/meetings/.env.local`** each with `DATABASE_URL` as an
  absolute `file:` path to `packages/db/prisma/dev.db`, and `NEXTAUTH_SECRET` set.

- **Do not run any of this against a deployment.** Every deployment of this project, preview
  included, reads and writes the shared production database. Step 2's script refuses a non-local
  address for that reason; the by-eye steps have no such guard, so read the address bar.

- **Take a copy of the database first.** Steps 2 to 5 write to four canonical accounts.

  ```bash
  cp packages/db/prisma/dev.db /tmp/dev.db.pre-phase2
  ```

---

### Step 1 — The health check itself, called directly [contract]

**Verifies:** the mechanism, below the applications. This is the only step that can assert a
structural claim — that exactly one account definition carries the flag — because it calls the module
rather than a running server.

```bash
pnpm test:canonical-restore
```

- **Pass:** the run ends `31 passed, 0 failed`, and prints a `connection:` line naming a temporary
  file under `/var/folders/…` or `/tmp/…`.
- **Fail:** any failure, or a `connection:` line naming anything other than a temporary copy — the
  script refuses to run in that case and exits 2, because it writes.

The eleven groups it covers, in order: which account carries the flag; the blocked state is already
healthy so no write happens; a hand-completed profile is put back; the restore settles rather than
writing on every sign-in; the photograph is not compared; a restore that fires does set the
photograph; a wrong password changes nothing; the three unflagged accounts are untouched; an
unflagged account that differs from its definition, and one left deliberately incomplete, are both
left alone; a definition pinning a required field to an empty string does not write on every sign-in;
and neither does a definition that pins nothing for a field at all.

Those last two have no caller today. They are held down because "hold this field empty so the gate
blocks it" is the obvious thing to reach for when the next gate demonstration account is added, and
because the comparison has to agree with what the repair actually writes:

- Three of the six fields are written only when the definition's value is truthy, so pinning one of
  those to an empty string would leave the account unhealthy forever, writing every sign-in and
  never settling.
- A field the definition leaves undefined is never written either, because the database layer reads
  an undefined value as "leave this column alone".

---

### Step 2 — The whole phase, through both running applications [contract]

**Verifies:** AC-1 to AC-7.

```bash
node docs/smoketests/playwright/phase-2-demo-account-restore.mjs
```

- **Pass:** `34 passed, 0 failed`, exit code 0.
- **Fail:** any failure, including a failure in the teardown block. A dirty teardown fails the run
  even when every assertion above it passed, because leaving the demonstration prop completed is
  exactly the harm this phase exists to prevent.

Two preflights run before anything is asserted, and both exist because of a specific past failure:

- **Preflight A** refuses any base address that is not `localhost` or `127.0.0.1`.
- **Preflight B** creates a throwaway delegate, changes its profile straight in the database, and
  checks each application's behaviour changes to match — so a server pointed at a different database
  file is reported as a setup problem rather than as a gate defect.

**What it writes, and what it puts back.** Four canonical accounts. Their **profile** columns are
snapshotted on start and restored on exit, with the restore read back rather than assumed. One
throwaway delegate, `phase2-throwaway-delegate@wbr.invalid`, deleted at the end.

`loginCount` and `updatedAt` are **not** put back, and must not be: every successful sign-in calls
`recordLogin()`, and this run signs in many times, so those columns legitimately move. Measured
across one full session on 2026-08-07: `stephcurry@test.com` went from 417 to 439. The run prints
them at the end rather than restoring them. The claim is "the profile columns are back", not "the
rows are untouched" — saying the stronger thing while doing the weaker one is a defect a reviewer
caught in an earlier draft of this file.

---

### Step 3 — Containment, read from the database by hand [contract]

**Verifies:** AC-5 again, without the script, because this is the criterion that protects three real
demonstration logins.

**Give each account a value no definition holds, first.** Without this the check can pass while a
leak is happening: on a freshly seeded or reset database the three unflagged accounts already hold
exactly the values a leaked restore would write, so `diff` prints nothing either way. The seed, the
reset script and the runtime definitions all agree on those values — for instance Steph Curry's
three-entry `solutionsSeeking` appears identically in `packages/db/prisma/seed.ts:520`,
`packages/db/scripts/reset-test-accounts.mjs:135` and `packages/db/src/test-accounts.ts`. A
distinctive value removes the ambiguity.

```bash
cp packages/db/prisma/dev.db /tmp/dev.db.pre-step3   # so the distinctive values can be undone

sqlite3 packages/db/prisma/dev.db "
  UPDATE User SET solutionsSeeking = '[\"Returns Management\"]', companySize = 'STARTUP'
   WHERE email IN ('wbr@test.com','stephcurry@test.com','sponsor@test.com');"

Q="SELECT email, name, jobTitle, company, companySize, annualRevenue, solutionsSeeking
     FROM User WHERE email IN ('wbr@test.com','stephcurry@test.com','sponsor@test.com')
    ORDER BY email;"
sqlite3 packages/db/prisma/dev.db "$Q" > /tmp/phase2-before.txt
```

Sign in to `http://localhost:3001/login` as each of the three in turn, with `password123`:
`wbr@test.com`, `stephcurry@test.com`, `sponsor@test.com`. The participant application is used
because it is the only one that admits all three roles — the meetings portal does not admit
`SPONSOR`.

```bash
sqlite3 packages/db/prisma/dev.db "$Q" > /tmp/phase2-after.txt
diff /tmp/phase2-before.txt /tmp/phase2-after.txt
```

- **Pass:** `diff` prints nothing and exits 0, **and** the values in `/tmp/phase2-after.txt` are
  still the distinctive ones — `["Returns Management"]` and `STARTUP`. Both halves are needed: the
  first says nothing changed, the second says the thing that did not change was not already the
  value a leak would have written.
- **Fail:** any line of output. Values reverting to each account's own definition is the exact
  signature of the restore reaching an unflagged account.

Then put the three accounts back:

```bash
cp /tmp/dev.db.pre-step3 packages/db/prisma/dev.db
```

---

### Step 4 — The checklist as a person sees it, on the participant application [contract]

**Verifies:** AC-1, AC-2, AC-3 by eye. The script asserts the redirects and the stored values; this
asserts the screen is usable and that the demonstration works the way it will be performed.

- [ ] Sign in at `http://localhost:3001/login` as `onboarding-demo@test.com` / `password123`.
  - **Pass:** the browser ends on `/onboarding`. The outstanding list names
    `Solutions you're seeking` and nothing else.
  - **Fail:** the application opens instead.
- [ ] Pick one solution chip and submit.
  - **Pass:** the browser leaves `/onboarding` and the application renders.
  - **Fail:** the checklist reappears.
- [ ] Sign out, then sign in again with the same credentials.
  - **Pass:** the browser ends on `/onboarding` again, with the same single outstanding item. **This
    is the phase.** Before this change it would have opened the application, because the profile had
    been completed.
  - **Fail:** the application opens.
- [ ] Repeat the three steps once more.
  - **Pass:** the same outcome. The demonstration cannot be used up.

**The photograph, and what is and is not guaranteed about it.** A restore writes the whole
definition, which includes a picture address, so a restore sets the demonstration person's
photograph. Whether you see it change during a run depends on how the database was last populated,
and there is no invariant here:

- `packages/db/scripts/backfill-onboarding-required-fields.mjs` creates this account with **no**
  picture, so after that script the person shows initials until the first restore.
- `packages/db/prisma/seed.ts` supplies a fallback picture by index, and
  `packages/db/scripts/reset-test-accounts.mjs` sets one explicitly, so after either of those the
  person already shows a photograph.

Check before you rely on seeing a change:

```bash
sqlite3 packages/db/prisma/dev.db \
  "SELECT email, COALESCE(image,'NULL') FROM User WHERE email = 'onboarding-demo@test.com';"
```

**The picture is the same one `stephcurry@test.com` uses** — measured, both rows currently hold
`photo-1507003211169-0a1dd7228f2d`. Two demonstration accounts show the same face. That is a
pre-existing property of the definitions rather than something this phase created, and it is
recorded as `UF-40` for a later phase to settle. It matters only if a screen ever shows both
accounts at once.

**A note on driving this step with a browser automation tool.** Two traps were measured on
2026-08-07 and both produce a false failure:

- **Setting the form fields programmatically does not always reach the form's own state.** A sign-in
  submitted that way can fail silently, leaving the account untouched, which reads exactly like the
  restore not firing. Type the credentials with the keyboard, or drive the sign-in over HTTP.
- **The sign-out control on `/api/auth/signout` stopped taking effect after its first use** in one
  session. Confirm the sign-out worked before concluding anything: load `/home` and check it
  redirects to `/login`, not to `/onboarding`. A still-signed-in browser landing on `/onboarding`
  means the gate is working, not that a fresh sign-in happened.

Also note **NextAuth cookies are shared across ports on `localhost`**, so a session created on 3001
is visible to 3002. Signing in to one application signs you in to the other for these checks.

---

### Step 5 — The same, on the meetings portal [contract]

**Verifies:** AC-4, through the gate phase 1 built.

- [ ] Repeat step 4 in full at `http://localhost:3002/login`.
  - **Pass:** identical outcomes at every step.
  - **Fail:** any difference between the two applications. The gate reads the same six fields from
    the same module in both, so a difference is a defect in one of the two adapters rather than in
    this phase.

Note the two applications' save addresses take different shapes for the same field — the participant
one requires the solutions list already encoded as a string, the meetings one encodes it itself. That
is visible only to something calling the addresses directly, which is why the script sends each
application the body its own checklist sends. Recorded as `UF-41`, accepted rather than fixed.

---

### Step 6 — The demonstration prop is left ready [contract]

**Verifies:** that the run did not consume the thing it was testing.

```bash
sqlite3 packages/db/prisma/dev.db \
  "SELECT email, solutionsSeeking FROM User WHERE email = 'onboarding-demo@test.com';"
```

- **Pass:** prints `onboarding-demo@test.com|[]`.
- **Fail:** anything else. Recover by signing that account in once — which is now sufficient, and is
  the whole point of the phase — or with the manual reset, which still works:

  ```bash
  DB="file:$PWD/packages/db/prisma/dev.db"
  DATABASE_URL="$DB" pnpm db:backfill-onboarding --dry-run
  DATABASE_URL="$DB" pnpm db:backfill-onboarding
  ```

  That command needs `DATABASE_URL` in its environment and reads no `.env` file; without it, it exits
  1 with `Set DATABASE_URL (e.g. file:./dev.db)` (`UF-35`).

- [ ] Also confirm nothing was left behind:

  ```bash
  sqlite3 packages/db/prisma/dev.db "SELECT COUNT(*) FROM User WHERE email LIKE 'phase2-%';"
  ```

  - **Pass:** `0`.

---

## Negative controls

A fix that reads correctly and does nothing is the failure mode this project has recorded twice
(`UF-36`, `UF-22`). Every control below reintroduces one defect on its own and must turn the run red.

**Against the module, step 1's runner:**

| # | Defect reintroduced | Result |
|---|---|---|
| 1 | `restoreRequiredFields` removed from the account | red — 6 assertions |
| 2 | The comparison removed from the health check | red — 4 assertions |
| 3 | The photograph fetched and compared | red — 3 assertions |
| 4 | The skip for a field the definition does not pin, removed | red — 1 assertion, `writes were [true, true, true]`. NOTE: this control needs an UNCONDITIONALLY written field (name). Using a conditionally written one leaves the run green, because the empty-pin skip already covers it — measured. |
| 5 | The whole derived list dropped from the database query | **refused by the type checker** (`TS2559`, no properties in common) — the defect cannot compile |
| 5b | The list hand-written, missing one of the six | red — 5 assertions |
| 6 | The exemption for unflagged accounts removed | red — 7 assertions, including `stephcurry@test.com`'s stored value being overwritten |
| 7 | The skip for a required field pinned to an empty string removed | red — 1 assertion, reporting `writes were [true, true, true]`, which is the account writing on every sign-in |

**Against both production builds, step 2's runner** — each rebuilt and restarted with the defect
present, because a server built before the mutation does not contain it:

| # | Defect reintroduced | Result |
|---|---|---|
| A | `restoreRequiredFields` removed from the account | red — 4 assertions, all AC-3: `expected [] after a fresh sign-in, found ["AI & Automation"]` on both applications |
| B | The exemption for unflagged accounts removed | red — 5 assertions, all containment: `stephcurry@test.com` rewritten to its definition value `["AI & Automation","Personalization","Analytics & Reporting"]`, and its deliberately emptied `companySize` filled back in |

Control B is the one that matters most: it proves the containment assertions can detect a leak
rather than passing because nothing ever happens. Both outcomes are defect-specific and cannot be
produced by clean code, which is what establishes that the rebuilt servers really did contain each
mutation. The clean rebuild afterwards returns the run to 34 passed, 0 failed.

Two of the module controls were rewritten after their first versions failed to compile for reasons
unrelated to the defect. A control that turns a run red through a compile error proves nothing about
the check, which is the same mistake `UF-38` records.

---

## Perf-bar

**None.** Nothing in this phase is environment-sensitive: a column holds a value or it does not, and
a request redirects or it does not.

The requirements document asks for one perf-bar note — the added sign-in write for demonstration
accounts, stated as a comparison against the sign-in path's current timing. The added work is six
string comparisons against a row already fetched, on the four canonical email addresses only, and it
is placed **before** the scrypt password verification, so an account that needs restoring skips the
hash rather than adding to it. The write itself is the one that already existed. No account outside
the canonical four reaches this code at all, because `isCanonicalTestEmail()` gates the call.

---

## Summary

| Step | Category | Tier | Covers | Status |
|---|---|---|---|---|
| 1 | contract | any | the health check, called directly | pass — 31 assertions |
| 2 | contract | C, local production build | AC-1 to AC-7 through both applications | pass — 34 assertions, run twice |
| 3 | contract | C | AC-5 again, read from the database by hand | pass — `diff` empty after all three signed in |
| 4 | contract | C | AC-1 to AC-3 by eye, participant application | pass with one part not driven from the browser — see below |
| 5 | contract | C | AC-4 by eye, meetings portal | pass — checklist renders with one outstanding item |
| 6 | contract | C | the demonstration prop is left ready | pass — `[]`, zero throwaway rows |

Run on 2026-08-07 against production builds of both applications, database
`packages/db/prisma/dev.db`.

**Step 4, exactly what was seen and what was not.** Seen on screen: the checklist at `/onboarding`
with heading `Complete your profile`, `STILL NEEDED (1)` and the single item
`Solutions you're seeking`, with the avatar showing the initials `OD`; selecting one solution
changing the card to `Everything required is filled in.` and enabling the button reading
`Enter the event`; submitting and reaching `/home` with `Hi, Onboarding`; and — after a restore
fired — the checklist again with the same single outstanding item and **the avatar now a
photograph**, which is `UF-40` observed rather than predicted. Also seen: a session issued while the
account was complete does not walk past the gate, because `/home` still redirected to `/onboarding`
once the restore had put the account back.

Not driven from the browser: the sign-out-then-sign-in-again cycle, because the sign-out control
stopped taking effect after its first use in that session. That link is covered at the request level
three separate ways — by step 2 on both applications, by a direct HTTP sign-in measured on its own
(`["Analytics & Reporting"]` with no photograph became `[]` with a photograph across one sign-in),
and by control A, which makes exactly that assertion fail when the flag is removed.

**Database after everything.** The three non-demonstration canonical accounts are byte-identical to
a copy taken before any of this ran; the demonstration account is blocked at `[]` and now carries
its photograph; no throwaway rows remain; the total user count is unchanged at 2541.
