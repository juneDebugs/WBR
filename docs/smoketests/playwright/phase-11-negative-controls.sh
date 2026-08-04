#!/usr/bin/env bash
# Phase 11 — negative controls.
#
# A green suite proves nothing until it has been shown to go red. Each control
# below breaks ONE shipped behaviour on purpose and requires the suite to fail by
# the number of assertions PREDICTED IN ADVANCE, in this file, before any of them
# ran. A control caught by the wrong number is a finding rather than a pass: it
# means the suite measures something other than what it claims.
#
# Five gates, carried forward from Phases 8, 9 and 10:
#   1. the edit must actually apply       (verified by re-reading the file)
#   2. the build must succeed
#   3. the app must be answering, and the port must be held by OUR process
#   4. the suite must be caught           (increase > 0)
#   5. caught by the PREDICTED amount     (increase == prediction)
#
# ── Two differences from Phase 10's script ──────────────────────────────────
#
# Only the admin app is rebuilt. Phase 11 changes no participant-app file, so
# that app is started if it is not answering and otherwise left alone. Phase 10
# had to rebuild both, and its first version rebuilt only the app it edited —
# which left an earlier control's break live through three later controls and
# produced four false verdicts.
#
# The baseline is still measured per control, even though this suite has no known
# intermittent fault. It is doing a second job: a non-empty baseline after a
# restore means the PREVIOUS control's break is still live, which is exactly the
# fault that cost Phase 10 those four verdicts. It is a check on this script.
#
# Usage:
#   bash docs/smoketests/playwright/phase-11-negative-controls.sh
#   bash docs/smoketests/playwright/phase-11-negative-controls.sh "coerce"   # one control
#
# Restores every file and leaves a correct build behind, even on failure.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

IMAGE_ROUTE="apps/web/app/api/floor-plan/maps/[id]/image/route.ts"
PINS_ROUTE="apps/web/app/api/floor-plan/maps/[id]/pins/route.ts"
PIN_ROUTE="apps/web/app/api/floor-plan/maps/[id]/pins/[pinId]/route.ts"
PIN_INPUT="apps/web/lib/pin-input.ts"
CLIENT="apps/web/components/FloorPlanClient.tsx"
SUITE="docs/smoketests/playwright/phase-11-admin-pin-authoring.mjs"

WORK="${TMPDIR:-/tmp}/phase11-controls"
mkdir -p "$WORK"
: > "$WORK/all-suite-runs.log"

cp "$IMAGE_ROUTE" "$WORK/image-route.orig"
cp "$PINS_ROUTE"  "$WORK/pins-route.orig"
cp "$PIN_ROUTE"   "$WORK/pin-route.orig"
cp "$PIN_INPUT"   "$WORK/pin-input.orig"
cp "$CLIENT"      "$WORK/client.orig"

restore() {
  cp "$WORK/image-route.orig" "$IMAGE_ROUTE"
  cp "$WORK/pins-route.orig"  "$PINS_ROUTE"
  cp "$WORK/pin-route.orig"   "$PIN_ROUTE"
  cp "$WORK/pin-input.orig"   "$PIN_INPUT"
  cp "$WORK/client.orig"      "$CLIENT"
}
# ── The restore reports its own verdict, and fails closed ─────────────────────
#
# Raised by adversarial review round 5. This used to be
#   restore; build_and_start_web >/dev/null 2>&1; echo "Done."
# which threw away both the rebuild's output and its exit code and then printed
# "Done." either way. So a restore-time build or start failure was invisible: the
# script could exit successfully, after every control passed, while leaving the
# admin app down or still serving the build made from deliberately broken source.
#
# That is exactly the fault this script exists to detect in the product, present in
# the script itself — and it is not hypothetical here. A control run killed partway
# through cleanup on 2026-08-03 left the admin app serving a broken build, and only a
# separate build-freshness check noticed.
#
# `build_and_start_web` already gates on the build succeeding, on the app answering
# on 3000, and on the listening process being the one this run started. All that was
# needed was to stop discarding its answer.
cleanup_on_exit() {
  local rc=$?
  echo
  echo "Restoring the working tree and leaving a correct build."
  restore
  if build_and_start_web; then
    echo "Done — source restored, admin app rebuilt from it and answering on 3000."
  else
    echo
    echo "  RESTORE INCOMPLETE. The source files were put back, but the admin app"
    echo "  could not be rebuilt and verified on port 3000. Any measurement taken"
    echo "  against localhost:3000 from here is untrustworthy until"
    echo "  'cd apps/web && npx next build' succeeds and the app is restarted."
    [ "$rc" -eq 0 ] && rc=1
  fi
  exit "$rc"
}
trap cleanup_on_exit EXIT

