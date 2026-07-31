# Phase 5 Smoketest — sponsor screen gate + checklist

- **Phase:** 5 of `.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`
- **Requirements:** FP 13, 14; OE 10, 14, 15, 16, 21
- **Run date:** 2026-07-31
- **Branch:** `onboarding-enforcement-sponsor-gate`, from `origin/main` at `c055fca`
- **Script:** [`playwright/phase-5-sponsor-screen-gate.mjs`](playwright/phase-5-sponsor-screen-gate.mjs)
- **Result: 117 passed, 0 failed, 0 skipped.** (72 before the adversarial review cycle; the cycle added 45.)
- **Review log:** [`../codex-reviews/phase-5-sponsor-screen-gate.md`](../codex-reviews/phase-5-sponsor-screen-gate.md) — 7 findings, 6 fixed, 1 correct observation whose recommended fix was measured and rejected.
- **Contract:** [`CONTRACT.md`](CONTRACT.md)

## What this verifies

| # | Verification | Plan AC |
|---|---|---|
| 1 | A representative whose company misses any of the six required items is blocked from all six portal screens and lands on the checklist | AC-1 |
| 2 | Every authenticated route group in the sponsor app is enumerated and accounted for | AC-2 |
| 3 | The checklist names exactly the missing items, in the reminder email's wording | AC-3 |
| 4 | The checklist offers solutions **offered** and never solutions sought | AC-4 |
| 5 | Completing the six releases the representative within one navigation | AC-5 |
| 6 | Clearing any one of the six blocks again on the next fresh request | AC-6 |
| 7 | The checklist route is outside the portal group — no self-redirect, no portal navigation | AC-7 |
| 8 | An organizer and a staff account reach every portal screen and are never routed to the checklist | AC-8 |
| 9 | The sponsor demonstration login enters the portal without seeing the checklist | AC-9 |
| 10 | The admin app and the meetings portal stay reachable throughout | AC-10 |
| 11 | Blocked and released are both asserted through real page loads checking rendered content | AC-11 |

## What Phase 5 changed, in one paragraph

A sponsor representative whose exhibiting company is missing any of six required items — logo, tagline, a description over 20 characters (so 21 is the smallest that passes), contact name and email, at least one solution offered, website — is now stopped at every sponsor portal screen and sent to a checklist that names exactly what is outstanding, in the same words the admin app's exhibitor reminder email uses. Completing the items releases them on the next navigation; emptying one blocks them again. The six items are read from `SPONSOR_REQUIRED_ITEMS` in `packages/db/src/onboarding-policy.ts`, which Phase 2 created; **this phase defines no sponsor completeness rule of its own.** Organizer, admin and staff accounts are released before any completeness question is asked, per [ADR 0008](../adr/0008-onboarding-gate-is-about-the-person-not-the-app.md).

**Phase 5 is the screen gate only.** An incomplete representative is still served by every one of this app's 21 request handlers. Phase 6 closes that. Until it does, this is a screen-level control and not a data control — stated plainly because the same gap in the participant app went a whole phase before anybody wrote it down (FP finding F-4).

## Enumeration — every layout and route group

Reproduce with:

```sh
cd apps/sponsor
find app -name "layout.tsx" | sort
find app -name "page.tsx" | sort
```

### Layouts (3)

| # | Layout | Signed in? | Gate? | Why |
|---|---|---|---|---|
| 1 | `app/layout.tsx` | No | **No** | Root. Renders `<html>`/`<body>` for `/login` too; gating here would gate the sign-in screen. |
| 2 | `app/(authenticated)/layout.tsx` | Yes | **No** | Supplies the session and query providers. The checklist lives beneath it and must stay reachable while blocked; gating here would redirect the checklist to itself. |
| 3 | `app/(authenticated)/(portal)/layout.tsx` | Yes | **YES — the only gated layout** | Holds the navigation bar and all six portal screens. |

