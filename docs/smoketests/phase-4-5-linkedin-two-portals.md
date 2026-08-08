# Phases 4+5 smoketest — sign in with LinkedIn on the meetings portal and the sponsor portal

Manual verification path. Both human and AI agents are valid runners. Authored per
`docs/smoketests/CONTRACT.md`. Source: `.claude/plans/wbr-uat-followups-2026-08-07.md`
§ "Phases 4 and 5", and findings `UF-52` to `UF-58` in
`.claude/docs/prds/wbr_uat_followups_2026_08_07.md`.

The two plan phases are delivered as one commit (`UF-52`). Both acceptance lists are
carried across unchanged and both appear below; nothing was dropped by the merge.

## What this verifies, and what is still outstanding

| AC | Claim | From | Covered by | State |
|---|---|---|---|---|
| AC-1 | The identity module lives in the shared package and is deep-imported by module path; no application holds a copy. | phase 4 | Step 1, `S1`–`S2` | verified |
| AC-2 | The participant application's LinkedIn sign-in behaves exactly as before the move. | phase 4 | Step 5, the phase 12 script in full | verified |
| AC-3 | The create path consults the admitted-role test before any write. | phase 4 | Step 1, `A3`–`A5`, `S3`–`S6` | verified |
| AC-4 | Sign in with LinkedIn appears on the meetings portal login screen when its credentials are configured, and is absent when they are not. | phase 4 | Step 3 | verified |
| AC-5 | A person with no existing account signing in through LinkedIn on the meetings portal is created, admitted, and lands on the checklist. | phase 4 | Step 4a | verified |
| AC-6 | An existing participant signing in through LinkedIn on that portal reaches their own account — the row count for that email address stays at one. | phase 4 | Step 4b | verified |
| AC-7 | Name and photograph pre-fill only into blank fields, so an edit made on the checklist survives the next LinkedIn sign-in. | phase 4 | Step 4b and 4a (decision half: Step 1, `A8`, `A14`) | verified |
| AC-8 | Sign in with LinkedIn appears on the sponsor portal login screen when configured, and is absent when not. | phase 5 | Step 3 | verified |
| AC-9 | An existing sponsor representative whose email address matches signs in through LinkedIn and reaches their own account; the row count stays at one. | phase 5 | Step 4d (decision half: Step 1, `A7`) | verified |
| AC-10 | That person is then measured by the sponsor gate as before — an incomplete company routes them to the checklist. | phase 5 | Step 4d | verified |
| AC-11 | A person with no existing account is refused, the sign-in screen names the cause, and no user row exists for that email address afterwards. | phase 5 | Step 4c; refusal + message also at Step 1 `A3`, Step 3 `C2d`/`C2e` | verified |
| AC-12 | The refusal leaves no partial write of any kind: no name, no photograph, no row. | phase 5 | Step 4c; decision carries nothing to write at Step 1 `A4` | verified |
| AC-13 | The redirect addresses registered on the LinkedIn developer application are recorded, and each one resolves to a deployment in use. | phase 5 | recorded below; the addresses the apps send are checked at `C1b`/`C2b`; deployed portals: Step 6 | **partly outstanding** |

**Twelve of the thirteen are verified.** Steps 1, 2, 3, 4 and 5 pass. Only AC-13's deployed
half is outstanding, and it waits on a deployment rather than on any code.

**Nothing in Steps 1–3 establishes that a refused sign-in leaves no database row.** Those
steps establish that the decision handed to the sign-in callback contains nothing to write,
and that the sponsor portal's callback has no create path at all (`S6`). The row itself is
read in Step 4c, and was.

## What changed, in one paragraph

The module holding every LinkedIn rule moved from `apps/attendee/lib/linkedin-identity.ts`
to `packages/db/src/linkedin-identity.ts`, and all three applications now deep-import it
at `@conference/db/src/linkedin-identity`. It imports nothing at all, not even a type —
see `UF-54` for why it cannot borrow the sign-in library's own provider type. Its decision
function gained a required `createRole` argument and now applies the admitted-role test to
the create path as well as the join path (`UF-53`), returning the tested role on the create
result so the caller writes that role rather than a literal of its own. The meetings portal
and the sponsor portal each register the provider when both credentials are present, draw
the button only when the running application reports the provider, and turn a refusal
marker into a sentence. The sponsor portal carries one message the other two do not: the
refusal for someone with no account here, which that portal is the only one able to
produce.

