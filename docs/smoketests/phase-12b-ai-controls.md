# Phase 12b Smoketest — AI surface production controls (rate limit + cost caps)

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`; source: WBR demo sprint PRD §6 Phase 12b, §8.1.

## What this verifies

- `AiCallLog` table exists with the correct columns + indexes + unique constraint (schema AC).
- The client generates a fresh `idempotencyKey` UUID on every Draft intro click and sends it in the POST body (client contract AC).
- Successful draft-intro writes exactly one `AiCallLog` row with `costEstimateUsd`, `responsePayload`, `expiresAt = createdAt + 5s` populated (audit-write AC).
- The intro-draft modal renders a `N AI drafts remaining today` line on success and on user-cap hits (remaining-count-line AC).
- **Idempotency dedup:** POSTing twice with the same `idempotencyKey` inside the 5-second window returns byte-identical response bodies without incrementing the audit-row count (dedup AC).
- **Burst-cap (5/min):** server returns HTTP 429 `{error: "burst_limit"}`; modal renders `Slow down — try again in a minute.` and hides Send.
- **User-daily-cap (20/day):** server returns HTTP 429 `{error: "daily_limit"}`; modal renders `Daily limit reached. Resets at midnight.` and hides Send.
- **Global-daily-cap (1000/day):** server returns HTTP 503 `{error: "global_limit"}`; modal renders `AI temporarily unavailable.` and hides Send.
- The Draft intro button on `RecommendedAttendees` reflects a cap-hit state via disable + label + tooltip, driven by `GET /api/recommendations/quota` (button-level cap-hit AC).
- Phase 12a's contract paths (high-confidence, low-confidence, pattern γ, send-error) still pass — no regression (no-regression AC).
- Sponsor-dashboard Tier B mobile Lighthouse is within ±10% of the Phase 13 mid-sprint sponsor-side snapshot (no-perf-regression AC).

## Prerequisites for the runner

- All four apps runnable locally per Phase 0a smoketest.
- Sponsor test account + high-confidence attendee target per Phase 12a smoketest Prerequisites (the sponsor row must have a non-null tagline ≥ 15 chars; the attendee row must have a bio ≥ 80 chars).
- `sqlite3` CLI available for manual DB inspection + preseeding.
- `curl` available for direct-server contract checks.
- Chrome DevTools open (Network panel + Console).
- Playwright + chromium installed (root devDep + `npx playwright install chromium`).
- `OPENAI_API_KEY` in the runner's environment (local shell or Vercel env, depending on tier).
- Both feature flags `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true` (server) and `NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true` (client mirror) set + a rebuild since the client mirror is compile-time inlined.
- For perf-bar Step 11: Vercel preview URL for the current PR, or production URL post-merge. Local dev mode is Tier D and invalid.

### Environment variables the runner needs to have available

Substitute these in the SQL / curl commands below. Verify each once at the start and keep them in the runner's shell:

```bash
export DB=packages/db/prisma/dev.db                                    # or apps/sponsor/dev.db against the sponsor app
export SPONSOR_ID=$(sqlite3 "$DB" "SELECT sponsorId FROM User WHERE email='sponsor@shopify.com';")
export SPONSOR_USER_ID=$(sqlite3 "$DB" "SELECT id FROM User WHERE email='sponsor@shopify.com';")
export ATTENDEE_ID=$(sqlite3 "$DB" "SELECT id FROM User WHERE role='SPEAKER' AND bio IS NOT NULL ORDER BY LENGTH(bio) DESC LIMIT 1;")
export BASE_URL=http://localhost:3003                                  # or the Vercel preview URL for Tier B
```

## Steps

### Step 1 — `AiCallLog` schema landed [contract]

**Verifies:** Migration applied; table + indexes + unique constraint match PRD.

- [ ] Run:

  ```bash
  sqlite3 "$DB" ".schema AiCallLog"
  ```

  **Pass:** Output shows a `CREATE TABLE "AiCallLog"` statement with columns `id, userId, attendeeId, surface, createdAt, costEstimateUsd, idempotencyKey, responsePayload, expiresAt`. Followed by four indexes: unique on `(userId, attendeeId, idempotencyKey)`, plus non-unique on `(userId, surface, createdAt)`, `(surface, createdAt)`, `(userId, attendeeId, idempotencyKey, expiresAt)`.

  **Fail:** Any column missing, any index missing, unique constraint missing, or the table itself doesn't exist.

### Step 2 — Client sends fresh idempotencyKey per click [contract, driven by Playwright]

**Verifies:** Every Draft intro click generates a new UUID (via `crypto.randomUUID()` with a fallback) and includes it in the `/api/recommendations/[attendeeId]/draft-intro` POST body.

- [ ] Run:

  ```bash
  PHASE12B_MODE=idempotency-key node docs/smoketests/playwright/phase-12b-ai-controls.mjs
  ```

  The script clicks Draft intro twice on the same attendee card (with a close-in-between) and asserts (1) both POST requests carry a non-empty `idempotencyKey` string in their JSON body; (2) the two keys differ; (3) both keys are ≤ 128 chars.

  **Pass:** Script emits `✓` for each assertion, exits 0 with `Results: 3 passed, 0 failed`.

  **Fail:** Any assertion fails, or the two keys are equal.

### Step 3 — Successful send writes one `AiCallLog` row [contract]

**Verifies:** Every successful AI call persists a row with the expected fields. Consumes one cap-budget slot.

- [ ] Reset the audit log for a clean baseline:

  ```bash
  sqlite3 "$DB" "DELETE FROM AiCallLog WHERE userId='$SPONSOR_USER_ID' AND surface='sponsor_draft_intro';"
  ```

- [ ] Log in at `$BASE_URL/login` as the sponsor test account. On `/dashboard`, click Draft intro on the high-confidence attendee card. Wait for the modal's textarea to populate. Click `Send intro to {name}` (accept the confirm modal if it appears). Wait for the modal to close.

- [ ] Query the audit row (Prisma stores DateTime as INTEGER Unix-epoch-ms in SQLite, so the age diff is a plain ms subtraction):

  ```bash
  sqlite3 "$DB" "SELECT userId, attendeeId, surface, ROUND(costEstimateUsd, 6), LENGTH(responsePayload), (expiresAt - createdAt) FROM AiCallLog WHERE userId='$SPONSOR_USER_ID' AND surface='sponsor_draft_intro';"
  ```

  **Pass:** Exactly one row. `userId` matches `$SPONSOR_USER_ID`. `attendeeId` matches the target attendee id. `surface` = `sponsor_draft_intro`. `costEstimateUsd` is a small positive number (~0.00001–0.0001 for gpt-4o-mini at 200 output tokens). `LENGTH(responsePayload) > 40` (roughly the shortest possible JSON.stringify of a valid IntroDraft). The `(expiresAt - createdAt)` difference is `5000` (milliseconds).

  **Fail:** Zero rows, more than one row, any field null, cost estimate zero, or the expiry difference isn't 5 seconds.

### Step 4 — Idempotency dedup: same key returns cached payload [contract]

**Verifies:** A second POST with the same `idempotencyKey` inside the 5s window returns the winner's stored payload without a new AI call and without a new audit row.

- [ ] Clear the audit log:

  ```bash
  sqlite3 "$DB" "DELETE FROM AiCallLog WHERE userId='$SPONSOR_USER_ID' AND surface='sponsor_draft_intro';"
  ```

- [ ] Fetch a valid session cookie by logging in via the browser once, then grab the `next-auth.session-token` (or the Vercel-Preview `__Secure-` variant) value.

  ```bash
  export SESSION_COOKIE='next-auth.session-token=<value-from-devtools>'
  export KEY=$(uuidgen)
  ```

- [ ] Fire two POSTs back-to-back with the same key:

  ```bash
  curl -s -X POST "$BASE_URL/api/recommendations/$ATTENDEE_ID/draft-intro" \
    -H "Content-Type: application/json" \
    -H "Cookie: $SESSION_COOKIE" \
    -d "{\"idempotencyKey\":\"$KEY\"}" > /tmp/resp1.json

  curl -s -X POST "$BASE_URL/api/recommendations/$ATTENDEE_ID/draft-intro" \
    -H "Content-Type: application/json" \
    -H "Cookie: $SESSION_COOKIE" \
    -d "{\"idempotencyKey\":\"$KEY\"}" > /tmp/resp2.json

  diff <(jq -S 'del(.remaining)' /tmp/resp1.json) <(jq -S 'del(.remaining)' /tmp/resp2.json)
  ```

  (`.remaining` is stripped from the compare because it reflects the count at read time and may legitimately change; the AI-drafted body must be byte-equal.)

  **Pass:** `diff` prints nothing (both responses byte-equal after stripping `remaining`).

  **Fail:** Any diff output (the AI drafted twice — dedup didn't fire).

- [ ] Confirm exactly one audit row was written:

  ```bash
  sqlite3 "$DB" "SELECT COUNT(*) FROM AiCallLog WHERE userId='$SPONSOR_USER_ID' AND idempotencyKey='$KEY';"
  ```

  **Pass:** `1`.

  **Fail:** `0` or `2` (or higher).

### Step 5 — Burst-cap: server 429 + modal `Slow down` [contract]

**Verifies:** With 5 rows in the last 60s, the 6th request returns HTTP 429 `{"error":"burst_limit","remaining":<n>}`; the modal renders the locked `Slow down — try again in a minute.` copy and hides Send.

**5a. Server contract (curl-driven):**

- [ ] Clear + preseed 5 recent rows:

  ```bash
  sqlite3 "$DB" "DELETE FROM AiCallLog WHERE userId='$SPONSOR_USER_ID' AND surface='sponsor_draft_intro';"
  for i in 1 2 3 4 5; do
    sqlite3 "$DB" "INSERT INTO AiCallLog (id, userId, attendeeId, surface, createdAt, costEstimateUsd, idempotencyKey, responsePayload, expiresAt) VALUES (lower(hex(randomblob(12))), '$SPONSOR_USER_ID', '$ATTENDEE_ID', 'sponsor_draft_intro', ((strftime('%s', 'now') - $((i*5))) * 1000), 0.00003, 'seed-b-$i', '{\"greeting\":\"x\",\"body\":\"x\",\"signoff\":\"x\",\"groundedFields\":[\"attendee.bio\"]}', ((strftime('%s', 'now') - $((i*5-5))) * 1000));"
  done
  ```

- [ ] Fire a 6th request:

  ```bash
  curl -s -o /tmp/burst.json -w "%{http_code}\n" -X POST "$BASE_URL/api/recommendations/$ATTENDEE_ID/draft-intro" \
    -H "Content-Type: application/json" \
    -H "Cookie: $SESSION_COOKIE" \
    -d "{\"idempotencyKey\":\"$(uuidgen)\"}"
  cat /tmp/burst.json
  ```

  **Pass:** HTTP status printed is `429`; body is `{"error":"burst_limit","remaining":<number>}`.

  **Fail:** Any other status; or body has no `error` field / `error != "burst_limit"`.

**5b. Client contract (Playwright-driven):**

- [ ] Run:

  ```bash
  PHASE12B_MODE=cap-burst node docs/smoketests/playwright/phase-12b-ai-controls.mjs
  ```

  Script mocks the draft-intro POST to return 429 `{error:"burst_limit", remaining: 3}`; asserts (1) modal renders `Slow down — try again in a minute.` in the amber banner, (2) Send button is absent, (3) `3 AI drafts remaining today` line renders.

  **Pass:** All 3 assertions PASS, script exits 0 with `Results: 3 passed, 0 failed`.

  **Fail:** Any assertion fails.

### Step 6 — User-daily-cap: server 429 + modal `Daily limit reached` [contract]

**Verifies:** With 20 rows in the last 24h (spread outside the burst window), the 21st request returns HTTP 429 `{"error":"daily_limit"}`; the modal renders the locked `Daily limit reached. Resets at midnight.` copy.

**6a. Server contract (curl):**

- [ ] Clear + preseed 20 rows spaced beyond the burst window:

  ```bash
  sqlite3 "$DB" "DELETE FROM AiCallLog WHERE userId='$SPONSOR_USER_ID' AND surface='sponsor_draft_intro';"
  for i in $(seq 1 20); do
    sqlite3 "$DB" "INSERT INTO AiCallLog (id, userId, attendeeId, surface, createdAt, costEstimateUsd, idempotencyKey, responsePayload, expiresAt) VALUES (lower(hex(randomblob(12))), '$SPONSOR_USER_ID', '$ATTENDEE_ID', 'sponsor_draft_intro', ((strftime('%s', 'now') - $((i*300))) * 1000), 0.00003, 'seed-d-$i', '{\"greeting\":\"x\",\"body\":\"x\",\"signoff\":\"x\",\"groundedFields\":[\"attendee.bio\"]}', ((strftime('%s', 'now') - $((i*300-5))) * 1000));"
  done
  ```

  (Spacing rows 5 minutes apart avoids the burst window; the row closest to now is 5 minutes old, so only 0 rows are inside the 60s burst window and the user-daily count trips first.)

- [ ] Fire the 21st:

  ```bash
  curl -s -o /tmp/daily.json -w "%{http_code}\n" -X POST "$BASE_URL/api/recommendations/$ATTENDEE_ID/draft-intro" \
    -H "Content-Type: application/json" \
    -H "Cookie: $SESSION_COOKIE" \
    -d "{\"idempotencyKey\":\"$(uuidgen)\"}"
  cat /tmp/daily.json
  ```

  **Pass:** HTTP `429`; body `{"error":"daily_limit","remaining":0}`.

  **Fail:** Wrong status or wrong error code.

**6b. Client contract (Playwright):**

- [ ] Run:

  ```bash
  PHASE12B_MODE=cap-daily node docs/smoketests/playwright/phase-12b-ai-controls.mjs
  ```

  Script mocks the draft-intro POST to return 429 `{error:"daily_limit", remaining: 0}`; asserts (1) modal renders `Daily limit reached. Resets at midnight.`, (2) Send absent, (3) `0 AI drafts remaining today` line renders.

  **Pass:** 3/3 passed.

### Step 7 — Global-daily-cap: server 503 + modal `AI temporarily unavailable` [contract]

**Verifies:** With ≥1000 rows across all users in the last 24h, any request returns HTTP 503 `{"error":"global_limit"}` (no `remaining` field); the modal renders the locked `AI temporarily unavailable.` copy.

**7a. Server contract (curl):**

- [ ] Clear + preseed 1000 rows for the current user (global count filters by surface only — user identity doesn't matter):

  ```bash
  sqlite3 "$DB" "DELETE FROM AiCallLog WHERE surface='sponsor_draft_intro';"
  sqlite3 "$DB" <<'SQL'
  BEGIN;
  WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 1000)
  INSERT INTO AiCallLog (id, userId, attendeeId, surface, createdAt, costEstimateUsd, idempotencyKey, responsePayload, expiresAt)
  SELECT lower(hex(randomblob(12))),
         'seed-user-' || n,
         'seed-attendee-' || n,
         'sponsor_draft_intro',
         (strftime('%s', 'now') - n * 60) * 1000,
         0.00003,
         'seed-g-' || n,
         '{"greeting":"x","body":"x","signoff":"x","groundedFields":["attendee.bio"]}',
         (strftime('%s', 'now') - n * 60 + 5) * 1000
  FROM seq;
  COMMIT;