**One gated route group, not two.** The participant app has two, and Phase 1's worst defect was gating one and leaving the other open (FP finding F-3). That specific defect is not available here, but the residual F-3 named is: nothing at the framework level forces a new child of `(authenticated)` to call the gate.

### Pages (9, including the one this phase adds)

| Page | Group | Gated by | Note |
|---|---|---|---|
| `app/login/page.tsx` | none | — | Anonymous. Middleware sends a token-holder away from it. |
| `app/(authenticated)/page.tsx` | `(authenticated)` | not gated — **accounted for** | `redirect('/dashboard')` and nothing else. Its target is inside the gated group, so it cannot be used to reach anything ungated. |
| `.../(portal)/dashboard/page.tsx` | `(portal)` | layout 3 | |
| `.../(portal)/browse/page.tsx` | `(portal)` | layout 3 | |
| `.../(portal)/meetings/page.tsx` | `(portal)` | layout 3 | |
| `.../(portal)/profile/page.tsx` | `(portal)` | layout 3 | |
| `.../(portal)/schedule/page.tsx` | `(portal)` | layout 3 | |
| `.../(portal)/submissions/page.tsx` | `(portal)` | layout 3 | |
| `app/(authenticated)/onboarding/page.tsx` | `(authenticated)` | **deliberately not gated** | Added by this phase. The checklist. |

Six `loading.tsx` files exist, one per portal screen, all inside `(portal)`. Each is a suspense fallback for its own page and cannot render before the gated layout has run, so none is a route around the gate.

### Request handlers — 21 across 17 files, plus the sign-in re-export

**Phase 5 guards none of these. Phase 6 does.** Captured here so Phase 6 inherits a checked list and so this document states what it did not cover.

```sh
for f in $(find app -name "route.ts" | sort); do echo "--- $f"; grep -oE "export async function (GET|POST|PATCH|PUT|DELETE)" "$f"; done
grep -rhoE "export async function GET" app/api | wc -l                     # 9
grep -rhoE "export async function (POST|PATCH|PUT|DELETE)" app/api | wc -l # 12
```

**The search above understates by one file.** `app/api/auth/[...nextauth]/route.ts` publishes its handlers as `export { handler as GET, handler as POST }`, so a search for `export async function` does not see it. Found by reading the file. It is the sign-in address and exempt either way, but an enumeration trusting the search alone would report a complete list while missing a live address.

**Reading — 9:** `attendees`, `browse`, `meetings-data`, `profile/sponsor-data`, `profile/teammates`, `recommendations/quota`, `sponsor-data`, `submissions/[id]`, `submissions`.

**Changing — 12:** `login` (POST, **exempt** — no session yet), `profile` (PATCH, **exempt** — the checklist writes through it), `meetings/[id]`, `profile/teammates/register` (**open decision**, answered in Phase 6 by reading its caller), `profile/teammates` (POST + DELETE), `recommendations/[attendeeId]/draft-intro`, `request-meeting`, `submissions/[id]` (PATCH + DELETE), `submissions/[id]/submissions/[subId]`, `submissions` (POST).

**Sign-in re-export, outside both counts:** `api/auth/[...nextauth]` (GET + POST, **exempt**).

## Prerequisites for the runner

```sh
# Tier C — a production build, not a dev server. Kill anything on the port first:
# a server started before your change serves stale code.
lsof -ti:3003 | xargs kill -9
pnpm --filter sponsor build && (cd apps/sponsor && pnpm start)

# For step 4 (AC-10) only:
pnpm --filter web build      && (cd apps/web && pnpm start)       # port 3000
pnpm --filter meetings build && (cd apps/meetings && pnpm start)  # port 3002

node docs/smoketests/playwright/phase-5-sponsor-screen-gate.mjs
```

Each app needs its own `.env.local` with `DATABASE_URL` (absolute `file:` path) and `NEXTAUTH_SECRET`. **`apps/meetings/.env.local` was missing on this machine**, which made that app answer `500 NO_SECRET` on every sign-in attempt in production mode. Not a code defect and unrelated to this phase, but it turned AC-10 into a skip until it was created. If AC-10 skips for you, check that file first.

