# Phase 15 Smoketest — Trim `/api/data/chat` payload to chat-list-needed fields

Manual verification path. Both human and AI agents are valid runners. Authored per `docs/smoketests/CONTRACT.md`; source: WBR demo sprint PRD §6 Phase 15, §8.1.

## What this verifies

- `/api/data/chat` no longer ships the full `members` array. CHANNEL rooms emit `{id, name, type, otherMember: null, lastMessage}`; DIRECT rooms emit the same shape with `otherMember` populated to the counterparty's `{id, name, image}`.
- Total `/api/data/chat` response transfer size ≤ 50 KB for the seeded `steph@curry.com` test account.
- Chat-list UI renders identically pre- and post-change: channel "#" gradient icon, DM avatar + name + last-message preview + relative timestamp.
- Phase 1's tier-B Vercel preview Lighthouse AC bar (unblocked by this payload reduction) — at least one of `/home`, `/speakers`, `/schedule`, `/people` mobile LCP < 3 s AND all four routes ≥ 50% reduction vs. the Phase 2 baseline.

## Prerequisites for the runner

- All four apps runnable locally per `docs/smoketests/phase-0a-foundation-docs.md` §3–4.
- Chrome DevTools (Network + Performance panels).
- For tier-C steps: production build via `pnpm --filter attendee build && pnpm --filter attendee start`.
- For tier-B steps: PR's Vercel preview URL on the `wbr` project; Vercel Protection Bypass for Automation token from `https://vercel.com/june-1220s-projects/wbr/settings/deployment-protection`.
- Attendee credentials: `steph@curry.com` / `stephcurry`.

## Steps

### Step 1 — Code-level inspection [contract]

**Verifies:** the route and consumer changes match the PRD §6 Phase 15 approach.

- [ ] Read `apps/attendee/app/api/data/chat/route.ts`. Confirm the Prisma `select.members` includes `where: { userId: { not: userId } }` + `take: 1` + `select: { user: { select: { id: true, name: true, image: true } } }`.
  - **Pass:** the members select limits to one non-self member per room; the `take: 1` constraint is present.
  - **Fail:** the original unfiltered members select shape (no `where`, no `take`) survived.
- [ ] In the same file, confirm the response mapping emits `otherMember: room.type === 'DIRECT' ? (room.members[0]?.user ?? null) : null` and does NOT emit a `members` array.
  - **Pass:** the response shape per room is exactly `{id, name, type, otherMember, lastMessage}`. No `members` field.
  - **Fail:** a `members` array is included in the mapped output.
- [ ] Read `apps/attendee/components/chat/ChatClient.tsx`. Confirm the `ChatRoom` interface declares `otherMember: { id: string; name: string | null; image: string | null } | null` and does NOT declare a `members` field.
  - **Pass:** interface matches the new API shape.
  - **Fail:** interface still references `members`.
- [ ] In the same file, confirm the render loop reads `room.otherMember` directly (not a `members.find(...)` lookup).
  - **Pass:** no `room.members` reference in the component body.
  - **Fail:** the old `members.find` lookup survives.

### Step 2 — API response size [perf-bar tier C, local production build]

**Verifies:** the chat endpoint payload drops from ~4.2 MB to ≤ 50 KB on the seeded account.

**Environment required: local production build** (`pnpm --filter attendee build && pnpm --filter attendee start`). Tier D (dev mode) is invalid for response-size measurements because dev mode adds debugging metadata to responses; tier C is the minimum fidelity that mirrors production payload shape.

```bash
# Build + start attendee in production mode on port 3001
pnpm --filter attendee build
pnpm --filter attendee start &
# Wait for the server to be ready (curl http://localhost:3001/login returns 200)

# Login + capture session cookie
curl -s -c /tmp/wbr-cookies.txt -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"steph@curry.com","password":"stephcurry"}'

# Measure /api/data/chat response size with session cookie applied
TOKEN=$(grep next-auth /tmp/wbr-cookies.txt | awk '{print $7}')
curl -s -o /tmp/chat-response.json -w "Content-Length: %{size_download} bytes\n" \
  -H "Cookie: next-auth.session-token=$TOKEN" \
  http://localhost:3001/api/data/chat
```

