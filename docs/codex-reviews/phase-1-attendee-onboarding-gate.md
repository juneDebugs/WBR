# Codex Adversarial Review — Phase 1 Attendee Onboarding Gate

Loop run on 2026-07-29 against branch `phase-1-attendee-onboarding-gate` (cut from `main` at `687fe4c`). Cap N=3 per WBR default; commit once at the end of the cycle.

**Bar applied:** AC-FAILING = would make a Phase 1 acceptance criterion fail, OR violates [`docs/smoketests/CONTRACT.md`](../smoketests/CONTRACT.md), OR would trip the commit blocklist on committed content. Everything else reported but non-gating.

**Source PRD and plan** are engineer-local (gitignored): the floor-plan + onboarding PRD dated 2026-07-21, §Phase 1 of its plan. Findings F-1 through F-7 are recorded there.

**Files reviewed:**

NEW:
- `apps/attendee/lib/profile-completeness.ts` — pure policy: `ATTENDEE_REQUIRED_FIELDS`, `isComplete`, `missingFields`, `parseArrayField`, `REQUIRED_FIELD_SELECT`.
- `apps/attendee/lib/onboarding-gate.ts` — shared page gate (product of R1).
- `apps/attendee/lib/require-complete-profile.ts` — shared API guard (product of R2).
- `apps/attendee/app/(authenticated)/onboarding/page.tsx`, `apps/attendee/components/onboarding/OnboardingChecklist.tsx` — the checklist.
- `docs/smoketests/phase-1-attendee-onboarding-gate.md` + `docs/smoketests/playwright/phase-1-attendee-onboarding-gate.mjs`.

MODIFIED:
- `apps/attendee/app/(authenticated)/(app)/layout.tsx`, `apps/attendee/app/(authenticated)/(fullscreen)/layout.tsx` — call the page gate.
- 13 route files under `apps/attendee/app/api/**` (15 handlers) — call the API guard.
- `apps/attendee/components/setup/SetupClient.tsx` — cache invalidation after save; safe array parsing.

NOT MODIFIED (deliberately out of scope):
- The Settings screen showing attendees both "Solutions I Offer" and "Solutions I'm Seeking" — a latent buyer/seller inversion, noted in the PRD's Out of Scope.
- Read-only `GET /api/**` endpoints remain ungated (see R2-F1 adjudication).
- `apps/attendee/components/BottomNav.tsx(40,101)` TS2514 — pre-existing, documented in CLAUDE.md.

---

## Round 1 — 1 AC-failing finding APPLIED + 2 false positives rejected

- **R1-F1 (AC-FAILING, APPLIED).** `(fullscreen)/chat/[roomId]` bypassed the gate. The gate was a check inside the tabbed `(app)` layout; the full-screen route group has its own layout and was untouched.

  **Adjudication: CONFIRMED by measurement.** With `solutionsSeeking = "[]"`: `/chat` → 307 to `/onboarding`, but `/chat/room-general` → **200**. An attendee blocked from every visible section could open a chat room and post in it. Breaks AC-1.

  **Fix.** Extracted the check into `lib/onboarding-gate.ts` and called it from both route-group layouts. A single function with several call sites is harder to half-apply than a check copied per layout. Re-measured: incomplete → 307 on all three routes; complete → 200 on all three (over-blocking ruled out). Recorded as PRD finding F-3.

  **Note on how it was missed.** The phase smoketest passed 33/33 while this was live, because it exercised `/chat` (the list, inside the gated group) and never `/chat/[roomId]` (the room, in the other group).