**This run mutates the demonstration company.** It snapshots the six required columns of `sponsor@test.com`'s company on start, prints the snapshot, and restores it on exit including on failure. A run killed with `SIGKILL` mid-way can leave the company incomplete; re-running restores it.

## Steps

### Step 1 — Blocked and released, through real page loads [contract, tier C]

The script drives a real browser. For each direction it checks **rendered content**, never a response code, because a status code cannot tell a working screen from a blank one — FP finding F-7 recorded a screen that returned 200 while rendering nothing.

The marker is the portal navigation (`[data-testid="portal-nav"]`), which renders only inside `(portal)`. One element proves both directions: present when released, and its **absence** on the checklist proves the checklist is outside the gated group and cannot be used to click around the gate (AC-7).

Pass criteria, all deterministic:

- Company complete → each of `/dashboard`, `/browse`, `/meetings`, `/profile`, `/schedule`, `/submissions` answers `200`, and a real page load of `/dashboard` renders the portal navigation.
- Tagline cleared → each of the six answers a redirect whose location contains `/onboarding`, and a real page load of `/dashboard` renders the checklist with **no** portal navigation.
- A complete representative visiting `/onboarding` is redirected to `/dashboard`.
- Organizer and a throwaway staff account reach all six and are redirected away from `/onboarding`.

Tagline is the item cleared, because it is the item the six failing seeded companies already fail on — a state that exists in the real dataset rather than an invented one.

### Step 2 — The checklist names exactly the missing items [contract, tier C]

- The rendered list of outstanding items equals, as a set, the labels the policy reports missing for the same company. Not a superset, not a subset.
- The literal label string from `SPONSOR_REQUIRED_ITEMS` appears on the page — the same string the reminder email sends, so an exhibitor who received that email reads the same task described the same way.
- At least one solutions-**offered** control renders, and the page text contains none of `seeking`, `solutions i am seeking`, `looking for`.
- The page states the character floor for the description, since that item is a content rule rather than a presence rule. **The number is 21, not 20** — see Step 2b.

### Step 3 — The checklist can actually be submitted [contract, tier C]

Added after the first version of this script reported a clean pass while the checklist was **impossible to submit in a browser**. See "A defect this smoketest missed" below.

- `form.checkValidity()` is true for the checklist as loaded, and any field that fails is named with its value and the browser's own message. This asserts the whole class, not the one instance already found.
- The submit button becomes enabled once the last missing item is filled.
- Pressing it leaves `/onboarding` and renders the portal navigation.
- The value typed into the form is present in the database afterwards.

### Step 2b — The copy matches the policy, and every control is named [contract, tier C]

Added by the adversarial review cycle. Both halves concern the only screen a blocked representative can use.

- **The character floor is 21, not 20.** The policy's rule is `description.trim().length > 20`. Asserted against the module directly: 20 fails, 21 passes. The screen must state 21, the submit button must be disabled at exactly 20 and enabled at exactly 21 — with a guard first confirming the description is the *only* outstanding item, because otherwise the boundary assertion proves nothing. The copy was corrected rather than the policy, since the policy is shared with the admin app's reminder email and moving its threshold would change which exhibitors that email chases.
- **Every label points at a control that exists.** The assertion walks every `label` and `legend` inside the form and fails on any label whose `for` names nothing. The solutions chips must sit inside a named group.

### Step 3b — An open checklist cannot undo somebody else's change [contract, tier C]

Added by the adversarial review cycle. The checklist sends only the fields the representative actually edited, so a concurrent change to a field they did not touch survives.

The website is cleared in the database *after* the checklist has loaded, the representative fills the tagline and submits, and then: the website must still be cleared, the tagline must be saved, and the representative must still be blocked on the genuinely-missing website. Passing means an old tab cannot quietly reverse an organizer's correction or undo a deliberate re-block.

