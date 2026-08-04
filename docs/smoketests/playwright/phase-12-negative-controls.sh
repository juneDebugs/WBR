#!/usr/bin/env bash
# Phase 12 — negative controls.
#
# A green suite proves nothing until it has been shown to go red. Each control
# below breaks ONE shipped behaviour on purpose and requires the suite to fail by
# the number of assertions PREDICTED IN ADVANCE, written in this file before any
# of them ran. Caught by the wrong number is a finding rather than a pass: it
# means the suite measures something other than what it claims.
#
# Five gates, carried forward from Phases 8 to 11:
#   1. the edit must actually apply        (verified by re-reading the file)
#   2. the build must succeed
#   3. the port must be free before each run (the suite starts the app itself,
#      twice, so a leftover server would make it refuse to start)
#   4. the suite must be caught            (increase > 0)
#   5. caught by the PREDICTED amount      (increase == prediction)
#
# The baseline is re-measured before every control. A non-zero baseline after a
# restore means the PREVIOUS control's break is still live — the fault that
# produced four false verdicts in Phase 10 and that Phase 13 hit from the other
# direction when rounds 1 and 2 changed the lines its controls edited, so those
# substitutions stopped matching while the driver still exited 0.
#
# ── ONE CONTROL FROM THIS PHASE IS ABSENT ON PURPOSE ────────────────────────
#
# The first control written for Phase 12 substituted the declared issuer with the
# value LinkedIn's documentation page prints, and predicted a refusal. The
# prediction was WRONG — the substituted build produced an identical, correct
# redirect. Reading the library to explain that found the declared issuer is inert
# in this configuration, so a safeguard described in three places did not exist.
# That is F-26. There is no version of that control which passes, because it
# tested a mechanism that is not there, so it is recorded in the requirements
# document and in the smoketest document rather than repaired and kept here.
#
# Usage:
#   bash docs/smoketests/playwright/phase-12-negative-controls.sh
#
# Exits 0 only if every control applied, built, and was caught by its prediction.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SUITE="$REPO/docs/smoketests/playwright/phase-12-linkedin-sign-in.mjs"
PORT="${ATTENDEE_PORT:-3001}"

RULES="$REPO/apps/attendee/lib/linkedin-identity.ts"
AUTH="$REPO/apps/attendee/lib/auth.ts"
LOGIN="$REPO/apps/attendee/app/login/LoginClient.tsx"
CHECKLIST="$REPO/apps/attendee/components/onboarding/OnboardingChecklist.tsx"

BACKUP_DIR="$(mktemp -d)"
CONTROLS_RUN=0
CONTROLS_OK=0
FAILED_CONTROLS=()

cleanup() {
  for f in "$RULES" "$AUTH" "$LOGIN" "$CHECKLIST"; do
    b="$BACKUP_DIR/$(basename "$f")"
    [ -f "$b" ] && cp "$b" "$f"
  done
  rm -rf "$BACKUP_DIR"
}
trap cleanup EXIT

for f in "$RULES" "$AUTH" "$LOGIN" "$CHECKLIST"; do
  cp "$f" "$BACKUP_DIR/$(basename "$f")"
done

restore_all() {
  local f b
  for f in "$RULES" "$AUTH" "$LOGIN" "$CHECKLIST"; do
    b="$BACKUP_DIR/$(basename "$f")"
    [ -f "$b" ] && cp "$b" "$f"
  done
}

port_free() {
  ! curl -sf -o /dev/null --max-time 2 "http://localhost:$PORT/login" 2>/dev/null
}

wait_port_free() {
  for _ in $(seq 1 30); do
    port_free && return 0
    sleep 1
  done
  return 1
}

build() {
  (cd "$REPO" && npx turbo build --filter=attendee) > "$BACKUP_DIR/build.log" 2>&1
}

# Run the suite; echo the failure count it reports. A fatal exit with no results
# line reports 999, which no prediction matches, so a crash can never be scored
# as a catch.
run_suite() {
  local out="$1"
  (cd "$REPO" && node "$SUITE") > "$out" 2>&1
  local line
  line="$(grep -E '^  Results: [0-9]+ passed, [0-9]+ failed' "$out" | tail -1)"
  if [ -z "$line" ]; then echo 999; return; fi
  echo "$line" | sed -E 's/.*, ([0-9]+) failed/\1/'
}

# Apply one substitution to one file, exactly once. Exits non-zero if the text is
# absent or appears more than once, so a control cannot half-apply.
substitute() {
  python3 - "$1" "$2" "$3" <<'PY'
import sys
path, search, replace = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
n = text.count(search)
if n != 1:
    sys.stderr.write(f"expected exactly one occurrence, found {n}\n")
    sys.exit(1)
open(path, 'w').write(text.replace(search, replace))
PY
}

