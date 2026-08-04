# Phase 12 — Codex adversarial review log

**Subject:** "Sign in with LinkedIn" on the participant app — an OpenID Connect provider registered only when
its credentials are set, a button that is drawn only when the provider is registered, a name-and-photo
pre-fill that writes into blank fields only, a read-only photo on the onboarding checklist, and a clean
refusal when LinkedIn sends no email address. Includes findings **F-24** (the product carries no approval
delay), **F-25** (the email address is optional and the account lookup depends on it) and **F-26** (a
documented safeguard did not exist, found by a negative control whose prediction was wrong).

**Rounds:** 3, the cap, run as one cycle. **Scope:** working tree. **Date:** 2026-08-04.

**Entering the review:** suite at **74 assertions, 0 failed**; **8 negative controls, 8 caught by their exact
prediction**, every prediction written before its run.

---

## THE REVIEW WORKAROUND IS APPLIED. REVERSE IT BEFORE ANY COMMIT.

Same workaround, same reason, as Phases 10 and 11. The review tool refuses inputs over 1,048,576 characters
and the working tree carries six copies of the local database at roughly 4.4 MB each.

`git update-index --assume-unchanged` is applied to eight files, and two lines are appended to
`.git/info/exclude`. **A commit made without reversing this silently omits files.**

Reverse with:

```
git update-index --no-assume-unchanged \
  apps/attendee/dev.db apps/meetings/dev.db apps/sponsor/dev.db \
  apps/web/dev.db packages/db/dev.db packages/db/prisma/dev.db \
  apps/attendee/public/sw.js .claude/settings.local.json
```

then remove the trailing `.claude/` and `.vscode/` lines from `.git/info/exclude`.

Verify with `git ls-files -v | grep '^h'` returning nothing, and `tail -3 .git/info/exclude` showing neither
line.

**This section is written before the first round runs, not after the last one.**

---

## What each round is asked to examine

Recorded before the rounds run, so a round cannot be described afterwards as having covered whatever it
happened to find.

- **Round 1 — the product code.** The provider assembly and its rules module; the sign-in callback's LinkedIn
  branch against the Google branch beside it; the login screen's provider lookup; the checklist photo; the
  onboarding page's widened database read.
- **Round 2 — this phase's own test script.** Assertions that pass while measuring nothing, assertions that
  cannot go red, the borrowed-person snapshot and restore, and the two-configuration app management.
- **Round 3 — the negative controls and the documents.** Whether each control breaks what it claims, whether
  the predictions match what the suite can observe, and whether the requirements document and plan describe
  the code as it now stands, including the F-26 correction.

---

## Findings

### Round 1 — the product code

**Launched twice; the first attempt produced nothing and that is worth recording.** Job
`task-mse9aqln-6ik09d` was started through the review subagent, which ran the tool in the foreground; the
harness moved that subagent's shell to the background at two minutes and the tool's process was a child of
it. The process was gone while the job's own status still read `running` with a climbing elapsed counter, and
its log stops mid-run with no error line. A status report was given from that counter rather than from the
process, and was wrong. Relaunching from a plain shell with the tool's own background flag completed in
**2m 20s**. **Check the process, not the elapsed counter.**

The dead attempt left two partial conclusions in its log, both of which the completed run reached
independently: the placeholder role is replaced from the database before the session token is built, and the
address lookup is exact while the value looked up is canonicalized.

**Four findings. Two fixed, two recorded and not fixed.**

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | High | An address LinkedIn does not vouch for could join an existing account of any role, taking its role and company link | **Fixed** — F-27 |
| 2 | Medium | A sign-in refused for its role had already written to the row | **Fixed** — F-28 |
| 3 | Medium | An exact lookup against a canonicalized address could create a duplicate row | **Not fixed** — unreachable, recorded as a residual |
| 4 | Low | The button can stay hidden while the provider is configured | **Not fixed** — deliberate, fails closed |

