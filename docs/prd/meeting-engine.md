# PRD — Company-Centric Meeting Engine (admin/STAFF)

Status: in build (2026-07-22). Owner: platform. Host: `apps/meetings` `/staff` (STAFF-only), replacing the flat `StaffQueue`. Data layer: `packages/db/src/meeting-engine.ts`. Design: Apple HIG (see `docs/prd/meeting-engine-hig-spec.md`).

## 1. Goal

Replace the flat request queue with a **company-centric scheduling console** modeled on the reference eTail Connect meeting engine: pick a company (Sponsor) → manage its whole meeting calendar in a split view (Unscheduled Bank + day-tabbed grid), with mutual-availability slot computation, room/table occupancy conflict detection, capacity enforcement, request ranking + interest level, load-balancing hints, and cancel-with-preserve-request semantics.

## 2. Domain mapping (reference → WBR)

| Reference (eTail) | WBR |
|---|---|
| Company / vendor (Tailor) | `Sponsor` |
| Company directory + stats | Sponsor directory: requests / unscheduled / confirmed / fill |
| Unscheduled Bank | `MeetingRequest` for the sponsor, status `APPROVED`, no active `SponsorMeeting` |
| Calendar grid (Wed/Thu/Fri) | `TimeBlock` rows grouped by day |
| "Meeting With" attendee | the non-sponsor `User` (`SponsorMeeting.userId`) |
| Location / Table | `SponsorMeeting.location` (room name) + `MEETING_ROOMS` capacities |
| Rank 4/19 | rank of this request among sponsor's active requests, by interest |
| Interest (High/Med/Low) | derived from solution-match score |
| "; 7" confirmed count | count of the candidate's CONFIRMED `SponsorMeeting`s (their load) |
| Occupancy alert | block already holds a meeting for the sponsor (exclusive slots) |
| Load balancing (3 vs 7) | prefer candidate/room with fewer confirmed meetings |
| Cancel "No" (preserve request) | `SponsorMeeting.status=CANCELLED`, request → `APPROVED` (back to bank) |

## 3. Schema change (minimal)

`SponsorMeeting` gains two nullable columns (no new tables):
- `location String?` — assigned room/table name (drawn from `MEETING_ROOMS`).
- `reason String?`  — cancellation reason.

Applied locally via `prisma db push`; applied to Turso via `scripts/migrate-meeting-engine.mjs` (idempotent `ALTER TABLE ... ADD COLUMN`, guarded by `PRAGMA table_info`).

## 4. Engine contract — `packages/db/src/meeting-engine.ts`

Pure, prisma-injected functions (no app imports), unit-testable from TS source:

- `MEETING_ROOMS: { name, capacity }[]` (physical table labels) + `MEETINGS_PER_BLOCK = 1` (exclusive slots).
- `interestLevel(score)` → `'High' | 'Medium' | 'Low'` (High ≥ 67, Medium ≥ 34, else Low).
- `scoreRequestInterest(request, sponsor)` → 0–100 (ports `scoreSponsorVsAttendee`, solutions overlap; +size/industry not required).
- `getCompanyDirectory(prisma, conferenceId)` → per-sponsor `{ id, name, logoUrl, tier, requests, unscheduled, confirmed, fillRate }`.
- `getSponsorScheduleMatrix(prisma, sponsorId, conferenceId)` → `{ sponsor, bank[], days[], rooms }`.
  - `bank[]`: `{ requestId, userId, name, company, rank, total, interest, interestScore, confirmedCount }`.
  - `days[]`: `{ dayKey, label, slots[] }`; slot: `{ timeBlockId, startsAt, endsAt, meetings[], capacityLeft }`.
- `getCandidateAvailability(prisma, requestId, conferenceId)` → `{ days[] }` of mutually-free slots + per-room occupancy.
- `assignMeeting(prisma, { requestId, timeBlockId, room, repId? })` → creates SponsorMeeting + confirms request. Enforces candidate-free and exclusive slots (one meeting per sponsor per block). Throws typed `EngineError` on conflict.
- `rescheduleMeeting(prisma, { sponsorMeetingId, timeBlockId, room })` → moves meeting + syncs request. Same guards (excluding self).
- `cancelMeeting(prisma, { sponsorMeetingId, preserveRequest, reason?, notes? })` → cancels meeting; request → `APPROVED` (preserve) or `CANCELLED`.

