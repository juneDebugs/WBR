# Phase 12a Smoketest — Sponsor portal AI intro drafter

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`; source: WBR demo sprint PRD §6 Phase 12a, §8.1.

## What this verifies

- The `Draft intro` secondary button is absent when the `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` feature flag is off (kill-switch AC).
- The button is disabled when `canDraft === false`, and the tooltip renders the first-ordered blocker copy from `getCanDraftBlockers()` (pre-flight input gate AC).
- The high-confidence success path: AI drafts, provenance line renders, `Send intro to {name}` fires POST to `/api/request-meeting` with `{ targetUserId, message }`, card shows `✓ Requested · with intro`, `MeetingRequest.message` non-null in DB (structured-output + storage AC).
- The low-confidence path interposes a `Limited data — Send anyway?` confirm modal on Send; Cancel closes without send; Confirm proceeds (tiered friction AC).
- The AI-failure path (pattern γ): modal opens with empty editable textarea + `⚠ AI draft unavailable` banner; Send is disabled until manual text; manual send populates `MeetingRequest.message`; the confirm modal does NOT interpose (graceful degradation AC).
- The final-send failure path: a >1000-char message triggers a 400 from `/api/request-meeting`, the modal renders an inline error banner with the server's message, the textarea contents are preserved, and Send re-enables (send-error handling AC).
- A perf-bar check that the sponsor dashboard Tier B mobile Lighthouse is within ±10% of the Phase 13 mid-sprint sponsor-side snapshot (no perf regression AC).

## Prerequisites for the runner

- All four apps runnable locally per Phase 0a smoketest.
- Seeded credentials per `packages/db/prisma/seed.ts` (identities and bio content are seed data, not real users):
  - **Sponsor test account**: a demo sponsor row seeded around line ~480 of `seed.ts` with a non-null tagline. Consult the seed file for the current email/password pair; the runner should use whichever demo sponsor account has a populated tagline.
  - **Attendee target for the high-confidence path**: any seeded speaker with a bio ≥ 80 chars. Verify by querying: `sqlite3 packages/db/prisma/dev.db "SELECT id, LENGTH(bio) FROM User WHERE role='SPEAKER' AND bio IS NOT NULL ORDER BY LENGTH(bio) DESC LIMIT 3;"` — pick any hit and use its `id` in the paths below.
  - **Attendee target for the `canDraft === false` step**: any seeded attendee with a null or `< 20`-char bio (verify similarly — `sqlite3 dev.db "SELECT id FROM User WHERE bio IS NULL OR LENGTH(bio) < 20 LIMIT 1;"`).
- Chrome DevTools open (Network panel + Console).
- Playwright + chromium installed (root devDep + `npx playwright install chromium`) for Step 5 automation.
- `OPENAI_API_KEY` in the runner's environment (local shell or Vercel env, depending on tier).
- For perf-bar Step 7: Vercel preview URL for the current PR, or production URL post-merge. Local dev mode is Tier D and invalid.

## Steps

### Step 1 — Flag-off: `Draft intro` button absent [contract]

**Verifies:** The client-side feature-flag mirror (`NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED`) hides the surface entirely. Server-side flag (`WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED`) hidden by proxy.

- [ ] Ensure `NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` is unset (or set to any value other than `"true"`) in `apps/sponsor/.env.local`. Restart the sponsor app.
- [ ] Log in at `http://localhost:3003/login` with `sponsor@shopify.com / sponsor123` and land on `/dashboard`.
  - **Pass:** Zero `Draft intro` buttons render on the `RecommendedAttendees` row. The existing `Connect` button still renders. Verify by DOM inspection (`document.querySelectorAll('button')` — no button text contains `"Draft intro"`).
  - **Fail:** Any `Draft intro` button renders.

### Step 2 — `canDraft === false`: button disabled + tooltip [contract]

**Verifies:** Pre-flight input gate + tooltip precedence.

- [ ] Set `NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED="true"` in `apps/sponsor/.env.local`. Restart the sponsor app.
- [ ] Ensure at least one recommended-attendee card is targeting an attendee with `bio` null or `< 20` chars (see Prerequisites). If the current sponsor's recommendations shortlist doesn't surface such an attendee, temporarily update a seeded row: `sqlite3 packages/db/prisma/dev.db "UPDATE User SET bio = 'x' WHERE id = 'spk-3';"` (revert after this step).
- [ ] Log in at `sponsor@shopify.com` and land on `/dashboard`. Locate the recommended-attendee card whose bio fails the gate.
  - **Pass:** The `Draft intro` button on that card is disabled. Hovering renders the tooltip `"Their bio is too short — add at least 20 characters to enable AI draft."` (for `bio_too_short`) OR `"Add a bio for this attendee to enable AI draft."` (for `bio_missing`). Verify by DevTools inspection of the button's `disabled` attribute and `title` attribute.
  - **Fail:** Button enabled, OR tooltip missing/wrong copy.

