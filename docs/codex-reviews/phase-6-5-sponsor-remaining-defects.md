# Codex adversarial review — Phase 6.5, sponsor portal remaining defects

**Date:** 2026-08-01. **Branch:** `sponsor-portal-remaining-issues`.
**Scope flag:** `--scope working-tree` throughout. The phase is deliberately uncommitted during the review cycle, so a branch-scoped difference against `main` would be empty and every round would review nothing.
**Rounds run:** 3 of 3, the full cap, including after round 2 converged.
**Findings:** 4 across three rounds. All 4 acted on. 0 carried.

---

## Why three rounds were run when round 2 found nothing

The cap is run in full by decision, not by result. Round 2 returned a clean verdict; round 3 then found three issues, one of them a live tenant-boundary defect and one a hole in this phase's own control driver. Phase 13 recorded the same shape — its round 3 caught that rounds 1 and 2 had silently broken the controls that were auditing them.

**Round 3 was pointed at what the earlier rounds' own fixes and this phase's own tooling introduced.** That is where all three of its findings came from.

---

## Round 1 — four areas: completeness of the conversion, the new refusals, the teammate rule, the admin middleware

**Verdict: needs-attention. One finding, high.**

### Finding 1.1 — the teammate registration address could attach a WBR-side account by email

Three addresses can write a person's exhibiting company. The phase wired the new rule into two of them — the picker's list and the identifier-based attach — and missed the third: the registration address, which links an account that already exists when the posted email matches one.

**Reproduced before anything changed**, as the practice requires:

```
POST /api/profile/teammates/register  { email: <a STAFF account with no company> }
  -> HTTP 200
  that account's company: null -> the exhibitor's company
```

So the boundary this phase exists to draw could be stepped over by posting an email instead of an identifier, bypassing both the filtered list and the hardened attach.

**Acted on.** The shared rule is applied there too. An assertion covering the email path in both directions was added to the suite, and it failed against the code as it then stood before passing after the fix.

**Why it was missed.** The same reason Phase 13 recorded when it found the colleague-role defect had three code paths rather than the one its finding named: this family of defects has three writers of one column, and reading two of them feels like reading all of them.

---

## Round 2 — four areas: event-operating accounts, the guard's anonymous branch, the suite's own holes, cache keys

Round 1's finding was named to this round as already fixed, so the round would not re-report it.

**Verdict: approve. No material findings.**

Examined and found sound: the converted handlers all check their session before calling the guard; null-company paths fail closed or return the same empty reads for WBR-side accounts as before; `PATCH /api/meetings/[id]` keeps its staff bypass and now ties it to the database role rather than the token's; cache tags align with the company the handler actually acted on.

---

## Round 3 — pointed at the earlier rounds' own fixes and this phase's tooling

**Verdict: needs-attention. Three findings — one high, two medium. All three acted on.**

### Finding 3.1 (high) — round 1's fix left the Phase 13 race live in the same handler

The registration address reads the account by email, decides it is unattached, and then writes by primary key alone. Two exhibitors can both read the same unattached person, both pass every check, and both write — the second silently winning while both are told it worked.

This is the identical shape Phase 13 removed from the sibling attach address **after measuring it**: two simultaneous attaches both succeeded in 15 of 15 attempts, and the first single attempt had not reproduced it. Phase 13's scope was four addresses and this branch was not read closely enough at the time.

**Acted on.** The condition now lives in the write — a single conditional `updateMany` filtered by identifier, addable role, and "unattached or already ours". A zero count answers `409` rather than reporting a success that did not happen.

**Not re-measured here.** The shape is identical to the one Phase 13 measured at 15 of 15, and the fix is the same fix. Stated so the difference between "measured in this phase" and "measured in the phase that established it" is visible rather than blurred.

### Finding 3.2 (medium) — the role check sat below the company branches, so an already-contaminated account never reached it

Round 1's fix was placed after the two branches that ask about the account's current company. A WBR-side account that had **already** been attached by the very defect being fixed would therefore match the same-company branch and receive `200`, or the other-company branch and receive `409`, and never reach the role refusal at all.

The reviewer also observed that the three-way `200` / `409` / `403` split lets an exhibitor probe arbitrary email addresses and classify accounts as same-company, other-exhibitor, or WBR-side.

**Acted on, partly.** The role check moved above both company branches, which is the correctness half and the half that matters: what kind of account this is cannot be answered by which company it currently sits in.

**Deliberately not acted on, and recorded rather than silently dropped:** collapsing the refusal responses so email probing cannot classify accounts. The `200` and `409` distinction predates this phase, the screen's copy depends on the `409` message, and changing what an exhibitor is told when they add a teammate is a product decision rather than an engineering one. The reviewer's observation is real and is carried to the requirements document as an open item.

### Finding 3.3 (medium) — the control driver printed its prediction and never compared it

The driver computed the failure count, printed the predicted count beside it, and compared neither. In expect-red mode **any** non-zero suite exit was reported as caught.

That is not hypothetical: this phase's own driver hit that exact hole twice before this round. Once when the app was never running and the suite failed for that reason; once when a control was measured against a different control's build. On both occasions the driver said "caught" on failures that had nothing to do with the control.

**Acted on.** The predicted count is now a machine-checked number. A control that fails by the wrong amount fails the driver, on the stated ground that it removed something different from what its author thought.

---

## What the controls found that no round did

Recorded separately because it is the part most easily lost.

The negative-control driver was rewritten **four times during this phase**, and three of those rewrites came from the driver catching itself rather than from a review round:

1. **Every control reported caught against an app that was never running.** The readiness wait was a loop of sixty `curl` calls with no delay, exhausted in a fraction of a second. The suite failed because it could not reach the app, and the driver read six such failures as six catches.
2. **A malformed control was reported as caught.** Control 6's replacement text contained `$)`, which Perl expanded as one of its own variables; the admin app failed to build and the driver treated a build failure as evidence.
3. **One control was measured against another control's build.** Control 6 rebuilds the admin app; the driver left the sponsor app running the previous control's deliberately broken code, so control 6 reported four failures where one belonged to it.
4. **An assertion depended on what a previous run had cached.** The teammate list is cached for 120 seconds in a store that survives a rebuild and restart, so the broken list from control 5 was served to the two runs after it — including the restored, fully-fixed tree.

Round 3 found the fifth, which is that the driver never checked its own predictions.

**Every one of these is a way of producing a green or confidently-red result that means nothing**, and the driver now fails on all five. That property is the deliverable, not the six controls.

---

## Summary

| Round | Areas named | Findings | Acted on | Carried |
|---|---|---|---|---|
| 1 | conversion completeness, new refusals, teammate rule, admin middleware | 1 high | 1 | 0 |
| 2 | event-operating accounts, anonymous branch, suite holes, cache keys | 0 | — | — |
| 3 | round 1's fix, the control driver, the suite's review-time changes, the smoketest document | 1 high, 2 medium | 3 | 0 |

**One reviewer observation deliberately not implemented and carried instead:** the email-probing classification described in finding 3.2. Recorded in the requirements document.

**Final state after the cycle:** suite 52 passed, 0 failed, 1 stated skip. Control driver exits 0 with six controls each caught at exactly its predicted count. Regression suites hold at 117, 121, 31 and 44. Per-app type checks clean apart from the documented pre-existing `BottomNav.tsx` error.
