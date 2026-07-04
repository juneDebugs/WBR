#!/bin/bash
# Benchmark load test for Meeting Portal (production)
# Respects Vercel's bot protection with controlled request rates

set -euo pipefail

BASE_URL="https://wbr-meetings.vercel.app"
REQUESTS=50
CONCURRENCY=5
DELAY_BETWEEN_BATCHES=0.5  # seconds between batches to avoid WAF

echo "============================================"
echo "  Meeting Portal - Production Load Test"
echo "  $BASE_URL"
echo "  $REQUESTS requests, $CONCURRENCY concurrent"
echo "  ${DELAY_BETWEEN_BATCHES}s delay between batches"
echo "============================================"
echo ""

# Step 1: Authenticate with browser-like headers
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"

echo "[1/3] Authenticating as attendee..."
curl -s -D /tmp/bench_login_hdrs -o /tmp/bench_login_body \
  -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -H "User-Agent: $UA" \
  -H "Accept: application/json" \
  -H "Origin: $BASE_URL" \
  -H "Referer: $BASE_URL/login" \
  -d '{"email":"steph@curry.com","password":"stephcurry"}'

LOGIN_CODE=$(head -1 /tmp/bench_login_hdrs | grep -o '[0-9][0-9][0-9]')
echo "   Login response: HTTP $LOGIN_CODE"

if [ "$LOGIN_CODE" = "403" ]; then
  echo ""
  echo "   ERROR: Vercel Attack Challenge Mode is active."
  echo "   The WAF is blocking automated requests."
  echo ""
  echo "   Options to proceed:"
  echo "   1. Disable Attack Challenge Mode in Vercel Dashboard > Security"
  echo "   2. Add your IP to Vercel's IP Allowlist"
  echo "   3. Use Vercel's built-in Speed Insights instead"
  echo "   4. Run against a staging/preview deployment without WAF"
  exit 1
fi

COOKIE_VAL=$(grep -i 'set-cookie:.*next-auth.session-token' /tmp/bench_login_hdrs | head -1 | sed 's/.*next-auth.session-token=//;s/;.*//')

if [ -z "$COOKIE_VAL" ]; then
  echo "   ERROR: No session cookie received."
  cat /tmp/bench_login_hdrs
  exit 1
fi
echo "   Authenticated successfully."
echo ""

# Common headers for browser-like requests
COMMON_HEADERS=(
  -H "User-Agent: $UA"
  -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  -H "Accept-Language: en-US,en;q=0.5"
  -H "Accept-Encoding: gzip, deflate, br"
  -H "Referer: $BASE_URL/"
  -b "__Secure-next-auth.session-token=$COOKIE_VAL"
)

# Step 2: Warm up (single request per page to avoid cold start skew)
echo "[2/3] Warming up pages..."
for path in "/login" "/" "/browse" "/meetings" "/requests" "/profile" "/staff"; do
  if [ "$path" = "/login" ]; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "User-Agent: $UA" "$BASE_URL$path")
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' "${COMMON_HEADERS[@]}" "$BASE_URL$path")
  fi
  echo "   $path -> HTTP $code"
  sleep 0.3
done
echo ""

# Step 3: Benchmark function
benchmark_page() {
  local path="$1"
  local name="$2"
  local use_cookie="$3"
  local timings_file="/tmp/bench_times_${name// /_}.txt"

  > "$timings_file"

  local completed=0
  while [ $completed -lt $REQUESTS ]; do
    local batch_size=$CONCURRENCY
    if [ $((completed + batch_size)) -gt $REQUESTS ]; then
      batch_size=$((REQUESTS - completed))
    fi

    for i in $(seq 1 $batch_size); do
      if [ "$use_cookie" = "yes" ]; then
        curl -s -o /dev/null -w '%{http_code} %{time_total} %{size_download} %{time_starttfb}\n' \
          "${COMMON_HEADERS[@]}" "$BASE_URL$path" >> "$timings_file" &
      else
        curl -s -o /dev/null -w '%{http_code} %{time_total} %{size_download} %{time_starttfb}\n' \
          -H "User-Agent: $UA" "$BASE_URL$path" >> "$timings_file" &
      fi
    done
    wait

    completed=$((completed + batch_size))
    sleep "$DELAY_BETWEEN_BATCHES"
  done

  # Parse results
  local total_time=0 total_ttfb=0 success=0 fail=0 total_size=0
  local times=() ttfbs=()

  while IFS=' ' read -r code time_total size ttfb; do
    local ms=$(echo "$time_total * 1000" | bc | cut -d. -f1)
    local ttfb_ms=$(echo "$ttfb * 1000" | bc | cut -d. -f1)
    times+=("$ms")
    ttfbs+=("$ttfb_ms")
    total_time=$((total_time + ms))
    total_ttfb=$((total_ttfb + ttfb_ms))
    total_size=$((total_size + ${size:-0}))

    if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
      success=$((success + 1))
    else
      fail=$((fail + 1))
    fi
  done < "$timings_file"

  local sorted=($(printf '%s\n' "${times[@]}" | sort -n))
  local sorted_ttfb=($(printf '%s\n' "${ttfbs[@]}" | sort -n))
  local count=${#sorted[@]}

  if [ $count -gt 0 ]; then
    local mean=$((total_time / count))
    local mean_ttfb=$((total_ttfb / count))
    local p50=${sorted[$((count * 50 / 100))]}
    local p95=${sorted[$((count * 95 / 100))]}
    local p99=${sorted[$((count * 99 / 100))]}
    local min=${sorted[0]}
    local max=${sorted[$((count - 1))]}
    local ttfb_p50=${sorted_ttfb[$((count * 50 / 100))]}
    local avg_size=$((total_size / count))
    local fail_pct=$(echo "scale=1; $fail * 100 / $count" | bc)
  else
    local mean=0 p50=0 p95=0 p99=0 min=0 max=0 ttfb_p50=0 avg_size=0 fail_pct=100
  fi

  printf "%-28s │ %6s │ %6s │ %6s │ %6s │ %6s │ %6s │ %7s │ %8s │ %5s%%\n" \
    "$name" "$mean" "$min" "$p50" "$p95" "$p99" "$max" "$ttfb_p50" "$avg_size" "$fail_pct"
}

# Step 4: Run benchmarks
echo "[3/3] Running benchmarks..."
echo ""
printf "%-28s │ %6s │ %6s │ %6s │ %6s │ %6s │ %6s │ %7s │ %8s │ %6s\n" \
  "Page" "Mean" "Min" "P50" "P95" "P99" "Max" "TTFB50" "Size" "Fail"
printf "%-28s─┼─%6s─┼─%6s─┼─%6s─┼─%6s─┼─%6s─┼─%6s─┼─%7s─┼─%8s─┼─%6s\n" \
  "────────────────────────────" "──────" "──────" "──────" "──────" "──────" "──────" "───────" "────────" "──────"

benchmark_page "/login"    "Login (public)"      "no"
benchmark_page "/"         "Dashboard"            "yes"
benchmark_page "/browse"   "Browse"               "yes"
benchmark_page "/meetings" "My Meetings"          "yes"
benchmark_page "/requests" "Meeting Requests"     "yes"
benchmark_page "/profile"  "User Profile"         "yes"
benchmark_page "/staff"    "Staff Queue"          "yes"

echo ""
echo "(All times in ms, Size in bytes, TTFB = Time To First Byte)"
echo "============================================"
echo "  Benchmark complete!"
echo "============================================"
