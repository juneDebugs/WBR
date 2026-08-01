# Codex adversarial review — Phase 13, sponsor portal carried issues

**Date:** 2026-07-31. **Rounds:** 3 of 3, the full cap, per `CONTRACT.md`. **Target:** working-tree diff.

Driven as:

```sh
node ~/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs \
  adversarial-review --background --scope working-tree "<focus>"
```

**`--scope working-tree`, not `--scope branch --base main`.** Phase 13 is deliberately uncommitted until the end of the review cycle, so a branch-scoped difference against `main` would have been empty and every round would have reviewed nothing.

**Nine findings across three rounds. Eight acted on. One confirmed by measurement and deliberately not fixed, with the reasoning recorded.** Every finding was reproduced or measured before anything was changed.

**The third round earned the cap on its own, exactly as it did in Phase 6.** It caught that the fixes from rounds 1 and 2 had silently broken three of the five negative controls, so the "5 of 5 caught" table already written into the smoketest document was describing a run that no longer corresponded to the code. Had the cycle stopped at two rounds, this phase would have shipped with an evidence record that was not evidence.

Assertion count went **27 → 31**, and the negative controls went **5 → 7**.

---

## Round 1 — the erase path, the attach handler, the role change, and the suite's claims

Verdict: **needs-attention**, no-ship. Four findings, all four confirmed, all four fixed.

### 1.1 [high] "Sign-out erase only covers the NavBar button path" — **CONFIRMED, FIXED**

The erase ran inside the Sign out handler and nowhere else, so a session that ended any other way — expiry, an invalidated session, a deleted cookie, any sign-out path added later — left the whole stored copy of the company's data in the browser. That is the same at-rest exposure the phase claims to close, just outside the one path Phase 6 happened to measure.

**Decision: erase on the sign-in screen as well.** Every one of those routes arrives there, so one addition covers all of them and does not depend on anyone remembering to wire up a new path. It is safe to run unconditionally: reaching that screen means there is no usable session, because the middleware sends a signed-in visitor to the dashboard, with the single exception of the `?session=invalid` marker — which is precisely the case that should clear.

**Not done, and recorded as a residual:** telling other open tabs to erase. That needs a broadcast channel and the exposure it closes is narrower.

### 1.2 [high] "Created colleagues can be minted into the caller's old company from a stale token" — **CONFIRMED BY REPRODUCTION, FIXED**

Reproduced end to end before any code changed:

```
1. a representative signs in while attached to company A   → token names A
2. the database moves them to company B
3. they create a colleague
   → 201, and the new account is role=SPONSOR, sponsorId=A
4. that colleague signs in to the sponsor portal, as company A
```

**This phase is what made it dangerous.** Before the role change the same stale write produced an `ATTENDEE` the portal refused, so the write was inert. Afterwards it mints a working account, with the buyer directory, at a company the caller has left.

**Decision: the four teammate addresses resolve the company from the database**, through a new `apps/sponsor/lib/caller-company.ts`. Nominally the plan's Phase 14 territory, pulled forward on this project's own precedent, applied twice already: Phase 5 fixed the profile-save address because Phase 5 was what turned a stale company link into a trap, and Phase 6 changed a cache header both planning documents had put out of scope because Phase 6 was what turned it into a way past a refusal. **A phase does not get to ship a change that makes an existing defect dangerous and then point at a later phase.**

**Scope held deliberately narrow.** Four addresses, not nineteen. Phase 14 still owns the rest, and the helper's own comment says so.

### 1.3 [high] "Attach refusal is check-then-write" — **CONFIRMED BY MEASUREMENT, FIXED**

The first version read the target, decided, then wrote, so two companies could both read an unattached person before either wrote.

**Measured before changing anything, and the measurement mattered.** A single attempt did *not* reproduce it — the two requests serialised and the second was correctly refused. Stopping there would have recorded "mechanism real, consequence did not reproduce", which is what happened to two of Phase 6's findings. Running it repeatedly with warm sessions instead produced **both requests accepted in 15 of 15 attempts.** Not a rare race at all; the single attempt had simply included sign-in latency.

**Decision: one conditional write.** `updateMany` with the condition in the `where` clause, so the database decides, and a follow-up read only to tell a missing account (`404`) from one that belongs to somebody else (`409`). The detach path got the same treatment for the same reason.

> The lesson is the measurement method, not the fix. One attempt at a race is not a measurement.

### 1.4 [medium] "The suite can exit green with AC-8 unmeasured" — **CONFIRMED, FIXED**

The suite reported a skip when the meetings portal was not listening, and then exited 0 because nothing had failed. The smoketest document said that portal was not optional for a full run. **The document and the executable check disagreed, and people act on the check.**

**Decision: a skip fails the run**, unless `PHASE13_ALLOW_PARTIAL=1` is set, which prints loudly that the run is not evidence for the phase.

---

## Round 2 — the round 1 fixes, the sign-in erase, cross-app effects, documents against code

Verdict: **needs-attention**, no-ship. Three findings: one fixed, one measured and deliberately not fixed, one document correction.

### 2.1 [high] "Login cache erase is fire-and-forget, so an immediate sign-in can restore stale data" — **CONFIRMED as a mechanism, FIXED**

The effect started the erase and did not block, so a fast sign-in could reach the dashboard before the delete finished. The portal's provider restores the stored copy when it mounts and accepts one up to thirty minutes old, so the previous company's data could be pulled back into memory by the very sign-in that was supposed to have replaced it.

