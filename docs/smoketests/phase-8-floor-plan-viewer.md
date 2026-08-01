# Phase 8 — floor-plan data and the participant map viewer

Shape rule: [`docs/smoketests/CONTRACT.md`](CONTRACT.md). Acceptance criteria: `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md` § Phase 8. Requirements: `.claude/docs/prds/wbr_floor_plan_onboarding_prd_2026_07_21.md`, user stories 17 to 20 and 22, and its finding F-8. Design of record: [`docs/adr/0007-floor-plan-human-authored-pins-over-raster.md`](../adr/0007-floor-plan-human-authored-pins-over-raster.md).

**Every step here is a contract check.** This phase makes no performance claim, so there is no perf-bar step and no tier to declare for one. The run environment is still recorded below, because a contract check against an app that is not running is worth nothing.

---

## What this verifies

| AC | In plain words | Where |
|---|---|---|
| AC-1 | The two record types exist in the shared schema and are seeded for the demonstration venue | Step 1 |
| AC-2 | The map screen renders a seeded map with its markers in the right places, at more than one screen size | Steps 3 and 5 |
| AC-3 | A delegate can switch across the seeded maps in their defined order | Step 7 |
| AC-4 | Room markers render with their labels, visible on screen rather than merely present in the markup | Step 8 |
| AC-5 | Booth markers render as markers with a forgiving tap target | Step 6 |
| AC-6 | This document | — |
| AC-7 | A delegate can zoom and pan the map, and the markers and labels stay a constant size on screen while the picture scales | Steps 10 and 11 |

AC-7 was added after this phase was first committed, from finding F-9. See § The third opinion, and what it found.

Two things are verified that no acceptance criterion asks for, because leaving them out would have shipped a hole: the map screen is behind the onboarding gate like every other section (Step 9), and the address behind it refuses a blocked delegate (Step 10).

---

## The evidence, and its limits

**A green run is evidence about the assertions listed below and nothing wider.** This repository has been burned by the opposite reading repeatedly: Phase 1 passed 33 of 33 while a delegate blocked from every screen could still post in a chat room; Phase 5 passed 68 of 68 while the sponsor checklist could not be submitted in a browser at all.

**This phase's evidence is a real browser, not downloaded markup, and that is not a preference.** Phase 8 draws a picture and puts markers on top of it at positions stored as percentages. A check that matches strings in a response cannot see whether the picture loaded, whether a marker is on its stand or beside it, whether the markers stay put when the screen size changes, or whether a label is visible to a person. Every one of those is asserted here from the browser's own layout.

**The screen is compared against the database, not against a list written into the test.** Every expected map name, marker count, label and position is read from `packages/db/prisma/dev.db` when the run starts. A seed that changes without the screen changing fails here.

**What is NOT covered.** Tapping a booth marker opens a card with the company's details — that is Phase 9 and does not exist. The organizer's own upload and pin-placement tools are Phases 10 and 11. This phase ships the viewer on seeded data, which is exactly the split ADR 0007 records for the 2026-08-11 demonstration.

---

## Prerequisites for the runner

- **Participant app on `http://localhost:3001`, tier C — a production build, not a dev server.** Kill the port first; a server started before your change serves stale code:
  ```
  lsof -ti:3001 | xargs kill -9
  pnpm --filter attendee build
  cd apps/attendee && pnpm start
  ```
- **The schema change, the pictures and the seed must all be applied first**, in this order:
  ```
  node scripts/migrate-floor-plan.mjs --local packages/db/prisma/dev.db
  pnpm db:generate
  node scripts/build-floor-plan-maps.mjs
  node scripts/seed-floor-plan.mjs --local packages/db/prisma/dev.db
  ```
  `pnpm db:generate` is not optional and not cosmetic. The apps read these records through the generated database client, and a client generated before the schema change does not know the record types exist. Phase 13 discarded two sets of measurements taken before an equivalent regeneration.
- **If you re-seed, delete the participant app's cached data reads, or you will be looking at the old map.**
  ```
  rm -rf apps/attendee/.next/cache/fetch-cache
  ```
  Leave `apps/attendee/.next/cache/webpack` alone — that is the build cache, it is 217 MB, and removing it only makes the next build slow.

  This is not a nicety. Measured 2026-08-01 while moving a row of markers: after re-seeding, the database held `Table 7` at `y=76` and the address served `y=82`, and **the stale value survived a full server restart**, because the map read is cached under a tag nothing invalidates and Next persists that cache to disk. Half an hour went into a layout that was already correct. See the note on the cache in § Findings carried out of this phase.
