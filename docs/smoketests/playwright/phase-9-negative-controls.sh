#!/usr/bin/env bash
# Phase 9 — negative controls.
#
# A green suite proves nothing until the suite has been shown to go red. Each
# control below deliberately breaks ONE shipped behaviour and requires the
# relevant suite to fail BY THE NUMBER OF ASSERTIONS PREDICTED IN ADVANCE. A
# control caught by the wrong number is a finding, not a pass: it means the
# suite is measuring something other than what it claims.
#
# Same five gates as Phase 8's controls:
#   1. the edit must actually apply       (verified by re-reading the file)
#   2. the build must succeed             (browser controls only)
#   3. the app must be answering          (browser controls only)
#   4. the suite must be caught           (failures > 0)
#   5. caught by the PREDICTED amount     (failures == prediction)
#
# ── Two groups, because two suites ───────────────────────────────────────────
#
# The data controls break packages/db/prisma/seed-sponsors.ts and are judged by
# scripts/test-booth-card-data.mjs. They need no build and no server, so they
# run in seconds.
#
# The browser controls break the card component and are judged by
# docs/smoketests/playwright/phase-9-booth-company-card.mjs. Each one rebuilds
# and restarts the participant app; allow roughly two minutes each.
#
# Usage: bash docs/smoketests/playwright/phase-9-negative-controls.sh
# Restores every file and leaves a correct build behind, even on failure.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

CLIENT="apps/attendee/components/map/FloorPlanClient.tsx"
SEEDDEFS="packages/db/prisma/seed-sponsors.ts"
BROWSER_SUITE="docs/smoketests/playwright/phase-9-booth-company-card.mjs"
DATA_SUITE="scripts/test-booth-card-data.mjs"
WORK="${TMPDIR:-/tmp}/phase9-controls"
mkdir -p "$WORK"

cp "$CLIENT" "$WORK/FloorPlanClient.tsx.orig"
cp "$SEEDDEFS" "$WORK/seed-sponsors.ts.orig"

