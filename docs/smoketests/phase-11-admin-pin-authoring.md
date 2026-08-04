# Phase 11 Smoketest — the organizer places markers on a map

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`.

**Source:** `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md` § Phase 11, and
`.claude/docs/prds/wbr_floor_plan_and_linkedin_prd_2026_07_21.md` § Implementation Decisions and
finding **F-19**. User stories FP 25, 26, 27, 28, 30.

**Every step is a contract check.** Phase 11 makes no quantitative performance claim, so there is no
perf-bar step and no environment tier to satisfy. That is a property of this phase rather than an
omission: the criteria are all about what happens or does not happen, not about how long it takes.

**One address in this phase did not exist when the phase was written.** Finding F-19: the admin app could
display no map picture at all, and tapping a picture is the whole of FP 25. Step 2 covers it.

---

## What this verifies

- An organizer sees each map's picture on the authoring screen — both an uploaded map and a seeded one —
  served from this app's own address. (F-19; plan § Phase 11 criterion 1)
- Clicking a spot on the picture places a marker there, stored as percentages of the picture's width and
  height. (FP 25)
- A booth marker takes its exhibiting company from a list that shows each company's booth number. (FP 26)
- A room marker takes a typed name. (FP 27)
- A placed marker can be moved — by selecting it and clicking the destination — and deleted. (FP 28)
- A saved marker reaches the participant map screen at the placed spot, **with the participant cache
  populated beforehand**, so the invalidation is what makes it appear rather than an empty cache. (FP 30)
- Every marker write clears the participant app's `floor-plan` cache tag.
- The `floorPlan` permission key is enforced at each of the three marker addresses **and** at the picture
  address, not only on the screen.
- Creating, moving and deleting a marker are each scoped to the active conference, and a booth marker
  cannot be linked to a company from another conference.
- A booth marker with neither a company nor a typed name is refused, at the address as well as on screen.
- A long room name, and one with no spaces in it, stay inside the picture.
- The 25 seeded markers and the three seeded maps are unchanged, field by field, and no fixture row is
  left behind.

---

## Prerequisites for the runner

- The admin app on **3000** and the participant app on **3001**, both started with `next start` in
  production mode. The meetings and sponsor apps are not needed.
- All four apps read one database at `packages/db/prisma/dev.db`. The `apps/*/dev.db` copies are inert —
  **but see the next item, which is how that stops being true.**
- **Before starting the admin app, check that `apps/web/.env.production.local` does not exist.** If it does,
  move it aside for the duration and put it back afterwards.

  Why this matters more than it looks: that file is written by `vercel env pull` and contains
  `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, the deployed database's address and token.
  `packages/db/src/client.ts` prefers those two over `DATABASE_URL` whenever both are present — so
  `next start` in `apps/web` connects to the **deployed** database, silently, and every local measurement is
  taken against live data. Setting `DATABASE_URL` on the command line does **not** help; the Turso variables
  win over it.

  Discovered 2026-08-03/04 the expensive way: the admin app was restarted mid-session, every fixture sign-in
  began failing with `[auth] User not found` because the fixture accounts exist only in the local file, and a
  sign-in as the shared organizer account reached production and incremented that account's login counter.
  One counter, no data lost — but the same mistake during a step that writes markers would write them to the
  live floor plan. Recorded as finding F-23.

  ```
  # check, and move aside if present
  [ -f apps/web/.env.production.local ] && mv apps/web/.env.production.local /tmp/env.production.local.aside
  # ... run the smoketest ...
  # put it back
  [ -f /tmp/env.production.local.aside ] && mv /tmp/env.production.local.aside apps/web/.env.production.local
  ```

  **Confirm which database the app reached before trusting any step:** sign in as a fixture account, which
  exists only in the local file. If that sign-in fails while the shared organizer account succeeds, the app
  is on the deployed database — stop and move the file aside.
- The seeded floor plan present: three maps and 25 markers. Restore with
  `node scripts/seed-floor-plan.mjs --local packages/db/prisma/dev.db` if it is not.
- Playwright available. Scripts must live inside the repository.
- The admin app's build must match its source before any measurement — Step 0.

---

## Steps

### Step 0 — the running build matches the source [contract]

**Verifies:** that every number below describes the code in the tree rather than an older build. Phase 10
drew three false conclusions from stale builds, the sharpest being six suite runs read as a worsening
fault when the apps were serving a build from before the last fix.

```bash
find apps/web -type f \( -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/.next/*' -not -path '*/node_modules/*' \
  -newer apps/web/.next/BUILD_ID | grep -v '.env'
```

- [ ] Run the command above.
  - **Pass:** no output. The build is at least as new as every source file.
  - **Fail:** any file listed. Rebuild with `(cd apps/web && npx next build)` and restart before
    continuing.

### Step 1 — the regression baselines still hold [contract]

**Verifies:** that Phase 11 changed nothing it did not intend to. The prediction was written into the plan
before Phase 11's code existed: this phase adds markers rather than altering seeded ones, so Phase 8 and
Phase 9 hold at their recorded counts.

- [ ] `node docs/smoketests/playwright/phase-8-floor-plan-viewer.mjs`
  - **Pass:** `Results: 93 passed, 0 failed`
  - **Fail:** any other count. Movement here is a finding, not a tolerance.
- [ ] `node docs/smoketests/playwright/phase-9-booth-company-card.mjs`
  - **Pass:** `Results: 219 passed, 0 failed`
  - **Fail:** any other count.
- [ ] `pnpm test:floor-plan`, `pnpm test:booth-card`, `pnpm test:onboarding-policy`
  - **Pass:** `57 passed`, `178 passed`, `44 passed`, each with 0 failed.
  - **Fail:** any other count.
- [ ] `pnpm test:roles` and `pnpm test:access`
  - **Pass:** `all unit checks passed` and `ACCESS COUNTS TEST PASSED`. Both hold lists of permission
    keys, so a new key can break them.
  - **Fail:** anything else.

### Step 2 — the organizer's screen shows the map picture [contract]

**Verifies:** finding F-19. Before this phase the screen computed a thumbnail address and never rendered
it; a seeded map's picture file is served only by the participant app; and an uploaded map's picture is
deliberately withheld from the page. The address added here answers for both kinds, behind the same four
guards as its sibling map addresses.

- [ ] Sign in to the admin app as an organizer, open **Floor Plan** from the sidebar, and press
      **Show map** on any map's row.
  - **Pass:** the floor plan is visible in the panel that opens.
  - **Fail:** a blank area, a broken-image icon, or no panel.
  - **The button press is not optional and is easy to leave out of an instruction.** There is no picture on
    the Floor Plan screen itself — only a list of maps with their marker counts — because F-19 decided
    against a thumbnail in the list. The picture exists only inside the panel. On 2026-08-04 a first check
    of a deployment found no picture; the deployment's log showed **no request for a picture at
    all**, which is what a missed button press looks like and is distinguishable from a shipped-file
    failure, where the log carries a 404 and the route's own warning naming the path it tried. That
    distinction is the fastest way to tell the two apart, so check the log before changing any code.
  - The button was called **Markers** until 2026-08-04. It named
    what an organizer would do next rather than what pressing it does. While the panel is open it reads
    **Hide map** — a matched pair with **Show map**, replacing **Done**, so both halves of the one button
    name the same action in opposite directions. Both words and both accessible names are asserted, because
    every other reference to this button in the script uses its test id and would not notice the text
    changing.
- [ ] With DevTools Network open, read the request for the picture.
  - **Pass:** `GET /api/floor-plan/maps/<id>/image` returns **200** with `Content-Type: image/png` (or
    `image/jpeg` for an uploaded map) and `Cache-Control: private, max-age=60`.
  - **Fail:** 404, 403, or a `public` cache instruction. `public` invites a shared cache to hand a guarded
    picture to somebody else.
- [ ] In a browser with no session, request the same address.
  - **Pass:** **401**, and no image bytes in the body.
  - **Fail:** 200.

Covered in the script by 6 assertions, including a byte-for-byte comparison of an uploaded map against
the bytes stored and of a seeded map against the committed copy at `apps/web/assets/maps/`.

### Step 3 — placing a booth marker from the screen [contract]

**Verifies:** FP 25 and FP 26 through the screen an organizer actually uses, and the rule that a booth
marker needs a company or a name.

- [ ] Click an empty spot on the picture, roughly three tenths across and four tenths down.
  - **Pass:** a dashed marker labelled **New** appears at the click, and a form opens below.
  - **Fail:** nothing appears, or the marker appears somewhere else.
- [ ] Press **Save marker** without choosing a company.
  - **Pass:** a red message appears naming what is missing — it contains the word "company" — and **no row
    is written**. Check with
    `sqlite3 packages/db/prisma/dev.db "select count(*) from Pin where venueMapId='<map id>'"`.
  - **Fail:** the marker saves, or the message does not say what to do.
- [ ] Choose a company from the list and press **Save marker**.
  - **Pass:** the marker is drawn with the company's name, and the stored row has `type='BOOTH'`, the
    chosen `sponsorId`, and `x` and `y` within 3 of 30 and 40.
  - **Fail:** no row, the wrong type, or a position more than 3 percentage points from the click.
- [ ] `curl` the address directly with neither a company nor a label:
      `POST /api/floor-plan/maps/<id>/pins` with `{"type":"BOOTH","x":20,"y":20}`.
  - **Pass:** **400**, and the message names the company.
  - **Fail:** 201. The screen checks this rule in the browser too, so this step is the only one that
    checks the handler — which is where the rule lives.

### Step 4 — the company list surfaces booth numbers [contract]

**Verifies:** FP 26. The list has to show the booth number so an organizer can tell two similarly named
companies apart, and it needs no new sponsor-side data entry because the field already exists.

- [ ] Open the company list on a new booth marker.
  - **Pass:** a company with a booth number reads `<name> — booth <number>`; a company without one reads
    `<name> — no booth number yet`. Both are present in the list.
  - **Fail:** a bare name, or a company with no booth number missing from the list entirely.

### Step 5 — a room marker, and what the address refuses [contract]

**Verifies:** FP 27, and that the rules hold for requests that did not come from the screen.

- [ ] Click an empty spot, press **Room**, type `Ballroom A`, save.
  - **Pass:** the marker is drawn with that name; the stored row has `type='ROOM'`, `label='Ballroom A'`,
    and `sponsorId` null.
  - **Fail:** any of those wrong.
- [ ] `POST` a room with `{"type":"ROOM","x":10,"y":10,"label":"   "}`.
  - **Pass:** **400**, message names the room's name.
  - **Fail:** 201, or a marker stored with a blank name — the participant app would drop it, so it would
    be visible to the organizer and invisible to every delegate.
- [ ] `POST` a room carrying a company id as well.
  - **Pass:** **400**.
  - **Fail:** 201.

### Step 6 — moving and deleting a marker [contract]

**Verifies:** FP 28, and the decision of 2026-08-03 that a marker moves by selecting it and clicking the
destination rather than by dragging.

- [ ] Click an existing marker.
  - **Pass:** it changes appearance and `data-pin-selected` reads `true`; the instruction line reads
    "Click the map to move this marker".
  - **Fail:** nothing changes.
- [ ] Click a different spot on the picture.
  - **Pass:** the selected marker moves there, the stored `x` and `y` change to match within 3, and **the
    other markers do not move**.
  - **Fail:** the marker stays, a new marker is created instead, or another marker also moves.
- [ ] With nothing selected, click the picture.
  - **Pass:** a new marker form opens and no stored row changes.
  - **Fail:** an existing marker moves.
- [ ] Select a marker, press **Delete marker**, then **Yes**.
  - **Pass:** it disappears, its row is gone, and the count drops by exactly one.
  - **Fail:** the row survives, or more than one row goes.

### Step 7 — a saved marker reaches the delegate [contract]

**Verifies:** FP 30, and the criterion the `floor-plan` cache can silently break. The participant map read
is cached for 300 seconds. **Placing a marker and seeing it appear proves nothing unless the cache was
populated first** — otherwise it appears because the cache happened to be empty.

- [ ] Sign in to the participant app as a delegate with a complete profile and open `/api/data/map`. This
      populates the cache.
  - **Pass:** 200, and the fixture map is listed with no markers on it.
  - **Fail:** 401 or 403 — the delegate's profile is incomplete and every later observation in this step
    would be meaningless.
- [ ] Place a marker as the organizer, then read `/api/data/map` again as the same delegate.
  - **Pass:** the new marker is present, carrying the company's name, its booth number, and the placed
    position.
  - **Fail:** absent. A marker writer that does not call `revalidateAttendeeFloorPlan(...)` looks
    completely correct on this machine for up to five minutes and then starts working.
- [ ] Delete the marker and read again.
  - **Pass:** it is gone from the delegate's response.
  - **Fail:** still present.

### Step 7b — a booth marker is never an unlabelled dot [contract]

**Verifies:** finding F-20. A booth marker rendered `boothNumber ?? '•'`, so a company with no booth number
appeared on the delegate's map as a blank circle. **10 of the 20 seeded exhibiting companies have no booth
number**, and placing an exhibitor before booth numbers are assigned is the normal order of events.

- [ ] Place a booth marker for a company with no booth number, then open the delegate's map and switch to that
      map.
  - **Pass:** the marker's text is the company's name.
  - **Fail:** a bullet, or empty. Asserted on the rendered marker, not the map response — the response always
    carried the name.
- [ ] Read a marker whose company DOES have a booth number.
  - **Pass:** it still shows the booth number, not the name.
  - **Fail:** the name. Replacing every booth number with a company name would satisfy the step above and
    break the map for the ten seeded booths.

### Step 7c — a BLANK booth number counts as no booth number [contract]

**Verifies:** finding F-22, raised by adversarial review round 4 and completed by round 6. Step 7b's fix
handled a booth number that is **absent**. It did not handle one that is **blank**, and the two arrive by
different routes.

The marker chose its pill width by asking "is the booth number a non-empty value?" and its text by asking
"is the booth number missing?". Those disagree for the empty string, so a company stored with `''` drew a
wide pill containing nothing — the same blank marker step 7b exists to remove, reached by a different value.
Whitespace-only reached it through the other branch.

**Why the empty string is not a hypothetical value.** `apps/sponsor/components/ProfileEditor.tsx` starts the
booth-number field at `sponsor.boothNumber ?? ''` and sends it on **every** save, and
`apps/sponsor/app/api/profile/route.ts` stores what it is sent without trimming. So a company with no booth
number is written as `''` the first time its representative saves their profile for any reason at all —
editing a tagline is enough. That is the majority of the ten seeded companies without a booth number.

All of this is checked against a fixture company the script creates, never a seeded one, because the check
rewrites the booth number four times.

- [ ] For each of four stored values in turn — nothing, an empty string, whitespace only, and `Z-42` — read
      the rendered marker on the delegate's map.
  - **Pass:** the first three show the company's name; the fourth shows `Z-42`.
  - **Fail:** any blank pill, or the name where the real booth number should be. The fourth case is the
    counterpart: treating every value as blank would satisfy the first three and break the ten seeded booths.
- [ ] Confirm each of those four readings is **this** case's render and not the previous one's.
  - **Pass:** the marker's position matches the position that case moved it to. Each case uses a different
    one.
  - **Fail:** the previous case's position. Raised by review round 5: the three blank cases all expect the
    same text, so without this a stale render satisfies them while measuring nothing. The move that clears
    the participant app's cache must also answer 200 and report `delegatesNotified` true — an unchecked
    clearing step is how an assertion comes to pass on stale data.
- [ ] Tap a marker whose company's booth number is whitespace, and read the card that opens.
  - **Pass:** the card shows no Stand line at all.
  - **Fail:** a Stand line reading `Stand` with nothing after it. Raised by review round 6: the card was a
    second reader of the same field and it had not been fixed, so the marker and the card disagreed. The
    guarantee now lives at one boundary, `apps/attendee/lib/floor-plan-data.ts`, rather than in each
    component.
- [ ] Tap a marker whose company DOES have a booth number.
  - **Pass:** the card names that booth number.
  - **Fail:** no Stand line. Hiding it for everybody would satisfy the step above.

### Step 8 — the permission key at every address [contract]

**Verifies:** that a hidden screen is not the enforcement boundary. Phase 10's review round 2 found its
three map addresses checking only the caller's role, so a role with the key switched off could still
upload, reorder and delete by calling them directly.

**The permission must be revoked through the app's own save path — `PUT /api/roles` — and never by writing
the `RolePermission` row.** Role permissions resolve through a cache that only that path clears. Phase 10
wrote the row directly, the app kept serving the permissive answer, and the delete aimed at a seeded map
destroyed the exhibit hall and its ten markers. Twice.

- [ ] Revoke **Floor Plan** for STAFF, then as a staff account call create, move and delete on a marker
      **this run created**, and request a map picture.
  - **Pass:** all four answer **403**, and nothing changed — the marker is still at its position and no new
    row exists.
  - **Fail:** any 2xx, or any row changed.
- [ ] Make the identical four requests as an organizer, who holds the permission.
  - **Pass:** create **201**, move **200**, delete **200**, picture **200**.
  - **Fail:** any refusal. Without this pairing, an address that refused everybody would satisfy the step
    above while being useless.
- [ ] Restore the role configuration **through `PUT /api/roles`**, then sign in as staff again and place a
      marker.
  - **Pass:** the row matches what it was, **and** the marker saves (201) — which is the only way to know
    the app's cached permissions were cleared as well as the row rewritten.
  - **Fail:** 403 after restore. The database says restored and the running app disagrees.

### Step 9 — the conference boundary at every address [contract]

**Verifies:** that all three marker verbs carry the boundary. Phase 10's rounds found one of two
symmetrical paths scoped and the other not; there are three here.

- [ ] Against a map belonging to a different, inactive conference, call create, move and delete.
  - **Pass:** all three **404** — the same answer a map that does not exist gets, so the address cannot be
    used to find out which old ids are real. The other conference's marker is untouched at its position.
  - **Fail:** any 2xx, or that marker moved or vanished. Deleting across the boundary would take another
    conference's markers with it.
- [ ] Put a company from the other conference on a booth marker, then one from this conference.
  - **Pass:** **400** then **201**. The company's name, logo, tagline, website and offerings all reach the
    participant map through that link, so an unscoped link discloses another event's exhibitor.
  - **Fail:** the first succeeds, or the second fails.
- [ ] Name an existing marker id against a map it is not on.
  - **Pass:** **404**, **and** the other conference's marker is still at its position when the row is read
    afterwards.
  - **Fail:** anything else. The second half is not redundant: negative control 4 showed that with both
    guards removed the write lands and the scoped read-back then answers 404, so **a 404 is not evidence
    that nothing was written.**

### Step 10 — long and unbroken room names [contract]

**Verifies:** that organizer-typed free text cannot cover the map. Phase 9's review round 2 measured the
booth card overflowing at 390 pixels when the longest seeded company name is 12 characters; a room name is
the first organizer-typed text to reach this screen.

- [ ] `POST` a room name of 61 characters.
  - **Pass:** **400**, and the message contains the number **60**. A refusal, never a silent truncation —
    an organizer who types a long name and gets a shorter one has no way to tell what happened.
  - **Fail:** 201, or a message that does not say the limit.
- [ ] Save two names of exactly 60 characters: one with spaces, one with none.
  - **Pass:** both accepted, and each marker's measured box stays inside the picture's box, within 4 pixels
    for its own border.
  - **Fail:** either marker extends past the edge of the picture.

### Step 11 — the review findings cannot come back [contract]

**Verifies:** the four defects adversarial review round 1 found in the product, each with an assertion that
would fail if the fix were removed. See `docs/codex-reviews/phase-11-admin-pin-authoring.md`.

- [ ] `POST` positions of `null`, `[]`, `true`, `"  "`, `"50"` and `[50]`.
  - **Pass:** all six **400**, a real number still **201**, and the row count grows by exactly one.
  - **Fail:** any accepted. `{"x": null}` used to store 0, putting a marker in the top-left corner at a
    position nobody chose, with nothing failing and nothing logged.
- [ ] Delete the same marker twice, then move a marker that has been deleted.
  - **Pass:** first delete **200**, second **404**, the move **404**.
  - **Fail:** **500** on the second or on the move — the organizer is told the app broke rather than that
    the marker is gone.
- [ ] Place a marker through the screen; insert a second marker directly into the database; place a third
      through the screen. **Do not reload the page** — a reload mounts the component with no local edits
      and would pass whether or not the defect is present.
  - **Pass:** the directly-inserted marker becomes visible.
  - **Fail:** it never appears. A local edit used to shadow the server for the rest of the session, hiding
    every change another organizer made.

### Step 12 — nothing seeded was disturbed, nothing was left behind [contract]

**Verifies:** the rule that everything destructive targets rows this run created. Phase 10 destroyed the
seeded exhibit hall and its ten markers twice by aiming a delete at a seeded map.

- [ ] Compare the seeded markers before and after, **field by field** rather than by total.
  - **Pass:** all 25 rows identical in id, map, type, x, y, company and label; the three seeded maps keep
    their switch positions and their stored picture paths.
  - **Fail:** any difference. A total alone cannot tell "unchanged" from "one deleted, one added
    elsewhere".
- [ ] Check the fixture rows are gone, by explicit id.
  - **Pass:** zero fixture users, maps, conferences and markers remain, and `RolePermission` is as it was.
  - **Fail:** anything left. A fixture map left behind changes what every later suite sees.

### Step 13 — the negative controls [contract]

**Verifies:** that the assertions above can fail. A green suite proves nothing until it has been shown to
go red. Nine controls, each breaking one behaviour and requiring the suite to fail **by the number
predicted in the script before any of them ran**.

```bash
bash docs/smoketests/playwright/phase-11-negative-controls.sh
# one control only:
bash docs/smoketests/playwright/phase-11-negative-controls.sh "coerce"
```

Five gates per control: the edit applies; the build succeeds; the app answers and the port is held by this
run's own process; at least one assertion starts failing; and the count equals the prediction. Failures are
compared **by assertion name**, not by count — Phase 10 marked two correct predictions wrong by comparing
counts that both contained noise.

| # | Break | Predicted |
|---|---|---|
| 1 | the picture address ignores the floor-plan permission | caught by 1 |
| 2 | the picture address serves any conference's map | caught by 1 |
| 3 | positions are coerced from null, lists and booleans again | caught by 3 |
| 4 | a vanished marker is not noticed at all | caught by 3 |
| 5 | the conditional write catches a marker that vanished | **absorbed — suite stays green** |
| 6 | a local edit shadows the server forever | caught by 1 |
| 7 | nothing tells the delegate a marker was placed | caught by 4 |
| 8 | creating a marker ignores the conference boundary | caught by 1 |
| 9 | a booth can be saved with no company and no name | caught by 1 |

Control 7 predicts four because when the marker never arrives, the three assertions about what it should
show cannot run either, and this suite reports an un-runnable group as named failures rather than skips.

**Controls 4 and 5 are a pair, and they were retargeted after the first run.** Their first version predicted
one failure each from breaking only the conditional write, and both verdicts came back wrong: control 5
reported `GATE 4 FAILED: no assertion started failing`, and control 4 named two assertions that had nothing
to do with deletion.

The reason is worth carrying: **`resolve()` answers 404 for a missing marker before either write is
reached**, so the sequential cases the suite exercises — deleting the same marker twice, moving one that has
been deleted — are caught by that guard rather than by the conditional write. Removing the conditional write
is invisible to them.

So control 4 removes **both** guards, which is the only way to reach the write with a marker that is gone,
and control 5 removes **only the first** and requires the suite to stay green — which is what shows the
conditional write is carrying the weight. A control that is absorbed is not a weaker check: gate 1 still
proves the edit applied, so a green suite cannot be explained by nothing having changed.

**Control 4 also surfaced something its first version did not predict.** With both guards gone, naming an
existing marker against a map it is not on **updates another conference's marker**, because the write no
longer carries the map condition. That is the third of its three failures, and it means the conditional
write is also what enforces the cross-map boundary at the moment of writing.

- [ ] Run the script.
  - **Pass:** `Controls: 9 caught as predicted, 0 not` — eight caught by their predicted counts, one
    absorbed.
  - **Fail:** any control caught by the wrong number, or the absorbed one going red. That is a finding about
    the suite, not a tolerance — a prediction adjusted after seeing the result is not a prediction.

### Step 14 — the whole script [contract]

- [ ] `node docs/smoketests/playwright/phase-11-admin-pin-authoring.mjs`
  - **Pass:** `Results: 85 passed, 0 failed`
  - **Fail:** any failure, or a different total. A lower total means assertions stopped running rather than
    started passing.
  - **The count reached 85 in stages, recorded so a different total can be traced rather than guessed:** 74
    at the end of the first review cycle; 78 with the four blank-value marker assertions of Step 7c; 80 with
    the two card assertions round 6 added; 82 with the two button-wording assertions; 85 with the three
    live-push assertions of Step 7d. Takes about 5 seconds.

---

## Step summary

| Step | Category | Environment | Expected | Status (filled by runner) |
|---|---|---|---|---|
| 0. build matches source | contract | local prod build | no files listed | |
| 1. regression baselines | contract | admin 3000 + participant 3001 | 93, 219, 57, 178, 44, both green | |
| 2. the map picture appears | contract | admin 3000 | 200 + private cache; 401 with no session | |
| 3. placing a booth marker | contract | admin 3000 | stored at the click; refused without a company | |
| 4. booth numbers in the list | contract | admin 3000 | both list forms present | |
| 5. a room marker | contract | admin 3000 | typed name stored; 400 on blank and on a company | |
| 6. moving and deleting | contract | admin 3000 | select-then-click moves one marker only | |
| 7. reaches the delegate | contract | admin 3000 + participant 3001 | present after the write, cache primed first | |
| 7b. a booth marker is never a blank dot | contract | admin 3000 + participant 3001 | name shown; booth number still wins | |
| 7c. a blank booth number counts as absent | contract | admin 3000 + participant 3001 | name for none/empty/whitespace, `Z-42` for a real one, each at its own position; no empty Stand line on the card | |
| 7d. the live push, for markers | contract | admin 3000 + participant 3001 | connection opens; marker appears on an untouched screen in under 5s (measured 30-34ms) | |
| 8. the permission key | contract | admin 3000 | four 403s, four 2xx for the organizer, restored | |
| 9. the conference boundary | contract | admin 3000 | three 404s, other conference untouched | |
| 10. long room names | contract | admin 3000 | 400 naming 60; both markers inside the picture | |
| 11. round 1's findings | contract | admin 3000 | six 400s; 404 not 500; the marker appears | |
| 12. nothing disturbed | contract | admin 3000 | 25 rows identical field by field; no leftovers | |
| 13. negative controls | contract | admin 3000 + participant 3001 | 9 caught as predicted | |
| 14. the whole script | contract | admin 3000 + participant 3001 | 85 passed, 0 failed | |

---

## Pass / fail

The phase ships when:

- Every contract step passes with the admin app's build confirmed to match its source (Step 0 before any
  other step).
- Step 1's baselines are unchanged, so nothing outside this phase moved.
- Step 13's nine controls are each caught by exactly the predicted number of assertions.
- The residuals below are read and accepted, or closed.
- **A dry-run has happened.** Green automated checks are never treated as done on their own.

---

## Re-run trigger

Re-run this smoketest in full whenever a later phase touches:

- `apps/web/app/api/floor-plan/maps/[id]/image/route.ts`
- `apps/web/app/api/floor-plan/maps/[id]/pins/route.ts`
- `apps/web/app/api/floor-plan/maps/[id]/pins/[pinId]/route.ts`
- `apps/web/lib/pin-input.ts`
- `apps/web/components/FloorPlanClient.tsx`
- `apps/web/app/(dashboard)/dashboard/floor-plan/page.tsx`
- `apps/web/assets/maps/**` or the `outputFileTracingIncludes` entry in `apps/web/next.config.js`
- `apps/attendee/lib/floor-plan-data.ts` or `apps/attendee/components/map/FloorPlanClient.tsx` — the
  participant side of FP 30
- `apps/web/lib/revalidate-attendee.ts` or `apps/attendee/app/api/revalidate/route.ts` — every marker
  write depends on both

---

## Residuals — recorded, not fixed

### Residual 1 — CLOSED 2026-08-04. The pictures reach the deployed app and are found there

The three seeded pictures live at `apps/web/assets/maps/` and nothing imports them, so Next's dependency
tracing cannot see them on its own. `apps/web/next.config.js` names them under `outputFileTracingIncludes`
for the route `/api/floor-plan/maps/[id]/image`. **If that route key did not match the built route id, the
pictures would be absent from the deployed function and every seeded map's picture would answer 404 in
production while working perfectly here** — the same shape as findings F-16 and F-17.

**This was recorded as unverifiable and it was not. Checked 2026-08-03/04, and it holds.**

Next writes a `.nft.json` file beside each built route — Node File Trace, the list of every file it has
decided that route needs, and the list used to decide what is copied into the deployed function. Read
directly at
`apps/web/.next/server/app/api/floor-plan/maps/[id]/image/route.js.nft.json`:

```
total files traced into this route: 226
matches for assets/maps or .png: 3
    ../../../../../../../../assets/maps/ballroom-level.png   exists on disk: True
    ../../../../../../../../assets/maps/exhibit-hall.png     exists on disk: True
    ../../../../../../../../assets/maps/meeting-rooms.png    exists on disk: True
```

**The check can fail, which is what makes it evidence.** Three sibling floor-plan routes have no such
configuration entry and carry **zero** `assets/maps` entries each. So the pictures are in the picture
route's list because the key matched the route that was built, and for no other reason.

**How to re-check after any change to the route's folder or the config key** — the key is a route id and a
rename breaks it silently:

```
python3 -c "
import json
d=json.load(open('apps/web/.next/server/app/api/floor-plan/maps/[id]/image/route.js.nft.json'))
print(len([f for f in d['files'] if 'assets/maps' in f]), 'picture(s) traced — expect 3')"
```

**The second half is now proven too, by observation on a deployment. This residual is CLOSED.**

What remained after the tracing check was whether the running function looks for the files where they were
placed. The route resolves its path as `path.join(process.cwd(), 'assets')`, and a deployed function's
working directory cannot be observed from an engineering machine — so it could not be settled by reading.

**Observed 2026-08-04** on the pull request's preview deployment: the Floor Plan screen
was opened, **Show map** was pressed on a seeded map, and the venue floor plan rendered in the panel. That is
the whole claim — the files ship, and the function finds them.

So the class of fault that produced F-16 and F-17 did not recur here. Recording that plainly, because the
two earlier ones were both configuration that looked correct locally and had never worked in production, and
this one was the same shape and did work.

**A false alarm happened first, and how it was told apart is the reusable part.** A first look found no
picture, and it was not a picture failure at all: the picture lives inside the panel, and the
button had not been pressed. **The deployment log distinguished the two in one reading** —

- **no request for the picture at all** means the panel was never opened. Nothing is wrong with the files.
- **a request answering 404, together with the route's own warning** below, means the file is genuinely
  missing or is not where the function looks. The warning names the exact path tried.

```
console.warn(`[floor-plan/maps/${id}/image] seeded picture not readable at ${filePath}`)
```

Read the log before changing any code. On that occasion the log showed two page loads answering 200 and no
picture request, which pointed at the instruction rather than the product, and no code needed changing.
F-17's entire cost was a failure that nothing reported; this route reports both states.

Uploaded maps were never at risk either way; their bytes come from the database.

**How to re-check after any change to this route's folder or the config key**, since the key is a route id
and a rename breaks it silently: run the trace-file command above, then press **Show map** on a deployment.
Neither check substitutes for the other — the first proves the files ship, the second proves they are found.

### Residual 1b — the sponsor profile write still stores an untrimmed booth number

Raised by review round 6 and deliberately not fixed here. `apps/sponsor/app/api/profile/route.ts` stores a
submitted value as it arrives, and `apps/sponsor/components/ProfileEditor.tsx` sends the booth-number field
on every save starting from `''` when the column is null. So blank booth numbers keep being created.

Finding F-22 closes the **consequence** at the read boundary, `apps/attendee/lib/floor-plan-data.ts`, which
is where the guarantee belongs: trimming on write would stop new blanks but would not repair rows that
already hold one. Trimming on write as well is a small, separate improvement that belongs to the sponsor
portal rather than to an admin-app phase, and it needs its own assertion in the sponsor portal's suite.

### Residual 2 — CLOSED 2026-08-04. The live push is now asserted for markers

Phase 10 built a connection each open participant map screen holds, so an organizer's change refreshes the
screen without a tap, and measured it at 41 ms for a map change. This phase originally asserted only that a
marker reaches a delegate who **loads** the map screen, past the cache — not that an already-open screen
updates on its own.

That gap was carried on the grounds that the machinery is shared, so there was reason to expect it worked.
**Reason to expect is not a measurement**, and this project's record is that the untested half of a
symmetrical pair is where the defects have been: round 1 of this phase found a fix applied to one of two
matching write paths, and round 3 found the same again.

**Now measured. Step 7d, three assertions**: the phone opens the connection, a marker placed by an organizer
appears on a screen nobody touches, and it arrived by the push rather than by the safety-net timer.
**Measured at 30 to 34 ms across runs**, against Phase 10's 41 ms for a map change.

The third assertion is the one that stops the check being hollow. The participant screen also refetches on a
30-second timer, so the marker would appear eventually whether the push fired or not. The delay is compared
against 5 seconds: under that is the push, slower is the timer doing the work while the assertion takes the
credit.

**Negative control, prediction written before the run.** `publish()` in the participant app's
`/api/revalidate` was replaced so the cache was still cleared and the push was not sent. Predicted exactly
two failures, both in 7d, with every cache-path assertion in Step 7 still passing — because those go through
the cleared cache and not the push. Result: **83 passed, 2 failed**, reading
`after 20014ms the screen had not changed`. That is what shows Step 7d measures the push specifically rather
than re-measuring the cache.

Built on the shape Phase 10 reached after getting it wrong once: arm the wait for the connection **before**
navigating, and wait for the map switcher rather than the screen's container. Phase 10's first version waited
for a container that is also present on the loading state, so it wrote its change before the browser had
opened a connection — the push reached nobody, the timer rescued it, and it read as the push being broken.

### Residual 3 — the race the conditional writes close is unreachable on this machine

Round 1's finding R1-c concerns a window between checking a marker exists and writing it. The fix makes both
writes carry the same condition, so a row removed in between matches nothing and the answer is 404.

**Two assertions look like they cover this and do not.** `deleting the same marker twice answers 404` and
`moving a marker that has been deleted answers 404` are both satisfied by `resolve()`, which looks the marker
up and returns 404 before either write runs. Negative control 5 established this rather than it being
argued: with the conditional update removed, **no assertion started failing.**

What those two assertions do check is real and worth having — a marker that no longer exists answers 404
rather than a server error, so an organizer is told the marker is gone instead of that the app broke. It was
also true before the fix.

**The window the fix actually closes is a row disappearing between `resolve()` and the write.** That is a
concurrent race and it cannot be reproduced here: all four apps share one SQLite file with
`journal_mode=delete`, which permits one writer at a time. Measured in Phase 10: one upload 183 ms, four
concurrently 749 ms, a ratio of 4.09, which is queueing rather than overlapping.

The fix stays, on the same footing as Phase 10's two position races: the deployed environment reads Turso
over a network from many callers at once and has no such restriction. **A green run here is not evidence
that the concurrent case is safe.**

What the controls *can* show is which safeguard does the work, and they do: with `resolve()`'s guard removed
and the conditional writes intact the suite stays green (control 5), and with both removed three assertions
go red (control 4).

### Residual 4 — a role without the permission sees a blank map area

The picture address is guarded by the `floorPlan` key, so a role with it switched off gets 403 for pictures
as well as for writes. That is intended and matches the three write addresses. It is recorded because a
blank area where a floor plan should be is an easy thing to mistake for a broken upload, and nothing on the
screen explains it. No message was added; the screen for such a role is unreachable from the sidebar
anyway.

### Residual 5 — Phase 10's three carried criteria

Picked up on this branch by the decision of 2026-08-03 and **not yet done at the time of writing**: the
warning shown when `ATTENDEE_APP_URL` is unconfigured being observed rather than read; the posting helper's
refusal log being witnessed; and the sponsor-portal negative control being added to
`phase-10-negative-controls.sh` as a sixth entry with predicted count 1.

### Residual 6 — the equivalent restore defect in Phase 10's merged suite

`docs/smoketests/playwright/phase-10-admin-map-upload.mjs:1706` asserts
`hadRow || rowsLeft === 0`, which is true whenever a staff role row existed beforehand, and restores that
row with a direct database write that never clears the app's permission cache. Both halves of what rounds 2
and 3 found here.

Harmless on this machine, where `RolePermission` is empty. **On any machine where role permissions have
been saved, running Phase 10's suite would leave staff without the floor-plan permission and report
success** — demonstrated by this phase's negative control A. Not changed here: Phase 10 is merged and that
suite is its evidence at 92 assertions. Not scheduled.

### Residual 7 — the pre-existing double render

On a first page load this app's dashboard screens briefly render twice, for roughly 100 to 400
milliseconds. Measured on `/dashboard/speakers` and `/dashboard/staff`, which Phase 11 does not touch, so
it is pre-existing. Reproduce with `node scripts/third-opinion-phase-11-hydration-doubling.mjs`.

It matters only for measurement: while it lasts, every count on the screen is doubled. The suite waits for
one copy and asserts that it arrived rather than reaching for the first of two matches. **Cause not
investigated** — it is not this phase's, and it settles on its own.

### Residual 8 — two decisions are not an engineering call

Neither is checkable from this machine, and both must be true before an organizer can place markers on the
deployed site and have delegates see them:

- **`ATTENDEE_APP_URL` set on the `wbr-web` Vercel project** to `https://wbr-mobile.vercel.app`. Until it
  exists, no marker write reaches the participant app, however green everything is locally. There are
  duplicate projects — `wbr-web` and `wbr-admin` both build `apps/web`, `wbr` and `wbr-mobile` both build
  `apps/attendee` — so setting it on the wrong one does nothing and looks done.
- **"Floor Plan" enabled for ORGANIZER in the deployed admin app**, under Staff → Roles & Permissions. The
  local database has no saved role configuration, so the key is granted automatically here and **no local
  check can catch this.** One-time per environment; finding F-18 explains why.

---

## What green here does not mean

- **It does not mean two organizers can author at once.** The one place that was tested — a marker arriving
  from elsewhere while a screen has local edits — passes. The concurrent write windows are unreachable on
  this machine, per Residual 3.
- **It does not mean the deployed site works.** Residual 1 and Residual 8 are all unverified there, and one
  of them would make every seeded map's picture 404.
- **It does not mean the feature has been seen by a person who will use it.** A dry-run is the release
  gate and this suite is not a substitute for one.
- **It does not mean every assertion can fail.** Fifteen have now been seen to fail — four during
  development and review, and ten across the nine controls in Step 13. The other 56 are argued to be sound,
  which is weaker than measured.
