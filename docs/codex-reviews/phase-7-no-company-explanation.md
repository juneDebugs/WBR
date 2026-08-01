# Codex adversarial review — Phase 7, the no-company explanation

**Not to be confused with `phase-7-midsprint-measurement.md` in this same folder.** That is from 2026-06-30 and belongs to the earlier demo-sprint numbering, where "Phase 7" meant something else entirely. This document is the plan's Phase 7 from the onboarding-and-floor-plan work.

Driven as `codex-companion.mjs adversarial-review --background --scope working-tree "<focus>"`. Working-tree scope, not branch scope: the phase is deliberately uncommitted through the review cycle, so a branch-scoped difference would be empty and every round would review nothing.

**Three rounds, run in full.** Round 2 was not skippable and round 3 was not skippable; the standing rule is to run all three even when a round looks like it will find nothing, and this cycle earned that rule again — see § What each round cost and returned.

Each round was told the earlier rounds' findings **by name and that they were fixed**, so it would not re-report them. Each round was given exactly four areas.

---

## What this phase is, in one paragraph

Phase 7 writes verification for behaviour that Phases 5 and 6 already shipped. Five of its seven acceptance criteria were satisfied by code on `main` before any of this existed; nothing verified them because no seeded account is in the state they describe. The phase therefore changes **no application code**. Everything under review is test code, one smoketest document, two planning documents, and a `CHANGELOG.md` correction folded in from earlier in the same session.

That shape matters for reading the findings below: every one is a defect in *evidence*, not in the product. None of them means a user was ever affected. All of them mean a green run said more than it had earned.

---

## Round 1

**Areas named:** assertions that can pass for the wrong reason; ways a negative control could report "caught" without being caught; whether the enumeration of nineteen guarded addresses is complete; the factual accuracy of the `CHANGELOG.md` change.

**Verdict:** needs-attention. Three medium findings.

### F-1 — Two absence checks passed on a page that had returned 500

`page()` returns an empty `html` string for any non-200 answer. Step 1 then tested `!html.includes('…checklist')`. When `/onboarding` fails, both checklist-absence assertions pass — reporting "the checklist did not render" about a page that rendered nothing at all.

**Fixed.** Both assertions now require the explanation to have rendered first. Held in place by negative control 5, whose predicted count rose from 5 to 7 and was then matched exactly by the run.

### F-2 — The panel extractor could reach into the embedded payload

`explanationPanel()` took a fixed 1500-character slice from the marker. Next.js embeds a serialized copy of the rendered text further down the document, so the window could run past the panel and match text that is in the response but not on the screen.

**Fixed.** It now walks balanced `div` tags to extract the actual element. **Measured rather than argued:** against a page reproducing the exact shape, the old 1500-character window matched a payload copy of the instruction and the tag-walking version does not.

### F-3 — The control driver ignored the suite's exit status, its skip count, and failed restores

Three separate problems in one finding. `suite_failures()` parsed only the failure count and discarded the exit code — but the suite exits non-zero for a **skip** as well as a failure, so a control could have been recorded as caught by a run whose assertions never executed, and the restored-tree check treated "0 failed" as green when a run that skipped everything reports the same. Separately, `restore_tree()` discarded its own errors and no caller checked it; with no `set -e`, a failed restore would have been silently ignored, letting one control's broken code stack onto the next or leaving the screen gate modified in the working tree after the run.

**Fixed.** `run_suite()` now returns exit code, failed and skipped. Controls require a non-zero exit, `failed == predicted`, and `skipped == 0`. The restored tree requires exit 0, 0 failed and 0 skipped. Restore is verified with `git diff --quiet` and is fatal through `restore_or_die`.

### Cleared by round 1

The nineteen-address enumeration, and the `CHANGELOG.md` commit identifiers, count and direction. **Both were also checked independently rather than taken on the reviewer's word:** `git grep -c "requireCompleteProfile()"` over `apps/sponsor/app/api` gives 19 calls across 14 route files, and exactly three route files have none — the NextAuth route, the hand-written login route, and `PATCH /api/profile`, which are precisely the three exclusions the guard's own comment documents.

---

## Round 2

**Areas named:** attack Step 2's deliberately weak control criterion; ordering and caching hazards in Step 5; whether the smoketest document claims more than the run establishes and complies with `CONTRACT.md`; whether the central claim in the planning documents — that five of seven criteria were already satisfied — is true criterion by criterion.

**Verdict:** needs-attention. Two medium findings.

### F-4 — The post-detach check accepted any redirect, and the writes were not checked

Step 5 claims that removing the company link is what refuses the account. It asserted only that `/dashboard` answered some 302, 303 or 307, and never checked that its own `UPDATE` statements had changed a row. A deleted fixture, an invalid session, or middleware bouncing to the sign-in page would all have satisfied it, and none of those is evidence about the company link.

**Fixed.** Both writes now assert `changes === 1`. The post-detach check asserts the redirect goes specifically to `/onboarding`, and that `GET /api/sponsor-data` answers the specific onboarding refusal rather than any error. Step 5 went from 4 assertions to 8, and controls 1 and 2 rose from 3 to 4 and from 19 to 20 — both predicted before the run and matched by it.

### F-5 — The smoketest document carried pre-fix control numbers

The document still said 25 checks and control 5 at 5, after round 1's fix had made it 26 and 7. Because the smoketest document **is** acceptance criterion AC-7, a stale number there is not bookkeeping — the published artifact claimed a different result from the one the source would produce.

