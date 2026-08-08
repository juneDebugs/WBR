# Phase 3 — Codex adversarial review log

**Subject:** the sponsor-side gate demonstration account and company — an exhibiting company that is deliberately short its contact, and a second restore mechanism that puts that incompleteness back on every password sign-in, so the sponsor portal's onboarding gate can be shown on cue.

**Rounds:** 3 of a cap of 3, all run. **Scope:** working tree. **Date:** 2026-08-08.

**Eighteen findings across three rounds. Fifteen fixed, three accepted with recorded reasons.**

Round 1 was pointed at the mechanism, round 2 at the verification rather than the feature, and round 3 at the whole change including the first two rounds' fixes. **Round 3 found the defect that mattered most, and it was in neither the mechanism nor the verification but in the wiring between them.**

The convention this log restores was last used at Phase 9. `docs/codex-reviews/` holds no entry for the five phases in between, and `docs/decisions.md` deliberately left open whether to bring it back or retire it. This is the argument for bringing it back: round 3's finding is the kind that is worth writing down in full, because the mistake behind it is available to every phase.

---

## Round 1 — the mechanism

Areas named: containment against a real exhibiting company; whether the restore settles; the restructured control flow in the shared sign-in repair; the seed's write branches; foreign keys and ordering; the reset script's new TypeScript import.

### R1-a [medium] — the recovery path restored the company but not its meeting requirement

`packages/db/scripts/reset-test-accounts.mjs`. The script is documented as the way back when the demonstration company is deleted, and it recreated the row — but not the per-company override that pins its required meetings to zero.

The consequence is quiet rather than loud. `requiredMeetingsForSponsor()` falls through to the sponsor default, which is 10 on the seeded data, so a prop that nobody will ever book a meeting with starts appearing on the showtime screens as an exhibitor with ten unmet meetings, dragging the fill-rate figures the demonstration is meant to show.

**Fixed.** The script now calls the same `saveMeetingRequirementSettings()` the seed calls, imported from `meeting-engine.ts` rather than restated as raw SQL — that table is created defensively at runtime rather than by a migration, and the schema comment requires its column shape to match that module's exactly, so a second copy of the DDL in a script is the drift the warning is about.

### R1-b [medium] — the recreated company could land on the wrong conference

Same file. It chose the conference with an unordered `conference.findFirst()`. On a database holding more than one conference row — which the shared one may — that can return a previous event. The company would still link to its account by identifier and still block the gate, so nothing would look broken; it would simply be absent from every exhibitor screen that filters by the current conference, which is exactly where the demonstration goes looking for it.

**Fixed, and by anchoring rather than by hard-coding.** The conference is taken from `Tailor ERP`, a company the script already requires to exist and which is certainly on the right conference. `conferenceId` is written in the upsert's update branch as well as its create, so a row already sitting on the wrong conference is corrected instead of left there. Round 3 raised the same gap in `seed.ts`, which now does the same.

### R1-c [low] — the canonical account list is exported mutable. **Accepted, not fixed.**

`packages/db/src/test-accounts.ts`. Any code running in the process can set `restoreSponsorCompany` on `sponsor@test.com`, and the next correct-password sign-in would blank a real exhibiting company's contact.

**Decision: record it.** The array has always been exported mutable, and the delegate flag added in phase 2 carries the same exposure, so this is pre-existing rather than introduced here. Freezing it would break the negative controls in two verification scripts, which modify definitions on purpose to prove their containment checks are capable of failing — that is real coverage, and trading it away to guard against code already running inside the process, which could equally call the database directly, is the wrong trade. Worth revisiting if the registry ever gains a consumer outside this repository.

### Clean in round 1

Containment through the ordinary definitions; the restore settling, with `undefined` normalised to `null` on both sides of the comparison; wrong passwords returning before any read or write; seed ordering and the foreign key from the account to the company; and the reset script's native TypeScript import, checked against the Node version actually installed.

---

## Round 2 — the verification, not the feature

Pointed deliberately away from the mechanism. This is the round the previous session recorded as producing every finding that mattered, and it did so again: nine findings, and the code under test was not the subject of any of them.

### R2-a [high] — the containment check compared nine chosen columns and could not detect reads at all

`packages/db/scripts/test-sponsor-gate-demo.ts`. "The real exhibiting company is byte-for-byte unchanged" was asserted over a hand-written `select` of nine columns. `Sponsor` has far more — `tier`, `contactPhone`, `headquarters`, `tableNumber`, `heroImageUrl`, the social and targeting fields. A restore that wrote any of them would have left every assertion in the file green. And the stated safety property is "never read **or** written", of which a value comparison can only ever demonstrate the second half.

