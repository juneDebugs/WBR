# Phase 2 Smoketest — shared completeness policy, existing readers re-pointed

Manual verification path. Both human and AI agents are valid runners. Authored per [`docs/smoketests/CONTRACT.md`](CONTRACT.md); source: [`.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md`](../../.claude/plans/wbr-onboarding-and-floor-plan-2026-07-30.md) § Phase 2, and the requirements document [`wbr_onboarding_enforcement_prd_2026_07_30.md`](../../.claude/docs/prds/wbr_onboarding_enforcement_prd_2026_07_30.md) user stories OE 24–30.

**Run date:** 2026-07-30. **Branch:** `onboarding-enforcement-foundation`.

---

## What Phase 2 changed, in one paragraph

Four places in this repository each asked "is this profile complete, and if not what is missing?" and each held its own answer. Phase 2 moved that answer into one module, `packages/db/src/onboarding-policy.ts`, and pointed all four at it: the attendee app's screen gate, its request guard, its onboarding checklist, and the admin app's exhibitor reminder email. The sponsor required set is defined in the new module but nothing enforces it yet — that is Phase 5.

**This phase is meant to change no behaviour at all.** That is the whole point of doing it separately, and it is what makes the evidence below meaningful: if the definition had shifted while being moved, Step 1 or Step 3 would show it.

---

## What this verifies

- Phase 1's delegate onboarding gate behaves exactly as it did before the move — **plan AC "Phase 1's Playwright script passes unchanged, at its full assertion count, with no edits to the script"**.
- The shared module answers, for a named required set, whether a subject is complete and which items are missing, in declaration order — **plan AC 1**.
- The module carries no runtime imports, so a browser component can deep-import it without pulling database code into the bundle — **plan ACs 2 and 3**.
- A scalar item counts as missing when blank after trimming; a list item counts as missing when it parses to an empty list, and also when it parses to valid data that is not a list of text — **plan ACs 4 and 5**.
- The awkward-input set is documented at the module with the expected outcome for each — **plan AC 6**.
- The delegate required set holds the same six fields as before; the sponsor required set holds the six items named in the plan's architectural decisions — **plan AC 7**.
- The admin exhibitor reminder reads the shared list and still chases the same nine items with the same wording — **plan AC 8**.
- Every column a completeness check reads is a column the query fetched, derived from the set rather than written out beside it — **plan AC 9**.
- `pnpm typecheck` is clean apart from the documented pre-existing tuple-index error — **plan AC 10**.

## Prerequisites for the runner

- Node 26 or later. The checks in Step 2 and Step 3 import a TypeScript module directly, which Node does natively; no test runner is involved and none was added.
- `apps/attendee/.env.local` with `DATABASE_URL` set to an **absolute** `file:/…` path and `NEXTAUTH_SECRET` set. The relative form in the README does not resolve at runtime and every page fails with "Unable to open the database file".
- The seeded local database at `packages/db/prisma/dev.db`, with the canonical demonstration accounts present. If the delegate account's required fields are missing, run `pnpm db:backfill-onboarding` — **never `pnpm db:seed`**, which deletes every user it did not generate (measured at 2,516 users removed).
- Playwright with Chromium installed, for Step 1.
- A local production build of the attendee app for Steps 1 and 4: `pnpm --filter attendee build && pnpm --filter attendee start`.

---

## Steps

### Step 1 — Phase 1's browser test passes unchanged [contract, tier C]

**Verifies:** that moving the definition of "complete" between files preserved its meaning. This is the primary evidence for the whole phase. The test drives a real browser through the delegate gate: blocked while incomplete, released on completion, re-blocked when a required field is cleared, data-changing requests refused with 403 while the profile-save address still works.

The script must not be edited. A test that had to be adjusted to pass would be evidence of nothing.

```bash
# Confirm the script is byte-identical to the merged Phase 1 version
git diff --stat docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs
# (no output = unchanged)

# Cold-start a production build. Kill any server already on 3001 first — a
# server started before the change serves stale code and produces a false pass.
lsof -ti:3001 | xargs -r kill
pnpm --filter attendee build && pnpm --filter attendee start &

node docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs
```

- [x] Run the script against a freshly started production build.
  - **Pass:** `git diff --stat` prints nothing for the script, and the script prints `Results: 53 passed, 0 failed` and exits 0.
  - **Fail:** any assertion fails, the count is below 53, or the script needed an edit to pass.

**Result: PASS — 53 passed, 0 failed, script unmodified.** Server was cold-started from a fresh production build after killing a process on port 3001 that had been running since 05:07 that morning, before any of this phase's changes.

### Step 2 — The shared module's rules, sets and derived selects [contract]

**Verifies:** the parts of the policy a browser flow cannot reach — the stored values that must count as empty, the buyer-and-seller mirror, the derived database `select`, and the module having no imports.

```bash
pnpm test:onboarding-policy
```

- [x] Run the module checks.
  - **Pass:** the script prints `Results: 44 passed, 0 failed` and exits 0.
  - **Fail:** any assertion fails.