restore() {
  cp "$WORK/FloorPlanClient.tsx.orig" "$CLIENT"
  cp "$WORK/seed-sponsors.ts.orig" "$SEEDDEFS"
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

stop_server() {
  local pids attempt
  for attempt in 1 2 3; do
    pids="$(lsof -ti:3001 2>/dev/null)"
    [ -z "$pids" ] && return 0
    echo "$pids" | xargs kill 2>/dev/null
    sleep 2
  done
  [ -z "$(lsof -ti:3001 2>/dev/null)" ]
}

build_and_start() {
  stop_server || { echo "  GATE 3 FAILED: port 3001 could not be freed."; return 1; }

  if ! (cd apps/attendee && npx next build > "$WORK/build.log" 2>&1); then
    echo "  GATE 2 FAILED: the build did not succeed."
    tail -12 "$WORK/build.log" | sed 's/^/    /'
    return 1
  fi

  # The map read is cached for 300 seconds under a tag nothing invalidates yet,
  # and Next persists that cache to disk, so it survives a restart. Without this
  # a control that changes the map response would be judged against the previous
  # response. Recorded in the Phase 8 handoff as the trap that cost the most time.
  rm -rf apps/attendee/.next/cache/fetch-cache

  (cd apps/attendee && npx next start -p 3001 > "$WORK/server.log" 2>&1) &
  echo $! > "$WORK/server.pid"
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

  # The process holding the port must be ours, or the suite would be judging a
  # build this run did not make. Same check and same reason as Phase 8's.
  local listener parent depth owned
  listener="$(lsof -ti:3001 2>/dev/null | head -1)"
  [ -z "$listener" ] && { echo "  GATE 3 FAILED: nothing is listening on 3001."; return 1; }
  owned=0; parent="$listener"; depth=0
  while [ -n "$parent" ] && [ "$parent" != "1" ] && [ "$depth" -lt 8 ]; do
    if [ "$parent" = "$server_pid" ]; then owned=1; break; fi
    parent="$(ps -o ppid= -p "$parent" 2>/dev/null | tr -d ' ')"
    depth=$((depth + 1))
  done
  if [ "$owned" -ne 1 ]; then
    echo "  GATE 3 FAILED: port 3001 is held by pid $listener, not a child of our $server_pid."
    return 1
  fi
  return 0
}

# Prints the failure count, or nothing if the suite did not report EXACTLY ONE
# result line. Ambiguous output is treated as no result, which fails the gate
# loudly rather than feeding two numbers into a numeric comparison.
suite_failures() {
  local suite="$1" out lines
  out="$(node "$suite" 2>&1)"
  echo "$out" > "$WORK/last-suite.log"
  lines="$(echo "$out" | grep -cE 'Results: [0-9]+ passed, [0-9]+ failed')"
  [ "$lines" -ne 1 ] && return 0
  echo "$out" | grep -oE 'Results: [0-9]+ passed, [0-9]+ failed' \
    | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+'
}

PASSED=0
FAILED=0

judge() {
  local predicted="$1" failures="$2"
  if [ -z "$failures" ]; then
    echo "  GATE 4 FAILED: the suite did not report exactly one result line."
    FAILED=$((FAILED + 1)); return
  fi
  if [ "$failures" -eq 0 ]; then
    echo "  GATE 4 FAILED: the suite stayed green. It does not measure this."
    FAILED=$((FAILED + 1)); return
  fi
  if [ "$failures" -ne "$predicted" ]; then
    echo "  GATE 5 FAILED: caught by $failures assertion(s), predicted $predicted."
    echo "                 A prediction adjusted after seeing the result is not a prediction."
    FAILED=$((FAILED + 1)); return
  fi
  echo "  PASS — caught by exactly $failures assertion(s), as predicted"
  PASSED=$((PASSED + 1))
}

run_data_control() {
  local name="$1" predicted="$2" find="$3" replace="$4"
  echo; echo "══ DATA CONTROL: $name"
  echo "   prediction: $DATA_SUITE fails by exactly $predicted assertion(s)"
  restore
  if ! apply "$SEEDDEFS" "$find" "$replace"; then
    echo "  GATE 1 FAILED: the edit did not apply."; FAILED=$((FAILED + 1)); return
  fi
  echo "  gate 1 ok — the edit applied"
  judge "$predicted" "$(suite_failures "$DATA_SUITE")"
}

# Takes one or more find/replace PAIRS after the prediction, so a control can
# remove every safeguard protecting one behaviour. Needed because at least one
# behaviour here is protected twice, and breaking half of it changes nothing
# observable — see the map-switching control below.
run_browser_control() {
  local name="$1" predicted="$2"; shift 2
  echo; echo "══ BROWSER CONTROL: $name"
  echo "   prediction: $BROWSER_SUITE fails by exactly $predicted assertion(s)"
  restore
  while [ "$#" -ge 2 ]; do
    if ! apply "$CLIENT" "$1" "$2"; then
      echo "  GATE 1 FAILED: an edit did not apply."; FAILED=$((FAILED + 1)); return
    fi
    shift 2
  done
  echo "  gate 1 ok — every edit applied"
  if ! build_and_start; then FAILED=$((FAILED + 1)); return; fi
  echo "  gate 2 ok — the build succeeded"
  echo "  gate 3 ok — the app is answering"
  judge "$predicted" "$(suite_failures "$BROWSER_SUITE")"
}

echo "Phase 9 negative controls — the booth company card"
echo "Predictions are stated before each run and are not adjusted afterwards."

# ─────────────────────────────────────────────────────────────────────────────
# DATA CONTROLS — judged by scripts/test-booth-card-data.mjs
# ─────────────────────────────────────────────────────────────────────────────

# The seed's tagline for one company stops matching the database. Only the
# per-company tagline comparison reads it; section 1 reads the database alone,
# and the roster and layout sections do not look at taglines.
run_data_control "the seed's tagline for Shopify drifts from the database" 1 \
  "tagline: 'The commerce platform powering 2M+ merchants worldwide'" \
  "tagline: 'Making commerce better for everyone'"

# The field finding F-10 was actually about. With it gone from the create set, a
# database built from nothing has no booth numbers at all, so it has no booth
# markers and no cards. One assertion names it.
#
# This control targeted the UPDATE set until 2026-08-02. Phase 9's adversarial
# review established that the update branch must be narrow — the seed can reach
# the shared production database, and a wide update branch lets one stray run
# destroy an organizer's edits. Reproducibility now comes from the create branch,
# so that is what this control breaks. The prediction was re-derived, not
# carried over: the assertion it trips is "create writes boothNumber".
run_data_control "the seed stops writing boothNumber on create" 1 \
  "    boothNumber: s.boothNumber," \
  ""

# One offering removed from a company's list. Compared as parsed arrays, so a
# length difference is caught by the single offerings assertion for that company.
#
# The anchor is Shopify's FULL list, not a fragment of it. The obvious shorter
# fragment — its first two offerings — also appears in BigCommerce's list, and
# an edit applied to both companies would have been caught by two assertions
# against a prediction of one. Found before this ran, by counting the anchor.
run_data_control "one of Shopify's offerings goes missing from the seed" 1 \
  '"Headless Commerce","B2B Commerce","Subscription Management","AI & Automation","Payment Processing","Marketplace Integration","Analytics & Reporting"' \
  '"B2B Commerce","Subscription Management","AI & Automation","Payment Processing","Marketplace Integration","Analytics & Reporting"'

# ─────────────────────────────────────────────────────────────────────────────
# BROWSER CONTROLS — judged by the Playwright suite
# ─────────────────────────────────────────────────────────────────────────────

# The tagline line disappears from the card. Every one of the ten companies is
# opened and compared, so ten assertions name it. Nothing else reads it.
run_browser_control "the card stops showing the tagline" 10 \
  'data-testid="booth-card-tagline"' \
  'data-testid="booth-card-tagline-removed"'

# The link still opens a new tab but without noopener, so the opened page can
# reach back through window.opener and navigate this one. Ten companies, one
# safety assertion each.
run_browser_control "the website link loses its noopener protection" 10 \
  'rel="noopener noreferrer"' \
  'rel="noreferrer"'

# The booth number label renders without the number in it. The assertion checks
# that the label CONTAINS the stored booth number, so ten fail.
run_browser_control "the card shows the word Stand but not the number" 10 \
  'Stand {sponsor.boothNumber}' \
  'Stand'

# ── This control was corrected once, and the reason is recorded rather than
#    quietly fixed ────────────────────────────────────────────────────────────
#
# The first version widened the card lookup from the active map to every map and
# predicted one failure. The suite stayed green, which failed gate 4.
#
# The cause is a fact about the code, not a gap in the suite: closing the card on
# a map switch is protected TWICE. chooseMap() clears the open marker id, AND the
# card is resolved only from the markers on the active map. Removing either one
# leaves the other holding, and nothing observable changes.
#
# The corrected control removes both, and the prediction was re-derived and
# written here BEFORE the re-run. A prediction adjusted after seeing a result is
# not a prediction.
run_browser_control "an open card survives switching to another map" 1 \
  'openPinId === null ? null : (active.pins.find(p => p.id === openPinId)?.sponsor ?? null)' \
  'openPinId === null ? null : (maps.flatMap(m => m.pins).find(p => p.id === openPinId)?.sponsor ?? null)' \
  '    setOpenPinId(null)
  }

  /**
   * Open the card for a tapped marker.' \
  '  }

  /**
   * Open the card for a tapped marker.'

# ─────────────────────────────────────────────────────────────────────────────

restore
echo
echo "Rebuilding and restarting on the restored tree, so a correct build is left behind."

# ── This is a GATE, not a courtesy ───────────────────────────────────────────
#
# Raised by Phase 9's adversarial review round 2. The earlier version ran this
# and ignored the result, so a failed restore build, an uncleared port, or a
# broken restored tree still ended with "Controls: 7 passed, 0 failed" and exit
# 0. The next person to run any suite would then be measuring a stale server or
# no server at all, and the harness would have told them everything was fine.
#
# This script's header promises to leave a correct build behind. A promise the
# exit code does not enforce is not a promise.
if build_and_start; then
  echo "  restored build is up on 3001"
else
  echo "  RESTORE FAILED: the tree is restored but the app was not rebuilt and restarted."
  echo "                  Do not trust any suite run after this until it is."
  FAILED=$((FAILED + 1))
fi

echo
echo "════════════════════════════════════════════════════════════"
echo "  Controls: $PASSED passed, $FAILED failed"
echo "════════════════════════════════════════════════════════════"
exit $([ "$FAILED" -eq 0 ] && echo 0 || echo 1)
