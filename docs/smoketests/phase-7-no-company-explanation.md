# Phase 7 — the no-company explanation

Shape rule: [`docs/smoketests/CONTRACT.md`](CONTRACT.md). Acceptance criteria: `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md` § Phase 7. Requirements and the finding that reduced this phase to verification: `.claude/docs/prds/wbr_onboarding_enforcement_prd_2026_07_30.md` § Phase 7 — the no-company explanation.

**Every step here is a contract check.** This phase makes no performance claim, so there is no perf-bar step and no tier to declare for one. The run environment is still recorded below, because a contract check against an app that is not running is worth nothing.

---

## What this verifies

| AC | In plain words | Where |
|---|---|---|
| AC-1 | An exhibitor representative with no company linked sees an explanation, and it names the organizer **as the next step** rather than merely mentioning them | Step 1 |
| AC-2 | The same account is refused at the sponsor data addresses — all nineteen, enumerated rather than sampled | Step 2 |
| AC-3 | The same account is not shown a form whose save would fail. Both halves: the checklist does not render, and the address it would have posted to does refuse | Steps 1 and 3 |
| AC-4 | An organizer or staff account with no company is released by role and never sees the explanation | Step 4 |
| AC-5 | A representative whose company link is then attached reaches the portal normally | Step 5 |
| AC-6 | The throwaway accounts and every row the run creates are removed, counted rather than assumed | Step 6 |
| AC-7 | This document | — |

---

## Why this phase verifies rather than builds

Five of the seven criteria were already satisfied by code shipped in Phases 5 and 6 before this suite existed. That was established by reading the files, recorded in the requirements document with a line reference for each, and decided on before anything was written. Nothing verified any of it, for one reason: **no seeded account is in this state.** A representative with no exhibiting company does not exist in the demonstration data, so no earlier suite could have exercised the path even incidentally.

Rebuilding the explanation and the refusal from the acceptance criteria was rejected. It would have produced a second answer to a question the code already answers — the failure mode `apps/sponsor/lib/caller-company.ts` was deleted for in Phase 6.5.

One thing was deliberately not assumed: the page's own comment calls its wording provisional and points at these criteria as the specification, so AC-1 is asserted against the rendered text. That decision paid for itself — see § What went wrong while building this.

---

## The evidence, and its limits

**A green run is evidence about the assertions listed below and nothing wider.** This repository has been burned by the opposite reading five times: Phase 1 passed 33 of 33 while a delegate blocked from every screen could still post in a chat room; Phase 5 passed 68 of 68 while the sponsor checklist could not be submitted in a browser at all; Phase 6's first Step 10 reported three failures against a feature that worked; Phase 13 printed a "5 of 5 caught" control table describing code that no longer existed; and Phase 6.5's control driver reported six catches against an app that was never running.

**Every refusal is paired with a control.** An assertion that a call was refused proves nothing alone — a malformed request is refused too, and so is a request to an app that is not running. Each refusal sits beside the equivalent call from a legitimate account.

**What the control asserts for the nineteen addresses, precisely: that the guard let the caller through, not that the handler succeeded.** A 404 from a handler handed a deliberately absent identifier is a pass — it proves execution reached the handler. Demanding 200 everywhere would mean inventing a meeting, a form and a response for addresses this phase is not about. One full end-to-end 200 is asserted separately at the top of Step 2, so a green control column cannot mean the app is uniformly broken.

**One address cannot have its success path exercised here.** `POST /api/recommendations/[attendeeId]/draft-intro` answered `502` for the legitimate caller, because no credential for the drafting service is configured anywhere in this repository. That is a pass for what this step asserts — a 502 is proof the call got past the guard — and it is recorded rather than hidden.

---

## Prerequisites for the runner

- **Sponsor app on `http://localhost:3003`, tier C — a production build, not a dev server.** Kill the port first; a server started before your change serves stale code:
  ```
  lsof -ti:3003 | xargs kill -9
  pnpm --filter sponsor build
  cd apps/sponsor && WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true pnpm start
  ```
- **Set `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true` in the script's environment too**, not only the server's. The script reads it to decide whether the drafting address is live. Set it on the server alone and one address is silently skipped.
- `apps/sponsor/.env.local` with `DATABASE_URL` (absolute `file:` path) and `NEXTAUTH_SECRET`.
- No other app is needed. This phase touches the sponsor portal only.

```
node docs/smoketests/playwright/phase-7-no-company-explanation.mjs
```

