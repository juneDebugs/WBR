# Phase 11 — Codex adversarial review log

**Subject:** the organizer places markers on a venue map — an admin-app editor where a click on the map picture drops a booth or room marker, markers can be moved and deleted, and a saved marker reaches the participant map screen. Includes finding **F-19**: before this phase the admin app could display no map picture at all, so the picture address is part of the phase.

**Rounds:** 6, run as **two cycles of three**. **Scope:** working tree. **Dates:** 2026-08-03 and
2026-08-03/04.

The cap is three rounds per cycle and both cycles ran to it. The second cycle was requested before the
commit, and it was justified on its own merits rather than as repetition: three changes in
the working tree had landed after round 3 finished and had never been examined. See § SECOND CYCLE for what
those were and how that was established.

**Totals across both cycles: 16 findings, all fixed. 13 negative controls, each with its prediction written
before the run.** The suite ended at **80 assertions, 0 failed**. Phase 8 holds at 93 and Phase 9 at 219.

---

## THE REVIEW WORKAROUND IS APPLIED. REVERSE IT BEFORE ANY COMMIT.

The review tool refuses inputs over 1,048,576 characters, and the working tree carries six copies of
the local database at roughly 4.4 MB each. Measured: the first launch of round 1 answered
`Input exceeds the maximum length of 1048576 characters.`

So `git update-index --assume-unchanged` is applied to eight files, and two lines are appended to
`.git/info/exclude`. **A commit made without reversing this silently omits files.**

Reverse with:

```
git update-index --no-assume-unchanged \
  apps/attendee/dev.db apps/meetings/dev.db apps/sponsor/dev.db \
  apps/web/dev.db packages/db/dev.db packages/db/prisma/dev.db \
  apps/attendee/public/sw.js .claude/settings.local.json
```

then remove the trailing `.claude/` and `.vscode/` lines from `.git/info/exclude`.

Verify with `git ls-files -v | grep '^h'` returning nothing, and `tail -3 .git/info/exclude` showing
neither line.

**This section is written before the first round runs, not after the last one.** Phase 10's log
recorded the same workaround only at the end, and the handoff for this phase had to carry it forward
as a blocker.

---

## Round 1 — the four areas this phase actually changed

Areas named in the prompt: the picture address; the marker validation module and the create address;
the move, edit and delete address and its shared `resolve()` helper; the organizer screen's client
state and coordinate arithmetic.

The prompt also listed what Phase 10 already found and fixed, so the round would not re-report it, and
named three known non-defects: the pre-existing tuple-index type error, the pre-existing brief
double-render of dashboard screens, and the absence of an ESLint config.

**Verdict: needs-attention. Three findings, one high and two medium. All three accepted and fixed, plus
a fourth found by symmetry that the round did not name.**

### R1-a [high] — a local edit shadowed the server permanently

`apps/web/components/FloorPlanClient.tsx`. Marker positions were held in
`pinEdits: Record<string, AdminPin[]>` and read as `pinEdits[map.id] ?? map.pins`. Phase 10 introduced
that local copy for a good reason — waiting for `router.refresh()` left a deleted map row on screen —
but once a map had any local write, **everything the server said about that map afterwards was
ignored, for the rest of the session.**

What an organizer would see: a second organizer adds or deletes a marker and it never appears; the
marker count and the delete confirmation both undercount what exists; and trying to move a marker
somebody else deleted shows an error while leaving the marker drawn and clickable.

**Fixed** by making each override remember the exact props array it was computed from —
`{ basedOn: AdminPin[]; pins: AdminPin[] }` — and using it only while `basedOn === map.pins`. The page
builds a fresh array on every server render, so the first refresh after a write retires the override
and the server wins. Nothing has to be expired or cleaned up: the reconciliation is the comparison.

Also fixed alongside it, because the same finding exposes them: a refusal that means the marker is gone
(404) now clears the selection and reloads, rather than showing a message beside a marker that does not
exist; and a success carrying no marker is no longer read as one, which would have thrown inside a
click handler and left the screen stuck with its busy flag set.