**Result: PASS — 44 passed, 0 failed.** Covering, among others:

| What is asserted | Outcome |
|---|---|
| No `import` or `require` statement anywhere in the module | none found |
| Stored `"[]"`, `"5"`, `"\"hello\""`, `"{}"`, `"null"`, `"not json"`, `""`, null, undefined | all count as missing |
| Stored `"[\"a\"]"` | counts as filled — the only filled case |
| Stored `"[5]"` (valid data, not a list of text) | counts as missing |
| Scalar `" "` and `"   "` | count as missing |
| Delegate set is the same six fields, same order, same label wording | matches Phase 1 exactly |
| Delegate set asks what a buyer seeks, never what they offer | holds |
| Sponsor required items read what a seller offers, never what they seek | holds |
| Sponsor required set is logo, tagline, description, contact, solutions, website | matches the plan |
| The three excluded items are booth, teammates, social | matches the plan |
| The delegate `select` covers exactly the required fields — no more, no fewer | holds |
| No required sponsor item reads a column its `select` omits | holds |
| A subject with nothing known at all is judged incomplete, not complete | holds — the refusing direction |

### Step 3 — Old rules and new rules agree on every seeded row [contract]

**Verifies:** the "no behaviour change" claim, measured rather than asserted. The check script holds copies of the code as it stood *before* this phase — the attendee app's `profile-completeness.ts` rules and the admin reminder route's inline nine-item list — and judges every seeded row by both.

This matters because the shared rules are **stricter** than the ones the admin reminder used to apply: a value that is only spaces now counts as absent, and a stored list that is valid data but not a list of text now counts as empty. Strictness only changes behaviour if some row is actually affected, so that had to be measured.

```bash
pnpm test:onboarding-policy   # the last section of its output

# The same result, independently, straight from the database:
sqlite3 packages/db/prisma/dev.db "
SELECT 'logo', SUM(CASE WHEN (logoUrl IS NOT NULL AND logoUrl<>'') <> (logoUrl IS NOT NULL AND trim(logoUrl)<>'') THEN 1 ELSE 0 END) FROM Sponsor
UNION ALL SELECT 'tagline', SUM(CASE WHEN (tagline IS NOT NULL AND tagline<>'') <> (tagline IS NOT NULL AND trim(tagline)<>'') THEN 1 ELSE 0 END) FROM Sponsor
UNION ALL SELECT 'website', SUM(CASE WHEN (website IS NOT NULL AND website<>'') <> (website IS NOT NULL AND trim(website)<>'') THEN 1 ELSE 0 END) FROM Sponsor;"
```

- [x] Compare old and new verdicts across every user row and every exhibiting company.
  - **Pass:** zero rows disagree, for delegates and for the reminder's chase list and percentage alike.
  - **Fail:** any row where the old and new rules give different answers.

**Result: PASS.**

| Comparison | Rows | Disagreements |
|---|---|---|
| Delegate complete/incomplete verdict, old rules vs new | 2,539 users | 0 |
| Admin reminder chase list (the nine labels, in order) | 20 companies | 0 |
| Admin reminder completion percentage | 20 companies | 0 |
| Strict vs loose emptiness, per reminder item, straight from SQL | 20 companies × 9 items | 0 |

Also recorded, because the sponsor required set was chosen on it: **14 of 20 exhibiting companies satisfy the six required items**, the demonstration company among them. Against the sponsor dashboard's 18-field percentage the figure is 0 of 20, which is why that percentage was rejected as a condition of entry. If the 14 ever moves, the choice needs revisiting — the check script asserts it.

### Step 4 — No database code reaches the browser bundle [contract, tier C]

**Verifies:** that the two browser components importing the policy by its direct module path (`@conference/db/src/onboarding-policy`) did not pull the database client into the browser. `packages/db/src/index.ts` exports the live client and re-exports the whole generated Prisma client, so importing through the package root would. **This failure is silent — it does not break a type check**, which is why it needs its own step.

```bash
pnpm --filter attendee build

# Must be zero for every marker:
for marker in PrismaClient "@prisma/client" libsql prisma; do
  echo "$marker -> $(grep -rl "$marker" apps/attendee/.next/static/chunks/ 2>/dev/null | wc -l)"
done

# Positive control — the policy module's own text MUST be present, otherwise the
# zeros above prove nothing except that the module was never bundled at all:
grep -rl "Solutions you" apps/attendee/.next/static/chunks/
```

- [x] Search the built browser chunks for database markers, then confirm the policy module is genuinely present.
  - **Pass:** zero browser chunks contain any database marker, **and** at least one browser chunk contains a policy label.
  - **Fail:** any database marker appears, or no chunk contains a policy label (which would make the first result meaningless).

**Result: PASS.** All four markers — `PrismaClient`, `@prisma/client`, `libsql`, `prisma` — appear in **0** browser chunks. The positive control found the delegate label text in `chunks/3348-*.js`, confirming the module did reach the browser.