**Nothing seeded is touched.** The run creates one company and three accounts, plus whatever the app writes on their behalf, and removes all of it. If it is killed part-way the exact cleanup statements are printed on startup.

---

## Steps

### Step 1 — The unlinked representative sees the explanation, not the checklist [contract]

**Pass criteria.** A portal screen answers a redirect to `/onboarding` for a representative whose company link is absent. `/onboarding` then answers 200 and renders the panel marked `sponsor-onboarding-no-company`. Neither the checklist container nor any checklist input appears. Within the panel — not merely somewhere in the document — the organizer is named, and the reader is told to contact them. The control: a representative with a complete company reaches the portal at 200 and is not shown the panel.

**The two AC-1 assertions are split on purpose.** The criterion is "names the organizer **as the next step**", and a bare noun does not satisfy that. One assertion checks the organizer is named; a second checks the reader is told to contact them. Negative controls 4 and 6 break each half separately and hold the split in place.

**Result:** pass, 11 of 11.

### Step 2 — Every guarded address refuses that account, and lets a legitimate one through [contract]

**Pass criteria.** Each of the nineteen guarded addresses answers `403` with `onboardingRequired: true` to the unlinked representative. For the same call from a representative with a complete company, the answer is anything other than that refusal — proof the guard was passed. Separately, `GET /api/sponsor-data` answers a full `200` for the legitimate caller, so the control column cannot be green against a uniformly broken app.

**The count of nineteen is not a remembered number.** It is `git grep -c "requireCompleteProfile()"` over `apps/sponsor/app/api`, which gives 19 calls across 14 files. Three files hold more than one because they export more than one verb. The full enumeration is below.

**Result:** pass, 39 of 39. Nineteen refused, nineteen controls past the guard, one end-to-end 200.

### Step 3 — The form the checklist would have shown could not have saved anyway [contract]

**Pass criteria.** `PATCH /api/profile` answers `403` with `No sponsor linked` for the unlinked representative, and succeeds for the linked one.

**Why this is asserted rather than quoted.** It is the reason a checklist on this screen would be a trap, and every document in this work states it. `PATCH /api/profile` is deliberately outside the request guard — the checklist saves through it — so it refuses with its own message. That message is what the explanation screen exists to replace with something a person can act on.

**Result:** pass, 3 of 3.

### Step 4 — A staff account with no company is released by role, not explained to [contract]

**Pass criteria.** An account holding the `STAFF` role and no exhibiting company reaches the portal at 200, is not shown the panel, is redirected away from `/onboarding` to `/dashboard` if it goes there directly, and is not refused at the guarded addresses.

**Why a fixture rather than the seeded organizer.** The seeded `wbr@test.com` is in exactly this state and would have served, but a seeded account must not be deleted at the end of a run and a fixture must. Using `STAFF` keeps the account disposable while exercising the same branch — the exemption tests the kind of person, not the specific role.

**Result:** pass, 5 of 5.

### Step 5 — Attaching the company releases the representative [contract]

**Pass criteria.** The attaching write changes exactly one row. The portal then opens **on the same session**, with no sign-out — the session token still records no company, so this only passes because both the gate and the guard read from the database. The data addresses serve that same session. A fresh sign-in also reaches the portal. The detaching write changes exactly one row. Afterwards `/dashboard` redirects **specifically to `/onboarding`**, and `GET /api/sponsor-data` answers the **specific** onboarding refusal — a 403 carrying `onboardingRequired` — rather than any error.

**The same-session assertion is doing real work.** If it ever fails, the stale-session defect Phase 6.5 closed has come back.

**Why the post-detach assertions are that specific.** The first version accepted any redirect and did not check its own writes had changed anything. Adversarial review round 2 named what that would have let through: a deleted fixture row, an invalid session, or middleware bouncing to the sign-in page would all have satisfied it, and none of them is evidence that removing the company link is what refused the account.

**Result:** pass, 8 of 8.

### Step 6 — Nothing seeded was touched and nothing this run made is left [contract]

**Pass criteria.** Zero rows remain matching the `phase7-` prefix across companies, accounts, submission forms and meeting requests, counted rather than assumed. The four canonical demonstration accounts are still present.

**The seeded-account count is asserted, not trusted.** A cleanup statement with a mistaken pattern would remove them silently.

**Result:** pass, 5 of 5.

---

## Enumeration — all nineteen guarded addresses (AC-2, document deliverable)