## Prerequisites

- Node 26 or newer. The scripted groups import the TypeScript module directly, which
  relies on the runtime stripping types. Measured on v26.0.0.
- Production builds, not dev servers. Dev mode is tier D and is invalid here:
  `pnpm --filter meetings build && pnpm --filter meetings start` (port 3002) and
  `pnpm --filter sponsor build && pnpm --filter sponsor start` (port 3003).
- `apps/meetings/.env.local` and `apps/sponsor/.env.local` each hold
  `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET`, copied from
  `apps/attendee/.env.local`. All three files are ignored by git. Each app's
  `.env.local.example` documents them.
- For Step 4 only: a real LinkedIn account, and a second one to run AC-11 as written.
  **This step cannot be scripted** — LinkedIn asks for an account password, and this
  project's rules forbid putting one in a script. It is run by hand by the person who owns
  the account. The phase 12 smoketest records the same constraint.
- These redirect addresses registered on the LinkedIn developer application, read from
  its OAuth 2.0 settings on 2026-08-08. **This list is a recorded fact, not a measured
  one — no request made by any script here can read that settings page.**

  ```
  http://localhost:3001/api/auth/callback/linkedin           <- participant app
  http://localhost:3002/api/auth/callback/linkedin           <- meetings portal
  http://localhost:3003/api/auth/callback/linkedin           <- sponsor portal
  https://wbr-mobile.vercel.app/api/auth/callback/linkedin
  https://wbr-june-1220s-projects.vercel.app/api/auth/callback/linkedin
  https://wbr-mobile-june-1220s-projects.vercel.app/api/auth/callback/linkedin
  ```

  The deployed meetings and sponsor portals have **no** address in that list. Until they
  do, the button works locally on both and on neither deployment.

## Steps

### Step 1 — The shape of the change and the decision rules [contract]

**Verifies:** AC-1, AC-3, and the decision half of AC-7, AC-9, AC-11, AC-12.

```bash
node docs/smoketests/playwright/phase-4-5-linkedin-two-portals.mjs
```

- [ ] Run the script with neither portal started, so Groups S, A and B run.
  - **Pass:** every `S`, `A` and `B` check prints `pass`, and the run reports `0 failed`.
  - **Fail:** any check prints `FAIL`, or the run exits non-zero.

Group S reads the repository rather than calling anything: exactly one
`linkedin-identity.ts` exists (`S1`); every import of it names the shared package (`S2`);
each of the three sign-in files asks its own application's role test and states the role a
new account would be given (`S3`, `S4`); the two applications that create accounts write
`action.role` rather than a literal (`S5`); and the sponsor portal's LinkedIn branch
contains no `prisma.user.create` or `upsert` at all (`S6`).

`S5` and `S6` read **only the LinkedIn branch**, located by matching braces from the `if`
that opens it rather than by slicing between two provider names. Round 3 found the first
version brittle — a reordered file or a comment naming the other provider would have
silently produced an empty slice that passes forever. `S6b` guards that directly: each
located branch must contain the `linkedInAction(` call it is supposed to be about, so a
wrong slice fails rather than passing quietly.

Group S exists because Group A calls the shared decision with arguments the script
supplies, so on its own it would stay green if an application passed the wrong ones.
Adversarial review round 2 found exactly that gap.

Group A asserts, among others: the sponsor portal refuses a first-time person by name
rather than creating one (`A3`); four different refusals each carry no `email`, `name`,
`image`, `role` or `update` field (`A4`); a created account carries the role the role test
was actually asked about, checked with a sentinel value rather than a constant this file
declares (`A5`); a delegate whose address matches a sponsor sign-in is refused with the
library's generic screen rather than a sentence that would confirm the address is known
here (`A9`).

### Step 2 — The negative controls [contract]

**Verifies:** that Step 1's checks can fail.

Group B re-creates four defects as functions in the same file and runs **the same
assertion functions Group A runs** against them — not paraphrases. That is a change from
the first draft, which round 2 correctly identified as controls vouching for assertions
they did not execute.

- [ ] Read the Group B lines in the same run.
  - **Pass:** `B1` to `B5` each print `pass`, meaning the broken implementation made the
    corresponding Group A assertion fail.
  - **Fail:** any control prints `the control stayed GREEN with its defect present`.

