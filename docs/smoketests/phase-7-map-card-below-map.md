# Phase 7 Smoketest — the company card sits under the map on a phone

> Plan: `.claude/plans/wbr-uat-followups-2026-08-07.md` § Phase 7
> Requirements: `.claude/docs/prds/wbr_uat_followups_2026_08_07.md` (user stories 7–10; findings UF-5, UF-6, UF-7, UF-36, UF-37, UF-38, UF-39)
> Written to [`docs/smoketests/CONTRACT.md`](CONTRACT.md).

Manual verification path. Both a person and an agent are valid runners. Most of it is driven by
one script, [`playwright/phase-7-map-card-below-map.mjs`](playwright/phase-7-map-card-below-map.mjs).
Two steps are read by eye, and two are earlier phases' checks re-run.

## What this verifies

1. At 390 × 844, tapping the lowest marker on a landscape floor plan leaves that marker visible
   with the card open — plan AC 1.
2. The same on a portrait floor plan — plan AC 2.
3. The tallest seeded company card renders complete at 390 × 844, its website link visible,
   without the card scrolling inside itself — plan AC 3.
4. With a card open, tapping a different marker shows that company in one tap — plan AC 4.
5. The card keeps a usable close control below 768 — plan AC 5.
6. At a 1280-wide window the card opens over the map exactly as before, with the overlay — plan
   AC 6.
7. Below 768 the card carries no `aria-modal` and does not trap Tab; at 768 and above it does
   both — plan AC 7.
8. Pinch and pan behave as before at every width — plan AC 8.
9. A window that gets smaller while the map is zoomed and dragged to an edge leaves the map
   covering its window — plan AC 9, finding UF-36.
10. Opening a second marker below 768 is a real open, and closing returns focus to the marker that
    was opened — plan AC 10, finding UF-37.
11. A window crossing 768 with a card open does not leave focus behind the overlay that appears
    with it — plan AC 11, finding UF-37.

**No perf-bar step.** This phase changes where one element is drawn and adds a `ResizeObserver` on
one element. It ships no new data, changes no payload, and adds no request. Stated rather than
omitted, per CONTRACT.md §2.4.

## Prerequisites for the runner

- The participant app reachable at `ATTENDEE_BASE_URL`, default `http://localhost:3001`, **serving
  this branch**.
- `apps/attendee/.env.local` holding `DATABASE_URL` as an **absolute** `file:/…` path and
  `NEXTAUTH_SECRET`. The script needs the secret to clear the app's map cache; without it the run
  stops and says so.
- Playwright with Chromium.
- `sqlite3` on the path for the leftover check in step 6.

### Check what is on the port before trusting it

```
lsof -nP -iTCP:3001 -sTCP:LISTEN
ps -o pid,etime,command -p <pid>
```

An age measured in days rather than minutes means the process is not this run's server.

### Run this on a production build, not only a development server

**Tier C or better, and this is not a formality here.** The run of record on 2026-08-07 passed on a
development server and then failed on a production build, because the portrait floor plan the run
creates was being written into `apps/attendee/public/maps` — and Next.js takes its list of public
files when it builds, so a file written afterwards is not served. Measured: the probe picture
answered 404 while a seeded one answered 200. The picture never appeared, the map window kept the
previous map's proportions, and eight of the nine portrait assertions passed while the screen
showed a landscape map.

The script now stores that picture the way an organizer's upload stores one — as data on the map
record, which the app serves itself — so it behaves the same either way. The reason for insisting
on a production build stands regardless: this is where that class of difference shows up.

```bash
cd apps/attendee && npx next build && npx next start -p 3001
```

### The portrait floor plan is built by the run, and removed by it

All three seeded maps are landscape — 1600×1200, 1600×1200 and 1600×1400 — so the criterion that
motivated this whole change cannot be exercised with them. The map's height comes from the
picture's proportions, and a portrait picture is the case that leaves no room underneath. The run
adds a map with a 900 × 1500 picture and two markers, measures, then deletes both and clears the
app's map cache.

## Steps

### Step 1 — Run the script [contract, tier C]

**Verifies:** everything in the list above. Every assertion is a measured geometry or a binary
observable, read from the rendered screen.

