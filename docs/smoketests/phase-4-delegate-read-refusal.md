# Phase 4 Smoketest — delegate read refusal, diagnostic endpoint removed

Manual verification path. Both human and AI agents are valid runners. Authored per [`docs/smoketests/CONTRACT.md`](CONTRACT.md); source: [`.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`](../../.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md) § Phase 4, and requirements document [`wbr_onboarding_enforcement_prd_2026_07_30.md`](../../.claude/docs/prds/wbr_onboarding_enforcement_prd_2026_07_30.md) user stories OE 1–8, 31, 32.

**Run date:** 2026-07-30. **Branch:** `onboarding-enforcement-foundation`.

---

## What Phase 4 changed, in one paragraph

Until now, a delegate with an incomplete profile was refused every screen and every request that *changes* data — but every request that *reads* data still answered normally. Someone sitting on the checklist, unable to open a single page, could still retrieve the full attendee directory, the conference agenda, the speaker list, and the messages inside a chat room simply by asking for those addresses directly. All fifteen reading addresses now refuse. A sixteenth was deleted rather than guarded.

**Why this is a requirement and not a tidy-up.** Asked what a person should be stopped from doing before completing their profile, the customer named two things: making meeting requests, and seeing all of the attendees at the event. The first was closed in Phase 1. The second is this.

## The endpoint that was deleted, and why it was not simply guarded

`GET /api/debug` took an email address and a password **from the address bar**, defaulting to the real demonstration credentials, and reported back whether that combination was valid. It then ran the actual sign-in function and returned the account's identifier and role. Any signed-in account could ask it about any other account. Guarding it behind profile completeness would have left that available to every complete delegate. It is deleted.

**It was not unused.** Two committed test scripts called it — `scripts/test-friends-api.mjs` and `scripts/test-home-feed-api.mjs`, both wired to real commands (`pnpm test:friends:api`, `pnpm test:feed:api`) — but only for one thing: a line reading `DB mode: <mode>` telling them which database the running server was using. Both now derive that themselves by applying the same rules as `packages/db/src/client.ts` to the same `apps/attendee/.env.local` the server reads. **One thing is lost, and both scripts say so in a comment:** they now agree with the environment file rather than with the running server, so a server started with a different environment will not be detected.

---

## Enumeration — every layout and every request handler

The plan makes this a deliverable rather than a step, because both of Phase 1's worst defects were missed coverage rather than faulty logic: one route group left ungated, and the entire request surface left ungated. A list beats a remembered sample.

### Layouts (4)

| Layout | State | Why |
|---|---|---|
| `app/(authenticated)/(app)/layout.tsx` | **gated** | the tabbed sections |
| `app/(authenticated)/(fullscreen)/layout.tsx` | **gated** | the chat room, its own route group — the one left open in Phase 1 |
| `app/(authenticated)/layout.tsx` | **deliberately not gated** | the parent of both groups **and** of the checklist. Gating here would redirect the checklist to itself |
| `app/layout.tsx` | **deliberately not gated** | the root shell, wraps the sign-in page too |

**Adding a new authenticated route group? Call `enforceOnboardingGate()` from its layout.** Nothing at the framework level will remind you.

### Request handlers (26 files, 15 reading and 18 changing)

| File | Methods | State |
|---|---|---|
| `/auth/[...nextauth]/route.ts` | (NextAuth) | **deliberately exempt** — the sign-in machinery; no session exists yet |
| `/login/route.ts` | POST | **deliberately exempt** — sign-in; no session exists yet |
| `/profile/route.ts` | PATCH | **deliberately exempt** — the checklist saves through it. Guarding it traps every incomplete participant permanently |
| `/revalidate/route.ts` | POST | **deliberately exempt** — a shared secret authenticates it, not a person; there is no profile to consult |
| `/debug/route.ts` | GET | **DELETED** |
| `/chat/global/route.ts` | GET, POST | guarded |
| `/chat/rooms/route.ts` | GET, POST | guarded |
| `/chat/rooms/[roomId]/messages/route.ts` | GET, POST | guarded |
| `/data/chat/route.ts` | GET | guarded |
| `/data/home/route.ts` | GET | guarded |
| `/data/meetings/route.ts` | GET | guarded |
| `/data/my-schedule/route.ts` | GET | guarded |
| `/data/people/route.ts` | GET | guarded |
| `/data/schedule/route.ts` | GET | guarded |
| `/data/setup/route.ts` | GET | guarded |
| `/data/speakers/route.ts` | GET | guarded |
| `/feed/[messageId]/comments/route.ts` | GET, POST | guarded |
| `/feed/[messageId]/like/route.ts` | POST | guarded |
| `/friend/[userId]/route.ts` | GET, POST | guarded |
| `/meeting-requests/decline/route.ts` | POST | guarded |
| `/meetings/[id]/route.ts` | GET, PATCH | guarded |
| `/people/route.ts` | GET | guarded |
| `/posts/[postId]/like/route.ts` | POST | guarded |
| `/push-token/route.ts` | POST | guarded |
| `/sessions/[id]/bookmark/route.ts` | POST | guarded |
| `/setup/blackout/route.ts` | POST, DELETE | guarded |
| `/setup/meeting/route.ts` | POST, DELETE | guarded |

