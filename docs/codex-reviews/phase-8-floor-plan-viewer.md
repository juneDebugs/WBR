# Codex adversarial review — Phase 8, floor-plan data and the participant map viewer

Driven as `codex-companion.mjs adversarial-review --background --scope working-tree "<focus>"`. Working-tree scope, not branch scope: the phase is deliberately uncommitted through the review cycle, so a branch-scoped difference would be empty and every round would review nothing.

**Three rounds, run in full.** Each round was told the earlier rounds' findings by name and that they were fixed, so it would not re-report them. Each round was given exactly four areas. Round 3 was pointed deliberately at what rounds 1 and 2's own fixes introduced, and all three of its findings came from there — none from code the earlier rounds had not already seen.

---

## Getting the review to run at all

The first attempt failed with `Input exceeds the maximum length of 1048576 characters`, and the cause is worth recording because it will recur for anyone reviewing a working tree in this repository.

The runner sends `git diff --binary` plus the contents of every untracked file. Six `dev.db` files are tracked and modified — the handoff lists them as expected and not to be committed — and their encoded binary difference alone was 3.7 MB. Separately, everything under `.claude/` is untracked but not ignored, which adds another 5.2 MB, including a 2.2 MB image and several 100 KB documents.

Resolved without touching any file or any shared configuration:

- `git update-index --assume-unchanged` on the six database files, which took the difference from 3,722,005 bytes to 44,105.
- `.claude/` added to `.git/info/exclude`, which is local-only and never committed, taking the untracked payload from 5.4 MB to 225 KB.

Both are reversed at the end of the review cycle, and the original `.git/info/exclude` was backed up first. **Neither is a fix.** The underlying question — whether `.claude/` should be ignored permanently, given it holds a 2.2 MB image and worktree copies of the database and is never meant to be committed — belongs to the repository's owner and is recorded in the smoketest document's carried findings.

---

## Round 1

**Areas named:** the marker positioning contract in the viewer; the migration script's deliberate omission of one Prisma statement; the seed script and the shared layout module; access control on the new surfaces.

**Verdict:** needs-attention. One high, one medium.

### F-1 — The seed was not atomic and could publish a half-empty venue map

For each map the seed deleted that map's markers, upserted the map row, then inserted the markers back, each as its own statement with retry only around the individual statement. A failure anywhere in the middle — a dropped connection, a constraint error, the process being killed — left a map published with some or none of its markers. The verification at the end detected the mismatch but rolled nothing back.

The severity comes from where this script points: **it targets the deployed database by default.** A delegate would have seen an empty venue map until somebody noticed and ran it again.

**Fixed.** Every write is now built into one `client.batch(statements, 'write')`, which libsql runs inside a single transaction and rolls back entirely on any failure. All 31 statements commit together or not at all, so the cleared state is never observable. Verified by re-running: `31 statements committed as one transaction`, 3 maps and 25 markers, and `pnpm test:floor-plan` still at 57 of 57.

### F-2 — The migration verified names and called that proof

Every statement in the migration is written with `IF NOT EXISTS`, which means a table or index that **already exists in the wrong shape** is left exactly as it is and the statement still succeeds. The verification then read back only column names and index names. A `VenueMap` created by an earlier manual attempt — right columns, no foreign key, or `CASCADE` where `SET NULL` was intended — would have been reported as a clean migration.

This is the defect class this project has recorded most often: a check that also passes in a state it was never meant to pass in.

**Fixed.** The verification now reads `PRAGMA foreign_key_list` for both tables and compares the referenced table, the referenced column and the `ON DELETE` behaviour; and reads `PRAGMA index_list` and `PRAGMA index_info` for all four indexes and compares the covered columns, the uniqueness, and whether the index is partial.

**Proved it can fail, rather than assuming.** A throwaway database was built whose `VenueMap` has all six correct columns and no foreign key at all. The old verification would have passed it. The new one prints `✗ VenueMap.conferenceId has no foreign key` and exits 1.

---

## Round 2

**Areas named:** the browser suite's own assertions; the data layer's filtering, caching and import discipline; the negative-control harness's five gates; the drawing script against the check script.

**Verdict:** needs-attention. Four medium.

### F-3 — The floor-plan cache has no invalidation caller

The participant map read is cached for 300 seconds under the tag `floor-plan`, and nothing in the repository calls `revalidateTag('floor-plan')`.

**Measured before deciding, because the right answer depended on it.** This repository's established pattern is that the writer invalidates: `apps/web` calls `revalidateTag('speakers')` and `revalidateTag('chat')` when it writes, and posts a tag to the participant app's `/api/revalidate` address for that app's caches. The mechanism exists and is used.

**Nothing writes floor-plan data yet.** The maps and markers are seeded; the organizer's upload and pin-placement tools are Phases 10 and 11. So there is nothing stale today, and removing the cache would diverge from the established pattern for no benefit.