**Negative control run, prediction written first.** With `pinsFor` put back to
`override ? override.pins : map.pins` and the app rebuilt, the prediction was exactly one failure —
the assertion named below — and the other 65 passing. Result: **65 passed, 1 failed**, the failure
being `a marker another organizer adds appears on a screen that has local edits`, with the detail
`markers drawn were ["Local Edit One","Local Edit Two"]`. Restored and back to 66 passed, with the
restored line read back and the build confirmed to match source.

### R1-b [medium] — coordinate validation coerced anything into a position

`apps/web/lib/pin-input.ts`. `readPercent` did `typeof raw === 'number' ? raw : Number(raw)`, and
`Number()` coerces much more than it looks like it does. Every one of these passed validation and
stored a real position the caller never sent as a number:

| sent | stored |
|---|---|
| `null` | `0` |
| `[]` | `0` |
| `""` or `"  "` | `0` |
| `true` | `1` |
| `[50]` | `50` |

So a request with a null position saved a marker in the top-left corner of the map, and the organizer
and every delegate then drew it there. Nothing failed and nothing was logged.

**Fixed:** a position must arrive as an actual JSON number and be finite. Strings are refused rather
than parsed — the browser sends numbers, so accepting `"50"` would widen the contract for no caller
that exists. `-0` is normalised to `0`.

### R1-c [medium] — the write assumed the row still existed

`apps/web/app/api/floor-plan/maps/[id]/pins/[pinId]/route.ts`. `resolve()` proved the marker exists and
belongs to a map in the active conference, then the write used `prisma.pin.update({ where: { id } })`
and `prisma.pin.delete({ where: { id } })`. A row removed between the check and the write throws
Prisma's `P2025`, which surfaces as an unhandled 500 — the organizer is told the app broke rather than
that the marker is gone.

**Fixed** by making both writes carry the full condition `resolve()` checked — `updateMany` and
`deleteMany` on `{ id, venueMapId }` — and answering 404 when the count is zero. There is no exception
to catch and no window between the check and the write. A successful update that cannot be read back
also answers 404, because "gone" is the truthful answer and it is what the screen needs in order to
stop drawing the marker.

**The concurrent version is unreachable on this machine** — SQLite here permits one writer at a time.

**Corrected 2026-08-03 by the negative controls, and the correction matters.** This entry originally
claimed that the sequential case — two deletes of the same marker — is "the same defect" and that the two
404-not-500 assertions cover the fix. **Both claims were wrong.**

`resolve()` looks the marker up and returns 404 for a missing one *before either write is reached*. So the
sequential cases the suite exercises are answered by that guard, not by the conditional write. Control 5 of
the negative controls proved it: with the conditional update removed, **no assertion started failing.** The
control reported `GATE 4 FAILED: no assertion started failing. The suite does not measure this.`

What the two assertions actually check is that a marker which no longer exists answers 404 rather than 500 —
worth having, and true before the fix as well. **The window the conditional write closes is a row
disappearing between `resolve()` and the write, which is a concurrent race and unreachable here**, on the
same footing as Phase 10's two position races.

The controls were retargeted as a pair that says which safeguard does what. See § The negative controls.

### R1-d [medium] — found by symmetry, not named by the round

The create path has the same shape: the checks prove the map and the company exist, then
`prisma.pin.create` assumes they still do. A map or company deleted in between violates a foreign key,
which Prisma reports as `P2003`, unhandled as a 500.

Round 1 named PATCH and DELETE and stopped there. Phase 10's review found a fix applied to one of two
symmetrical paths and missed on the other, and that is the recorded reason for looking at the third
path without being asked. **Fixed:** the foreign-key case is caught and answered 404 with a message
saying what happened and what to do.

### What round 1 cost, and what the suite gained

Seven assertions were added, in section 12 of `phase-11-admin-pin-authoring.mjs`. The suite went from
59 to 66 assertions, all passing, with the admin app rebuilt and the build confirmed to match source
before each measurement.

One of the seven had to be rewritten before it measured anything. It first ran on the primary fixture
map, which by section 12 is covered in markers — including two with 60-character names, which are wide
— so a click intended for bare picture landed on a marker, selected it instead of starting a new one,
and waited 30 seconds for a form that was never going to open. It now runs on a second, empty fixture
map. It is also driven **without a page reload on purpose**: a reload mounts the component with no
local edits, so it would pass whether or not the defect is present.

---

## Round 2 — pointed at the test suite, not the product

