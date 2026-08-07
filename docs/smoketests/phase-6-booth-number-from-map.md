# Phase 6 Smoketest — Booth number assigned from the floor plan marker

> Plan: `.claude/plans/wbr-uat-followups-2026-08-07.md` § Phase 6
> PRD: `.claude/docs/prds/wbr_uat_followups_2026_08_07.md` (findings UF-1 to UF-4, UF-16)
> Written to `docs/smoketests/CONTRACT.md`.

## What this verifies

1. An organizer can type a booth number while placing a marker, and it is stored on the company — plan AC 1, 2.
2. An organizer can change a booth number on a marker already saved — the gap reported in the acceptance run — plan AC 3.
3. A delegate's map shows the number rather than the company name once one is set — plan AC 6.
4. The booth number is the organizer's alone: what the organizer sets is what the representative sees, the sponsor's own control cannot edit it, and the sponsor save address refuses the field even when sent directly — plan AC 4, 5.
5. The number box appears only where there is a company to attach it to — plan AC 7.
6. Switching a draft marker between Booth and Room no longer discards what was already entered, and a marker saved as a Room stores no company — plan AC 8, 9.

**No perf-bar step.** Nothing in this phase changes a cached payload's size or a render path. The one new write reaches delegates through the existing floor-plan invalidation, which Phase 10 and Phase 11 already measure. Stated rather than omitted, per CONTRACT.md §2.4.

## Prerequisites for the runner

- Signed in to the admin application as `wbr@test.com` / `password123` (ORGANIZER).
- At least one venue map uploaded.
- A second browser or a private window signed in to the participant application, for steps 3, 6 and 10.
- A terminal able to send requests carrying the sponsor session cookie, for step 8.

### The two named companies, and why they are named

The steps below name the company to use rather than saying "any company", because two of
them are not interchangeable.

- **Gorgias** — seeded with no booth number, so its picker entry reads `— no booth number
  yet`. Used for steps 1 to 6. This is the state the acceptance run reported having no
  screen to fix.
- **Tailor ERP** — seeded with `P-03`, and the only exhibiting company with a
  representative login: `sponsor@test.com` / `password123`. Used for steps 7 and 8, which
  need that portal open. Picking any other company leaves the runner with no way to sign
  in as it, which is what made an earlier draft of step 2 unrunnable.

If the seed has been re-run or the numbers have drifted, read the current values first:

```
sqlite3 packages/db/prisma/dev.db "select name, boothNumber from Sponsor where name in ('Gorgias','Tailor ERP');"
```

### Every notice ends with a sentence about delegates

The booth-number notices are two sentences, not one. The first names what changed; the
second says whether the participant app was told. So the full text is either

- `Booth number set to B-77. Delegates can see the change now.` — the invalidation reached
  the participant app, or
- `Booth number set to B-77. Delegates will see the change within a few minutes.` — it did
  not, and that app will pick the change up when its own five-minute cache expires.

Either ending passes. Which one appears depends on whether this deployment can reach the
participant app, and locally that means `ATTENDEE_APP_URL` or its `http://localhost:3001`
fallback. The criteria below quote the first sentence only; do not fail a step because the
second sentence is present.

### The sponsor portal lags, and a reload does not fix it — open a new tab

The organizer's write does not invalidate the sponsor portal's caches — accepted and
recorded as UF-17. Two sit in the way: the profile address caches for 60 seconds
server-side (`unstable_cache` tagged `sponsor-<id>`, which only that company's own save
clears), and the browser holds the answer as well.

**Measured during the 2026-08-07 run: reloading the profile tab did not clear it.** That tab
kept showing the old number for more than two minutes of repeated reloads, while
`/api/profile/sponsor-data` fetched from the same page already returned the new value — so
the server cache had expired and the browser's had not. Opening the profile in a **new tab**
showed the new value immediately.

So where a step below reads the portal after an organizer's change, open it in a new tab
rather than reloading. A stale value in a tab that was already open is this phase's
documented behaviour, not a failure.

---

## Steps

### Step 1 — A booth number typed while placing a marker is stored [contract]

**Verifies:** the draft form's booth number reaches the company record, and the picker stops describing that company as having none.

1. Open **Floor Plan**, press **Show map** on any map, click an empty spot on the picture.
2. In the draft form, choose **Gorgias**, whose entry reads `— no booth number yet`.
3. A **Booth number** box appears. Type `B-77`.
4. Press **Save marker**.

**Pass criteria** — all four:
- A notice reads `Booth number set to B-77.`
- The marker appears on the map.
- Re-opening the company picker shows `Gorgias — booth B-77`.
- The marker's own label still reads **Gorgias**, not `B-77`. This is expected and recorded as UF-16: the organizer's screen labels by company, the delegate's by number.

