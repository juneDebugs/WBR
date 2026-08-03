#!/usr/bin/env bash
#
# Phase 10 — the cache-invalidation address must fail closed when no shared
# secret is configured. This is the check for the round 1 finding.
#
#   bash docs/smoketests/playwright/phase-10-secret-fail-closed.sh
#
# ── Why this is a separate script, and not three assertions in the suite ──────
#
# The Phase 10 suite already contains three assertions aimed at this finding:
#
#     ✓ cache invalidation with no secret field at all is refused
#     ✓ cache invalidation with a null secret is refused
#     ✓ cache invalidation with an empty-string secret is refused
#
# ALL THREE PASS ON THE UNFIXED CODE. Measured 2026-08-03: the pre-fix
# comparison was put back into apps/attendee/app/api/revalidate/route.ts, the
# app was rebuilt, and the suite reported "92 passed, 0 failed" with those three
# ticked — while the hole was live in the running program.
#
# The reason is that the suite runs against an app that HAS a secret configured.
# The unfixed line read:
#
#     if (secret !== process.env.NEXTAUTH_SECRET) return 401
#
# With a 44-character secret configured, a message carrying no secret is
# `undefined !== "<44 chars>"`, which is true, so it is refused — the same answer
# the fixed code gives. The hole opens only when the secret is ABSENT from the
# server, because then it is `undefined !== undefined`, which is false, and the
# request passes.
#
# So the condition that separates fixed from unfixed cannot be created from
# inside the suite: it needs the app started without that setting. That is what
# this script does.
#
# ── Recorded evidence that this script can fail ───────────────────────────────
#
# Against the pre-fix code with the secret hidden, the same request answered:
#     {"revalidated":["floor-plan"],"listenersOnThisInstance":0}   HTTP 200
# Against the fixed code, it answers:
#     {"error":"Invalid secret"}                                   HTTP 401
# plus the log line:
#     [revalidate] NEXTAUTH_SECRET is not set; refusing all cache invalidation.
#
# ── Safety ───────────────────────────────────────────────────────────────────
#
# This script edits a real settings file, apps/attendee/.env.local, and starts a
# second copy of the participant app on a spare port. Both are undone by a trap
# that runs on ANY exit, including an interrupt. The instance already serving
# 3001 is never touched: it read its settings at boot and keeps them in memory,
# so hiding a line in the file cannot affect it.
#
# No rebuild is needed. Server-side settings are read when the process starts.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

ENV_FILE="apps/attendee/.env.local"
PORT="${SPARE_PORT:-3019}"
WORK="$(mktemp -d)"
BACKUP="$WORK/env.local.backup"
APP_LOG="$WORK/app.log"

PASSED=0
FAILED=0
ok()   { PASSED=$((PASSED + 1)); echo "  ✓ $1"; }
bad()  { FAILED=$((FAILED + 1)); echo "  ✗ $1${2:+ — $2}"; }
check() { if [ "$1" = "true" ]; then ok "$2"; else bad "$2" "${3:-}"; fi }

restore() {
  echo
  echo "Restoring."
  if [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$ENV_FILE"
    if diff -q "$BACKUP" "$ENV_FILE" >/dev/null 2>&1; then
      echo "  settings file restored and verified identical"
    else
      echo "  !! SETTINGS FILE DID NOT RESTORE — copy it back by hand from $BACKUP"
    fi
  fi
  local p
  p="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$p" ]; then kill $p 2>/dev/null || true; echo "  spare instance on $PORT stopped"; fi
}
trap restore EXIT

echo "════════════════════════════════════════════════════════════"
echo "  Phase 10 — the cache address fails closed with no secret"
echo "  spare port: $PORT"
echo "════════════════════════════════════════════════════════════"

if [ ! -f "$ENV_FILE" ]; then
  echo "No $ENV_FILE. Refusing to run."
  exit 2
fi

cp "$ENV_FILE" "$BACKUP"
REAL_SECRET="$(grep '^NEXTAUTH_SECRET' "$BACKUP" | cut -d= -f2- | tr -d '"'"'"'' || true)"
if [ -z "$REAL_SECRET" ]; then
  echo "No NEXTAUTH_SECRET in $ENV_FILE, so there is nothing to hide. Refusing to run."
  exit 2
