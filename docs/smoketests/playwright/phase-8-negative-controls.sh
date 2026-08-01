#!/usr/bin/env bash
# Phase 8 — negative controls.
#
# A green suite proves nothing until the suite has been shown to go red. Each
# control below deliberately breaks ONE shipped behaviour, rebuilds, restarts,
# re-runs the suite, and requires it to fail BY THE NUMBER OF ASSERTIONS
# PREDICTED IN ADVANCE. A control caught by the wrong number is a finding, not a
# pass: it means the suite is measuring something other than what it claims.
#
# Five gates, all of which must hold for a control to count:
#   1. the edit must actually apply       (verified by re-reading the file)
#   2. the build must succeed             (a broken build fails everything)
#   3. the app must be answering          (a dead server refuses everything)
#   4. the suite must be caught           (failures > 0)
#   5. caught by the PREDICTED amount     (failures == prediction)
#
# Usage: bash docs/smoketests/playwright/phase-8-negative-controls.sh
# Restores every file and leaves a correct build behind, even on failure.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

CLIENT="apps/attendee/components/map/FloorPlanClient.tsx"
ROUTE="apps/attendee/app/api/data/map/route.ts"
SUITE="docs/smoketests/playwright/phase-8-floor-plan-viewer.mjs"
WORK="${TMPDIR:-/tmp}/phase8-controls"
mkdir -p "$WORK"

cp "$CLIENT" "$WORK/FloorPlanClient.tsx.orig"
cp "$ROUTE" "$WORK/route.ts.orig"

restore() {
  cp "$WORK/FloorPlanClient.tsx.orig" "$CLIENT"
  cp "$WORK/route.ts.orig" "$ROUTE"
}
trap 'echo; echo "Restoring the working tree."; restore' EXIT

# Edits are made with node and the replacement is passed as an argument, so a
# $ or & inside it is data rather than a substitution. Phase 6.5 lost a cycle to
# Perl expanding one.
apply() {
  local file="$1" find="$2" replace="$3"
  node -e '
    const fs = require("fs")
    const [file, find, replace] = process.argv.slice(1)
    const before = fs.readFileSync(file, "utf8")
    if (!before.includes(find)) { console.error("ANCHOR NOT FOUND"); process.exit(3) }
    const after = before.split(find).join(replace)
    if (after === before) { console.error("EDIT CHANGED NOTHING"); process.exit(3) }
    fs.writeFileSync(file, after)
    const check = fs.readFileSync(file, "utf8")
    if (!check.includes(replace)) { console.error("EDIT DID NOT STICK"); process.exit(3) }
  ' "$file" "$find" "$replace"
}

# Kill EVERY listener on the port, not just the first one, and prove the port is
# free afterwards. Raised by adversarial review round 2: killing only the first
# process left a second one able to hold the port, the new server would then die
# with an address-in-use error, and the readiness check below would be satisfied
# by the OLD build. A control judged against stale code can even match its
# predicted failure count and be recorded as a pass for entirely the wrong
# reason.
stop_server() {
  local pids attempt
  for attempt in 1 2 3; do
    pids="$(lsof -ti:3001 2>/dev/null)"
    [ -z "$pids" ] && return 0
    echo "$pids" | xargs kill 2>/dev/null
    sleep 2
  done
  pids="$(lsof -ti:3001 2>/dev/null)"
  if [ -n "$pids" ]; then
    echo "  port 3001 is still held by: $pids"
    return 1
  fi
  return 0
}