### Step 2 — The number survives a reload [contract]

**Verifies:** the value was written to the database rather than held in the browser.

1. Reload the Floor Plan page. Open the company picker.

**Pass criteria** — both:
- The picker reads `Gorgias — booth B-77`.
- The database holds it, independently of any screen:
  ```
  sqlite3 packages/db/prisma/dev.db "select boothNumber from Sponsor where name='Gorgias';"
  ```
  prints `B-77`. On a hosted tier, read the same row through that environment's database
  console instead.

### Step 3 — A delegate's map shows the number [contract]

**Verifies:** the write reaches the participant application, and the marker label rule differs there by design.

1. In the participant application, open the map screen. Allow up to the documented refresh interval, or reload.

**Pass criteria:**
- The marker placed in step 1 reads `B-77`, not `Gorgias`.

### Step 4 — A saved marker's number can be changed [contract]

**Verifies:** the gap reported during the 2026-08-05 acceptance run — a marker saved with no number had no screen to supply one.

1. On Floor Plan, click the marker placed in step 1 to select it.
2. The selected-marker form shows a **Booth number** box containing `B-77` and a **Save** button.
3. Change it to `B-78` and press **Save**.

**Pass criteria** — all three:
- A notice reads `Booth number set to B-78.`
- The company picker in the same form updates to `Gorgias — booth B-78` without a page reload.
- The **Save** button is disabled before any edit is made, and re-enabled once the value differs from the stored one.

### Step 5 — A number can be cleared [contract]

**Verifies:** an empty box from the selected marker clears the value, rather than being ignored.

1. With the same marker selected, empty the **Booth number** box and press **Save**.

**Pass criteria:**
- A notice reads `Booth number cleared.`
- The picker returns to `Gorgias — no booth number yet`.
- The helper line under the box reads `No booth number yet — delegates see the company name instead.`

### Step 6 — The delegate's map returns to the company name [contract]

**Pass criteria:**
- After the refresh interval or a reload, the marker on the participant map reads `Gorgias` again.

### Step 7 — The organizer's number reaches the sponsor's own portal, which cannot edit it [contract]

**Verifies:** two things at once, because they need the same portal open — that what the
organizer set is what the representative sees, and that the representative has no control
to change it.

This is the one step that uses **Tailor ERP**, because `sponsor@test.com` is the only
exhibiting company's representative login. Read the *up to about two minutes behind* note
in the prerequisites before judging a stale value a failure.

1. On Floor Plan, place a marker for **Tailor ERP** or select an existing one, and set its
   **Booth number** to `Z-01`. The seed gives it `P-03`, so this is a change, not a first
   assignment.
2. In a separate window, sign in to the sponsor portal as `sponsor@test.com` /
   `password123` and open **Profile**.
3. Back on Floor Plan, with the same marker selected, empty the box and press **Save**.
4. Open the sponsor portal profile **in a new tab**. Do not reload the tab from step 2 —
   see the note above; that tab will keep showing `Z-01`.

**Pass criteria** — all four:
- At step 2, **Booth Number** displays `Z-01` — the number the organizer set, not the seeded
  `P-03`.
- It is plain text: there is no text input in that field, and no disabled input either.
- The line beneath reads `Assigned by the event organizer.`
- In the new tab at step 4, the field reads `Not assigned yet`.

### Step 8 — The sponsor save address refuses the field when sent directly [contract]

**Verifies:** ownership is enforced at the address, not only hidden in the screen. A guard that lives only in a browser is not a guard.

1. With the `sponsor@test.com` session cookie, send a `PATCH` to the sponsor application's
   `/api/profile` carrying `{"boothNumber":"Z-99"}`.

**Pass criteria** — both:
- The response status is `403` and the body's `error` reads `The booth number is set by the event organizer and cannot be changed here.`
- Tailor ERP's stored number did not become `Z-99`. Read it directly rather than through a
  screen, because the portal's own answer may still be cached:
  ```
  sqlite3 packages/db/prisma/dev.db "select boothNumber from Sponsor where name='Tailor ERP';"
  ```
  prints an empty result — the cleared state step 7 left it in.

### Step 9 — The number box appears only with a company chosen [contract]

**Verifies:** the box is not offered where there is nothing to attach the value to.

1. Click an empty spot to start a new draft marker. Leave the company picker on `Choose a company…`.
2. Switch the draft to **Room**.

**Pass criteria** — both:
- With no company chosen, no **Booth number** box is present in the draft form.
- With the draft set to Room, no **Booth number** box is present.

### Step 10 — The Booth/Room toggle keeps what was entered [contract]

**Verifies:** the defect reported on the acceptance call — switching to Room discarded the company already chosen.