### Step 3 — High-confidence success: AI draft → send → intro persists [contract]

**Verifies:** End-to-end happy path; structured AI output populates `MeetingRequest.message`.

- [ ] With the flag ON, click `Draft intro` on a card targeting the high-bio attendee id captured in Prerequisites.
  - **Pass:** Modal opens with title `Draft intro to {name}` (name matches the attendee row). Loading state visible briefly (`Drafting an intro…`). Then the textarea populates with a 3-part message (greeting + body + signoff). The provenance line `Drafted from: ...` renders below the banner (or in the banner absence, near the top of the textarea) with at least one grounded field name.
  - **Fail:** Modal fails to open, textarea stays empty on success, provenance missing.
- [ ] Verify the modal's `⚠ Limited data` banner is ABSENT for this high-confidence input (`hasSparseInputs` false; `groundedFieldsIncomplete` false — `attendee.bio` is in `groundedFields`).
  - **Pass:** No amber banner in the modal.
  - **Fail:** Amber banner present.
- [ ] Click `Send intro to {name}`.
  - **Pass:** In DevTools Network panel, a single POST to `/api/request-meeting` fires with body `{"targetUserId":"<attendee-id>","message":"..."}` (non-empty message). Response is 200 or 201 with the `MeetingRequest` record. Modal closes. The card's Connect button label changes to `✓ Requested · with intro`.
  - **Fail:** No POST fires, POST body has no message, non-2xx response, modal stays open, or card label reads `✓ Requested` without `· with intro`.
