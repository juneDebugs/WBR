#!/bin/bash
# NEGATIVE CONTROLS for Phase 6 — proving the suite can go red.
#
# A suite that cannot fail is not evidence. This project has already produced two
# fully green runs over broken behaviour: Phase 1 passed 33 of 33 while a blocked
# delegate could still post in a chat room, and Phase 5 passed 68 of 68 while the
# sponsor checklist could not be submitted in a browser at all. So "117 passed"
# means nothing here until each of the behaviours behind those 117 has been
# removed in turn and the suite has been watched to go red.
#
# Each control breaks ONE behaviour, rebuilds, runs the suite, and records whether
# it was caught AND WHERE. Then it restores and moves on. A control that leaves
# the suite green is a hole in the suite, not a success.
#
# RESTORE IS BY FILE COPY, NOT BY GIT. Phase 6 is not committed while this runs,
# so `git checkout -- <file>` would throw the whole phase away rather than undo
# one control. The two files these controls touch are copied to $OUT before
# anything is changed and copied back afterwards, and the last block diffs them
# against those copies to prove the tree is back as it was.
#
# Usage:
#   docs/smoketests/playwright/phase-6-negative-controls.sh
#
# Expected outcome, recorded in docs/smoketests/phase-6-sponsor-request-guard.md:
# all five controls caught, with the failure counts each one predicts below.
set -u
cd "$(git rev-parse --show-toplevel)"

GUARD='apps/sponsor/lib/require-complete-profile.ts'
DIRECTORY='apps/sponsor/app/api/attendees/route.ts'
SUITE='docs/smoketests/playwright/phase-6-sponsor-request-guard.mjs'
OUT=/tmp/nc6
mkdir -p $OUT

cp "$GUARD" "$OUT/guard.orig"
cp "$DIRECTORY" "$OUT/directory.orig"

restore_all() {
  cp "$OUT/guard.orig" "$GUARD"
  cp "$OUT/directory.orig" "$DIRECTORY"
}

# The AI feature switch must be ON or two of the nineteen addresses answer 404
# before the guard runs and report SKIP instead of taking part.
# $3 is "expect-green" for the final confirmation run, where a green suite is the
# correct outcome. Without it the function printed "NOT CAUGHT" on that run, which
# reads as a failure when it is the opposite — a misleading line in a script whose
# whole job is telling a runner what is and is not real.
rebuild_and_run() {
  local name="$1" expectation="$2" mode="${3:-expect-red}"
  lsof -ti:3003 | xargs kill -9 2>/dev/null
  sleep 1
  if ! pnpm --filter sponsor build > "$OUT/$name-build.txt" 2>&1; then
    echo "    BUILD FAILED — which is itself a way of catching it"
    tail -5 "$OUT/$name-build.txt" | sed 's/^/      /'
    return 0
  fi
  (cd apps/sponsor && WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED=true nohup pnpm start > "$OUT/$name-srv.log" 2>&1 &)
  for _ in $(seq 1 40); do sleep 0.5; curl -s -o /dev/null -m 2 http://localhost:3003/login && break; done
  node "$SUITE" > "$OUT/$name-run.txt" 2>&1
  local code=$? fails
  fails=$(grep -c "✗" "$OUT/$name-run.txt")
  echo "    suite exit=$code   failed assertions=$fails   (expected: $expectation)"
  if [ "$mode" = "expect-green" ]; then
    if [ "$code" -eq 0 ]; then
      echo "    RESTORED — the suite is green again on the unmodified tree"
    else
      echo "    *** THE TREE IS NOT CLEAN — the suite is still red after restoring ***"
      grep "✗" "$OUT/$name-run.txt" | head -3 | sed 's/^/      /'
    fi
  elif [ "$code" -ne 0 ]; then
    echo "    CAUGHT. First failures:"
    grep "✗" "$OUT/$name-run.txt" | head -3 | sed 's/^/      /'
  else
    echo "    *** NOT CAUGHT — the suite stayed green with this behaviour removed ***"
  fi
}

