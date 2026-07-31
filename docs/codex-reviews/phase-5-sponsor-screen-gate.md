# Codex adversarial review — Phase 5, sponsor screen gate + checklist

- **Date:** 2026-07-31
- **Branch:** `onboarding-enforcement-sponsor-gate`, base `main` at `c055fca`
- **Rounds:** 3 of 3 (the standing cap; run in full even though round 3 could have been skipped)
- **Findings:** 7 raised, **6 confirmed and fixed, 1 correct observation with a wrong remedy**
- **Assertion count:** 72 at the start of the cycle → **117 at the end**, all passing
- **Commit:** once, at the end of the cycle, not between rounds

Every finding was reproduced before it was acted on. That is not ceremony: two of eight findings in the previous cycle were wrong, and one of the three raised here had a recommendation that measurement showed does not work.

---

## Round 1 — ways around the gate, fail-closed branches, trapping, stale reads

### 1.1 [high] "The gate is not re-run for already-mounted portal navigation" — **CONFIRMED, ALREADY KNOWN; RECOMMENDED FIX MEASURED WRONG**

The observation is correct and was already measured and written down *before* the review ran, in the smoketest document's Step 7: all six portal screens share the `(portal)` layout, Next.js does not re-run a shared parent layout on client-side navigation, so the gate does not fire on in-app navigation. `force-dynamic` prevents static rendering; it does not make a mounted layout re-execute.

**The recommended remedy was to move the gate to a `(portal)/template.tsx` as a per-navigation server boundary. Measured: it behaves identically.** A template calling the gate was added, the app rebuilt, and the same probe run: neither an already-visited screen nor a not-yet-visited one re-blocked, while a hard load did. The experimental template was removed. This matches FP finding F-1, which recorded the same negative result for the participant app — so the finding is real and the fix was not.

What actually closes it, and what does not:

- **Closed:** the profile editor's save handler now calls `router.refresh()`. That is the only place inside the portal where a required item can be emptied, so it is the only place that can close the window from inside. Measured working: emptying the tagline and saving lands the representative on the checklist immediately.
- **Bounded:** once Phase 6 guards the request handlers, a stale portal shell will render with every data address answering 403 — the same defence-in-depth the participant app's gate relies on and documents.
- **Rejected:** a completeness check on every navigation, which reintroduces the per-navigation cost a prior performance phase removed. Also rejected: moving the gate into middleware, which would put a database read on every request including every data call.
- **Residual, accepted and recorded:** an item cleared *outside* the open tab leaves that tab able to move between screens it has already loaded until the next hard load. Same residual F-1 accepted, for the same reason.

### 1.2 [high] "The checklist saves through a stale token, so a reassigned representative is trapped and can corrupt another company" — **CONFIRMED, FIXED**

`/api/profile` PATCH resolved the company from `session.user.sponsorId`. The gate and the checklist read it from the database. Those disagree after a representative is moved between companies, and this app can move them: `POST /api/profile/teammates` sets another user's `sponsorId` to the caller's company and `DELETE` sets it to null.

**Reproduced before acting.** An account created on company A, signed in, then moved to company B in the database: the gate correctly read B and blocked; `PATCH /api/profile` returned 200 and **wrote to company A**; B stayed untouched; `/dashboard` blocked again. Two failures at once — the representative could never finish no matter how often they saved, and their save overwrote a different company's profile.

**Fixed** by resolving the company from the database in that handler, failing closed on a missing row for the same reason the gate does. Covered by a new step (7b) that reproduces the whole scenario against disposable rows and asserts the save lands on the right company, the wrong company is untouched, and the representative is released.

Nominally a request handler and therefore Phase 6's territory. Fixed here because Phase 5 is what creates the trap: before the gate existed, a stale link meant a wrong profile screen; now it means being blocked with no way out.

---

## Round 2 — the policy contract, the moved files, the script as software, concurrency

### 2.1 [high] "Checklist submission can overwrite concurrent changes and release on stale form state" — **CONFIRMED, FIXED**

The checklist snapshotted all six required fields at render and posted all six back. An organizer correcting or deliberately clearing one of those fields from the admin app while the tab sat open would have their change overwritten by the tab's older value — and the gate, seeing a required set that looked satisfied again, would release the representative on the restored stale value. An old tab silently undoing a deliberate re-block.

**Fixed** by sending only the fields the representative actually edited, so an untouched field is absent from the request and `/api/profile` never writes it. Covered by a new step (5a-ii): the website is cleared in the database *after* the checklist loads, the representative fills the tagline and submits, and the website must still be cleared afterwards while the representative stays blocked on it.