**Fixed, in both halves.** `readCompany()` now reads the whole row and comparison is on canonical JSON with sorted keys, so it cannot be out of date with the schema and does not depend on Prisma returning columns in a stable order. And every method on the `Sponsor` model is wrapped with a counting spy for the duration of the probe, recording the identifier each call names — so "never read" is now asserted directly rather than inferred.

**The spy needed its own proof, and the first version of it was worthless.** "Zero calls naming `Tailor ERP`" is only evidence if the instrumentation would have seen a call had one been made. The check written for that was `spy.calls.length >= 0 && typeof spy.calls.length === 'number'`, which is true whatever happens — the fourth time this project has recorded a check that cannot fail. It was replaced with a real liveness proof: the same spy is run over the flagged account's own sign-in, which certainly does touch a company, and is asserted to have recorded both a read and a write of it.

### R2-b [high] — the mail claim rested on a row the route writes about itself

`docs/smoketests/phase-3-sponsor-gate-demo-account.md`. The acceptance criterion says "sends no mail". The step checked the stored `EmailLog` row for `status = FAILED`. That row is written by the route being tested, after its own send attempt, so it is evidence about what the route recorded rather than about what left the machine.

**Fixed by adding an independent half and narrowing the claim.** A new section asserts against the route's source that the recipient comes from `sponsor.contactEmail` and from nothing else, that it reaches the mailer with no fallback, that there is exactly one `sendMail` call, that no `cc` or `bcc` is set, and that the file holds no address literal — combined with the company holding no such address. The criterion now states what each half shows. **The residual is written down rather than glossed:** a fully independent proof would drive the route with a fake mail transport and assert it received nothing, which is a route-level test this phase does not otherwise build.

### R2-c [high] — the fill-rate criterion was asserted, never verified

The criterion says the showtime screens' fill-rate figures are unchanged by the company's presence. The only related check read the meeting-requirement override and confirmed it was zero, which is a different claim.

**Fixed by calling what those screens call.** A new section reads `getCompanyDirectory()` and `getCheckInBoard()` and asserts the company's directory row reads a required count of zero and a complete fill rate, and that it never appears in the open-slots list.

**And that check was passing for the wrong reason until a guard caught it.** The showtime board builds its days only from time blocks that already hold a confirmed meeting, and the seeded database has none, so the open-slots list was empty for **every** company — "the demonstration company is not on the list" was true because nobody was. The guard asserting the list is non-empty turned red and said so. The section now manufactures one confirmed meeting for a real company on its temporary copy, so the absence means something, and its control removes the override and confirms the company then does appear.

### R2-d [medium] — deleting the company could destroy rows the test never restored

Section 8 deletes the demonstration company and recreates it. `SponsorMeeting` and `SubmissionForm` cascade on that delete; `MeetingRequest.targetSponsorId`, `Pin.sponsorId` and `User.sponsorId` are set to null. The recreate restored the company's own columns and nothing else.

**Fixed by refusing to run rather than by restoring more.** The section counts dependents first — including other users attached to the company, which round 3 pointed out was missing from the first version of this fix — and skips its destructive half if any exist, saying so. It also now asserts the recreated row is identical to the deleted one, so a lossy recreate fails instead of quietly changing what sections 9 to 13 measure.

### R2-e [medium] — a check that read a boolean and called it a postcondition

"The user row itself is still repaired" asserted only that the function returned `true`. A `true` says a write happened, not that the right one did.

**Fixed.** The row is read afterwards and its role, name and company link asserted directly.

### R2-f [medium] — the smoketest's database commands could not run, and would not have printed anything if they had

Two separate faults in the same commands. They were written as `npx prisma db execute --schema prisma/schema.prisma`, which needs `DATABASE_URL` set — in a clean shell they exit 1 with `Environment variable not found`, which is exactly what happened when they were tried. And `prisma db execute` runs scripts and does not return query results, so every `SELECT` step told the runner to read output that would never appear.

**Fixed by using a tool that prints rows.** All of them are now `sqlite3` against the seeded file, with `.nullvalue NULL` added after round 3 pointed out that the default output prints an empty column for null, so criteria reading "is `NULL`" did not match what the runner would see.

### R2-g [medium] — a "nothing else changed" criterion with nothing recorded to compare against

Step 7 set a distinctive value on the real company, asked the runner to sign in, then read five columns back and said "every other column is what it was" — with no before value captured anywhere.

**Fixed.** The step writes the distinctive value first, then captures the whole row to a file, and after the sign-in captures it again and `diff`s the two. The criterion is that `diff` prints nothing.

### R2-h [low] — the step headings did not follow the contract

`CONTRACT.md` §2.2 requires `### Step N — <title> [contract]`; the document used `##`. Corrected. Small, and worth recording because the contract exists so this corpus can be reviewed mechanically — the same finding was recorded once already, in phase 2.