Every file is accounted for: 22 guarded, 4 deliberately exempt, 1 deleted.

Reproduce this table with:

```bash
find apps/attendee/app -name "layout.tsx" | sort | while read -r f; do
  grep -q "enforceOnboardingGate" "$f" && echo "GATED $f" || echo "not gated $f"; done
find apps/attendee/app/api -name "route.ts" | sort | while read -r f; do
  grep -q "requireCompleteProfile" "$f" && echo "guarded $f" || echo "EXEMPT $f"; done
```

---

## Prerequisites for the runner

- **A local production build.** The plan requires this phase be demonstrated on one, not only against a development server: `pnpm --filter attendee build && pnpm --filter attendee start`.
- Kill any server already on port 3001 first. A server started before the change serves stale code and produces a pass that means nothing.
- `apps/attendee/.env.local` with an **absolute** `file:/…` `DATABASE_URL` and `NEXTAUTH_SECRET`.
- Playwright with Chromium.
- If the type check reports errors naming files under `.next/`, clear that directory — deleting a route leaves a stale generated type behind. `rm -rf apps/attendee/.next/types`.

## Steps

### Step 1 — All fifteen reading addresses, both directions [contract, tier C]

**Verifies:** plan ACs 1 through 6 and the removal, in one run.

```bash
lsof -ti:3001 | xargs -r kill
pnpm --filter attendee build && pnpm --filter attendee start &
node docs/smoketests/playwright/phase-4-delegate-read-refusal.mjs
```

- [x] Run the script.
  - **Pass:** `Results: 38 passed, 0 failed`, exit 0.
  - **Fail:** any assertion fails.