### Step 3 — The running portals [contract]

**Verifies:** AC-4, AC-8, and the "address the app sends" half of AC-13.

**Environment:** tier C, local production build.

- [ ] Start both portals, then run the script demanding they be up:

  ```bash
  REQUIRE_PORTALS=1 node docs/smoketests/playwright/phase-4-5-linkedin-two-portals.mjs
  ```

  The flag matters: without it an unreachable portal is skipped and the run can still exit
  0, so a recorded run must set it. Round 2 found that too.

  - **Pass:** `C1a`–`C1f` and `C2a`–`C2f` all print `pass`. Each portal's provider list
    names `linkedin`; its callback address is its own; its sign-in screen draws exactly one
    element carrying `data-testid="signin-linkedin"`; each refusal marker produces a
    distinct screen; and a plain `/login` shows no refusal message.
  - **Fail:** any of those prints `FAIL`.

  **What `C1b` and `C2b` do not prove.** They read the address the portal *will send*. They
  cannot establish that the address is registered on the LinkedIn developer application —
  nothing reachable from this machine can read that settings page. That is the recorded
  list above, and Step 6.

- [ ] **The button is absent when the credentials are not set.** Run each portal on a spare
      port with both values blank:

  ```bash
  cd apps/meetings && LINKEDIN_CLIENT_ID="" LINKEDIN_CLIENT_SECRET="" \
    NEXTAUTH_URL="http://localhost:3012" npx next start -p 3012
  curl -s http://localhost:3012/api/auth/providers

  cd apps/sponsor && LINKEDIN_CLIENT_ID="" LINKEDIN_CLIENT_SECRET="" \
    NEXTAUTH_URL="http://localhost:3013" npx next start -p 3013
  curl -s http://localhost:3013/api/auth/providers
  ```

  - **Pass:** each list holds `google` and `credentials` and does **not** hold `linkedin`,
    and the sign-in screen draws zero elements carrying `data-testid="signin-linkedin"`.
  - **Fail:** `linkedin` is present, or a button is drawn — either would be a button that
    cannot complete a sign-in.

### Step 4 — A real LinkedIn sign-in, by hand [contract]

**Verifies:** AC-5, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12.

**Environment:** tier C, local production build, local database. Signing in against a
deployment writes to the shared production database — do not.

**This step is not scriptable.** Read the rows from the database directly rather than from
any screen.

**Run 2026-08-08 — all parts pass.** The account used was one whose address already held a
row from the phase 12 work, so the parts were run in the order 4b → 4c → 4a → 4d rather
than as numbered; the row was copied to `/tmp` and removed between them, and restored
afterwards. Results are recorded under each part.

```bash
sqlite3 packages/db/prisma/dev.db \
  "SELECT id, email, role, name, image IS NOT NULL AS has_photo FROM User WHERE email = '<address>';"
```

- [x] **4a — a first-time person on the meetings portal.** Using a LinkedIn account whose
      email address has no row in `User`, press Sign in with LinkedIn at
      `http://localhost:3002/login` and complete it.
  - **Pass:** the browser lands on the meetings portal's checklist, and exactly one row now
    exists for that address with `role = 'ATTENDEE'`.
  - **Fail:** the sign-in is refused, no row is created, more than one row exists, or the
    browser lands anywhere other than the checklist.
  - **Measured 2026-08-08: PASS.** A row appeared 51 seconds after the sign-in, with
    `role = ATTENDEE`, `loginCount = 1`, no company link, and the name taken from the
    LinkedIn profile. The screen was the meetings portal's own checklist, distinguished
    from the participant application's by its closing words "before you start booking
    meetings" — the participant application's ends "before you start". That distinction
    mattered: the wording was the only thing separating a correct result here from the
    sponsor portal wrongly admitting someone.

- [x] **4b — the same person again.** Sign out, sign in through LinkedIn again.
  - **Pass:** the row count for that address is still exactly one.
  - **Fail:** a second row appears.
  - **Measured 2026-08-08: PASS.** Run first, against a row already present from the phase
    12 work. Afterwards: `rows = 1`, and `loginCount` moved from 2 to 3, which is what
    shows the sign-in completed rather than failing quietly.

