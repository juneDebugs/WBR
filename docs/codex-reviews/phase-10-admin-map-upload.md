# Phase 10 — Codex adversarial review log

**Subject:** the organizer's map upload — an admin-app screen where an organizer uploads a floor-plan picture as JPG or PNG, sets the order delegates switch through the maps in, and deletes a map; the uploaded picture served from its own address; and cross-app cache invalidation so a change reaches a delegate rather than waiting out a five-minute cache.

**Rounds:** 3 of a cap of 3, all run. **Scope:** working tree. **Date:** 2026-08-02.

**Nine findings resolved** — eight from the three rounds, one from a negative control. **Plus five negative controls, all caught as predicted.**

**A fourth pass was run on 2026-08-03**, independent of the three rounds and not part of the cap. It re-verified seven of the nine findings against the running programs, established that two cannot be verified on this machine, and found **six assertions in the Phase 10 suite that cannot fail**. That pass is § The independent pass below, and its result is the most consequential thing in this log.

**The review workaround is STILL APPLIED and must be reversed before any commit.** Unlike the Phase 9 log, this one does not end with it restored. The review tool refuses inputs over one megabyte, so `git update-index --assume-unchanged` was applied to six `dev.db` files, `apps/attendee/public/sw.js` and `.claude/settings.local.json`, and the lines `.claude/` and `.vscode/` were appended to `.git/info/exclude`. Reverse with:

```
git update-index --no-assume-unchanged \
  apps/attendee/dev.db apps/meetings/dev.db apps/sponsor/dev.db \
  apps/web/dev.db packages/db/dev.db packages/db/prisma/dev.db \
  apps/attendee/public/sw.js .claude/settings.local.json
```

then remove the trailing `.claude/` and `.vscode/` lines from `.git/info/exclude`. Verify with `git ls-files -v | grep '^h'` returning nothing. **A commit made without this silently omits files.**

---

## Round 1 — the four areas the phase actually changed

Areas named: the picture-serving address; the cross-app cache-invalidation route; the upload handler's position allocation; the environment and documentation surface.

### R1-a [high] — the picture address served any conference's map

`apps/attendee/app/api/data/map/[id]/image`. The address looked up a map by its identifier alone. An organizer or delegate holding an identifier from a previous conference could read that conference's floor plan, which is the venue layout of an event they may have no relationship to.

**Fixed.** The lookup is scoped to the active conference, and a map outside it answers exactly as a map that does not exist — 404 rather than 403, so the address does not confirm that an identifier is real.

Two assertions: the refusal, and that the refusal actually withheld the bytes rather than merely returning a non-200.

### R1-b [high] — the cache-invalidation route failed open when no secret was configured

`apps/attendee/app/api/revalidate/route.ts`. The whole of the authentication was:

```
if (secret !== process.env.NEXTAUTH_SECRET) return 401
```

With that environment variable unset, a body carrying no secret makes this `undefined !== undefined`, which is false — so the request passed and **any caller could invalidate any cache tag.** Harmless for as long as the participant app's middleware refused everyone before the route ran, and a hole the moment finding F-17's exemption landed in this same phase. The two changes were safe separately and unsafe together.

**Fixed.** The route now refuses everything when no secret is configured, and logs why, so an operator facing a stale cache has a reason rather than silence. The comparison also checks type and emptiness before comparing, so a missing key, a null or a non-string can never coincide with the expected value.

**The three assertions written for this cannot fail. See § The independent pass.**

### R1-c [medium] — concurrent uploads raced on the unique switch position

`apps/web/app/api/floor-plan/maps/route.ts`. A new map goes on the end, which means reading the highest position and then inserting one past it — two statements. Two uploads at once both read the same maximum and both insert it. `VenueMap` carries a unique constraint on conference and position, so the database rejects the second, **throwing away a legitimate upload behind an unhandled error** rather than anything an organizer could act on.

**Fixed** by retrying up to five times; each attempt re-reads, so the second organizer lands one place further along. Retried rather than locked because SQLite has no row-level lock to take here.

**The two assertions written for this cannot fail on this database. See § The independent pass.**

### R1-d [low] — the cross-app setting was documented in one app and not the other

`ATTENDEE_APP_URL` appeared in no example environment file. Finding F-16 had already established it was set on no deployed project; the review added that a person setting up the repository had nothing telling them it existed.

