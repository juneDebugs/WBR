# Adversarial review log — Admin Company Scheduler

Feature: meeting-engine capability integrated into the admin app's Meetings
section (Companies tab). Review ran as an 8-angle parallel finder sweep
(line-by-line, removed-behavior, cross-file tracer, reuse, simplification,
efficiency, altitude, conventions) over the full diff, findings verified
against source before fixing. One round; all accepted findings fixed in the
same change.

## Findings → resolutions

1. **[confirmed, fixed]** `CompanyAutoScheduleButton` read `row.priority` /
   `row.label` from `/api/auto-schedule`, but the engine's `TierSummary` field
   is `tier` (no label) — the preview's Tier column rendered blank with
   duplicate `undefined` React keys. → Typed the response to the engine shape,
   badge/label now derive from `row.tier` via the shared maps.
2. **[confirmed, fixed]** Per-company auto-schedule included PENDING requests,
   silently bypassing the Inbound approve/decline gate the sidebar enforces.
   → `/api/auto-schedule` accepts a validated `statuses` array; the Companies
   tab passes `['APPROVED']`. The conference-wide button keeps its historical
   PENDING+APPROVED semantics.
3. **[confirmed, fixed]** Escape/scrim could dismiss the cancel dialog and the
   assign/reschedule sheets while a submit was in flight, dropping the
   onSuccess refresh (stale grid, confusing 400/409 on retry). → Dialog and
   sheet shells are non-dismissable while submitting.
4. **[confirmed, fixed]** 409 recovery in both sheets cleared only the room,
   leaving a possibly-dead slot selected (resubmit loop). → Clears slot + room
   and refetches availability.
5. **[confirmed, fixed]** Legacy Requests-tab booking (`PATCH
   /api/meeting-requests/[id]` → CONFIRMED) bypassed every engine guard,
   allowing double-booked pairs / overfull booths that the Companies tab then
   renders as impossible states. → The CONFIRM path now enforces
   ALREADY_SCHEDULED / CANDIDATE_BUSY / SPONSOR_FULL (409 + code) before
   writing. Full engine routing (room selection) deliberately deferred.
6. **[confirmed, fixed]** Auth split: new routes used `roleHasPermission(role,
   'meetings')` while `/api/auto-schedule` and `/api/meeting-requests/[id]` —
   both wired into the new tab's UI — kept hardcoded role lists, so the Roles
   & Permissions editor didn't govern half the surface. → Both now gate via
   `requireSchedulerAccess()`. Defaults grant `meetings` to STAFF/ORGANIZER,
   so standard-role access is unchanged.
7. **[confirmed, fixed]** `getSponsorScheduleMatrix` fetched/scored CANCELLED
   requests through the full pipeline (user joins incl. base64 avatars +
   solutions blobs) though they only feed the Misc list, and `MiscItem`
   shipped an `image` no consumer renders — unbounded payload growth as
   cancellations accumulate. → Terminal requests moved to a separate slim
   query; `MiscItem` dropped `image`.
8. **[confirmed, fixed]** `confirmedCount`/`alreadyScheduled` counted meetings
   on other conferences' time blocks (phantom fill with no grid row). → The
   matrix scopes confirmed meetings to the resolved conference's blocks.
9. **[confirmed, fixed]** Sidebar heading said "Declined" over rows that mix
   `Declined` (REJECTED) and `Removed` (CANCELLED). → Heading is now
   "Declined & removed"; the cancel dialog's footnote matches.
10. **[confirmed, fixed]** Snapshot copies of bank-row data in selection/sheet
    state could go stale across refetches (ghost selection → guaranteed 409).
    → Only the `requestId` is state; candidate data derives from the live
    matrix and self-clears when the row leaves the bank.
11. **[confirmed, fixed]** Duplication: `TIER_COLORS` ×4 / `PRIORITY_LABEL`+
    `PRIORITY_BADGE` ×6 across apps/web, two diverging `meterClass`
    implementations, UTC formatters exported from a component, and
    `engineErrorResponse` copied verbatim between the two apps. → New
    `apps/web/lib/meetings-ui.ts` (maps + `meterClass` + `FILL_TARGET`),
    UTC formatters moved to `apps/web/lib/format.ts`, and
    `engineErrorHttpStatus(code)` exported from the engine and used by both
    apps' response helpers. (Pre-existing copies in `MeetingsTableWithPanel`,
    `MeetingRequestActions`, `PriorityAutoScheduleButton` left untouched to
    keep the diff scoped.)
12. **[confirmed, fixed]** Efficiency: the Companies tab still fired the heavy
    `/api/data/meetings` fetch it never uses, and every mutation ran a
    redundant `router.refresh()` on top of the React Query invalidation.
    → `useMeetingsData` gained an `enabled` opt-out (tab badges hide while
    undefined); `router.refresh()` removed; `invalidateScheduler`'s no-op
    per-sponsor pre-invalidation dropped.
13. **[confirmed, fixed]** The committed test scripts defaulted to
    `http://localhost:3200` (one machine's free port) contradicting the
    documented :3000. → Default is :3000; `SMOKE_BASE_URL` overrides.

## Accepted / refuted

- **[refuted]** "Approving an inbound request for an already-scheduled
  candidate makes it vanish" — the APPROVED request is intentionally hidden
  while the pair has a confirmed meeting and automatically reappears in the
  bank when that meeting is cancelled-with-preserve; nothing is lost.
- **[accepted]** Companies-tab times render in UTC (the engine's storage,
  day-grouping, and staff-console convention) while the pre-existing Master
  Schedule tab renders `TZ='America/Los_Angeles'`. Reconciling the legacy
  tab's timezone is out of scope; documented in `apps/web/lib/format.ts`.
- **[accepted]** Historical CANCELLED requests from pre-existing flows now
  surface as `Removed` in both consoles' Misc lists — treated as a feature
  (previously invisible withdrawals are auditable).
- **[accepted]** Assign/Reschedule sheets still share ~60 lines of
  state-machine shape after the shell/picker extraction; a `useAvailabilitySheet`
  hook is a future cleanup, not worth the churn now.
- **[accepted]** The legacy Requests-tab DELETE path can still orphan
  rep-initiated SponsorMeetings (pre-existing); noted for a future pass.

## Verification after fixes

`test:admin-scheduler`, `test:admin-scheduler:api`, `e2e:admin-scheduler`,
`test:engine`, `test:engine:api`, `test:priority`, `test:priority:api`,
`test:design` all green; `tsc --noEmit` clean in apps/web and apps/meetings.
