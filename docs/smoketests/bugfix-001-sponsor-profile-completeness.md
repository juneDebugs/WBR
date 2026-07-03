# BUG-001 Smoketest — sponsor profile completeness

**What this verifies:** the sponsor portal's "Profile Score" percentage updates correctly after saving the profile, and empty multi-select fields (Solutions offering / Solutions seeking / Target industries) count as missing rather than filled.

**Who this is for:** a human running the test manually on their laptop, or an AI agent following the same steps. No prior WBR knowledge required.

**Time to run:** 5–10 minutes.

---

## 1. Which apps you need

**Only one:** `apps/sponsor` (the sponsor portal, port 3003).

BUG-001 lives entirely inside this app. You do NOT need to spin up `apps/web`, `apps/attendee`, or `apps/meetings` for this test.

---

## 2. Prerequisites

Assumes you've already cloned the repo and set up dependencies at least once. If this is your first time on this laptop:

```bash
# From the repo root — /Users/<you>/Work/sandbox/WBR or wherever you cloned.
pnpm install                                         # install dependencies
pnpm --filter @conference/db exec prisma generate    # generate Prisma client
pnpm --filter @conference/db exec prisma db push     # apply schema to local SQLite
pnpm --filter @conference/db exec tsx prisma/seed.ts # seed demo accounts + data
```

You can skip these if you've run the app locally before and the DB isn't stale.

**Sanity check:** you should have a file at `packages/db/prisma/dev.db` (the local SQLite database).

---

## 3. Start the sponsor app

```bash
# From the repo root.
pnpm --filter sponsor dev
```

**How you know it's ready:** the terminal shows

```
▲ Next.js 15.5.15
- Local:        http://localhost:3003
- Network:      http://192.168.x.x:3003
- Environments: .env.local

✓ Starting...
✓ Ready in <N>ms
```

Leave this running in one terminal.

**If you see `Error: listen EADDRINUSE: address already in use :::3003`**, port 3003 is already occupied. Find and kill the process:

```bash
lsof -i :3003 -P -n | tail -n 1   # copy the PID from column 2
kill <PID>                        # then retry `pnpm --filter sponsor dev`
```

---

## 4. Log in

1. Open a browser (Chrome or Chromium recommended so you can use DevTools) to **http://localhost:3003**.
2. You should land on the login page.
3. Enter:
   - **Email:** `sponsor@shopify.com`
   - **Password:** `sponsor123`
4. Click **Sign in**.
5. You should land on **http://localhost:3003/dashboard** — the sponsor portal home page.

**Success signal:** the page header says "Welcome back, Shopify Rep" and shows four stat cards along the top (Total Requests / Pending / Confirmed / **Profile Score**).

**If login redirects you back to `/login`:** the seed data may be stale or missing. Re-run `pnpm --filter @conference/db exec tsx prisma/seed.ts`.

---

## 5. Known quirk before you start (read this)

The seeded Shopify sponsor's Logo URL is `/sponsors/shopify.png` — a **relative** path. HTML5 URL validation on `<input type="url">` rejects relative paths, so **if you open the profile editor and click Save without changing anything, the browser silently refuses to submit and no save happens**. No error message; the page just does nothing.

This is a pre-existing app quirk **unrelated to BUG-001**. To work around it in the tests below, we replace the Logo URL with a valid absolute URL as the first step in the editor.

---

## 6. Test 1 — Save triggers cache invalidation (AC-1 + AC-2)

**What this verifies:** after saving the profile, the dashboard's cached data is invalidated, so returning to the dashboard shows the updated percentage immediately rather than stale data.

### Steps

1. Open Chrome DevTools (Cmd+Opt+I on Mac / F12 on Windows). Go to the **Network** tab. In the filter box, type `sponsor-data` to narrow to just the calls we care about.
2. In the dashboard, click **Edit profile →** in the "Profile Completeness" card (middle of the page). You land on `http://localhost:3003/profile`.
3. Find the **Logo** field (near the top). Change the value from `/sponsors/shopify.png` to `https://example.com/logo.png`. This is the workaround for the seed-data quirk.
4. Change the **Tagline** field — replace whatever's there with `Testing BUG-001 fix`.
5. Click the **Save Changes** button (top right of the page, next to the "Saved & synced" indicator area).

### What you should see (pass)

- Within ~1 second, a green **"Saved & synced"** indicator appears next to the Save Changes button.
- In the DevTools Network tab, you see two new requests almost immediately:
  - `GET /api/sponsor-data` — status 200
  - `GET /api/profile/sponsor-data` — status 200
