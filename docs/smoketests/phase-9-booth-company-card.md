# Phase 9 Smoketest — the booth company card

Follows [`docs/smoketests/CONTRACT.md`](CONTRACT.md).

**Not to be confused with** `docs/smoketests/phase-9-admin-pagination-server-side.md`, which belongs to the June sprint's numbering and is about admin pagination. This document is the floor-plan Phase 9 from `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`.

---

## What this verifies

Mapped to the acceptance criteria in the plan's § Phase 9.

1. **Tapping a booth marker opens the card for the correct company**, with name, logo and booth number matching the seed. *(AC 1)*
2. **The card shows tagline, offerings, and a working website link.** *(AC 2)*
3. **The card opens over the map, and dismissing it returns to the same map at the same zoom and position.** *(AC 3)*
4. **A Playwright script named for this phase covers map switching and booth-tap-to-correct-card.** *(AC 4)*
5. **This document exists and follows the contract.** *(AC 5)*
6. **A database rebuilt from `packages/db/prisma/seed.ts` produces the same ten exhibiting companies, with the same taglines, booth numbers and offerings.** *(AC 6, added 2026-08-02 from finding F-10)*

Four things outside the criteria are verified, each because an adversarial review round found that leaving it out shipped a hole:

- **The card is usable on a phone** — everything fits without scrolling and the website link is visible at 390 pixels wide. Finding F-11: the first version passed all 175 assertions while hiding the link below the fold on every company.
- **Phase 8's suites still pass**, including the one whose behaviour this phase changed. Finding F-12.
- **The card behaves like the modal dialog it declares itself to be** — focus moves into it on open, Tab cycles inside it, and focus returns to the marker that opened it. It claimed `aria-modal="true"` and did none of this until round 1.
- **Long organizer-entered content does not overflow the card.** Today's longest seeded company name is 12 characters, so no real card stresses the layout; Phase 11 lets an organizer type these values. Round 2.

---

## Prerequisites for the runner

- The participant app on **3001**, built and started in production mode: `cd apps/attendee && npx next build && npx next start -p 3001`. Not `next dev` — that is tier D and invalid for any measurement here.
- **Clear the persisted map cache after any re-seed**: `rm -rf apps/attendee/.next/cache/fetch-cache`. The map read is cached for 300 seconds under a tag nothing invalidates yet, and Next writes that cache to disk, so it survives a restart. A change to the map response measured without this is measured against the previous response.
- All four apps read one database at an absolute path, `packages/db/prisma/dev.db`. The `apps/*/dev.db` copies are inert leftovers.
- The Playwright scripts create and remove their own disposable accounts. No manual sign-in setup.
- **If you rebuild the database**, set `SEED_BATCH_INTERVAL_MS=0`. Without it `seed.ts` sleeps five minutes between each batch of seven speakers, so a full seed takes about fifty minutes and looks like a hung process.

---

## Steps

### Step 1 — the regression baselines still hold [contract]

Run before anything else, so any later failure is attributable to this phase.

```
pnpm test:onboarding-policy                                     # expect 44 passed, 0 failed
pnpm test:floor-plan                                            # expect 57 passed, 0 failed
pnpm test:audit-db                                              # expect ALL PASSED
pnpm test:audit-security                                        # expect ALL PASSED
node docs/smoketests/playwright/phase-8-floor-plan-viewer.mjs    # expect 93 passed, 0 failed
```

**Pass criterion.** Every count matches exactly. Phase 8's browser suite must report **93**, unchanged from before this phase — see Step 7 for why that number is worth watching.

### Step 2 — the data behind the card [contract]

```
pnpm test:booth-card
```

**Pass criterion.** `Results: 178 passed, 0 failed`.

What it covers, in four groups:

