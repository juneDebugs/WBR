#!/usr/bin/env bash
# Phase 10 — negative controls.
#
# A green suite proves nothing until the suite has been shown to go red. Each
# control below deliberately breaks ONE shipped behaviour and requires the suite
# to fail BY THE NUMBER OF ASSERTIONS PREDICTED IN ADVANCE. A control caught by
# the wrong number is a finding, not a pass: it means the suite is measuring
# something other than what it claims.
#
# Five gates, the same as Phases 8 and 9:
#   1. the edit must actually apply       (verified by re-reading the file)
#   2. the build must succeed
#   3. the app must be answering
#   4. the suite must be caught           (increase > 0)
#   5. caught by the PREDICTED amount     (increase == prediction)
#
# ── One difference from Phases 8 and 9, and the reason for it ────────────────
#
# Those scripts compare against zero, because their suites are reliably green.
# This one is not: Phase 10 carries a known, unexplained fault where the
# participant app's server intermittently keeps serving old data after a change
# — measured as either under 20 milliseconds or still stale after 5 seconds,
# never in between. It costs the suite 0 to 3 assertions on any given run.
#
# Judging a control against a fixed number would therefore fail at random and
# teach nobody anything. So each control measures a BASELINE with the tree
# intact, immediately before breaking it, and judges the INCREASE. That is
# honest about the flake rather than pretending it is absent, and it keeps the
# prediction meaningful: the increase is caused by the break and nothing else.
#
# The cost is one extra suite run per control. Allow roughly six minutes each.
#
# Usage: bash docs/smoketests/playwright/phase-10-negative-controls.sh
# Restores every file and leaves a correct build behind, even on failure.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

IMAGE_ROUTE="apps/attendee/app/api/data/map/[id]/image/route.ts"
MAP_DATA="apps/attendee/lib/floor-plan-data.ts"
REVALIDATE="apps/attendee/app/api/revalidate/route.ts"
EVENTS="apps/attendee/lib/floor-plan-events.ts"
UPLOAD="apps/web/app/api/floor-plan/maps/route.ts"
SUITE="docs/smoketests/playwright/phase-10-admin-map-upload.mjs"

WORK="${TMPDIR:-/tmp}/phase10-controls"
mkdir -p "$WORK"

cp "$IMAGE_ROUTE" "$WORK/image-route.orig"
cp "$MAP_DATA"    "$WORK/map-data.orig"
cp "$REVALIDATE"  "$WORK/revalidate.orig"
cp "$EVENTS"      "$WORK/events.orig"
cp "$UPLOAD"      "$WORK/upload.orig"

restore() {
  cp "$WORK/image-route.orig" "$IMAGE_ROUTE"
  cp "$WORK/map-data.orig"    "$MAP_DATA"
  cp "$WORK/revalidate.orig"  "$REVALIDATE"
  cp "$WORK/events.orig"      "$EVENTS"
  cp "$WORK/upload.orig"      "$UPLOAD"
}
trap 'echo; echo "Restoring the working tree."; restore; rebuild_both >/dev/null 2>&1; echo "Done."' EXIT

# Edits are made with node and the replacement is passed as an argument, so a $
# or & inside it is data rather than a substitution. Phase 6.5 lost a cycle to
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
    if (!fs.readFileSync(file, "utf8").includes(replace)) { console.error("EDIT DID NOT STICK"); process.exit(3) }
  ' "$file" "$find" "$replace"
}

stop_port() {
  local port="$1" pids attempt
  for attempt in 1 2 3; do
    pids="$(lsof -ti:"$port" 2>/dev/null)"
    [ -z "$pids" ] && return 0
    echo "$pids" | xargs kill 2>/dev/null
    sleep 2
  done
  [ -z "$(lsof -ti:"$port" 2>/dev/null)" ]
}