**Fixed.** Documented in `apps/web/.env.local.example` and `apps/sponsor/.env.local.example`, and the admin app's README correction was written in place with the old wording quoted so a reader can see what changed rather than wondering whether the entry is current.

---

## Round 2 — the enforcement boundary and the quieter ordering race

Round 1's four fixes were declared and excluded. Areas named: whether the screen's permission check is an enforcement boundary or only a presentation one; the position allocation again, hunted for a case retrying cannot answer; the upload handler's refusal messages; the delete path's scoping.

### R2-a [high] — the permission key guarded the screen and not the addresses

`apps/web/app/api/floor-plan/maps/route.ts` and `maps/[id]/route.ts` checked only that the caller held one of the three elevated roles. The screen is guarded by the permission key `floorPlan`, added by this phase, but the addresses were not. **A role with the floor-plan permission deliberately switched off could still upload, reorder and delete by calling the addresses directly — including deleting a map, which cascades its markers away.**

A hidden screen is not an enforcement boundary. Whoever revoked that permission had a reason, and the product ignored it.

**Fixed.** All three addresses now consult `roleHasPermission(role, 'floorPlan')` after the role check, matching every other guard in the app, including its unconditional pass for the administrator role.

Seven assertions, and two of them matter more than the refusals: that the refusals **changed nothing in the database**, and that the revoked-permission row is removed again afterwards — that table was empty before the run, and a row left behind changes how every later permission check resolves, which is the whole point of finding F-18.

**The permission must be revoked through the app's own save path, not by writing the row.** The first version of this check inserted the row directly. Role permissions are read through a cache only the save path clears, so the app kept serving the previous, more permissive answer — the delete succeeded, and the exhibit hall and its ten markers were destroyed. Twice, because it was re-run before being fixed. **Everything destructive in that suite now targets rows it created**, and where it cannot create one it reports a failure rather than aiming at a seeded row.

### R2-b [medium] — a delete committing between the read and the insert left a permanent hole

The quieter half of R1-c, and retrying cannot answer it. Deleting a map closes the gap it leaves, renumbering the remaining maps **downward**. So a delete committing between an upload's read of the maximum and its insert leaves the insert using a maximum that no longer exists: positions 1, 2, 3 become 1, 2, and the insert still writes 4. **No constraint is violated, so no retry fires**, and the order carries a hole every later upload builds on.

**Fixed** by doing the create and a full renumber to 1..n as one transaction, so contiguity is restored rather than assumed.

**The assertion written for this cannot fail on this database. See § The independent pass.**

---

## Round 3 — pointed at what rounds 1 and 2's own fixes introduced

The earlier rounds' repairs are the least-reviewed code in the change, so this round attacked them directly: the conference scoping, the permission checks, and the connection register added for the live update. This is the same technique that produced Phase 9's highest-severity finding, and it worked again.

### R3-a [high] — round 1 fixed the conference-scoped read and left the write

`apps/web/app/api/floor-plan/maps/[id]/route.ts`. R1-a scoped the picture-serving **read** to the active conference. The **delete** was not scoped, and nobody noticed because the two live in different applications and the fix was applied to the one the finding named.

The consequence is worse than the read's. A delete cascades: the map's markers go with it. So an identifier from another conference would have **destroyed that conference's map and every marker on it**, permanently, with a 200 reported to the caller.

**Fixed**, and the shape of the error is recorded rather than only the fix: a fix applied to one of two symmetrical paths is the error that repeats. Both paths now resolve the active conference first and treat anything outside it as absent.

Three assertions: the refusal, the map's survival, and its markers' survival — the last because a 404 with the row already gone would satisfy the first two.

### R3-b [medium] — a stream discarded without an abort event leaked its listener forever

`apps/attendee/lib/floor-plan-events.ts` and `app/api/data/map/stream/`. The live update holds one long-lived connection per delegate on the map screen, registered in a set. Cancellation removed the entry — but a stream discarded **without** an abort event never ran that path, so its entry stayed in the register for the lifetime of the process. Every such connection was written to on every subsequent invalidation, forever.

**Fixed**, and the fix changed a decision made earlier in the phase: the connection count is now **returned** in the response rather than only logged. The earlier reasoning was that a number in a response invites being read as a delivery guarantee. Round 3's observation outweighed it — a leak nobody can count is a leak nobody can test — so the count is returned under a name that contradicts the wrong reading, `listenersOnThisInstance`.

