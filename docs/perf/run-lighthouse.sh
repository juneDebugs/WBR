#!/usr/bin/env bash
# Lighthouse runner for the WBR sprint perf measurement.
# Produces JSON reports for the 9 routes × 2 profiles in PRD §6 Phase 7 scope.
# Output: docs/perf/lighthouse/lh-<app>-<route-slug>-<profile>.json
# Prereqs:
#   - Lighthouse 13.4.0 globally installed (npm i -g lighthouse@13.4.0)
#   - Google Chrome installed
#   - docs/perf/headers/{attendee,admin,meetings,sponsor}.json populated via the
#     cookie-capture procedure in docs/perf/README.md (file is gitignored).
# Methodology:
#   - Mobile profile = Lighthouse default (Moto G Power viewport, Slow 4G, 4× CPU).
#   - Desktop profile = --preset=desktop.
#   - Default throttling = simulate (lantern); JSON contains BOTH observedLargestContentfulPaint
#     and simulated largestContentfulPaint. The parser surfaces both per PRD §4 amendment.
#   - Every route — including /login — passes the captured auth cookie via --extra-headers,
#     matching Phase 2 baseline methodology (recon/perf_phase2_baseline_2026_06_18.md line 6).
#     /login route handlers do not gate on auth, so the cookie has no rendering effect there;
#     sending it preserves apples-to-apples delta parity with the baseline.
#   - Each route is curl-warmed before measurement to mitigate Vercel cold starts.

set -eo pipefail
# Drop -u: bash 3.2 (macOS default) treats empty array expansion as unset,
# which conflicts with the conditional EXTRA_HEADERS_ARGS / WARMUP_COOKIE_ARGS pattern.

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PERF_DIR="$REPO_ROOT/docs/perf"
OUT_DIR="$PERF_DIR/lighthouse"
HEADERS_DIR="$PERF_DIR/headers"
mkdir -p "$OUT_DIR"

# Clear any prior run's reports so the output set reflects only this invocation.
# Partial-failure runs that leave stale files would falsely satisfy the smoketest's
# "exactly 18 reports" count check on a re-read.
rm -f "$OUT_DIR"/lh-*.json

FAIL_COUNT=0
FAILED_ROUTES=""

app_host() {
  case "$1" in
    attendee) echo "wbr-mobile.vercel.app" ;;
    admin)    echo "wbr-web.vercel.app" ;;
    meetings) echo "wbr-meetings.vercel.app" ;;
    sponsor)  echo "wbr-sponsor.vercel.app" ;;
    *)        echo "" ;;
  esac
}

# Routes per PRD §6 Phase 7 acceptance criteria.
ROUTES=(
  "attendee:/login"
  "attendee:/home"
  "attendee:/speakers"
  "attendee:/schedule"
  "attendee:/people"
  "admin:/login"
  "admin:/dashboard/attendees"
  "meetings:/login"
  "sponsor:/login"
)

PROFILES=("mobile" "desktop")

slug() { echo "$1" | sed -E 's|^/||; s|/|-|g; s|^$|root|'; }

START_TS=$(date +%s)

for ROUTE_PAIR in "${ROUTES[@]}"; do
  APP="${ROUTE_PAIR%%:*}"
  ROUTE="${ROUTE_PAIR##*:}"
  HOST=$(app_host "$APP")
  URL="https://$HOST$ROUTE"
  ROUTE_SLUG=$(slug "$ROUTE")

  # Every route — including /login — passes the captured auth cookie to match the Phase 2 baseline
  # methodology (perf_phase2_baseline_2026_06_18.md line 6: "all auth'd with a seeded june@tailor.tech
  # ORGANIZER session cookie"). /login route handlers do not gate on auth, so the cookie has no
  # rendering effect on those routes; sending it preserves apples-to-apples delta parity.
  HEADERS_FILE="$HEADERS_DIR/$APP.json"
  if [ ! -f "$HEADERS_FILE" ]; then
    echo "[$APP $ROUTE] SKIP: missing $HEADERS_FILE" >&2
    continue
  fi
  EXTRA_HEADERS_ARGS=(--extra-headers="$HEADERS_FILE")
  COOKIE_VALUE=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('Cookie',''))" "$HEADERS_FILE")
  WARMUP_COOKIE_ARGS=(-H "Cookie: $COOKIE_VALUE")

  curl -sS -o /dev/null "${WARMUP_COOKIE_ARGS[@]}" "$URL" || true

  for PROFILE in "${PROFILES[@]}"; do
    OUT="$OUT_DIR/lh-$APP-$ROUTE_SLUG-$PROFILE.json"
    PRESET_ARGS=()
    [ "$PROFILE" = "desktop" ] && PRESET_ARGS=(--preset=desktop)

    echo "[$APP $ROUTE $PROFILE] → $(basename "$OUT")"
    if ! lighthouse "$URL" \
      "${EXTRA_HEADERS_ARGS[@]}" \
      "${PRESET_ARGS[@]}" \
      --output=json \
      --output-path="$OUT" \
      --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
      --quiet; then
      echo "[$APP $ROUTE $PROFILE] FAILED" >&2
      FAIL_COUNT=$((FAIL_COUNT + 1))
      FAILED_ROUTES="$FAILED_ROUTES $APP$ROUTE($PROFILE)"
    fi
  done
done

END_TS=$(date +%s)
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "Done in $((END_TS - START_TS))s with $FAIL_COUNT failure(s):$FAILED_ROUTES" >&2
  echo "Reports under $OUT_DIR (incomplete)" >&2
  exit 1
fi
echo "Done in $((END_TS - START_TS))s. Reports under $OUT_DIR"
