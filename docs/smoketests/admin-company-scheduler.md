# Smoketest — Admin Company Scheduler (Meetings → Companies tab)

**What this verifies** (all engine-capability integration ACs; every step is a
contract check, no perf-bar claims are made by this feature):

1. The meeting-engine capability is reachable from the admin app: company
   directory → per-company schedule matrix → assign / reschedule / cancel.
2. Engine invariants hold over HTTP: room capacity, candidate-busy, booth
   capacity, one-confirmed-meeting-per-pair, cancel preserve-vs-remove.
3. Permission gating: every `/api/admin/scheduler/*` route (and the reused
   `/api/meeting-requests/[id]` + `/api/auto-schedule`) rejects anonymous and
   permission-lacking callers.
4. The HIG UI drives the full lifecycle end-to-end (Playwright).

All steps are script-driven; each script prints ✓/✗ per assertion and exits
non-zero on failure. Environment: any (contract checks) — run against Turso
via the creds in `apps/web/.env.local`. The HTTP/e2e scripts target
`http://localhost:3000` and honor `SMOKE_BASE_URL`; pass `--start` to have
them boot `next dev` themselves.

### Step 1 — Engine round-trips and Misc semantics [contract]

Run: `node scripts/test-admin-scheduler.mjs`

Pass criterion: exit 0; 30 ✓ assertions covering directory aggregates, bank
ranking (tier before score), day grouping, capacity math, assign/reschedule/
cancel round-trips, conflict rejections (`ROOM_CONFLICT`, `ALREADY_SCHEDULED`,
`CANDIDATE_BUSY`), cancel(preserve) → request back in bank, and
cancel(remove) → request listed in `matrix.misc` as `Removed`.

### Step 2 — HTTP lifecycle + auth gating [contract]

Run: `node scripts/test-admin-scheduler-api.mjs --start`

Pass criterion: exit 0; anonymous requests get 401/403; authed directory/
matrix/availability shapes match the engine contracts; assign → 200, duplicate
pair → 409 `ALREADY_SCHEDULED`; reschedule → 200; cancel(preserve) → 200 and
the candidate reappears in the bank; double-cancel → non-2xx.

### Step 3 — UI end-to-end [contract]

Run: `node scripts/e2e-admin-scheduler.mjs --start`

Pass criterion: exit 0; Playwright logs in as `wbr@test.com`, opens
`?tab=companies`, drills into the fixture company, assigns via the sheet
(slot + room), sees the meeting under Scheduled and in the grid, reschedules,
cancels with "Return to bank", and sees the candidate back in Unscheduled —
with zero app console errors.

### Step 4 — No design-system regressions [contract]

Run: `node scripts/test-design-system.mjs`

Pass criterion: all checks pass (the new components introduce no rogue hex /
forked tokens).

## Summary

| Step | Category | Runner | Pass |
|---|---|---|---|
| 1 Engine round-trips | contract | `test:admin-scheduler` | script exit 0 |
| 2 HTTP + auth | contract | `test:admin-scheduler:api` | script exit 0 |
| 3 UI e2e | contract | `e2e:admin-scheduler` | script exit 0 |
| 4 Design system | contract | `test:design` | script exit 0 |