Three assertions: opening screens adds connections, closing them releases every one, and a stream **aborted mid-connection** releases its listener.

---

## The finding a negative control produced

### NC5-a [medium] — the delivery count was returned under the name of the connection count

Found by negative control 5, not by a review round, and recorded here because it is a real defect that was fixed.

`publish()` returns how many listeners it **successfully wrote to**. The route returned that number as `listenersOnThisInstance`. Those two quantities are equal whenever every write succeeds, and differ **exactly when a write fails** — which is the one case a reader of that field would most want to distinguish. The control that broke delivery therefore broke the count as well, so one control was failing two behaviours and the second was invisible.

**Fixed.** `listenerCount()` is called before `publish()` and reads the register's size. The log line now carries both numbers, which is what makes the difference observable at all.

---

## The five negative controls

Each breaks exactly one shipped behaviour, with a failure count predicted in advance and written into the script. `bash docs/smoketests/playwright/phase-10-negative-controls.sh`, roughly half an hour for a full pass; it accepts a substring argument to run one.

| # | Control | Predicted | Caught |
|---|---|---|---|
| 1 | the image address serves any conference's map | 2 | yes |
| 2 | every map is rewritten to the image address, not just uploads | 3 | yes |
| 3 | a PDF is refused without being told what to do instead | 1 | yes |
| 4 | uploading ignores the floor-plan permission | 2 | yes |
| 5 | nothing is pushed to the open connections | 2 | yes |

**All five predictions were correct on the first attempt. Every apparent failure was the measuring apparatus, and there were four of them.** Recorded because the apparatus is now the part to trust least:

- It restarted only the app it broke, so a downed admin app made later runs die early.
- It judged by **counting** failures — comparing two numbers that both contain noise, so a control that genuinely broke three assertions read as two when an unrelated flake failed in the baseline.
- `restore` put source files back **without rebuilding**, so one control's break stayed live through the next three, and their baselines carried three failures that had nothing to do with them.
- One control's substitution stopped matching after an earlier round changed the line it edited, while the driver still exited 0.

**Now:** it rebuilds both apps before each control, compares **which assertions fail by name** using `comm`, ignores any that failed in both runs, and fails the run if the edit did not apply, if nothing started failing, or if the count differs from the prediction — with the note that a prediction adjusted after seeing the result is not a prediction.

**A sixth control was run by hand on 2026-08-03** and is not yet in the script. It removes the cache-invalidation call from `apps/sponsor/app/api/profile/route.ts`. Predicted before running: exactly one assertion fails, `an edit in the SPONSOR PORTAL reaches the viewer with nothing clearing the cache`, while the save assertion keeps passing because the save itself still works. Result: `91 passed, 1 failed`, that assertion by name, detail `after 5039ms the marker still shows the old tagline`. **Adding it to the script is outstanding.**

---

## The independent pass — 2026-08-03

Run after the three rounds, at the project owner's request, as a fourth opinion. Not part of the cap. Its method was to probe the running programs directly rather than read this log, on the grounds that the suite shares its fixtures, helpers and author's assumptions with the code it measures — so a blind spot in the assumption is inherited rather than caught.

Three new scripts, sharing nothing with the Phase 10 suite: `scripts/third-opinion-phase-10-conference-scoping.mjs` (9 assertions), `scripts/third-opinion-phase-10-permission-and-listeners.mjs` (10), `scripts/third-opinion-phase-10-listener-count.mjs` (3). Each finding is checked in **both** directions, because a handler that refused every request would satisfy every scoping and permission assertion in this phase while being useless.

**Seven of the nine findings verified against the running programs:**

| Finding | How |
|---|---|
| R1-a picture address scoping | Refused, bytes withheld, and the same delegate could read an active-conference picture |
| R1-b revalidate fails closed | App booted with the secret hidden: 401 plus the log line. **The suite cannot prove this** |
| R1-d setting documented | Both example files read |
| R2-a permission at the address | Granted → upload 201; revoked → upload, reorder and delete all 403, database unchanged |
| R3-a delete scoping | 404, and the map **and all three markers** survived |
| R3-b listener leak | Count rose by 3 on three map screens, settled back to 0 after the sockets were killed abruptly |
| NC5-a count semantics | One write patched to fail: log read `3 open connection(s), 2 written to successfully` and the field reported **3** |