- These fire **before** the "Saved & synced" indicator appears (that's the R3 fix — save-success signal waits for the cache refetch to complete).

### What failure looks like

- No "Saved & synced" indicator appears — save was blocked. Check that the Logo field is a valid absolute URL (starts with `http://` or `https://`).
- Only a `PATCH /api/profile` request appears in Network, but no follow-up `GET /api/sponsor-data`. The cache invalidation didn't fire — **AC-1 broken**.
- `PATCH` and `GET /api/sponsor-data` fire, but no `GET /api/profile/sponsor-data`. The profile-page cache invalidation didn't fire — **AC-2 broken**.

---

## 7. Test 2 — Dashboard shows fresh percentage after save (AC-5)

**What this verifies:** after saving the profile with all 18 tracked fields populated, the dashboard shows **100%** on return within one navigation hop (no stale-render flicker).

### Steps

1. From the profile editor (still open from Test 1), fill in every remaining empty field:

   - **Tagline** — anything (already filled in Test 1).
   - **Company Description** — a sentence or two.
   - **Logo** — already `https://example.com/logo.png` from Test 1.
   - **Hero / Banner Image URL** — `https://example.com/banner.png`.
   - **Website** — `https://example.com`.
   - **Founded Year** — `2020` (or any year).
   - **Headquarters** — `San Francisco, CA` (or anything).
   - **Company Size** — select any option from the dropdown.
   - **Annual Revenue** — select any option.
   - **Booth Number** — `P1` (or any string).
   - **Contact Name / Email / Phone** — any values (email must look like an email).
   - **LinkedIn** — `https://linkedin.com/company/test`.
   - **Twitter / X** — `https://twitter.com/test`.
   - **Solutions & Categories** — tick at least one chip (e.g. `Email Marketing`).
   - **Solutions They're Looking For** — tick at least one chip.
   - **Industries** — tick at least one chip.

2. Click **Save Changes**. Wait for "Saved & synced" to appear.

3. Click **Dashboard** (top nav) OR navigate to **http://localhost:3003/dashboard**.

### What you should see (pass)

- The **Profile Score** stat card (top row, far right) shows **100%**.
- The **Profile Completeness** card (middle-left of the page) shows:
  - A **green** progress bar filled to the end.
  - Text "100% complete" underneath.
  - **No "Missing fields:"** section (that section only appears when there are missing fields).

### What failure looks like

- Profile Score shows a percentage < 100 %. **AC-5 broken.** The completeness function isn't counting all filled fields.
- Progress bar is amber/orange (that's the "below 80%" color) — same failure as above.
- "Missing fields:" list still appears with entries — indicates specific fields aren't being counted as filled.

---

## 8. Test 3 — Empty multi-select fields are counted as missing (AC-3 + AC-4)

**What this verifies:** the `completeness()` function correctly treats empty arrays (persisted as `"[]"` in the database) as missing, not as filled. This is the core Defect B fix.

### Steps

1. Navigate back to **http://localhost:3003/profile**.

2. Scroll down to **Solutions & Categories**. Un-tick every currently-selected chip in this group. (Selected chips have a colored background; unselected have white.) Leave the group with **zero chips selected**.

3. Do the same for **Solutions They're Looking For** and **Industries**. All three chip groups should have zero chips selected when done.

4. Click **Save Changes**. Wait for "Saved & synced" to appear.

5. Navigate back to **http://localhost:3003/dashboard**.

### What you should see (pass)

- The **Profile Completeness** card's percentage **drops** by ~15–17 percentage points (three of the 18 fields are now empty; each field is worth ~5.5 percentage points).
- Under **Missing fields:**, all three of these labels appear:
  - `Solutions offering`
  - `Solutions seeking`
  - `Target industries`

### What failure looks like

- The percentage does NOT drop, or drops by less than expected — the completeness function is still treating empty arrays as filled. **AC-3 and AC-4 broken**.
- One or more of the three field labels does NOT appear in the missing list — same failure, specific to those fields.
- If exactly one or two labels appear but not all three, check that you actually un-ticked every chip in each group (Playwright verification saw this exact partial-failure pattern during dev).

---

## 9. Automated equivalent

If you'd rather run all three tests as a single command instead of clicking through the UI:

```bash
# In a new terminal, from the repo root (leave the sponsor dev server running).
node docs/smoketests/playwright/bugfix-001-sponsor-profile-completeness.mjs
```

**What you should see (pass):**

```
[BUG-001] Sponsor profile completeness verification @ http://localhost:3003

── Step 1: successful save invalidates sponsor-data + profile-sponsor-data (AC-1 + AC-2) ──
  ✓ AC-1: /api/sponsor-data refetch fired 0ms after PATCH response
  ✓ AC-2: /api/profile/sponsor-data refetch fired 0ms after PATCH response

── Step 2: dashboard renders fresh percentage post-save (AC-5) ──
  ✓ AC-5: dashboard shows 100% after all-fields save

── Step 3: empty arrays are counted as missing in completeness() (AC-3 + AC-4) ──
  ✓ PATCH /api/profile with empty arrays returned 200
  ✓ AC-3/4: "Solutions offering" appears in dashboard "missing" list after empty-array PATCH
  ✓ AC-3/4: "Solutions seeking" appears in dashboard "missing" list after empty-array PATCH
  ✓ AC-3/4: "Target industries" appears in dashboard "missing" list after empty-array PATCH

────────────────────────────────────────────────────────────
  Results: 7 passed, 0 failed
```

**Exit code 0 = pass. Exit code 1 = at least one assertion failed** — the specific failure line identifies which AC.

**If the script fails**, it may print a `[dbg] N form element(s) failing HTML5 validation` block naming any inputs whose current values are invalid. That's almost always the seed-data quirk from §5 — a relative URL somewhere in the seed. The script auto-repairs URL inputs whose values fail the format regex; if you see this diagnostic, the auto-repair didn't cover the specific field. Contact the engineer of record.

**Where the script runs:** the default is `http://localhost:3003` (this local dev server). To run against a Vercel preview URL instead:

```bash
SPONSOR_BASE_URL=https://<your-preview-url>.vercel.app \
  node docs/smoketests/playwright/bugfix-001-sponsor-profile-completeness.mjs
```

---

## 10. Step summary

| # | What we verified | Category | Result |
|---|---|---|---|
| 1 | Save invalidates `/api/sponsor-data` cache (AC-1) | contract | |
| 2 | Save invalidates `/api/profile/sponsor-data` cache (AC-2) | contract | |
| 3 | All-fields save → dashboard 100 % (AC-5) | contract | |
| 4 | Empty multi-selects counted as missing (AC-3 + AC-4) | contract | |
| 5 | Playwright automated equivalent | contract | |

Fill in the "Result" column as you go: PASS / FAIL. If FAIL, note which specific step's pass criterion didn't match.

---

## 11. What to do if a test fails

- **Save button appears to do nothing** — check DevTools Console for errors, and verify the Logo field is `https://example.com/logo.png` (or any valid absolute URL). If not, that's the seed-data quirk (§5).
- **Server console shows `⚠ Critical dependency: the request of a dependency is an expression`** — this warning is pre-existing and harmless. Not related to BUG-001.
- **Percentage drop / missing list doesn't match** — take a screenshot of the dashboard's Profile Completeness card and the profile editor's chip groups. Ping the engineer of record with both screenshots + which step failed.
- **`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL sponsor@1.0.0 typecheck` on typecheck** — likely a stale Prisma client after pulling `main`. Run `pnpm --filter @conference/db exec prisma generate` then retry.
- **Playwright times out on locator** — the sponsor dev server may have compiled a stale page. Kill and restart the dev server (see §3 for the `lsof` + `kill` steps).

---

## 12. Ship criteria for the parallel engineer's weekend UAT

BUG-001 has shipped when:

- Steps 1 – 4 (manual) OR Step 5 (automated) PASS on the Vercel preview deploy for this PR.
- Same test run against the production URL PASSES within 15 minutes of the merge (as Tier A confirmation).
- No regressions surface during 7/4–7/5 UAT on the sponsor dashboard or profile save flow.

If any assertion FAILS post-merge on production, the rollback path is documented in the PR body — `git revert <merge-SHA>` on a fresh branch → open revert PR → merge → Vercel auto-redeploys prior state.

---

## 13. Re-run trigger

Re-run this full smoketest whenever a downstream change touches:

- `apps/sponsor/components/ProfileEditor.tsx` (especially `handleSave` and cache-invalidation call sites).
- `apps/sponsor/components/DashboardView.tsx` (especially `completeness()` and the `ARRAY_FIELDS` set).
- `apps/sponsor/lib/hooks.ts` (`useInvalidate`, `useSponsorData`, `useSponsorProfile`).
- `apps/sponsor/app/api/profile/route.ts` (the PATCH handler, especially if the future-work cleanup to write `null` instead of `"[]"` lands).