Round 1 asked whether the code was right. This round asked a different question: **can these assertions
fail?** Those are not the same question, and only the second finds this class of defect. The prompt said
so explicitly and gave the reason: Phase 10 shipped 92 assertions that survived three review rounds and
five negative controls, and six of them turned out to be incapable of failing.

**Verdict: needs-attention. Three findings, two high and one medium, every one of them in the suite
rather than in the product. All three fixed.**

The two high findings share a shape worth naming: **the suite could damage state that other suites and
the running app read, while reporting success.** That is worse than a missing assertion.

### R2-a [high] — the permission-restore assertion could not fail on the machines where it matters

`docs/smoketests/playwright/phase-11-admin-pin-authoring.mjs`. Section 9 revokes the floor-plan
permission for STAFF through `PUT /api/roles`, then restores it. The restore was "delete the row if
there was not one before", and the assertion was `hadStaffRoleRow || rowsLeft === 0`.

**When a staff row DID exist, that expression is true no matter what happened.** So the suite could
revoke the permission, never put it back, and report `the revoked-permission row was removed again` as a
pass. The restore was also not inside a `finally`, so an exception anywhere between the revoke and the
restore skipped it entirely.

On this machine the `RolePermission` table is empty, so the old code happened to work. On any machine
where somebody has saved role permissions on the Access screen it would leave staff locked out of the
floor plan — and finding F-18 records that there is no way to notice that from inside the app.

**Fixed:** the row's own fields are snapshotted, restored in a `finally` that always runs, and the
assertion compares the restored state to the snapshot rather than to a condition about whether a row
existed.

**Negative control A, prediction written first.** A staff row was inserted to create the condition that
matters — description `Control A baseline`, permissions including `floorPlan` — and `restoreStaffRole()`
was made a no-op. Prediction: exactly one failure, the restore assertion, and the row left without
`floorPlan`.

Result: **65 passed, 1 failed.** The failure read
`expected "[... \"floorPlan\" ...]", found "[\"calendar\",\"agenda\",\"speakers\",\"meetings\", ...]"`,
and the row was left as `Phase 11 check: floor plan revoked` with `floorPlan` absent. With the sabotage
removed the same starting condition gave **66 passed** and the row restored to `Control A baseline` with
`floorPlan` present. The baseline row was then deleted and the suite run once more on the empty table —
**66 passed**, table still empty, 25 seeded markers intact — so both branches of the snapshot logic are
covered.

**This same defect is live in Phase 10's merged suite**, at
`docs/smoketests/playwright/phase-10-admin-map-upload.mjs:1706`, which is where the pattern was copied
from. Control A demonstrates what it would do: pass while leaving the permission revoked. **Not changed
here** — Phase 10 is merged and its suite is that phase's evidence — and recorded below under carried
findings.

### R2-b [high] — cleanup deleted by name, and then proved only that the damage was gone

`cleanup()` included `DELETE FROM VenueMap WHERE name LIKE 'Phase 11 %'`, which would delete a real map
whose name happened to begin that way. The cleanup assertion then repeated the same broad condition
after the deletion, **so it could not detect that it had just destroyed something.**

That contradicts this file's own stated rule that nothing destructive touches a row it did not create —
the rule that exists because Phase 10 destroyed the seeded exhibit hall and its ten markers twice.

The name-based delete was copied from Phase 10's suite, where it is necessary: that phase creates maps
through the upload handler, so their ids are generated and cannot be matched by prefix. This phase
chooses every map's id, so it never needed it.

**Fixed:** `cleanup()` and the cleanup assertion both work from an explicit list of fixture ids —
`FIXTURE_MAP_IDS`, `FIXTURE_USER_IDS`, the one company id, the one conference id, and `createdPinIds`.

### R2-c [medium] — the seeded-marker guard compared only a total

The check was one `COUNT(*)` at the start and the same total at the end. A defect that deleted one
seeded marker and created another elsewhere would pass, because the total is unchanged. The query was
also not limited to the active conference, unlike the seeded-map snapshot beside it, so an unrelated map
could make up the difference.

**Fixed:** the full row set for the active conference is captured — id, map, type, x, y, company, label —
ordered by id, and compared field by field. The assertion now reads
`all 25 seeded markers are unchanged, field by field`.

---