- `apps/attendee/.env.local` with `DATABASE_URL` (absolute `file:` path) and `NEXTAUTH_SECRET`.
- No other app is needed. This phase touches the participant app only.

```
node scripts/test-floor-plan.mjs
node docs/smoketests/playwright/phase-8-floor-plan-viewer.mjs
```

### Why `prisma db push` is not in that list

It refuses to run against this database, and the reason has nothing to do with the floor plan. The schema file declares a plain unique constraint on the exhibiting company's meeting-table number; the database holds that constraint as a *partial* index — applying only to rows where the number is set — because `scripts/migrate-sponsor-tables.mjs` deliberately created it that way in Phase 13. Prisma sees a shape it did not write, warns about possible data loss and demands `--accept-data-loss`.

Forcing that flag would rewrite an earlier phase's index as a silent side effect of this one, so it is not used. Measured 2026-08-01: 0 of 20 companies carry a table number and there are no duplicate pairs, so nothing was ever at risk — the objection is to changing another phase's work invisibly.

`scripts/migrate-floor-plan.mjs` therefore carries the change instead, which is also the route the deployed database has always needed, since `prisma db push` cannot target it at all. Its statements are Prisma's own, taken verbatim from `prisma migrate diff`, so a future push sees these tables as already correct. Verified: after the migration, the only difference Prisma still reports is the pre-existing Phase 13 index.

---

## Step 1 — the schema change and the seed [contract]

**Runner:** `node scripts/test-floor-plan.mjs` (`pnpm test:floor-plan`), 57 assertions.

Covers what a browser flow cannot reach: values that would render wrongly rather than fail.

**Pass criteria, all deterministic:**

- Both tables exist with every column the rest of the run reads. Asserted by name; a query that throws and a query that returns nothing look identical from outside.
- The active conference has 3 or 4 maps, their switch positions are distinct and run 1 to N with no gap, and their names are non-blank and distinct.
- Every map's stored path points at a file that **exists on disk, is over 1000 bytes, and begins with the eight bytes that identify a PNG**. A path alone proves nothing: a map whose file is missing renders as a broken picture with its markers over white space, and every database-only check would still pass.
- Every marker's position is a finite number between 0 and 100, and no seeded marker sits within 2% of an edge where its marker would be clipped.
- No two markers on the same map are closer than 4 percentage points. Two markers on one spot look like one marker, and the one underneath can never be tapped.
- Every room marker names **either a real meeting table or a room the agenda actually uses**, checked against `MEETING_ROOMS` in `packages/db/src/meeting-engine.ts` and against the rooms of seeded sessions. A marker naming a place invented for the map would render perfectly and send a delegate nowhere.
- All nine real meeting tables have a marker, derived from that constant rather than counted by hand.
- There is exactly one booth marker per exhibiting company carrying a booth number, **enumerated, with the expected count derived from the database**. Adding a booth number to a company fails this until the map gains its marker.
- Every stored date is an integer, not the text the column default would write. See § What went wrong while building this.

## Step 2 — a delegate reaches the map from the navigation bar [contract]

**Pass criteria:** a Map item is present in the bottom navigation and visible; tapping it lands on `/map`; the floor-plan screen renders.

## Step 3 — the first map's picture actually loaded [contract]

**Pass criteria:** the picture shown is the first map's stored path; its natural size is **not zero**, which is what separates a map on screen from a broken-image icon with markers floating over it; it is laid out at a usable size; it is described to a screen reader with the map's name; and the marker layer's box matches the picture's box within one pixel.

That last one is the assertion everything else rests on. If the marker layer were larger than the picture, a marker at 50% would sit at the middle of the *box* rather than the middle of the *picture*, and every marker would drift by a different amount at every screen size.

## Step 4 — the markers match the database [contract]

**Pass criteria:** the number of markers on the first map equals the number stored for it; all booth markers are drawn; and the set of company names on screen equals the set in the database, **compared both ways**, so an extra marker fails as loudly as a missing one.

## Step 5 — markers sit where their stored positions say, at three screen sizes [contract]