# Edits are made with node and the replacement is passed as an argument, so a $
# or & inside it is data rather than a substitution. Phase 6.5 lost a cycle to
# Perl expanding one.
apply() {
  local file="$1" find="$2" replace="$3"
  node -e '
    const fs = require("fs")
    const [file, find, replace] = process.argv.slice(1)
    const before = fs.readFileSync(file, "utf8")
    const hits = before.split(find).length - 1
    if (hits === 0) { console.error("ANCHOR NOT FOUND"); process.exit(3) }
    if (hits > 1) { console.error(`ANCHOR MATCHES ${hits} TIMES — too vague to be a single break`); process.exit(3) }
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

build_and_start_web() {
  stop_port 3000 || { echo "  GATE 3 FAILED: port 3000 could not be freed."; return 1; }

  if ! (cd apps/web && npx next build > "$WORK/build-web.log" 2>&1); then
    echo "  GATE 2 FAILED: the admin build did not succeed."
    tail -12 "$WORK/build-web.log" | sed 's/^/    /'
    return 1
  fi

  (cd apps/web && npx next start -p 3000 > "$WORK/server-web.log" 2>&1) &
  echo $! > "$WORK/server-web.pid"
  sleep 1

  curl --silent --retry 40 --retry-delay 1 --retry-connrefused --output /dev/null \
    --write-out "" "http://localhost:3000/login"
  local http
  http="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:3000/login")"
  if [ "$http" != "200" ]; then
    echo "  GATE 3 FAILED: the admin app is not answering (login returned $http)."
    tail -8 "$WORK/server-web.log" | sed 's/^/    /'
    return 1
  fi

  # The process holding the port must be ours, or the suite would be judging a
  # build this run did not make. Same check and reason as Phases 8 and 10.
  local listener parent depth owned server_pid
  server_pid="$(cat "$WORK/server-web.pid" 2>/dev/null)"
  listener="$(lsof -ti:3000 2>/dev/null | head -1)"
  [ -z "$listener" ] && { echo "  GATE 3 FAILED: nothing is listening on 3000."; return 1; }
  owned=0; parent="$listener"; depth=0
  while [ -n "$parent" ] && [ "$parent" != "1" ] && [ "$depth" -lt 8 ]; do
    if [ "$parent" = "$server_pid" ]; then owned=1; break; fi
    parent="$(ps -o ppid= -p "$parent" 2>/dev/null | tr -d ' ')"
    depth=$((depth + 1))
  done
  if [ "$owned" -ne 1 ]; then
    echo "  GATE 3 FAILED: port 3000 is held by pid $listener, not a child of our $server_pid."
    return 1
  fi
  return 0
}

# The participant app is never rebuilt here, because Phase 11 changes no file in
# it. Started only if it is not answering. Its cached map read is cleared first,
# because Next persists that cache to disk and it survives a restart — recorded in
# the Phase 8 handoff as the costliest trap in this area.
ensure_attendee_up() {
  local http
  http="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 "http://localhost:3001/login" 2>/dev/null)"
  if [ "$http" = "200" ]; then return 0; fi
  echo "  the participant app on 3001 is not answering (got ${http:-nothing}) — starting it"
  stop_port 3001 || return 1
  rm -rf apps/attendee/.next/cache/fetch-cache
  (cd apps/attendee && ./node_modules/.bin/next start -p 3001 > "$WORK/server-attendee.log" 2>&1) &
  sleep 1
  curl --silent --retry 40 --retry-delay 1 --retry-connrefused --output /dev/null \
    --write-out "" "http://localhost:3001/login"
  http="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://localhost:3001/login")"
  [ "$http" = "200" ]
}

# Prints the NAME of each failing assertion, one per line, sorted.
#
# Names rather than a count. Judging by count compares two numbers that both
# contain noise, and Phase 10 marked two correct predictions wrong that way.
# Comparing the SETS makes any flake irrelevant: a name failing in both runs
# cancels, and only names that appear after the break are attributed to it.
suite_failures() {
  local out lines
  out="$(node "$SUITE" 2>&1)"
  { echo "───── $(date '+%H:%M:%S') ─────"; echo "$out"; } >> "$WORK/all-suite-runs.log"
  echo "$out" > "$WORK/last-suite.log"
  if echo "$out" | grep -q "ECONNREFUSED"; then echo "__UNREADABLE__"; return 0; fi
  lines="$(echo "$out" | grep -cE 'Results: [0-9]+ passed, [0-9]+ failed')"
  if [ "$lines" -ne 1 ]; then echo "__UNREADABLE__"; return 0; fi
  echo "$out" | grep -E '^  ✗' | sed 's/^  ✗ //; s/ — .*$//' | sort -u
}