**Result: PASS — 38 passed, 0 failed** (re-run after the adversarial review's fixture change; same count).

**How the refusal is identified, and why it matters.** Several of these addresses answer 403 for their own reasons — reading a chat room you are not a member of, for one. Asserting a bare "403 while incomplete, not 403 when complete" would pass for the wrong reason on those. Every check looks for the onboarding refusal specifically: status 403 **and** a body carrying `onboardingRequired`. That is also what makes "every refusal carries the same body shape" a real assertion rather than a restatement of itself.

| Address | Incomplete | Complete |
|---|---|---|
| `/api/data/people` | 403 onboardingRequired | 200 |
| `/api/people` | 403 onboardingRequired | 200 |
| `/api/data/schedule` | 403 onboardingRequired | 200 |
| `/api/data/speakers` | 403 onboardingRequired | 200 |
| `/api/data/home` | 403 onboardingRequired | 200 |
| `/api/data/meetings` | 403 onboardingRequired | 200 |
| `/api/data/my-schedule` | 403 onboardingRequired | 200 |
| `/api/data/setup` | 403 onboardingRequired | 200 |
| `/api/data/chat` | 403 onboardingRequired | 200 |
| `/api/chat/rooms` | 403 onboardingRequired | 200 |
| `/api/chat/rooms/<roomId>/messages` | 403 onboardingRequired | 200 |
| `/api/chat/global` | 403 onboardingRequired | 200 |
| `/api/feed/<messageId>/comments` | 403 onboardingRequired | 200 |
| `/api/friend/<userId>` | 403 onboardingRequired | 200 |
| `/api/meetings/<id>` | 403 onboardingRequired | 200 |

**Two of these needed fixtures, and adversarial review is why.** The seeded delegate belongs to no chat room and the database holds no meeting records, so the first version of this script pointed those two addresses at an identifier the delegate had no claim to. The refused direction was fine either way — the guard runs before the handler ever reads the identifier — but the released direction then passed on a membership refusal and a not-found. "Not the onboarding refusal" is not the same as "serves the delegate normally", and the plan's criterion is the second one: over-blocking ruled out.

The run now creates what the seed lacks — a chat-room membership and a meeting the delegate is part of — asserts a real 200 on both, and removes them. Verified afterwards by direct query: zero fixture rows left in either table.

Also covered in the same run:

- The checklist rendered through a real page load and showed its heading, "Complete your profile" — not a blank screen behind a normal 200.
- `PATCH /api/profile` returned 200 while all fifteen refused, so the delegate can still complete the required set and get out.
- Clearing the solutions multi-select to an empty list refused all fifteen again on the next fresh request — the gate consults the required set, not a one-time marker.
- `/api/debug` returned 404, its response carried none of the old diagnostic output, and sign-in still works without it.

### Step 2 — Earlier phases still hold [contract, tier C]

```bash
node docs/smoketests/playwright/phase-3-person-based-gate-exemption.mjs
node docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs
pnpm test:onboarding-policy
```

- [x] Re-run every earlier check on this branch.

**Result: PASS.** Phase 3 — 57 passed, 0 failed. Phase 1 — 53 passed, 0 failed, script still unmodified. Phase 2 module checks — 44 passed, 0 failed.

### Step 3 — Type check [contract]

- [x] `pnpm typecheck`, then each app on its own.

**Result: PASS.** `apps/web`, `apps/sponsor`, `apps/meetings` clean; `apps/attendee` shows only the documented pre-existing `BottomNav.tsx(40,101)` tuple-index error.

Deleting a route leaves a stale generated type file behind that names the removed route. Clearing `apps/attendee/.next/types` removes those; they are gitignored build output.

---

## A defect in this smoketest, found and fixed during the run

The first version of Step 1's removal check searched the response for the words `verifyPassword`, `authorize` and `DB mode`. It reported a leak. There was none: `authorize` matched inside `"unauthorized":"$undefined"`, part of the standard not-found page payload. The check now looks for the strings the deleted endpoint actually emitted — `DB mode: `, `verifyPassword: `, `INLINE authorize`, `ACTUAL authorize` — and passes.

Worth recording because it is the failure mode the whole cycle guards against, running in the opposite direction: a check that claims a problem where there is none costs the same investigation as one that misses a real problem.

---

## Step summary

| Step | Category | Environment | Status |
|---|---|---|---|
| 1. Fifteen reading addresses, both directions, plus removal | contract | tier C — local production build | **PASS** — 38/38 |
| 2. Phases 1, 2 and 3 still hold | contract | tier C — local production build | **PASS** — 57/57, 53/53, 44/44 |
| 3. Type check | contract | anywhere | **PASS** — only the documented pre-existing error |

No perf-bar step. This phase adds one database read to handlers that already perform several; no performance claim is made and none is measured.

## Pass / fail

Phase 4 ships when all three steps pass. All three pass as recorded above.

## What a passing run here is NOT evidence of

**Green is evidence about the assertions listed above and nothing wider.** Phase 1's smoketest recorded 33 of 33 passing while a delegate blocked from every screen could still post in a chat room, and 48 of 48 while a client-side crash was reachable. Every defect that cycle came from adversarial review or from someone checking a claim, none from a test going red.

Specifically not covered:

- **The sponsor portal.** It carries no gate at all. Phase 5 adds the screen gate, Phase 6 the request guard. Its buyer directory still returns 2,527 people with company, job title, biography, company size, annual revenue and what each is seeking, to any signed-in sponsor account.
- **A deployed environment.** Every result above is from a local production build. The plan's four-tier model puts a Vercel preview above this; the sponsor phase has a step that *must* run there because of a shared-cache question, and this one does not.
- **Whether any screen still requests a now-refused address and mishandles the refusal.** Background prefetching of eight of these addresses renders only inside the gated route group, so it never runs for a blocked delegate, and the offline cache excludes `/api/` paths outright — both were checked by reading, not by exercising a client that receives a 403.

## Re-run trigger

Re-run this smoketest in full whenever a later phase touches:

- any file under `apps/attendee/app/api/` — the enumeration above goes stale the moment a handler is added
- `apps/attendee/lib/require-complete-profile.ts` — the guard itself
- `apps/attendee/lib/onboarding-gate.ts` — the screen gate
- `packages/db/src/onboarding-policy.ts` — the required set the guard consults
- `scripts/test-friends-api.mjs` or `scripts/test-home-feed-api.mjs` — they no longer ask the server which database it uses
