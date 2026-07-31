# Codex adversarial review — Phases 2, 3 and 4, onboarding-enforcement foundation

**Branch:** `onboarding-enforcement-foundation`. **Date:** 2026-07-30. **Rounds:** 3 of 3 (the full cap, run even though round 3 found nothing new in the areas rounds 1 and 2 had covered).

Reviewed: the shared completeness policy (Phase 2), the person-based gate exemption (Phase 3), and the delegate read refusal with the diagnostic endpoint removed (Phase 4).

**How this log should be read.** Every finding below is recorded with what was claimed, what testing showed, and what was done. Two of the eight were wrong. That is the point of writing them down rather than acting on each in turn: a review tool produces claims, and a claim is not a verdict until someone runs it.

---

## Round 1 — fail-open paths, the exemption, and coverage

### 1.1 [high] "The request guard checks one identity while some handlers serve another, and the header is spoofable" — **NOT CONFIRMED**

**Claimed.** Handlers using `getUserFromHeaders()` read `x-user-id` from the request. `middleware.ts` writes those values onto the *response* rather than the forwarded request, so a caller could send their own `x-user-id` and receive another person's data — while `requireCompleteProfile()` checked the session instead.

**The mechanism described is real.** `middleware.ts:26` does create the response and then set headers on it; injecting request headers in Next.js requires `NextResponse.next({ request: { headers } })`.

**What testing showed.** Signed in as one delegate against a local production build, four requests to `/api/data/setup`:

| Request | Result |
|---|---|
| no extra header | own data |
| `x-user-id: definitely-not-a-real-user-id` | own data |
| `x-user-id: <another real user's id>` | own data |
| `x-user-role: ORGANIZER` | own data |

The client-supplied headers are ignored entirely. The exploit does not reproduce.

**Kept as an observation, not acted on.** The two identity paths — `getServerSession()` in the guard, `getUserFromHeaders()` in several handlers — genuinely do resolve the caller by different routes. Nothing exploitable follows from that today, but they could drift apart. Recorded here rather than changed, because changing an authentication path on the strength of an unreproduced claim is the wrong trade.

### 1.2 [high] "The screen gate fails open when the session points at a deleted user row" — **CONFIRMED, FIXED**

**Claimed.** `enforceOnboardingGate()` returned when no account row was found, so a session issued before the row was deleted still rendered pages.

**What testing showed.** A throwaway account was created, signed in, and its row deleted while the session cookie was kept:

```
/home     -> 200 (16,340 chars)     /speakers -> 200 (16,154 chars)
/people   -> 200 (16,892 chars)     /schedule -> 200 (15,788 chars)
/chat/new -> 200 (23,695 chars)
/api/data/people -> 403             ← the request guard, for comparison
```

Confirmed. **But narrower than claimed:** searching those pages for the names of real seeded attendees found **zero** in every one. The screens rendered their shell and every data address behind them refused, because Phase 4's request guard already fails closed. That is defence in depth working, not a reason to leave the gate open — a page that queried on the server rather than through those addresses would have leaked.

**Fixed**, and the fix then broke something worse — see 3.0 below.

---

## Round 2 — caching, ordering, and the ripple from a deleted endpoint

Round 2 explicitly found **no** shared-cache bypass and **no** work happening before the guard, including the scheduled-message dispatch in the two chat handlers. Recorded because a negative result from a targeted look is worth as much as a positive one.

### 2.1 [high] "Cached sponsor meetings are authorised from stale session tenancy" — **CONFIRMED, OUT OF SCOPE**

`apps/attendee/app/api/data/meetings/route.ts` keys a cached query on the `sponsorId` carried in the session token. A representative moved between companies keeps the old value until they sign in again.

**Real, and pre-existing.** This is inherent to the session model the project chose deliberately and recorded in `docs/adr/0002-nextauth-jwt-sessions-with-scrypt.md`: session details are fixed when the token is issued. Nothing in Phases 2 to 4 introduced it or made it worse — Phase 4 added a guard in front of the handler and did not touch how it identifies the caller.

**Not fixed here.** Reworking how a cached tenant-scoped query authorises its caller is its own piece of work with its own testing, and doing it inside a branch whose stated purpose is "change no behaviour" then "add one exemption" then "guard reads" would bury it. Raised for the engineer of record to schedule.

### 2.2 [medium] "The admin reminder's behaviour is not actually unchanged" — **CONFIRMED, COMMENT CORRECTED**

The route carried a comment saying its behaviour was unchanged. The shared rules are stricter than the inline ones they replaced: a scalar that is only spaces now counts as absent, a description whose length exceeds 20 only because of surrounding spaces no longer satisfies its item, and a stored solutions list like `[5]` or `[" "]` no longer counts as filled.

