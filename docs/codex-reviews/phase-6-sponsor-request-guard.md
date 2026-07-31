# Codex adversarial review — Phase 6, sponsor request guard

**Date:** 2026-07-31. **Rounds:** 3 of 3, the full cap, per `CONTRACT.md`. **Target:** working-tree diff.

Driven as:

```sh
node ~/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs \
  adversarial-review --background --scope working-tree "<focus>"
```

**`--scope working-tree`, not `--scope branch --base main`.** Phase 6 is deliberately uncommitted until the end of the review cycle, so a branch-scoped diff against `main` would have been empty and every round would have reviewed nothing. Worth recording: the earlier handoff recommended `--base main --scope branch`, which is right for a phase whose commits already exist and wrong for this one.

**Seven findings across three rounds. Five confirmed and acted on. Two confirmed as mechanisms but with their predicted consequence measured and rejected.** Every finding was reproduced or measured before anything was changed, following the rule Phase 5 recorded after three fixes were wrong on the first attempt.

Assertion count went **113 → 121**. Not a large jump, because most of what the rounds found was over-claiming rather than missing coverage — the counter-example being round 1's finding 3, which added four genuinely new assertions.

---

## Round 1 — coverage and reachability, the exemptions, order and fail direction, vacuous assertions

Verdict: **needs-attention**, no-ship.

### 1.1 [high] "Public caching can bypass the guard on the buyer directory" — **CONFIRMED, FIXED, and it required changing an explicitly out-of-scope line**

`GET /api/attendees` answered with `Cache-Control: public, max-age=60, stale-while-revalidate=600`. `public` invites any shared cache to store the response and hand it to somebody else, so a shared cache could defeat the refusal without the guard running at all — on the one address this phase exists to guard.

**Both the requirements document and the plan listed this header as out of scope.** The finding protocol was followed rather than the header quietly changed: analysis, then decision, then both documents updated, then implementation.

**Decision: change it.** The project has already applied this reasoning once — Phase 5 fixed `PATCH /api/profile`, nominally Phase 6's territory, because Phase 5 was what turned a stale company link into a trap. Before this phase the header was a performance choice with no guarantee behind it to undermine.

**Measured before deciding, which is what made the decision easy:** the expensive database query is already cached server-side for 60 seconds by `unstable_cache` in `lib/server-data.ts`, and the app's own client holds the result for five minutes through React Query. The header was a third caching layer on top of two that already existed, and it was the only `Cache-Control` header in the app — the participant app sets none on any of its fifteen guarded reading addresses.

**Two attempts; the first was wrong and round 3 caught it.** See 3.1.

### 1.2 [medium] "AI endpoints return before the guard when the feature flag is off" — **CONFIRMED as fact, REMEDY REJECTED, wording corrected**

`GET /api/recommendations/quota` and `POST /api/recommendations/[attendeeId]/draft-intro` check `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` before anything else and answer `404` when it is off, so two of the claimed nineteen cannot be shown to refuse in that state.

**The observation is right and the consequence is not.** With the switch off those addresses answer `404` to **everybody** — complete representative, incomplete representative and organizer alike. Nobody receives data; the switch is a stricter refusal than the guard, not a way past it.

**The recommended remedy — move the identity checks and the guard ahead of the feature switch — was rejected.** It would answer a signed-in incomplete representative "complete your company profile" about a feature that does not exist on that deployment. `404` is the true answer. Recorded so it is not re-proposed.

**What did change:** the claim. Nineteen addresses call the guard either way; the number this run can produce *evidence* for is seventeen when the switch is off, and the suite says SKIP rather than pass for the other two. The prerequisites now state that a full run needs the switch on.

**One ordering change was made inside the draft-introduction address**, prompted by this finding but for a different reason. The `OPENAI_API_KEY` check moved from above the identity checks to below them, because whether a caller may use an address is a question about the caller and must not depend on whether a server credential is configured — with the old order the same incomplete representative was answered `502` on a machine with no key and `403` on one with a key. It also stopped an anonymous caller learning whether the key was configured.

### 1.3 [medium] "Over-blocking checks do not prove complete users can use write endpoints" — **CONFIRMED, FIXED**

The document claimed AC-3 proved all nineteen "serve a complete representative normally", while the changing addresses were sent invalid bodies on purpose and the assertion accepted any answer that was not the onboarding refusal. A complete representative could have been broken with a `400` or a `500` on a core workflow and the check would still have passed.