1. Start a new draft marker. Choose **Gorgias**. Press **Room**. Type `Ballroom A`. Press **Booth**.
2. Press **Room** again and press **Save marker**.

**Pass criteria** — all four:
- After pressing **Booth** in step 1, **Gorgias** is still selected in the company picker.
- The **Booth number** box is empty, not carrying anything typed before the company changed.
- Switching back to Room shows `Ballroom A` still typed.
- The saved room marker holds **no company**, observed in the participant application's map
  payload rather than in the organizer's form. In the participant window open
  `/api/data/map` and find the entry whose `label` is `Ballroom A`:
  - its `sponsor` field is `null`, and
  - there is an entry labelled `Ballroom A` at all. If a company had been stored, that
    marker would be labelled `Gorgias` instead and no `Ballroom A` entry would exist.

  The organizer's own form cannot show this. It branches on the marker's type, so a room
  marker carrying a company would still draw the room fields and no company picker — the
  criterion this step used to carry would have passed either way.

---

## Step summary

| Step | Category | Tier | Pass |
|---|---|---|---|
| 1 — number typed while placing is stored (Gorgias) | contract | n/a | PASS |
| 2 — survives reload, present in the database | contract | n/a | PASS |
| 3 — delegate map shows the number | contract | n/a | PASS |
| 4 — saved marker's number can be changed | contract | n/a | PASS |
| 5 — number can be cleared | contract | n/a | PASS |
| 6 — delegate map returns to company name | contract | n/a | PASS |
| 7 — number reaches the portal, which cannot edit it (Tailor ERP) | contract | n/a | PASS |
| 8 — sponsor save address refuses the field | contract | n/a | PASS |
| 9 — box appears only with a company | contract | n/a | PASS |
| 10 — Booth/Room toggle keeps entries, room stores no company | contract | n/a | PASS |

No perf-bar steps in this phase; see *What this verifies* for why.

## Restore after the run

The run leaves three changes behind. Put them back, so a re-run starts from the state the
prerequisites describe and so a shared database is not left carrying test values.

```
sqlite3 packages/db/prisma/dev.db "update Sponsor set boothNumber=null where name='Gorgias'; update Sponsor set boothNumber='P-03' where name='Tailor ERP';"
```

Then delete the markers placed during steps 1, 7 and 10 from the Floor Plan screen.

On a hosted tier this matters more, not less: a Vercel preview reads and writes the same
database as production, so every value above is a live write.

## Pass / fail

**PASS — all ten contract steps, run 2026-08-07.**

Environment: tier D (`pnpm dev`) for all three applications against the local
`packages/db/prisma/dev.db`. Valid for this document because every step is a contract check,
which CONTRACT.md §1.1 defines as environment-agnostic; there are no perf-bar steps.

Evidence for the steps whose criteria are not simply "the screen says X":

- **Step 2.** `select boothNumber from Sponsor where name='Gorgias'` returned `B-77` while
  the picker read `Gorgias — booth B-77`.
- **Step 3.** The participant map drew the marker as `B-77` beside the seeded `P-01`,
  `G-01`, `S-01` stands, while the organizer's own map drew the same marker as `Gorgias` —
  the two label rules of UF-16, both observed in one run.
- **Step 8.** `PATCH /api/profile` with `{"boothNumber":"Z-99"}` and the Tailor ERP
  representative's session answered `403` and
  `The booth number is set by the event organizer and cannot be changed here.` The stored
  value did not become `Z-99`.
- **Step 10.** The participant map payload carried one entry labelled `Ballroom A`, of type
  `ROOM`, with `sponsor: null`, and still exactly one Gorgias entry — so the room marker
  stored no company.
- **UF-20, checked directly.** With Gorgias chosen and `G-99` typed, switching the picker to
  Tailor ERP emptied the booth-number box. Before that fix, pressing Save would have written
  `G-99` onto Tailor ERP.

Two defects in this document were found by running it, and both are fixed above rather than
recorded as failures of the code: the notice criteria omitted the second sentence every
notice carries, and step 7 said to reload the portal tab when reloading demonstrably does not
clear the stale value.

Nothing was left behind: both companies were returned to their seeded values (Gorgias none,
Tailor ERP `P-03`) and the two markers placed during the run were deleted, taking the Exhibit
Hall map back to its original ten and the `Pin` table back to 25 rows.

One environment note, not a defect in this change: the admin Floor Plan screen warns that
`ATTENDEE_APP_URL` is unset. The `http://localhost:3001` fallback works when both
applications run on one machine, and every notice in this run ended
`Delegates can see the change now.`, so the invalidation did reach the participant app.

## Re-run trigger

Re-run in full if any of these change: the booth-number address or its validator; the sponsor profile save address's allowlist; the marker label rule in either application; the floor-plan invalidation path.