**Finding 1 was a wrong reason, not an oversight.** `linkedInIdentity` read `email_verified` and a comment
gave a reason for ignoring it: the other sign-in paths do not verify either. Email-and-password requires a
password, which is proof of control; Google verifies the addresses it asserts. LinkedIn omitting the claim is
LinkedIn declining to make it. Full analysis, the four-case rule and the two rejected alternatives are in
**F-27**.

**Finding 2 was an ordering, which nothing could observe.** The fix therefore did more than reorder two
statements: the whole sequence is now decided by one function, `linkedInAction`, which returns what to do. A
refusing outcome carries no update, and that is a property of the returned value rather than of where two
lines sit — so it is assertable without completing a real sign-in, which needs an account password. Recorded
as **F-28**.

**Finding 3 was checked before the round reported and reached the same place from two directions.** The
mechanism is real: `User.email` is `TEXT` with a plain unique index and no case-insensitive collation, so
`Alice@Example.com` and `alice@example.com` are distinct values. It is not reachable: all seven call sites of
`prisma.user.create` and `prisma.user.upsert` lowercase first, as does the seed, and of 2540 stored addresses
**0** are not entirely lowercase, **0** carry padding, and **0** pairs differ only by case. The round added one
consequence worth keeping — if such a row ever appeared, the original password-bearing account would become
unreachable, because the ordinary login path would resolve to the new passwordless row. Residual, not a
change.

**Finding 4 is the behaviour that was chosen.** The button starts hidden and a slow or failed provider lookup
leaves it hidden. The round confirms it fails closed and never draws a button that cannot work. The
no-JavaScript case is not a regression: the Google button is also a click handler.

**Two categories returned nothing, stated because a silent absence is not the same as a check.** The
`?error=` handling cannot put attacker-chosen text on screen — only mapped keys render. Widening the
onboarding page's read with `image: true` does not alter the six-field policy. The no-email refusal does not
loop against middleware.

**After the fixes:** suite **74 → 106 assertions, 0 failed**. Controls **8 → 12, all 12 caught by their exact
prediction**. Two existing predictions were recomputed against the larger suite before running — NC-3 from 2
to 3 and NC-4 from 3 to 7 — because `linkedInAction` composes the rules those controls break, so undoing one
now reaches further. Recomputed in advance, not after a disagreement.

### Round 2 — this phase's own test script

Completed in **11m 3s**. Eight findings, three of them High, **all eight acted on**. The round was asked to
hunt assertions that pass while measuring nothing, and it found the two worst kinds: one whose wait made
absence unprovable, and one whose failure path reported success.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | High | Group B could probe group A's server: `stop()` gave up quietly if the port stayed busy, and `startApp()` never checked the child was alive | **Fixed** |
| 2 | High | B5 could pass because the page had not finished loading, not because the button was absent | **Fixed** |
| 3 | High | A failed restore of the borrowed demo account printed a warning and exited 0 | **Fixed** |
| 4 | Medium | Six calls still aborted the run instead of counting a failure | **Fixed** |
| 5 | Medium | C29-C33 claimed to match the live discovery document; they compare two constants | **Reworded** |
| 6 | Medium | F-25, F-27 and F-28 were claimed more strongly than covered | **Reworded** |
| 7 | Low | Stand-in credential mode weakened two assertions without saying so | **Reworded** |
| 8 | Low | Group order was load-bearing and unstated | **Fixed** |

**Finding 2 is the one worth reading twice.** B5 concluded the button was absent after waiting four times as
long as it had taken to appear — in the *other* server configuration. That reasoning looks careful and is not
sound: a slower or failed provider request on the blank-configuration page produces exactly the "no button"
the feature is supposed to produce. The wait is now on the cause: the listener is attached before navigating,
the run waits for that page's own `/api/auth/providers` response, asserts the reply does not name LinkedIn
(**B4b**, new), and only then looks for the button. Absence now means the page asked, was told no, and drew
nothing.

**Finding 3 was the most damaging and the least visible.** The borrowed account is `stephcurry@test.com`, one
of the three printed on the login screen. A restore that failed left it blanked — a broken demonstration —
while the suite reported success. Restore failure now counts a failure and prints the values needed to put the
row back by hand.