**Recorded as a required criterion on the phases where the writes first exist**, rather than fixed here: added to Phase 10's acceptance criteria, and noted against Phase 11's "a saved pin appears in the participant viewer" criterion, where the trap is sharpest — dropping a pin and watching it appear proves nothing unless the write invalidates the tag, because it may have appeared only because the cache happened to expire. Also recorded at the cache's own definition in the code.

### F-4 — The drawing script and the seed could disagree about which companies exist

The whole point of the shared layout module is that a marker cannot end up beside its stand instead of on it. But the drawing script read every company carrying a booth number regardless of conference, while the seed read only the active conference's. With one conference in the database the two agreed by luck. With a second, the drawn hall could show stands no marker points at, or shift the stand order out from under the markers.

**Fixed.** The drawing script now resolves the single active conference and uses the identical `WHERE conferenceId = ? AND boothNumber IS NOT NULL ... ORDER BY boothNumber ASC` query, and exits with a clear message if there is no active conference.

### F-5 — The geometry rules were percentage proxies that did not correspond to a marker

`scripts/test-floor-plan.mjs` enforced a 2% margin from the edge and a 4-percentage-point gap between marker centres. On a 390-pixel phone the picture is about 366 pixels wide, so 2% is roughly 7 pixels against a marker half-width of 22, and 4 points is about 15 pixels against a 44-pixel tap target. Data could satisfy both rules and still show a clipped or stacked marker.

**Fixed by moving the authority to where the pixels are.** The browser check now measures, at the smallest supported screen, that every marker sits wholly within the picture and that no two marker centres are closer than one tap target. The percentage rules are kept as a first filter that fails fast without a browser, and the file now says that is all they are.

**The seeded layout satisfies the stricter rules as they stand** — both new assertions passed on the first run. The rules were lax; the data was never wrong.

### F-6 — The control harness could validate a stale server

`stop_server` killed only the first process returned by `lsof`, and the readiness check only asked whether `/login` answered 200. With a second process holding the port, the new server would die with an address-in-use error and the readiness check would be satisfied by the **old** build. A control judged against stale code can even match its predicted failure count and be recorded as a pass for entirely the wrong reason.

**Fixed.** Every listener on the port is killed, retried up to three times, and the port is proved free before the build starts; the started process is recorded and checked to be alive afterwards.

---

## Round 3

**Areas named, all four aimed at what the earlier fixes introduced:** the new batch transaction; the now-stricter migration verification, where the risk has inverted toward false failures; the new real-pixel assertions; the hardened harness.

**Verdict:** needs-attention. Two medium, one low. **All three came from round 2's own fixes** — which is exactly what this round exists for.

### F-7 — The new containment rule ignored the labels

Round 2's fix asserted that every marker sits wholly within the picture, measuring the marker button's rectangle. But a room label is absolutely positioned **outside** that rectangle on purpose, so that it cannot shift the marker's centre. A room label hanging off the bottom of the picture would have passed the new check, and step 7 only sampled the first label for visibility.

**Fixed.** `measurePins` now returns each marker's label rectangle as well, and the label bounds are asserted per map inside the switching step.

**Placed where it means something.** The obvious spot — beside the marker containment check — is wrong: that step runs on the exhibit hall, which carries booth markers only, so a label assertion there would have passed because there was nothing to measure. It runs per map in the switching loop instead, where the two room maps are actually on screen, and it also asserts that the number of measurable label boxes equals the number of room markers stored for that map.

Both room maps passed on the first run.

### F-8 — The harness proved the wrapper was alive, not the server

Round 2's fix recorded `$!` from `nohup npx next start`. That is the `npx` wrapper, not the Next process serving traffic, so `kill -0` on it did not prove the listener was the build just made.

**Fixed.** After the readiness check, the process actually holding the port is looked up and its parent chain is walked; the run fails unless the recorded process appears in it, and the owning pair is printed so a reader can see which process served the run.

### F-9 — Ambiguous result output would have been misread (low)

`suite_failures` printed every match of the result line. A suite that somehow reported twice would have handed back two numbers, and the caller's numeric comparison on that string would have misbehaved — in the very gate whose job is to prove a control failed by the predicted amount.

**Fixed.** Exactly one result line is now required; anything else returns nothing, which fails gate 4 loudly rather than quietly.

---

---

# Second cycle — pinch-zoom and pan (finding F-9)

After the phase was committed, an independent third-opinion pass found that the map is unreadable on a phone and that 6 of 15 room labels sit on top of something else there. The remedy chosen was zoom and pan with the markers held at a constant size on screen. That work got its own three rounds.

**Every round found something, and rounds 2 and 3 found only things the previous round's fixes had introduced.**

## Round 1

**Areas:** the transform arithmetic; the pointer state machine; how zoom interacts with the rest of the phase; the new assertions.