1. Every exhibiting company with a booth marker has a name, tagline, booth number, an http(s) website, a logo file that exists under the participant app, and offerings that parse to a non-empty list of strings.
2. The seed's own definitions agree with the database, field by field, for every company on either side.
3. **The seed writes everything on create and almost nothing on update.** Both directions are asserted. Create must carry all eight fields, because that is what makes a rebuilt database reproduce the cards. Update must carry only name, tier and logo, and is asserted to **omit** tagline, description, website, booth number and offerings — `seed.ts` can reach the shared production database, so a wide update branch would let one stray `pnpm db:seed` replace an organizer's edits. Widening it again fails a check.
4. The hall layout derived from the seed's roster matches the one derived from the database, stand by stand.

A group that cannot run counts its skipped assertions as failures rather than printing an empty section.

### Step 3 — the card in a real browser [contract]

```
node docs/smoketests/playwright/phase-9-booth-company-card.mjs
```

**Pass criterion.** `Results: 326 passed, 0 failed`. Stable across consecutive runs against a local production build.

*Was 219 until 2026-08-05, when 107 assertions were added for the marker-affordance fix below — 48 in the first pass and a further 59 after Codex review rounds 1 and 2 widened the coverage.*

**A wandering assertion count, and its cause.** Before review round 1, this suite reported 264, then 260, then 260 — the count moved between runs. The cause was the check below that creates a companyless booth marker: it deleted the row afterwards but did not invalidate the `floor-plan` cache tag, so the running app kept serving the phantom marker for up to 300 seconds. The next run counted that phantom, concluded a companyless booth already existed, and skipped part of the branch — a different part depending on timing. **A test that quietly disables itself while its count still rises is worse than no test.** Found by Codex review round 1. The cleanup now invalidates the cache and asserts the row is gone, and the count holds at 267.

Run at **390 × 844**, a phone. Every one of the ten booth companies is opened and checked — enumerated, not sampled. It also checks that no room marker opens a card, that a card still opens on a zoomed and panned map, that dismissing by close button, Escape and backdrop each work, that the map's zoom and position are byte-identical before and after, that switching maps closes an open card, and that a drag starting on a marker pans the map without opening one.

**Added 2026-08-05 — a marker looks pressable only when pressing it does something.** Every marker was a `<button>` with a click handler, so every marker showed a pointer cursor and reported a tap; the parent then discarded the tap for anything that is not a booth with a company. A room marker was therefore a control that did nothing, which is the interface promising what it does not deliver. Found by a person tapping room markers on the deployed site, after three review rounds and thirteen negative controls on Phase 11 did not.

Room markers now render as plain elements — no click handler, no pointer cursor, out of the tab order — and their names stay printed under the dot where they already were. The fix is NOT a card repeating a name the delegate is already reading.

The new assertions, in four groups:

1. **Every room marker on every map that has any** — 6 on Ballroom Level and 9 on Meeting Rooms, by name — is not a button, offers no pointer cursor, is outside the keyboard tab order, and carries no control role. The count drawn is compared against the count stored, so a map that renders two of its nine is a failure rather than two passing checks.

   *Widened by review round 2.* The first version looked at the first non-booth map only, which is Ballroom Level. It never examined Meeting Rooms — whose markers are Table 1 to Table 8 and the Networking Lounge, **the very markers whose tapping produced this defect.** The case that started it was untested. The map list is now read from the database, so a fourth map is covered without editing the suite.

2. Each of those fifteen names is printed on the map without tapping. This is the group that fails if the fix removes the only way to learn a room's name. It compares the label's text **exactly** to the room's name, reads the rendered box and computed styles, and checks the label is inside the map window rather than clipped off its edge.

   *Three iterations, each from a review finding.* It began as a node count, which a hidden label would satisfy. Round 1 made it read the box and styles. Round 2 pointed out that `hasText` substring-matches, so a visible "Hall A1" would satisfy a missing "Hall A" — hence the exact comparison — and that a sized box can still be clipped or covered.

   **Overlap is measured and reported, not asserted.** "Hall A" is overlapped by another marker's tap box at fit-to-width. That is the limit Phase 8 measured and the project owner accepted — see [`phase-8-floor-plan-viewer.md`](phase-8-floor-plan-viewer.md) § the accepted limit: 4 collisions at fit-to-width, 0 at 2.5x zoom, with zoom as the chosen remedy. Asserting against a decision already taken would make this suite fail for a state the project agreed to live with, so the overlap prints as a `!` note.