Not covered, and stated rather than implied: two people editing the *same* field still race. Detecting that needs a version column on `Sponsor`, which is a schema change, and Phases 2 to 7 carry none by decision.

### Step 4 — Re-blocking, fail-closed, and the other apps [contract, tier C]

- **Each of the six items in turn** is cleared, `/dashboard` is checked, and the item restored. All six redirect to the checklist while cleared and serve again once restored — so the gate consults the required set rather than a one-time marker, and a gate that only noticed tagline would fail here.
- **Fail closed (FP finding F-6).** The throwaway account's row is deleted while its session is still valid. `/dashboard` must redirect to `/login?session=invalid`, and **the redirect chain is followed to its end** with a hop cap: it must settle at `200` on `/login`. Following it is the point — the last session's worst bug reported a pass by stopping at "307 to `/login`" and never following it into an endless loop.
- **AC-10.** The organizer signs in to the admin app and the meetings portal and reaches a page in each, redirected to no checklist. If either app is not listening the script records a loud `SKIP`, never a pass.
- **A representative moved between companies is not trapped** (added by the review cycle). A disposable account is created on one disposable company, signed in, then moved to a second in the database so its session token names the old one. The gate must block on the *current* company, the save must land on the current company, the old company must be untouched, and the representative must be released afterwards. Both companies are rows this step creates and deletes, so no seeded company is touched.

### Step 5 — Type check [contract]

Turbo stops the whole run at the first failing package, which is always the participant app because of its documented pre-existing error, so each app is checked separately:

```sh
for app in sponsor web meetings attendee; do (cd apps/$app && npx tsc --noEmit); done
```

Pass: `sponsor`, `web` and `meetings` exit 0 with no output; `attendee` reports exactly one error, `components/BottomNav.tsx(40,101) TS2514`, which is documented in `CLAUDE.md` and must not be "fixed" here.

`pnpm lint` cannot run — the repository has no ESLint configuration. `pnpm typecheck` is the only working static check.

**One trap worth knowing:** the participant app first reported three extra errors naming `app/api/debug/route.ts`, the diagnostic endpoint Phase 4 deleted. They come from stale generated types, not from code. `rm -rf apps/attendee/.next/types` clears them.

### Step 6 — What the gate costs on page load [perf-bar tier C]

The gated layout carries the comment `Do NOT add blocking server-side fetches here — it causes white screen delays`, added when blocking fetches were deliberately removed from that file. The gate is a blocking server-side read and is there anyway, because a gate that does not run is not a gate. That exception is measured rather than asserted.

Method: median and 95th-percentile response time over 15 requests per screen, 6 screens, per account kind, on a local production build — first with the gate call in the layout, then with it commented out and rebuilt, then restored and rebuilt.

| Account kind | Without the gate (median) | With the gate (median) | Added |
|---|---|---|---|
| Sponsor representative — gate runs in full | 4.1 ms | 4.6 ms | **≈ 0.5 ms** |
| Organizer — gate returns at the role test | 3.5 ms | 4.1 ms | **≈ 0.6 ms** |

95th percentile with the gate: 8.0 ms (sponsor), 6.8 ms (organizer). Both runs are noisy above the median — the no-gate organizer sample reached 54.8 ms once — so the medians are the figure to read, and the difference sits close to the measurement floor.

Pass criterion: the added median is under 5 ms per screen. Met, by roughly ten times.

Three things hold the cost down, and all three are load-bearing if this number is ever revisited: one database round trip rather than two; only the columns the required items read, derived from the policy rather than hand-listed; and an early return for event-operating accounts before any completeness work. There is no `loading.tsx` at the `(portal)` or `(authenticated)` level, so the time added is time on a blank screen — which is exactly why it was measured rather than assumed.

### Step 7 — Does clearing an item re-block on in-app navigation? [contract, tier C]