## Round 3 — pointed at what rounds 1 and 2's own fixes introduced

Not at the original code, and not at ground the first two rounds covered. The prompt listed all seven
fixes and asked what repairing them broke, weakened, or left half-applied. This is the second phase
running where that question produced the round's worst finding.

**Verdict: needs-attention. One finding, high. It is a defect in round 2's fix, and it is the best
finding of the three rounds.**

### R3-a [high] — round 2's restore wrote the row and never told the app

`docs/smoketests/playwright/phase-11-admin-pin-authoring.mjs`. Round 2's fix snapshotted the STAFF role
row and restored it in a `finally` — **by writing the database directly.**

That is the exact mistake this project has already paid for. Role permissions resolve through
`unstable_cache` in `apps/web/lib/role-permissions-server.ts`, keyed `role-configs`, tagged
`role-permissions`, with a 60-second window, and **only the app's save path clears that tag.** Section 9
revokes the permission through `PUT /api/roles` and then makes STAFF requests, which loads the *revoked*
configuration into that cache. A direct write afterwards updated the row and left the running app still
refusing staff — and the assertion, which read only the row, called that restored.

Phase 10's log records the same mistake in the other direction: the *revoke* was written directly, the
app kept serving the permissive answer, every refusal assertion "failed", and the delete aimed at a
seeded map destroyed the exhibit hall and its ten markers. Twice. Round 2's fix reintroduced the mistake
on the restore side while section 9's revoke had it right — a fix applied to one of two symmetrical
paths, for the third time in this project's recorded history.

Round 3 also noted that the assertion claimed an exact restore while rewriting `updatedAt` and never
comparing it.

**Fixed:**

- The restore goes through `PUT /api/roles`, the path a person uses, which clears the tag as a side
  effect. When there was no row to begin with, the defaults are saved through the API — clearing the
  cache and making the running app correct — and the row is then deleted, because the cached
  configuration and "no row at all" resolve to the same answer when what the API was given is the
  default set.
- A **behavioural** assertion was added, which is what round 3 asked for: after the restore, sign in as
  staff again and place a marker. A row check cannot see the cache; a request can.
- The assertion text no longer claims byte-for-byte. It names the fields it checks — description and
  permissions — and `updatedAt` is deliberately not compared, because saving through the app sets it to
  now and that is correct behaviour rather than something to restore.

**Negative control B, prediction written first.** Before running it, the 60-second cache window was
checked, because if more than 60 seconds elapsed between the revoke and the check the cache would expire
on its own and the assertion would pass regardless — which would make it worthless. Prediction: with the
direct write put back, the behavioural assertion fails with 403.

Result: **66 passed, 1 failed**, and the shape of it is the finding itself:

```
✓ the staff role's description and permissions are restored to what they were
✗ and staff can use the feature again, so the app's cached permissions were cleared too
    — got HTTP 403 — a 403 means the running app is still enforcing the revoked permission
```

The row assertion passed while the behavioural one failed. With the sabotage removed: **67 passed, 0
failed**, `RolePermission` empty, 25 seeded markers intact, and no sabotage remaining in either file.

---

## Where the cycle ended

**Three rounds of a cap of three, all run.** Eight findings resolved: three from round 1 plus a fourth
found by symmetry, three from round 2, and one from round 3. Two negative controls run with predictions
written before each, both matching exactly.

The suite went from 59 assertions to **67 passed, 0 failed**.

**The split is worth recording.** Round 1 found four defects in the product. Rounds 2 and 3 found four
defects in the apparatus for proving the product — including two that would have let the suite damage
state other suites read while reporting success. The feature code was largely right from the start; what
needed three rounds was the evidence.

**Four assertions have now been seen to fail** and are therefore evidence rather than decoration: the two
company-list assertions that failed on the suite's first run, the local-edit reconciliation assertion
under control A's predecessor, and the behavioural permission assertion under control B. The remaining
63 have not yet been made to fail; that is what the negative-control stage is for.

---

## The negative controls

Nine controls, in `docs/smoketests/playwright/phase-11-negative-controls.sh`. Each breaks one shipped
behaviour and requires the suite to fail by the number written into the script **before it ran**. Five gates:
the edit applies, the build succeeds, the app answers and the port is held by this run's own process, at
least one assertion starts failing, and the count equals the prediction. Failures are compared **by
assertion name** rather than by count — Phase 10 marked two correct predictions wrong by comparing counts
that both contained noise.