# $1 = app directory name, $2 = port
build_and_start() {
  local app="$1" port="$2"
  stop_port "$port" || { echo "  GATE 3 FAILED: port $port could not be freed."; return 1; }

  if ! (cd "apps/$app" && npx next build > "$WORK/build-$app.log" 2>&1); then
    echo "  GATE 2 FAILED: the $app build did not succeed."
    tail -12 "$WORK/build-$app.log" | sed 's/^/    /'
    return 1
  fi

  # Next persists the cached map read to disk, so it survives a restart. Without
  # this a control that changes the map response would be judged against the
  # previous response. Recorded in the Phase 8 handoff as the costliest trap.
  [ "$app" = "attendee" ] && rm -rf apps/attendee/.next/cache/fetch-cache

  (cd "apps/$app" && npx next start -p "$port" > "$WORK/server-$app.log" 2>&1) &
  echo $! > "$WORK/server-$app.pid"
  sleep 1

  curl --silent --retry 40 --retry-delay 1 --retry-connrefused --output /dev/null \
    --write-out "" "http://localhost:$port/login"
  local http
  http="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:$port/login")"
  if [ "$http" != "200" ]; then
    echo "  GATE 3 FAILED: $app is not answering (login page returned $http)."
    tail -8 "$WORK/server-$app.log" | sed 's/^/    /'
    return 1
  fi

  # The process holding the port must be ours, or the suite would be judging a
  # build this run did not make. Same check and reason as Phase 8's.
  local listener parent depth owned server_pid
  server_pid="$(cat "$WORK/server-$app.pid" 2>/dev/null)"
  listener="$(lsof -ti:"$port" 2>/dev/null | head -1)"
  [ -z "$listener" ] && { echo "  GATE 3 FAILED: nothing is listening on $port."; return 1; }
  owned=0; parent="$listener"; depth=0
  while [ -n "$parent" ] && [ "$parent" != "1" ] && [ "$depth" -lt 8 ]; do
    if [ "$parent" = "$server_pid" ]; then owned=1; break; fi
    parent="$(ps -o ppid= -p "$parent" 2>/dev/null | tr -d ' ')"
    depth=$((depth + 1))
  done
  if [ "$owned" -ne 1 ]; then
    echo "  GATE 3 FAILED: port $port is held by pid $listener, not a child of our $server_pid."
    return 1
  fi
  return 0
}

rebuild_both() {
  build_and_start attendee 3001
  build_and_start web 3000
}

# Both apps must be answering before any measurement, not just the one this
# control breaks.
#
# The first version of this script started only the app it was editing. The
# other app's server was left over from an earlier control, and when it went
# away every later suite run died on "connect ECONNREFUSED ::1:3000" — reporting
# a single failure and never reaching the sections being measured. Control 5
# then read as "the suite did not get worse", which looked like a finding about
# the suite and was actually a finding about this script.
#
# Starts whichever app is not answering, without rebuilding one that is.
ensure_both_up() {
  local port app http
  for pair in "attendee 3001" "web 3000"; do
    app="${pair%% *}"; port="${pair##* }"
    http="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "http://localhost:$port/login" 2>/dev/null)"
    if [ "$http" != "200" ]; then
      echo "  $app on $port is not answering (got ${http:-nothing}) — starting it"
      build_and_start "$app" "$port" || return 1
    fi
  done
  return 0
}

# Prints the NAME of each failing assertion, one per line, sorted. Empty output
# with a readable result line means nothing failed.
#
# Names rather than a count, and this was learned the hard way. Judging by count
# compares two numbers that both contain noise: this suite carries a known
# intermittent fault, so a control that genuinely broke three assertions read as
# an increase of two when an unrelated flake happened to fail in the baseline
# and not afterwards. Every one of the five predictions was correct and two were
# marked wrong.
#
# Comparing the SETS makes the flake irrelevant. A name that fails in both runs
# is noise and cancels; only names that appear after the break are attributed to
# it.
suite_failures() {
  local out lines
  out="$(node "$SUITE" 2>&1)"
  echo "$out" >> "$WORK/all-suite-runs.log"
  echo "$out" > "$WORK/last-suite.log"
  # A run that could not reach an app measured nothing. Treated as no result, so
  # the gate fails loudly instead of a connection error being counted as though
  # it were an assertion about the product.
  if echo "$out" | grep -q "ECONNREFUSED"; then echo "__UNREADABLE__"; return 0; fi
  lines="$(echo "$out" | grep -cE 'Results: [0-9]+ passed, [0-9]+ failed')"
  if [ "$lines" -ne 1 ]; then echo "__UNREADABLE__"; return 0; fi
  # Everything before the em dash is the assertion name; the detail after it can
  # differ between runs for the same assertion.
  echo "$out" | grep -E '^  ✗' | sed 's/^  ✗ //; s/ — .*$//' | sort -u
}