**Pass criteria:** at 390×844, 768×1024 and 1280×900, every marker's centre is within **2 CSS pixels** of the point its stored percentage names, computed from the picture's own measured box at that size.

This is the assertion that justifies storing positions as percentages at all. The picture is a different physical size at each of the three, and the markers still land.

## Step 6 — booth markers have a forgiving tap target, and none is clipped or stacked [contract]

**Pass criteria:** on a 390-pixel-wide phone, the smallest marker is at least 44 by 44 CSS pixels; every marker sits wholly within the picture rather than hanging off it; and no two marker centres are closer than one tap target apart, so no marker is buried under another and made unreachable.

ADR 0007 accepts a generous target as the price of a marker being a point rather than an area. The last two criteria were added by the adversarial review, which correctly pointed out that the percentage rules in Step 1 are proxies that do not correspond to the size of a marker: 2% of a 366-pixel picture is about 7 pixels, against a marker half-width of 22. These are measured in the pixels a thumb actually meets. The seeded layout satisfied both on the first run, so the rules were lax but the data was never wrong.

## Step 7 — switching between the maps, in their stored order [contract]

**Pass criteria:** the switcher offers every stored map; its items appear in stored position order; each is labelled with its map's name; and selecting each one shows that map's own picture, decoded, with exactly its own markers and its own room labels.

**Also, per map: every room marker has a measurable label box, and every room label stays within the picture at phone width.** A room label is positioned outside its marker's box on purpose, so that it cannot shift the marker's centre — which means Step 6's containment rule says nothing about it, and a label hanging off the picture would have passed. Raised by the adversarial review. It is asserted here rather than beside Step 6 because the first map is the exhibit hall and carries booth markers only: asserting label bounds there would have passed because there was nothing to measure.

## Step 8 — room labels are visible on screen [contract]

**Pass criteria:** a room label element exists, **occupies real space** (a non-null box with width and height above zero), shows text, and reports as visible.

Present-in-the-markup is deliberately not accepted as the criterion. This project has twice recorded assertions satisfied by text that was in the response and never on screen.

## Step 9 — an incomplete delegate cannot reach the map [contract]

**Pass criteria:** a delegate one required field short who asks for `/map` does not land on `/map`, lands on the checklist, and no map canvas renders for them. The map screen sits inside the gated route group on purpose; it is ordinary participant content, not an exception.

## Step 10 — the map data address is guarded, both directions [contract]

**Pass criteria:** the incomplete delegate is refused at `GET /api/data/map` with `403`; a complete delegate is answered at the same address with `200`; and that answer carries every stored map.

Both directions, because a refusal alone is indistinguishable from a broken request or a dead server.

## Step 10 — the delegate can zoom and pan, and the markers hold their size [contract]

**Pass criteria:** the map opens at fit-to-width with the picture exactly filling its window; the window clips what moves inside it and claims the touch gestures rather than letting the page scroll; a two-finger pinch enlarges the picture; dragging moves it; the map cannot be pinched smaller than fit-to-width, nor dragged away from its window however hard it is shoved; a reset control appears once zoomed, returns the map to fit, and disappears again.

**And, throughout: a marker is the same size on screen after zooming, every marker still sits on its stored position, and markers are still at least 44 by 44.** The size one is the assertion that matters. Scaling the markers along with the picture would magnify the problem finding F-9 describes rather than solve it — a label would cover the same share of the map at every zoom level. Everything else in this step exists to stop that one property being satisfied trivially.

## Step 11 — zooming makes the labels cover less of the map [contract]

**Pass criteria:** on a map that actually carries room labels, a named label covers a smaller share of the map after zooming, **and does so by staying the same width on screen rather than by shrinking.**

This is the step that proves the remedy rather than the mechanism. It is deliberately not folded into Step 10, which runs on the exhibit hall: that map carries booth markers and no room labels at all, so the first version of this check found nothing to measure and was skipped in silence. The map it runs on is chosen by asking the database which one has room markers.

---

## Negative controls

A green suite proves nothing until the suite has been shown to go red. Each control breaks one shipped behaviour, rebuilds, restarts and re-runs, and must be caught **by the number of assertions predicted in advance**. Five gates must all hold: the edit applies, the build succeeds, the app answers, the suite is caught, and it is caught by the predicted amount.

