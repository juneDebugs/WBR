# Phase 6.5 — sponsor portal remaining defects

**Date:** 2026-08-01. **Branch:** `sponsor-portal-remaining-issues`, cut from `origin/main` at `28cfa1a`.
**Requirements:** `.claude/docs/prds/wbr_onboarding_enforcement_prd_2026_07_30.md` § Phase 6.5.
**Plan:** `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md` § Phase 6.5.
**Contract:** `docs/smoketests/CONTRACT.md`.

**Every step here is a contract check.** Nothing in this phase makes a performance claim, so there is no perf-bar step and no tier-A or tier-B requirement. All runs are tier C — a local production build, never a dev server.

---

## What this verifies

In plain language, before any table:

1. A representative of one exhibiting company cannot reach another company's records. That has two separate causes and both are covered: a stale sign-in that still names the company the person has left, and a pair of identifiers that were validated independently rather than together.
2. When a caller is refused, they are told so. Two addresses previously answered "success" while silently doing nothing.
3. An exhibitor is not shown WBR's own staff and administrator accounts in the list of people they may add to their team.
4. The admin app protects a page whether or not its address happens to end in something that looks like an image file name.
5. Three record-keeping items: a deleted helper, a lockfile entry, and a published number that was wrong.

---

## The evidence, and its limits

**Green is evidence about the assertions listed below and nothing wider.** This repository has produced fully green runs over broken behaviour four times — Phase 1 passed 33 of 33 while a blocked delegate could still post in a chat room; Phase 5 passed 68 of 68 while the sponsor checklist could not be submitted in a browser at all; Phase 6's first attempt at one step reported three failures against a feature that worked; and Phase 13 printed a "5 of 5 caught" control table describing code that no longer existed.

**The numbers below may only be copied from a negative-control run that exited 0.** That driver fails when a control does not apply, when a control leaves the suite green, when a build fails, or when the app under test never came up. Each of those four gates exists because a run of this phase's own driver hit that exact failure — see § What went wrong while building this.

**The release gate is a dry-run with the project owner. Not met for any phase yet.**

---

## Two controls, at two different widths

**The whole-tree control.** Every Phase 6.5 change was set aside with `git stash`, both apps were rebuilt from the resulting pre-change source, and this phase's suite was run against it.

```
22 passed, 27 failed, 1 skipped
```

The 27 failures are precisely the assertions covering the fixes; the 22 passes are the controls and setup steps, which must pass in both states or the suite is measuring nothing. That run independently reproduced all five documented defects, including the original one — approving a meeting request addressed to the company the representative had left answered `200` and moved the request to `APPROVED`.

This control is not repeatable from a script, which is why it is recorded here rather than in the driver.

**The per-fix controls.** `docs/smoketests/playwright/phase-6-5-negative-controls.sh` breaks each fix on its own, rebuilds, runs the suite, and restores. This answers a narrower question the whole-tree control cannot: is each fix *independently* covered, or is one assertion carrying several of them?

| Control | What it removes | Predicted | Caught |
|---|---|---|---|
| 1 | The response address stops checking its two identifiers as a pair | 2 | ✅ 2 |
| 2 | Editing another company's form answers success again | 2 | ✅ 2 |
| 3 | Deleting another company's form answers success again | 2 | ✅ 2 |
| 4 | The guard hands back the sign-in token's company again | 17 | ✅ 17 |
| 5 | The teammate rule goes back to excluding only organizers | 5 | ✅ 5 |
| 6 | The admin app goes back to excluding by file extension | 1 | ✅ 1 |
| — | Everything restored | 0 | ✅ green |

**The predicted count is now machine-checked, not merely printed.** Adversarial review round 3 found that the driver computed the failure count, displayed the prediction beside it, and compared neither — so in expect-red mode *any* non-zero exit was reported as caught. A control that fails by the wrong amount now fails the driver, on the stated ground that it removed something different from what its author thought.

---

## Steps

### Step 1 — A response can be changed only through its own form [contract]

**Run:** tier C, local production build, sponsor app on 3003.

Two representatives, each correctly signed in at their own company. No stale session is involved, which is the point — this defect needs none.

**Pass criteria.** Company A pairing its own form identifier with company B's response identifier answers `404`, and company B's response is unchanged in the database. The control — company A changing its own response — answers `200` and the change reaches the database.

**Result:** pass, 4 of 4.

### Step 2 — Editing or deleting another company's form is refused, visibly [contract]

**Pass criteria.** `PATCH` and `DELETE` on a form belonging to another company each answer `404`, the form is unchanged and still present, and `GET` on the same form answers the same `404` so all three verbs agree. Controls on the caller's own form answer `200` and the edit reaches the database.

**Result:** pass, 8 of 8.

### Step 3 — A representative moved between companies mid-session [contract]

The representative's company is changed in the database while their session, and the company recorded in it at sign-in, are left untouched.

