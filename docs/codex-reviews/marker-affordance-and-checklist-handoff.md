# Marker affordance and checklist handoff — Codex adversarial review log

**Subject:** two user-visible defects in the participant app, both found by a person using the
**deployed** site after the originating phases' review rounds and negative controls had passed.

1. Every venue-map marker was a `<button>` with a click handler and a pointer cursor, while the parent
   discarded the tap for anything that is not a booth with a company. A room marker was a control that
   did nothing.
2. Completing the onboarding checklist ran `router.refresh()` then `router.replace('/home')`. The
   navigation began before the refresh finished, and the browser served its cached copy of the
   checklist with the delegate's answers dropped.

**Rounds:** 3, the cap. **Scope:** the commit's diff plus the working tree on top of it.
**Date:** 2026-08-05.

**Totals: 14 findings, all fixed.** Two high, eight medium, four low. The suite grew from **219 to 331**
assertions on Phase 9 and from **53 to 55** on Phase 1.

**No review workaround was needed.** Previous phases hid six copies of the local database from git to
get the working tree under the tool's 1,048,576-character input limit. Reviewing the commit's diff
instead came to 34,138 characters, so nothing was marked assume-unchanged and no lines were added to
`.git/info/exclude`. **There is nothing to reverse before committing.**

---

## Why three rounds asked three different questions

Taken from this repository's own Phase 11 log, which is the best-shaped review here:

- **Round 1** — is the code right?
- **Round 2** — can these assertions fail?
- **Round 3** — what did rounds 1 and 2's own fixes break?

Every round found something the previous one could not have, and rounds 2 and 3 both found their
highest-severity defect **inside the previous round's fix**.

---

## Round 1 — the two fixes themselves

**Verdict: needs-attention. Three findings.**

### R1-a [medium] — the fix reintroduced its own symptom through the Back button

`window.location.assign('/home')` pushes a history entry; the `router.replace()` it replaced did not.
A delegate who completes onboarding, lands on `/home` and presses Back gets the checklist again,
possibly restored from the browser's back-forward cache without re-running the server redirect. And
because `setSaving(false)` never runs on the success path, the restored page comes back with the button
disabled and reading "Saving…".

**Fixed** with `window.location.replace('/home')`, which drops the checklist from history.

### R1-b [medium] — the new orphan check disabled itself on its second run

The check creates a companyless booth marker, invalidates the `floor-plan` cache, reloads, then deleted
the row **without invalidating again**. The running app kept serving the phantom marker for up to 300
seconds. On the next run `withoutCompany` counted that phantom, so the whole create-read-delete branch
was skipped and the orphan case silently stopped being tested.

**Fixed:** the cleanup invalidates again and asserts the row is gone.

**This also explained a mystery left open earlier the same day.** The suite had reported 264, then 260,
then 260 assertions, recorded in the smoketest document as an unexplained discrepancy. It was this
defect: different runs skipped different amounts depending on what the previous run had left cached. A
test that quietly disables itself while its count still rises is worse than no test.

### R1-c [low] — the label check counted nodes rather than checking visibility

A CSS change giving the label `hidden`, zero opacity or a zero-sized box would keep the count and keep
the assertion green, while the document claimed it proved the name was on the map.

**Fixed:** it reads the rendered box and computed styles.

### Cleared explicitly by round 1

Changing non-opening markers to `<div role="img">` breaks no keyboard or focus behaviour — focus
restoration only ever applied to booth markers, which remain buttons. `assign()` does correctly re-run
the middleware and the server gate. There is no `opensCard` mismatch.

---

## Round 2 — can the new assertions fail?

**Verdict: needs-attention. Eight findings.**

### R2-a [high] — the room checks never looked at the map where the defect was found

The code picked `mapRows.find(m => !boothMapIds.includes(m.id))`, which is Ballroom Level and its six
rooms, and never examined Meeting Rooms and its nine. Those nine are Table 1 to Table 8 and the
Networking Lounge — **the very markers whose tapping produced the defect.** The case that started the
work was untested.

**Fixed:** the loop covers every map carrying room markers, with the map list read from the database so
a fourth map is covered without editing the suite. It also compares the count drawn against the count
stored, so a map rendering two of its nine fails rather than checking two and passing.

### R2-b [medium] — real drift in the data downgraded the check

The companyless-booth branch ran only the weakest assertion when such a marker already existed,
leaving the cursor and click checks to the created-marker branch, which is skipped in exactly that
case. So the presence of the thing being tested reduced the testing.

**Fixed:** any companyless marker gets all three checks.

### R2-c [medium] — the label check could pass on the wrong label

`hasText` substring-matches and `.first()` searched the whole page, and the text was never compared. A
visible "Hall A1" would satisfy a missing "Hall A".

**Fixed:** the locator is scoped to the marker itself and the text is compared exactly.

### R2-d [medium] — a sized box can still be invisible

Clipped by the map window or covered by something on top.

