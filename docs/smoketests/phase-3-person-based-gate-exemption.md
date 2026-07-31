# Phase 3 Smoketest — person-based gate exemption

Manual verification path. Both human and AI agents are valid runners. Authored per [`docs/smoketests/CONTRACT.md`](CONTRACT.md); source: [`.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`](../../.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md) § Phase 3, and requirements document [`wbr_onboarding_enforcement_prd_2026_07_30.md`](../../.claude/docs/prds/wbr_onboarding_enforcement_prd_2026_07_30.md) user stories OE 9, 11, 12, 13.

**Run date:** 2026-07-30. **Branch:** `onboarding-enforcement-foundation`.

---

## What Phase 3 changed, in one paragraph

Before this phase, the onboarding gate measured everybody. An organizer opening the participant app was asked to complete a delegate's profile — job title, company size, annual revenue and so on — exactly as a delegate was. After this phase, the gate first asks what kind of account it is looking at. If the role is organizer, admin or WBR staff, the account is released without any completeness question being asked. Everyone else is measured exactly as before.

**Why this is stated as a kind of person rather than a list of apps.** The earlier wording named two apps that were never gated. That left an organizer inside the participant app gated like a delegate, and it would have trapped the primary demonstration account in the sponsor portal: that account holds the organizer role, has no exhibiting company, and the sponsor profile-save address refuses it outright with "No sponsor linked" — a checklist it could never complete. A fifth app would inherit the same hole. A kind of person does not.

**Nothing visible changes today**, because the organizer demonstration account already satisfies the required set — it was given a company size and annual revenue during Phase 1 precisely so it could get past the gate. That is exactly why this needs its own assertion rather than being inferred from an unchanged screen: the test deliberately breaks that account's profile and checks it still gets through.

---

## What this verifies

- An organizer account with a deliberately incomplete profile reaches every participant-app screen and is not redirected to the checklist — **plan AC 1**.
- The same account is refused by no participant-app data address — **plan AC 2**.
- A staff account behaves identically to the organizer account — **plan AC 3**.
- A delegate with the same incomplete profile is still blocked from every screen and still refused at the guarded addresses; the exemption cannot be used to skip onboarding — **plan AC 4**.
- The exemption is the existing role test from the access-policy module; no second role list is introduced — **plan AC 5**.
- The gate's definition carries a note explaining the exemption is about who the person is, not which app they are in — **plan AC 6**.
- The deliberately-incomplete delegate demonstration account is still blocked, so the gate demonstration still works — **plan AC 7**.

## Prerequisites for the runner

- Attendee app reachable at `ATTENDEE_BASE_URL`, default `http://localhost:3001`. Tier C: `pnpm --filter attendee build && pnpm --filter attendee start`.
- `apps/attendee/.env.local` with `DATABASE_URL` as an **absolute** `file:/…` path and `NEXTAUTH_SECRET` set.
- The canonical demonstration accounts. Missing rows self-heal on first sign-in.
- Playwright with Chromium installed.
- **Kill any server already listening on port 3001 before building.** A server started before the change serves stale code and produces a pass that means nothing. This happened once during Phase 2.

---

## Steps

### Step 1 — Organizer, staff, delegate and sponsor roles all behave correctly [contract, tier C]

**Verifies:** plan ACs 1, 2, 3, 4 and 7, and the behavioural half of AC 5.

```bash
lsof -ti:3001 | xargs -r kill
pnpm --filter attendee build && pnpm --filter attendee start &
node docs/smoketests/playwright/phase-3-person-based-gate-exemption.mjs
```

- [x] Run the script against a freshly started production build.
  - **Pass:** the script prints `Results: 57 passed, 0 failed` and exits 0.
  - **Fail:** any assertion fails.

**Result: PASS — 57 passed, 0 failed.** What it covered:

| Account | Role | Profile during the test | Screens | Guarded data addresses |
|---|---|---|---|---|
| `wbr@test.com` | ORGANIZER | deliberately incomplete | all 8 reached, none redirected | none refused |
| throwaway account | STAFF | created with no required fields at all | all 8 reached, none redirected | none refused |
| `stephcurry@test.com` | BRAND | the same incompleteness | all 8 blocked | all 4 refused with 403 |
| `sponsor@test.com` | SPONSOR | the same incompleteness | all 8 blocked | all 4 refused with 403 |
| `onboarding-demo@test.com` | ATTENDEE | untouched | blocked, checklist rendered | — |

The last two rows are what makes this a test rather than a demonstration. The sponsor row in particular is the behavioural check that the exemption did not widen: a **SPONSOR** role is not an event-operating role, so it must still be gated. If someone later added a second, more generous list of exempt roles, this row is where it would show up.

The organizer and staff rows were also checked through a real page load, not only a status code: the checklist form is absent, and the landing page rendered 1,079 characters of content rather than a blank screen behind a normal 200.

### Step 2 — Phase 1's gate behaviour is unchanged for delegates [contract, tier C]

**Verifies:** that adding the exemption did not disturb the delegate path this branch has not touched.

```bash
git diff --stat docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs   # must print nothing
node docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs
```

- [x] Re-run Phase 1's script, unedited.
  - **Pass:** `Results: 53 passed, 0 failed`.
  - **Fail:** any assertion fails or the count drops.

**Result: PASS — 53 passed, 0 failed, script unmodified.**

### Step 3 — Phase 2's shared policy is unchanged [contract]

```bash
pnpm test:onboarding-policy
```

- [x] Re-run the module checks.
  - **Pass:** `Results: 44 passed, 0 failed`.

**Result: PASS — 44 passed, 0 failed.**

### Step 4 — Type check [contract]

```bash
pnpm typecheck
# then per app, because turbo stops the whole run at the first failure:
for app in attendee web sponsor meetings; do (cd apps/$app && npx tsc --noEmit); done
```

- [x] Run the type check.
  - **Pass:** the only error is the documented `apps/attendee/components/BottomNav.tsx(40,101): error TS2514`.

**Result: PASS.** `apps/web`, `apps/sponsor` and `apps/meetings` clean; `apps/attendee` shows only the documented pre-existing error.

### Step 5 — The two structural criteria, checked by reading the code [contract]

Plan ACs 5 and 6 are structural rather than behavioural. They are **deliberately not** in the automated script. The plan's own testing rule says a test must never assert a function name or a module location, because such a test breaks on a rename while passing straight through a real behaviour change. They are checked here by reading, with references.

- [x] **The exemption reuses the existing role test; no second role list exists.**
  - `apps/attendee/lib/onboarding-gate.ts:77` — `if (isWbrStaff(account.role)) return`
  - `apps/attendee/lib/require-complete-profile.ts:88` — `if (isWbrStaff(account.role)) return null`
  - `apps/attendee/app/(authenticated)/onboarding/page.tsx:42` — `if (isWbrStaff(account.role)) redirect('/home')`
  - All three import `isWbrStaff` from `@conference/db`, which resolves to `packages/db/src/app-access.ts` — the module that already decides which role may sign in to which app.
  - **Pass:** searching the gate, the guard and the checklist page for a hardcoded role name (`ORGANIZER`) returns nothing. No second list exists.

- [x] **The gate's definition carries the explanatory note.**
  - `apps/attendee/lib/onboarding-gate.ts:59` opens the note, which states the rule, gives the reason, and names the demonstration account that the app-based wording would have trapped.

---

## Observations recorded but not acted on

**Two request handlers answer a non-existent id with a 500 rather than a 404.** With the exemption in place, an exempt account reaches these handlers instead of being refused, which made the behaviour visible:

- `POST /api/posts/no-such-post/like` → 500
- `POST /api/sessions/no-such-session/bookmark` → 500