- [x] **4c — pre-fill writes only into blank fields.** Change the name on the checklist to
      something different from the LinkedIn profile name, save, sign out, sign in again.
  - **Pass:** the stored `name` is still the edited one, read from the database.
  - **Fail:** the edit is overwritten by the LinkedIn name.
  - **Measured 2026-08-08: PASS, in both directions.** The existing row's name was
    `Edited By Hand`, left by the phase 12 run, and it read `Edited By Hand` afterwards —
    nothing overwritten. On the new account created in 4a the name field was blank and the
    LinkedIn name was written into it. Filling a blank field and leaving a filled one alone
    are the two halves of what pre-fill means, and both were observed.

- [x] **4d — an existing sponsor representative.** Point a `SPONSOR` row's email address at
      the LinkedIn account's address, then sign in through LinkedIn at
      `http://localhost:3003/login`.
  - **Pass:** the sign-in succeeds and reaches that account — the row count stays at one
    and the session carries that company. If the company's profile is incomplete, the
    browser lands on the sponsor checklist (AC-10).
  - **Fail:** a second row is created, or the sign-in is refused.
  - **Measured 2026-08-08: PASS.** A representative of Skio was borrowed for the test — not
    the canonical `sponsor@test.com`, which repairs itself on sign-in and would have
    confused the result. Afterwards: `rows = 1`, the name and the `SPONSOR` role unchanged,
    `loginCount` increased. The browser landed on the sponsor checklist rather than the
    dashboard, which is AC-10 holding: that company is short its tagline, one of the six
    items the gate blocks on. The page named it — "STILL NEEDED (1) — Add a company
    tagline", "Outstanding: tagline" — and identified the company by name, which is what
    shows the session reached that representative's own account rather than a new one.
    The borrowed row was restored to its own address afterwards, and the company's own
    fields were never edited.

- [x] **4e — someone with no account, on the sponsor portal.** Restore the row from 4d to
      its own address first, so the LinkedIn address has no row again. Then press Sign in
      with LinkedIn at `http://localhost:3003/login`.
  - **Pass:** the browser returns to `/login` showing the sentence beginning "The sponsor
    portal is open to exhibiting companies only", **and** the query returns zero rows for
    that address — no name, no photograph, no row (AC-11, AC-12).
  - **Fail:** any row exists for that address afterwards, or the screen shows the library's
    generic refusal rather than the sentence.
  - **Measured 2026-08-08: PASS.** The screen showed the "open to exhibiting companies
    only" sentence, not the library's generic refusal. The row count was read **after** the
    attempt and returned `0`. The first reading was discarded because its ordering against
    the button press could not be established, and a count taken before the attempt would
    have proved nothing about what the attempt left behind.

### Step 5 — The participant application is unchanged [contract]

**Verifies:** AC-2.

The module this phase moved is the one the participant application's own sign-in reads, so
that application's full regression suite is the evidence, not a re-assertion of the
decision rules here.

```bash
# port 3001 must be free — the script starts the app itself, twice
node docs/smoketests/playwright/phase-12-linkedin-sign-in.mjs
```

- [ ] Run it.
  - **Pass:** `120 passed, 0 failed`.
  - **Fail:** any check fails.

### Step 6 — The deployed portals [contract]

**Verifies:** the deployed half of AC-13.

The redirect addresses are registered as of 2026-08-08, including one per deployed portal.
What remains is the two credential values on the meetings and sponsor projects in Vercel,
which only the account holder can set.

- [ ] Once those are set, load each deployed portal's `/login` and press the button.
  - **Pass:** the sign-in completes and returns to the deployed portal.
  - **Fail:** LinkedIn shows a redirect-address error, meaning the registered address and
    the address the application sends do not match.

## Negative controls

Group B of the script. Each re-creates a defect as a function in the same file and runs the
**shared** assertion function — the same one Group A runs — against it.

| # | Defect reintroduced | Assertion it vouches for | Result |
|---|---|---|---|
| B1 | The create-path role test removed | `A3`, the sponsor first-timer refusal | red — `expected kind "refuse", got "create"` |
| B2 | A refusal that still carries the fields it would have written | `A4`, no write on any refusal | red — the refusal carried `update, email` |
| B3 | The create-path role test removed | `A4` | red — the sponsor first-timer case returns a create |
| B4 | The created role written as a literal rather than the tested role | `A5` | red — `expected role "ROLE_UNDER_TEST", got "ATTENDEE"` |
| B5 | The role travels out on create, but the role test is never asked | `A5` | red — the role test was never asked about the created role |

