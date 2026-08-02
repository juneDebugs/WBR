# Phase 9 — Codex adversarial review log

**Subject:** the booth company card — tapping a booth marker on the participant venue map opens a card showing that exhibiting company's logo, name, tagline, booth number, offerings and website link.

**Rounds:** 3 of a cap of 3, all run. **Scope:** working tree. **Date:** 2026-08-02.

**Ten findings across three rounds. All ten resolved: nine fixed, one accepted with a scheduled fix and a recorded reason.**

Two reversible local settings were applied for the duration, per the standing note about the review tool refusing inputs over one megabyte: `git update-index --assume-unchanged` on the six `dev.db` files, and `.claude/` appended to `.git/info/exclude` (backed up first). Both are restored at the end of this log.

---

## Round 1 — the four areas the phase actually changed

Areas named: the card component; the map data layer; the seed refactor; the migration script that can write the shared database.

### R1-a [high] — the seed's update branch overwrote organizer content on the shared database

`packages/db/prisma/seed.ts`. The upsert's update branch had been widened to the full content set — tagline, description, website, booth number, offerings.

The hazard is not hypothetical. `createPrismaClient()` in that same file checks `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` **before** it looks at `DATABASE_URL`, so `pnpm db:seed` connects to the shared production database whenever those variables are in the environment — even though the npm script hard-codes a local file path. One such run would have replaced every tagline and description an organizer had edited in the admin app with the generated copy.

**Fixed, and it is a correction to finding F-10's own first fix.** `seed-sponsors.ts` now exports two functions: `sponsorCreateFields()` with the full set, and `sponsorUpdateFields()` with name, tier and logo only. Reproducibility is unaffected because it comes from the create branch — a database built from nothing still gets everything. What is given up is silent self-correction of a populated database, and that is replaced by two better things: `scripts/test-booth-card-data.mjs` now **detects** drift and fails on it, and `scripts/migrate-sponsor-card-fields.mjs` corrects it deliberately.

The test asserts both directions — create carries all eight fields, and update **omits** all five organizer-editable ones — so re-widening the update branch fails a check rather than passing quietly.

### R1-b [high] — the migration wrote row by row with no transaction and no failure report

`scripts/migrate-sponsor-card-fields.mjs`. Updates ran one at a time and the verification ran only after the loop. A failure partway would leave earlier companies overwritten and later ones untouched, and the script would exit on the exception **before printing anything** — leaving the operator with a shared database in a state nobody had described, after a command documented as reporting what it does.

**Fixed.** The writes go through `db.batch(statements, 'write')`, which the libSQL client runs as one transaction. The re-read reconciliation now runs whether or not the write threw, and says plainly that the re-read is what the database holds and should be trusted over the expectation.

### R1-c [medium] — the card claimed to be a modal dialog and behaved like nothing of the sort

`FloorPlanClient.tsx`. `role="dialog"` with `aria-modal="true"`, and no ref, no `tabIndex`, no focus on open, no trap, no restore. Focus stayed on the marker behind the overlay, so a delegate using a keyboard or a screen reader was told a dialog had opened and then had to tab through the entire map to reach it — past controls the overlay had already made unreachable with a finger. Claiming the role without the behaviour is worse than not claiming it, because assistive software changes how it presents the page on the strength of the claim.

**Fixed.** Focus moves into the card on open, Tab cycles within it, focus returns to the invoking marker on close — and only if that marker is still in the document, because a marker can disappear when the data refreshes and focusing a detached element silently throws focus to the body. Three assertions added.

### R1-d [medium] — the cache key was unchanged while the cached payload's shape widened

`apps/attendee/lib/floor-plan-data.ts`. The sponsor select gained three fields; the `unstable_cache` key stayed `attendee-venue-maps`. Next writes this cache to disk and that directory survives restarts and is restored between deployments, so an entry written by the previous select could be served to the new code. Nothing throws: `parseSolutions` returns an empty list and the two strings come back undefined, so **every card renders with no tagline, no offerings and no website link for up to five minutes, with nothing in any log to say why.**

**Fixed.** The key is now `attendee-venue-maps-v2-with-card-fields`, which retires every entry of the old shape at once — more certain than remembering to clear a cache directory during a deploy.

---

## Round 2 — the test suites, the control harness, the gestures, and real data shapes

Round 1's four fixes were declared and excluded. Areas named: the two Phase 9 suites hunted specifically for checks that pass while measuring nothing; the negative-control harness; the card against Phase 8's pointer handling; rendering robustness against real data shapes.

### R2-a [medium] — duplicate offerings shared a React key, and the assertion could not have caught it

The offerings list keyed each chip by its own text. A company listing the same offering twice produces duplicate keys, which makes React's reconciliation undefined — it may drop a chip or reuse the wrong one. And the browser assertion used `includes()`, which is satisfied by a card that rendered only one copy of a duplicated value.

Today's seeded data contains no duplicates and the longest company name is 12 characters, which is exactly why nothing would have noticed. Offerings become organizer-typed free text in Phase 11.

**Fixed.** Keyed by position and text together, and the assertion now compares the rendered list against the stored list **position by position** rather than by membership.

### R2-b [medium] — long unbroken content could overflow the card

`min-w-0` lets a flex child shrink below its content; it does not make an unbroken string wrap. A long company name, or a tagline containing a bare URL, would push past the card's edge at 390 pixels.

**Fixed.** `break-words` on the name, tagline and chips, `break-all` on the link. And a stress measurement was added to `scripts/third-opinion-booth-card.mjs`: a 64-character unbroken name, a long bare-URL tagline and an over-long chip are written into the live page — not into the shared database, because the thing at risk is the CSS — and every descendant's box is then compared against the card's. Measured after the fix: nothing overflows, at all three screen sizes.