echo "############ CONTROL 1: the buyer directory stops calling the guard ############"
echo "  The realistic regression: somebody adds or edits a handler and forgets the call."
echo "  Catching it proves the suite covers each address individually, not in bulk."
python3 - <<'PY'
p='apps/sponsor/app/api/attendees/route.ts'
s=open(p).read()
n=s.replace("  const blocked = await requireCompleteProfile()\n  if (blocked) return blocked",
            "  // NEGATIVE CONTROL: guard call removed\n  void 0")
assert n!=s, "guard call not found in the buyer directory"
open(p,'w').write(n)
PY
rebuild_and_run c1 "2 — the incomplete rep and the no-company rep, on this one address"
restore_all
echo

echo "############ CONTROL 2: the guard never refuses anybody ############"
echo "  Stands in for the guard not being applied anywhere at all."
python3 - <<'PY'
p='apps/sponsor/lib/require-complete-profile.ts'
s=open(p).read()
marker="export async function requireCompleteProfile(): Promise<NextResponse | null> {"
assert marker in s, "guard signature not found"
n=s.replace(marker, marker+"\n  return null // NEGATIVE CONTROL: refuse nobody",1)
open(p,'w').write(n)
PY
rebuild_and_run c2 "38 — all 19 addresses across both refused subjects"
restore_all
echo

echo "############ CONTROL 3: fail OPEN when the company row is absent ############"
echo "  The direction FP finding F-6 already measured as wrong in the other app."
python3 - <<'PY'
p='apps/sponsor/lib/require-complete-profile.ts'
s=open(p).read()
old="  if (!account.sponsor) return refusal()"
assert old in s, "no-company refusal not found"
n=s.replace(old,"  if (!account.sponsor) return null // NEGATIVE CONTROL: fail open",1)
open(p,'w').write(n)
PY
rebuild_and_run c3 "19 — the no-company representative is let through everywhere"
restore_all
echo

echo "############ CONTROL 4: remove the person-based exemption ############"
echo "  The most severe way this phase could fail: the organizer demonstration"
echo "  login has no exhibiting company, so without the exemption it is refused at"
echo "  every address in the app — in front of the customer."
python3 - <<'PY'
p='apps/sponsor/lib/require-complete-profile.ts'
s=open(p).read()
old="  if (isWbrStaff(account.role)) return null"
assert old in s, "staff exemption not found"
n=s.replace(old,"  // NEGATIVE CONTROL: exemption removed",1)
open(p,'w').write(n)
PY
rebuild_and_run c4 "19 — the organizer is over-blocked at every address"
restore_all
echo

echo "############ CONTROL 5: the refusal drops its machine-readable marker ############"
echo "  Every assertion requires 403 AND onboardingRequired, because several"
echo "  handlers here answered 403 for their own reasons before this phase existed."
echo "  This control proves that second half is load-bearing rather than decorative."
python3 - <<'PY'
p='apps/sponsor/lib/require-complete-profile.ts'
s=open(p).read()
old="{ error: 'Complete your company profile before using the portal', onboardingRequired: true },"
assert old in s, "refusal body not found"
n=s.replace(old,"{ error: 'Complete your company profile before using the portal' }, // NEGATIVE CONTROL",1)
open(p,'w').write(n)
PY
rebuild_and_run c5 "39 — 38 refusals plus the cross-app body-shape comparison"
restore_all
echo

echo "############ restore and confirm the tree is back as it was ############"
restore_all
ok=1
diff -q "$OUT/guard.orig" "$GUARD" > /dev/null || { echo "  STILL MODIFIED: $GUARD"; ok=0; }
diff -q "$OUT/directory.orig" "$DIRECTORY" > /dev/null || { echo "  STILL MODIFIED: $DIRECTORY"; ok=0; }
[ "$ok" -eq 1 ] && echo "  both files identical to the copies taken before the first control"

echo
echo "############ final confirmation run on the restored tree ############"
rebuild_and_run final "0 — everything restored, the suite green again" expect-green
