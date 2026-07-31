# Bugfix 002 Smoketest — sponsor logos blocked by middleware

Manual verification path. Both human and AI agents are valid runners. Authored per [`docs/smoketests/CONTRACT.md`](CONTRACT.md).

**Run date:** 2026-07-30. **Branch:** `fix-static-image-middleware`. **Review log:** [`docs/codex-reviews/bugfix-002-sponsor-logo-middleware.md`](../codex-reviews/bugfix-002-sponsor-logo-middleware.md).

---

## What was broken

Twenty sponsor logos did not render on the participant app's home and meetings screens, and on four screens in the meetings portal.

Next.js optimises an `<Image src="/sponsors/x.png">` by fetching that file back from the app itself, and that internal fetch carries no session cookie. The middleware matcher skipped a folder named `icons` but not `sponsors`, so the fetch was redirected to the sign-in page. The optimiser received a redirect instead of a picture and gave up with a 400.

The admin app never had the problem because its matcher excludes images a different way.

## What changed

One line in each of three files — `apps/attendee/middleware.ts`, `apps/meetings/middleware.ts`, `apps/sponsor/middleware.ts`:

```
'/((?!_next/static|_next/image|favicon.ico|icons/|sponsors/|manifest.json|sw.js|workbox-.*).*)'
```

`sponsors/` added; `icons` gained a trailing slash. No other file touched.

## Prerequisites for the runner

- A local production build: `pnpm --filter attendee build && pnpm --filter attendee start`. A development server is fine for these checks — every pass criterion is a status code, which does not depend on build mode — but the run recorded here used a production build.
- Kill any server already on the port first. A stale server serves stale code.
- No session cookie is used anywhere in Step 1. That is the point: the image optimiser has no cookie either.

---

## Steps

### Step 1 — Assets serve, everything else stays blocked [contract]

**Verifies:** the logos render, and nothing that should be behind sign-in became reachable.

```bash
lsof -ti:3001 | xargs -r kill
pnpm --filter attendee build && pnpm --filter attendee start &

# must all serve
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3001/sponsors/aftership.png
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://localhost:3001/_next/image?url=%2Fsponsors%2Faftership.png&w=128&q=75"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/icons/icon-192.png
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/manifest.json
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/sw.js

# must all be refused
for p in /home /people /people/anything.png /chat/room.svg /sponsorship /sponsorsecret /sponsors-admin /iconsecret; do
  curl -s -o /dev/null -w "$p -> %{http_code}\n" "http://localhost:3001$p"
done
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/data/people
```

- [x] Run with **no session cookie**.
  - **Pass:** every asset returns 200; every page path returns 307; the data address returns 401.
  - **Fail:** any page path returns 200 or 404. A 404 is a failure, not a pass — it means the request skipped the middleware and the app simply had no route there.

**Result: PASS.**

| Path | Expected | Got |
|---|---|---|
| `/sponsors/aftership.png` | 200 | **200** `image/png` |
| same via `/_next/image` | 200 | **200** `image/png` |
| all 20 sponsor logos via the optimiser | 200 | **20 served, 0 failed** |
| `/icons/icon-192.png` | 200 | **200** `image/png` |
| `/manifest.json` | 200 | **200** |
| `/sw.js` | 200 | **200** |
| `/home` | 307 | **307** |
| `/people` | 307 | **307** |
| `/people/anything.png` | 307 | **307** |
| `/chat/room.svg` | 307 | **307** |
| `/sponsorship` | 307 | **307** |
| `/sponsorsecret` | 307 | **307** |
| `/sponsors-admin` | 307 | **307** |
| `/iconsecret` | 307 | **307** |
| `/api/data/people` | 401 | **401** |

**Why the last four are in the list.** They are not hypothetical. Before the trailing slash was added they returned **404**, meaning the middleware never saw them. See the review log.

### Step 2 — The meetings portal behaves the same [contract]

```bash
pnpm --filter meetings build && pnpm --filter meetings start &
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "http://localhost:3002/_next/image?url=%2Fsponsors%2Faftership.png&w=128&q=75"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/people/anything.png
```

- [x] Run with no session.
  - **Pass:** logo 200, `/` 307, `/people/anything.png` 307.

**Result: PASS** — `200 image/png`, `307`, `307`.

### Step 3 — The onboarding gate is undisturbed [contract, tier C]

**Verifies:** changing what the middleware matches did not weaken the gate that sits behind it.

```bash
node docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs
```

- [x] Run against the production build.
  - **Pass:** `Results: 53 passed, 0 failed`.

**Result: PASS — 53 passed, 0 failed**, unchanged from before this branch.

### Step 4 — Type check [contract]

- [x] Each app on its own.

**Result: PASS.** `web`, `sponsor`, `meetings` clean; `attendee` shows only the documented pre-existing `BottomNav.tsx(40,101)` tuple-index error.

---

## Step summary

| Step | Category | Environment | Status |
|---|---|---|---|
| 1. Assets serve, pages stay blocked | contract | tier C — local production build | **PASS** |
| 2. Meetings portal behaves the same | contract | tier C | **PASS** |
| 3. Onboarding gate undisturbed | contract | tier C | **PASS** — 53/53 |
| 4. Type check | contract | anywhere | **PASS** |

No perf-bar step. No performance claim is made.

## What a passing run here is NOT evidence of

**Green is evidence about the assertions listed above and nothing wider.**

- **Nobody has looked at a screen.** Every result is a status code. That a logo returns `200 image/png` is strong evidence it will render, but it is not the same as seeing the home screen with logos on it. That belongs in the demonstration dry-run.
- **The sponsor portal is unverified in practice.** It received the same change for consistency, but no component there renders a sponsor logo through the optimiser, so there was nothing to observe.
- **The admin app is untouched and still has the weakness** round 1 of review found — it excludes images by file extension, which lets a page route ending in one skip the middleware. Its own change to make.

## Re-run trigger

Re-run whenever a later change touches:

- `apps/attendee/middleware.ts`, `apps/meetings/middleware.ts`, `apps/sponsor/middleware.ts`
- anything added under `apps/*/public/` — a new asset folder needs a matcher entry, and the failure is silent
- `apps/web/middleware.ts`, if its extension-based exclusion is ever brought in line