Availability rules (exclusive slots, 2026-07-29):
- Candidate free at a block = no overlapping `BlackoutTime` AND no other CONFIRMED `SponsorMeeting`/`Meeting` in that block.
- Sponsor free at a block = ZERO active SponsorMeetings for the sponsor at that block (`MEETINGS_PER_BLOCK = 1`). A slot with a meeting is closed — a sponsor never holds two meetings in one time block.
- Rooms (`MEETING_ROOMS`) survive as physical table labels on a meeting (`location`); they no longer grant extra per-block capacity. `assertBlockOpen` is the exported single guard every write path (engine mutations and the legacy confirm routes in apps/web, apps/meetings, apps/sponsor) runs through; `findFirstOpenSlot` gives legacy auto-assign paths the same first-open-slot rule the auto-scheduler uses. `scripts/migrate-exclusive-slots.mjs` repairs pre-existing stacked/double-booked rows.

## 5. API — `apps/meetings/app/api/staff/*` (STAFF-gated, header identity)

- `GET  /api/staff/companies` → directory.
- `GET  /api/staff/companies/[sponsorId]/schedule` → matrix.
- `GET  /api/staff/companies/[sponsorId]/availability?requestId=` → candidate slots.
- `POST /api/staff/meetings/assign` `{ requestId, timeBlockId, room, repId? }`.
- `PATCH /api/staff/meetings/[id]` `{ timeBlockId, room }` (reschedule).
- `POST /api/staff/meetings/[id]/cancel` `{ preserveRequest, reason?, notes? }`.
- `PATCH /api/staff/requests/[id]` `{ status }` (approve/reject into/out of bank).

## 6. Tests

- `scripts/test-meeting-engine.mjs` — engine units against a raw-libSQL oracle (ranking, availability, occupancy, load-balance, assign/reschedule/cancel round-trips + conflict rejection + preserve semantics).
- `scripts/test-meeting-engine-api.mjs` — STAFF-auth API integration over :3002.
- `scripts/e2e-meeting-engine.mjs` — Playwright drive of the console.
- npm: `test:engine`, `test:engine:api`, `e2e:engine`.

## 7. Non-goals

Peer-to-peer (non-sponsor) meeting scheduling; attendee self-service; changing the negotiation-vs-materialized split; new Room DB table.

## 8. Known limitations (accepted for demo scale)

- **TOCTOU race — now DB-backstopped (2026-07-29).** The application checks (`assertBlockOpen` + the `pairExisting` lookups) still run just before the write, not inside a serialized lock, so two truly-simultaneous writes can both pass them. That window is now closed at the database by three partial unique indexes on `SponsorMeeting` (`EXCLUSIVE_SLOT_INDEXES` in `meeting-engine.ts`): `(sponsorId,timeBlockId)`, `(userId,timeBlockId)`, `(sponsorId,userId)`, each `WHERE status='CONFIRMED'`. Only one racing write survives the index; the loser's DB error is mapped by `exclusiveSlotConstraintError` / `commitOrConflict` to the same typed 409 the guards return (and to a per-pair skip in the auto-scheduler). Apply with `pnpm db:migrate-exclusive-slot-indexes` — it refuses to run until `pnpm db:migrate-exclusive-slots --apply` has normalized any legacy duplicates (a unique index cannot be created over existing collisions). Verified by `pnpm test:slot-indexes`.
- **Rep availability is not a constraint.** A specific `repId` is recorded but not treated as a 1-at-a-time resource. Only the attendee side (blackouts + own meetings) and the sponsor's exclusive slot (one meeting per block) are enforced — with slots exclusive per sponsor, a rep can no longer be double-booked within one company's schedule, only across companies if they rep for several.