### R2-i [low] — pass counts stated as pass criteria

The document required exact counts. A script that gains a valid assertion then fails a correct run, which is a smoketest defect this project has already recorded once at these same numbers.

**Fixed.** Zero failures and exit 0 are the criterion; the counts are recorded as observed on a date, so a reader can tell a stale number from a real disagreement.

---

## Round 3 — the whole change, including the first two rounds' fixes

Areas named: whether each earlier fix is actually sound; the documents against the code; what neither earlier round looked at; and anything that only breaks against the hosted database.

### R3-a [high] — **neither demonstration account restored itself on the path anybody signs in on**

The finding of this phase, and the one that came closest to reaching the demonstration undetected.

`ensureCanonicalTestAccount()` is called from `authorize()`, the NextAuth credentials provider. **No login screen in this product uses that provider.** All four applications post their password form to their own `/api/login` route, which looks the person up, verifies the password and mints its own thirty-day session cookie without ever consulting the account registry. Only Google and LinkedIn go through NextAuth.

So the property written into the glossary, into the code comments and into the previous phase's smoketest — that a gate demonstration account's incompleteness is restored when it signs in with its password — was true of a direct call to the function, and of an endpoint nothing reaches from a browser, and false of every sign-in a person could perform.

Measured rather than argued, on a local production build. With the company's contact filled by hand: signing in through the browser form produced no repair line in the server log, left the contact filled, and admitted the account to the dashboard. Signing in as the same account through `/api/auth/callback/credentials` on the same running server a minute later fired the restore, emptied the contact, and answered 307 to the checklist. Two paths, one account, opposite outcomes.

**Fixed in all four routes, not only the sponsor one.** The delegate demonstration account was broken in exactly the same way on the participant application and the meetings portal, and the fix was already written beside it; leaving three applications broken three days before the demonstration was not defensible. The call is placed before each route's user lookup, so the row it reads is the repaired one, and a wrong password remains a no-op inside the call.

**Why every check passed anyway, which is the part worth keeping.** The verification called the shared function directly. That is the correct way to test what the function does, and it can never discover that nothing calls it. A new section now reads all four route files and asserts each calls the repair, and calls it *before* reading the person's row — a check about wiring rather than behaviour. This is the same shape as the previous phase's Group S, and it is the second time in two phases that a test which exercised a shared function missed what the applications around it actually did.

Verified after the fix on a rebuilt production build, through the browser form: the restore fired, the contact went to null, and the browser landed on the checklist.

### R3-b [medium] — the seed did not correct a company already on the wrong conference

Round 1's fix put `conferenceId` in the reset script's update branch. `seed.ts` still wrote `update: { ...fields }` alone, so a row created against a previous event stayed there while the seed reported having recreated it. **Fixed** the same way.

### R3-c [medium] — the dependent-row guard omitted attached users

Round 2's fix counted meetings, requests, forms and pins before the destructive section, and missed `User.sponsorId`, which is set to null on delete. A second representative attached to the company would have been silently detached and never reattached, while the "recreated row identical" assertion went on passing, because it compares only the company's own columns. **Fixed.**

### R3-d [medium] — the source-level mail assertions were not robust

Round 2's fix checked for one recipient assignment and no address literal. It would pass while the route grew a `cc`, a `bcc`, a second `sendMail`, or an environment-derived fallback. **Partly fixed** — assertions for exactly one `sendMail` call and for no `cc` or `bcc` were added — and the rest is recorded as the residual under R2-b rather than claimed as closed.

### R3-e [low] — the reset script now depends on native TypeScript imports

It imports two `.ts` modules from a `.mjs` file, which works on the installed Node and on the version another script in this repository already relies on for the same trick, but not on the minimum the README states. Recorded rather than restructured; the practical fix if it ever bites is to run that script through `ts-node`, which this package already depends on.

### R3-f [low] — null printed as blank, and criteria said `NULL`

Covered under R2-f. **Fixed.**

### Clean in round 3

The full-row read with canonical sorted-key comparison; the spy genuinely intercepting the delegate the repair uses, with a real liveness check; the conference anchoring and its placement in the update branch; and the three placeholder logo files, which are byte-identical and correctly addressed for all three applications that render them.

---

## What this phase should be remembered for

**A test that calls a shared function with arguments it supplies itself can never tell you that nothing calls that function.** Three rounds, sixty-one assertions and a previous phase's full review cycle all passed over a feature that did not work through any door a person could open. What found it was asking, in round 3, not "is this correct?" but "is this connected?"

The general form, worth applying to every phase that adds behaviour to a shared module: after proving the module does the right thing, prove that the applications reach it — by reading their files and asserting what is written there, not by calling the module again.
