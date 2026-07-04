#!/bin/bash

BASE_URL="http://localhost:3002"
CONCURRENCY=10
REQUESTS=500

declare -a NAMES=("Login" "Dashboard (Home)" "Browse" "Meetings" "Profile" "Requests" "Staff")
declare -a PATHS=("/login" "/" "/browse" "/meetings" "/profile" "/requests" "/staff")

echo ""
echo "🔥 Meeting Portal Load Test — $BASE_URL"
echo "   $CONCURRENCY concurrent connections, $REQUESTS requests per page"
echo ""

printf "%-20s %-12s %12s %12s %12s %12s %12s %10s\n" "Page" "Path" "Req/sec" "Avg (ms)" "p50 (ms)" "p90 (ms)" "p99 (ms)" "Failed"
printf "%-20s %-12s %12s %12s %12s %12s %12s %10s\n" "────────────────────" "────────────" "────────────" "────────────" "────────────" "────────────" "────────────" "──────────"

SLOWEST_NAME=""
SLOWEST_AVG=0
FASTEST_NAME=""
FASTEST_AVG=999999

for i in "${!NAMES[@]}"; do
  NAME="${NAMES[$i]}"
  PATH_URL="${PATHS[$i]}"
  URL="${BASE_URL}${PATH_URL}"

  OUTPUT=$(ab -n $REQUESTS -c $CONCURRENCY -q "$URL" 2>&1)

  RPS=$(echo "$OUTPUT" | grep "Requests per second" | awk '{print $4}')
  AVG=$(echo "$OUTPUT" | grep "Time per request.*mean\b" | head -1 | awk '{print $4}')
  P50=$(echo "$OUTPUT" | grep "  50%" | awk '{print $2}')
  P90=$(echo "$OUTPUT" | grep "  90%" | awk '{print $2}')
  P99=$(echo "$OUTPUT" | grep "  99%" | awk '{print $2}')
  FAILED=$(echo "$OUTPUT" | grep "Failed requests" | awk '{print $3}')
  NON2XX=$(echo "$OUTPUT" | grep "Non-2xx" | awk '{print $3}')
  FAILED=${FAILED:-0}
  if [ -n "$NON2XX" ]; then
    FAILED="$FAILED (+${NON2XX} non-2xx)"
  fi

  printf "%-20s %-12s %12s %12s %12s %12s %12s %10s\n" "$NAME" "$PATH_URL" "$RPS" "$AVG" "$P50" "$P90" "$P99" "$FAILED"

  # Track slowest/fastest by average
  AVG_INT=$(echo "$AVG" | awk '{printf "%d", $1}')
  if [ "$AVG_INT" -gt "$SLOWEST_AVG" ] 2>/dev/null; then
    SLOWEST_AVG=$AVG_INT
    SLOWEST_NAME="$NAME ($PATH_URL) — avg ${AVG}ms"
  fi
  if [ "$AVG_INT" -lt "$FASTEST_AVG" ] 2>/dev/null; then
    FASTEST_AVG=$AVG_INT
    FASTEST_NAME="$NAME ($PATH_URL) — avg ${AVG}ms"
  fi
done

echo ""
echo "================================================================"
echo "⚠️  Slowest: $SLOWEST_NAME"
echo "✅ Fastest: $FASTEST_NAME"
echo "================================================================"