- [ ] In a separate terminal, query the DB (substitute the sponsor account's email and the target attendee id): `sqlite3 packages/db/prisma/dev.db "SELECT message FROM MeetingRequest WHERE requesterId = (SELECT id FROM User WHERE email='<sponsor-email>') AND targetUserId = '<attendee-id>' ORDER BY createdAt DESC LIMIT 1;"`.
  - **Pass:** Query returns a non-null, non-empty string (the sent intro text).
  - **Fail:** Query returns NULL or empty string.

### Step 4 — Low-confidence trigger: confirm modal interposes [contract]

**Verifies:** Tiered friction (shape E) with strict low-confidence trigger.

- [ ] Prepare a low-confidence attendee: `sqlite3 packages/db/prisma/dev.db "UPDATE User SET bio = 'Short bio.', jobTitle = NULL WHERE id = '<some-recommended-attendee-id>';"` (bio ≥ 20 chars so `canDraft` passes, but `< 80` chars and jobTitle null, so `hasSparseInputs` fires).
- [ ] Also confirm the sponsor's tagline is present and ≥ 15 chars — query the DB: `sqlite3 packages/db/prisma/dev.db "SELECT LENGTH(tagline) FROM Sponsor WHERE id = (SELECT sponsorId FROM User WHERE email='<sponsor-email>');"`. If you need `hasSparseInputs` to fire from the tagline side rather than only from bio/jobTitle, temporarily UPDATE the sponsor's tagline to a `< 15`-char string for the duration of this step.
- [ ] Click `Draft intro` on that attendee's card. Wait for the AI draft to populate the textarea.
  - **Pass:** `⚠ Limited data — Review carefully.` banner renders in the modal.
- [ ] Click `Send intro to {name}`.
  - **Pass:** A second modal (confirm) fires with title `Limited data — Send anyway?`. The first modal remains open behind it.
  - **Fail:** No confirm modal appears — send proceeds directly.
- [ ] Click the confirm modal's `Cancel`.
  - **Pass:** Confirm modal closes. No POST to `/api/request-meeting` fires (verify in Network panel).
  - **Fail:** POST fires anyway.
- [ ] Click `Send intro to {name}` again, and this time click `Send anyway` in the confirm.
  - **Pass:** Confirm closes; POST to `/api/request-meeting` fires; main modal closes on 2xx.

### Step 5 — AI failure: pattern γ manual-send fallback [contract, driven by Playwright]

**Verifies:** Graceful degradation on AI failure. Modal opens empty; banner reads `⚠ AI draft unavailable`; manual-send path bypasses the confirm modal even when `hasSparseInputs` would otherwise fire.

- [ ] Run the Playwright script (default mode = `ai-failure`; the `PHASE12A_MODE` env var can be omitted):
  ```bash
  node docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs
  ```
  The script intercepts `POST /api/recommendations/*/draft-intro` via `page.route()` and returns a 502 `{error: "ai_unavailable"}`. It then asserts the modal state via seven separate checks: (1) enabled Draft intro button found, (2) `⚠ AI draft unavailable` banner rendered, (3) draft-intro POST intercepted with 502, (4) textarea empty on pattern γ path, (5) Send disabled with empty textarea → (6) enabled after manual text, (7) confirm modal did NOT interpose on the manual-send click AND the request-meeting POST body carries the manually-typed intro text.
  - **Pass:** Script emits `✓` lines for each of the checks above and exits 0 with `Results: 7 passed, 0 failed`.
  - **Fail:** Any check fails, or the script exits non-zero.

### Step 6 — Send failure: 400 from `/api/request-meeting` renders inline banner [contract, driven by Playwright]

**Verifies:** Send-error handling — a non-2xx response from `/api/request-meeting` renders the modal's inline error banner, preserves textarea contents, and re-enables Send. The client's `MESSAGE_MAX_CHARS` gate normally prevents the 1001-char case from reaching the server through the UX, so this step drives the failure via a `page.route()` mock (following the same pattern as Step 5's AI-failure interception).

- [ ] Run the Playwright script with the `PHASE12A_MODE=send-error` env var set:
  ```bash
  PHASE12A_MODE=send-error node docs/smoketests/playwright/phase-12a-sponsor-ai-intro.mjs
  ```
  The script drafts an intro, intercepts `POST /api/request-meeting`, returns a 400 with `{"error":"Message too long (max 1000 chars)"}`, and asserts the modal state via five separate checks: (1) the POST was intercepted, (2) the inline error banner rendered with the server text, (3) the textarea contents were preserved verbatim (byte-for-byte against the pre-send snapshot), (4) the Send button re-enabled, (5) the modal remained open (no auto-close on 4xx).
  - **Pass:** Script emits five `✓` lines corresponding to the five checks above and exits 0 with `Results: 5 passed, 0 failed`.
  - **Fail:** Any of the five checks fails, or the script exits non-zero.

### Step 7 — Perf-bar: sponsor dashboard mobile Lighthouse Tier B [perf-bar tier B]

**Verifies:** No sponsor-dashboard perf regression from the new surface. Within ±10% of the Phase 13 mid-sprint sponsor-side snapshot.

**Environment required:** Vercel preview URL for the PR (Tier B). Tier A is post-merge confirmation; Tier C (local prod build) is acceptable pre-push if preview is unavailable. Tier D (dev mode) is invalid.

**Baseline:** Consult the sponsor-side mobile-perf line from `docs/smoketests/phase-7-midsprint-measurement.md` (mid-sprint) and `docs/reports/phase-13-perf-delta-report.md` (pre-sprint vs post-sprint). Record the specific metric (LCP mobile) that Phase 12a is measured against.

```bash
# 1. Grab the Vercel preview URL from the PR check surface:
#      gh pr view <PR#> --json statusCheckRollup | jq '.statusCheckRollup[]|select(.name|test("Vercel"))|.targetUrl'
#
# 2. Log in in the browser once against that URL, copy the session cookie
#    (`__Secure-next-auth.session-token`).
#
# 3. Run Lighthouse via CLI (or `npx lighthouse`) with the mobile preset:
#      npx lighthouse "<PREVIEW_URL>/dashboard" \
#        --preset=mobile \
#        --extra-headers "{\"Cookie\":\"__Secure-next-auth.session-token=<value>\"}" \
#        --output json --output-path /tmp/phase-12a-sponsor-dashboard.json --quiet
```

- [ ] Compare `audits["largest-contentful-paint"].numericValue` from the JSON output against the Phase 7 sponsor-dashboard mobile LCP baseline.
  - **Pass:** Measured LCP is within ±10% of the recorded baseline (or better).
  - **Fail:** Measured LCP is >10% higher than baseline. Investigate before merging.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Flag-off button absent | contract | anywhere | |
| 2. canDraft=false → disabled + tooltip | contract | anywhere | |
| 3. High-confidence success | contract | anywhere (needs real `OPENAI_API_KEY`) | |
| 4. Low-confidence confirm | contract | anywhere (needs real `OPENAI_API_KEY`) | |
| 5. AI failure — pattern γ | contract (Playwright) | local dev acceptable | |
| 6. Send failure — 400 too long | contract | anywhere | |
| 7. Sponsor dashboard mobile Lighthouse | perf-bar tier B | Vercel preview | |

## Pass / fail

The phase ships when:

- Steps 1–6 all PASS on a runner-appropriate environment (contract checks are env-agnostic).
- Step 7 PASS on the Vercel preview (Tier B) before merge; Tier A (production Lighthouse post-merge) is confirmation.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/sponsor/components/RecommendedAttendees.tsx`
- `apps/sponsor/components/IntroDraftModal.tsx`
- `apps/sponsor/components/DashboardView.tsx` (specifically the `scoreAttendees()` mapper)
- `apps/sponsor/app/api/recommendations/[attendeeId]/draft-intro/route.ts`
- `apps/sponsor/app/api/request-meeting/route.ts`
- `apps/sponsor/lib/ai-intro.ts`
- The feature flag `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` (server) or `NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` (client mirror).

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance." Phase 12b (AI surface production controls) explicitly re-runs this smoketest in addition to its own — no regression on high/low-confidence/pattern-γ paths is a Phase 12b AC.
