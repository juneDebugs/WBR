# Phase 3 smoketest — the sponsor portal's onboarding gate can be demonstrated

**Phase:** 3 of `.claude/plans/wbr-uat-followups-2026-08-07.md` (engineer-local).
**Requirements:** `.claude/docs/prds/wbr_uat_followups_2026_08_07.md`, item 3, findings `UF-8`,
`UF-11`, `UF-12`, `UF-59`, `UF-60`, `UF-61`, `UF-62`, `UF-63`, `UF-64`, `UF-65`, `UF-66`, `UF-67`.
**Contract:** every step below is a contract check per [`CONTRACT.md`](CONTRACT.md) §1.1 — a binary
observable. No step is environment-sensitive; the "Perf-bar" section at the end records why there is
no perf-bar check rather than leaving its absence unsaid.

---

## What this verifies

| AC | Claim |
|---|---|
| AC-1 | Signing in as the sponsor demonstration account on the sponsor portal shows the checklist, naming the contact item as missing. |
| AC-2 | Completing it releases the account into the portal. |
| AC-3 | Signing out and signing in again shows the checklist again. |
| AC-4 | The demonstration company holds neither a contact name nor a contact email. |
| AC-5 | Attempting the organizer's reminder against that company sends no mail, and the attempt is recorded as failed. Evidence is in two independent parts, because the `EmailLog` row is written by the route itself and so is not on its own proof that nothing left: **(a)** the route's source takes its recipient from `sponsor.contactEmail` and passes it to the mailer with no fallback, and the company holds no such address — step 1 section 12; **(b)** the stored row records the attempt as `FAILED`, not as success — step 5. Neither claims more than it shows; see the residual note under step 5 (`UF-62`). |
| AC-6 | The company's meeting requirement is zero, and the fill-rate figures on the showtime screens are unchanged by its presence — its directory row reads a complete fill rate, and it never appears in the showtime open-slots list. Step 1 section 11. |
| AC-7 | The company carries no booth number, and the count of booth-carrying companies is unchanged at ten (`UF-60`). |
| AC-8 | A reseed recreates both the account and the company in their incomplete state. |
| AC-9 | **Containment.** The three non-demonstration canonical accounts remain untouched, and the delegate demonstration account's own six fields are untouched by the new company mechanism. |
| AC-10 | `Tailor ERP` — the real company `sponsor@test.com` is attached to — is never written by the new mechanism. |

**AC-9 and AC-10 are the point of this phase, not footnotes.** The new mechanism writes a company
row from the sign-in path. One early return is what stops it reaching `Tailor ERP`, which is real
demonstration content with a real tagline, description and booth number. Step 1's sections 5 and 6
and step 7 exist to make that early return's failure loud.

---

## What changed, in one paragraph

The sponsor portal's onboarding gate has existed since the onboarding sprint, but there was no
account it could stop: the account documented as reaching all four applications holds `ORGANIZER`,
and the gate releases every WBR-side role before asking any completeness question (`UF-8`). This
phase adds a fifth canonical account, `sponsor-onboarding-demo@test.com`, attached to a new
exhibiting company, `Gate Demo Exhibitor`, that satisfies five of the six items the sponsor gate
blocks on and is short the sixth — its **contact**, which spans both the contact name and the
contact email. Because the company holds no contact, it holds no address, so the organizer's
reminder route has no recipient and this demonstration data cannot be mailed anywhere (`UF-11`,
`UF-12`). The company's incompleteness is put back on every password sign-in by a **second** restore
mechanism, `restoreSponsorCompany`, because phase 2's `restoreRequiredFields` restores a delegate's
own profile fields and the sponsor gate never reads those (`UF-59`). The company carries no booth
number, so the drawn exhibit hall map is unaffected (`UF-60`). No schema change, no migration, no
new route.

---

## Prerequisites