- [ ] Run the recipe above. Note: `curl -w "%{size_download}"` reports the **downloaded body size in bytes** (uncompressed JSON length). This is the same metric as Lighthouse's `resourceSize` — distinct from Lighthouse's `transferSize`, which would be the gzip-compressed wire bytes (typically much smaller). Phase 15's 50 KB AC bar applies to body size (uncompressed JSON) — that's the metric that bounds the JS-deserialization + memory cost of the response, which is what dominates the lantern-model LCP projection that motivated this phase.
  - **Pass:** `Content-Length` reported by curl is ≤ 50,000 bytes (50 KB) for the seeded `steph@curry.com` account. Equivalent check on the Vercel preview: `audits["network-requests"].details.items.find(r => r.url.endsWith("/api/data/chat")).resourceSize ≤ 50000` in any Lighthouse JSON output from Step 4.
  - **Fail:** `Content-Length` > 50,000 bytes.
- [ ] Inspect the JSON response shape: `cat /tmp/chat-response.json | jq '.rooms[0] | keys'`.
  - **Pass:** the keys array contains `id`, `lastMessage`, `name`, `otherMember`, `type` (alphabetically sorted by jq) — and does NOT contain `members`.
  - **Fail:** the response includes a `members` field, OR is missing `otherMember`.

### Step 3 — UI render parity [contract]

**Verifies:** the chat-list UI renders identically pre- and post-change for both CHANNEL and DIRECT rooms.

**Prerequisite — create a DIRECT room.** The fresh seed only creates the General CHANNEL — no DIRECT rooms exist for any user. Before checking DM render, manually create one so the DIRECT-render path is exercised:

- [ ] In a clean incognito window against the same local production server, log in as `steph@curry.com` / `stephcurry`.
- [ ] Navigate to `/chat/new`. The search box filters on `name` and `company`, not email — search `June Cho` (or another seeded user by display name) and start a DM. Send one message (any text) so the DM gets a `lastMessage` entry.

Now verify chat-list render:

- [ ] Navigate to `/chat`.
  - **Pass:** the chat list renders. The CHANNEL-type "General" room is visible at the top with a "#" gradient icon. The DIRECT-type room created above is visible with the counterparty's avatar (or initial-letter fallback if no avatar set) + name + last-message preview + relative timestamp.
  - **Fail:** the page errors, renders blank, shows "Unknown" for the DM whose counterparty is a known seeded user with a non-null name, or the "#" channel icon is missing.
- [ ] Open DevTools → Network panel → click the `/api/data/chat` row → inspect the Response tab.
  - **Pass:** the response is valid JSON; `rooms[].otherMember` is populated `{id, name, image}` for the DIRECT room created above (image may be null if the counterparty has no avatar in seed data — that's fine).
  - **Fail:** `otherMember` is null for the DM whose counterparty has a distinct user record.
- [ ] DevTools → Console panel after navigation completes.
  - **Pass:** no errors logged. No warnings about undefined properties on `ChatRoom`.
  - **Fail:** any console error mentions `room.members`, `otherMember`, or React render exceptions.

### Step 4 — Phase 1 AC re-measurement on Vercel preview [perf-bar tier B]

**Verifies:** Phase 1's headline acceptance criterion now clears the bar with the chat payload reduced. This step is the **unblocked** Phase 1 AC measurement that the 2026-06-27 tier-B run could not produce reliably (the 4.2 MB chat payload dominated Lighthouse's lantern model and inflated `/people` simulated LCP into 15–37 s noise).

**Environment required: Vercel preview deployment for the PR.**

```bash
# Pull the latest preview URL for the wbr (attendee) project after pushing
vercel ls wbr --scope june-1220s-projects | head -3
# Set PREVIEW = the most recent ready Preview URL
PREVIEW=https://wbr-<hash>-june-1220s-projects.vercel.app
BYPASS_TOKEN=<protection bypass token from project settings>

# Capture session cookie from the preview deployment
curl -s -c /tmp/wbr-preview-cookies.txt -X POST "$PREVIEW/api/login" \
  -H "Content-Type: application/json" \
  -H "x-vercel-protection-bypass: $BYPASS_TOKEN" \
  -d '{"email":"steph@curry.com","password":"stephcurry"}'

# Run Lighthouse against each of the four landing pages
TOKEN=$(grep next-auth /tmp/wbr-preview-cookies.txt | awk '{print $7}')
HEADERS=$(printf '{"x-vercel-protection-bypass":"%s","Cookie":"__Secure-next-auth.session-token=%s"}' "$BYPASS_TOKEN" "$TOKEN")
for route in home speakers schedule people; do
  npx --yes lighthouse@latest "$PREVIEW/$route" \
    --output=json \
    --output-path=/tmp/wbr-phase15-preview-$route.json \
    --quiet \
    --chrome-flags="--headless=new --no-sandbox" \
    --form-factor=mobile \
    --extra-headers="$HEADERS" \
    --only-categories=performance
done
```

