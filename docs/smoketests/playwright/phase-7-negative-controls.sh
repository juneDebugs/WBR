#!/usr/bin/env bash
#
# Phase 7 — negative controls.
#
# Breaks one shipped behaviour at a time and proves
# phase-7-no-company-explanation.mjs goes red for it. Without this, a green run
# of that suite is only evidence that it ran.
#
# WHY THIS PHASE NEEDS CONTROLS MORE THAN MOST. Earlier phases proved their suite
# could fail by setting the change aside with `git stash push -- <pathspec>` and
# re-running against the pre-change source. Phase 7 changes no application code —
# it verifies behaviour Phases 5 and 6 already shipped — so a stash has nothing
# to remove. These controls take that job instead.
#
# ── THE FIVE GATES ──────────────────────────────────────────────────────────
#
# Every control must clear all five before it counts as caught. Each one exists
# because Phase 6.5's own control driver produced a confident result that meant
# nothing, four separate times, and was rewritten four times to close them:
#
#   1. IT MUST APPLY.        The edit must actually change the file. A control
#                            whose pattern silently misses reports the unbroken
#                            code as caught.
#   2. THE BUILD MUST PASS.  A build failure is not evidence. Phase 6.5's control
#                            6 contained `$)`, Perl expanded it as one of its own
#                            variables, the app failed to build, and the driver
#                            read that as a catch. Every edit here is made by
#                            node with an exact string replace, so no shell or
#                            Perl metacharacter is ever interpreted.
#   3. THE APP MUST ANSWER.  Phase 6.5's first driver reported six catches
#                            against an app that was never running: its readiness
#                            wait was sixty curl calls with no delay, exhausted in
#                            a fraction of a second. This waits with
#                            --retry-delay --retry-connrefused and then asserts a
#                            real 200 before running anything.
#   4. IT MUST BE CAUGHT.    The suite must exit non-zero.
#   5. BY THE PREDICTED      Not just non-zero. Phase 6.5's round 3 found its
#      AMOUNT.               driver printed a predicted count and never compared
#                            it, so in expect-red mode ANY non-zero exit counted.
#                            Here a mismatch fails the driver and says so.
#
# A sixth, learned the same cycle: each control is measured against ITS OWN
# build. Control 3 of Phase 6.5 was measured against control 2's broken tree.
# This driver restores and rebuilds between every control, without exception.
#
# Prerequisites: same as the suite. The sponsor app is rebuilt and restarted by
# this script, so do not start it yourself first — but DO make sure port 3003 is
# otherwise free.
#
# Usage:  bash docs/smoketests/playwright/phase-7-negative-controls.sh
# Exits 0 only if every control applied, built, was caught, and was caught by the
# predicted amount — and the restored tree is green again at the end.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

SUITE="docs/smoketests/playwright/phase-7-no-company-explanation.mjs"
GATE="apps/sponsor/lib/onboarding-gate.ts"
GUARD="apps/sponsor/lib/require-complete-profile.ts"
PAGE="apps/sponsor/app/(authenticated)/onboarding/page.tsx"
LOG="$(mktemp -d)/sponsor.log"

export WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true