- **A seeded local database — and set the batch interval, or this takes about an hour.**
  `packages/db/prisma/seed.ts:238` writes the 72 speakers in 11 batches and waits
  `SEED_BATCH_INTERVAL_MS` between them, defaulting to **five minutes**, which is a throttle for the
  hosted database's rate limits and buys nothing against a local file. Left at the default the run
  sits at 0% CPU with the database file untouched for minutes at a time, which reads exactly like a
  wedged process — measured during this phase, and mistaken for a lock before the log was read.

  ```bash
  SEED_BATCH_INTERVAL_MS=0 pnpm db:seed
  ```

- **Note which file the seed actually writes.** `pnpm db:seed` sets `DATABASE_URL="file:./dev.db"`
  with the working directory at `packages/db`, and Prisma resolves that relative path against the
  **schema** directory — so the file that changes is `packages/db/prisma/dev.db`, not
  `packages/db/dev.db`. The `cp` commands at the end of that npm script copy `packages/db/dev.db`,
  which is a different, untouched file. Copy the seeded one to the apps by hand if a step needs it:

  ```bash
  for a in attendee web sponsor meetings; do cp packages/db/prisma/dev.db "apps/$a/dev.db"; done
  ```

- **Stop anything already listening on the app ports.** A server built before the change under test
  reports a failure that is not real, and the four applications open the same
  `packages/db/prisma/dev.db`.

  ```bash
  lsof -ti:3000,3001,3002,3003 | xargs kill 2>/dev/null
  ```

- **A production build of the sponsor portal and the admin application, from this branch.** Phase 7
  measured a case that passed on a development server and failed on a production build, so this runs
  on production builds.

  ```bash
  rm -rf apps/sponsor/.next apps/web/.next
  pnpm --filter sponsor build
  pnpm --filter web build
  ( cd apps/sponsor && npx next start -p 3003 & )
  ( cd apps/web && TURSO_DATABASE_URL= TURSO_AUTH_TOKEN= \
      DATABASE_URL="file:$(pwd)/../../packages/db/prisma/dev.db" npx next start -p 3000 & )
  ```

  All three variables are needed for the admin application, not two: `.env.production.local` blanks
  `DATABASE_URL` as well as supplying the hosted credentials, so clearing only the credentials leaves
  it with no database at all and `/api/health` answers `{"status":"error"}`.

- **⚠️ STARTING THE ADMIN APPLICATION THE OBVIOUS WAY POINTS IT AT THE SHARED PRODUCTION DATABASE.**
  Measured during this phase and recorded as `UF-67`. `apps/web/.env.production.local` holds
  `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; Next.js loads that file whenever `NODE_ENV` is
  production, which `next start` sets; and `packages/db/src/client.ts` prefers those two variables
  over `DATABASE_URL`, so the absolute local path in `apps/web/.env.local` is ignored. Step 5 sends a
  reminder — against production, if this is not dealt with.

  The sponsor portal has no `.env.production.local` and stays local, so the two applications behave
  differently under the same command and nothing on screen says which is which. Blanking the two
  variables on the command line, as above, is what keeps the admin application local.

  **Check it rather than trusting it, before any admin step:**

  ```bash
  curl -s http://localhost:3000/api/health
  ```

  The only acceptable answer contains `"connectionMode":"sqlite`. If it reads `turso-http`, **stop**
  — that application is connected to the live database every deployment shares, and step 5 would send
  a real reminder against it.

- **Check what is actually on each port.** A server built before the change under test reports a
  failure that is not real.

  ```bash
  lsof -nP -iTCP:3000 -iTCP:3003 -sTCP:LISTEN
  ```

- **After a reseed, sign in once as `onboarding-demo@test.com` before expecting it to exist.**
  Measured during this phase and recorded as `UF-63`: the seed upserts canonical accounts **by
  email** but its cleanup deletes **by id**, so an account whose stored row was created by
  `backfill-onboarding-required-fields.mjs` rather than by the seed is updated and then deleted in
  the same run. That is what happened to the delegate demonstration account here — the seed printed
  `Creating 5 demo accounts...` and the database held four. Its registry entry recreates it on the
  next password sign-in, with the seed's own id, after which reseeds keep it. Pre-existing, and not
  fixed by this phase.