**Not fixed, and stated rather than implied:** two people editing the *same* field still race. Detecting that needs a version or `updatedAt` column on `Sponsor`, which is a schema change, and Phases 2 to 7 carry none by decision. The review's own suggestion of an `updatedAt` check was declined on that basis. What is fixed is the case that costs something.

### 2.2 [medium] "The script mutates unrelated seeded companies and restores them only on normal cleanup" — **CONFIRMED, FIXED**

The moved-representative probe picked two arbitrary seeded exhibiting companies and emptied their taglines. A crash between the writes would have left two real companies incomplete — and unlike the demonstration company, that damage is documented nowhere a runner would look.

**Fixed** by creating two disposable company rows for the probe and deleting them afterwards. Nothing needs restoring because nothing seeded is touched. Two bugs surfaced while doing it, both in the fixture rather than the product, and both caught by the assertions: the insert named an `updatedAt` column that `Sponsor` does not have, and the rows were first created empty, which left company B missing six items so that saving one could never release anybody.

### 2.3 [medium] "AC-11 can pass while most portal screens render broken pages" — **CONFIRMED, FIXED**

`assertReachesEveryScreen` checked only status codes for all six screens, while the rendered-content assertion ran on `/dashboard` alone. AC-11 claims page-render coverage for both directions. So `/browse`, `/profile` or `/submissions` could have answered 200 while rendering nothing and the run would still have been green — the gap between a claim and its evidence, which is the same defect class as FP finding F-5.

**Fixed** by running the rendered-content check on every one of the six screens in both directions. Render assertions went from 1 to 30 per run.

---

## Round 3 — documents against code, accessibility and copy, policy edges, dead code

Round 3 returned an `approve` on the policy edge cases — empty arrays, whitespace scalars, malformed values — and `needs-attention` on two others. Running it was worth it: both findings are on the only screen a blocked representative can use.

### 3.1 [medium] "The copy says 20 characters is enough, but the gate requires 21" — **CONFIRMED, FIXED**

The policy's rule is `description.trim().length > 20`, so the smallest description that satisfies it is **21** characters. The checklist said "At least 20 characters" and showed a `/20` counter. A representative typing exactly 20 would see the stated requirement apparently met while the item stayed outstanding and the button stayed disabled, with nothing on the screen to explain why — on the one screen that releases them.

**Confirmed against the module before acting:** 19 fails, 20 fails, 21 passes.

**Fixed in the copy, not the policy.** The policy is shared with the admin app's reminder email; moving its threshold would change which exhibitors that email chases, which is a different decision. Covered by boundary assertions: the policy answers correctly at 20 and 21, the screen states 21, and the submit button is disabled at 20 and enabled at 21 — with a guard first confirming the description is the *only* outstanding item, since otherwise the boundary test proves nothing.

### 3.2 [medium] "Checklist controls are not programmatically labelled" — **CONFIRMED, FIXED**

"Company logo" was a bare line of text next to an input with no `id`, `name` or accessible name, and "Solutions we offer" was a line of text before eighteen loose toggle buttons with nothing tying them together.

**Fixed.** `LogoUploader` takes an optional `inputId` so a caller's label can point at it with `htmlFor`, and falls back to an `aria-label` when no id is supplied. The solutions chips are a `fieldset` with a `legend` — plain HTML, no scripting needed. Covered by an assertion that walks every label and legend in the form and fails on any label naming a control that does not exist.

---

## Found while reviewing, outside the review's scope

Both were raised by the work rather than by the reviewer, and both are recorded in the smoketest document with their measurements:

- **The sponsor profile editor could not be saved at all, for any of the 20 seeded companies** — pre-existing on `main`. Every company stores a relative logo path, the field was `type="url"`, and HTML form validation refuses by never firing the submit event. Fixed by the shared logo input.
- **ADR 0006's code change was outstanding**, so the profile editor offered a solutions vocabulary overlapping the canonical one on 6 of 18 items while every company stored canonical values. Dormant only because the form could not submit; fixing the form would have made it live, so the import swap that record specified was implemented in the same change.

## What the cycle did not look at

- The 21 request handlers, which Phase 6 guards. Deliberately excluded from all three prompts.
- Anything on a deployed environment. Every result is a local production build.
- A human using the screen. No dry-run with the project owner has happened for any phase, and it remains the release gate.

## State at the end of the cycle

- **117 assertions passing, 0 failing, 0 skipped**, on a local production build with all three relevant apps running.
- All four apps typecheck; the participant app's single error is the documented pre-existing `BottomNav` tuple-index one.
- Six of seven findings fixed; the seventh's observation documented and its recommended remedy measured and rejected with the measurement recorded.
- Three of the fixes were themselves wrong on the first attempt — the disposable-company insert, the empty fixture, and a stale assertion still asserting "20". Each was caught by an assertion rather than by inspection, which is the argument for adding the assertion at the same time as the fix.