3. Each of the ten booth markers is **still** a button and **still** offers a pointer cursor. This is the group that fails if someone "fixes" this by making every marker inert.

4. A booth marker with no company attached is not a control, offers no pointer cursor, and opens no card. Any such marker already present gets all three checks — *round 2 found the first version running only the weakest one in that case, so real drift in the data downgraded the check exactly when it mattered.* When none exists, the check creates one, reads it, and deletes it, invalidating the `floor-plan` cache tag **both before and after**, because the map payload is held for five minutes.

**One console message is reported but not asserted:** a next-auth `CLIENT_FETCH_ERROR` for `/api/auth/session`. Measured at **0.4 seconds, during sign-in, before the map screen loads**, and a page left idle on the map for 45 seconds produces none at all. It is unrelated to the card. Any console error that is *not* this one fails the run.

### Step 4 — what the card actually looks like [contract]

```
node scripts/third-opinion-booth-card.mjs
```

This is the check that Phase 8 did not have and needed. It measures the card's geometry against the map's and writes pictures to `/tmp/phase9-shots`.

**Pass criterion**, at **390 × 844** for the company with the most offerings:

| Measurement | Required |
|---|---|
| `content needs … px` | reports **fits without scrolling** |
| `website link visible` | **true** |
| `offering chips visible` | all of them, e.g. `7 of 7` |
| `close control visible` | **true** |
| `overhang beyond the map … above` | **0px** |

Recorded on 2026-08-02: map window 366 × 275, card 366 × 317, fits without scrolling, 7 of 7 chips, link visible, 166px of overhang **below** the map into empty page. At 768 and 1280 the card fits inside the map with no overhang at all.

The same run also stresses the layout with content far longer than the seed holds — a 64-character unbroken company name, a tagline that is a long bare URL, and an over-long offering chip — written into the live page rather than into the shared database. **Pass criterion: `long-content stress: nothing overflows the card` at all three sizes.**

**Then open `/tmp/phase9-shots/phone-390-most-offerings.png` and `phone-390-long-content-stress.png` and look at both.** The numbers above are necessary and not sufficient; Phase 8 shipped with 111 passing assertions and an unreadable map.

### Step 4b — tapping a position, judged only by the words on screen [contract]

```
node scripts/third-opinion-tap-by-position.mjs
```

**Pass criterion.** `Results: 10 passed, 0 failed`.

Step 3 finds each marker by `data-pin-sponsor` and reads the card's `data-booth-card-sponsor`. Both attributes are written from the same value in the same component, so that check proves the card agrees with itself. It would still pass if the card were wired to the wrong marker in a way that kept the two consistent.

This step removes every shared handle. It works out where each marker must be from the **x and y percentages stored in the database** and the picture's measured box, clicks those raw screen coordinates, and then compares only the **text a delegate reads** — heading, stand line, tagline, offering chips, link address — against the database row for the company whose position was clicked. Nothing connects the tap to the answer except the product itself.

Recorded 2026-08-02: all ten, for example `clicking the position stored for P-01 shows "Shopify", Stand P-01, 7 offerings`.

### Step 4c — the view is restored, measured in pixels [contract]

```
node scripts/third-opinion-view-restored.mjs
```

**Pass criterion.** `Results: 5 passed, 0 failed`, which requires both of:

- **the restore** — fewer than 1% of pixels differ and no pixel differs by more than 8 of 255;
- **the control** — deliberately nudging the map afterwards is rejected by that same comparison.

Step 3 proves this criterion by reading the map layer's CSS transform before and after. That value is written by the code under test, so a consistently-wrong write would pass. This step photographs the map window instead, with the view zoomed **and** panned first — at fit-to-width the map cannot move at all, so a restore check there would pass whatever the card did.