**Runner:** `bash docs/smoketests/playwright/phase-8-negative-controls.sh`. It restores every file and leaves a correct, green build behind, including on failure.

| # | What is broken | Predicted | Caught | Result |
|---|---|---|---|---|
| 1 | The map window regains a border, so the picture no longer fills it | 1 | 1 | caught as predicted |
| 2 | The completeness guard is removed from `GET /api/data/map` | 1 | 1 | caught as predicted |
| 3 | The tap target shrinks from 44 to 24 pixels, marker centre unchanged | 2 | 2 | caught as predicted |
| 4 | Room labels stay in the markup but are hidden from the screen | 5 | 5 | caught as predicted |
| 5 | Markers scale with the map, so zooming stops decluttering | 3 | 3 | caught as predicted |
| 6 | The clamp is removed, so the map can be dragged off its own window | 1 | 1 | caught as predicted |
| 7 | The pointer is captured on the way down, stealing taps from the markers | 1 | 1 | caught as predicted |

**Control 7 guards Phase 9's foundation.** Tapping a booth marker is the whole of the next phase, and the first version of the zoom work captured the pointer as it went down — which retargets the click to the window and never lets it reach the marker button inside. Panning is unaffected, so nothing else moves, which is why it is predicted at exactly 1.

Each control also clears `apps/attendee/.next/cache/fetch-cache` with its rebuild, because the map read is cached to disk and survives a restart; without that a control could be judged against a stale answer.

Control 4 is the control for the exact defect class this project has hit twice — an assertion satisfied by text present in the response but never visible.

**Control 5 is the one that guards finding F-9's decision.** It applies the alternative that finding explicitly rejected — markers scaling along with the picture — and the suite has to notice, because that arrangement magnifies the problem along with the map and leaves a label covering the same share of it at every zoom level.

**Control 1 was rewritten when zoom and pan landed, and the reason is worth recording.** It used to pad the marker layer so that it stopped being the picture's box. That edit no longer exists: the layer is sized by the window it sits in and the picture fills it completely, so the two are the same box by construction rather than by care, and no small edit separates them. It now reproduces the exact defect the third opinion found in the first zoom implementation — a border on the window, which sits outside the content box and leaves the picture two pixels narrower than the window it should fill.

**Two predictions were raised before the re-run, not after it.** The adversarial review added label-bounds assertions, which changed what controls 1 and 4 should break: control 1 went from 4 to 6, because padding the layer also pushes the lowest room labels past the picture's bottom edge on both room maps; control 4 went from 2 to 4, because a hidden element reports a zero-sized rectangle at the page origin, which the bounds check correctly counts as outside the picture. Both new figures were written into the script with that reasoning **before** the run and then matched exactly. A prediction adjusted after seeing the result is not a prediction, and the gate it guards would mean nothing.

The harness also proves the run is judging the code it just built: it kills every listener on the port rather than the first, proves the port is free before building, and after the readiness check looks up the process actually holding the port and walks its parent chain to confirm it descends from the process this run started. Each control printed that pair.

The suite was also run against the tree **before the screen existed**: 3 passed, 3 failed — no Map item, no route, no canvas — while still cleaning up both disposable accounts, which is the cleanup path working on the throwing branch as well as the normal one. That is the red half of red-to-green for the screen; Step 1's red half is the same check run before the schema change, which stopped at 16 failures with a clean message rather than a stack trace.

---

## The third opinion, and what it found

After this phase was committed, an independent pass was run against the workspace: sign in through the real form as a **seeded** account rather than a fixture, open the real screen, capture what is on it, and look at it.

**It confirmed the assumption everything else rests on.** Every automated check here compares a marker's rendered position against the position stored for it, and nothing compares that stored position against the stand actually drawn in the picture. The argument that they cannot disagree — both come from `scripts/floor-plan-demo-venue.mjs` — is sound, but it is an argument. The screenshots are the observation: every booth marker sits centred on its own drawn stand, every room dot on its own room.

**It also found a defect that 111 assertions and three rounds of adversarial review missed** — recorded as finding F-9 in the floor-plan requirements document.

The pictures are 1600 pixels wide and are shown at 366 on a phone, so the text drawn into the map renders at about 4.6 pixels and cannot be read. The labels therefore carry the meaning and are sized for a person, which on a 366-pixel picture makes a label about as wide as the room it names. Measured against the drawn shapes: **6 of 15 room labels sat on top of something else at 390 pixels wide, and none did at 768 or 1280.**