SQL
  ```

  (1000 rows spanning ~16h keeps all inside the 24h global-daily window.)

- [ ] Fire a request:

  ```bash
  curl -s -o /tmp/global.json -w "%{http_code}\n" -X POST "$BASE_URL/api/recommendations/$ATTENDEE_ID/draft-intro" \
    -H "Content-Type: application/json" \
    -H "Cookie: $SESSION_COOKIE" \
    -d "{\"idempotencyKey\":\"$(uuidgen)\"}"
  cat /tmp/global.json
  ```

  **Pass:** HTTP `503`; body `{"error":"global_limit"}` (no `remaining` field).

  **Fail:** Wrong status or wrong error code.

**7b. Client contract (Playwright):**

- [ ] Run:

  ```bash
  PHASE12B_MODE=cap-global node docs/smoketests/playwright/phase-12b-ai-controls.mjs
  ```

  Script mocks 503 `{error:"global_limit"}`; asserts (1) modal renders `AI temporarily unavailable.`, (2) Send absent, (3) NO `remaining today` line renders (global-cap suppresses it).

  **Pass:** 3/3 passed.

### Step 8 — Button-level cap-hit state [contract, driven by Playwright]

**Verifies:** When `/api/recommendations/quota` reports a cap-hit, the Draft intro button label + tooltip surface the cap-hit copy and the button is disabled without opening the modal.

- [ ] Run:

  ```bash
  PHASE12B_MODE=button-cap-hit node docs/smoketests/playwright/phase-12b-ai-controls.mjs
  ```

  Script mocks `GET /api/recommendations/quota` to return `{remaining: 0, capHit: "daily_limit"}`; asserts (1) at least one Draft intro button renders with `disabled` attribute AND label text `Daily limit reached. Resets at midnight.`; (2) button has `title` attribute equal to that same copy; (3) clicking the button does not open the modal (no `Draft intro to` header appears anywhere).

  **Pass:** 3/3 passed.

### Step 9 — Cleanup: audit log reset [contract]

**Verifies:** Test-preseeded rows are removed so subsequent runs don't inherit polluted state.

- [ ] Run:

  ```bash
  sqlite3 "$DB" "DELETE FROM AiCallLog WHERE surface='sponsor_draft_intro';"
  sqlite3 "$DB" "SELECT COUNT(*) FROM AiCallLog WHERE surface='sponsor_draft_intro';"
  ```

  **Pass:** Count = `0`.

  **Fail:** Any residual rows.

### Step 10 — Phase 12a re-run: no regression [contract]

**Verifies:** All Phase 12a contract paths still pass under Phase 12b's route (dedup + caps + row write layered on).

- [ ] Follow `docs/smoketests/phase-12a-sponsor-ai-intro.md` Steps 1–6 in full. Both Playwright modes (`PHASE12A_MODE=ai-failure` and `PHASE12A_MODE=send-error`) must still pass.

  **Pass:** All Phase 12a steps PASS.

  **Fail:** Any Phase 12a step FAILS.

### Step 11 — Perf-bar: sponsor dashboard mobile Lighthouse Tier B [perf-bar tier B]

**Verifies:** No sponsor-dashboard perf regression from the new quota-fetch on mount + `AiCallLog` writes.

**Environment required:** Vercel preview URL for the PR (Tier B). Tier A is post-merge confirmation.

- [ ] Follow Phase 12a Step 7's Lighthouse command against the Phase 12b PR's preview URL. Baseline = Phase 12a's Step 7 measurement.

  **Pass:** Measured LCP is within ±10% of Phase 12a's post-merge sponsor-dashboard mobile LCP.

  **Fail:** Measured LCP > 10% higher.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. AiCallLog schema landed | contract | anywhere | |
| 2. Client sends fresh idempotencyKey | contract (Playwright) | local dev acceptable | |
| 3. Audit row written on success | contract | local dev + DB inspection | |
| 4. Idempotency dedup | contract | local dev + curl | |
| 5. Burst-cap (server + client) | contract | local dev + curl + Playwright | |
| 6. User-daily-cap (server + client) | contract | local dev + curl + Playwright | |
| 7. Global-daily-cap (server + client) | contract | local dev + curl + Playwright | |
| 8. Button-level cap-hit | contract (Playwright) | local dev acceptable | |
| 9. Cleanup: audit log reset | contract | local dev | |
| 10. Phase 12a re-run — no regression | contract | anywhere | |
| 11. Sponsor dashboard mobile Lighthouse | perf-bar tier B | Vercel preview | |

## Pass / fail

The phase ships when:

- Steps 1–10 all PASS on runner-appropriate environments (contract checks are env-agnostic).
- Step 11 PASS on the Vercel preview (Tier B) before merge; Tier A (production Lighthouse post-merge) is confirmation.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `packages/db/prisma/schema.prisma` (specifically the `AiCallLog` model)
- `apps/sponsor/app/api/recommendations/[attendeeId]/draft-intro/route.ts`
- `apps/sponsor/app/api/recommendations/quota/route.ts`
- `apps/sponsor/components/RecommendedAttendees.tsx`
- `apps/sponsor/components/IntroDraftModal.tsx`
- `apps/sponsor/lib/ai-controls.ts`
- `apps/sponsor/lib/ai-intro.ts` (specifically `CAP_HIT_COPY` or `CapErrorCode`)
- `apps/sponsor/lib/hooks.ts` (specifically `useAiQuota`)
- The `WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED` feature flag (server or client mirror)
- The cap constants `BURST_LIMIT_PER_MIN`, `USER_DAILY_LIMIT`, `GLOBAL_DAILY_LIMIT`, `IDEMPOTENCY_TTL_MS` in `lib/ai-controls.ts`