**The tolerance is not a convenience and must not be widened.** Byte-identity was tried first and reported a correct restore as a failure: two screenshots of a map that had **not** moved differed in 27 pixels of 100,650, by at most 2 of 255, scattered across the whole picture. That is how the renderer rounds edges between frames. The control is what keeps the tolerance honest — recorded 2026-08-02, a twelve-pixel nudge produced **34,899 differing pixels by up to 197**, against 27 by up to 2 when restored.

### Step 5 — the size the card's data adds to the map response [contract]

The decision of record is that the card's contents travel inside `GET /api/data/map` rather than being fetched on tap. That decision rests on a measurement, so the measurement is a step.

```
sqlite3 packages/db/prisma/dev.db \
  "SELECT SUM(length(tagline)+length(website)+length(solutionsOffering)),
          COUNT(*) FROM Sponsor s JOIN Pin p ON p.sponsorId = s.id WHERE p.type='BOOTH';"
```

**Pass criterion.** The total is **under 20,000 characters**. Recorded 2026-08-02: **1,913 characters across 10 companies, 191 each** — under 2.5 KB once wrapped in the response format.

The threshold is deliberately far above the measured value. It is not a tight budget; it is the point at which the fetch-on-tap design that was rejected should be reconsidered, which the requirements document puts at "a few hundred booths."

### Step 6 — a rebuilt database produces the same cards [contract]

The check for finding F-10. Run when the seed, the sponsor definitions or the hall layout change.

```
DB=/tmp/wbr-rebuild-check.db
rm -f $DB
cd packages/db && DATABASE_URL="file:$DB" npx prisma db push --schema=./prisma/schema.prisma --skip-generate
DATABASE_URL="file:$DB" SEED_BATCH_INTERVAL_MS=0 ./node_modules/.bin/ts-node \
  --compiler-options '{"module":"CommonJS"}' ./prisma/seed.ts
```

**Pass criterion**, comparing the rebuilt database against `packages/db/prisma/dev.db`:

- **Ten companies carry a booth number**, the same ten, and every one is identical on name, tagline, website, logo path and offerings.
- Their roster produces **10 stands in 4 rows at 28.5 / 45.5 / 62.5 / 79.5 percent**, which is what `apps/attendee/public/maps/exhibit-hall.png` was drawn from and what the working database stores for all ten markers.

Recorded 2026-08-02: both hold, zero differences. Before the repair the same rebuild produced eight companies in three rows at 31.3 / 54.0 / 76.7, with no offerings at all.

### Step 7 — the negative controls [contract]

```
bash docs/smoketests/playwright/phase-9-negative-controls.sh
```

Seven controls, each breaking exactly one shipped behaviour and each required to be caught by a failure count **predicted in advance and written in the script**. Three data controls run in seconds; four browser controls rebuild and restart the app and take roughly two minutes each.

**Pass criterion.** `Controls: 7 passed, 0 failed`. A control caught by the wrong number is a finding, not a pass — it means the suite measures something other than what it claims.

**One control was corrected once, and the reason is in the script rather than quietly fixed.** The map-switching control first removed a single safeguard and the suite stayed green, failing gate 4. Closing the card on a map switch is protected **twice**: `chooseMap()` clears the open marker id, and the card is resolved only from the active map's markers. The corrected control removes both, and its prediction was re-derived and written down before the re-run.

---

## Step summary

| Step | Category | Environment | Expected | Status (filled by runner) |
|---|---|---|---|---|
| 1. Regression baselines | contract | local prod build | 44 / 57 / ALL PASSED / ALL PASSED / 93 | |
| 2. Data behind the card | contract | anywhere | 178 passed, 0 failed | |
| 3. Card in a real browser | contract | local prod build, 390×844 | 219 passed, 0 failed | |
| 4. What the card looks like | contract | local prod build, 3 sizes | fits, link visible, all chips | |
| 4b. Tap by position, read the words | contract | local prod build, 390×844 | 10 passed, 0 failed | |
| 4c. View restored, in pixels | contract | local prod build, 390×844 | 5 passed, 0 failed | |
| 5. Added response size | contract | anywhere | under 20,000 characters | |
| 6. Rebuilt database | contract | throwaway database | 10 companies, 4 rows, 0 differences | |
| 7. Negative controls | contract | local prod build | 7 passed, 0 failed | |