```bash
node docs/smoketests/playwright/phase-7-map-card-below-map.mjs
```

- [ ] The run ends with a count and exits 0.
  - **Pass:** the last line reads `46 passed, 0 failed`, and the cleanup block reports
    `probe markers deleted: 2`, `probe map deleted: 1` and `map cache: cleared`.
  - **Fail:** any `✗`, a non-zero exit, or a cleanup line reporting 0 deleted rows — which means a
    probe map is still in the database and will show as a map tab with no picture.

What it measures, in the order it runs:

| Group | Assertions |
|---|---|
| AC-1 / AC-2 | for the landscape map and then the portrait one: the picture on screen is the one the check is about, compared against its own decoded dimensions; the lowest marker is on screen before the tap and still on screen after it; nothing is drawn over it; the card starts below the map. For the portrait map additionally: the whole picture is inside the map window, it keeps its proportions, the whole card is inside the window, the page does not scroll, and the website link is visible |
| AC-3 | every seeded map is walked and every company card opened — 10 of them — and the tallest is checked for scrolling inside itself, a visible website link, no page scroll, and ending clear of the bottom bar |
| AC-4 / AC-5 | one tap moves the card to a second company; no overlay is drawn; the close control is at least 44 × 44 and dismisses the card |
| AC-7 narrow | no `aria-modal`; Tab moves out of the card |
| AC-6 / AC-7 wide | at 1280: the card is positioned over the map, overlaps it, the overlay is present, `aria-modal` is claimed, Tab stays inside, and no height cap is applied |
| AC-8 | at 390 and at 1280: double tap zooms, dragging moves the map, "Fit map" returns to the resting view |
| AC-10 | the card switches to a second company, focus is on the card now showing, and closing returns focus to the second marker |
| AC-11 | Tab leaves the card below 768; past 768 the card is modal again with its overlay, and focus is collected into it |
| AC-9 | zoomed to 2× and dragged to the edge on a 1280-wide window, then narrowed to 390: no edge of the map comes inside its window |

**Why the check asks which picture is on screen before measuring.** Because the answer was once no
and almost nothing noticed. A picture's decoded dimensions come from the file, so they cannot be
right by accident; every other measurement in that group is meaningless if this one is wrong.

**Why AC-9 shrinks the window rather than enlarging it.** A negative control taught this. The first
version turned the phone to landscape, which makes the window bigger — and a bigger window allows
more panning, so an offset that was legal before is still legal after. It passed with the fix
removed and proved nothing.

### Step 2 — Negative controls: the run fails when the change is undone [contract]

**Verifies:** that step 1 passing is evidence of anything.

Each defect was reintroduced alone, the run repeated, and the change reverted. Run of 2026-08-07:

| Defect reintroduced | Result |
|---|---|
| the height cap removed | 33 passed, **2 failed** |
| the card put back over the map at every width | 28 passed, **7 failed** |
| the overlay kept at every width | 27 passed, **8 failed** |
| `aria-modal` claimed at every width | 34 passed, **1 failed** |
| Tab trapped at every width | 34 passed, **1 failed** |
| the window's size no longer watched | 36 passed, **1 failed** |
| the card no longer keyed by its marker | 42 passed, **1 failed** |
| no focus collected when the card becomes modal | 42 passed, **1 failed** |
| focus handed back even after the person moved away | 42 passed, **1 failed** |
| **the height cap removed, on a production build** | 44 passed, **2 failed** |

Pass counts differ between rows because the script grew through the review cycle — the first five
ran against 35 assertions, the next four against 43, the last against 46. Only the failure count is
comparable across rows.

- [ ] Reintroduce any one of them and re-run.
  - **Pass:** the run reports at least one `✗` and exits non-zero.
  - **Fail:** the run still reports `0 failed`.

### Step 3 — Phase 8 re-run: the marker positions still hold [contract, tier C]

**Verifies:** the rule the whole map screen is built around — the marker layer is exactly the
picture's box — which a height cap applied carelessly would break. Required by CONTRACT.md's
re-run rule, since this phase changes that screen.

```bash
node docs/smoketests/playwright/phase-8-floor-plan-viewer.mjs
```