### Step 5 — Type check [contract]

**Verifies:** no type errors were introduced. Note that `pnpm lint` cannot run anywhere in this repository — no ESLint configuration exists in any app, so it drops into an interactive setup prompt. `pnpm typecheck` is the only working static check. Note also that the build does not catch type errors: every `next.config.js` sets `typescript.ignoreBuildErrors: true`.

```bash
pnpm typecheck
```

- [x] Run the type check across all four apps.
  - **Pass:** the only error is `apps/attendee/components/BottomNav.tsx(40,101): error TS2514`.
  - **Fail:** any other error.

**Result: PASS with the one documented pre-existing error.** `components/BottomNav.tsx(40,101): error TS2514: A tuple type cannot be indexed with a negative value.` — recorded in the Phase 1, 2 and 15 review logs and explicitly not to be fixed as a side task.

Turbo stops the whole run at the first failing package, so each app was additionally type-checked on its own:

| App | Result |
|---|---|
| `apps/web` | clean |
| `apps/sponsor` | clean |
| `apps/meetings` | clean |
| `apps/attendee` | the one documented `BottomNav.tsx` error, nothing else |

**One thing the runner should know.** Before this run, the admin and meetings apps each produced three further errors of the form `Cannot find module '.../page.js'`. Those came from stale generated files under each app's `.next/types/`, dated 29 June, pointing at source routes that no longer exist — the meetings app was not touched by this phase at all. Clearing those generated directories (`rm -rf apps/<app>/.next/types`) removes them; they are gitignored build output and are recreated by the next build. If you see errors naming files under `.next/`, clear that directory before treating them as real.

---

## Step summary

| Step | Category | Environment | Status |
|---|---|---|---|
| 1. Phase 1's browser test passes unchanged | contract | tier C — local production build | **PASS** — 53/53, script unmodified |
| 2. Shared module rules, sets, derived selects | contract | anywhere | **PASS** — 44/44 |
| 3. Old rules and new rules agree on every seeded row | contract | anywhere | **PASS** — 0 disagreements across 2,539 users and 20 companies |
| 4. No database code in the browser bundle | contract | tier C — local production build | **PASS** — 0 markers, positive control present |
| 5. Type check | contract | anywhere | **PASS** — only the documented pre-existing error |

No perf-bar step. This phase changes no rendering path and makes no performance claim.

## Pass / fail

Phase 2 ships when all five steps pass. All five pass as recorded above.

## What a passing run here is NOT evidence of

**Green is evidence about the assertions listed above and nothing wider.** This is stated in every smoketest in this sprint because Phase 1 learned it the hard way: its own smoketest recorded 33 of 33 passing while a delegate blocked from every screen could still post in a chat room, and 48 of 48 while a client-side crash was reachable. Every defect that cycle came from adversarial review or from someone checking a claim, and none from a test going red.

Specifically **not** covered here:

- **Whether an incomplete delegate can still read conference content.** They can. Fifteen reading addresses in the attendee app return data without consulting the required set. That is unchanged by this phase and is what Phase 4 closes.
- **Anything about the sponsor gate.** The sponsor required set is defined in the module and nothing reads it yet. Phase 5 adds the screen gate, Phase 6 the request guard.
- **The person-based exemption.** An organizer using the attendee app is still gated exactly like a delegate. Phase 3 changes that.
- **The checklist's visual layout.** Step 1 asserts which items are named, not how they look.
- **The four soft completeness measures** — the sponsor dashboard's 18-field percentage, the meetings portal's 8 fields, the attendee home screen's 6 fields, and the reminder's own nine items shown as a percentage. This phase does not make them agree with each other and is not meant to.

## Known residual, deliberately left

The Phase 1 script carries a comment at line 122 reading "Checklist labels, from lib/profile-completeness.ts FIELD_LABELS". That file no longer exists; the labels now live in `packages/db/src/onboarding-policy.ts` as `DELEGATE_FIELD_LABELS`. The comment was **not** corrected, because this phase's acceptance criterion is that the script passes *with no edits*, and editing it — even a comment — would weaken that evidence. Correcting the comment belongs to any later phase that has cause to touch the script.

## Re-run trigger

Re-run this smoketest in full whenever a later phase touches:

- `packages/db/src/onboarding-policy.ts` — the shared policy itself
- `apps/attendee/lib/onboarding-gate.ts` — the screen gate
- `apps/attendee/lib/require-complete-profile.ts` — the request guard
- `apps/attendee/app/(authenticated)/onboarding/page.tsx` and `apps/attendee/components/onboarding/OnboardingChecklist.tsx` — the checklist
- `apps/attendee/components/setup/SetupClient.tsx` — the Settings screen, which clears required fields
- `apps/web/app/api/sponsors/remind/route.ts` — the exhibitor reminder email
- `packages/db/src/index.ts` — because what it exports decides whether a deep import is still necessary

Phases 3 and 4 land on this same branch and both touch the first three of those, so both re-run it.