- **Credentials.** `sponsor-onboarding-demo@test.com` / `password123` for the sponsor portal;
  `wbr@test.com` / `password123` for the admin application.

---

### Step 1 — The scripted check [contract]

Runs against a **temporary copy** of `packages/db/prisma/dev.db` and refuses to start if the
connection that actually opened is anything else. It writes, so it must never reach a shared
database.

```bash
pnpm test:sponsor-gate-demo
```

**Pass criterion:** the run reports **zero failures** and exits **0**. Every `CONTROL —` line passes,
which is what says the checks around it can go red.

The pass count is **61, observed 2026-08-08**. That is recorded so a reader can tell a stale number
from a real disagreement, and it is deliberately not the pass criterion: adding a valid assertion
moves the count while preserving behaviour, and a document that fails a correct run is a smoketest
defect (`UF-34` records the same mistake being made with earlier counts). Zero failures and exit 0
are the criterion; a changed count is a prompt to check what was added, not a failure.

Sections, and what each is for:

| Section | What it establishes |
|---|---|
| 0 | Exactly one canonical account carries `restoreSponsorCompany`, it is the sponsor demonstration account, and the account attached to a real company carries none. |
| 1 | The company is short its contact, and the gate names the contact item and nothing else. |
| 2 | A contact completed by hand is put back on the next sign-in, and the gate blocks again. |
| 3 | The restore writes the pinned columns **and nothing else** — a hand-edited tagline, description and website survive it. |
| 4 | The restore settles: three consecutive sign-ins after it write nothing. |
| 5 | **Containment, outward.** Five sign-ins as `sponsor@test.com` write nothing at all; `Tailor ERP` is never even **read** — proven by instrumenting every `Sponsor` call and asserting none names it — and every column of it is unchanged while it holds a value no definition anywhere holds. |
| 6 | **Containment, inward.** The delegate demonstration account's own restore fires and writes no company row. |
| 7 | A wrong password is a no-op for the company as well as for the account. |
| 8 | A deleted company is a no-op — the sign-in path does not throw and does not create a `Sponsor` row. |
| 9 | The company carries no booth number, and the booth-carrying count is ten. |
| 10 | The per-company meeting requirement reads back as zero. |
| 11 | **AC-6.** Its directory row reads `requiredMeetings 0` and a complete fill rate, and it never appears in the showtime open-slots list. |
| 12 | **AC-5.** The reminder route's source takes its recipient from `sponsor.contactEmail` alone, with no fallback, no `cc`/`bcc`, exactly one `sendMail` call and no address literal, and the company holds no such address. |
| 13 | **The wiring, not the behaviour.** All four apps' `/api/login` routes call the repair, and call it before reading the person's row (`UF-65`). |

**Section 13 is the one to understand if you read only one.** Everything above it calls the repair
function directly, which proves what the function does and cannot discover whether anything calls
it. It did not: the repair lived only in the NextAuth sign-in callback, and no login screen in this
product uses that provider — all four post their password form to their own `/api/login`, which
mints its own session cookie. So neither demonstration account restored itself on any sign-in a
person could actually perform, and the previous phase's verification passed anyway because it tested
the function rather than the wiring. Measured, fixed in all four routes, and this section is what
stops it coming back.

**Negative controls, and the defect each recreates.** Every control calls the same named function out
of the script's `assertion` object that the real check calls, so rewriting an assertion changes both
together and a control cannot quietly stop covering it.