Seven were caught by exactly their predicted numbers on the first pass: the picture address ignoring the
permission (1), the picture address serving any conference's map (1), positions being coerced again (3), a
local edit shadowing the server (1), nothing telling the delegate a marker was placed (4), creating a marker
ignoring the conference boundary (1), and a booth saved with no company and no name (1).

**Two predictions were wrong, and both were worth more than the seven that were right.**

### The first wrong pair — the suite did not measure R1-c at all

Controls 4 and 5 originally broke only the conditional write, one on the delete path and one on the move
path, each predicting one failure.

- Control 5 reported `GATE 4 FAILED: no assertion started failing. The suite does not measure this.`
- Control 4 reported two failures, and **neither was the predicted assertion** — they were
  `the fixture map has exactly one row` and `the suite ran to completion`, both about page state during a
  restart, nothing to do with deletion.

**Cause:** `resolve()` looks the marker up and answers 404 for a missing one before either write is reached.
So the sequential cases the suite exercises are caught by that guard, and removing the conditional write is
invisible to them. The two assertions were never evidence for R1-c, and the log said they were. Corrected
above.

**Retargeted as a pair that says which safeguard does what:**

- **Control 4 — "a vanished marker is not noticed at all."** Removes `resolve()`'s guard *and* both count
  checks, which is the only way to reach a write with a marker that is gone.
- **Control 5 — "the conditional write catches a marker that vanished."** Removes only `resolve()`'s guard
  and requires the suite to **stay green**. A control that must be absorbed is not a weaker check: gate 1
  still proves the edit applied, so a green suite cannot be explained by nothing having changed.

Control 5 passed on its first run: `PASS — the suite stayed green, so the other safeguard is what catches
this`. That is direct evidence the conditional write does the work, which control 4 alone cannot give
because it removes both.

### The second wrong prediction — and it found a hole

Control 4 predicted three failures and produced two. The two were the 404-not-500 pair. The third I had
predicted was `a marker id belonging to a different map answers 404`, on the reasoning that with the map
condition gone from the write, naming a marker against the wrong map would modify **another conference's
marker**.

That reasoning was right about the mechanism and wrong about the suite. The write does land on the other
conference's marker — and then the read-back, which is **still scoped** to the named map, finds nothing and
answers 404. So the response looks exactly correct while another event's marker has already been moved, and
no assertion looked.

**The check that the other conference's marker is untouched runs earlier in that section, before the
attempt.** A 404 is not evidence that nothing was written.

**Closed by adding one assertion** — `and the cross-map attempt wrote nothing to the other conference's
marker` — which reads the row after the attempt rather than before it. The suite went from 69 to **70
passed, 0 failed**, and control 4 was re-run against it.

To be plain about the record: the prediction of three was **wrong for the suite as it stood**; two was the
correct answer then. The suite was then improved and the control re-run. That is different from adjusting a
prediction to fit a result, and the distinction is the whole reason gate 5 exists.

---

# SECOND CYCLE — rounds 4, 5 and 6, run 2026-08-03/04

**Why a second cycle exists, since the cap is three.** Requested before the commit, and justified on its
own merits rather than as repetition. **Three changes in
the working tree had never been named in this log at all**, established by searching it rather than assumed:

- the F-20 fix in `apps/attendee/components/map/FloorPlanClient.tsx`, the booth-number fallback;
- the honest-message change, `delegatesNotified` across six write paths in `apps/web`;
- the `outputFileTracingIncludes` entry and reading pictures from `apps/web/assets/maps/`.

All three landed after round 3 finished. Rounds 4 to 6 are pointed at them and at what rounds 4 and 5
themselves changed, which is the same shape as round 3 and is where this phase found its best defect.

**Result: three product defects and five apparatus defects, all eight fixed. The suite went from 74 to 80
assertions.** Four negative controls run, each with its prediction written before the run; three matched
exactly and the one that did not exposed a further hole, which is recorded below because the miss was worth
more than the match.

---

## Round 4 — the three changes rounds 1 to 3 never saw