FP finding F-1 recorded that the participant app's gate does **not** fire on in-app navigation to an already-visited section, because that app sets `experimental.staleTimes.dynamic = 300`. The sponsor app does not set `staleTimes`, so the expectation was that it would re-block. **Measured, and the expectation was wrong — in the worse direction.**

| Navigation, after a required item was cleared behind an open tab | Re-blocked? |
|---|---|
| In-app navigation to a screen already visited this session | **No** |
| In-app navigation to a screen **not** yet visited this session | **No** |
| Hard page load | **Yes** |

The mechanism is not `staleTimes`. All six portal screens share the `(portal)` layout, and Next.js does not re-run a shared parent layout on client-side navigation — it fetches only the changed leaf segment. So the gate never re-runs, regardless of cache settings. This is worse than the participant app, where the two route groups have different layouts and moving between them does re-run the check.

**AC-6 as written is satisfied** — it says "on the next fresh request", and all six items re-block on a fresh request. The wider gap is closed the same way F-1 closed it: the profile editor is the only place inside the portal where a required item can be emptied, and its save handler now calls `router.refresh()`, which re-runs the server layouts. Measured after the change: emptying the tagline field and pressing save lands the representative on `/onboarding` with the checklist rendered and no portal navigation, and the database holds the emptied value.

**Residual, accepted and recorded rather than absorbed.** An item cleared *outside* the open tab — an organizer editing from the admin app, or the same person on a second device — leaves that tab able to move between portal screens it has already loaded until the next hard load. Same residual F-1 accepted for the participant app, for the same reason: acceptable for an event app, and the alternative is a completeness request on every navigation, which reverses a deliberate performance decision.

## A defect this smoketest missed, and what changed because of it

**The first version of this script passed while the checklist could not be submitted at all.**

Every one of the 20 seeded exhibiting companies stores a **relative** logo path such as `/sponsors/tailor-erp.png`. The logo field was `<input type="url">`, which rejects any address that is not absolute. HTML form validation refuses by never firing the submit event: no request, no error, no page change, nothing for an assertion on status to observe. A blocked representative pressing "Open the portal" would have had nothing happen, on the one screen whose entire job is to release them — the exact trap the requirements document forbids by name.

The script passed because it completed the required item by calling `PATCH /api/profile` with `fetch`. **Exercising the address is not exercising the screen.**

Three changes came out of it:

1. The logo input is `type="text"` with `inputMode="url"`. A relative path is a legitimate value for that column — the app renders it straight into an `<img src>` — and the required-set rule is that the value is *present*, not that it parses as an absolute URL, so browser URL validation could only ever refuse a save the rule itself would have accepted. The website field changed for the same reason.
2. Step 3 above now presses the real button and asks the browser directly whether any field would refuse to submit, naming it if so. That assertion covers the class, not the instance.
3. The same input is shared with the sponsor profile editor, so **a live pre-existing bug on `main` is fixed as a side effect**: that form could not be saved for any seeded sponsor either. See below.

## Findings carried out of this phase

### 1. The sponsor profile editor could not be saved at all, for any seeded sponsor — fixed

Pre-existing on `main`, not introduced here, and it would have surfaced the moment anyone edited a sponsor profile in a demonstration. Same cause as above: `form.checkValidity()` was false because of the relative logo path, so pressing "Save All Changes" did nothing at all. Fixed by the shared logo input, which is one file with two importers rather than two lookalike uploaders. `heroImageUrl` had the same latent trap — empty for all 20 companies today, so nothing was broken by it — and was changed too, because the failure is silent and total when it happens. `socialLinkedIn` keeps `type="url"` deliberately: a social profile link genuinely has to be absolute, and every stored value already is.

### 2. ADR 0006's code change was outstanding, and this phase made it urgent — implemented

[ADR 0006](../adr/0006-sponsor-solution-taxonomy-reconciliation.md), dated 2026-07-29, named `apps/sponsor/lib/solutions.ts` as the single canonical solutions vocabulary and listed "ProfileEditor.tsx chip list replaced with an import from `lib/solutions.ts`. Local `const SOLUTIONS` deleted" as a load-bearing subtask. The code half was never done, so the profile editor offered 18 strings that overlapped the canonical 18 on only 6.