Measured across all 20 seeded companies and all nine items, zero rows changed — which is what the smoketest recorded. But "unchanged on the seeded data" is not "unchanged", and a production row carrying one of those values *will* be chased differently.

Every one of those differences is the reminder becoming correct: an exhibitor whose tagline is a single space has not written a tagline. **The code is right; the comment was overstated.** The comment now sets out each difference, says the change is deliberate, and scopes the measurement to the data it was taken on.

### 2.3 [medium] "The scripts can now write to one database and clean up another" — **CONFIRMED, FIXED**

Deleting `/api/debug` removed the only way `scripts/test-friends-api.mjs` and `scripts/test-home-feed-api.mjs` could ask the server which database it was on. They now derive it from the environment file. Both scripts write through HTTP and clean up through a direct database connection, so a mismatch leaves rows behind in the server's database.

**Fixed** with a pre-flight in both scripts that refuses to run unless the two are the same database. Round 3 then showed the first version of that pre-flight was too weak — see 3.2.

---

## Round 3 — the fixes themselves, and the test scripts

Round 3 found **no** way to use the new `?session=invalid` marker to reach anything, and **no** other redirect loop.

### 3.0 The fix for 1.2 introduced an endless redirect — **FOUND BY TESTING THE FIX, FIXED**

Not a Codex finding. Found by following the redirect chain after making the change, which the first check had not done because it used manual redirect handling.

Making the gate redirect to `/login` collided with `middleware.ts`, which sends any request to `/login` carrying a session token back to `/home`. A deleted-row session then bounced forever:

```
/home -> 307   /login -> 307   /home -> 307   /login -> 307   … (never settles)
```

That is worse than the fail-open it replaced. **Fixed** by having the gate redirect to `/login?session=invalid` and having middleware skip its bounce when that marker is present. Re-measured: settles in two hops at a working sign-in form, and a healthy session is still bounced off `/login` exactly as before.

**The lesson, recorded plainly:** the first check used manual redirect handling and reported "307 to /login" as a pass. It was a pass for the assertion written and a failure for the person using the app. A redirect assertion that never follows the redirect is not finished.

### 3.1 [medium] "Phase 4's released direction passes on membership and not-found answers" — **CONFIRMED, FIXED**

Two of the fifteen addresses were exercised with an identifier the delegate had no claim to, because the seeded delegate belongs to no chat room and the database holds no meetings. The refused direction was sound either way — the guard runs before the handler reads the identifier — but the released direction accepted a membership refusal and a not-found as success. The plan's criterion is "serves a complete delegate; over-blocking ruled out", and those two did not show it.

**Fixed.** The run now creates a chat-room membership and a meeting the delegate is part of, asserts a real 200 on both, and removes them. Verified by direct query afterwards: zero fixture rows left.

### 3.2 [medium] "The oracle pre-flight can approve a different database" — **CONFIRMED, FIXED**

The pre-flight added in response to 2.3 compared three seeded values. Two separately seeded copies share them, so it could pass while the databases differed — the exact case it existed to catch.

**Fixed.** It now writes a value only that run could know into the direct connection, reads it back through the running server, and restores the original in a `finally`. A fresh value cannot appear in both unless they are the same database.

---

## Found while reviewing, outside the review's scope

**A committed test script had been failing since Phase 1 merged.** `scripts/test-friends-api.mjs` (wired to `pnpm test:friends:api`) creates two dedicated accounts with no profile fields, so the onboarding gate refuses them — 35 assertions failing with `{"error":"Complete your profile before using the app"}`. Verified pre-existing: `POST /api/friend/[userId]` already carried the guard on `origin/main`. Nothing runs these scripts automatically, so nobody noticed. **Fixed** by giving those accounts the required set on insert, with a comment explaining why. Now passes with zero failures.

**The admin app's health endpoint is worth a look, separately.** `apps/web/app/api/health/route.ts` returns the database address, whether the authentication token is set and how long it is, a user count, and a named person's role and password length. Different app, outside this branch. Not touched, recorded here so it is not lost.

---

## State at the end of the cycle

| Check | Result |
|---|---|
| Phase 4 read refusal | 38 passed, 0 failed |
| Phase 3 person-based exemption | 57 passed, 0 failed |
| Phase 1 gate, script byte-identical to the merged version | 53 passed, 0 failed |
| Phase 2 shared policy module | 44 passed, 0 failed |
| `pnpm test:friends:api` | exit 0, 0 failures |
| `pnpm test:feed:api` | exit 0, 0 failures |
| `pnpm typecheck`, all four apps | clean apart from the documented pre-existing `BottomNav.tsx(40,101)` |

Eight findings across three rounds: five confirmed and fixed, one confirmed and deliberately deferred with a reason, one not reproduced, and one found by testing a fix rather than by the review. Nothing was committed between rounds; the whole cycle ran first, as the workflow requires.
