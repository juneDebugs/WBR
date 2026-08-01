#!/bin/bash
# NEGATIVE CONTROLS for Phase 13 — proving the suite can go red.
#
# A suite that cannot fail is not evidence. This repository has produced fully
# green runs over broken behaviour three times: Phase 1 passed 33 of 33 while a
# blocked delegate could still post in a chat room, Phase 5 passed 68 of 68 while
# the sponsor checklist could not be submitted in a browser, and Phase 6's first
# attempt at one step reported three failures against a feature that worked.
#
# Each control breaks ONE behaviour, rebuilds, runs the suite, records whether it
# was caught, then restores. A control that leaves the suite green is a hole in
# the suite, not a success.
#
# ---------------------------------------------------------------------------
# WHY THIS FILE FAILS LOUDLY, AND WHY IT WAS REWRITTEN
#
# The first version of this driver was written against the code as it stood
# before adversarial review rounds 1 and 2. Those rounds changed the very lines
# three of the controls edited — `user.sponsorId` became `companyId`, and a
# read-then-write became a conditional `updateMany`. The substitutions silently
# stopped matching. The driver printed a warning, carried on, and exited 0, so a
# reviewer could read "all controls caught" from a run in which three of them
# never touched the code at all. Round 3 caught it.
#
# Two consequences, both deliberate:
#   1. A substitution that does not apply is now FATAL. So is a control that runs
#      and leaves the suite green. The script exits non-zero and says which.
#   2. The numbers in docs/smoketests/phase-13-sponsor-portal-carried-issues.md
#      may only be copied from a run of THIS file that exited 0.
# ---------------------------------------------------------------------------
#
# THE MEETINGS PORTAL MUST BE RUNNING on port 3002. Without it the suite skips
# AC-8, and since round 1 a skip fails the run — a control would look caught for
# the wrong reason.
#   pnpm --filter meetings build && (cd apps/meetings && pnpm start)
#
# Usage:
#   docs/smoketests/playwright/phase-13-negative-controls.sh
set -u
cd "$(git rev-parse --show-toplevel)"

NAVBAR='apps/sponsor/components/NavBar.tsx'
ATTACH='apps/sponsor/app/api/profile/teammates/route.ts'
REGISTER='apps/sponsor/app/api/profile/teammates/register/route.ts'
EDITOR='apps/sponsor/components/ProfileEditor.tsx'
LOGIN='apps/sponsor/app/login/page.tsx'
SUITE='docs/smoketests/playwright/phase-13-sponsor-portal-carried-issues.mjs'
OUT=/tmp/nc13
mkdir -p $OUT

FAILURES=0

cp "$NAVBAR"   "$OUT/navbar.orig"
cp "$ATTACH"   "$OUT/attach.orig"
cp "$REGISTER" "$OUT/register.orig"
cp "$EDITOR"   "$OUT/editor.orig"
cp "$LOGIN"    "$OUT/login.orig"

restore_all() {
  cp "$OUT/navbar.orig"   "$NAVBAR"
  cp "$OUT/attach.orig"   "$ATTACH"
  cp "$OUT/register.orig" "$REGISTER"
  cp "$OUT/editor.orig"   "$EDITOR"
  cp "$OUT/login.orig"    "$LOGIN"
}
trap restore_all EXIT

# Assert the control actually changed the file. A control that does not apply
# tests nothing, and silently testing nothing is what this rewrite exists to stop.
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
  local name="$1" expectation="$2" mode="${3:-expect-red}"
  lsof -ti:3003 | xargs kill -9 2>/dev/null
  sleep 1
  if ! pnpm --filter sponsor build > "$OUT/$name-build.txt" 2>&1; then
    echo "    BUILD FAILED — which is itself a way of catching it"
    tail -5 "$OUT/$name-build.txt" | sed 's/^/      /'
    return 0
  fi
  (cd apps/sponsor && nohup pnpm start > "$OUT/$name-srv.log" 2>&1 &)
  for _ in $(seq 1 40); do sleep 0.5; curl -s -o /dev/null -m 2 http://localhost:3003/login && break; done
  node "$SUITE" > "$OUT/$name-run.txt" 2>&1
  local code=$? fails skips
  fails=$(grep -c "✗" "$OUT/$name-run.txt")
  skips=$(grep -c "SKIP" "$OUT/$name-run.txt")
  echo "    suite exit=$code   failed=$fails   skipped=$skips   (predicted failures: $expectation)"
  if [ "$mode" = "expect-green" ]; then
    if [ "$code" -eq 0 ]; then
      echo "    RESTORED — the suite is green again on the unmodified tree"
    else
      echo "    *** THE TREE IS NOT CLEAN — still red after restoring ***"
      grep "✗" "$OUT/$name-run.txt" | head -3 | sed 's/^/      /'
      FAILURES=$((FAILURES + 1))
    fi
  elif [ "$code" -ne 0 ]; then
    echo "    CAUGHT. Failures:"
    grep "✗" "$OUT/$name-run.txt" | head -5 | sed 's/^/      /'
  else
    echo "    *** NOT CAUGHT — the suite stayed green with this behaviour removed ***"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "############ CONTROL 1: the portal stops erasing the stored data ANYWHERE ############"