fi
echo
echo "  settings backed up (${#REAL_SECRET}-character secret found, value not printed)"

# ── Hide the setting ─────────────────────────────────────────────────────────
sed -i '' 's/^NEXTAUTH_SECRET=/#HIDDEN_BY_SMOKETEST_NEXTAUTH_SECRET=/' "$ENV_FILE"
LIVE="$(grep -c '^NEXTAUTH_SECRET' "$ENV_FILE" || true)"
if [ "$LIVE" != "0" ]; then
  echo "  GATE 1 FAILED: the setting is still live in the file. Nothing was measured."
  exit 1
fi
echo "  gate 1 ok — the setting is hidden"

# ── Start a second copy that will boot without it ────────────────────────────
( cd apps/attendee && env -u NEXTAUTH_SECRET ./node_modules/.bin/next start -p "$PORT" > "$APP_LOG" 2>&1 & )

UP=""
for _ in $(seq 1 40); do
  sleep 1
  if curl -s -o /dev/null --max-time 3 "http://localhost:$PORT/" 2>/dev/null; then UP="yes"; break; fi
done
if [ -z "$UP" ]; then
  echo "  GATE 2 FAILED: the spare instance never answered on $PORT. Nothing was measured."
  echo "  its log:"; sed 's/^/      /' "$APP_LOG" | head -20
  exit 1
fi
echo "  gate 2 ok — a copy is running on $PORT with no secret configured"
echo

# ── The measurements ─────────────────────────────────────────────────────────
probe() { # $1 = json body
  curl -s -o "$WORK/body.txt" -w '%{http_code}' --max-time 10 \
    -X POST "http://localhost:$PORT/api/revalidate" \
    -H 'Content-Type: application/json' -d "$1" 2>/dev/null
}

CODE="$(probe '{"tags":["floor-plan"]}')"
BODY="$(cat "$WORK/body.txt")"
check "$([ "$CODE" = "401" ] && echo true || echo false)" \
  "a message with NO secret is refused when the server has no secret" \
  "got HTTP $CODE $BODY — 200 here means the round 1 hole is back"

# A refusal code is not proof nothing happened. The unfixed code returns a body
# naming the tags it cleared, so the body is checked too.
case "$BODY" in
  *revalidated*) check false "the refusal did not clear any cache tag" "body reports work done: $BODY" ;;
  *)             check true  "the refusal did not clear any cache tag" ;;
esac

CODE="$(probe "{\"secret\":\"$REAL_SECRET\",\"tags\":[\"floor-plan\"]}")"
BODY="$(cat "$WORK/body.txt")"
check "$([ "$CODE" = "401" ] && echo true || echo false)" \
  "even the CORRECT secret is refused when the server has none" \
  "got HTTP $CODE $BODY — nothing can be authenticated, so nothing may be accepted"

CODE="$(probe '{"secret":null,"tags":["floor-plan"]}')"
check "$([ "$CODE" = "401" ] && echo true || echo false)" \
  "a null secret is refused when the server has no secret" "got HTTP $CODE"

CODE="$(probe '{"secret":"","tags":["floor-plan"]}')"
check "$([ "$CODE" = "401" ] && echo true || echo false)" \
  "an empty-string secret is refused when the server has no secret" "got HTTP $CODE"

# The refusal must say why, or an operator has a stale cache and no reason for it.
if grep -q "NEXTAUTH_SECRET is not set" "$APP_LOG"; then
  ok "the server logged why it is refusing"
else
  bad "the server logged why it is refusing" "no such line in its log"
fi

echo
echo "────────────────────────────────────────────────────────────"
echo "  Controls: $PASSED passed, $FAILED failed"
echo "────────────────────────────────────────────────────────────"
if [ "$FAILED" = "0" ]; then
  echo "  This is the check the suite's three secret assertions cannot be."
else
  echo "  A failure here means the cache address accepts unauthenticated"
  echo "  callers whenever its secret setting is missing."
fi
exit $([ "$FAILED" = "0" ] && echo 0 || echo 1)