pass_count=0
fail_count=0

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
good() { printf '  \033[32m✓\033[0m %s\n' "$*"; pass_count=$((pass_count + 1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$*"; fail_count=$((fail_count + 1)); }

# ── gate 1: the edit must actually change the file ──────────────────────────
#
# node with an exact string replace, never sed or perl. The replacement text is
# passed as an argument rather than interpolated into a program, so a `$)` or a
# `&` in it is data and cannot become syntax. It exits 1 if the search text is
# absent or already replaced, which is what makes "it applied" checkable rather
# than assumed.
apply_edit() {
  node -e '
    const fs = require("fs");
    const [file, from, to] = process.argv.slice(1);
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes(from)) {
      console.error("CONTROL DID NOT APPLY: search text not found in " + file);
      console.error("  looked for: " + from);
      process.exit(1);
    }
    fs.writeFileSync(file, src.replace(from, to));
  ' "$1" "$2" "$3"
}

#
# RESTORE IS CHECKED AND FATAL. Adversarial review round 1 found this silent:
# the old version threw the checkout's own errors away and no caller looked at
# the result, and because this script does not use `set -e`, a restore that
# failed before a control, on an early return, or at the final cleanup would
# have been ignored. Two consequences it could have had, both bad: one control's
# broken code stacking on top of the next, and the run ending with
# onboarding-gate.ts or require-complete-profile.ts still modified in somebody's
# working tree.
#
# Now it checks the checkout AND confirms with `git diff --quiet` that the files
# really are back, because a checkout can report success and still leave a file
# differing if something else rewrote it in between.
restore_tree() {
  if ! git checkout -- "$GATE" "$GUARD" "$PAGE"; then
    printf '  \033[31m✗ FATAL\033[0m git checkout could not restore the source files.\n'
    return 1
  fi
  if ! git diff --quiet -- "$GATE" "$GUARD" "$PAGE"; then
    printf '  \033[31m✗ FATAL\033[0m source files still differ after restore:\n'
    git diff --stat -- "$GATE" "$GUARD" "$PAGE" | sed 's/^/      /'
    return 1
  fi
  return 0
}

# Every restore point uses this. A failed restore stops the run rather than
# letting the next control inherit broken code.
restore_or_die() {
  if ! restore_tree; then
    printf '\n\033[31mStopping: the tree could not be restored, so nothing after this point would mean anything.\033[0m\n'
    printf 'Restore by hand with:\n  git checkout -- "%s" "%s" "%s"\n' "$GATE" "$GUARD" "$PAGE"
    exit 1
  fi
}

# ── gates 2 and 3: build, restart, and confirm the app is answering ─────────
rebuild_and_start() {
  lsof -ti:3003 2>/dev/null | xargs kill -9 2>/dev/null
  if ! pnpm --filter sponsor build > "$LOG.build" 2>&1; then
    return 1                                   # gate 2 — build failed
  fi
  ( cd apps/sponsor && PORT=3003 pnpm start > "$LOG" 2>&1 & )
  # A DELAY BETWEEN ATTEMPTS IS THE WHOLE POINT. A bare curl loop finishes
  # instantly and proves nothing.
  curl -s -o /dev/null --retry 40 --retry-delay 1 --retry-connrefused \
       http://localhost:3003/login 2>/dev/null
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3003/login 2>/dev/null)"
  [ "$code" = "200" ]                          # gate 3 — it really is answering
}

#
# Run the suite and report THREE numbers: exit code, failed, skipped.
#
# Adversarial review round 1 found the old version read only the failed count
# and threw the exit status away. Two ways that misleads, both real:
#
#   - The suite exits non-zero for a SKIP as well as a failure. A control could
#     therefore have been recorded as caught by a run whose assertions were
#     skipped rather than failed.
#   - The restored-tree check treated "0 failed" as green, which a run that
#     skipped half its assertions also reports.
#
# A skip is not a pass and it is not a catch. Everything downstream now demands
# skipped == 0 as well.
run_suite() {
  local out code failed skipped
  out="$(node "$SUITE" 2>&1)"; code=$?
  echo "$out" > "$LOG.suite"
  failed="$(echo "$out"  | sed -n 's/^Phase 7: [0-9]* passed, \([0-9]*\) failed.*/\1/p' | tail -1)"
  skipped="$(echo "$out" | sed -n 's/^Phase 7: [0-9]* passed, [0-9]* failed, \([0-9]*\) skipped.*/\1/p' | tail -1)"
  echo "${code} ${failed:-NONE} ${skipped:-NONE}"
}

# ── one control, all five gates ─────────────────────────────────────────────
#
# A control may carry a SECOND edit (args 7 and 8). Control 6 needs it: the
# explanation names the organizer twice, and a control that removes one mention
# is not a control on "does this screen name the organizer at all". Both edits
# must apply, or gate 1 fails — a half-applied control tests nothing and must
# never be reported as a catch.
control() {
  local name="$1" file="$2" from="$3" to="$4" predicted="$5" why="$6"
  local from2="${7:-}" to2="${8:-}"

  say "CONTROL: $name"
  printf '  breaks: %s\n  predicts: %s failed assertion(s) — %s\n' "$file" "$predicted" "$why"

  restore_or_die
  if ! apply_edit "$file" "$from" "$to"; then
    bad "$name — gate 1: the edit did not apply, so nothing was tested"
    restore_or_die
    return
  fi
  if [ -n "$from2" ]; then
    if ! apply_edit "$file" "$from2" "$to2"; then
      bad "$name — gate 1: the SECOND edit did not apply; a half-applied control tests nothing"
      restore_or_die
      return
    fi
  fi
  good "$name — gate 1: the edit applied"

  if ! rebuild_and_start; then
    bad "$name — gate 2/3: the build failed or the app never answered (a build failure is NOT evidence)"
    tail -20 "$LOG.build" 2>/dev/null | sed 's/^/      /'
    restore_or_die
    return
  fi
  good "$name — gates 2 and 3: it built and the app is answering"

  read -r code actual skipped <<< "$(run_suite)"

  if [ "$actual" = "NONE" ]; then
    bad "$name — the suite printed no summary line, so it did not finish. Nothing is established."
    tail -15 "$LOG.suite" | sed 's/^/      /'
    restore_or_die
    return
  fi

  # A SKIP IS NOT A CATCH. The suite exits non-zero for a skip as well as a
  # failure, so without this a control could be recorded as caught by a run
  # whose assertions never executed.
  if [ "$skipped" != "0" ]; then
    bad "$name — $skipped assertion(s) were SKIPPED. A skip is not a catch; set the environment properly and re-run."
    grep 'SKIP' "$LOG.suite" | head -10 | sed 's/^/      /'
    restore_or_die
    return
  fi

  if [ "$code" -eq 0 ] || [ "$actual" -eq 0 ]; then
    bad "$name — gate 4: NOT CAUGHT. The suite stayed green against deliberately broken code (exit $code, $actual failed)."
    restore_or_die
    return
  fi
  good "$name — gate 4: caught ($actual failed, exit $code)"

  if [ "$actual" -ne "$predicted" ]; then
    bad "$name — gate 5: caught by the WRONG amount. Predicted $predicted, got $actual. Either the prediction misreads the code or something else is broken; investigate before trusting this control."
    grep '✗' "$LOG.suite" | head -25 | sed 's/^/      /'
    restore_or_die
    return
  fi
  good "$name — gate 5: caught by exactly the predicted amount ($actual)"

  restore_or_die
}

# ── the controls ────────────────────────────────────────────────────────────

say "Phase 7 negative controls — proving $SUITE can fail"
echo "  Each control is measured against its own build. The tree is restored and"
echo "  rebuilt between every one, so no control inherits another's broken code."

control \
  "1. The screen gate stops redirecting an unlinked representative" \
  "$GATE" \
  "if (!account.sponsor) redirect('/onboarding')" \
  "if (false && !account.sponsor) redirect('/onboarding')" \
  4 \
  "Step 1 loses both redirect assertions; Step 5 loses the post-detach redirect and its location. Step 5's post-detach REFUSAL assertion still passes, because this control breaks the screen gate and not the request guard"

control \
  "2. The request guard stops refusing an unlinked representative" \
  "$GUARD" \
  "if (!account.sponsor) return { refused: refusal() }" \
  "if (false && !account.sponsor) return { refused: refusal() }" \
  20 \
  "all nineteen refusal assertions, plus Step 5's post-detach refusal check; the nineteen controls are unaffected"

control \
  "3. The role exemption stops releasing a staff account" \
  "$GUARD" \
  "if (isWbrStaff(account.role)) {" \
  "if (false && isWbrStaff(account.role)) {" \
  1 \
  "Step 4 loses the assertion that the guarded addresses do not refuse a staff account"

#
# CONTROLS 4 AND 6 EXIST AS A PAIR, and the pair is the point.
#
# The first version of this driver had only control 4, and it was NOT CAUGHT —
# the suite stayed green against an explanation that no longer told anyone what
# to do. The cause was a weak assertion, not a weak control: Step 1 searched the
# whole document for the word "organizer", and the panel names the organizer
# twice, so removing the instruction left the other mention to satisfy it.
#
# Both were fixed. Step 1 now scopes to the panel and asserts the instruction
# separately from the noun, and the controls now break each half on its own:
# control 4 removes only the instruction, control 6 removes both mentions. If
# either assertion is ever weakened back to a document-wide word search, one of
# these two goes green and says so.
control \
  "4. The explanation still names the organizer but stops telling anyone to contact them" \
  "$PAGE" \
  "Contact the WBR event organizer and ask them to attach your account to your company." \
  "Somebody will sort this out at some point." \
  1 \
  "Step 1 loses AC-1 part 2 only; part 1 must still pass, because the first paragraph still names the organizer"

control \
  "5. The explanation screen stops rendering for an unlinked representative" \
  "$PAGE" \
  "if (!account.sponsor) {" \
  "if (false && !account.sponsor) {" \
  7 \
  "Step 1 loses the render, the panel marker, the panel lookup, both AC-1 parts, AND both absence checks — the last two only since round 1's fix stopped them passing on an empty page"

control \
  "6. The explanation stops naming the organizer at all" \
  "$PAGE" \
  "Contact the WBR event organizer and ask them to attach your account to your company." \
  "Somebody will sort this out at some point." \
  2 \
  "Step 1 loses both AC-1 parts, because neither mention survives" \
  "to be linked by the event organizer." \
  "to be linked by somebody else."

# ── the tree must be green again afterwards ─────────────────────────────────
say "RESTORED TREE — the suite must be green again, or the controls left damage"
restore_or_die
good "the tree restored cleanly (git diff is empty for all three files)"
if ! rebuild_and_start; then
  bad "the restored tree did not build or the app did not answer"
else
  # GREEN MEANS ALL THREE NUMBERS, not just the failure count. A run that
  # skipped its assertions also reports "0 failed", and round 1 found the old
  # version accepting exactly that.
  read -r fcode ffailed fskipped <<< "$(run_suite)"
  if [ "$ffailed" = "NONE" ]; then
    bad "restored tree: the suite printed no summary line, so it did not finish"
    tail -15 "$LOG.suite" | sed 's/^/      /'
  elif [ "$fcode" -eq 0 ] && [ "$ffailed" -eq 0 ] && [ "$fskipped" -eq 0 ]; then
    good "restored tree is green (exit 0, 0 failed, 0 skipped)"
  else
    bad "restored tree is NOT clean — exit $fcode, $ffailed failed, $fskipped skipped. The controls left damage behind, or the environment is wrong."
    grep -E '✗|SKIP' "$LOG.suite" | head -20 | sed 's/^/      /'
  fi
fi

say "──────────────────────────────────────────────────────────────────────"
printf 'Controls: %s checks passed, %s failed\n' "$pass_count" "$fail_count"
if [ "$fail_count" -gt 0 ]; then
  echo "A failed gate means the corresponding evidence is NOT established."
  exit 1
fi
echo "Every control applied, built, was caught, and was caught by the predicted amount."
exit 0