- [ ] Run it.
  - **Pass:** `93 passed, 0 failed`, including every marker's centre within 2 pixels of the point
    its stored percentage names, at 390 × 844, 768 × 1024 and 1280 × 900.
  - **Fail:** any failure — a marker that has drifted is a delegate sent to the wrong stand.

**Why the height cap is applied as a width.** A `max-height` on the map window would have been the
obvious way to write it and would have broken exactly this. The window hides what overflows it and
the picture takes its height from its own proportions, so a height limit would not shrink a tall
picture — it would cut the bottom off it, and every marker down there with it. Limiting the width
scales the whole picture instead, and the window stays the picture's box.

### Step 4 — Phase 9 re-run: the company card [contract, tier C]

**Verifies:** everything the card shows and does, for all ten exhibiting companies.

```bash
node docs/smoketests/playwright/phase-9-booth-company-card.mjs
```

- [ ] Run it.
  - **Pass:** `333 passed, 0 failed`.
  - **Fail:** any failure.

**That file was amended by this phase, and the amendment is part of the deliverable.** It ran at
390 × 844 asserting the behaviour this phase deliberately withdrew there: ten "card sits over the
map" assertions, Tab held inside the card, focus handed back after the person had tabbed away, and
dismissal by tapping the overlay — which stopped the run outright, since that overlay is no longer
drawn at that width. Each was rewritten to the contract that replaced it, with the reason recorded
in place and the wide-screen half left to phase 7's own run. A runner comparing against an older
copy of that file will see different assertion names; the count moved from 321 to 333.

### Step 5 — The screens as a person sees them [contract, tier C]

**Verifies:** ACs 1, 2 and 3 by eye. The script measures; this looks.

- [ ] Sign in on a phone-sized window at `http://localhost:3001`, open **Map**, and tap the lowest
      marker on the Exhibit Hall plan.
  - **Pass:** the whole floor plan stays visible with every marker on it, the marker just tapped
    included, and the company card sits below the map with its "Visit website" link on screen.
  - **Fail:** any part of the map is covered by the card, or the link needs scrolling to reach.
- [ ] Tap a different marker without closing the first card.
  - **Pass:** the card changes to that company on the first tap.
  - **Fail:** the first tap only closes the card.

### Step 6 — Nothing was left behind [contract]

```bash
sqlite3 packages/db/prisma/dev.db "select count(*) from VenueMap where id='phase7-portrait-probe';"
git status --short apps/attendee/public/maps/
```

- [ ] Run both.
  - **Pass:** the count is `0` and the folder shows no changes.
  - **Fail:** anything else — a probe map left in the database appears to delegates as a map tab
    with no picture.

## Step summary

| Step | Category | Environment | Status (2026-08-07 run) |
|---|---|---|---|
| 1. Run the script | contract | local production build (tier C) | PASS — 46 passed, 0 failed, twice |
| 2. Negative controls | contract | dev and production build | PASS — 10 defects reintroduced, 10 caught |
| 3. Phase 8 re-run | contract | local production build | PASS — 93 passed, 0 failed |
| 4. Phase 9 re-run | contract | local production build | PASS — 333 passed, 0 failed after amendment |
| 5. The screens by eye | contract | local production build | PASS — landscape and portrait both photographed |
| 6. Nothing left behind | contract | anywhere | PASS — 0 probe rows, no file changes |

## Pass / fail

The phase ships when every step above passes on a running workspace, on a production build.
Type-check passing is not one of the conditions on its own.

## Known limit of this run

Every measurement was taken in Chromium. The map's height limit is written in `dvh`, the unit
meaning one percent of the window height a person can actually see, which exists precisely because
a phone's address bar changes that height. Chromium, Safari and Firefox have all supported it since
2022, and no Safari or physical phone was available to this run. Before the demonstration, open the
map on the device it will be given from and tap a marker low on the floor plan.

## Re-run trigger

Re-run this in full whenever a later phase touches:

- `apps/attendee/components/map/FloorPlanClient.tsx`
- `apps/attendee/lib/floor-plan-data.ts`, which decides what the map screen is given
- the shared Tailwind preset at `packages/ui/preset.cjs`, which owns the 768-pixel threshold
- anything that changes what a company card holds — a longer tagline or another offering makes the
  tallest card taller, and the map's height limit was set against its measured height