**Fixed, and it took three attempts, recorded because the failures are instructive.** The first
demanded the hit test return the label; the second accepted an ancestor. Both failed **every** label
while it was plainly visible — real box, `display block`, `visibility visible`, `opacity 1`, exact
text. The cause is in the component: the label sets `pointer-events: none`, so `elementFromPoint`
skips it and the hit falls through to the map picture, which is neither ancestor nor descendant because
the label sits below the marker's own box. The working version switches pointer events on for the
measurement and restores them. **An assertion failing for the wrong reason is the same fault as one
passing for the wrong reason.**

### R2-e and R2-f [medium] — the source guard was easy to defeat

It matched a variable literally named `router`, so `const nav = useRouter(); nav.refresh();
nav.replace('/home')` reintroduced the race and passed. A dead `window.location.replace('/home')`
anywhere in the file satisfied the other half. And the comment stripping is a regex rather than a
parser, so a `//` inside a string could remove real code.

**Fixed in round 2, then narrowed in round 3 — see R3-c.**

### R2-g and R2-h [low] — the document claimed more than the suite asserted

It said 45 assertions where the count implied 48, claimed all six room markers when more existed on
another map, and claimed markers were "out of the tab order" while nothing asserted `tabIndex`.

**Fixed:** `tabIndex` and `role` are now asserted per marker, and the document matches.

### Cleared explicitly by round 2

The count guards do prevent silently empty loops. No assertion was found that literally cannot fail.

---

## Round 3 — what rounds 1 and 2 broke

**Verdict: needs-attention. Three findings.**

### R3-a [high] — round 2's own fix could report coverage for a map it never opened

The tab was selected by `hasText`, a substring match, and every per-marker assertion compared a label
to the marker's **own** `data-pin-label`. So the assertions agree with each other whichever map is
showing. Round 2's fix read the expected labels from the database and then never compared against them.
Two maps named "Meeting" and "Meeting Rooms" would make the loop report coverage for one while looking
at the other.

**Fixed:** the tab is matched on exact text and asserted to match exactly one; and the labels drawn are
compared **as a set** against the labels stored for that map.

### R3-b [medium] — round 1's cleanup could hide the failure it cleaned up after

The database calls were unguarded inside `finally`. If the try block failed because the marker never
appeared, and the delete then threw a lock error, the lock error replaced the real failure.

**Fixed:** both database calls are guarded and report their own outcome.

### R3-c [low] — round 2's guard forbade a decision nobody had taken

Failing on any `useRouter` in the file would fail a future Cancel button using `router.back()`, even
with a correct submit handoff. A test should not block a choice that has not been made.

**Fixed:** the check moved inside the submit handler and looks for **any** identifier calling
`.refresh()` and a route `.replace()`, which closes the alias hole without banning the router from the
component.

### Cleared explicitly by round 3

`replace()` is sound, including for a delegate who typed `/onboarding` directly, and `setSaving(false)`
not running on the success path is fine because the page is leaving. Markers from a previous map do
unmount on a real tab switch. `getBoundingClientRect()` includes scroll and transforms, so the
containment maths is valid on a zoomable map, and restoring an empty inline value restores the original
cascade. The companyless-booth click cannot open a card or leave a card open.

---

## Negative controls, each with its prediction written before the run

| Control | Prediction | Outcome |
|---|---|---|
| Reinstate the racing pair, development server | the timing assertion goes red | **WRONG** — 361 ms, all green |
| Reinstate it, local production build | it goes red there | **WRONG** — 65 ms, all green |
| Add a 5-second variant and a "checklist stopped rendering" check | one of them goes red | **WRONG** — both green with the defect present |
| Source guard, defect named `router` | both its assertions go red | correct — 53 passed, 3 failed |
| Source guard, defect aliased as `nav` | both go red | correct — 53 passed, 3 failed |
| Phase 9 suite run twice consecutively | the count is identical | correct — 331 both times |

**Three predictions were wrong and all three are kept as written.** They are the reason step 4b asserts
the source at all: the defect needs a race that a machine talking to itself always wins, so there is no
observable to assert. That is the justification for breaking this plan's rule against asserting
implementation details, and it was earned by measurement rather than argued.

---

## Where things stand

**Phase 9: 331 passed, 0 failed**, stable across consecutive runs against a local production build, with
one `!` note — "Hall A" is overlapped by another marker's tap box at fit-to-width. That is the limit
Phase 8 measured and the project owner accepted, so it is reported and not asserted.

**Phase 1: 55 passed, 1 failed.** The failure predates this work and was measured before any change was
made: `POST /api/posts/<missing>/like` answers 404 rather than 403 to an incomplete delegate. Something
between 2026-07-29 and 2026-08-05 made that address answer not-found before the guard runs. **Recorded
and left open**, not adjusted away.

**Still unproven:** that the checklist fix removes the behaviour reported on the deployed site. It
reproduced only there — not in a development server and not in a local production build — so the
deployed site is the only place it can be confirmed. That check has to happen after the push.