Areas named in the prompt, in priority order: the deployed-only failure in the picture address; the
honest-message change across all six write paths; the participant marker label. The prompt also listed
what rounds 1 to 3 had already found, so the round would not re-report it, and named the known
non-defects.

**Verdict: needs-attention. One finding, medium as reported, and worse than that on inspection.**

### R4-a [high, reported as medium] — a blank booth number defeated F-20's own fix

`apps/attendee/components/map/FloorPlanClient.tsx`. The marker chose its pill width by truthiness —
`boothNumber ? 'min-w-7' : 'max-w-[6.5rem]'` — and its text by nullishness — `boothNumber ?? pin.label`.
**Those two questions disagree about the empty string.** A company stored with `''` took the wide-pill
branch and then rendered nothing, so the marker drew a blank pill. Whitespace-only reached the same place
through the other branch: truthy, so the narrow branch, rendering spaces.

A blank marker is precisely the defect F-20 exists to remove. It had been reached again through a
different value.

**Why this is high rather than medium.** The review rated it medium on the reachability it could see. The
real path is shorter, and was established by reading the three files rather than reasoning about them:

- `apps/sponsor/components/ProfileEditor.tsx:187` starts the field at `sponsor.boothNumber ?? ''`.
- The same file, line 267, sends `boothNumber` on **every** save, not only when it changed.
- `apps/sponsor/app/api/profile/route.ts:59` stores what it is sent, untrimmed:
  `data[key] = Array.isArray(val) ? JSON.stringify(val) : (val ?? null)`.

So a company with no booth number is written as `''` **the first time its representative saves their
profile for any reason at all** — editing a tagline is enough. Ten of the twenty seeded exhibiting
companies have no booth number, which is the majority of the population the fallback was written for.

The booth card lower in the same component used a truthiness check, so at this point the card and the
marker disagreed about the same field. **Round 6 found that the card was not correct either** — see R6-b.

**Fixed** by normalising once so every reader below agrees what "has a booth number" means.

**Four assertions added** as section 7c of the suite, covering null, empty string, whitespace-only, and a
real booth number as the counterpart. They rewrite only a fixture company the suite creates, which is what
the rule about touching nothing you do not own requires.

**Negative control, prediction written first.** Reverting the normalisation should fail exactly the
empty-string and whitespace assertions, leaving the null case and the real-number case green. Result:
**76 passed, 2 failed**, the two being those two, reading
`the marker read "", expected "Phase 11 Blank Booth Company"`. Restored and back to 78.

### What round 4 cleared, and the limit of that

The picture address and the honest-message change produced no findings. The log shows the review did
investigate the first rather than skipping it — it read `collect-build-traces.js` and the built
`.nft.json` trace files. **A review verdict is a claim, not proof, so the tracing question was proven
separately** and the evidence is in `docs/smoketests/phase-11-admin-pin-authoring.md`.

---

## Round 5 — pointed at the test and operations apparatus

Six changed files had never been named in this log: both negative-control scripts, the two Phase 10
carried-criteria helper scripts, the seeding script, and the production inspection script. The prompt
asked one question of all of them: can any of this report success while measuring nothing, or damage state
other suites read while still reporting success.

**Verdict: needs-attention. Five findings, one high and four medium. All five accepted and fixed.**

### R5-a [high] — section 7c's own new assertions could pass on a stale render

The section rewrote the company's booth number directly in the database, then cleared the participant
app's cache by moving the marker through the product's PATCH address — and **discarded that move's
answer**, using `failOnStatusCode: false` with no check. All three blank cases expect the same text. So if
the cache stopped being cleared, cases two and three would re-read case one's render, see the same company
name, and pass while measuring nothing.

This is round 4's own work, found one round later, which is the pattern round 3 established.

**Fixed** in three parts: the move must answer 200; it must report `delegatesNotified` true; and each case
carries a **different y**, read back off the rendered marker, so a render from the previous case fails on
position even when its text matches.

**Negative control, prediction written first, and the prediction was WRONG — see below.** It is recorded
as its own entry because the miss found a further hole.

### R5-b [medium] — the cleanup assertion never checked the two fixture companies

The final assertion counted users, maps, the other conference and markers, and printed
`every fixture row this suite created was removed`. It did not count the two fixture companies, one of
which sits in the **active** conference and has its booth number rewritten four times. A cleanup that
stopped removing them would have reported success while leaving a company row every other suite reads —
and this phase's own assertions pick a company by whether it has a booth number, which a leftover fixture
could win.