- [ ] Run the recipe above.
  - **Pass:** lighthouse JSON output produced for all four routes.
  - **Fail:** any route's lighthouse run errors out (re-check bypass token / cookie validity).
- [ ] Compare the simulated LCP for each route against the Phase 2 baseline (`/home` 17.10 s, `/speakers` 15.50 s, `/schedule` 8.83 s, `/people` 8.14 s).
  - **Pass (the Phase 15 + Phase 1 AC gate):** at least one route's `audits["largest-contentful-paint"].numericValue` < 3000 ms **AND** all four routes show ≥ 50% reduction vs. the baseline above (i.e., `/home` < 8.55 s, `/speakers` < 7.75 s, `/schedule` < 4.42 s, `/people` < 4.07 s).
  - **Fail:** any of: a route's simulated LCP exceeds its baseline (regression), any route shows < 50% reduction vs. baseline, OR no route is under 3000 ms. A "≥ 50% on all four but no route < 3s" outcome is FAIL for Phase 15 — it does NOT bypass the strict PRD §6 Phase 1 acceptance bar. (Phase 7's separate mid-sprint re-measurement may *additionally* trigger Phase 8's `initialData` wire-up as a downstream contingency, but that gating decision is independent of and does not relax the Phase 15 pass criterion.)
- [ ] Inspect the `/people` lighthouse JSON network-requests audit. Confirm the `/api/data/chat` entry's `resourceSize` (uncompressed body bytes) is ≤ 50,000.
  - **Pass:** `audits["network-requests"].details.items.find(r => r.url.endsWith("/api/data/chat")).resourceSize ≤ 50000`. The matching `transferSize` field (compressed wire bytes) will be smaller — both metrics should look healthy.
  - **Fail:** `resourceSize` > 50,000 bytes; suggests the build pipeline didn't pick up the new route handler.

### Step 5 — Chat-room detail page no-regression [contract]

**Verifies:** the chat-room detail page at `/chat/[roomId]` (which fetches messages via a separate endpoint, not `useChatData()`) still works.

- [ ] From the chat list, click a DIRECT room.
  - **Pass:** navigation succeeds; the room's message thread renders; the counterparty's avatar + name appear in the room header.
  - **Fail:** the page errors, renders blank, or the header shows "Unknown."
- [ ] Click a CHANNEL room ("General").
  - **Pass:** navigation succeeds; channel messages render.
  - **Fail:** the page errors or fails to render channel content.
- [ ] Send a test message in any room.
  - **Pass:** the message appears in the thread immediately; the chat list (on return to `/chat`) shows the new message as the last-message preview.
  - **Fail:** the message doesn't appear, or the chat list doesn't update.

## Step summary

| Step | Category | Environment | Status (filled by runner) |
|---|---|---|---|
| 1. Code inspection | contract | source read | |
| 2. API response size | perf-bar tier C | local prod build | |
| 3. UI render parity | contract | local prod build | |
| 4. Phase 1 AC re-measurement | perf-bar tier B | Vercel preview | |
| 5. Chat-room detail page no-regression | contract | local prod build | |

## Pass / fail

The phase ships when ALL of the following hold:
- Steps 1, 3, 5 PASS on the local production build.
- Step 2 PASS (≤ 50 KB downloaded body, no `members` field) on the local production build.
- Step 4 full PASS on the Vercel preview before merge. Partial outcomes (e.g. all four routes ≥ 50% reduction but no route < 3 s) are a Phase 15 FAIL — they do not relax the strict PRD §6 Phase 1 AC bar.

## Re-run trigger

Re-run this smoketest in full whenever a downstream phase touches:

- `apps/attendee/app/api/data/chat/route.ts` (the route shape)
- `apps/attendee/components/chat/ChatClient.tsx` (the consumer)
- `packages/db/prisma/schema.prisma` `ChatRoom` / `ChatMember` / `User.image` definitions
- Any future `useChatData()` consumer added elsewhere in the attendee app

Per PRD §8.1, "a phase that modifies the surface area covered by an earlier smoketest re-runs that smoketest as part of its acceptance."