PASSED=0
FAILED=0

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

  local vanished; vanished="$(comm -23 "$basefile" "$afterfile" | grep -c . )"
  [ "$vanished" -gt 0 ] && echo "  WARNING: $vanished assertion(s) failed in the baseline and not after the break."

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

ONLY="${1:-}"

# Applies every find/replace pair given, stopping at the first that does not.
# Pairs rather than a single edit because one control can need more than one edit
# to reach the behaviour it is breaking — see controls 4 and 5, where a guard
# earlier in the same function answers before the code under test is reached.
apply_pairs() {
  local file="$1"; shift
  while [ "$#" -ge 2 ]; do
    apply "$file" "$1" "$2" || return 1
    shift 2
  done
  [ "$#" -eq 0 ]
}

# $1 name, $2 predicted, $3 file, then find/replace PAIRS
run_control() {
  local name="$1" predicted="$2" file="$3"; shift 3
  if [ -n "$ONLY" ] && [[ "$name" != *"$ONLY"* ]]; then return; fi
  echo; echo "══ CONTROL: $name"
  echo "   prediction: the suite fails by exactly $predicted MORE assertion(s)"

  # Restoring the SOURCE is not enough — the app keeps SERVING the previous
  # control's build until it is rebuilt.
  restore
  if ! build_and_start_web; then FAILED=$((FAILED + 1)); return; fi
  if ! ensure_attendee_up; then echo "  GATE 3 FAILED: the participant app could not be brought up."; FAILED=$((FAILED + 1)); return; fi

  echo "  measuring the baseline with the tree intact…"
  suite_failures > "$WORK/baseline.txt"
  local basecount; basecount="$(grep -c . "$WORK/baseline.txt")"
  echo "  baseline: $basecount failing assertion(s)"
  if [ "$basecount" -ne 0 ] && ! grep -q "__UNREADABLE__" "$WORK/baseline.txt"; then
    echo "  NOTE: a non-zero baseline means either a real flake or a previous break still live."
    sed 's/^/      /' "$WORK/baseline.txt"
  fi

  if ! apply_pairs "$file" "$@"; then
    echo "  GATE 1 FAILED: an edit did not apply."; FAILED=$((FAILED + 1)); return
  fi
  echo "  gate 1 ok — every edit applied"

  if ! build_and_start_web; then FAILED=$((FAILED + 1)); return; fi
  if ! ensure_attendee_up; then echo "  GATE 3 FAILED: the participant app could not be brought up."; FAILED=$((FAILED + 1)); return; fi
  suite_failures > "$WORK/after.txt"
  judge "$predicted" "$WORK/baseline.txt" "$WORK/after.txt"
  restore
}