**Fixed** by counting both companies in the same assertion and naming them in the failure detail.

### R5-c [medium] — the exit handler discarded the verdict of its own restore

`docs/smoketests/playwright/phase-11-negative-controls.sh`. The handler was
`restore; build_and_start_web >/dev/null 2>&1; echo "Done."` — the rebuild's output and its exit code both
thrown away, and `Done.` printed either way. So a restore-time build or start failure was invisible: the
script could exit successfully, after every control passed, leaving the admin app down or still serving
the build made from deliberately broken source.

That is the fault this script exists to detect in the product, present in the script itself. **It is not
hypothetical here** — a control run killed partway through cleanup on 2026-08-03 left exactly that state,
and only a separate build-freshness check noticed.

`build_and_start_web` already gates on the build succeeding, the app answering, and the listening process
being this run's own. All that was needed was to stop discarding its answer.

**Fixed:** a named `cleanup_on_exit` function that keeps the original exit status, shows the rebuild's
output, prints what to run by hand when it fails, and exits non-zero when a passing run leaves a broken app.

### R5-d [medium] — the same defect in Phase 10's script, over three apps

`docs/smoketests/playwright/phase-10-negative-controls.sh` did the same thing with `rebuild_both` and
`build_and_start sponsor 3003`, both silenced, `Done.` unconditional. Control 6 — the one added on this
branch — depends on that handler to replace the sponsor build after the last control, so a later suite
would inherit a broken portal with nothing said.

**Fixed** the same way, accumulating the names of any app that could not be rebuilt so the message says
which one to fix.

### R5-e [medium] — the refusal-log witness could accept an old line as fresh

`scripts/phase-10-witness-refusal-log.mjs`. This is the **third** version of the same boundary problem and
the first two are recorded in the file. Version one remembered the log's byte size and sliced from it; the
offset landed six characters inside the line and the assertion failed while the app was correct. Version
two counted completed newlines, which is right only when the file ends with one.

The remaining case: for a file ending in an **unterminated** line, the count is one lower, so that last old
line is included in the "fresh" text. If it happens to be a refusal from an earlier run, the script reports
the refusal was logged when this run logged nothing.

**Measured rather than argued** — the same content with and without a trailing newline, showing the old line
leaking only in the second case.

**Fixed** by removing the boundary from the question. It counts how many refusals the file holds before and
after, requires one more, and reads the last matching line. No slicing mistake can fake an increase.

### The wrong prediction in round 5, and the hole it found

**Prediction:** with the invalidation reporting success while clearing nothing, all four of section 7c's
cases fail on the wrong position.

**Result: three failed, and the fourth PASSED.** It read `Z-42` at `y=33` from a cache that had not been
cleared at all.

`Z-42` at `y=33` is exactly the state the **previous run** of this suite leaves behind, because it is the
last case's state, and cleanup deletes the rows without clearing the tag the participant app reads. **So
the counterpart assertion could be satisfied entirely by a stale render from the run before.** A freshness
token that is the last thing written is not a freshness token.

**Closed** by parking the fixture afterwards at no booth number and `y=40`, a position no case expects, so
a stale render fails every case instead of satisfying one by coincidence.

**Re-run, prediction written again: all four fail.** Result: **70 passed, 9 failed**, all four failing on
`y=40`. Case one is the clearest evidence in the whole cycle — **its text matched and it still failed**,
because the position showed the render was stale. That is the new check doing the work rather than the text.

---

## Round 6 — pointed at what rounds 4 and 5 changed

Six changes named, nothing else in scope: the booth-number normalisation, section 7c, the cleanup
assertion, and the three apparatus fixes.

**Verdict: needs-attention. Two findings, one high and one medium. Both accepted and fixed.**

### R6-a [high] — the baseline and the after-run measured different sets of apps

`docs/smoketests/playwright/phase-10-negative-controls.sh`. `run_control` prepared its baseline with
`restore; rebuild_both`, which covers the participant and admin apps only, and called `ensure_both_up` —
which also knows about the sponsor portal — **after** the break was applied.