build_and_start() {
  if ! stop_server; then
    echo "  GATE 3 FAILED: could not free port 3001, so any server answering it is not ours."
    return 1
  fi

  # The map read is cached to disk and survives a restart, so it is cleared
  # with every build. Measured 2026-08-01: a re-seed was invisible to the app
  # across a full restart until this directory was removed.
  rm -rf apps/attendee/.next/cache/fetch-cache
  ( cd apps/attendee && npx next build ) > "$WORK/build.log" 2>&1
  local code=$?
  if [ $code -ne 0 ]; then
    echo "  GATE 2 FAILED: the build did not succeed. Last lines:"
    tail -12 "$WORK/build.log" | sed 's/^/    /'
    return 1
  fi

  ( cd apps/attendee && nohup npx next start -p 3001 > "$WORK/server.log" 2>&1 & echo $! > "$WORK/server.pid" )
  sleep 1
  local server_pid
  server_pid="$(cat "$WORK/server.pid" 2>/dev/null)"

  curl --silent --retry 40 --retry-delay 1 --retry-connrefused --output /dev/null \
    --write-out "" http://localhost:3001/login
  local http
  http="$(curl --silent --output /dev/null --write-out '%{http_code}' http://localhost:3001/login)"
  if [ "$http" != "200" ]; then
    echo "  GATE 3 FAILED: the app is not answering (login page returned $http)."
    tail -8 "$WORK/server.log" | sed 's/^/    /'
    return 1
  fi

  # The server we started must still be alive. If it exited — an address already
  # in use, a crash on boot — then something else is answering that 200 and the
  # whole run would be measuring code we did not build.
  if [ -n "$server_pid" ] && ! kill -0 "$server_pid" 2>/dev/null; then
    echo "  GATE 3 FAILED: the process we started (pid $server_pid) is no longer running,"
    echo "                 so whatever answered is not the build we just made."
    tail -8 "$WORK/server.log" | sed 's/^/    /'
    return 1
  fi

  # AND the process actually holding the port must be OURS. Raised by
  # adversarial review round 3: the pid recorded above is the `npx` wrapper, and
  # the process serving traffic is its child, so proving the wrapper is alive
  # does not prove the listener is the build we just made. Walk the listener's
  # parent chain and require our pid to appear in it.
  local listener parent depth owned
  listener="$(lsof -ti:3001 2>/dev/null | head -1)"
  if [ -z "$listener" ]; then
    echo "  GATE 3 FAILED: something answered but nothing is listening on 3001."
    return 1
  fi
  owned=0
  parent="$listener"
  depth=0
  while [ -n "$parent" ] && [ "$parent" != "1" ] && [ "$depth" -lt 8 ]; do
    if [ "$parent" = "$server_pid" ]; then owned=1; break; fi
    parent="$(ps -o ppid= -p "$parent" 2>/dev/null | tr -d ' ')"
    depth=$((depth + 1))
  done
  if [ "$owned" -ne 1 ]; then
    echo "  GATE 3 FAILED: port 3001 is held by pid $listener, which is not a child of the"
    echo "                 server we started (pid $server_pid). The suite would be judging"
    echo "                 code this run did not build."
    return 1
  fi
  echo "  (port 3001 held by pid $listener, a child of our pid $server_pid)"
  return 0
}

# Runs the suite and prints the number of failed assertions, or nothing at all
# if the suite did not report EXACTLY ONE result line.
#
# Raised by adversarial review round 3. The earlier version printed every match,
# so a suite that somehow reported twice would hand back two numbers, and the
# caller's `-eq` comparison on that string would misbehave in the very gate that
# is supposed to prove a control failed by the predicted amount. Ambiguous
# output is now treated as no result, which fails the gate loudly.
suite_failures() {
  local out lines
  out="$(node "$SUITE" 2>&1)"
  echo "$out" > "$WORK/last-suite.log"
  lines="$(echo "$out" | grep -cE 'Results: [0-9]+ passed, [0-9]+ failed')"
  if [ "$lines" -ne 1 ]; then
    return 0
  fi
  echo "$out" | grep -oE 'Results: [0-9]+ passed, [0-9]+ failed' \
    | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+'
}

PASSED=0
FAILED=0