Measured: all 20 seeded companies store canonical values, and none stores a value outside the canonical list. So a representative opening the profile editor saw **none** of their real solutions selected, and saving replaced their canonical values with non-canonical ones.

That path was dormant only because the form could not be submitted. Fixing the form would have turned a dormant data-corruption path into a live one, so the vocabulary was fixed in the same change. The data re-map that record also called for needs no work — the stored values are already canonical. The checklist added by this phase uses the canonical list, so both writers of the column now agree.

### 3. The sponsor middleware would have looped on the fail-closed redirect — closed before it shipped

`middleware.ts` sent any token-holder at `/login` to `/dashboard` with no exception. A gate that redirects a deleted-row session to `/login` would therefore bounce back to `/dashboard`, which asks the gate again. That is the loop the previous session measured in the participant app and spent a session's worth of time on. The `?session=invalid` marker and its skip were added here before the first run, and Step 4 follows the whole chain to prove it terminates.

### 4. The save address followed a stale session token, trapping a moved representative — fixed

Raised by adversarial review, then reproduced before being acted on. `PATCH /api/profile` resolved the exhibiting company from `session.user.sponsorId` while the gate and the checklist read it from the database. Those disagree once a representative is moved between companies — and this app can move them: `POST /api/profile/teammates` sets another user's company to the caller's, and `DELETE` clears it.

Measured with the old code, using an account moved from company A to company B mid-session: the gate correctly read B and blocked, the checklist listed B's missing items, `PATCH` returned 200 and **wrote to A**, B stayed untouched, and `/dashboard` blocked again. The representative could never finish no matter how often they saved, and their save overwrote a different company's profile. Fixed by resolving the company from the database, failing closed on a missing row. Covered by the moved-representative step.

Nominally a request handler and so Phase 6's territory. Fixed here because Phase 5 is what turns it into a trap: before the gate existed a stale link meant a wrong profile screen, not being blocked with no way out.

### 5. Writing to this database while a server reads it fails immediately — handled in the script

`PRAGMA journal_mode` reports `delete`, not write-ahead logging, so a write throws `database is locked` rather than waiting when a reader holds the lock. The first run of this script died on it, and — much worse — **the restore in the cleanup block died the same way**, so a run could have left the demonstration login blocked. It survived by luck: the failure landed before the first column was cleared rather than after. The script now sets `PRAGMA busy_timeout = 10000` and retries writes, and the cleanup block verifies the restore by re-reading and comparing every column. Worth knowing for any future script that writes to this database while an app is running.

## Negative controls — proving the suite can actually fail

Run 2026-07-31, after the review cycle, on commit `1024543` with the working tree confirmed byte-identical to it for every source file.

**Why this exists.** Every other result in this document is a green assertion, and this phase has already demonstrated what that is worth on its own: it passed 68 of 68 while the checklist was impossible to submit in a browser. A suite that cannot fail is not evidence. So each of the three real fixes was removed in turn, the app rebuilt, and the suite re-run — to establish that the assertions are load-bearing rather than vacuous.

| Control — what was broken | Suite result | Where it was caught |
|---|---|---|
| The gate call removed from the `(portal)` layout | **red, 22 failed** | Every blocked-direction assertion: `/dashboard -> 200 (no redirect) — expected a redirect to /onboarding`, and the same for the other five screens |
| `PATCH /api/profile` reverted to reading the company from the session token | **red, 3 failed** | `THE SAVE WROTE TO Phase 5 Probe Company A, the company named only by the stale token`; the correct company `did not receive the save`; `the representative is TRAPPED` |
| The logo input reverted to `type="url"` | **red, 4 failed** | `checklist field sponsor-onboarding-logoUrl (type=url, value "/sponsors/tailor-erp.png") fails browser validation: "Please enter a URL." — pressing submit will do NOTHING`, then the submit going nowhere and nothing reaching the database |