**This is the class of defect this project treats as a test defect rather than a wording preference** — the gap between a claim and its evidence. Phase 5 recorded the same shape when its suite claimed page-render coverage for six screens while checking one.

**Both halves fixed.** The claim was narrowed to "the guard refuses none of the nineteen" (AC-3a), and a new AC-3b added real happy-path checks against real subjects, each verified in the database: attach a disposable delegate as a teammate and detach again; ask a disposable delegate for a meeting and confirm the request row exists; create a submission form and confirm the count went up by exactly one. Four new assertions.

---

## Round 2 — token versus database, disposable-data safety, cost, remaining cross-user paths

Verdict: **needs-attention**, no-ship. Both findings **reproduced by measurement before any decision**, and both turned out to be pre-existing rather than caused by this phase.

### 2.1 [high] "Guard and handler can authorize different sponsor records after a mid-session company move" — **REPRODUCED, deliberately NOT FIXED here**

The guard reads the company from the database; every handler still reads `user.sponsorId` off the session token for its own work.

Reproduced end to end rather than reasoned about:

```
1. representative R signs in while attached to company A   → token carries company A
2. company B's representative moves R onto company B       → 200
3. R, still holding the old token, calls
   PATCH /api/meetings/<request addressed to company A> {status:'APPROVED'}
   → 200; the request addressed to company A is now APPROVED
   → the guard consulted company B and passed; the handler consulted company A and acted
```

**Pre-existing, and not caused by this phase.** Without the guard the same `PATCH` succeeds identically — there is simply no second opinion to disagree with. Phase 6 cannot grant access that was not already there, and in one direction it reduces the exposure: if the new company is incomplete, the guard refuses the moved representative at all nineteen addresses.

**The Phase 5 precedent does not apply.** That precedent covers a defect "only reachable *because of* your phase". This one is reachable identically without it.

**Decision: record, do not fix.** The review's recommendation — have the guard return a database-backed account context and re-point every handler's authorization at it — is the right shape and is a phase of its own. It changes how nineteen handlers decide which company they are acting for, with no existing coverage for that logic, eleven days before the demonstration.

**Step 2 of that reproduction is a separate and arguably worse finding**, surfaced while measuring this one: `POST /api/profile/teammates` accepts an arbitrary `userId` and writes the caller's company onto it with no check that the target belongs to somebody else. Measured at `200`. Also pre-existing; also recorded. Both are in the plan's findings and the requirements document's open decisions.

### 2.2 [high] "Persisted React Query cache can leak sponsor data across browser sessions" — **MECHANISM CONFIRMED, PREDICTED CONSEQUENCE DID NOT REPRODUCE**

The claim: `lib/query-client.tsx` persists all query state to IndexedDB under one fixed key with company-agnostic query keys, so one company's representative could see another's data in the same browser.

Measured with two disposable companies and two representatives in one browser context:

```
1. representative A of company ALPHA loads the dashboard
   persisted cache: 985,857 chars, contains ALPHA        ✓
2. A presses the real Sign out button, lands on /login
   persisted cache: 985,857 chars, still contains ALPHA  ← not cleared
3. representative B of company BETA signs in, same browser
   /dashboard /meetings /profile /submissions /browse
   ALPHA-derived content: no, on all five, early and settled
4. persisted cache while B is signed in: 1,024,864 chars, contains ALPHA: no
```

**Half confirmed.** The cache does survive sign-out — nothing calls `removeClient`, and `signOut({callbackUrl:'/login'})` does not clear it. **The cross-company display leak did not reproduce**: B's data overwrote A's rather than A's being served to B.

**What is real, and is a different finding from the one raised:** roughly 1MB of one company's data, including the buyer directory, remains readable in the browser's IndexedDB after that representative signs out. On a shared machine somebody with access to the browser profile could read it through developer tools without signing in. Data at rest on the client, outside anything this phase touches. The fix is one call to `removeClient` on sign-out. Recorded, not actioned.

**Note on the recommendation as written.** It asked for scoped query keys, a cleared persister on sign-out, and a smoke test that switches accounts in one browser. The last of those is exactly the measurement above, and it says the leak is not there — so the first two are worth doing for the data-at-rest reason, not for the reason given.

### Not covered by round 2's answer

The round named four areas and the response addressed two. Cost (area 3) and disposable-data safety (area 2) went unanswered, so both were carried into round 3, where area 2 produced finding 3.2.

---

## Round 3 — the anonymous boundary, method and route enumeration, the new cache header, test-script safety