run_control() {
  local name="$1" predicted="$2" file="$3" find="$4" replace="$5"
  echo
  echo "══ CONTROL: $name"
  echo "   prediction: the suite fails by exactly $predicted assertion(s)"

  restore
  if ! apply "$file" "$find" "$replace"; then
    echo "  GATE 1 FAILED: the edit did not apply."
    FAILED=$((FAILED + 1)); return
  fi
  echo "  gate 1 ok — the edit applied"

  if ! build_and_start; then
    FAILED=$((FAILED + 1)); return
  fi
  echo "  gate 2 ok — the build succeeded"
  echo "  gate 3 ok — the app is answering"

  local failures
  failures="$(suite_failures)"
  if [ -z "$failures" ]; then
    echo "  GATE 4 FAILED: the suite did not report exactly one result line."
    FAILED=$((FAILED + 1)); return
  fi
  if [ "$failures" -eq 0 ]; then
    echo "  GATE 4 FAILED: the suite stayed GREEN against deliberately broken code."
    FAILED=$((FAILED + 1)); return
  fi
  echo "  gate 4 ok — the suite was caught ($failures failed)"

  if [ "$failures" -ne "$predicted" ]; then
    echo "  GATE 5 FAILED: caught by $failures, predicted $predicted."
    echo "    Which assertions failed:"
    grep -E '✗' "$WORK/last-suite.log" | sed 's/^/      /'
    FAILED=$((FAILED + 1)); return
  fi
  echo "  gate 5 ok — caught by exactly the predicted $predicted"
  PASSED=$((PASSED + 1))
}

echo "Phase 8 — negative controls"
echo "Each control breaks one shipped behaviour and must be caught by a"
echo "predicted number of failing assertions."

# ── 1 ────────────────────────────────────────────────────────────────────────
# Pad the marker layer so it is no longer the picture's box. Every marker then
# resolves its percentage against a box larger than the picture it sits on.
# Rewritten when zoom and pan landed. The old control padded the marker layer,
# and that anchor no longer exists: the layer is now sized by the window it sits
# in and the picture fills it completely, so the layer's box IS the picture's
# box by construction. There is no longer an edit that separates the two without
# rewriting the component, which is itself the improvement.
#
# This control instead reproduces the exact defect the third opinion found in
# the first zoom implementation: a border on the window. A border sits outside
# the content box, so the picture inside ends up two pixels narrower than the
# window it is supposed to fill.
# Predicted 2, raised from 1 before this re-run. There are TWO fit-to-window
# assertions, not one: the picture fills the window at rest, and it settles back
# to filling it after being pinched inward past the limit. Both compare the same
# two widths, so both move. I counted only the first; the harness caught 2 and
# refused it at gate 5, which is the gate doing its job. The layer and the
# picture are both inside the border so they still match each other, and every
# marker position is measured against the picture and is unaffected.
run_control \
  "the map window regains a border, so the picture no longer fills it" 2 \
  "$CLIENT" \
  'className="relative w-full rounded-xl bg-white ring-1 ring-black/10"' \
  'className="relative w-full rounded-xl bg-white border border-black/10"'

# ── 2 ────────────────────────────────────────────────────────────────────────
# Drop the completeness guard from the map data address, leaving the screen
# gated but the data behind it readable by a blocked delegate.
# Predicted 1: the 403 assertion.
run_control \
  "the map data address stops refusing a blocked delegate" 1 \
  "$ROUTE" \
  '  if (blocked) return blocked' \
  '  // if (blocked) return blocked'

# ── 3 ────────────────────────────────────────────────────────────────────────
# Shrink the tap target to a size a thumb misses, leaving the marker centred
# exactly where it was so only the target assertions should move.
# Predicted 2, raised from 1 before this run: the marker is now checked at rest
# AND while zoomed in, and because it is held at a constant size on screen it is
# too small in both. Its centre does not move, so no position assertion should
# change, and the labels move slightly UP rather than down, so the label bounds
# should not change either.
run_control \
  "booth markers stop being big enough to tap" 2 \
  "$CLIENT" \
  'className="absolute h-11 w-11 flex items-center justify-center' \
  'className="absolute h-6 w-6 flex items-center justify-center'