**Not reproduced as a timing race, and that is stated rather than glossed.** Forcing a sub-millisecond ordering in a real browser reliably was not attempted. The fix was applied anyway because it costs one `await`, the failure is silent, and the mechanism is not in doubt — the erase genuinely is not sequenced before the navigation.

**Decision: `handleSubmit` awaits the erase before navigating.** Round 3 then found this fix incomplete; see 3.2.

### 2.2 [medium] "Meetings sponsor browse hides all SPONSOR users as demo accounts" — **CONFIRMED BY MEASUREMENT, DELIBERATELY NOT FIXED**

`apps/meetings/components/BrowseView.tsx` and `SponsorCard.tsx` both filter attached people with `u.role !== 'SPONSOR'`, commented "show real attendees/speakers only, not demo accounts". That premise was already untrue for the seven seeded exhibitor representatives.

**Measured on the local copy:** of 52 people attached to a company, **45 are shown as bookable representatives and 7 are hidden**, and **all 20 companies have at least one visible representative**. A colleague created through the portal used to be a delegate and appeared in that list; now they hold the exhibitor-representative role and do not.

**Decision: not changed here, and recorded for the project owner.** Correcting the filter would newly expose seven seeded exhibitor representatives on a demonstration surface in a different app, eleven days before the demonstration, and deciding who should be bookable is a product question rather than a completeness or authorization one. This is a real consequence of the role decision, and it belongs next to that decision rather than inside a filter nobody asked to change.

### 2.3 [low] "The smoketest residual describes pre-round-1 behaviour" — **CONFIRMED, FIXED**

The residual still said every handler read the company from the session token, including the attach handler — which had stopped being true one round earlier. An acceptance document describing the old risk boundary would misdirect Phase 14. Rewritten to say exactly which four addresses are database-backed now and which are not.

---

## Round 3 — what rounds 1 and 2 introduced

Verdict: **needs-attention**, no-ship. Two findings, both fixed. **This round justified the three-round cap by itself.**

### 3.1 [high] "Negative controls 2 to 4 no longer mutate the current code, and the driver does not fail on that" — **CONFIRMED, FIXED**

Controls 2, 3 and 4 targeted code shapes that rounds 1 and 2 had replaced: `target.sponsorId !== user.sponsorId` and `sponsorId: user.sponsorId` no longer existed. The substitutions silently stopped matching. The driver printed a warning, continued, and exited 0.

**So the "5 of 5 caught" table already written into the smoketest document was describing a run against code that no longer existed.** The controls are the only thing standing between a green suite and a green suite that proves nothing, and they had quietly stopped working — during the very rounds meant to be auditing them.

**Decision, in three parts.**

- **Controls 2, 3 and 4 rewritten against the current code.** Control 2 now removes the `OR` clause from the conditional write, which breaks the Phase 6 defect and the round-1 race at once.
- **Two controls added** for the behaviours rounds 1 and 2 introduced, which had none: control 6 reverts colleague creation to the session token, control 7 removes the sign-in page's erase. Five controls became seven.
- **The driver now fails.** A substitution that does not apply is fatal, a control that runs and leaves the suite green is fatal, and a non-zero exit says the totals must not be quoted. The document's numbers may only be copied from a run of that script that exited 0.

> Every negative control is written against a snapshot of the code, and every later fix can invalidate one without saying so. A control driver that cannot fail is the same trap as a suite that cannot fail, one level up.

### 3.2 [medium] "Login can still navigate before the erase promise exists" — **CONFIRMED, FIXED**

Round 2's fix had the effect start the erase and store the promise in a ref, and the submit handler await that ref. A submit arriving before passive effects flush awaits `null`, which resolves immediately and navigates with the erase never started.

**Round 3 caught round 2's fix, exactly as round 3 caught round 1's fix in Phase 6.** Awaiting a variable that might not be set yet is not sequencing.

**Decision: one lazy initialiser used by both callers.** `ensureErased()` starts the erase if it has not started and returns the promise either way; the effect and the submit handler both call it.

---

## Found while re-running the repaired controls, not by any round

**Control 1 stopped being a control the moment round 1's fix landed, and only running it revealed that.**

Control 1 removed the Sign out button's erase and predicted one failure. On the first run of the repaired driver it was **NOT CAUGHT** — the suite stayed completely green. The cause is round 1's own fix: pressing Sign out navigates to the sign-in page, and that page now erases too. So AC-1 passes whether or not the button does anything, and a control that removes one of two overlapping mechanisms demonstrates nothing.

**Decision: change the control, not the code.** Control 1 now removes **both** erases and predicts two failures, which is the honest control for "this phase erases the data at all". Control 7 continues to remove only the sign-in page's erase, isolating the paths the button cannot cover.

**The button's erase is kept, and the reason is stated rather than asserted.** It does something the sign-in page cannot: it empties the in-memory cache *before* navigating. Without that, the throttled writer can persist what is still in memory after the sign-in page has already deleted the stored copy. No assertion in this suite covers that ordering, and the control file says so at the point where a reader would otherwise assume it did.

> This is the same failure as 3.1 one level down. A control is written against a snapshot of the behaviour, and a later fix can make it vacuous without making it fail. The only way to find out is to run it and read the number, rather than trusting that a control which used to work still does.

---

## What the rounds did not find, worth recording

- No round questioned the decision that an existing person keeps their role when attached. Two rounds saw the code and its stated reasoning; round 2 examined the cross-app consequences of the *other* branch and found 2.2.
- No round found a problem with the enumeration of what the phase does not fix. The residual list grew rather than shrank.
- Rounds 1 and 2 both accepted the guarded-address behaviour Phase 6 established, which this phase does not change.
