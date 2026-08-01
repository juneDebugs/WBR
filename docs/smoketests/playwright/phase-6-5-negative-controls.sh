#!/bin/bash
# NEGATIVE CONTROLS for Phase 6.5 — proving the suite can go red.
#
# A suite that cannot fail is not evidence. This repository has produced fully
# green runs over broken behaviour four times: Phase 1 passed 33 of 33 while a
# blocked delegate could still post in a chat room; Phase 5 passed 68 of 68 while
# the sponsor checklist could not be submitted in a browser at all; Phase 6's
# first attempt at one step reported three failures against a feature that
# worked; and Phase 13 printed a "5 of 5 caught" control table describing code
# that no longer existed.
#
# Each control breaks ONE fix, rebuilds, runs the suite, records whether it was
# caught, then restores. A control that leaves the suite green is a hole in the
# suite, not a success.
#
# ---------------------------------------------------------------------------
# THIS FILE FAILS LOUDLY, and that property is inherited deliberately.
#
# Phase 13's driver was written against code that its own review rounds then
# changed. Three substitutions silently stopped matching; the driver warned,
# carried on, and exited 0, so a reviewer could read "all controls caught" from a
# run in which three of them never touched the code. Round 3 caught it.
#
# Two consequences, kept here unchanged:
#   1. A substitution that does not apply is FATAL. So is a control that runs and
#      leaves the suite green. This script exits non-zero and says which.
#   2. The numbers in docs/smoketests/phase-6-5-sponsor-remaining-defects.md may
#      only be copied from a run of THIS file that exited 0.
# ---------------------------------------------------------------------------
#
# A WHOLE-TREE CONTROL WAS ALSO RUN, and is recorded in the smoketest document
# rather than here because it is not repeatable from a script: every Phase 6.5
# change was set aside with `git stash`, the apps were rebuilt, and the suite
# reported 22 passed / 27 failed. That is the broadest possible control — it
# shows the suite failing on the code as it stood before the phase. The controls
# below are narrower and answer a different question: is each fix INDEPENDENTLY
# covered, or is one assertion carrying several of them?
#
# Prerequisites: the sponsor app must be buildable, and the admin app must be
# running on port 3000 for control 6. Every run rebuilds and restarts the
# sponsor app itself.
#
# Usage:
#   docs/smoketests/playwright/phase-6-5-negative-controls.sh
set -u
cd "$(git rev-parse --show-toplevel)"

GUARD='apps/sponsor/lib/require-complete-profile.ts'
SUBID='apps/sponsor/app/api/submissions/[id]/submissions/[subId]/route.ts'
FORM='apps/sponsor/app/api/submissions/[id]/route.ts'
PICKER='apps/sponsor/lib/addable-teammate.ts'
WEBMW='apps/web/middleware.ts'
SUITE='docs/smoketests/playwright/phase-6-5-sponsor-remaining-defects.mjs'
OUT=/tmp/nc65
mkdir -p $OUT

export WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true
FAILURES=0

cp "$GUARD"  "$OUT/guard.orig"
cp "$SUBID"  "$OUT/subid.orig"
cp "$FORM"   "$OUT/form.orig"
cp "$PICKER" "$OUT/picker.orig"
cp "$WEBMW"  "$OUT/webmw.orig"

restore_all() {
  cp "$OUT/guard.orig"  "$GUARD"
  cp "$OUT/subid.orig"  "$SUBID"
  cp "$OUT/form.orig"   "$FORM"
  cp "$OUT/picker.orig" "$PICKER"
  cp "$OUT/webmw.orig"  "$WEBMW"
}
trap restore_all EXIT

# Assert the control actually changed the file. A control that does not apply
# tests nothing, and silently testing nothing is what this gate exists to stop.
applied() {
  local file="$1" marker="$2"
  if grep -q "$marker" "$file"; then
    echo "  control applied"
  else
    echo "  *** CONTROL DID NOT APPLY — the pattern no longer matches $file ***"
    echo "  *** The code has moved since this control was written. Fix the control. ***"
    FAILURES=$((FAILURES + 1))
    return 1
  fi
}