# ── 4 ────────────────────────────────────────────────────────────────────────
# Keep the room label in the markup but hide it from the screen. This is the
# control for the exact defect class this project has hit twice: an assertion
# satisfied by text present in the response but never visible to a person.
# Predicted 5. It was 2, raised to 4 when the label-bounds assertions were added
# in review round 3, and raised again to 5 here: the zoom work added a check that
# the room map has labels on screen to measure at all, and a hidden label is not
# on screen. The four already counted are that a label occupies no space, that it
# is not visible, and the bounds check on each of the two room maps — a hidden
# element reports a zero-sized rectangle at the page origin, which is correctly
# outside the picture. Its text is still readable from the markup, so that
# assertion should NOT move.
#
# The 4 was measured wrong on the previous run: the harness caught 5 and refused
# it at gate 5. That is the gate doing its job — a prediction that has to be
# corrected afterwards is not a prediction, so the reason is written here and the
# number is raised BEFORE the re-run rather than after seeing it again.
run_control \
  "room labels are present in the markup but invisible on screen" 5 \
  "$CLIENT" \
  'className="pointer-events-none absolute left-1/2 top-full' \
  'className="hidden pointer-events-none absolute left-1/2 top-full'

# ── 5 ────────────────────────────────────────────────────────────────────────
# Make the markers scale WITH the map instead of holding their size. This is the
# alternative finding F-9 explicitly rejected: it magnifies the problem along
# with the map, so a label covers the same share of the map at every zoom level
# and zooming stops being a remedy. The marker's centre still lands on its
# point, so the position assertions should NOT move.
# Predicted 3: the marker is no longer the same size on screen; the label no
# longer covers a smaller share of the map; and it no longer holds its width.
run_control \
  "markers scale with the map, so zooming stops decluttering" 3 \
  "$CLIENT" \
  'transform: `translate(-50%, -50%) scale(${1 / scale})`,' \
  'transform: `translate(-50%, -50%)`,'

# ── 6 ────────────────────────────────────────────────────────────────────────
# Remove the clamp that keeps the map covering its window, so it can be dragged
# away and leave blank space where the map should be.
# Predicted 1: the shove assertion.
run_control \
  "the map can be dragged off its own window" 1 \
  "$CLIENT" \
  '      x: Math.min(0, Math.max(-overflowX, next.x)),
      y: Math.min(0, Math.max(-overflowY, next.y)),' \
  '      x: next.x,
      y: next.y,'

# ── 7 ────────────────────────────────────────────────────────────────────────
# Capture the pointer on the way down, as the first version of the zoom work
# did. Under capture the eventual click is retargeted to the capturing window,
# so it never reaches the marker button inside it — and tapping a booth marker
# is the whole of Phase 9. Panning is unaffected, so no drag assertion moves.
# Predicted 1: the tap assertion.
run_control \
  "capturing the pointer on the way down steals taps from the markers" 1 \
  "$CLIENT" \
  '      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size === 1) {' \
  '      capture(e.pointerId)
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size === 1) {'

# ── Restore and leave a correct build behind ─────────────────────────────────
echo
echo "══ Restoring and rebuilding the working tree"
restore
if build_and_start; then
  echo "  the restored tree builds and answers"
  final="$(suite_failures)"
  if [ "$final" = "0" ]; then
    echo "  the restored tree is green again"
  else
    echo "  RESTORE PROBLEM: the restored tree fails $final assertion(s)."
    FAILED=$((FAILED + 1))
  fi
else
  echo "  RESTORE PROBLEM: the restored tree does not build or answer."
  FAILED=$((FAILED + 1))
fi

echo
echo "────────────────────────────────────────────────────────────"
echo "  Controls caught as predicted: $PASSED   problems: $FAILED"
echo "────────────────────────────────────────────────────────────"
exit $([ "$FAILED" -eq 0 ] && echo 0 || echo 1)