| Control | Defect recreated | Why this one |
|---|---|---|
| §1 | The contact is filled in | Proves the gate check is reading the row rather than always reporting `contact`. |
| §3 | The restore also rewrites the tagline | Proves the narrow-write check fails on a wider write, which is the `UF-47` trap. |
| §4 | A pinned column that disagrees with the row | Proves the settle check fails when a restore cannot settle — the account that writes on every sign-in forever. |
| §5 | `sponsor@test.com` is given a company pin | **The containment control.** Proves the "`Tailor ERP` unchanged" check can fail, by making a real company change and then putting it back. |
| §9 | The demonstration company is given a booth number | A real mutation and a real re-count, not `count + 1` — `count + 1` would prove only that the assertion rejects eleven, not that the query would return eleven. |
| §10 | A company with no override | Reads the sponsor default instead of zero. The precondition that the default is not itself zero is **asserted**, not left as a note, so this control cannot become hollow. |
| §11 | The zero override is removed | The company then **does** appear on the showtime open-slots list, which is what proves the override is the thing keeping it off. |

**Two guards in the script exist because a check was found passing for the wrong reason, and both are
worth knowing about.** Section 11's open-slots list is empty on a freshly seeded database — the
showtime board builds its days only from time blocks that already hold a confirmed meeting, and the
seed creates none, so "the demonstration company is not on the list" was true because **nobody** was
on the list. The script now asserts the list is non-empty before reading anything into an absence,
and manufactures one confirmed meeting for a real company on its temporary copy so the check has
something to observe. Section 5's spy is guarded the same way: "no call named `Tailor ERP`" is only
evidence if the instrumentation would have seen one, so the same spy is run over an action that
certainly does touch a company and asserted to have recorded it.

---

### Step 2 — The checklist appears, naming the contact [contract]

1. Open `http://localhost:3003/login` in a private window.
2. Sign in as `sponsor-onboarding-demo@test.com` / `password123`.

**Pass criteria (AC-1):**

- The browser lands on `/onboarding`, not on the dashboard.
- The outstanding item listed is **`Set primary contact name & email`** — the exact label from
  `SPONSOR_READINESS_ITEMS`, and the only one listed.
- Reaching `http://localhost:3003/` directly in the same session returns to `/onboarding`.

---

### Step 3 — Completing the contact releases the account [contract]

Fill in a contact name and a contact email on the checklist and save.

**Pass criteria (AC-2):**

- The browser reaches the portal dashboard.
- Read the row directly rather than trusting the screen, because this portal caches company data for
  60 seconds on the server and again in the browser (`UF-17`, `UF-29`):

  ```bash
  sqlite3 -header -column packages/db/prisma/dev.db ".nullvalue NULL" "SELECT id, name, contactName, contactEmail, boothNumber FROM Sponsor WHERE id = 'sponsor-gate-demo';"
  ```

  The row now holds the contact values just typed.

---

### Step 4 — Signing out and back in shows the checklist again [contract]

Sign out. Sign in again with the same credentials.

**Pass criteria (AC-3):**

- The browser lands on `/onboarding` again.
- The server log for the sponsor portal carries one line
  `[test-accounts] Restored gate demonstration company sponsor-gate-demo: contactName, contactEmail`.
- The database row holds `NULL` in both contact columns again, read with the same query as step 3.

---

### Step 5 — The organizer's reminder sends nothing, and says so in the log [contract]

Sign in to the admin application at `http://localhost:3000` as `wbr@test.com` / `password123`, open
the sponsors screen, and attempt the reminder against **Gate Demo Exhibitor**.

**Pass criteria (AC-5):** read the stored row, **not** the response status. With no mail account
connected the route answers 200 with `ok: true` while logging the failure, so a 200 is not evidence
mail went out (`UF-62`).

```bash
sqlite3 -header -column packages/db/prisma/dev.db ".nullvalue NULL" "SELECT \"to\", status, sponsorId FROM EmailLog WHERE sponsorId = 'sponsor-gate-demo' ORDER BY rowid DESC LIMIT 1;"
```

- `status` is `FAILED`.
- `to` is `unknown` — because the company holds no `contactEmail` to address.

**What this step does and does not prove, stated rather than glossed.** The `EmailLog` row is
written by the route itself, so it is evidence about what the route recorded, not independent
evidence that the mail transport was never called. The claim "no mail can be sent to this company"
rests on step 1 section 12, which asserts against the route's source that the recipient comes from
`sponsor.contactEmail` alone, that it reaches the mailer with no fallback, and that the file holds no
address literal — combined with the company holding no such address. **Residual:** a fully
independent proof would drive the route with a fake mail transport and assert it received nothing.
That is a route-level test this phase does not otherwise build, and it is worth doing on its own
terms rather than as fallout here.