# ── A control that must be ABSORBED rather than caught ───────────────────────
#
# The counterpart to a normal control. It breaks something and requires the suite
# to stay green, because a DIFFERENT safeguard is supposed to catch it. That is
# what makes it evidence about which safeguard is doing the work — a normal
# control can only show that something noticed, not what.
#
# It is not a weaker check. Gate 1 still proves the edit applied, so the suite
# staying green cannot be explained by nothing having changed.
#
# $1 name, $2 file, then find/replace PAIRS
run_absorbed_control() {
  local name="$1" file="$2"; shift 2
  if [ -n "$ONLY" ] && [[ "$name" != *"$ONLY"* ]]; then return; fi
  echo; echo "══ ABSORBED CONTROL: $name"
  echo "   prediction: the suite stays green, because another safeguard catches this"

  restore
  if ! build_and_start_web; then FAILED=$((FAILED + 1)); return; fi
  if ! ensure_attendee_up; then echo "  GATE 3 FAILED: the participant app could not be brought up."; FAILED=$((FAILED + 1)); return; fi

  echo "  measuring the baseline with the tree intact…"
  suite_failures > "$WORK/baseline.txt"
  echo "  baseline: $(grep -c . "$WORK/baseline.txt") failing assertion(s)"

  if ! apply_pairs "$file" "$@"; then
    echo "  GATE 1 FAILED: an edit did not apply."; FAILED=$((FAILED + 1)); return
  fi
  echo "  gate 1 ok — every edit applied"

  if ! build_and_start_web; then FAILED=$((FAILED + 1)); return; fi
  if ! ensure_attendee_up; then echo "  GATE 3 FAILED: the participant app could not be brought up."; FAILED=$((FAILED + 1)); return; fi
  suite_failures > "$WORK/after.txt"

  if grep -q "__UNREADABLE__" "$WORK/baseline.txt" "$WORK/after.txt" 2>/dev/null; then
    echo "  GATE 4 FAILED: a run produced no readable result."; FAILED=$((FAILED + 1)); restore; return
  fi
  local newly; newly="$(comm -13 "$WORK/baseline.txt" "$WORK/after.txt")"
  local count; count="$(printf '%s' "$newly" | grep -c . )"
  if [ "$count" -ne 0 ]; then
    echo "  FAILED: $count assertion(s) started failing, so the break was NOT absorbed:"
    printf '%s\n' "$newly" | sed 's/^/      /'
    FAILED=$((FAILED + 1)); restore; return
  fi
  echo "  PASS — the suite stayed green, so the other safeguard is what catches this"
  PASSED=$((PASSED + 1))
  restore
}

echo "Phase 11 negative controls — nine controls (eight caught, one absorbed), each rebuilding the admin app twice."
echo "Expect roughly an hour."

# ── 1 ────────────────────────────────────────────────────────────────────────
# The picture address carries the floor-plan permission key, like the three
# marker addresses. Phase 10's review round 2 found its three sibling addresses
# checking only the caller's role. Removing the key check must be caught by the
# one assertion that asks a role without it for a picture.
run_control "the picture address ignores the floor-plan permission" 1 \
  "$IMAGE_ROUTE" \
  "  if (!(await roleHasPermission(me.role, 'floorPlan'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params" \
  "  const { id } = await params"

# ── 2 ────────────────────────────────────────────────────────────────────────
# The picture lookup is scoped to the active conference, so it cannot serve a map
# the organizer's own screen would never list. Round 1 of Phase 10's review found
# the participant equivalent unscoped.
run_control "the picture address serves any conference's map" 1 \
  "$IMAGE_ROUTE" \
  "    where: { id, conferenceId: conference.id },
    select: { imageUrl: true }," \
  "    where: { id },
    select: { imageUrl: true },"

# ── 3 ────────────────────────────────────────────────────────────────────────
# Round 1's medium finding. Number() coerces null, [], true, "  ", "50" and [50]
# into positions nobody sent. Three assertions cover it: the null case, the group
# of five other shapes, and the count proving nothing was written.
run_control "positions are coerced from null, lists and booleans again" 3 \
  "$PIN_INPUT" \
  "  if (typeof raw !== 'number' || !Number.isFinite(raw)) {" \
  "  if (!Number.isFinite(Number(raw))) {"

# ── 4 and 5, RETARGETED after the first run ─────────────────────────────────
#
# The first version of these two predicted one failure each, from breaking only
# the conditional write. Control 5 reported GATE 4 — nothing started failing —
# and control 4 reported the wrong two assertions. Both verdicts were correct and
# the predictions were wrong, for one reason:
#
#   resolve() looks the marker up and returns 404 for a missing one BEFORE either
#   write is reached. So the sequential cases the suite exercises — deleting the
#   same marker twice, moving one that has been deleted — are answered by that
#   guard, not by the conditional write. Removing the conditional write changes
#   nothing either assertion can see.
#
# The window the conditional write actually closes is a row disappearing BETWEEN
# resolve() and the write. That is a genuine concurrent race and it is unreachable
# on this machine, where SQLite permits one writer at a time.
#
# So the pair below tests what can be tested, and says which safeguard does what.
# Control 4 removes BOTH guards, which is the only way to reach the write with a
# marker that is gone. Control 5 removes only the first, and requires the suite to
# stay GREEN — which is what shows the conditional write is carrying the weight.