No check caught it because the one that came closest — every room label stays within the picture — is satisfied by a label sitting squarely on a different room. The picture's outer rectangle is all the suite knows; the shapes drawn inside it are known only to the drawing module. That assertion was written during this phase's own review cycle, in response to an earlier finding, and carries the same flaw that cycle was hunting.

**The remedy, chosen by the project owner: pinch-zoom and pan, with the markers and labels held at a constant size on screen.** Measured afterwards, at 390 pixels wide: **6 collisions at fit-to-width, 0 once zoomed to 2.5x.** At that zoom the map's own drawn text is legible as well.

**The accepted limit, stated rather than left to be discovered.** At the default fit-to-width view on a phone the labels still overlap exactly as they did. What changed is that a delegate can now do something about it. A clean default would need labels hidden until a zoom threshold, which was rejected against user story 19 — a delegate who must discover a gesture before seeing any room name has not been given labelled rooms.

Two things went wrong in my own work during that pass, both recorded because they are the same class of mistake this project keeps finding:

- **A check of mine reported a pass while measuring nothing.** An idempotency test used double quotes for a string in SQL, so SQLite read it as a column name; both queries errored, both returned empty, and comparing empty to empty printed a tick. Re-run correctly, with a control proving the comparison can report a difference.
- **The first version of the zoom assertions silently skipped a dozen checks.** They were wrapped in a condition on the measurement being available, so when a page error left it empty the assertions neither passed nor failed — they vanished. Replaced with explicit assertions that the measurement exists. The same flaw appeared a second time in the label-share check, which lived on a map with no labels and was skipped in silence; it now runs on a map the database says has room markers.

## What the adversarial review found

Three rounds, run in full, nine findings, all recorded with their fixes and the evidence for each in [`docs/codex-reviews/phase-8-floor-plan-viewer.md`](../codex-reviews/phase-8-floor-plan-viewer.md). The two that mattered most:

- **The seed was not atomic**, and it targets the deployed database by default. A failure part-way through left a map published with some or none of its markers. Every write is now one transaction that commits or rolls back whole.
- **Round 3's findings all came from rounds 1 and 2's own fixes** — including a containment guarantee the phase would otherwise have claimed without having. That is the standing rule earning itself again: run all three rounds even when one looks skippable.

## What went wrong while building this

**The pictures were being redirected to the sign-in page.** `public/maps/` was not in the participant app's middleware exclusion list, so `GET /maps/exhibit-hall.png` without a session cookie answered `307`. A signed-in delegate was unaffected, because their request carries the cookie — which is exactly why this would have survived casual testing and failed for a service-worker prefetch or for Next's image optimiser. Fixed by adding the folder with a trailing slash, following that file's own documented rule. Verified afterwards that `/maps`, `/mapsecret` and `/sponsorship` all still go through the middleware, so the exclusion stayed anchored to the folder.

**A colour token that does not exist.** The screen was first written using `ink-1`. The shared design system defines `ink`, `ink-2` and `ink-3` and no `ink-1`, so five pieces of text would have rendered with no colour at all. Tailwind does not error on an unknown class and no type check would have caught it; it was found by reading `packages/ui/preset.cjs` rather than trusting memory.

**Two assertions failed against working code.** After switching maps, the check read the picture's natural size in the gap between the source changing and the new picture decoding, where that size is legitimately zero. The check waited for the source attribute, which changes on the same tick as the click, rather than for the picture to arrive. Fixed by waiting for the picture to have loaded, and recorded in the script rather than quietly corrected: a check that fails on good code is as useless as one that passes on bad code.

**A rule in my own check script that would pass whatever was put in front of it.** The first draft let a room label escape validation with a prefix character, for "venue features" like a registration desk. That is precisely the defect class this project recorded nine times in one session — a check that also passes in cases it was never meant to. Removed before the check was ever run in that form; every room label now has to name a real meeting table or a real agenda room.

---

## Findings carried out of this phase

**The seed file and the database have drifted apart on booth numbers.** `packages/db/prisma/seed.ts` sets eight booth numbers in `P1` form; the database holds ten in `P-01` form. The seed upserts companies by identifier and its update branch does not write the booth number, so the database values survive a re-seed and the two stay apart. Nothing in `scripts/` writes them either, so the ten current values were set once and are not reproducible from the seed file.