**Fixed.** Every number re-read from the actual driver output.

### Areas round 2 examined and did not fault

Step 2's control criterion, and the caching hazard in Step 5. **Both were checked independently as well**, and the reasoning is recorded here because it is the answer to an obvious objection rather than an absence of one:

- **Step 2's control cannot be satisfied by a route that does not exist.** The criterion for the legitimate caller is only "not refused by the guard", which on its own a Next.js 404 for a mistyped path would satisfy. It is sound because it is paired: the *refusal* assertion for the same path requires a 403 carrying `onboardingRequired`, and that body is produced by exactly one function — the guard's `refusal()`. A path that answers it is therefore a real route that calls the guard. The pair establishes what neither half does alone.
- **No cached value can bypass the refusal.** The gate, the guard and the onboarding page cache nothing, and neither does `GET /api/sponsor-data`, which is the address Step 5 reads. Two handlers do cache — `/api/profile/sponsor-data` and `/api/attendees` — and in both the guard runs first: the guard is at line 52 with the cached reads at 61–62, and at line 20 with the cached read at 23.

---

## Round 3

**Areas named**, all of them things rounds 1 and 2's own fixes introduced, or this phase's own tooling — deliberately, because last cycle three of four final-round findings came from exactly there: the tag-walking panel extractor that round 1's fix introduced; the control driver's new exit-code and skip machinery; Step 5's new assertions from round 2; and whether the two documents' numbers match the source.

**Verdict:** needs-attention. Two medium findings. **The final round was not a formality and the three-round cap earned itself again.**

### F-6 — The panel extractor could still start at the wrong tag

Round 1's fix replaced a fixed character window with a tag walker, and the walker was still anchored on the bare marker text: it took the **first** occurrence of `sponsor-onboarding-no-company` anywhere in the document, stepped back to the previous `<`, and started counting from there. It never established that the marker was on a `div`, or on the panel's own opening tag.

**The reviewer reproduced it rather than asserting it.** With a payload string containing the marker *and* the instruction placed before a real panel that had no instruction, the helper returned a slice beginning at `<script>` and the AC-1 contact assertion passed against payload text while the visible panel said nothing.

**Fixed.** The extractor now anchors on the element's own opening tag — it requires a literal `<div … data-testid="sponsor-onboarding-no-company" …>` — and refuses any slice that turns out to contain a `<script`, which would mean the walk ran past the element. Next.js serializes its payload as escaped JSON strings, which cannot form a literal div start tag.

**Proven against the reviewer's own reproduction**, using the shipped function rather than a copy: on that page the contact assertion is now `false` against the panel and `true` against the whole document — the trap, avoided. On an ordinary page the panel is still found, the contact assertion is still `true`, and the trailing script is excluded.

**This is the third appearance of the same defect in one phase.** The bare-word search, the fixed window, and now the unanchored walker were three successive attempts to answer "what does the panel say", and each was satisfiable by text that is in the response but not on the screen.

### F-7 — This document claimed three rounds while round 3 was a placeholder

The § What each round cost and returned table recorded `—` for round 3 and the round 3 section held a placeholder, while the opening paragraph already asserted that all three rounds had been run in full. Because the smoketest document is acceptance criterion AC-7 and this log is its companion, shipping that would have been an evidence artifact claiming a review whose result it did not record.

**Fixed.** This section, and the table below.

---

## What each round cost and returned

| Round | Areas | Findings | Of which changed the evidence |
|---|---|---|---|
| 1 | 4 | 3 medium | 3 |
| 2 | 4 | 2 medium | 2 |
| 3 | 4 | 2 medium | 2 |
| **Total** | | **7 medium** | **7** |

**No round was skippable, and every one found something the previous round had already looked at.** Round 1 rewrote the panel extractor; round 3 found the rewrite still wrong, and reproduced it. Round 2 found the loosest assertion in the suite after round 1 had been through the same file. The standing rule to run all three even when a round looks unnecessary has now earned itself in three consecutive phases.

**Pointing the final round at the earlier rounds' own fixes is what produced both of its findings.** Neither came from code the earlier rounds had not seen; both came from what fixing it introduced. That targeting is worth reusing.

---

## The pattern under every finding

Every defect found this cycle — seven across three rounds, plus the one the negative controls found before any review ran — is the same defect wearing different clothes: **an assertion satisfied by more states than the one it claims to be about.**

- the word "organizer" appearing anywhere in the document, rather than in the panel, as an instruction
- a checklist "absent" from an empty string
- a panel located by a character count rather than by its own tags
- a panel located by a marker that any script or comment could also carry
- a redirect to anywhere, rather than to the explanation
- an `UPDATE` that updated nothing
- a control "caught" by a run that skipped rather than failed

**Three of those are the same question asked three times.** "What does the panel say" was answered first by searching the whole document, then by a fixed character window, then by an unanchored tag walk — and each answer was satisfiable by text that is in the response but not on the screen. It took a negative control and two review rounds to get to an anchor that is the element itself.

None was a wrong assertion. Each was a *loose* one — true of the correct behaviour, and also true of several incorrect ones. That is the failure mode this phase should be remembered for, because a loose assertion is invisible in a green run and only a deliberately broken build reveals it.

**The practical rule:** for every assertion, ask what else would satisfy it. If the answer includes a state the code should never be in, the assertion is not finished.