Each answered `403` with `onboardingRequired: true` to the unlinked representative. The control column is the answer to the same call from a representative with a complete company; anything other than that same refusal proves the guard was passed.

| # | Address | Control answer |
|---|---|---|
| 1 | `GET /api/attendees` | 200 |
| 2 | `GET /api/browse` | 200 |
| 3 | `GET /api/meetings-data` | 200 |
| 4 | `PATCH /api/meetings/[id]` | 404 |
| 5 | `GET /api/profile/sponsor-data` | 200 |
| 6 | `POST /api/profile/teammates/register` | 201 |
| 7 | `GET /api/profile/teammates` | 200 |
| 8 | `POST /api/profile/teammates` | 404 |
| 9 | `DELETE /api/profile/teammates` | 404 |
| 10 | `POST /api/recommendations/[attendeeId]/draft-intro` | 502 — no drafting credential exists in this repository; see § The evidence, and its limits |
| 11 | `GET /api/recommendations/quota` | 200 |
| 12 | `POST /api/request-meeting` | 400 |
| 13 | `GET /api/sponsor-data` | 200 |
| 14 | `GET /api/submissions/[id]` | 404 |
| 15 | `PATCH /api/submissions/[id]` | 404 |
| 16 | `DELETE /api/submissions/[id]` | 404 |
| 17 | `PATCH /api/submissions/[id]/submissions/[subId]` | 404 |
| 18 | `GET /api/submissions` | 200 |
| 19 | `POST /api/submissions` | 200 |

Rows 6 and 19 write a row when the control call succeeds. Both write inside the `phase7-` prefix, and Step 6 counts to prove they were removed.

---

## Negative controls — proving the suite can fail

`docs/smoketests/playwright/phase-7-negative-controls.sh`. **26 checks, 0 failed.**

Earlier phases proved a suite could fail by setting the change aside with `git stash push -- <pathspec>` and re-running against the pre-change source. Phase 7 changes no application code, so a stash has nothing to remove and the controls take that job instead.

Every control must clear five gates before it counts: the edit must apply, the build must succeed, the app must be answering, the suite must be caught, and it must be caught **by the predicted amount**. Each gate exists because Phase 6.5's own driver produced a confident result that meant nothing, four separate times. A sixth rule, learned the same cycle: every control is measured against its own build, so the tree is restored and rebuilt between all of them.

| # | What it breaks | Predicted | Caught |
|---|---|---|---|
| 1 | the screen gate stops redirecting an unlinked representative | 4 | 4 |
| 2 | the request guard stops refusing an unlinked representative | 20 | 20 |
| 3 | the role exemption stops releasing a staff account | 1 | 1 |
| 4 | the explanation still names the organizer but stops telling anyone to contact them | 1 | 1 |
| 5 | the explanation screen stops rendering at all | 7 | 7 |
| 6 | the explanation stops naming the organizer anywhere | 2 | 2 |

Restored tree afterwards: green — exit 0, 0 failed, **0 skipped**. All three numbers are checked, not just the failure count, because a run that skipped its assertions also reports "0 failed".

**A skip is never a catch.** The suite exits non-zero for a skip as well as a failure, so every control also requires `skipped == 0` before it counts.

**Three of these predictions changed during the review cycle, and the changes are the evidence the fixes worked.** Control 5 rose from 5 to 7 when the absence checks stopped passing on an empty page; controls 1 and 2 rose from 3 to 4 and from 19 to 20 when Step 5's post-detach assertions were tightened. Each rise was predicted before the run and then matched by it.

---

## Independent browser check — a third opinion on the suite above

`docs/smoketests/playwright/phase-7-browser-check.mjs`. **25 assertions, 0 failed.**

**Why a second suite for the same phase.** Everything above proves its claims by fetching HTML and matching strings in it. That cannot see whether the page hydrates, whether the text is actually visible to a person rather than present-but-hidden, whether a client-side redirect moves the reader after paint, or whether the checklist appears only after hydration. **Phase 5 in this repository passed 68 of 68 while the sponsor checklist could not be submitted in a browser at all.** Ten other suites here drive a real browser; this phase not having one was a gap.

It also **signs in differently on purpose** — it fills in the real login form and presses the real button, where the fetch suite posts to the NextAuth callback directly. The two share no sign-in code, so a broken form with a working address behind it would show up in exactly one of them.

What it establishes that the fetch suite cannot:

- The explanation panel is **visible**, occupying 672×250 pixels — not zero-height, hidden or clipped.
- Its `innerText`, which is what a person can actually read, names the organizer *and* tells the reader to contact them.
- There is **no `form` element on the page at all**, and no visible input or textarea.
- The reader is still on the explanation 2.5 seconds after load, so nothing moves them afterwards.
- Five portal addresses typed directly — `/dashboard`, `/browse`, `/meetings`, `/submissions`, `/profile` — all land on `/onboarding`.
- **Zero uncaught page errors and zero hydration errors.**

**One thing it found that the fetch suite had no way to ask.** Signing in puts the reader at `/dashboard` for one hop before the gate moves them to `/onboarding`, because `/dashboard` is where the app sends every successful login. That hop was then checked rather than waved through: the server answers `307` and its body is Next.js's redirect envelope, carrying no portal content and no other company's data. The only identifiers in it are the caller's own, with `sponsorId` null. Now asserted at Step 5b so it stays that way.

### Two observations for the project owner, neither a defect against these criteria

- **There is no sign-out control on the explanation screen.** Someone who signs in with the wrong account has no visible way off it. Whether that matters is a product decision.
- **`GET /api/submissions` answers `403 {"error":"No sponsor"}` to the organizer account** — the handler's own branch for a caller with no company, not the onboarding refusal. Pre-existing and unchanged from `main`; the guard's comment already anticipates it ("a handler that admits staff must decide what a null company means for it"). Recorded because a reader seeing a 403 for the demonstration login should know which refusal it is.

---

## What went wrong while building this

**Control 4 was not caught on its first run, and that is the most useful thing in this document.** The suite stayed green against an explanation that no longer told anyone what to do.

The cause was the assertion, not the control. The explanation names the organizer twice — once describing the situation at `page.tsx:82`, once as the instruction at `page.tsx:85`. The first version of Step 1 tested for the word "organizer" anywhere in the page, so removing the instruction left the other mention to satisfy the search.

Both halves were fixed. The assertion now scopes to the explanation panel, so text elsewhere in the document cannot satisfy it, and splits into two — the organizer is named, and the reader is told to contact them. The controls now break each half separately: control 4 removes only the instruction, control 6 removes both mentions. If either assertion is ever weakened back to a document-wide word search, one of those two goes green and says so.

**A document-wide `includes` is not an assertion about a screen.** It is an assertion about a file. That is the reusable lesson, and the same shape came back twice more.

**Three rounds of adversarial review found seven more assertions that accepted too much.** Full detail in [`docs/codex-reviews/phase-7-no-company-explanation.md`](../codex-reviews/phase-7-no-company-explanation.md); the pattern is worth stating here because it is the same one every time.

- Two absence checks passed on a page that had returned 500, because the helper hands back an empty string for any non-200 answer. "The checklist did not render" was true of a page that rendered nothing.
- The post-detach check accepted any redirect. A deleted row, an expired session or a bounce to the sign-in page would all have satisfied "removing the link refuses them again".
- Step 5 trusted its own database writes without checking either had changed a row.
- The control driver read only the failure count and discarded the suite's exit status, so a run whose assertions were *skipped* would have counted as a catch; and a failed restore was ignored entirely, which could have left the screen gate or the request guard modified in somebody's working tree.
- This document carried pre-fix control numbers after the suite had changed under it.

**And the panel extractor was wrong three times, which is the entry worth reading.** "What does the panel say" was answered first by searching the whole document, then by taking a fixed 1500-character window from the marker, then by walking `div` tags from the marker. Each was satisfiable by text that is in the response but not on the screen — Next.js embeds a serialized copy of the rendered text further down, and every one of those three could reach it. The final version anchors on the panel's own opening tag, requires the marker to be a `data-testid` attribute on a real `div`, and refuses any slice that turns out to contain a script. Round 3 proved the previous version wrong by reproducing it rather than asserting it, and the same reproduction now shows the fix holding.

**Every one of these is the same defect.** An assertion satisfied by more states than the one it claims to be about. The word "organizer" appearing anywhere; a checklist absent from an empty string; a panel found by a character count; a redirect to anywhere; an update that updated nothing; a control caught by a run that skipped. Where an assertion could be widened without being obviously wrong, it had been.

**The rule this phase should be remembered for:** for every assertion, ask what *else* would satisfy it. If the answer includes a state the code should never be in, the assertion is not finished. A loose assertion is invisible in a green run — only a deliberately broken build reveals it.