# run_control <name> <predicted-failures> <file> <search> <replace> [file2 search2 replace2 ...]
#
# Accepts more than one substitution because some assertions guard a compound
# property. B4 — "with the credentials blank, starting a LinkedIn sign-in does not
# reach LinkedIn" — holds for two independent reasons: the provider is not
# registered, and an empty client identifier is refused before a redirect is
# built. Breaking one leaves the other standing, so a single-substitution control
# cannot redden it. That was measured, not reasoned: see NC-2's note.
run_control() {
  local name="$1" predicted="$2"
  shift 2
  local -a files=() searches=() replaces=()
  while [ $# -ge 3 ]; do
    files+=("$1"); searches+=("$2"); replaces+=("$3")
    shift 3
  done
  local file="${files[0]}" search="${searches[0]}" replace="${replaces[0]}"
  CONTROLS_RUN=$((CONTROLS_RUN + 1))
  echo ""
  echo "────────────────────────────────────────────────────────────"
  echo "CONTROL: $name"
  echo "  predicts $predicted failing assertion(s)"

  if ! wait_port_free; then
    echo "  ✗ GATE 3: port $PORT is still held; stop any running app first"
    FAILED_CONTROLS+=("$name (port busy)")
    return
  fi

  echo "  baseline..."
  local baseline
  baseline="$(run_suite "$BACKUP_DIR/baseline.log")"
  if [ "$baseline" != "0" ]; then
    echo "  ✗ BASELINE is $baseline, not 0 — a previous control's break is still live"
    echo "    (or the suite is failing for an unrelated reason; see $BACKUP_DIR/baseline.log)"
    FAILED_CONTROLS+=("$name (dirty baseline: $baseline)")
    return
  fi

  # GATE 1 — every edit must apply.
  local i applied_ok=1
  for i in "${!files[@]}"; do
    if ! substitute "${files[$i]}" "${searches[$i]}" "${replaces[$i]}"; then
      echo "  ✗ GATE 1: substitution $((i + 1)) did not apply in $(basename "${files[$i]}")"
      echo "    searched for: ${searches[$i]}"
      applied_ok=0
      break
    fi
    if grep -qF -- "${searches[$i]}" "${files[$i]}"; then
      echo "  ✗ GATE 1: substitution $((i + 1)) did not take effect in $(basename "${files[$i]}")"
      applied_ok=0
      break
    fi
  done
  if [ "$applied_ok" -ne 1 ]; then
    restore_all
    FAILED_CONTROLS+=("$name (substitution did not apply)")
    return
  fi
  echo "  ✓ gate 1: ${#files[@]} substitution(s) applied"

  # GATE 2 — the build must succeed.
  if ! build; then
    echo "  ✗ GATE 2: build failed; see $BACKUP_DIR/build.log"
    restore_all
    build > /dev/null 2>&1
    FAILED_CONTROLS+=("$name (build failed)")
    return
  fi
  echo "  ✓ gate 2: build succeeded"

  if ! wait_port_free; then
    echo "  ✗ GATE 3: port $PORT is held after the baseline run"
    restore_all
    build > /dev/null 2>&1
    FAILED_CONTROLS+=("$name (port busy)")
    return
  fi

  local broken
  broken="$(run_suite "$BACKUP_DIR/broken.log")"
  echo "  suite reported $broken failing assertion(s)"
  grep -E '^  ✗' "$BACKUP_DIR/broken.log" | sed 's/^/    /'

  # restore before scoring, so a failed score cannot leave the tree broken
  restore_all
  build > /dev/null 2>&1

  # GATE 4 and GATE 5.
  if [ "$broken" = "0" ]; then
    echo "  ✗ GATE 4: NOT CAUGHT — the suite passed with the behaviour broken"
    FAILED_CONTROLS+=("$name (not caught)")
  elif [ "$broken" = "999" ]; then
    echo "  ✗ GATE 4: the suite crashed rather than failing assertions; see $BACKUP_DIR/broken.log"
    FAILED_CONTROLS+=("$name (suite crashed)")
  elif [ "$broken" != "$predicted" ]; then
    echo "  ✗ GATE 5: caught, but by $broken rather than the predicted $predicted"
    FAILED_CONTROLS+=("$name (predicted $predicted, caught $broken)")
  else
    echo "  ✓ caught by exactly the predicted $predicted"
    CONTROLS_OK=$((CONTROLS_OK + 1))
  fi
}

echo "Phase 12 negative controls"
echo "Predictions are written in this file and are not adjusted after a run."

# ── NC-1 ────────────────────────────────────────────────────────────────────
# Half a credential pair counts as configured. Predicts C18 and C19, the two
# checks that one value alone is not enough. The blank-credentials half of the
# run is unaffected: both values are empty there, so the answer is still no.
run_control "half a credential pair counts as configured" 2 \
  "$RULES" \
  'return !isBlank(env.LINKEDIN_CLIENT_ID) && !isBlank(env.LINKEDIN_CLIENT_SECRET)' \
  'return !isBlank(env.LINKEDIN_CLIENT_ID) || !isBlank(env.LINKEDIN_CLIENT_SECRET)'

# ── NC-2 ────────────────────────────────────────────────────────────────────
# The provider is registered whether or not it is configured, AND blank
# credentials are papered over with stand-ins — together, the exact failure FP 11
# and FP 31 exist to prevent. Predicts B1 (registered when it should not be), B4
# (a sign-in reaches LinkedIn) and B5 (the button is drawn).
#
# THE FIRST VERSION OF THIS CONTROL PREDICTED 3 AND CAUGHT 2, and the wrong
# prediction is kept here because of what it showed. It substituted the guard
# alone, leaving the credentials empty. B1 and B5 failed; B4 did NOT — the app
# still refused to send anyone to LinkedIn, because an empty client identifier is
# rejected before a redirect is built. So B4 guards a property held up by two
# independent mechanisms, and no single substitution can redden it. The control
# was strengthened to break both; the prediction was not lowered to match the
# result.
#
# PREDICTED 3 WHEN FIRST WRITTEN, recomputed to 4 after round 2 of the review
# replaced B5's timing guess with a wait on the page's actual provider reply. That
# added B4b — "and is told LinkedIn is not among them" — which this control also
# reddens, because the reply now says LinkedIn IS among them. Recomputed against
# the new suite before running.
run_control "the provider is registered and blank credentials are papered over" 4 \
  "$AUTH" \
  '...(isLinkedInConfigured()' \
  '...(true' \
  "$AUTH" \
  '[linkedInProvider(process.env.LINKEDIN_CLIENT_ID!, process.env.LINKEDIN_CLIENT_SECRET!)]' \
  "[linkedInProvider(process.env.LINKEDIN_CLIENT_ID || 'nc2-stand-in', process.env.LINKEDIN_CLIENT_SECRET || 'nc2-stand-in')]"

# ── NC-3 ────────────────────────────────────────────────────────────────────
# Pre-fill overwrites a name the person edited. Predicts C13 (nothing written
# over a filled person), C15 (only the blank half is written) and C58 (a join
# writes nothing over fields the person filled in). C12, C14 and C16 are
# unaffected because the stored name is blank or absent in all three.
#
# PREDICTED 2 WHEN FIRST WRITTEN, recomputed to 3 when the F-27/F-28 assertions
# were added — C58 exercises prefillFields through linkedInAction, which did not
# exist then.
#
# THEN PREDICTED 3 AND CAUGHT 4, after F-29 added the returning-delegate check.
# The wrong prediction is kept because it is the record: C38c asserts that a join
# writes nothing over a person's own edits, and it goes red under this substitution
# for the same reason C58 does. Four assertions now read prefillFields, not three.
# Corrected to 4 AFTER a disagreement, which is why it is written down rather than
# silently changed.
run_control "pre-fill overwrites a name the person edited" 4 \
  "$RULES" \
  'if (isBlank(stored.name) && incoming.name !== null) update.name = incoming.name' \
  'if (incoming.name !== null) update.name = incoming.name'

# ── NC-4 ────────────────────────────────────────────────────────────────────
# A sign-in with no email address is allowed through (F-25 undone). Predicts C23,
# C25, C26 — the three requiring a refusal — plus C47, C48, C49 (the whole action
# for a reply with no address) and C61 (which of two refusals is reported first).
# C24 still passes because the substitution leaves the address in place, and
# C27/C28 concern a real email.
#
# PREDICTED 3 WHEN FIRST WRITTEN, recomputed to 7 when the F-27/F-28 assertions
# were added — linkedInAction composes this decision, so undoing it reaches four
# further assertions. Recomputed against the new suite before running.
run_control "a sign-in with no email address is allowed through" 7 \
  "$RULES" \
  'if (email === null) return { allowed: false, redirectTo:' \
  'if (email === null) return { allowed: true, redirectTo:'

# ── NC-5 ────────────────────────────────────────────────────────────────────
# The button is drawn without consulting the provider list. Predicts B5 alone:
# the configured half still shows it correctly, so A13 is unaffected.
run_control "the button ignores whether the provider is registered" 1 \
  "$LOGIN" \
  '{linkedInAvailable && (' \
  '{true && ('

# ── NC-6 ────────────────────────────────────────────────────────────────────
# The checklist never shows a supplied photo. Predicts D3 (photo visible), D4
# (its address) and D5 (the stand-in is not drawn beside it). D12 to D14 are
# unaffected: they check the no-photo state, which this makes universal.
run_control "the checklist never shows a supplied photo" 3 \
  "$CHECKLIST" \
  '{image ? (' \
  '{false ? ('

# ── NC-7 ────────────────────────────────────────────────────────────────────
# The member-details address reverts to the one the OpenID Connect product
# retired — the mistake the library's own provider makes. Predicts C31 alone.
run_control "member details are read from the retired address" 1 \
  "$RULES" \
  "export const LINKEDIN_USERINFO = 'https://api.linkedin.com/v2/userinfo'" \
  "export const LINKEDIN_USERINFO = 'https://api.linkedin.com/v2/me'"

# ── NC-8 ────────────────────────────────────────────────────────────────────
# The refusal produces no message on screen. Predicts E2 (the sentence) and E3
# (what to do instead). E1 and E4 assert the message is ABSENT and still pass,
# which is why they cannot stand in for E2.
run_control "a refused sign-in says nothing on screen" 2 \
  "$LOGIN" \
  '  LinkedInNoEmail:' \
  '  LinkedInNoEmailRenamed:'

# ── NC-9 ────────────────────────────────────────────────────────────────────
# F-27 undone: an address LinkedIn will not vouch for may join an account that
# already exists — the account-takeover path the review found. Predicts C45 and
# C46 (the binding rule) plus C50, C51 and C52 (the whole action against an
# ORGANIZER row, including that it now carries something to write).
run_control "an unverified address may join an existing account" 5 \
  "$RULES" \
  'if (!args.emailVerified) {' \
  'if (false) {'

# ── NC-10 ───────────────────────────────────────────────────────────────────
# Anything truthy counts as LinkedIn having vouched for the address — the obvious
# fix for F-29 and the dangerous one, because the string "false" is truthy.
#
# THIS CONTROL PREVIOUSLY PINNED A DEFECT IN PLACE, and that is worth more than the
# control itself. It used to substitute a strict boolean check with `!!` and predict
# that C37 and C38 would fail, where C37 asserted the string "true" was NOT a
# verification claim. Both the control and the assertion were wrong: LinkedIn sends
# that string, so the strict check refused every returning delegate. Measured by a
# real sign-in; see F-29. The substitution is unchanged. What changed is the
# assertion set it reddens, which now includes LinkedIn saying NOT verified being
# read as verified.
#
# PREDICTED 5 AND CAUGHT 4. The wrong prediction is kept as written. It listed
# C37b, C37c, C37d (the strings "false", "FALSE" and "yes"), C38 (the number 1)
# and C38a (null). **null is FALSY**, so `if (raw)` leaves it refused and C38a was
# never going to redden — an error in my arithmetic, not in the control. The four
# that do redden are C37b, C37c, C37d and C38.
#
# What the wrong prediction was worth: it showed that C38a cannot be reddened by
# this control at all, so the only thing standing behind "null is not a
# verification claim" is the assertion itself.
#
# C34, C37, C37a and C38b still pass, because those values are truthy and are
# meant to be accepted.
run_control "any truthy value counts as a verification claim" 4 \
  "$RULES" \
  'if (raw === true) return true' \
  'if (raw) return true'

# ── NC-11 ───────────────────────────────────────────────────────────────────
# F-28 undone: the role this app admits is no longer consulted, so a refused role
# produces a write. Predicts C53, C54, C55 (the SPONSOR row now joined and
# filled) and C62 (an admitted-set refusing everything now writes anyway).
run_control "the role this app admits is not consulted before writing" 4 \
  "$RULES" \
  "  if (!args.roleAdmitted(args.existing.role)) return { kind: 'refuse', redirectTo: null }" \
  '  // negative control: the role check is removed'

# ── NC-12 ───────────────────────────────────────────────────────────────────
# The unverified-address refusal says nothing on screen. Predicts E5 alone: E6
# and E7 assert the ABSENCE of other text and still pass with no message at all,
# which is why neither can stand in for E5.
run_control "the unverified-address refusal says nothing on screen" 1 \
  "$LOGIN" \
  '  LinkedInUnverifiedEmail:' \
  '  LinkedInUnverifiedEmailRenamed:'

echo ""
echo "────────────────────────────────────────────────────────────"
echo "  Controls: $CONTROLS_OK of $CONTROLS_RUN caught by their prediction"
if [ ${#FAILED_CONTROLS[@]} -gt 0 ]; then
  echo "  Not clean:"
  for c in "${FAILED_CONTROLS[@]}"; do echo "    - $c"; done
  echo ""
  exit 1
fi
echo ""
exit 0