PASSED=0
FAILED=0

# $1 predicted count, $2 file of baseline names, $3 file of after names
judge() {
  local predicted="$1" basefile="$2" afterfile="$3"
  if grep -q "__UNREADABLE__" "$basefile" "$afterfile" 2>/dev/null; then
    echo "  GATE 4 FAILED: a run produced no readable result, so nothing can be compared."
    FAILED=$((FAILED + 1)); return
  fi

  local newly; newly="$(comm -13 "$basefile" "$afterfile")"
  local count; count="$(printf '%s' "$newly" | grep -c . )"

  local alsoflaky; alsoflaky="$(comm -12 "$basefile" "$afterfile" | grep -c . )"
  [ "$alsoflaky" -gt 0 ] && echo "  ($alsoflaky assertion(s) failed in BOTH runs — unrelated to this break, ignored)"

  if [ "$count" -eq 0 ]; then
    echo "  GATE 4 FAILED: no assertion started failing. The suite does not measure this."
    FAILED=$((FAILED + 1)); return
  fi
  echo "  newly failing:"
  printf '%s\n' "$newly" | sed 's/^/      /'
  if [ "$count" -ne "$predicted" ]; then
    echo "  GATE 5 FAILED: $count assertion(s) started failing, predicted $predicted."
    echo "                 A prediction adjusted after seeing the result is not a prediction."
    FAILED=$((FAILED + 1)); return
  fi
  echo "  PASS — caught by exactly $count assertion(s), as predicted"
  PASSED=$((PASSED + 1))
}

# An optional first argument to the script filters which controls run, by
# substring of the name. Added so a retargeted control can be re-verified on its
# own; a full pass rebuilds ten times and takes half an hour.
ONLY="${1:-}"

# $1 name, $2 predicted, $3 file, $4 app, $5 port, $6 find, $7 replace
run_control() {
  local name="$1" predicted="$2" file="$3" app="$4" port="$5" find="$6" replace="$7"
  if [ -n "$ONLY" ] && [[ "$name" != *"$ONLY"* ]]; then return; fi
  echo; echo "══ CONTROL: $name"
  echo "   prediction: the suite fails by exactly $predicted MORE assertion(s)"

  # Restoring the SOURCE is not enough: the other app keeps SERVING the previous
  # control's broken build until it is rebuilt. Measured — control 2's break was
  # still live in the participant app through controls 3, 4 and 5, so their
  # baselines carried three failures that had nothing to do with them.
  restore
  if ! rebuild_both; then FAILED=$((FAILED + 1)); return; fi
  echo "  measuring the baseline with the tree intact…"
  suite_failures > "$WORK/baseline.txt"
  echo "  baseline: $(grep -c . "$WORK/baseline.txt") failing assertion(s)"

  if ! apply "$file" "$find" "$replace"; then
    echo "  GATE 1 FAILED: the edit did not apply."; FAILED=$((FAILED + 1)); return
  fi
  echo "  gate 1 ok — the edit applied"

  if ! build_and_start "$app" "$port"; then FAILED=$((FAILED + 1)); return; fi
  if ! ensure_both_up; then echo "  GATE 3 FAILED: both apps could not be brought up."; FAILED=$((FAILED + 1)); return; fi
  suite_failures > "$WORK/after.txt"
  judge "$predicted" "$WORK/baseline.txt" "$WORK/after.txt"
  restore
}