### R2-c [medium] — the control harness could report success while failing its own cleanup promise

`phase-9-negative-controls.sh` promises to leave a correct build behind. Its final restore build was followed only by `&& echo`, so a failed rebuild, an uncleared port or a broken restored tree still ended with `Controls: 7 passed, 0 failed` and exit 0 — and the next person to run any suite would be measuring a stale server while the harness told them everything was fine.

**Fixed.** That build is now a gate that increments the failure count. A promise the exit code does not enforce is not a promise.

---

## Round 3 — pointed at what rounds 1 and 2's own fixes introduced

The earlier rounds' repairs are the least-reviewed code in the change, so this round attacked them directly: the focus management, the create/update split, the batched write, and the cache-key bump.

### R3-a [high] — the migration could erase an organizer's booth assignment

`scripts/migrate-sponsor-card-fields.mjs` walks all twenty defined companies, not only the ten that exhibit, and `boothNumber` is in its field set. For the ten that do not exhibit the definition says `boothNumber` is null. So if an organizer assigned one of them a stand — which is exactly what Phase 11's authoring tool is for — `--apply` would have set it back to null, and that company would have **vanished from the roster** that `seed-floor-plan.mjs` and `build-floor-plan-maps.mjs` read. A booth would disappear from the hall because someone ran a script described as correcting taglines.

**Fixed with a rule, not a special case: this script fills and corrects, and never erases.** A field is written only when the definition has a value; a database value the definition does not account for is left alone and reported with a `!` line. The write statement now sets only that row's differing fields rather than the whole set — otherwise it would put back the very nulls the rule had just spared — and the reconciliation applies the same rule, so a deliberately preserved value is not reported as a fault.

**Verified by reproducing it:** a booth number was assigned to a non-exhibiting company in the local database and the report said `leaving 1 field(s) alone — the database has a value and the definition does not: boothNumber="X-99"`, and left it untouched. The test value was then removed.

### R3-b [high] — the narrow update branch leaves an existing database stale, silently

The correct consequence of R1-a's fix, correctly identified. Reproducibility now holds for an empty `Sponsor` table; a seed re-run against a database that already holds these rows never brings tagline, website, booth number or offerings up to date — while printing "Creating 20 sponsors" and looking as though it did.

**Fixed by making the seed say so.** It now compares each existing row's card fields against the definitions, counts the ones it is deliberately leaving alone, names them, and prints the two commands that inspect and repair. It reports; it does not decide. Repair stays an explicit act, which is the whole point of R1-a.

A destructive local repair mode was considered and rejected: it re-introduces the R1-a hazard behind a flag someone will eventually pass on the wrong database.

### R3-c [medium] — booth-card content now sits in a cache no sponsor writer invalidates

**Accepted, not fixed. Recorded as finding F-13 and scheduled against Phase 10.**

Phase 8's `floor-plan` cache held only maps and marker positions — data nothing in the product could write, so staleness was impossible by construction. Phase 9 moved tagline, website and offerings into that same cached payload, and those are written by `apps/sponsor/app/api/profile/route.ts` whenever a representative edits their profile.

Enumerated across all four apps, the tags writers revalidate today are `meetings`, `chat`, `speakers`, `sessions`, `conflicts`, `attendee-pool`, `submissions-<id>`, `sponsor-<id>`, `user-bookmarks-<id>`, `user-social-<id>` and `meetings-user-<id>`. **`floor-plan` is in none of them**, and the string does not occur anywhere in `apps/web`, `apps/sponsor` or `apps/meetings`.

Consequence: a representative changes their tagline, the sponsor portal shows it at once, and delegates keep the old one for up to five minutes.

**Why it is accepted rather than fixed here.** The fix changes request handlers in two applications this phase does not touch, needs the tag-posting helper only `apps/web` currently has, and needs checks in two suites outside this phase — nine days before the demonstration, with Phases 10 and 11 unbuilt. Phase 10 already carries the criterion that writes must invalidate `floor-plan`; that criterion has been widened to name sponsor-profile writes, so both classes of writer are built and checked once rather than twice.

**Why the exposure is small enough to accept.** It needs a sponsor profile edit and a delegate looking at that same company's card within five minutes. Nothing in the demonstration does that; nobody sees wrong information, only information up to five minutes old; and the bound is the cache window, so it self-corrects. **This decision changes if the demonstration script comes to include editing a sponsor profile and then showing the map.**

---

## What the rounds cost and what they were worth

Round 3 was pointed at the earlier rounds' own fixes, and returned two high findings out of three — both of them created by round 1's repairs. R3-a in particular would have been a booth silently disappearing from the hall, introduced by a script written to prevent silent drift.

Rounds 1 and 2 each found a defect that every passing assertion had missed, and both were in the same class: the change was correct about the values and wrong about what a person could see or safely do.

## State after the review

| | Before the review | After |
|---|---|---|
| `pnpm test:booth-card` | 168 | **178** |
| `phase-9-booth-company-card.mjs` | 215 | **219** |
| `phase-8-floor-plan-viewer.mjs` | 93 | **93**, unchanged |
| `pnpm test:floor-plan` | 57 | **57**, unchanged |
| `pnpm test:onboarding-policy` | 44 | **44**, unchanged |
| `phase-9-negative-controls.sh` | 7 of 7 | **7 of 7**, one prediction re-derived |

The two local settings applied for the review were restored: `.git/info/exclude` from its backup, and `git update-index --no-assume-unchanged` on the six `dev.db` files.
