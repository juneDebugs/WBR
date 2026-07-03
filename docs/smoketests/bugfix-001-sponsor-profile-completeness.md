# BUG-001 Smoketest — sponsor profile completeness

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`; source: engineer-local bugfix PRD § BUG-001 (gitignored).

## What this verifies

- Saving the sponsor profile invalidates the dashboard's `['sponsor-data']` React Query cache, so the dashboard shows fresh data on return (AC-1).
- The same save also invalidates the profile page's own `['sponsor-profile']` cache (AC-2).
- The `completeness()` function treats empty multi-select fields (persisted as the string `"[]"`) as missing, not filled (AC-3, AC-4).
- End-to-end: from a partial-profile state, saving all 18 tracked fields (with all three array fields non-empty) results in the dashboard showing 100 % on return, within one navigation hop (AC-5).

All steps are contract checks per CONTRACT.md §1.1. No perf-bar checks — BUG-001 is a correctness fix, not a performance change.

## Prerequisites for the runner

- Sponsor app reachable at one of the four tiers:
  - **Tier A (production, post-merge):** the deployed prod URL for `apps/sponsor`.
  - **Tier B (Vercel preview, pre-merge):** the preview URL generated for the PR against `main`. Recommended pre-merge gate.
  - **Tier C (local prod build):** `pnpm --filter sponsor build && pnpm --filter sponsor start` — reachable at http://localhost:3003.
  - **Tier D (local dev mode):** valid for contract checks (this smoketest has no perf-bar checks). Reachable at http://localhost:3003 via `pnpm --filter sponsor dev`.
- Seeded sponsor account per `packages/db/prisma/seed.ts`: default `sponsor@shopify.com` / `sponsor123`.
- Browser with DevTools (Chrome / Chromium recommended for the Network panel observations).
- Playwright + chromium installed if running the automated variant (`docs/smoketests/playwright/bugfix-001-sponsor-profile-completeness.mjs`).

## Steps

### Step 1 — Save triggers fresh /api/sponsor-data request [contract]

**Verifies:** AC-1 — after a successful save, `['sponsor-data']` is invalidated and a fresh `GET /api/sponsor-data` request fires.

- [ ] Log in to the sponsor portal with the seeded sponsor credentials.
- [ ] Open Chrome DevTools → Network tab. Filter for `/api/`.
- [ ] Navigate to `/profile`. Wait for the editor to render.
- [ ] Populate at least one previously-empty field (any of the 18 tracked fields; tagline is the simplest).
- [ ] Click "Save changes". Wait for the "Saved & synced" indicator to appear.
  - **Pass:** After the `PATCH /api/profile` response (200), a fresh `GET /api/sponsor-data` request appears in the Network panel. The request fires before the "Saved & synced" indicator becomes visible (because R3-F1 fix awaits invalidation before showing success).
  - **Fail:** No `GET /api/sponsor-data` request appears after the PATCH response. The cache is not being invalidated. AC-1 broken.

### Step 2 — Save triggers fresh /api/profile/sponsor-data request [contract]

**Verifies:** AC-2 — the same save invalidates `['sponsor-profile']`.

- [ ] Continuing from Step 1, in the same Network panel filter for `/api/profile/sponsor-data`.
  - **Pass:** After the `PATCH /api/profile` response (200), a fresh `GET /api/profile/sponsor-data` request appears in the Network panel.
  - **Fail:** No `GET /api/profile/sponsor-data` request appears. The profile-page cache is not being invalidated. AC-2 broken.

### Step 3 — Dashboard shows 100 % after all-fields save [contract]

**Verifies:** AC-5 — end-to-end percentage refresh in one navigation hop.

- [ ] Still logged in, navigate to `/profile` and populate every visible field:
  - All text inputs (tagline, description, website, contact name/email/phone, headquarters, booth, socials, etc.).
  - All selects (company size, revenue range, founded year — pick any value).
  - Upload / URL for logo and hero image (URL mode is fastest; any valid URL works).
  - Chip fields: tick at least one chip in each of Solutions offering, Solutions seeking, Target industries, Target company sizes, Target revenues.
- [ ] Click "Save changes". Wait for "Saved & synced".
- [ ] Navigate to `/dashboard`.
  - **Pass:** The dashboard's "Profile completeness" indicator shows **100 %**. The "Complete your profile" missing-list section shows no array-field labels.
  - **Fail:** Percentage is under 100 %, OR the missing list still shows any field. AC-5 broken.

### Step 4 — Empty multi-selects count as missing [contract]

**Verifies:** AC-3 and AC-4 — after clearing the three array fields (Solutions offering, Solutions seeking, Target industries), those field labels appear in the dashboard's missing list. Empty arrays persist as `"[]"` in the DB; the fix must not treat that string as filled.

- [ ] Navigate back to `/profile` (still logged in).
- [ ] In each of the three array-field sections (Solutions offering, Solutions seeking, Target industries), click every currently-selected chip to un-tick it. Leave the group empty.
- [ ] Click "Save changes". Wait for "Saved & synced".
- [ ] Navigate to `/dashboard`.
  - **Pass:** The dashboard's "missing" list now shows all three labels: "Solutions offering", "Solutions seeking", "Target industries". The percentage drops accordingly.
  - **Fail:** Any of the three labels does NOT appear in the missing list. The `completeness()` function is treating `"[]"` as truthy — AC-3/AC-4 broken.

### Step 5 — Automated Playwright equivalent [contract]

**Verifies:** all four ACs deterministically via network-event observation + DOM inspection.

- [ ] From the repo root:
  ```bash
  SPONSOR_BASE_URL=<tier-B-preview-url-or-http://localhost:3003> \
    node docs/smoketests/playwright/bugfix-001-sponsor-profile-completeness.mjs
  ```
  - **Pass:** Script exits 0. Output shows all AC checks as `✓`. Total: 5 or 6 passed, 0 failed.
  - **Fail:** Script exits 1 with one or more `✗` lines. Each failure line identifies which AC broke.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Save triggers fresh /api/sponsor-data | contract | any tier | |
| 2. Save triggers fresh /api/profile/sponsor-data | contract | any tier | |
| 3. Dashboard shows 100 % after all-fields save | contract | any tier | |
| 4. Empty multi-selects count as missing | contract | any tier | |
| 5. Automated Playwright equivalent | contract | Tier B or C recommended | |

## Pass / fail

BUG-001 ships when:

- Steps 1 – 4 PASS on Tier B (Vercel preview) as the pre-merge gate.
- Step 5 (Playwright automated equivalent) PASS on the same Tier B URL as pre-merge self-verification.
- Steps 1 – 4 PASS on Tier A (production) post-merge as confirmation before the parallel engineer's weekend UAT begins.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/sponsor/components/ProfileEditor.tsx` (specifically `handleSave` and cache-invalidation call sites).
- `apps/sponsor/components/DashboardView.tsx` (specifically `completeness()` and the `ARRAY_FIELDS` set).
- `apps/sponsor/lib/hooks.ts` (`useInvalidate`, `useSponsorData`, `useSponsorProfile`).
- `apps/sponsor/app/api/profile/route.ts` (the PATCH handler, especially if the future-work cleanup to write `null` instead of `"[]"` lands).

Per PRD §8.1 (referenced from prior sprint conventions), a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance.

## Notes on the R3 timing tightening

Post-Codex R3, `handleSave` now awaits `Promise.all([invalidate.sponsor(), invalidate.profile()])` **before** setting the "Saved & synced" indicator. Practical consequence for this smoketest: the fresh `/api/sponsor-data` and `/api/profile/sponsor-data` requests fire BEFORE the visible success indicator. If Step 1 or Step 2 fails, this ordering suggests something else has regressed — the intended contract is that invalidation completes prior to the UI signaling success.