`B2` and `B5` exist because round 2 pointed out that the first draft's controls all
re-created the same defect, so they proved only that the checks notice a create-shaped
result. Each control failed on an assertion; none failed to compile; none stayed green.

Group S carries no scripted controls, so its two source checks were broken by hand and
measured, on 2026-08-08:

| Defect introduced | Result |
|---|---|
| `apps/meetings/lib/auth.ts` writes `role: 'ATTENDEE'` instead of `role: action.role` inside its LinkedIn branch | red — `S5`: `meetings writes a role literal inside its LinkedIn branch: ATTENDEE` |
| `apps/sponsor/lib/auth.ts` calls `prisma.user.create` inside its LinkedIn branch | red — `S6`: `the LinkedIn branch calls prisma.user.create` |

Both files were restored from a copy taken first, and the run returned to `42 passed, 0
failed`.

Group S's `S7` is a fact check on the role tables, not a control, and is not counted as
one.

## Perf-bar

None. This phase adds a sign-in method and moves a module; it makes no performance claim.
No bundle-size claim is made either — an earlier draft asserted the module adds nothing to
any browser bundle, and nothing here measures that, so the claim is withdrawn rather than
left standing unverified.

## Summary

| Step | Category | Tier | Covers | Status |
|---|---|---|---|---|
| 1 | contract | any | AC-1, AC-3, decision half of AC-7/9/11/12 | pass — 12 shape checks, 14 rule checks |
| 2 | contract | any | that Step 1 can fail | pass — 5 scripted controls, plus 2 measured by hand against Group S |
| 3 | contract | C, local production build | AC-4, AC-8, address-sent half of AC-13 | pass — 11 checks, plus the credentials-absent measurement on both portals |
| 4 | contract | C, local production build | AC-5, AC-6, AC-7, AC-9, AC-10, AC-11, AC-12 | pass — five parts, run by hand 2026-08-08 |
| 5 | contract | C, local production build | AC-2 | pass — 120 checks, 0 failed |
| 6 | contract | A, deployed | deployed half of AC-13 | **not runnable yet — the redirect addresses are registered; the two credential values are not yet set on the meetings and sponsor Vercel projects** |

Measured on 2026-08-08: Steps 1+2+3 `42 passed, 0 failed`; Step 5 `120 passed, 0 failed`;
credentials blank on both portals, provider absent and zero buttons drawn on each.

Type-check: all four applications compile; the participant application reports only the
`components/BottomNav.tsx` error documented in `CLAUDE.md`. `pnpm lint` cannot run anywhere
in this repository — no application holds an ESLint configuration, which is pre-existing and
unrelated to this phase.

## Pass / fail

The phase ships when Steps 1, 2, 3 and 5 pass **and** Step 4 passes by hand. Step 4 is not
optional and is not covered by anything above it: seven acceptance criteria rest on it
alone. Step 6 is confirmation after the two Vercel projects are configured; the local
behaviour does not depend on it.

**All of that held on 2026-08-08.** Steps 1, 2, 3 and 5 pass as scripted runs; Step 4's five
parts pass by hand. Twelve of the thirteen acceptance criteria are established. The one
remaining is AC-13's deployed half, which waits on a deployment carrying this code — the
redirect addresses for both deployed portals are registered, and the two credential values
were set on the `wbr-meetings` and `wbr-sponsor` Vercel projects on the same day, on
Production and Preview, alongside `NEXTAUTH_URL` on Production so each portal's return
address is its own name rather than a generated one.

## Re-run trigger

Re-run in full whenever a later phase touches:

- `packages/db/src/linkedin-identity.ts`
- `packages/db/src/app-access.ts` — the role tables every decision here reads
- `apps/attendee/lib/auth.ts`, `apps/meetings/lib/auth.ts`, `apps/sponsor/lib/auth.ts`
- `apps/attendee/app/login/LoginClient.tsx`, `apps/meetings/app/login/page.tsx`,
  `apps/sponsor/app/login/page.tsx`

`docs/smoketests/phase-12-linkedin-sign-in.md` covers the participant application's own
LinkedIn behaviour and reads the same module. Its script was repointed at the module's new
location and its call sites updated for the new argument (`UF-58`) as part of this phase;
it is Step 5 here and is re-run alongside this one.