**Pass criteria, reading.** The form list shows the current company's form and not the previous one's. The company profile address returns the current company. The dashboard payload does not mention the previous company's identifier. The meetings and allowance addresses answer.

**Pass criteria, changing.** Editing, deleting, and setting a response status on the previous company's records each answer `404` and leave the data unchanged; the same operations on the current company's records answer `200` and take effect. A newly created form belongs to the current company. Approving a meeting request addressed to the previous company answers `403` and leaves it `PENDING`; approving one addressed to the current company answers `200` and leaves it `APPROVED`.

**Result:** pass, 26 of 26, with one deliberate skip recorded below.

### Step 4 — The teammate picker offers no WBR-side account [contract]

**Pass criteria.** The list the screen actually receives contains the delegate fixture (the control, proving the list is real) and does not contain the staff fixture. Attaching the staff account by calling the address directly answers `403` and leaves that account with no company, so the rule is enforced where authorization belongs and not only in the presentation. The control attach of the delegate answers `200`.

**Two things this step had to get right, both learned from earlier phases.** The fixtures are named to sort first, because the list loads only the first 200 accounts by name out of more than 2,400 — a fixture named for its phase is never on the screen, and Phase 13 lost an investigation to exactly that. And the step forces the cached list to refresh through the app's own behaviour before reading it; see § What went wrong.

**Also asserted here, added during adversarial review round 1.** Three addresses can write a person's exhibiting company, and the first version of this phase hardened only two of them. Posting a WBR-side account's **email** to the registration address attached it and answered `200` — measured before the fix. The step now asserts that path answers `403` and leaves the account with no company.

**Result:** pass, 10 of 10.

### Step 5 — The admin app protects a page ending in an image extension [contract]

**Run:** tier C, admin app on 3000.

**Pass criteria.** A signed-out request to `/dashboard/sponsors/anything.png` is redirected to the sign-in page. The control — an ordinary dashboard page — is redirected the same way.

**Result:** pass, 2 of 2. Before the change the same request answered `200`.

### Step 6 — Repository facts [contract]

**Pass criteria.** `apps/sponsor/lib/caller-company.ts` does not exist. `pnpm-lock.yaml` records `packages/ui`. `CHANGELOG.md` carries the corrected count of twelve.

**Result:** pass, 3 of 3.

### Step 7 — Nothing seeded was touched [contract]

**Pass criteria.** Every company, account, form, response and meeting request the run created is gone, verified by counting rows rather than assumed.

**Result:** pass, 1 of 1.

---

## Enumeration — all nineteen guarded addresses (AC-1, document deliverable)

Enumeration is a deliverable rather than a step, because both of Phase 1's worst defects were missed coverage rather than faulty logic. Each address is marked with where it now gets the caller's company.

| # | Address | Company source |
|---|---|---|
| 1 | `GET /api/attendees` | does not consult the company |
| 2 | `GET /api/browse` | does not consult the company |
| 3 | `POST /api/request-meeting` | does not consult the company |
| 4 | `GET /api/meetings-data` | database, via the guard |
| 5 | `GET /api/sponsor-data` | database, via the guard |
| 6 | `GET /api/profile/sponsor-data` | database, via the guard |
| 7 | `GET /api/recommendations/quota` | database, via the guard |
| 8 | `GET /api/submissions` | database, via the guard |
| 9 | `GET /api/submissions/[id]` | database, via the guard |
| 10 | `POST /api/submissions` | database, via the guard |
| 11 | `PATCH /api/submissions/[id]` | database, via the guard |
| 12 | `DELETE /api/submissions/[id]` | database, via the guard |
| 13 | `PATCH /api/submissions/[id]/submissions/[subId]` | database, via the guard |
| 14 | `PATCH /api/meetings/[id]` | database, via the guard |
| 15 | `POST /api/recommendations/[attendeeId]/draft-intro` | database, via the guard |
| 16 | `GET /api/profile/teammates` | database, via the guard |
| 17 | `POST /api/profile/teammates` | database, via the guard |
| 18 | `DELETE /api/profile/teammates` | database, via the guard |
| 19 | `POST /api/profile/teammates/register` | database, via the guard |

Three never consult the company. Sixteen do, and all sixteen now read it from the database. Addresses 16 to 19 read it from the database before this phase as well, through a helper that issued its own query; they now take the guard's value and that helper is deleted.

**Deliberately not guarded, unchanged from Phase 6:** `PATCH /api/profile` (the checklist writes through it), `POST /api/login` and `GET/POST /api/auth/[...nextauth]` (no session exists yet).

## No additional database read (AC-5, document deliverable)

A query count is not observable from outside the app, so this is asserted by reading the code and recorded as such rather than measured.

`requireCompleteProfile()` already ran `prisma.user.findUnique` on every guarded request and already selected the caller's role and their company's required columns. This phase added `sponsorId: true` to that same `select`. Reading one more column of a row already being fetched issues no second query. No handler calls the guard more than once, and the four teammate addresses each lost a query they previously made through `getCallerCompanyId`, so the change is neutral for twelve addresses and strictly cheaper for four.