Verdict: **needs-attention**. Explicitly reported: *"I did not find a defensible anonymous-boundary or alternate-route bypass in this pass."* That is the closest thing to an approval any round gave, and it covered the two areas most likely to hide a hole — the sessionless path through the guard, and whether the 21/19/3 enumeration matches the code.

### 3.1 [medium] "Guarded buyer directory can be served stale for 10 extra minutes" — **CONFIRMED, FIXED. This round caught the round 1 fix.**

The round 1 fix set `private, max-age=60, stale-while-revalidate=600` and put a comment beside it saying the residual was bounded to 60 seconds. **The header actually permits 660**: `stale-while-revalidate=600` lets a browser serve a stale copy for ten minutes past the freshness window while it revalidates behind the scenes.

So the comment claimed a bound the header did not give — the same over-claiming defect as 1.3, in a fix written to close a finding about over-claiming.

**Final value: `private, no-store`**, verified on the wire rather than in the source:

```
status: 200 | Cache-Control: private, no-store
```

Removing it costs nothing for the reasons measured in 1.1. The comment now also states what the header does **not** fix — React Query's in-memory copy and the persisted IndexedDB copy are not governed by it, per 2.2.

### 3.2 [medium] "Crash recovery instructions do not delete all rows the smoke test creates" — **CONFIRMED, FIXED**

The suite's header carried manual cleanup SQL that deleted `SubmissionForm` by `phase6-` id prefix and did not mention `MeetingRequest` at all. But AC-3b's happy-path checks create a second submission form and a meeting request **through the app**, so the app chooses those ids and no prefix exists on them. A runner following those instructions after a crash would have left rows behind, or hit a foreign-key error deleting the users first.

A documentation defect that only exists because 1.3's fix added rows — the fix for one finding created the conditions for another, which is why the full three-round cap is run even when a round looks skippable.

**Fixed better than reported.** The statements are now a single `CLEANUP_SQL` definition with three consumers: the cleanup the script runs, the statements it **prints on startup** so a runner can copy rather than reconstruct them, and the leftover count that verifies the cleanup worked. The leftover count is derived from the same list, so a statement added there cannot be forgotten in the verification and leave the run reporting a clean database while rows survive. Order is fixed: child rows, then accounts, then the company.

---

## Found while reviewing, outside any round's scope

- **The `(portal)` layout preloads the buyer directory without credentials.** `<link rel="preload" href="/api/attendees" as="fetch" crossOrigin="anonymous" />` sends no cookie, so the guard sees no session and returns `null`, and the handler's own check answers `401`. The preload warms nothing. Pre-existing, unchanged, not actioned — dead weight rather than an optimisation.
- **My own assertion had a race that reported a working feature broken.** The first version of the button-press step used `waitForLoadState('networkidle')`, which returns immediately when the network is idle at that instant — which it was, because the click's request had not started. It read the page address and the database before the save was sent and reported three failures against a checklist that worked correctly. Found by writing a separate measurement rather than by staring at the assertion. Recorded because a test that reports a working feature broken costs the same as one that reports a broken feature working.
- **My own negative-controls driver printed "NOT CAUGHT" on its final confirmation run**, where a green suite is the correct outcome. Fixed with an `expect-green` mode. A script whose job is telling a runner what is real should not itself mislead.

---

## What the cycle did not look at

- **AC-8, the deployed-preview cache check.** Blocked on a Vercel Protection Bypass for Automation token. The script exists and is reviewed; it has not been run. This is the one outstanding acceptance criterion.
- **The four soft completeness measures.** Out of scope by decision in the requirements document.
- **Whether the two pre-existing tenant-authorization defects (2.1) should jump the queue** ahead of the remaining phases. That is a decision for the engineer of record with the project owner, not for a review round.
- **Phase 7's screen for the no-company case.** Phase 6 refuses that account at all nineteen data addresses; the explanation screen is Phase 7's.

---

## State at the end of the cycle

- Suite: **121 assertions passing, 0 failed, 0 skipped**, tier C production build, AI feature switch on.
- **Negative controls: 5 of 5 caught**, run twice with identical numbers (5, 41, 19, 19, 40), touched files verified identical to their pre-control copies, final confirmation run green.
- `pnpm typecheck` clean in all four apps apart from the documented pre-existing `BottomNav.tsx(40,101) TS2514`. The checker was shown to fail on a deliberate error before that result was trusted.
- `pnpm lint` cannot run — no ESLint configuration exists in this repository.
- **The release gate — a dry-run with the project owner — has still not happened for any phase**, 1 through 6. No human has used this app.