echo "  Removes BOTH erases — the Sign out button and the sign-in page."
echo
echo "  WHY BOTH, AND WHY THIS CONTROL WAS REWRITTEN. The first version removed only"
echo "  the button's erase and was NOT CAUGHT: the suite stayed green because"
echo "  pressing Sign out navigates to the sign-in page, which round 1 taught to"
echo "  erase as well. So AC-1 on its own cannot tell the two apart, and a control"
echo "  that removes one of two overlapping mechanisms proves nothing."
echo
echo "  Removing both is the honest control for 'this phase erases the data at all'."
echo "  Control 7 below removes only the sign-in page's erase, which isolates the"
echo "  paths the button cannot cover — expiry, invalidation, a deleted cookie."
echo
echo "  RECORDED CONSEQUENCE: removing ONLY the button's erase changes no observable"
echo "  outcome in this suite. The button erase is kept regardless, because it also"
echo "  empties the IN-MEMORY cache before navigating, and without that the throttled"
echo "  writer can persist what is still in memory after the sign-in page has already"
echo "  deleted the stored copy. That reasoning is not covered by an assertion here,"
echo "  and saying so is better than implying the control covers it."
perl -0pi -e "s/      queryClient\.clear\(\)\n      await clearPersistedQueryCache\(\)\n/      \/* negative control 1a *\/\n/" "$NAVBAR"
perl -0pi -e "s/  useEffect\(\(\) => \{\n    void ensureErased\(\)\n  \}, \[ensureErased\]\)/  \/* negative control 1b *\//" "$LOGIN"
perl -0pi -e "s/      await ensureErased\(\)\n/      \/* negative control 1c *\/\n/" "$LOGIN"
applied "$NAVBAR" "negative control 1a" && applied "$LOGIN" "negative control 1b" \
  && rebuild_and_run control-1 "2 — AC-1 (the button path) and AC-14 (every other path)"
restore_all

echo
echo "############ CONTROL 2: the attach write stops being conditional ############"
echo "  Removing the OR clause makes updateMany match any id, so nothing is refused."
echo "  This is the Phase 6 defect and the round-1 race, both at once."
perl -0pi -e "s/      OR: \[\{ sponsorId: null \}, \{ sponsorId: companyId \}\],\n/      \/* negative control 2: condition removed *\/\n/" "$ATTACH"
applied "$ATTACH" "negative control 2" && rebuild_and_run control-2 "4 — AC-4 status, AC-4 database, AC-4 screen half, AC-13 race"
restore_all

echo
echo "############ CONTROL 3: a created colleague goes back to the delegate role ############"
echo "  The defect Phase 6 found on the deployed preview, put back."
perl -0pi -e "s/      role: 'SPONSOR',\n      sponsorId: companyId,/      role: 'ATTENDEE', \/* negative control 3 *\/\n      sponsorId: companyId,/" "$REGISTER"
applied "$REGISTER" "negative control 3" && rebuild_and_run control-3 "3 — stored role, AC-7 sign-in, AC-10 sign-in"
restore_all

echo
echo "############ CONTROL 4: attaching an existing person changes their role ############"
echo "  The rejected alternative — the one that removes a real person's access to"
echo "  the meetings portal. Needs port 3002 listening to be caught properly."
perl -0pi -e "s/      data: \{ sponsorId: companyId, \.\.\.\(name && \{ name \}\), \.\.\.\(jobTitle && \{ jobTitle \}\) \},/      data: { role: 'SPONSOR', \/* negative control 4 *\/ sponsorId: companyId, ...(name \&\& { name }), ...(jobTitle \&\& { jobTitle }) },/" "$REGISTER"
applied "$REGISTER" "negative control 4" && rebuild_and_run control-4 "2 — AC-8 role unchanged, AC-8 meetings sign-in"
restore_all

echo
echo "############ CONTROL 5: the screen swallows the refusal again ############"
echo "  The state this screen was in before this phase: a refused attach produced"
echo "  no message, so the button looked broken."
perl -0pi -e "s/    setTeammateError\(await refusalMessage\(res, 'Could not add that person to your team\.'\)\)/    \/* negative control 5: refusal discarded *\//" "$EDITOR"
applied "$EDITOR" "negative control 5" && rebuild_and_run control-5 "1 — AC-4 screen half"
restore_all

echo
echo "############ CONTROL 6: colleague creation trusts the session token again ############"
echo "  Added after round 1. Reverting to the token lets a representative moved"
echo "  between companies mint a working account at the company they LEFT."
perl -0pi -e "s/  const companyId = await getCallerCompanyId\(user\.id\)/  const companyId = user.sponsorId \/* negative control 6 *\//" "$REGISTER"
applied "$REGISTER" "negative control 6" && rebuild_and_run control-6 "1 — AC-12 colleague lands at the old company"
restore_all

echo
echo "############ CONTROL 7: the sign-in page stops erasing ############"
echo "  Added after round 1. The button still erases, so only the paths that end a"
echo "  session WITHOUT it — expiry, invalidation, a deleted cookie — are exposed."
perl -0pi -e "s/  useEffect\(\(\) => \{\n    void ensureErased\(\)\n  \}, \[ensureErased\]\)/  \/* negative control 7: sign-in page no longer erases *\//" "$LOGIN"
applied "$LOGIN" "negative control 7" && rebuild_and_run control-7 "1 — AC-14"
restore_all

echo
echo "############ RESTORED: everything back, suite should be green ############"
for f in "$NAVBAR:navbar" "$ATTACH:attach" "$REGISTER:register" "$EDITOR:editor" "$LOGIN:login"; do
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
  echo "ALL CONTROLS APPLIED AND CAUGHT. The suite's totals may be quoted."
  exit 0
else
  echo "*** $FAILURES PROBLEM(S). The suite's totals must NOT be quoted as evidence ***"
  echo "*** until every control applies and every control is caught.              ***"
  exit 1
fi