- **R1-F2 (claimed AC-FAILING, REJECTED).** Claimed committing the smoketest doc would trip the blocklist on the literal `.claude`.

  **Adjudication: DISPROVED empirically.** Ran the actual hook scanner (`~/.config/tailor/git-hooks/lib/scan-diff-for-blocklist` against `~/.config/tailor/customer-blocklist.txt`) over the real diff: **clean**, with a positive control confirming the scanner works (it flagged other terms and exited 1).

  **How the `.claude` rule actually behaves** — measured, after an initial wrong reading of it. The scanner applies it two ways, and only one of them fires:

  | `.claude` appears as | Blocked |
  |---|---|
  | a **filename** in the diff (e.g. `.claude/settings.local.json`) | **yes** |
  | **prose content** mentioning a `.claude/…` path | no |

  So the entry is not dead — it does exactly what its own comment in the blocklist says, guarding against internal-folder filename leaks. It simply does not catch prose that quotes such a path, which is why the committed smoketest doc referencing `.claude/plans/…` would not have been blocked. An earlier draft of this log claimed the entry could never match; that was wrong and is corrected here.

  **Partial credit.** It pointed at something real by accident: the doc cited gitignored `.claude/…` paths, so a committed doc would reference files no other reader has. Rewritten to the convention prior logs use ("engineer-local … (gitignored)").

- **R1-F3 (claimed AC-FAILING, REJECTED).** Claimed demo identity strings in the runner would trip the blocklist.

  **Adjudication: DISPROVED.** Those terms are not on the blocklist; the scanner reports the file clean. Codex was reasoning about a blocklist it had not read.

**Round 1 also confirmed**, on inspection, that the settings-save `router.refresh()` resolution is sound (the PATCH is awaited before the refresh) and that the photo-save path writes only an optional field.

**Action.** One fix applied. Two rejections recorded. Full N=3 cap continues per protocol.

---

## Round 2 — 1 AC-failing finding APPLIED + 2 non-breaking findings APPLIED

Rounds 2 stalled twice before producing output — both attempts used a ~7,400-character framed prompt and hung after reading files, at 9m30s and 8m of unchanged log respectively. Both were cancelled. A third attempt with a ~1,600-character prompt naming four specific areas completed in one pass. **Prompt length is the suspected cause; recorded so the next phase starts short.**

- **R2-F1 (AC-FAILING, APPLIED).** API route handlers bypassed the gate. The gate runs inside route-group layouts; route handlers are not rendered inside any layout, and their own guard asks only whether the caller is signed in.

  **Adjudication: CONFIRMED by measurement.** As the deliberately-incomplete demo account, blocked from every page: `GET /api/data/people` → 200 (45,914 bytes), `GET /api/data/schedule` → 200 (1,447,106 bytes), and — the material part — `POST /api/friend/test-brand` → **200** `{"status":"pending_outgoing"}`, creating a pending friend request against another attendee.

  Against AC-1's literal wording this is arguable, since it enumerates sections rather than endpoints. Against user story 3 it is not: *"so that I cannot half-use the app with a broken profile."*

  **Fix, scoped deliberately.** New `lib/require-complete-profile.ts` returning 403, applied to the 13 route files that change data (15 handlers). Three exemptions: the profile-save route (the checklist writes through it — guarding it would make the required set impossible to complete and trap every incomplete attendee permanently), the sign-in route (no session yet), and cache revalidation (shared-secret, no user session). **Read-only endpoints deliberately left open** — acting as a half-registered attendee is the behaviour the story forbids; gating ~30 read routes is a wider change with a smaller payoff. Recorded as a follow-up, not dropped. PRD finding F-4.

  **A bug of my own, caught in review of the diff.** The scripted insertion placed the new import inside a multi-line import block in two files, producing invalid syntax, while reporting success. Found by reading the diff rather than trusting the script; fixed; typecheck confirms.

- **R2-F2 (NON-BREAKING, APPLIED).** The full-screen smoke assertion accepted *any* response that was not a redirect to the checklist, so a 500 from a broken page would record a pass. Now asserts an explicit set of acceptable statuses.

- **R2-F3 (NON-BREAKING, APPLIED).** Step 1 looped over the eight tab roots while claiming to cover "every gated section". Seven nested and dynamic routes added to the blocked-direction loop. PRD finding F-5.

**Round 2 also correctly ruled out** two of the four areas it was pointed at, with specific reasoning rather than hedging: the trim mismatch between the checklist and the settings screen, and the bare `JSON.parse` on the required array field — both unreachable while an attendee is blocked, because the settings screen is itself gated.

**Action.** Three fixes applied. Assertion count 35 → 48.

---

## Round 3 — 2 AC-failing findings APPLIED + 1 non-breaking accepted + cycle closed