Every step is a contract check. **No perf-bar step is defined for this phase**, and that is a decision rather than an omission: the phase adds under 2.5 KB to one response and no new network request, no new route, and no new query. Step 5 measures the only quantity that could grow. The lantern-model finding — that inlined base64 images inflate simulated scores five to ten times — is about values three orders of magnitude larger and does not apply here.

---

## Pass / fail

**Pass** when all seven steps meet their criteria and the picture in Step 4 has been looked at by a person.

**Fail** on any count that differs from the expected value, in either direction. A suite reporting *more* passes than expected is as much a defect as one reporting fewer: it means the assertion set changed without this document changing.

---

## Re-run trigger

Re-run in full when any of these change:

- `apps/attendee/components/map/FloorPlanClient.tsx`
- `apps/attendee/lib/floor-plan-data.ts` or `apps/attendee/app/api/data/map/route.ts`
- `packages/db/prisma/seed-sponsors.ts` or `packages/db/prisma/seed.ts`
- `scripts/floor-plan-demo-venue.mjs`, `scripts/seed-floor-plan.mjs` or `scripts/build-floor-plan-maps.mjs`
- The `Sponsor` model in `packages/db/prisma/schema.prisma`

Steps 4 and 6 in particular: Step 4 is the only one that would notice a layout change making the card unusable, and Step 6 the only one that would notice the seed drifting from the database again.

---

## Open item this phase does not close

**The demonstration reads the deployed database, and its exhibiting-company rows have not been checked.**

Everything above is measured against `packages/db/prisma/dev.db` on the engineering machine. The deployed participant app and every Vercel preview read a shared Turso database instead, and no credentials for it exist locally, so its sponsor rows could not be inspected from here. If those rows lack taglines or offerings, the cards render with those sections absent — which no local run would reveal.

`scripts/migrate-sponsor-card-fields.mjs` exists for this. It **reports only** unless given `--apply`, deliberately, because a write there is a live write to the data a demonstration will read:

```
node scripts/migrate-sponsor-card-fields.mjs            # report what would change
node scripts/migrate-sponsor-card-fields.mjs --apply    # write it
```

Run against the local database on 2026-08-02 it reported **6 changes, all filling empty taglines on companies that do not exhibit**, and **no change to any of the ten booth companies** — which is the expected result and a check on the script itself.

**This needs the project owner's decision**, because it is a live write and because the report should be read before it is applied.

---

## A second open item, accepted rather than fixed

**A sponsor editing their own profile does not refresh the booth card for up to five minutes.** Finding F-13.

Phase 9 moved tagline, website and offerings into the cached map response so a tap needs no second request. Those fields are written by `apps/sponsor/app/api/profile/route.ts` whenever a company representative edits their profile — and enumerated across all four apps, **no writer anywhere revalidates the `floor-plan` tag**. The string does not appear in `apps/web`, `apps/sponsor` or `apps/meetings` at all.

So the sponsor portal shows the new tagline at once while delegates keep the old one until the 300-second cache expires. Nobody sees wrong information, only information up to five minutes old, and it self-corrects.

**Decision: accepted for 2026-08-11; the fix is scheduled against Phase 10**, whose acceptance criteria already require floor-plan invalidation and have been widened to name sponsor-profile writes as a second class of writer. The work is cross-app and would change request handlers in two applications this phase does not touch.

**What would change that decision:** the demonstration script coming to include editing a sponsor profile and then showing the map.

## What green here does not mean

Green is evidence about the assertions listed above and nothing wider.

It says nothing about the organizer's upload tool (Phase 10) or pin authoring (Phase 11), and it says nothing about whether the deployed database holds these company values — see the open item above. **The release gate is a dry-run with the project owner, and it has not happened for this phase or any earlier one.**