# ── 4 ────────────────────────────────────────────────────────────────────────
# Three assertions see it. Two are the 404-not-500 pair. The third is a surprise
# the first run did not predict and is worth keeping: with both guards gone,
# naming an existing marker against a map it is not on UPDATES ANOTHER
# CONFERENCE'S MARKER, because the write no longer carries the map condition.
run_control "a vanished marker is not noticed at all" 3 \
  "$PIN_ROUTE" \
  "  if (!pin) {
    return { refusal: NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 }) }
  }" \
  "  const pin2 = pin ?? { id: pinId, type: 'ROOM', x: 0, y: 0, sponsorId: null, label: 'control' }
  if (!pin2) {
    return { refusal: NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 }) }
  }" \
  "  return { conferenceId: conference.id, mapId: map.id, pin }" \
  "  return { conferenceId: conference.id, mapId: map.id, pin: pin2 }" \
  "  const removed = await prisma.pin.deleteMany({ where: { id: pin.id, venueMapId: mapId } })
  if (removed.count === 0) {
    return NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 })
  }" \
  "  await prisma.pin.delete({ where: { id: pin.id } })" \
  "  const applied = await prisma.pin.updateMany({
    where: { id: pin.id, venueMapId: mapId },
    data: changes,
  })
  if (applied.count === 0) {
    return NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 })
  }" \
  "  await prisma.pin.update({ where: { id: pin.id }, data: changes })"

# ── 5 ────────────────────────────────────────────────────────────────────────
# The counterpart. Only resolve()'s guard is removed; the conditional writes stay.
# Every one of the three cases above must now be caught by the write instead, so
# the suite stays green. That is the evidence that the conditional write does the
# work — which control 4 on its own cannot show, because it removes both.
run_absorbed_control "the conditional write catches a marker that vanished" \
  "$PIN_ROUTE" \
  "  if (!pin) {
    return { refusal: NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 }) }
  }" \
  "  const pin2 = pin ?? { id: pinId, type: 'ROOM', x: 0, y: 0, sponsorId: null, label: 'control' }
  if (!pin2) {
    return { refusal: NextResponse.json({ error: 'That marker no longer exists.' }, { status: 404 }) }
  }" \
  "  return { conferenceId: conference.id, mapId: map.id, pin }" \
  "  return { conferenceId: conference.id, mapId: map.id, pin: pin2 }"

# ── 6 ────────────────────────────────────────────────────────────────────────
# Round 1's high finding. A local edit shadowing the server forever, which hid
# every later change another organizer made.
run_control "a local edit shadows the server forever" 1 \
  "$CLIENT" \
  "    return override && override.basedOn === map.pins ? override.pins : map.pins" \
  "    return override ? override.pins : map.pins"

# ── 7 ────────────────────────────────────────────────────────────────────────
# The criterion the cache can silently break. Without the invalidation the marker
# is saved, the organizer's screen is correct, and delegates keep the old map for
# up to five minutes — which during a demonstration reads as the save having
# failed. Four assertions: the marker not arriving, and the three about its
# contents that cannot then be checked.
run_control "nothing tells the delegate a marker was placed" 4 \
  "$PINS_ROUTE" \
  "  await revalidateAttendeeFloorPlan('floor-plan/pins POST')" \
  "  // negative control: the invalidation is removed"

# ── 8 ────────────────────────────────────────────────────────────────────────
# Creating a marker is scoped to the active conference. Phase 10's review found a
# fix applied to one of two symmetrical paths and missed on the other, so all
# three marker verbs carry the boundary and each is controlled.
run_control "creating a marker ignores the conference boundary" 1 \
  "$PINS_ROUTE" \
  "    where: { id: venueMapId, conferenceId: conference.id },
    select: { id: true }," \
  "    where: { id: venueMapId },
    select: { id: true },"

# ── 9 ────────────────────────────────────────────────────────────────────────
# A booth marker with neither a company nor a typed name would sit on the
# organizer's screen and be invisible to every delegate, because the participant
# app drops any marker with no name to show. The screen refuses it in the browser
# too, so this is caught only by the assertion that asks the ADDRESS — which was
# added while designing these controls, having been missing.
run_control "a booth can be saved with no company and no name" 1 \
  "$PIN_INPUT" \
  "  if (!sponsorId.value && !label.value) {
    return { ok: false, error: 'Choose the company at this booth, or type a name for the marker.' }
  }" \
  "  if (false) {
    return { ok: false, error: 'negative control: rule removed' }
  }"

echo
echo "════════════════════════════════════════════════════════════"
echo "  Controls: $PASSED caught as predicted, $FAILED not"
echo "════════════════════════════════════════════════════════════"
echo
echo "  Every suite run is in $WORK/all-suite-runs.log"
echo
[ "$FAILED" -eq 0 ] || exit 1
