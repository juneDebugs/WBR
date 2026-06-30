# `docs/perf/` — Lighthouse measurement runner

Durable home for the Phase 2 Lighthouse runner originally drafted in `recon/perf_investigation_2026_06_18.md` at `/tmp/wbr-perf/`. The `/tmp` location was cleared on the next reboot; this directory rebuilds the runner in a stable in-repo location so Phase 7 (mid-sprint re-measurement) and Phase 13 (perf delta report) can reuse it.

## Files

- `run-lighthouse.sh` — runner driving Lighthouse against the 9 sprint-relevant routes × 2 profiles per PRD §6 Phase 7 acceptance criteria. Output: `lighthouse/lh-<app>-<route-slug>-<profile>.json`.
- `parse-lh.js` — Node parser that reads the JSON reports and emits a markdown table. Captures both simulated (lantern) and observed LCP/FCP per PRD §4 amendment 2026-06-27.
- `.gitignore` — excludes `headers/` (session secrets) and `lighthouse/` (large raw reports).
- `headers/<app>.json` — captured session-cookie JSON files, gitignored. Populated by the procedure below.
- `lighthouse/lh-*.json` — raw Lighthouse output, gitignored.

## Production app → Vercel host mapping

Resolved 2026-06-30 during the Phase 7 deployment audit. The handoff's `wbr-admin` mapping was stale; the project list contains two attendee-shaped projects and two admin-shaped projects, only one of each is current.

| App | Vercel project | Production host |
|---|---|---|
| attendee | `wbr` | `wbr-mobile.vercel.app` |
| admin | `wbr-web` | `wbr-web.vercel.app` |
| meetings | `wbr-meetings` | `wbr-meetings.vercel.app` |
| sponsor | `wbr-sponsor` | `wbr-sponsor.vercel.app` |

Legacy duplicates (`wbr-mobile` → `wbr-mobile-seven.vercel.app`, `wbr-admin` → `wbr-admin.vercel.app`) exist but are not the current production targets. `wbr-admin` last deployed 2026-05-12; missed Phase 9 and Phase 14.

## Rebuild from scratch

1. **Install Lighthouse 13.4.0 globally** for baseline parity:

   ```bash
   npm i -g lighthouse@13.4.0
   ```

2. **Capture session cookies** for the four production apps via `/api/login` POST with the seeded `june@tailor.tech` / `admin123` ORGANIZER account. Writes `__Secure-next-auth.session-token=…` into each app's headers file.

   ```bash
   mkdir -p docs/perf/headers
   for pair in "attendee:wbr-mobile.vercel.app" "admin:wbr-web.vercel.app" \
               "meetings:wbr-meetings.vercel.app" "sponsor:wbr-sponsor.vercel.app"; do
     APP="${pair%%:*}"; HOST="${pair##*:}"
     TMP="/tmp/wbr-login-$APP.txt"
     STATUS=$(curl -sS -X POST "https://$HOST/api/login" \
       -H "Content-Type: application/json" \
       -d '{"email":"june@tailor.tech","password":"admin123"}' \
       -D "$TMP" -o /dev/null -w "%{http_code}")
     COOKIE=$(grep -i "^set-cookie:.*__Secure-next-auth\.session-token" "$TMP" \
       | sed -E 's/.*(__Secure-next-auth\.session-token=[^;]+).*/\1/' | head -1)
     if [ "$STATUS" = "200" ] && [ -n "$COOKIE" ]; then
       printf '{"Cookie":"%s"}\n' "$COOKIE" > "docs/perf/headers/$APP.json"
       echo "ok   $APP (status=$STATUS, cookie_len=${#COOKIE})"
     else
       echo "fail $APP (status=$STATUS, cookie_captured=$([ -n "$COOKIE" ] && echo yes || echo no))"
     fi
     rm -f "$TMP"
   done
   ```

   Cookies have a 30-day `maxAge`. Re-run the capture if more than ~3 weeks have passed since the last run.

3. **Run the Lighthouse pass:**

   ```bash
   ./docs/perf/run-lighthouse.sh
   ```

   Wall-clock: ~6–8 minutes for 18 reports (9 routes × 2 profiles).

4. **Parse into a markdown table:**

   ```bash
   node docs/perf/parse-lh.js > /tmp/phase-7-table.md
   ```

## Methodology

- **Mobile profile** = Lighthouse default (Moto G Power viewport, Slow 4G throttling, 4× CPU emulation).
- **Desktop profile** = `--preset=desktop`.
- **Throttling** = `simulate` (lantern). The Lighthouse JSON contains both `largestContentfulPaint` (lantern projection) and `observedLargestContentfulPaint` (actual measured paint). The parser surfaces both.
- **Auth posture** = every route, including `/login`, passes the captured `__Secure-next-auth.session-token` cookie via `--extra-headers=docs/perf/headers/<app>.json`. Matches the Phase 2 baseline methodology (`recon/perf_phase2_baseline_2026_06_18.md` line 6). The `/login` route handlers do not gate on auth, so the cookie has no rendering effect on those routes — confirmed empirically: `finalDisplayedUrl` on every `/login` Lighthouse report equals the requested `/login` URL.
- **Cold-start mitigation** = each route is curl-warmed before measurement.

## Known limitations

- **Lantern-model amplification.** Simulated LCP is inflated 5–10× on WBR routes because `/api/data/*` endpoints ship base64-encoded images inline (ADR 0004; `project_lantern_model_base64_finding` memory). Observed LCP is the gating metric per PRD §4 amendment 2026-06-27. Phase 16 (post-sprint) addresses the storage layer.
- **Single measurement per route.** Lighthouse variance is typically ±10–15% on synthetic LCP. Aggregate trends are trustworthy; individual cell precision is not.
- **Service worker not registered during Lighthouse runs.** Phase 5 (PWA NetworkFirst timeout split) AC items aren't measurable here. The Phase 5 Playwright contract script covers SW behavior.
- **Only the `june@tailor.tech` perspective.** A sponsor-scope or attendee-scope user might surface different data shapes, but render perf is identical.

## References

- PRD §6 Phase 7 — mid-sprint Lighthouse re-measurement scope.
- PRD §4 — sprint exit criteria, including the 2026-06-27 observed-LCP amendment.
- `recon/perf_investigation_2026_06_18.md` §"Re-measurement instructions" — original runner spec.
- `recon/perf_phase2_baseline_2026_06_18.md` — baseline numbers for the per-route delta table.
- `docs/smoketests/CONTRACT.md` — smoketest shape rules; Phase 7 smoketest declares Tier A (production).
- ADR 0004 — base64 images in DB; the storage pattern that drives the lantern-model amplification.