This is **not caused by Phase 3**. The guard used to stop an incomplete account before the handler ran; a complete account has always reached the handler and would always have got the same 500. Phase 3 only made it observable. A server error where a "not found" belongs is untidy but harmless here, and fixing it is outside this phase. Recorded so it is not rediscovered as new.

**There is no canonical STAFF demonstration login.** `staff@wbr.com` exists in the seeded data, but `packages/db/scripts/reset-test-accounts.mjs:88` lists it among five **legacy accounts to erase**, and it does not accept the standard demonstration password. A test that signed in as it would break the next time anyone ran `pnpm db:reset-test-accounts`. This run therefore creates a throwaway staff account and deletes it again — the same pattern the plan prescribes for the Phase 7 no-company case. **This matters for Phase 5**, whose acceptance criteria require a staff account to reach every sponsor portal screen; it will need the same treatment or a fifth canonical account. Added to the plan's open decisions.

## A defect in this smoketest, found and fixed during the run

The first version of this script left data behind. Two of its four probe requests **succeed** for an exempt account — that is the entire point of the phase — and a successful probe writes a real row. The first run created a follow relationship from the organizer to the delegate, and posted a message reading "phase 3 exemption probe" into the global feed, then cleaned up neither. A probe message sitting in the demonstration feed is exactly the sort of thing that surfaces on stage.

The script now marks everything it creates and removes it in a cleanup block that runs whatever the outcome, reporting the counts. The re-run removed 2 follow rows and 2 messages, and the database was checked directly afterwards: zero probe messages, zero stray follow rows, zero throwaway accounts.

The general lesson, worth carrying into Phase 4: **once an account is exempt or complete, a probe that used to be refused now succeeds and writes something.** Every probe added from here needs its cleanup written at the same time.

---

## Step summary

| Step | Category | Environment | Status |
|---|---|---|---|
| 1. Role behaviour across organizer, staff, delegate, sponsor | contract | tier C — local production build | **PASS** — 57/57 |
| 2. Phase 1 regression, script unedited | contract | tier C — local production build | **PASS** — 53/53 |
| 3. Phase 2 shared policy unchanged | contract | anywhere | **PASS** — 44/44 |
| 4. Type check | contract | anywhere | **PASS** — only the documented pre-existing error |
| 5. Structural criteria checked by reading | contract | anywhere | **PASS** — references above |

No perf-bar step. This phase makes no performance claim.

## Pass / fail

Phase 3 ships when all five steps pass. All five pass as recorded above.

## What a passing run here is NOT evidence of

**Green is evidence about the assertions listed above and nothing wider.** Phase 1's smoketest recorded 33 of 33 passing while a delegate blocked from every screen could still post in a chat room. Every defect that cycle came from adversarial review or from someone checking a claim, none from a test going red.

Specifically not covered:

- **Reading addresses.** Fifteen of them still return data to an incomplete delegate without consulting the required set. Unchanged by this phase; Phase 4 closes it. Every "refused by no data address" result above concerns the four addresses that change data, because those are the only guarded ones today.
- **The sponsor portal.** It carries no gate at all yet. Phase 5 adds the screen gate, Phase 6 the request guard. The exemption is applied there when the gate arrives, not now.
- **Whether a role changed in the database takes effect without signing in again.** The code reads the role from the database rather than from the session token specifically so it does, and the reasoning is recorded at `apps/attendee/lib/onboarding-gate.ts`, but no assertion here exercises a mid-session role change.
- **Google sign-in.** Every account in this run authenticated with email and password.

## Re-run trigger

Re-run this smoketest in full whenever a later phase touches:

- `apps/attendee/lib/onboarding-gate.ts` — the screen gate
- `apps/attendee/lib/require-complete-profile.ts` — the request guard
- `apps/attendee/app/(authenticated)/onboarding/page.tsx` — the checklist page
- `packages/db/src/app-access.ts` — `isWbrStaff`, which decides who is exempt
- `packages/db/src/onboarding-policy.ts` — the required sets the exemption skips

Phase 4 lands on this same branch and touches the request guard, so it re-runs this.