rebuild_and_run() {
  # $2 is now a NUMBER followed by prose, so the count can be compared rather
  # than merely displayed. `expected_n` is the leading integer.
  local name="$1" expectation="$2" mode="${3:-expect-red}" filter="${4:-sponsor}"
  local expected_n="${expectation%% *}"
  # STOP ONLY THE APP BEING REBUILT. An earlier version killed the sponsor app at
  # the start of every control, including control 6, which rebuilds the ADMIN app
  # — so the suite had no sponsor app to talk to and could not run at all. The
  # sponsor app has to stay up throughout, because every assertion needs it.
  if [ "$filter" = "web" ]; then
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    # AND REBUILD THE SPONSOR APP FROM THE RESTORED SOURCE FIRST.
    #
    # Control 6 is the only one that rebuilds a different app. Without this, the
    # sponsor app keeps running whatever binary the PREVIOUS control built — for
    # control 6 that was control 5's broken picker — so the run reported four
    # failures where one was predicted, and three of them were leftovers rather
    # than anything control 6 did. A control table that overstates what a control
    # caught is the same fault as one that overstates that it ran.
    lsof -ti:3003 | xargs kill -9 2>/dev/null
    pnpm --filter sponsor build > "$OUT/$name-sponsor-rebuild.txt" 2>&1
    (cd apps/sponsor && PORT=3003 nohup pnpm start > "$OUT/$name-sponsor-srv.log" 2>&1 &)
    curl -s -o /dev/null --retry 60 --retry-delay 1 --retry-all-errors --retry-connrefused -m 10 http://localhost:3003/login
  else
    lsof -ti:3003 | xargs kill -9 2>/dev/null
  fi
  # A BUILD FAILURE IS NOT A CATCH. Phase 13's driver treated it as one, on the
  # reasoning that a control which breaks compilation has demonstrably changed
  # behaviour. That reasoning hides the case this driver hit on its first run:
  # control 6's replacement text was malformed, the admin app failed to build for
  # that reason alone, and the control was recorded as caught without the suite
  # ever running. A control exists to show the SUITE going red. If the suite did
  # not run, nothing was shown.
  if ! pnpm --filter "$filter" build > "$OUT/$name-build.txt" 2>&1; then
    echo "    *** BUILD FAILED — the suite never ran, so this control proves nothing ***"
    echo "    *** Usually means the control's replacement text is malformed.        ***"
    tail -6 "$OUT/$name-build.txt" | sed 's/^/      /'
    FAILURES=$((FAILURES + 1))
    return 0
  fi
  # WAIT PROPERLY FOR THE SERVER, using curl's own retry rather than a bare loop.
  #
  # The first version of this driver looped `curl` sixty times with no delay
  # between attempts. It burned through all sixty in a fraction of a second, gave
  # up long before Next had booted, and ran the suite against nothing — so the
  # suite exited non-zero because it could not reach the app, and EVERY control
  # was recorded as "CAUGHT" without a single assertion having run. That is the
  # same class of mistake Phase 13's driver was rewritten to stop, arriving by a
  # different route. --retry-connrefused with --retry-delay is a real wait.
  if [ "$filter" = "web" ]; then
    (cd apps/web && PORT=3000 nohup pnpm start > "$OUT/$name-srv.log" 2>&1 &)
    curl -s -o /dev/null --retry 60 --retry-delay 1 --retry-all-errors --retry-connrefused -m 10 http://localhost:3000/
  else
    (cd apps/sponsor && PORT=3003 nohup pnpm start > "$OUT/$name-srv.log" 2>&1 &)
    curl -s -o /dev/null --retry 60 --retry-delay 1 --retry-all-errors --retry-connrefused -m 10 http://localhost:3003/login
  fi

  # AND PROVE IT IS ANSWERING BEFORE TRUSTING THE RUN. Without this, "the app is
  # not answering" and "the control was caught" are indistinguishable.
  local port=3003; [ "$filter" = "web" ] && port=3000
  if [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:$port/)" = "000" ]; then
    echo "    *** THE APP NEVER CAME UP on port $port — this control proves nothing ***"
    FAILURES=$((FAILURES + 1))
    return 0
  fi
  if [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:3003/)" = "000" ]; then
    echo "    *** THE SPONSOR APP IS NOT ANSWERING — the suite cannot run ***"
    FAILURES=$((FAILURES + 1))
    return 0
  fi
  node "$SUITE" > "$OUT/$name-run.txt" 2>&1
  local code=$? fails
  fails=$(grep -c "✗" "$OUT/$name-run.txt")
  echo "    suite exit=$code   failed=$fails   (predicted: $expectation)"
  if [ "$mode" = "expect-green" ]; then
    if [ "$code" -eq 0 ]; then
      echo "    RESTORED — the suite is green again on the unmodified tree"
    else
      echo "    *** THE TREE IS NOT CLEAN — still red after restoring ***"
      grep "✗" "$OUT/$name-run.txt" | head -3 | sed 's/^/      /'
      FAILURES=$((FAILURES + 1))
    fi
  elif [ "$code" -ne 0 ]; then
    # THE PREDICTED COUNT IS CHECKED, NOT JUST PRINTED. Round 3 of Phase 6.5.
    #
    # Until this, the driver computed the failure count, printed the prediction
    # beside it, and then compared neither — any non-zero exit was reported as
    # CAUGHT. That is precisely the hole this phase already fell into twice: once
    # when the app was never running and the suite failed for that reason, and
    # once when a control was measured against a different control's build. In
    # both cases the driver would have said CAUGHT on unrelated failures.
    #
    # A control is caught when the suite fails BY THE AMOUNT THE CONTROL PREDICTS.
    # Any other number means the control removed something different from what its
    # author thought, or something else is broken — and either way the control is
    # not evidence until a person looks.
    if [ "$expected_n" != "$fails" ]; then
      echo "    *** COUNT MISMATCH — the suite failed $fails times, not the predicted $expected_n ***"
      echo "    *** A control that fails by the wrong amount is not evidence. Look at it. ***"
      grep "✗" "$OUT/$name-run.txt" | sed 's/^/      /'
      FAILURES=$((FAILURES + 1))
    else
      echo "    CAUGHT, at exactly the predicted count. Failures:"
      grep "✗" "$OUT/$name-run.txt" | head -5 | sed 's/^/      /'
    fi
  else
    echo "    *** NOT CAUGHT — the suite stayed green with this fix removed ***"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "###### CONTROL 1: the response address stops checking the two identifiers as a pair ######"
echo "  Puts back the defect measured on 2026-08-01: the form is verified, the"
echo "  response is then found by its own identifier alone, so one company can"
echo "  change another's response using a perfectly current session."
perl -0pi -e "s/    where: \{ id: subId, formId: id \},/    where: { id: subId }, \/* negative control 1 *\//" "$SUBID"
applied "$SUBID" "negative control 1" && rebuild_and_run control-1 "2 — the cross-company refusal and the database check"
restore_all

echo
echo "###### CONTROL 2: editing another company's form answers success again ######"
echo "  Removes the ownership check ahead of the write. The data stays safe because"
echo "  updateMany is still filtered — which is the point. The caller is told it"
echo "  worked, and that is what this control proves the suite notices."
perl -0pi -e "s/  if \(!owned\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)\n\n  const body = await req\.json\(\)/  \/* negative control 2 *\/\n\n  const body = await req.json()/" "$FORM"
applied "$FORM" "negative control 2" && rebuild_and_run control-2 "2 — the refusal in section 2, and the stale-session refusal in section 3; both exercise PATCH"
restore_all

echo
echo "###### CONTROL 3: deleting another company's form answers success again ######"
perl -0pi -e "s/  if \(!owned\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)\n\n  await prisma\.submissionForm\.deleteMany/  \/* negative control 3 *\/\n\n  await prisma.submissionForm.deleteMany/" "$FORM"
applied "$FORM" "negative control 3" && rebuild_and_run control-3 "2 — the same two as control 2, on DELETE"
restore_all

echo
echo "###### CONTROL 4: the guard hands back the SESSION TOKEN's company again ######"
echo "  The broadest control here, and the one that puts back the defect this whole"
echo "  phase exists to fix. One line in the guard, and all twelve handlers go back"
echo "  to acting for whichever company the caller belonged to when they signed in."
perl -0pi -e "s/  return \{ refused: null, companyId: account\.sponsorId, role: account\.role \}\n\}/  return { refused: null, companyId: (session?.user as any)?.sponsorId ?? null, role: account.role } \/* negative control 4 *\/\n}/" "$GUARD"
applied "$GUARD" "negative control 4" && rebuild_and_run control-4 "17 — every stale-session assertion in section 3"
restore_all

echo
echo "###### CONTROL 5: the teammate rule goes back to excluding only organizers ######"
echo "  Breaks BOTH halves — the list the screen receives and the check the attach"
echo "  address makes — because a control that breaks only one would leave the other"
echo "  covering for it and prove nothing about the half it removed."
perl -0pi -e "s/  role: \{ notIn: \[\.\.\.WBR_ROLES\] \},/  role: { notIn: ['ORGANIZER'] }, \/* negative control 5a *\//" "$PICKER"
perl -0pi -e "s/  return !isWbrStaff\(role\)/  return role !== 'ORGANIZER' \/* negative control 5b *\//" "$PICKER"
applied "$PICKER" "negative control 5a" && applied "$PICKER" "negative control 5b" \
  && rebuild_and_run control-5 "5 — staff offered, direct attach not refused, staff left with a company, and the same two on the email path now that the rule is shared with the register address"
restore_all

echo
echo "###### CONTROL 6: the admin app goes back to excluding by file extension ######"
echo "  Rebuilds the ADMIN app, not the sponsor app. This is the only control here"
echo "  that touches a different app, and forgetting that would rebuild the wrong"
echo "  one and report NOT CAUGHT for a control that was never deployed."
# Done with python3 rather than perl, deliberately. The replacement text is a
# regular expression containing `$)`, and inside a double-quoted perl -e the
# shell and perl BOTH try to interpolate it — perl expands `$)` to its group-id
# variable, which is how the first run of this driver produced a matcher reading
# `...webp)20 20 12 61 79 ...` and broke the build. python3 with plain string
# literals has no interpolation to get wrong.
python3 - "$WEBMW" <<'PYEOF'
import sys
path = sys.argv[1]
src = open(path).read()
old = "  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|sponsors/|manifest.json|sw.js|workbox-.*).*)'],"
new = "  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)'], /* negative control 6 */"
if old not in src:
    sys.exit("control 6: anchor line not found")
open(path, "w").write(src.replace(old, new))
PYEOF
applied "$WEBMW" "negative control 6" && rebuild_and_run control-6 "1 — the signed-out image-suffix page" expect-red web
restore_all
# Put the admin app back on the fixed build before the final check.
pnpm --filter web build > "$OUT/web-restore-build.txt" 2>&1
lsof -ti:3000 | xargs kill -9 2>/dev/null
(cd apps/web && PORT=3000 nohup pnpm start > "$OUT/web-restore-srv.log" 2>&1 &)
for _ in $(seq 1 60); do curl -s -o /dev/null -m 2 http://localhost:3000/ && break; done

echo
echo "###### RESTORED: everything back, suite should be green ######"
for f in "$GUARD:guard" "$SUBID:subid" "$FORM:form" "$PICKER:picker" "$WEBMW:webmw"; do
  path="${f%%:*}"; key="${f##*:}"
  if diff -q "$OUT/$key.orig" "$path" > /dev/null; then
    echo "  $path — identical to the copy taken before the first control"
  else
    echo "  *** $path DIFFERS FROM ITS PRE-CONTROL COPY ***"
    diff "$OUT/$key.orig" "$path" | head -10 | sed 's/^/    /'
    FAILURES=$((FAILURES + 1))
  fi
done
rebuild_and_run restored "0" expect-green

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "ALL CONTROLS APPLIED AND ALL WERE CAUGHT. The suite's numbers may be cited."
  exit 0
else
  echo "*** $FAILURES PROBLEM(S). Do not cite the suite's numbers from this run. ***"
  echo "*** A control that did not apply, or was not caught, means the suite has  ***"
  echo "*** a hole or the code has moved underneath the control.                  ***"
  exit 1
fi