All three were caught, each in the assertion written for it, and each failure message names the mechanism rather than merely reporting a mismatch. The third is the one that matters most: it is the defect the original suite missed entirely, and the assertion added afterwards now identifies the offending field, its type, its stored value and the browser's own explanation.

Reproduce with `negative-controls.sh` as described in the review log, or by hand: break one thing, `pnpm --filter sponsor build`, restart, re-run the script, restore with `git checkout --`.

## Final verification run — 2026-07-31, all four apps

Everything rebuilt from the committed tree, every server killed first and confirmed to have started afterwards, so nothing stale was serving.

| Suite | Result |
|---|---|
| Phase 5 — sponsor screen gate | **117 passed, 0 failed, 0 skipped** |
| Phase 1 — participant onboarding gate | **53 passed, 0 failed** |
| Phase 3 — person-based exemption | **57 passed, 0 failed** |
| Phase 4 — delegate read refusal | **38 passed, 0 failed** |
| Type check, four apps | sponsor / admin / meetings clean; participant app reports only the documented `BottomNav` error |

**265 assertions, zero failures.** The database was left as found: no probe accounts, no disposable companies, 20 exhibiting companies, 14 of 20 satisfying the six exactly as before this work began, and the demonstration sponsor login entering the portal cleanly.

## Step summary

| Step | Category | Environment | Status |
|---|---|---|---|
| 1. Blocked and released through real page loads — all six screens, both directions | contract | tier C — local production build | **PASS** |
| 2. Checklist names exactly the missing items | contract | tier C | **PASS** |
| 2b. Copy matches the policy at 20/21; every control named | contract | tier C | **PASS** |
| 3. The checklist can actually be submitted | contract | tier C | **PASS** |
| 3b. An open checklist cannot undo somebody else's change | contract | tier C | **PASS** |
| 4. Re-blocking, fail-closed, moved representative, other apps | contract | tier C | **PASS** |
| 5. Type check | contract | anywhere | **PASS** — only the documented pre-existing error |
| 6. Gate cost on page load | perf-bar tier C | local production build | **PASS** — ≈0.5 ms added median, bar was 5 ms |
| 7. In-app navigation re-block | contract | tier C | **PASS with a recorded residual** — see Step 7 |

Script total: **117 passed, 0 failed, 0 skipped.**

## Pass / fail

**PASS.** All eleven acceptance criteria met. AC-2 is a document deliverable and is discharged by the enumeration above rather than by a runtime assertion, because asserting a directory listing would be a test that breaks on a rename while passing through a real behaviour change.

## What a passing run here is NOT evidence of

The assertions listed above, and nothing wider. Phase 1 passed 33 of 33 while a delegate blocked from every screen could still post in a chat room, and 48 of 48 while a client-side crash was reachable. This phase's own worst defect passed 68 of 68, and the adversarial review then found six more things at 72 of 72. Specifically **not** covered:

- **The 21 request handlers in this app.** An incomplete representative is still served by all of them. Phase 6 closes it.
- **A sponsor-role account with no exhibiting company.** No seeded account is in that state. The checklist route renders a short explanation rather than a form that cannot save, which is the minimum that avoids shipping the trap — Phase 7 owns the case and its acceptance criteria are the specification.
- **The checklist's visual layout**, on any screen size.
- **Anything on a deployed environment.** Every result here is tier C, a local production build against a local database. Phase 6 has a step that must run against a deployed preview.
- **A human using it.** No dry-run with the project owner has happened for any phase. That is the release gate, and it is the check that catches things no assertion here would notice.

## Re-run trigger

Re-run this script when: the six required items change; a route group is added to the sponsor app; the gate, the checklist, or `middleware.ts` in this app is edited; `isWbrStaff()` or `WBR_ROLES` changes; or `packages/db/src/onboarding-policy.ts` changes. Re-run Step 6 if the gate's query changes shape.