echo "Phase 10 negative controls — five controls, each rebuilding an app twice."
echo "Expect roughly half an hour."

# ── 1 ────────────────────────────────────────────────────────────────────────
# The image address is scoped to the active conference so it cannot serve a map
# /api/data/map would never list. Round 1 of the adversarial review found it
# unscoped. Removing the scope again must be caught by section 10's two
# assertions: the refusal itself, and the one confirming the bytes were withheld.
run_control "the image address serves any conference's map" 2 \
  "$IMAGE_ROUTE" attendee 3001 \
  'where: { id, conferenceId: conference.id },' \
  'where: { id },'

# ── 2 ────────────────────────────────────────────────────────────────────────
# The substitution fires only for a stored value beginning "data:", which is why
# seeded maps keep their file paths and Phases 8 and 9 were unaffected. Making it
# unconditional must be caught by the three seeded-map assertions in section 1 —
# one per seeded map — and by nothing else, because an uploaded map's address is
# unchanged.
run_control "every map is rewritten to the image address, not just uploads" 3 \
  "$MAP_DATA" attendee 3001 \
  "return map.imageUrl.startsWith('data:') ? \`/api/data/map/\${map.id}/image\` : map.imageUrl" \
  "return \`/api/data/map/\${map.id}/image\`"

# ── 3 ────────────────────────────────────────────────────────────────────────
# A PDF is answered before the general "not an image" case so the organizer is
# told what to do rather than only that something was wrong. Removing that branch
# still refuses the upload — the general case catches it — so the status
# assertion keeps passing and exactly ONE fails: the one that reads the message.
# That is the point of having both.
run_control "a PDF is refused without being told what to do instead" 1 \
  "$UPLOAD" web 3000 \
  'const looksLikePdf = declaredType === '"'"'application/pdf'"'"' || decoded.subarray(0, 5).toString('"'"'ascii'"'"') === '"'"'%PDF-'"'"'' \
  'const looksLikePdf = false'

# ── 4 ────────────────────────────────────────────────────────────────────────
# Round 2 found the write addresses checking only the caller's ROLE, so a role
# with the floor-plan permission revoked could still upload. Removing the
# permission check from the upload handler must be caught twice in section 11:
# the refusal itself, and the assertion that nothing was created.
run_control "uploading ignores the floor-plan permission" 2 \
  "$UPLOAD" web 3000 \
  '  if (!(await roleHasPermission(me.role, '"'"'floorPlan'"'"'))) {
    return NextResponse.json({ error: '"'"'Forbidden'"'"' }, { status: 403 })
  }

  // ── The size check comes BEFORE reading the body' \
  '  // ── The size check comes BEFORE reading the body'

# ── 5 ────────────────────────────────────────────────────────────────────────
# The push is what makes a change appear on a phone nobody is touching. Stopping
# delivery leaves the 30-second safety net, which is slower than section 12's
# 20-second wait — so the map never appears within the window. Two assertions:
# the appearance itself, and the one distinguishing the push from the safety net,
# which cannot run once nothing appeared.
#
# ── Retargeted 2026-08-02, and the reason matters ────────────────────────────
#
# This first broke the CALLER, replacing `listenersOnThisInstance = publish()`
# with `= 0`. That stopped delivery AND zeroed the count the revalidate response
# reports, so it also failed "opening map screens adds connections" — three
# assertions, not two. The prediction was not wrong; the control was, because it
# broke two behaviours while claiming to break one.
#
# It now breaks delivery inside publish() and leaves the count truthful, so the
# control isolates exactly the behaviour its name describes. The prediction
# stays at 2 because the control was narrowed, not because the number was
# adjusted to fit the result.
run_control "nothing is pushed to the open connections" 2 \
  "$EVENTS" attendee 3001 \
  'for (const listener of set) {' \
  'for (const listener of []) {'

echo
echo "════════════════════════════════════════════════════════════"
echo "  Controls passed: $PASSED    failed: $FAILED"
echo "════════════════════════════════════════════════════════════"
[ "$FAILED" -eq 0 ]