So for control 6, which edits the sponsor app, the baseline was taken with the portal possibly down or
serving a build from an earlier control, while the after-run measured with the portal freshly rebuilt. The
suite reports the portal's two assertions as **failures** when it is absent, so the baseline carried two
failures the after-run did not. Those two subtract from the delta, and the delta is the entire verdict. A
control predicting one extra failure could report the wrong number, or hide the regression, for a reason
having nothing to do with the safeguard it removes.

**Fixed:** a control targeting the sponsor app rebuilds it from restored source before the baseline, and
every control confirms all three apps answer before measuring rather than only afterwards.

### R6-b [medium] — the booth card was the second reader, and it disagreed

`apps/attendee/components/map/FloorPlanClient.tsx`. Round 4 fixed the marker and left a comment claiming
the card was already correct. **That comment was wrong, and this round is what established it.** The card
rendered its Stand line from the raw value, so a whitespace-only booth number is truthy there. The delegate
saw the company name on the marker, tapped it, and got a card reading `Stand` with nothing after it.

This is the exact shape the round was asked to hunt: one reader of a field fixed, another reader of the same
field left disagreeing. It is also this project's most repeated error, which is why the fix is not another
component patch.

**Fixed at the one boundary both readers share** — `apps/attendee/lib/floor-plan-data.ts` trims and empties
to null when it builds the payload, so the marker, the card and anything added later get the same answer.
The trim in the component is kept as a second check that costs nothing. The misleading comment is corrected
in place rather than deleted, because the correction is the more useful record.

**Two assertions added**, on the card rather than the marker, paired so that hiding the Stand line for
everybody fails the counterpart.

**Negative control, prediction written first.** Reverting the boundary normalisation should fail exactly
one assertion, because the marker keeps its own trim. Result: **79 passed, 1 failed**, reading
`the card showed a Stand line reading "Stand" for a company whose booth number is whitespace`.

**Not fixed here, and recorded instead:** the sponsor profile write still stores an untrimmed value, so new
blanks can still be created. Trimming there would stop that but would not repair rows that already hold
one, which is why the guarantee belongs at the read boundary. The write-side trim is a residual in
`docs/smoketests/phase-11-admin-pin-authoring.md` and belongs to the sponsor portal rather than to an
admin-app phase.

---

## Where the second cycle ended

**Three rounds run, eight findings, all fixed. The suite went from 74 to 80 assertions, 0 failed.**
Phase 8 holds at **93** and Phase 9 at **219**, both re-run afterwards with the participant app's cache
cleared and the app restarted first, because both suites cover the participant map file this cycle changed.

**The split repeats the first cycle's, and more sharply.** Round 4 found one product defect. Round 5 found
five, every one of them in the apparatus for proving the product, and one of those was round 4's own new
assertions. Round 6 found one apparatus defect and one product defect that was a **correction to round 4's
written claim about its own fix**.

**Two of the three most useful results in this cycle came from being wrong**: the prediction that missed in
round 5, which found a freshness token that could not detect staleness, and round 4's comment asserting the
card was already correct, which round 6 disproved. Neither would have surfaced from a round that only asked
whether the new code looked right.

**Four assertions have now been seen to fail** that had never been seen to fail before: the two blank-value
marker assertions, the four freshness-checked cases under the stale-cache control, and the blank-card
assertion. Each failed with its prediction written beforehand.

---

## Carried findings — not this phase's to fix

**The permission-restore defect is live in Phase 10's merged suite**, at
`docs/smoketests/playwright/phase-10-admin-map-upload.mjs:1706`:

```
yes(hadRow || rowsLeft === 0, 'the revoked-permission row was removed again', `${rowsLeft} row(s) left`)
```

That expression is true whenever a STAFF row existed beforehand, and the restore beside it is a direct
database write that never clears the app's permission cache. Both halves of what rounds 2 and 3 found,
in a file that is merged and passing at 92 assertions.

On this machine the `RolePermission` table is empty, so it does no harm here. **On any machine where
somebody has saved role permissions on the Access screen, running Phase 10's suite would leave staff
without the floor-plan permission and report success.** Negative control A demonstrated exactly that
outcome, and finding F-18 records that there is no way to notice it from inside the app.

Not changed in this phase: Phase 10 is merged, that suite is that phase's evidence, and altering it would
change the 92 it is recorded at. Not scheduled.