Consequence handled inside this phase: a booth marker stores a company identifier and never a booth number, and the number is read through the relation at display time. Identifiers match exactly and no company row is ever deleted by the seed, so the markers are stable across a re-seed.

Consequence **not** handled and belonging to whoever owns the seed: a database created from scratch today produces eight booth numbers in a different format from the ten a working machine has. The layout code handles any number of stands, so the map still builds — but the demonstration would show eight stands rather than ten.

**The map read is cached for 300 seconds under a tag nothing invalidates, and that is no longer a future risk.** It was raised in adversarial review round 2 as a requirement for Phases 10 and 11, on the reasoning that nothing writes floor-plan data yet. That reasoning was right about delegates and wrong about everyone else.

Measured 2026-08-01 while moving a row of markers up: the database held `Table 7` at `y=76`, the address served `y=82`, and **the stale answer survived a full server restart**, because Next persists that cache to `apps/attendee/.next/cache/fetch-cache`. The browser check failed against a layout that was already correct, and the cause looked like a geometry bug for some time.

Two consequences, and only the first is handled here. Anyone re-seeding must delete that directory — recorded in the prerequisites above. And the requirement already recorded against Phases 10 and 11 is stronger than it was written: an organizer moving a marker will not see it move, and neither will a delegate, until either the tag is invalidated on write or the cache happens to expire.

**Reviewing the working tree in this repository needs two local git settings, and the underlying question belongs to whoever owns the repository.** The adversarial review runner sends the binary difference plus every untracked file, and the first attempt was refused for exceeding a one-megabyte input limit. Two causes, both pre-existing: the six tracked `dev.db` files are modified in every working session and contributed 3.7 MB of encoded binary difference; and everything under `.claude/` is untracked but not ignored, contributing another 5.2 MB, including a 2.2 MB image and several documents over 100 KB.

Worked around locally and reversed afterwards — `git update-index --assume-unchanged` on the six database files, which took the difference to 44 KB, and `.claude/` added to `.git/info/exclude`, which is never committed, taking the untracked payload to 225 KB. The original exclude file was backed up first.

Neither is a fix, and neither is mine to make permanent. `.claude/` holds plans, requirements, handoffs, a 2.2 MB image and worktree copies of the database, and the handoff states plainly that none of it is ever to be committed — which is an argument for ignoring it in the repository rather than in one engineer's local settings. That is the repository owner's call.

**The admin app still excludes static assets from its middleware by file extension.** The participant app's middleware comment records that this was measured as wrong — `/people/anything.png` answered 200 while `/people` redirected — and says `apps/web` has the same weakness and that it is its own change to make. Unchanged by this phase, restated here only because this phase touched the equivalent line in the participant app.

---

## Summary

| Step | Category | Tier | Status |
|---|---|---|---|
| 1 — schema change and seed | contract | n/a | 57 of 57 |
| 2 — reaching the map from the navigation bar | contract | C | pass |
| 3 — the first map's picture loaded | contract | C | pass |
| 4 — markers match the database | contract | C | pass |
| 5 — positions correct at three screen sizes | contract | C | pass |
| 6 — tap target, no clipping, no stacking | contract | C | pass |
| 7 — switching maps in stored order, label bounds per map | contract | C | pass |
| 8 — room labels visible on screen | contract | C | pass |
| 9 — incomplete delegate cannot reach the map | contract | C | pass |
| 10 — data address guarded, both directions | contract | C | pass |
| 11 — zoom and pan, markers hold their size | contract | C | pass |
| 12 — zooming makes labels cover less of the map | contract | C | pass |
| 13 — a tap reaches a marker, a drag does not | contract | C | pass |
| Negative controls | contract | C | 7 of 7 caught as predicted |

Steps 2 to 13 are the single Playwright run: **93 of 93**. It was 48 when the phase was first committed, 54 after the adversarial review added the real-pixel containment and separation assertions and the per-map label-bounds assertions, and 93 after finding F-9 added zoom and pan, the per-map window-shape checks, and the marker-tap checks that guard Phase 9.

**The human gate is a dry-run with the project owner and it has not happened for this phase.** Automated checks passing is not that gate.