---

### Step 6 — The company does not exhibit, and the drawn map is unaffected [contract]

```bash
sqlite3 -header -column packages/db/prisma/dev.db ".nullvalue NULL" "SELECT COUNT(*) AS booth_companies FROM Sponsor WHERE boothNumber IS NOT NULL AND boothNumber <> '';"
sqlite3 -header -column packages/db/prisma/dev.db ".nullvalue NULL" "SELECT boothNumber AS demo_booth FROM Sponsor WHERE id = 'sponsor-gate-demo';"
```

**Pass criteria (AC-7):**

- `booth_companies` is **10**. An eleventh changes what `layoutBooths()` produces and puts every
  marker off its drawn stand on the committed `exhibit-hall.png` (`UF-60`).
- The demonstration company's `boothNumber` is `NULL`.
- Open the participant application's floor plan and confirm no marker carries the name
  `Gate Demo Exhibitor`.

---

### Step 7 — Containment, by hand [contract]

The scripted check covers this, and a by-hand step that is weaker than the script it duplicates is
worse than no step (`UF-44`). So this one sets a value **no definition anywhere holds** first, which
is what stops "unchanged" from being true by coincidence.

```bash
# Set the distinctive value FIRST, then capture the whole row. The snapshot has to
# be taken after the write, or the comparison at the end would flag the value this
# step deliberately set and could never be clean.
sqlite3 packages/db/prisma/dev.db "UPDATE Sponsor SET contactName = 'BY HAND — MUST SURVIVE' WHERE id = 'cmngb2h4h0007vm28mbcpxjg5';"
sqlite3 packages/db/prisma/dev.db ".mode line" "SELECT * FROM Sponsor WHERE id = 'cmngb2h4h0007vm28mbcpxjg5';" > /tmp/tailor-before.txt
```

Now sign in to the sponsor portal as `sponsor@test.com` / `password123`, then read it back:

```bash
sqlite3 packages/db/prisma/dev.db ".mode line" "SELECT * FROM Sponsor WHERE id = 'cmngb2h4h0007vm28mbcpxjg5';" > /tmp/tailor-after.txt
# Compared mechanically rather than by eye. The only line that may differ is
# contactName, and only because the previous command set it.
diff /tmp/tailor-before.txt /tmp/tailor-after.txt
```

**Pass criteria (AC-9, AC-10):**

- `diff` prints **nothing at all**. The before file was captured after the hand-set value was
  written, so a clean diff means every column — including `contactName` — survived the sign-in
  untouched.
- The sponsor portal's own log carries **no** `[test-accounts] Restored gate demonstration company`
  line for this sign-in.

Restore it afterwards with `SEED_BATCH_INTERVAL_MS=0 pnpm db:seed`, or by setting the column back to
what it held.

---

### Step 8 — A reseed recreates both, incomplete [contract]

Complete the demonstration company's contact by hand, then reseed.

```bash
sqlite3 -header -column packages/db/prisma/dev.db "UPDATE Sponsor SET contactName = 'Filled', contactEmail = 'filled@example.com' WHERE id = 'sponsor-gate-demo';"
SEED_BATCH_INTERVAL_MS=0 pnpm db:seed
```

**Pass criteria (AC-8):**

- The seed's summary prints the two gate demonstration accounts, including
  `sponsor-onboarding-demo@test.com blocked on Gate Demo Exhibitor (no contact name or email)`.
- Both contact columns read `NULL` again. The demonstration company is upserted with a **wide**
  update branch, unlike the twenty real exhibitors, whose branch is deliberately narrow so a stray
  seed run cannot destroy organizer-authored content — this row has none (`UF-61`).

---

### Step 9 — The earlier scripts this phase's surface touches [contract]