### Z-1 — A real finger that leaves the window loses the gesture

The listeners were installed on the window and never captured the pointer, while `pointerleave` was treated as a lift. A real finger crossing the edge of a clipped window stops delivering events to it, so a drag or pinch would die half-way.

**The reason no check caught it is the important part.** The browser suite dispatches its pointer events straight at the window whatever the coordinates, so it followed a path a real finger never takes — a check passing while real input fails.

**Fixed**, then the fix caused Z-3 below. Pointers are captured, `lostpointercapture` cleans up, `pointerleave` is no longer a lift, and the effect clears all gesture state on teardown.

### Z-2 — The window kept the previous map's shape

The window's proportions came only from the picture's load event. A picture already in the browser's cache can finish loading before the component attaches its handler, so the event never arrives and the window keeps the previous map's shape — stretching the picture and feeding a wrong height to the pan limit.

Invisible with three identically-shaped maps, and live the moment Phase 10 accepts an upload of any shape.

**Fixed, and made testable.** The picture is now asked directly whenever the map changes, which covers the cached case. And **one seeded map is now drawn 1600×1400 while the other two are 1600×1200**, with an assertion that the window takes each picture's shape and a further assertion that the maps are not all the same shape — without which the first assertion is satisfied by three identical pictures and proves nothing.

## Round 2

**Areas, all aimed at round 1's fixes.**

### Z-3 — Capturing the pointer stole taps from the markers *(high)*

The markers are button elements inside the captured window, and tapping a booth marker is the whole of Phase 9. Under pointer capture the click is retargeted to the capturing element, so it never reaches the button. There was also no movement threshold, so a single pixel of wobble during a tap entered the drag path.

**Fixed.** Capture is now deferred to the moment a gesture becomes a real drag — beyond an 8-pixel threshold — or a second finger arrives. A tap never reaches that point, so a tap is never intercepted. A new assertion taps a marker and requires it to activate, and drags from a marker and requires it not to.

### Z-4 — A differently-shaped map was stretched until it loaded

Round 1's fix corrected the window after load, but the picture was still forced to the window's height in the meantime. **Fixed** by letting the picture decide the layer's height, so it is never distorted.

### Z-5 — The collision script hard-coded the old picture size

The third-opinion collision script converted the drawn title block as if every picture were 1600×1200. With one map now a different height, its top sits at a different percentage, and a label colliding in the band between the two would have been reported as clear — in the script whose whole claim is that it tests against the shapes actually drawn. **Fixed** by deriving it per map.

## Round 3

**Areas, all aimed at round 2's fixes.**

### Z-6 — The map could collapse before its picture had a size

Round 2's fix moved height responsibility to the picture. A picture that has not decoded has no height, so the layer around it collapses and every marker's percentage resolves against nothing — a cold map switch would briefly show a blank window with the markers piled along the top.

**Fixed** by giving the picture a shape to occupy before it decodes, from the same value the window uses. Storing each map's dimensions alongside it would be exact on the first frame; that is recorded for Phase 10, where uploads make the dimensions worth keeping anyway.

### Z-7 — My drag-from-marker assertion could pass without proving anything

It accepted "the map is at fit-to-width" as success. At fit-to-width the clamp deliberately allows no panning, so the check passed whatever the drag path did — it only ever proved that no click fired.

**Fixed**, and fixing it immediately failed for a third reason worth recording: after zooming, the marker it chose to drag from sat at x = −17 while the window began at x = 12, so the press landed on the page behind the map. The assertion was right; the test was picking an off-screen marker. It now picks one comfortably inside the window.

## What this cycle cost and returned

Seven findings. **Not one was a defect a delegate would have met on the committed code** — every one was in work added during this cycle, and rounds 2 and 3 found only what the previous round's fixes introduced. Two of them, Z-3 and Z-6, would have shipped a map that looked correct in every automated check and failed under a real thumb.

The standing rule to run all three rounds even when one looks skippable earned itself twice here.

## What the review cost and returned

Nine findings across three rounds, none of them a defect a delegate would have met today, and all of them defects in *evidence* or in scripts that touch the deployed database:

- **Round 1** found the one genuinely serious item: a seed that could half-publish a venue map on the deployed database.
- **Round 2** found that two artefacts which are supposed to be generated from one source were reading two different sets, and that the geometry rules were weaker than their wording.
- **Round 3** justified the standing rule that all three rounds run even when one looks skippable: every one of its findings was in a fix the earlier rounds had produced, and one of them — the label containment gap — would have left the phase claiming a containment guarantee it did not have.

**Predictions were re-derived before re-running the controls, not adopted afterwards.** Adding the label assertions changed what two of the four controls should break. Control 1 was raised from 4 to 6 and control 4 from 2 to 4, with the reasoning written into the script before the run, because a prediction adjusted after seeing the result is not a prediction and the gate it guards would mean nothing.