---

## What went wrong while building this

Recorded because it is more useful than the successes, and because three of the four gates now in the control driver exist as a direct result.

**The control driver reported all six controls caught, against an app that was never running.** The first version waited for the server with a loop of sixty `curl` calls and no delay between them. It exhausted all sixty in a fraction of a second, long before the app had booted, and ran the suite against nothing. The suite exited non-zero because it could not reach the app, and the driver read that as "caught" — six times. Fixed with `curl --retry-connrefused --retry-delay`, plus an explicit check that the app answers before the run is trusted.

**A malformed control was recorded as a successful catch.** Control 6's replacement text contains `$)`, which Perl expanded as one of its own variables, producing an invalid configuration and a failed build. The driver treated a build failure as evidence, inherited from Phase 13's driver, which meant a control that never deployed was reported as caught. Two fixes: that substitution is done in Python with plain string literals, and a build failure is now counted as a problem rather than a catch — a control exists to show the *suite* going red, and if the suite did not run, nothing was shown.

**One control was measured against another control's build.** Control 6 rebuilds the admin app. The driver was rebuilding only that app, so the sponsor app was left running control 5's deliberately broken picker, and control 6 reported four failures where one belonged to it. A control table that overstates what a control caught is the same fault as one that overstates that it ran.

**An assertion depended on what a previous run had cached.** The teammate list is wrapped in a 120-second cache whose contents are written to `.next/cache` and therefore survive a rebuild and a restart. Control 5 populated it with the deliberately broken rule, and the two runs after it — including the restored, fully-fixed tree — were served that stale list and reported the staff account still offered. The step now forces a refresh through the app's own behaviour before reading.

**This last one is a property of the product, not only of the test, and is recorded rather than fixed.** After this change is deployed, a list cached before the deployment can still offer a WBR-side account until the cache tag is revalidated or the 120 seconds elapse. It is bounded and self-correcting, and no exhibitor can act on it — the address refuses such a target regardless. It is stated here so that a stale list observed shortly after a deploy is recognised rather than investigated as a new defect.

**One deviation from the plan's ordering, and how it was closed.** The plan requires each handler's assertion to be written before the handler changes. That was done for the submissions family, whose before-behaviour was measured and recorded in the requirements document before any edit. It was not done for the meetings address, where the reproduction Phase 6 had already recorded was relied on instead. Rather than argue the gap away, the whole-tree control above was run: the finished suite was executed against the pre-change source and 27 assertions went red. That produces the same evidence the ordering rule was asking for.

---

## Summary

| Step | Category | Tier | Result |
|---|---|---|---|
| 1 — response belongs to its form | contract | C | ✅ 4/4 |
| 2 — write verbs refuse visibly | contract | C | ✅ 8/8 |
| 3 — representative moved mid-session | contract | C | ✅ 26/26 |
| 4 — picker offers no WBR-side account | contract | C | ✅ 10/10 |
| 5 — admin app path protection | contract | C | ✅ 2/2 |
| 6 — repository facts | contract | C | ✅ 3/3 |
| 7 — cleanup verified by counting | contract | C | ✅ 1/1 |
| AC-1 enumeration | document | — | ✅ above |
| AC-5 no extra query | document | — | ✅ above |

**Suite total: 52 passed, 0 failed, 1 skipped.** Two of those assertions were added during adversarial review round 1, covering the email path to the teammate column.

**Review cycle: three rounds, four findings, all four acted on, none carried.** Full log in [`docs/codex-reviews/phase-6-5-sponsor-remaining-defects.md`](codex-reviews/phase-6-5-sponsor-remaining-defects.md). Round 2 found nothing and round 3 was run anyway, which is where three of the four findings came from — including a live tenant-boundary race and a hole in this document's own evidence.

**The one skip, stated rather than hidden.** The draft-introduction address needs an `OPENAI_API_KEY`, which is configured nowhere in this repository. Its *refusal* direction is covered — the company is now resolved above the credential check, so the suite confirms the address reaches that check having resolved the company rather than answering about a missing key first. Its *success* direction cannot be exercised locally and is not claimed.

## Regression suites re-run

This phase edits handlers that three existing suites cover.

| Suite | Recorded | This run |
|---|---|---|
| `phase-5-sponsor-screen-gate.mjs` | 117 | ✅ 117, 0 failed, 0 skipped |
| `phase-6-sponsor-request-guard.mjs` | 121 | ✅ 121, 0 failed, 0 skipped |
| `phase-13-sponsor-portal-carried-issues.mjs` | 31 | ✅ 31, 0 failed, 0 skipped |
| `pnpm test:onboarding-policy` | 44 | ✅ 44, 0 failed |

Phase 13's suite needed no edit despite this phase deleting a file its re-run trigger names, because it asserts behaviour rather than implementation. Its negative-control driver *does* reference that file and would now fail to apply — that driver is Phase 13's and is left alone; this phase ships its own.