**Two findings cannot be verified on this machine.** R1-c and R2-b both depend on a timing gap that SQLite does not permit: it allows one writer at a time. Measured — one upload 183 ms, four concurrently 749 ms, a ratio of **4.09**, which is queueing rather than overlapping. Widening the gap deliberately with a 150 ms pause between the read and the insert still produced no collision. **Both fixes stay**, because the deployed environment reads Turso, which is reached over a network by many callers at once and carries no single-writer restriction, so both races are plausible there.

### The six assertions that cannot fail

The pass's main result, and it is larger than any single one of the nine findings.

**Three about the shared secret.** The pre-fix comparison was put back into the route, the app was rebuilt, the hole was confirmed live — a body with no secret answered `HTTP 200` against a copy started with the secret hidden — and the suite then reported `Results: 92 passed, 0 failed` with all three ticked. **The security hole was in the running program and nothing in 92 assertions noticed.** The cause is that the suite talks to an app that has a secret configured, where the unfixed comparison refuses a missing secret exactly as the fixed one does.

**Three about upload ordering.** The retry loop was cut to one attempt and the renumber was deleted from the create transaction. Eight rounds of up to eight simultaneous uploads: nothing lost, no gap, all three still passing — for the SQLite reason above.

**Neither group indicates a defect in the product. Both are defects in the evidence.** Real coverage is **86**, not 92.

**Repaired 2026-08-03.** All six are kept and relabelled so a green line states its own limit, with the measurement recorded in a comment beside each. The secret case is now covered by a new script that starts the app without the setting — `docs/smoketests/playwright/phase-10-secret-fail-closed.sh`, 6 assertions, which answers 401 on the fixed code and 200 on the unfixed one and therefore can fail. The ordering case cannot be covered from a laptop and the labels say so.

### Why three rounds and five controls missed all six

Every one of those eight passes asked whether the **code** was right. None asked whether the **assertions could fail**. Those are different questions, and only the second finds this class of defect. The five controls each break a shipped behaviour and confirm the suite notices — none of them targeted these six paths.

**The lesson for the next phase:** a review round aimed at the test suite, hunting specifically for assertions that pass while measuring nothing, is worth one of the three. Phase 9's round 2 did exactly this and found two such defects; Phase 10's rounds did not, and six survived.

---

## What the rounds cost and what they were worth

Round 3 was pointed at the earlier rounds' own fixes and returned the highest-severity finding of the phase — R3-a, a delete that would have destroyed another conference's map and every marker on it, reachable **because** round 1 had fixed the symmetrical read and stopped there. Second phase running in which that technique produced the worst finding.

Round 1's two high findings were both cases where two individually safe changes were unsafe together: the middleware exemption and the secret comparison, and the position read and the position write.

Round 2's R2-a is the one that would have been most visible to a person: an organizer whose permission had been deliberately revoked could still delete a map and its markers by calling the address.

And the independent pass established that six of the assertions guarding all this cannot fail — which no round had asked about.

## State after the review

| | Before the review | After | After the independent pass |
|---|---|---|---|
| `phase-10-admin-map-upload.mjs` | not yet written | 90 | **92** |
| `phase-10-secret-fail-closed.sh` | — | — | **6** |
| Third-opinion scripts | — | — | **9 + 10 + 3** |
| `phase-8-floor-plan-viewer.mjs` | 93 | 93 | **93**, unchanged |
| `phase-9-booth-company-card.mjs` | 219 | 219 | **219**, unchanged |
| `pnpm test:floor-plan` | 57 | 57 | **57**, unchanged |
| `pnpm test:booth-card` | 178 | 178 | **178**, unchanged |
| `pnpm test:onboarding-policy` | 44 | 44 | **44**, unchanged |
| `phase-10-negative-controls.sh` | — | 5 of 5 | 5 of 5, **a sixth run by hand** |

Phases 8 and 9 holding at 93 and 219 was a **prediction written before any code**: seeded maps keep their stored file paths, so the cache key suffix does not change. Met exactly, and re-checked on 2026-08-03 from builds verified to match their source.

**Outstanding, and neither is optional before a commit:**

1. **The review workaround at the top of this log is still applied.** Reverse it or the commit omits files.
2. **No dry-run with the project owner has happened**, for this phase or any earlier one. That is the release gate.
