# Phase 9 smoketest run log — 2026-06-29 (independent)

Runner: AI agent (automated second-opinion via `docs/smoketests/run/phase-9.mjs`).
Environment tier: C (local prod build).
Branch: `phase-9-admin-server-side-pagination`.

## Summary

7/7 checks passed.

## Per-check results

| # | Type | Label | Expected | Actual | Status |
|---|---|---|---|---|---|
| 1 | grep | AttendeesTable: no useAttendees() consumer | 0 | 0 | ✓ PASS |
| 2 | grep | AttendeesTable: useAttendeesPage present | >=1 | 2 | ✓ PASS |
| 3 | grep | hooks.ts: useAttendees export removed | 0 | 0 | ✓ PASS |
| 4 | grep | page.tsx: SSR calls fetchAttendeesPage | >=1 | 2 | ✓ PASS |
| 5 | grep | route.ts: consumes URL searchParams | >=1 | 4 | ✓ PASS |
| 6 | playwright | phase-9 interactive-flow (9 contracts) | exit 0 with 0 failed | 9 passed, 0 failed (exit 0) | ✓ PASS |
| 7 | lighthouse | mobile /dashboard/attendees: observed-LCP ≤ 3s + transfer-size ≤ 700 KB | finalDisplayedUrl=requested AND observed-lcp ≤ 3000 AND total-byte-weight ≤ 700000 | finalDisplayedUrl=http://localhost:3010/dashboard/attendees; observed-lcp=146ms; total-byte-weight=605620; simulated-lcp=3822ms (supplementary) | ✓ PASS |

## Lighthouse audit detail

### mobile /dashboard/attendees: observed-LCP ≤ 3s + transfer-size ≤ 700 KB

- finalDisplayedUrl: `http://localhost:3010/dashboard/attendees`
- requestedUrl: `http://localhost:3010/dashboard/attendees`

| Audit | numericValue |
|---|---|
| total-byte-weight | 605620 |
| observed-lcp | 146 |
| simulated-lcp | 3822.26 |
| speed-index | 911.25 |
| total-blocking-time | 5.50 |