**The control driver had the same problem about itself.** It read only the failure count and discarded the suite's exit status, so a run whose assertions were *skipped* rather than failed would have been recorded as a catch — and a restore that failed was ignored entirely, which could have left the screen gate or the request guard modified in the working tree after a run. Both closed: controls now require a non-zero exit, the predicted failure count **and** zero skips, and every restore is verified with `git diff --quiet` and is fatal if it fails.

**The running app was rebuilt rather than reused.** A sponsor server had been running since 02:16 from the previous session's tree. Phase 7 changes no application code, so it would probably have served correctly — but "probably" is not a measurement, and Phase 6.5 recorded a control measured against a different control's build. Killed, rebuilt, restarted, and confirmed answering before anything ran.

---

## Step summary

| Step | Category | Tier | Assertions | Result |
|---|---|---|---|---|
| 1 — explanation, not checklist | contract | n/a | 11 | pass |
| 2 — nineteen addresses refuse | contract | n/a | 39 | pass |
| 3 — the save would have failed | contract | n/a | 3 | pass |
| 4 — staff released by role | contract | n/a | 5 | pass |
| 5 — attaching releases | contract | n/a | 8 | pass |
| 6 — cleanup counted | contract | n/a | 5 | pass |
| **Total** | | | **71** | **71 passed, 0 failed, 0 skipped** |

---

## Regression suites re-run

Phase 7 changes no application code, so strictly no re-run trigger fires. They were run anyway, because the negative controls edit the screen gate, the request guard and the onboarding page — the exact files these suites cover — and "the driver restored the tree" is a claim worth checking rather than trusting.

| Suite | Expected | Result |
|---|---|---|
| `pnpm test:onboarding-policy` | 44 | 44 passed, 0 failed |
| `playwright/phase-5-sponsor-screen-gate.mjs` | 117 | 117 passed, 0 failed, 0 skipped |
| `playwright/phase-6-sponsor-request-guard.mjs` | 121 | 121 passed, 0 failed, 0 skipped |
| `playwright/phase-6-5-sponsor-remaining-defects.mjs` | 52, 1 skip | 52 passed, 0 failed, 1 skipped |
| `playwright/phase-13-sponsor-portal-carried-issues.mjs` | 31 | 31 passed, 0 failed, 0 skipped |

Type check, run per app rather than through turbo because turbo stops at the first failing package: clean, apart from the documented pre-existing `apps/attendee/components/BottomNav.tsx(40,101) TS2514`, which `CLAUDE.md` says not to fix. A positive control was run first — a deliberately mistyped file was reported as an error — so the clean result means the checker was working.

`pnpm lint` was not run. No ESLint configuration exists in this repository; this is a standing condition, not a Phase 7 omission.

---

## Pass / fail

**Pass.** 71 of 71 assertions in the fetch suite, plus 25 of 25 in an independent real-browser check that shares no sign-in code with it, 0 failed and 0 skipped in both. Six negative controls, 26 checks, all caught by the predicted amount, restored tree green with 0 failed and 0 skipped. Five regression suites unchanged at their expected counts.

**What this does not establish.** Nothing about the floor plan, and nothing about any app other than the sponsor portal. The wording is asserted against the acceptance criterion and confirmed visible on a rendered screen, which is still not the same as being judged good copy by a person. The browser check ran headless Chromium at 1280×900; no other browser and no mobile viewport was exercised. The release gate for this work is a dry-run with the project owner, and that has not happened for any phase.

---

## Re-run trigger

Re-run this suite when any of these changes:

- `apps/sponsor/lib/onboarding-gate.ts` — the screen gate
- `apps/sponsor/lib/require-complete-profile.ts` — the request guard
- `apps/sponsor/app/(authenticated)/onboarding/page.tsx` — the explanation screen and its wording
- `packages/db/src/app-access.ts` — the role list the exemption reads
- `packages/db/src/onboarding-policy.ts` — the shared required set
- any handler under `apps/sponsor/app/api` gaining or losing a `requireCompleteProfile()` call, which changes the count of nineteen
- the sponsor login form or the post-login destination, which the browser check exercises directly

Needs the sponsor app on 3003 and the AI switch set in both the server's and the script's environment. The browser check needs neither the switch nor any other app; it downloads nothing, using the Chromium already in the Playwright cache.

Run all three:

```
node docs/smoketests/playwright/phase-7-no-company-explanation.mjs   # 71
node docs/smoketests/playwright/phase-7-browser-check.mjs            # 25
bash docs/smoketests/playwright/phase-7-negative-controls.sh         # 26 checks
```