**Finding 1's first fix was wrong, and the controls would have caught it.** The first attempt added a startup
precondition comparing the provider list against the configuration the group asked for. That check cannot
distinguish "a stale server is answering" from "the code registers the provider when it should not" — and the
second is exactly what control NC-2 breaks on purpose, so the precondition would have aborted that control's
run with no counted failures, scoring a real defect as a harness problem. It was removed before the controls
ran. Contamination is closed instead by two checks that cannot be confused with app behaviour: the child
exiting before it answers, and `stop()` refusing to return while the port still answers.

**Findings 5, 6 and 7 changed no behaviour and matter most for what may be claimed later.** C29-C33 are now
labelled as pinned values verified once by hand on 2026-08-04, not as live checks — with the reason they are
kept stated, which is that C31 is what went red when a control reverted the member-details address to the
retired one. The header now names, individually, the four things no assertion here measures: that the callback
refuses a no-email arrival, refuses an unverified join, writes nothing on a refusing path, or creates and joins
rows and attaches session fields. **No assertion in the file executes `apps/attendee/lib/auth.ts`.** The C and
D groups are rule-level surrogates and now say so.

**Two categories came back clean, and both were checked rather than assumed.** C34-C46 do exercise distinct
branches and can go red. The direct database writes are not hidden by caching, because `/onboarding` is
`force-dynamic` and the page is loaded directly — the real database risk was restoration durability, which is
finding 3.

**After the fixes:** suite **106 → 113 assertions, 0 failed**. Controls **12 of 12 caught by their exact
prediction**; NC-2's prediction was recomputed from 3 to 4 in advance, because the new B4b assertion reddens
under it too.

**Residual, recorded rather than fixed:** a crash between the blanking write and the restore block still
leaves the borrowed row blanked. Removing that entirely means borrowing a throwaway account rather than a demo
one, which needs a password hash the script does not currently create.

### Round 3 — the negative controls and the documents

Completed in **3m 32s**. **The controls came back clean. The documents did not.** Five findings, all five about
claiming verification that had not happened — the same species as the defect recorded in the handoff's § 8, and
the reason this round exists.

**Part A — the controls, clean.** All twelve substitutions were judged faithful to the behaviour they name, and
**all twelve predicted counts were derived independently and matched the file**, including the three that were
recomputed as the suite grew (NC-2 to 4, NC-3 to 3, NC-4 to 7). No vacuous pass was found in the five gates: a
crashed baseline or a crashed broken-run reports 999 and cannot score as a catch, a non-zero baseline fails,
the restore runs before the next baseline, and the trap restores on exit.

**Part C and D — the documents, five findings, all fixed.**

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | High | Two plan criteria claimed row counting and reading the row back. Neither happens — nothing automated executes the callback | Each criterion now marked **[machine]**, **[machine: surrogate]** or **[human]**, with the struck-through original wording kept |
| 2 | High | `docs/smoketests/phase-12-linkedin-sign-in.md` was cited as landed evidence in four places and **did not exist** | Written |
| 3 | High | § Implementation Decisions omitted the two decisions the review itself produced, F-27 and F-28 | Three bullets added, including one stating what is machine-asserted and what is not |
| 4 | Medium | F-25's "Landed in" omitted the file holding the sentence a person actually reads | Corrected, and what is and is not asserted stated beside it |
| 5 | Medium | The plan said "every acceptance criterion below is exercised", which contradicted its own later split | Corrected; credentials existing removes the approval wait, not the password problem |

**Finding 2 is the one that matters most, and it is the handoff's § 8 defect in miniature.** Four files cited a
smoketest document as the place the human evidence lived. The document did not exist. Anyone reading those
citations would have concluded the human step was recorded somewhere when nothing recorded it.