Framed short (~2,000 characters) per the Round 2 lesson; completed in one pass.

- **R3-F1 (AC-FAILING, APPLIED).** The new API guard failed **open** when a signed-in session pointed at a deleted user row, and several handlers upsert a minimal user before acting.

  **Adjudication: CONFIRMED by measurement.** Created a throwaway attendee, took a session cookie, deleted the user row, called the friend endpoint: **200**, and a friend request was created on behalf of a user that no longer existed.

  Not hypothetical here — the seed script deletes thousands of users, so sessions pointing at deleted rows are an ordinary consequence of reseeding.

  **Fix.** Fail closed: if completeness cannot be established, refuse. Re-measured: row present → 200, row deleted → 403. PRD finding F-6.

- **R3-F2 (NON-BREAKING, ACCEPTED AS-IS).** The profile-save exemption is broader than the checklist strictly needs: an incomplete attendee can also write optional fields (image, bio, website, LinkedIn URL) through it.

  **Adjudication: accurate, and accepted.** These are the attendee's own optional profile fields; writing them neither passes the gate nor affects anyone else. Narrowing the exemption to the required set would add branching to the one route that must never wrongly refuse, and the LinkedIn pre-fill planned for Phase 7 writes name and image through this same route — so a narrower allowlist would need reopening almost immediately. Recorded rather than changed.

- **R3-F3 (AC-FAILING, APPLIED).** A malformed **optional** array field blanked the settings screen. The screen used a bare parse; the optional "solutions offering" field does not trip the gate, so an otherwise-complete attendee reached the screen and it failed.

  **Adjudication: CONFIRMED by measurement, and it required a browser.** With the value set to `{`: settings heading never rendered, body text 127 characters against a 1,283-character baseline, JSON parse error thrown in the page. **HTTP returned 200 throughout** — the component renders client-side, so a status-code check cannot see this. My own earlier note had flagged it as unverified; the browser probe settled it.

  **Fix.** Use the completeness policy's parser on the settings screen, giving one definition of the column's meaning instead of two. Verified across five malformed values including non-array JSON. PRD finding F-7.

- **Route census (informational).** Round 3 enumerated every `POST/PATCH/PUT/DELETE` under the attendee API and confirmed **no mutating handler was missed** beyond the three intended exemptions.

- **Cost note (ACCEPTED).** Each guarded handler now calls `getServerSession` twice, since the guard re-decodes rather than accepting a user id, plus one user query per data-changing request. Accepted: these are not hot paths, correctness outranks a saved JWT decode, and threading a user id through 15 call sites risks precisely the mechanical error already made once this cycle. Recorded as a possible tidy-up.

**Action.** Two fixes applied, one finding accepted with rationale. Assertion count 48 → 53. **Cap reached; cycle closed.**

---

## Verdict

Three rounds run to the N=3 cap. **Four AC-failing findings, all fixed and each re-verified by measurement against a running app:** two gaps in gate coverage (a whole route group, then the entire API surface), one fail-open guard, one client-side crash. Two blocklist findings rejected on evidence. Three non-breaking findings applied, one accepted with reasons.

**Final state:** smoketest 53 assertions passing, 0 failing, on a cold-started server. `pnpm typecheck` clean apart from the documented pre-existing `BottomNav.tsx` error. `pnpm lint` cannot run anywhere in this repo — no ESLint configuration exists in any app — so typecheck is the only working static check; reported separately.

**The lesson worth carrying into Phase 2.** The phase's own smoketest passed 33 of 33 while a genuine AC-1 violation was live, and passed 48 of 48 while a client-side crash was reachable. Every gap was found by adversarial review, none by the tests. A green run is evidence about the assertions it lists and nothing wider — stated explicitly in the smoketest doc so a future reader cannot over-read it.

**Deliberately left open, recorded not dropped:** read-only API endpoints remain reachable by an incomplete attendee; the in-browser page cache means the page gate does not re-fire on navigation to an already-visited section within its five-minute window (closed at the only in-app path that can clear a required field); and seeded demo data required a backfill to satisfy the new required set, with one account left deliberately incomplete for demonstrating the gate.