The contract requires re-running the checks that cover what changed. This phase changes
`ensureCanonicalTestAccount()`, the canonical account list, and the seed.

```bash
pnpm test:canonical-restore
pnpm test:onboarding-policy
pnpm test:roles
```

**Pass criteria: zero failures and exit 0 from each.** Counts below are recorded as observed on
2026-08-08 so a reader can tell a stale number from a real disagreement; they are not themselves the
criterion, for the reason given under step 1.

- `pnpm test:canonical-restore` ends **`33 passed, 0 failed`**, exit 0. It covers the delegate half
  of the restore, whose caller this phase restructured — the early `return false` on a healthy user
  row became a flag, because a healthy user row says nothing about the company. This run is what
  says that restructuring did not change delegate behaviour. It needs the delegate demonstration
  account to exist; see the reseed note in the prerequisites.
- `pnpm test:onboarding-policy` ends **`46 passed, 0 failed`**, exit 0. Three of those assertions are
  new in this phase: the roster figure now reads `14 of 20 real exhibiting companies` with the
  demonstration company excluded, and two assertions cover the prop itself — that it is present, and
  that it does **not** satisfy the six required items (`UF-64`).
- `pnpm test:roles` ends `all unit checks passed`, exit 0.
- `pnpm test:accounts` is **not** in this list: it reads the shared live database and fails with
  `no TURSO_* credentials found` in a shell without them, which is not a code fault.

---

## Perf-bar checks

**None, and here is why rather than leaving it unsaid.** The one thing this phase adds to a hot path
is a single indexed `Sponsor` read inside `ensureCanonicalTestAccount()`, and it is reached only by
an account carrying `restoreSponsorCompany` — one of five, and never on a delegate sign-in or on a
sign-in that fails its password. Every other sign-in path performs exactly the queries it did
before. Nothing here is sensitive to bundle size, network, or database tier, so a tier-C measurement
would report the environment rather than the change.

---

## Summary

| Step | Category | Tier | Status |
|---|---|---|---|
| 1 — scripted check (13 sections, 61 assertions) | contract | n/a | **PASS** — `61 passed, 0 failed`, exit 0, 2026-08-08 |
| 2 — checklist names the contact | contract | local production build | **PASS** — landed on `/onboarding`, `STILL NEEDED (1)` = `Set primary contact name & email`, 2026-08-08 |
| 3 — completing it releases the account | contract | local production build | **PASS** — reached `/dashboard`; row held the typed contact, 2026-08-08 |
| 4 — signing in again blocks again | contract | local production build | **PASS** — restore logged, contact back to `NULL`, browser landed on `/onboarding`, 2026-08-08 (this is the step that exposed `UF-65`) |
| 5 — reminder logs FAILED, sends nothing | contract | local production build | **PASS** — `EmailLog` row `to=unknown`, `status=FAILED`; route answered 200 `ok:true` as `UF-62` predicted, 2026-08-08 |
| 6 — no booth number, count still ten | contract | n/a | **PASS** — `booth_companies` 10, demo booth NULL, 2026-08-08 |
| 7 — containment by hand | contract | local production build | not run by the agent — covered mechanically by step 1 section 5 |
| 8 — a reseed recreates both, incomplete | contract | n/a | **PASS** — hand-completed contact went back to `NULL`, 2026-08-08 |
| 9 — earlier scripts still pass | contract | n/a | **PASS** — canonical-restore 33/33, onboarding-policy 46/46, roles all passed, 2026-08-08 |

Steps with an empty status need a person at a browser, and are not filled in by the agent that wrote
this document. Steps 2, 3, 4, 5 and 7 require signing in to a running portal; step 8 requires a
reseed and then re-running the browser steps.

---

## Teardown

The steps above deliberately leave the database changed. Return it:

```bash
pnpm db:seed
```

`loginCount` and `updatedAt` move on every account this run signs in as, and the seed does not put
those back. That is stated rather than restored: writing them back would be falsifying an audit
trail to make a test look tidy (`UF-44`).
