#!/bin/bash
# NEGATIVE CONTROLS for Phase 5.
#
# A suite that cannot fail is not evidence. This phase already produced a green
# run of 68 of 68 while the checklist was impossible to submit in a browser, so
# "it passes" has already been shown here to be worth very little on its own.
#
# Each control below breaks ONE real fix, rebuilds, runs the suite, and records
# whether the suite went red and WHERE. Then it restores from git and moves on.
# A control that leaves the suite green is a hole in the suite.
set -u
cd "$(git rev-parse --show-toplevel)"

GATE_LAYOUT='apps/sponsor/app/(authenticated)/(portal)/layout.tsx'
PROFILE_ROUTE='apps/sponsor/app/api/profile/route.ts'
LOGO='apps/sponsor/components/LogoUploader.tsx'
OUT=/tmp/nc
mkdir -p $OUT

restore_all() {
  git checkout -- "$GATE_LAYOUT" "$PROFILE_ROUTE" "$LOGO"
}

rebuild_and_run() {
  local name="$1"
  lsof -ti:3003 | xargs kill -9 2>/dev/null
  sleep 1
  if ! pnpm --filter sponsor build > "$OUT/$name-build.txt" 2>&1; then
    echo "    BUILD FAILED (which is itself a form of catching it)"
    tail -5 "$OUT/$name-build.txt" | sed 's/^/      /'
    return 2
  fi
  (cd apps/sponsor && nohup pnpm start > "$OUT/$name-srv.log" 2>&1 &)
  sleep 6
  node docs/smoketests/playwright/phase-5-sponsor-screen-gate.mjs > "$OUT/$name-run.txt" 2>&1
  local code=$?
  local fails
  fails=$(grep -c "✗" "$OUT/$name-run.txt")
  echo "    suite exit=$code  failed assertions=$fails"
  if [ "$code" -ne 0 ]; then
    echo "    CAUGHT. First failures:"
    grep "✗" "$OUT/$name-run.txt" | head -4 | sed 's/^/      /'
  else
    echo "    *** NOT CAUGHT — the suite stayed green with this fix removed ***"
  fi
  return 0
}

echo "############ CONTROL 1: remove the gate call from the portal layout ############"
python3 - <<'PY'
p='apps/sponsor/app/(authenticated)/(portal)/layout.tsx'
s=open(p).read()
n=s.replace("  await enforceOnboardingGate()","  // NEGATIVE CONTROL\n  void 0")
assert n!=s, "gate call not found"
open(p,'w').write(n)
PY
grep -n "enforceOnboardingGate()" "$GATE_LAYOUT" || echo "    gate call removed"
rebuild_and_run c1
restore_all
echo

echo "############ CONTROL 2: save address reads the company from the session token ############"
python3 - <<'PY'
p='apps/sponsor/app/api/profile/route.ts'
s=open(p).read()
n=s.replace("  const sponsorId = account.sponsorId","  const sponsorId = user.sponsorId  // NEGATIVE CONTROL: back to the token")
assert n!=s, "sponsorId assignment not found"
open(p,'w').write(n)
PY
grep -n "NEGATIVE CONTROL" "$PROFILE_ROUTE" | head -1
rebuild_and_run c2
restore_all
echo

echo "############ CONTROL 3: logo input back to type=url ############"
python3 - <<'PY'
p='apps/sponsor/components/LogoUploader.tsx'
s=open(p).read()
n=s.replace('<input className="input" type="text" inputMode="url" value={value}','<input className="input" type="url" value={value}')
assert n!=s, "logo input not found"
open(p,'w').write(n)
PY
grep -n 'type="url" value={value}' "$LOGO" | head -1
rebuild_and_run c3
restore_all
echo

echo "############ restore and confirm the tree is clean ############"
restore_all
git diff --quiet HEAD -- "$GATE_LAYOUT" "$PROFILE_ROUTE" "$LOGO" && echo "  all three files restored to the commit" || { echo "  STILL DIRTY:"; git diff --stat HEAD -- "$GATE_LAYOUT" "$PROFILE_ROUTE" "$LOGO"; }