**Part B — what no control reddens**, derived by the round and now recorded in the smoketest document rather
than left implicit: the authorization, token and signing-key addresses; the scope string; `checks: ['state']`;
the absence of PKCE; `client_secret_post`; every write the callback performs; `recordLogin` on a LinkedIn path;
attaching the role and company link to the session; the onboarding page's widened read. The callback ones are
the material absences and they are exactly what the human step covers.

**Part D — the round's verdict on the whole phase, accepted rather than argued with.** "A reader trusting the
current plan and requirements document would be misled about no-row and no-mutation verification and the real
LinkedIn callback." Five behaviours were named as unproven by automation. All five are now marked as such in
the plan and listed individually as human steps 3a to 3d in the smoketest document, which records their status
as **NOT YET RUN**.

**Residual raised and not fixed:** `restore_all()` in the controls script does not verify file content after
copying, so a partial restore is caught only by the next control's baseline.

---

## Cycle closed at the cap

Three rounds, the cap, one cycle. **20 findings: 12 fixed, 8 recorded as residuals or accepted behaviour.**
Round 1 found two security defects in the product, round 2 found three ways the suite could report success
without measuring, round 3 found five documents claiming verification that had not happened.

**Suite 74 → 106 → 113 assertions, 0 failed. Controls 8 → 12, twelve of twelve caught by their exact
prediction. Two predictions were wrong and both are kept as written** — the issuer control, whose wrongness
found F-26, and the first version of NC-2, whose wrongness showed that B4 guards a property no single
substitution can redden.

---

## What the human smoke test found that the review could not

Steps 3a to 3d were run on 2026-08-04, after the cycle closed. **All four pass, and running them found a defect
that had survived every round.**

**F-29 — LinkedIn sends the verification claim as the string `"true"`, not the boolean its documentation
specifies.** The strict check read a real verification as none, and the F-27 binding rule then refused every
returning delegate: one sign-in created the account, and no later sign-in could reach it. Measured by printing
the claim's type and value from the callback.

**Why no round could have caught it.** All three checked the code against LinkedIn's documented shape. None
checked it against what LinkedIn puts on the wire, and none could — no automated assertion in this phase
completes a real sign-in, because that needs a password typed into LinkedIn. **A negative control made it
worse:** NC-10 asserted that accepting any truthy value was a defect, and it passed, so the wrong behaviour was
held in place by evidence.

**The fix is neither the strict check nor the loose one.** Accepting any truthy value would read LinkedIn saying
*not verified* as verified, because the string `"false"` is truthy — the exact path F-27 closes. The check is
shape-aware: the boolean `true`, or a string reading `true` after trimming and lowercasing, and nothing else.

**What the four human steps established that nothing automated did:** the callback's create path, the delegate
role being assigned, LinkedIn's name and photo being written, `recordLogin` firing, the join path leaving a
person's own edits alone, and **F-28 holding against a real refused sign-in** — name still empty, login count
unchanged, no row created.

**One step's design was wrong and that is recorded too.** 3d first used the exhibitor-representative role,
assuming this app refuses it. `APP_ALLOWED_ROLES.attendee` admits every role that exists, so no refusal was
possible. **The role-refusal branch is unreachable with any current role** — defence in depth that becomes live
only when a role is added. The step was rerun with a role outside the admitted set.

**One case could not be produced and is not claimed:** an arrival with no email address. LinkedIn sent one every
time.

---

## Final state

**Suite 74 → 106 → 113 → 120 assertions, 0 failed. Controls 8 → 12, twelve of twelve caught by their exact
prediction. 21 findings across three review rounds and the human smoke test: 14 fixed, 7 recorded as residuals
or accepted behaviour.**

**Four predictions were wrong and all four are kept as written.** Two were wrong about a mechanism — the issuer
control, which found F-26, and NC-2's first version, which showed B4 needs a compound break. Two were arithmetic
about which assertions a control reaches — NC-3 and NC-10 after F-29 grew the suite. Each is recorded beside its
control with what it showed.

**The single most useful thing in this phase was one person pressing a button.** It found what three review
rounds, twelve negative controls and 113 assertions did not, because all of those read the same wrong
documentation.
