// Company-centric meeting engine — pure, prisma-injected scheduling logic.
//
// This module is imported directly (type-stripped) by scripts/test-meeting-engine.mjs,
// so it MUST stay self-contained: no relative imports of sibling modules, no app
// imports. The prisma client is always injected by the caller. Only type-only
// imports (erased at runtime) are allowed.
import type { Prisma, PrismaClient } from '@prisma/client'

// A loose prisma surface so tests can pass either the real client or a subset.
type Db = PrismaClient

// ── Rooms / tables ──────────────────────────────────────────────────────────
// Time slots are EXCLUSIVE: a sponsor holds at most ONE confirmed meeting per
// time block (MEETINGS_PER_BLOCK below), and an attendee at most one meeting
// of any kind per block. A slot with a meeting is closed — never double-booked.
// MEETING_ROOMS survives as the set of physical table labels a meeting can be
// pinned to (the Location column, check-in floor grid, assign/reschedule
// pickers); it no longer grants extra per-block capacity.
export interface MeetingRoom {
  name: string
  capacity: number
}
export const MEETING_ROOMS: MeetingRoom[] = [
  { name: 'Table 1', capacity: 1 },
  { name: 'Table 2', capacity: 1 },
  { name: 'Table 3', capacity: 1 },
  { name: 'Table 4', capacity: 1 },
  { name: 'Table 5', capacity: 1 },
  { name: 'Table 6', capacity: 1 },
  { name: 'Table 7', capacity: 1 },
  { name: 'Table 8', capacity: 1 },
  { name: 'Networking Lounge', capacity: 4 },
]
// A time slot is exclusive per sponsor: one confirmed meeting closes the block.
// Every capacity gate (matrix, availability, guards, auto-scheduler) derives
// from this constant.
export const MEETINGS_PER_BLOCK = 1
export function roomByName(name: string | null | undefined): MeetingRoom | null {
  if (!name) return null
  return MEETING_ROOMS.find(r => r.name === name) ?? null
}

// DEFAULT target number of confirmed meetings per company, used for the
// fill-rate meter. Admins can now change this (and set per-sponsor overrides)
// via the meeting-requirement settings below; this constant remains the
// fallback default and is still imported by apps and seed scripts.
export const FILL_TARGET = 10

// DEFAULT target number of confirmed meetings each attendee is expected to have
// across the whole conference. Drives the per-person "current / required"
// widget in the Companies scheduler grid. Admin-configurable via the
// meeting-requirement settings below; kept exported as the fallback default.
export const REQUIRED_MEETINGS_PER_PERSON = 5

// ── Meeting requirement settings ─────────────────────────────────────────────
// Admin-configurable meeting requirements (apps/web → Meetings → Settings):
//   1. Meetings required from each attendee — one global number.
//   2. Meetings required from each sponsor company — a global default plus
//      per-sponsor overrides.
// Persistence mirrors chat-settings.ts / RolePermission: the repo has no
// migration history, so we own the MeetingRequirementSetting table with a
// defensive CREATE TABLE IF NOT EXISTS whose column shape matches the model in
// schema.prisma exactly (a future `prisma db push` is a no-op). Rows are keyed
// (scope, subjectId): ATTENDEE_GLOBAL and SPONSOR_DEFAULT use subjectId '',
// SPONSOR uses subjectId = Sponsor.id. `settings` is JSON {"required": <int>}.
// Reads FAIL OPEN to the constant defaults — a settings hiccup should never
// break the scheduler read paths. Writes propagate errors.

export interface MeetingRequirementSettings {
  attendeeRequired: number                 // meetings required from each attendee (global)
  sponsorDefaultRequired: number           // default meetings required from each sponsor company
  sponsorOverrides: Record<string, number> // sponsorId -> per-company override of the default
}

export const DEFAULT_MEETING_REQUIREMENTS: MeetingRequirementSettings = {
  attendeeRequired: REQUIRED_MEETINGS_PER_PERSON,   // 5
  sponsorDefaultRequired: FILL_TARGET,              // 10
  sponsorOverrides: {},
}

export const REQUIREMENT_SCOPE = {
  ATTENDEE_GLOBAL: 'ATTENDEE_GLOBAL',
  SPONSOR_DEFAULT: 'SPONSOR_DEFAULT',
  SPONSOR: 'SPONSOR',
} as const
export type RequirementScope = (typeof REQUIREMENT_SCOPE)[keyof typeof REQUIREMENT_SCOPE]

// Clamp arbitrary/hostile input to an integer in [0, 99]; non-numbers -> fallback.
export function normalizeRequiredCount(raw: unknown, fallback: number): number {
  if (raw == null || raw === '') return fallback // Number() would coerce these to 0
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(99, Math.max(0, Math.trunc(n)))
}

// This sponsor's confirmed-meeting target: per-company override if one exists,
// otherwise the global sponsor default.
export function requiredMeetingsForSponsor(settings: MeetingRequirementSettings, sponsorId: string): number {
  const override = settings.sponsorOverrides[sponsorId]
  return typeof override === 'number' ? override : settings.sponsorDefaultRequired
}

const MEETING_REQUIREMENTS_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "MeetingRequirementSetting" (
  "scope" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "settings" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("scope", "subjectId")
)`

let requirementsEnsured: Promise<void> | null = null
// Memoized per process; IF NOT EXISTS makes re-runs harmless if a serverless
// instance resets the module. Reset on failure so a transient error retries.
export function ensureMeetingRequirementsTable(prismaClient: PrismaClient): Promise<void> {
  if (!requirementsEnsured) {
    requirementsEnsured = prismaClient
      .$executeRawUnsafe(MEETING_REQUIREMENTS_TABLE_SQL)
      .then(() => undefined)
      .catch(err => {
        requirementsEnsured = null
        throw err
      })
  }
  return requirementsEnsured
}

type RequirementRow = { scope: string; subjectId: string; settings: string }

// Pull the integer out of a stored `{"required": <int>}` JSON blob; null if the
// row is unparsable or non-numeric so the caller can skip / fall back.
function parseRequired(raw: string): number | null {
  try {
    const parsed = JSON.parse(raw)
    const val = parsed && typeof parsed === 'object' ? (parsed as { required?: unknown }).required : null
    return typeof val === 'number' && Number.isFinite(val) ? val : null
  } catch {
    return null
  }
}

// Full snapshot of the meeting-requirement settings. FAILS OPEN to the constant
// defaults on any error — the scheduler read paths must never break on this.
export async function getMeetingRequirementSettings(prismaClient: PrismaClient): Promise<MeetingRequirementSettings> {
  const out: MeetingRequirementSettings = { ...DEFAULT_MEETING_REQUIREMENTS, sponsorOverrides: {} }
  try {
    await ensureMeetingRequirementsTable(prismaClient)
    const rows = await prismaClient.$queryRawUnsafe<RequirementRow[]>(
      `SELECT "scope", "subjectId", "settings" FROM "MeetingRequirementSetting"`,
    )
    for (const row of rows) {
      const stored = parseRequired(row.settings)
      if (stored === null) continue // bad JSON / non-numeric — ignore the row
      if (row.scope === REQUIREMENT_SCOPE.ATTENDEE_GLOBAL) {
        out.attendeeRequired = normalizeRequiredCount(stored, DEFAULT_MEETING_REQUIREMENTS.attendeeRequired)
      } else if (row.scope === REQUIREMENT_SCOPE.SPONSOR_DEFAULT) {
        out.sponsorDefaultRequired = normalizeRequiredCount(stored, DEFAULT_MEETING_REQUIREMENTS.sponsorDefaultRequired)
      } else if (row.scope === REQUIREMENT_SCOPE.SPONSOR && row.subjectId) {
        out.sponsorOverrides[row.subjectId] = normalizeRequiredCount(stored, DEFAULT_MEETING_REQUIREMENTS.sponsorDefaultRequired)
      }
    }
  } catch (err) {
    // Fail open: return the constant defaults rather than break the scheduler.
    console.error('[meeting-requirements] read failed, returning defaults:', err)
    return { ...DEFAULT_MEETING_REQUIREMENTS, sponsorOverrides: {} }
  }
  return out
}

// Bulk upsert from the admin settings surface. Only the provided slices are
// written, so the client can send just what the user actually changed. An
// override entry with `required == null` DELETEs that sponsor's override row
// (reverting the company to the global default). Unlike reads, write errors
// propagate — the admin must know a save didn't land.
export async function saveMeetingRequirementSettings(
  prismaClient: PrismaClient,
  payload: {
    attendeeRequired?: number
    sponsorDefaultRequired?: number
    sponsorOverrides?: { sponsorId: string; required: number | null }[]
  },
): Promise<void> {
  await ensureMeetingRequirementsTable(prismaClient)
  const now = new Date().toISOString()
  const upsert = (scope: RequirementScope, subjectId: string, required: number) =>
    prismaClient.$executeRawUnsafe(
      `INSERT INTO "MeetingRequirementSetting" ("scope", "subjectId", "settings", "updatedAt")
       VALUES (?, ?, ?, ?)
       ON CONFLICT("scope", "subjectId") DO UPDATE SET
         "settings" = excluded."settings",
         "updatedAt" = excluded."updatedAt"`,
      scope,
      subjectId,
      JSON.stringify({ required }),
      now,
    )

  if (payload.attendeeRequired !== undefined) {
    await upsert(
      REQUIREMENT_SCOPE.ATTENDEE_GLOBAL,
      '',
      normalizeRequiredCount(payload.attendeeRequired, DEFAULT_MEETING_REQUIREMENTS.attendeeRequired),
    )
  }
  if (payload.sponsorDefaultRequired !== undefined) {
    await upsert(
      REQUIREMENT_SCOPE.SPONSOR_DEFAULT,
      '',
      normalizeRequiredCount(payload.sponsorDefaultRequired, DEFAULT_MEETING_REQUIREMENTS.sponsorDefaultRequired),
    )
  }
  for (const o of payload.sponsorOverrides ?? []) {
    if (!o?.sponsorId) continue
    if (o.required == null) {
      await prismaClient.$executeRawUnsafe(
        `DELETE FROM "MeetingRequirementSetting" WHERE "scope" = ? AND "subjectId" = ?`,
        REQUIREMENT_SCOPE.SPONSOR,
        o.sponsorId,
      )
      continue
    }
    await upsert(
      REQUIREMENT_SCOPE.SPONSOR,
      o.sponsorId,
      normalizeRequiredCount(o.required, DEFAULT_MEETING_REQUIREMENTS.sponsorDefaultRequired),
    )
  }
}

// ── Meeting tables (admin-managed inventory) ─────────────────────────────────
// The physical table inventory (apps/web → Meetings → Settings → Meeting
// Tables). MEETING_ROOMS above remains the constant DEFAULT set; admins can
// add / rename / resize / remove tables, persisted one row per table in
// MeetingTableSetting (defensive CREATE TABLE IF NOT EXISTS, column shape
// matching schema.prisma exactly — same pattern as MeetingRequirementSetting).
// Reads FAIL OPEN to MEETING_ROOMS: zero rows means "never customized" and a
// read error must never break a scheduler path. The first write op seeds the
// default set so subsequent ops edit real rows. Renames migrate every
// SponsorMeeting.location that carries the old label, so existing assignments
// follow the table. Write errors propagate.

export const MAX_TABLE_NAME_LENGTH = 40

// Trim + cap a table label; null when empty/non-string so callers can reject.
export function normalizeTableName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().slice(0, MAX_TABLE_NAME_LENGTH).trim()
  return name.length > 0 ? name : null
}

// Clamp arbitrary/hostile input to an integer capacity in [1, 99].
export function normalizeTableCapacity(raw: unknown, fallback = 1): number {
  if (raw == null || raw === '') return fallback
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.min(99, Math.max(1, Math.trunc(n)))
}

const MEETING_TABLES_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "MeetingTableSetting" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "capacity" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "updatedAt" DATETIME NOT NULL
)`

let meetingTablesEnsured: Promise<void> | null = null
// Memoized per process; IF NOT EXISTS makes re-runs harmless. Reset on failure
// so a transient error retries instead of poisoning the module for its lifetime.
export function ensureMeetingTablesTable(prismaClient: PrismaClient): Promise<void> {
  if (!meetingTablesEnsured) {
    meetingTablesEnsured = prismaClient
      .$executeRawUnsafe(MEETING_TABLES_TABLE_SQL)
      .then(() => undefined)
      .catch(err => {
        meetingTablesEnsured = null
        throw err
      })
  }
  return meetingTablesEnsured
}

// Raw SELECT shape. INTEGER columns come back as BigInt through the raw-query
// path on some drivers, so both numeric fields go through Number().
type MeetingTableRow = { name: string; capacity: number | bigint; position: number | bigint }

async function readMeetingTableRows(prismaClient: PrismaClient): Promise<{ name: string; capacity: number; position: number }[]> {
  const rows = await prismaClient.$queryRawUnsafe<MeetingTableRow[]>(
    `SELECT "name", "capacity", "position" FROM "MeetingTableSetting" ORDER BY "position" ASC, "name" ASC`,
  )
  const out: { name: string; capacity: number; position: number }[] = []
  for (const row of rows) {
    const name = normalizeTableName(row.name)
    if (!name) continue // hand-edited junk row — skip rather than break
    out.push({ name, capacity: normalizeTableCapacity(Number(row.capacity)), position: Number(row.position) })
  }
  return out
}

// The current table inventory. FAILS OPEN to MEETING_ROOMS on any error, and
// zero rows also means the defaults (the inventory has never been customized).
export async function getMeetingTables(prismaClient: PrismaClient): Promise<MeetingRoom[]> {
  try {
    await ensureMeetingTablesTable(prismaClient)
    const rows = await readMeetingTableRows(prismaClient)
    if (rows.length === 0) return MEETING_ROOMS.map(r => ({ ...r }))
    return rows.map(r => ({ name: r.name, capacity: r.capacity }))
  } catch (err) {
    console.error('[meeting-tables] read failed, returning defaults:', err)
    return MEETING_ROOMS.map(r => ({ ...r }))
  }
}

// First write op against a never-customized inventory materializes the default
// set, so edits always operate on real rows and reads stay coherent.
async function seedDefaultTablesIfEmpty(prismaClient: PrismaClient): Promise<void> {
  const rows = await prismaClient.$queryRawUnsafe<{ n: number | bigint }[]>(
    `SELECT COUNT(*) AS n FROM "MeetingTableSetting"`,
  )
  if (Number(rows[0]?.n ?? 0) > 0) return
  const now = new Date().toISOString()
  for (let i = 0; i < MEETING_ROOMS.length; i++) {
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO "MeetingTableSetting" ("name", "capacity", "position", "updatedAt")
       VALUES (?, ?, ?, ?) ON CONFLICT("name") DO NOTHING`,
      MEETING_ROOMS[i].name, MEETING_ROOMS[i].capacity, i, now,
    )
  }
}

export type MeetingTableOp =
  | { op: 'add'; name: string; capacity?: number }
  | { op: 'update'; name: string; newName?: string; capacity?: number }
  | { op: 'remove'; name: string }

// Apply one inventory operation and return the fresh inventory. Guards:
//   add    — DUPLICATE_TABLE on a (case-insensitive) name clash.
//   update — TABLE_NOT_FOUND for an unknown table; renames also migrate every
//            SponsorMeeting.location carrying the old label (all statuses, so
//            history follows the rename).
//   remove — TABLE_NOT_FOUND / LAST_TABLE (the inventory can never go empty:
//            engine paths rely on tables[0] as the default assignment) /
//            TABLE_IN_USE while any CONFIRMED meeting still sits at the table.
export async function saveMeetingTables(prismaClient: PrismaClient, op: MeetingTableOp): Promise<MeetingRoom[]> {
  await ensureMeetingTablesTable(prismaClient)
  await seedDefaultTablesIfEmpty(prismaClient)
  const now = new Date().toISOString()
  const existing = await readMeetingTableRows(prismaClient)
  const byLower = new Map(existing.map(t => [t.name.toLowerCase(), t]))

  if (op.op === 'add') {
    const name = normalizeTableName(op.name)
    if (!name) throw new EngineError('BAD_STATUS', 'Table name is required')
    if (byLower.has(name.toLowerCase())) {
      throw new EngineError('DUPLICATE_TABLE', `A table named “${byLower.get(name.toLowerCase())!.name}” already exists`)
    }
    const position = existing.length ? Math.max(...existing.map(t => t.position)) + 1 : 0
    await prismaClient.$executeRawUnsafe(
      `INSERT INTO "MeetingTableSetting" ("name", "capacity", "position", "updatedAt") VALUES (?, ?, ?, ?)`,
      name, normalizeTableCapacity(op.capacity ?? 1), position, now,
    )
  } else if (op.op === 'update') {
    const name = normalizeTableName(op.name)
    const row = name ? existing.find(t => t.name === name) : undefined
    if (!row) throw new EngineError('TABLE_NOT_FOUND', `No table named “${op.name}”`)
    const wantsRename = op.newName !== undefined
    const newName = wantsRename ? normalizeTableName(op.newName) : row.name
    if (!newName) throw new EngineError('BAD_STATUS', 'New table name is required')
    if (newName !== row.name) {
      const clash = byLower.get(newName.toLowerCase())
      if (clash && clash.name !== row.name) {
        throw new EngineError('DUPLICATE_TABLE', `A table named “${clash.name}” already exists`)
      }
    }
    const capacity = op.capacity !== undefined ? normalizeTableCapacity(op.capacity) : row.capacity
    await prismaClient.$executeRawUnsafe(
      `UPDATE "MeetingTableSetting" SET "name" = ?, "capacity" = ?, "updatedAt" = ? WHERE "name" = ?`,
      newName, capacity, now, row.name,
    )
    if (newName !== row.name) {
      // Existing assignments follow the rename.
      await prismaClient.$executeRawUnsafe(
        `UPDATE "SponsorMeeting" SET "location" = ? WHERE "location" = ?`,
        newName, row.name,
      )
    }
  } else {
    const name = normalizeTableName(op.name)
    const row = name ? existing.find(t => t.name === name) : undefined
    if (!row) throw new EngineError('TABLE_NOT_FOUND', `No table named “${op.name}”`)
    if (existing.length <= 1) throw new EngineError('LAST_TABLE', 'At least one table must remain')
    const assigned = await prismaClient.sponsorMeeting.count({
      where: { status: 'CONFIRMED', location: row.name },
    })
    if (assigned > 0) {
      throw new EngineError(
        'TABLE_IN_USE',
        `${assigned} confirmed meeting${assigned === 1 ? ' is' : 's are'} assigned to “${row.name}” — reassign or unassign them first`,
      )
    }
    await prismaClient.$executeRawUnsafe(`DELETE FROM "MeetingTableSetting" WHERE "name" = ?`, row.name)
  }

  return getMeetingTables(prismaClient)
}

// ── Priority tiers ────────────────────────────────────────────────────────────
// The requester (attendee or sponsor) tags each meeting request with how strong a
// fit it is. The auto-scheduler fills Best Fit requests first, then Med, then Low.
export type MeetingPriority = 'BEST_FIT' | 'MED' | 'LOW'
export const MEETING_PRIORITIES: MeetingPriority[] = ['BEST_FIT', 'MED', 'LOW']
export function normalizePriority(raw: string | null | undefined): MeetingPriority {
  return raw === 'BEST_FIT' || raw === 'MED' || raw === 'LOW' ? raw : 'MED'
}
// Lower rank schedules first: BEST_FIT (0) → MED (1) → LOW (2).
export function priorityRank(p: MeetingPriority): number {
  return p === 'BEST_FIT' ? 0 : p === 'MED' ? 1 : 2
}
export function priorityLabel(p: MeetingPriority): string {
  return p === 'BEST_FIT' ? 'Best Fit' : p === 'MED' ? 'Med' : 'Low'
}

// ── Interest scoring ────────────────────────────────────────────────────────
export type InterestLevel = 'High' | 'Medium' | 'Low'
export function interestLevel(score: number): InterestLevel {
  if (score >= 67) return 'High'
  if (score >= 34) return 'Medium'
  return 'Low'
}
// eTail shows interest as an n/5 rating (e.g. "Interest Level: 4/5").
export function interestOutOf5(score: number): number {
  const n = Math.round(score / 20)
  return score > 0 && n === 0 ? 1 : n
}

export function parseSolutions(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Ported from the recommendations route's scoreSponsorVsAttendee (solutions only).
// A sponsor "seeking" a solution the user "offers" is the strongest signal (3);
// the reverse (sponsor offers what the user seeks) is secondary (2).
export function scoreSolutionsMatch(
  sponsorSeeking: string[],
  sponsorOffering: string[],
  userOffering: string[],
  userSeeking: string[],
): { score: number; matched: string[] } {
  const matched: string[] = []
  let raw = 0
  for (const s of sponsorSeeking) {
    if (userOffering.includes(s)) { raw += 3; matched.push(s) }
  }
  for (const s of sponsorOffering) {
    if (userSeeking.includes(s) && !matched.includes(s)) { raw += 2; matched.push(s) }
  }
  const maxPossible = sponsorSeeking.length * 3 + sponsorOffering.length * 2
  const score = maxPossible > 0 ? Math.min(100, Math.round((raw / maxPossible) * 100)) : 0
  return { score, matched }
}

// ── Typed engine errors ─────────────────────────────────────────────────────
export type EngineErrorCode =
  | 'REQUEST_NOT_FOUND'
  | 'MEETING_NOT_FOUND'
  | 'NOT_A_SPONSOR_REQUEST'
  | 'BAD_STATUS'
  | 'UNKNOWN_ROOM'
  | 'CANDIDATE_BUSY'
  | 'SPONSOR_FULL'
  | 'ALREADY_SCHEDULED'
  | 'TABLE_NOT_FOUND'
  | 'DUPLICATE_TABLE'
  | 'TABLE_IN_USE'
  | 'TABLE_TAKEN'
  | 'LAST_TABLE'
export class EngineError extends Error {
  code: EngineErrorCode
  constructor(code: EngineErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'EngineError'
    this.code = code
  }
}

// The HTTP classification of each error code is a property of the engine's
// error vocabulary, not of any one app — both the admin scheduler API and the
// staff console API derive their responses from this single map so a new code
// can never return 409 in one portal and 400 in the other.
const NOT_FOUND_CODES: readonly EngineErrorCode[] = ['REQUEST_NOT_FOUND', 'MEETING_NOT_FOUND', 'TABLE_NOT_FOUND']
const CONFLICT_CODES: readonly EngineErrorCode[] = [
  'CANDIDATE_BUSY', 'SPONSOR_FULL', 'ALREADY_SCHEDULED', 'DUPLICATE_TABLE', 'TABLE_IN_USE', 'TABLE_TAKEN',
]
export function engineErrorHttpStatus(code: EngineErrorCode): number {
  if (NOT_FOUND_CODES.includes(code)) return 404
  if (CONFLICT_CODES.includes(code)) return 409
  return 400
}

// ── DB-level exclusive-slot backstop ─────────────────────────────────────────
// Partial unique indexes on SponsorMeeting enforce the exclusive-slot invariant
// at the database, closing the sub-millisecond TOCTOU window the application
// guards (assertBlockOpen, the pairExisting checks) cannot: two truly
// simultaneous writes both pass their read-then-write checks, but only one can
// survive the index. Created by scripts/migrate-exclusive-slot-indexes.mjs
// (which must run AFTER migrate-exclusive-slots.mjs has normalized any legacy
// duplicates, or index creation fails). Names are referenced by the migration
// and matched in the constraint translator below.
export const EXCLUSIVE_SLOT_INDEXES = {
  sponsorBlock: 'SponsorMeeting_sponsor_block_confirmed_uq', // (sponsorId, timeBlockId) WHERE status='CONFIRMED'
  userBlock: 'SponsorMeeting_user_block_confirmed_uq',       // (userId, timeBlockId)   WHERE status='CONFIRMED'
  sponsorUser: 'SponsorMeeting_sponsor_user_confirmed_uq',   // (sponsorId, userId)     WHERE status='CONFIRMED'
} as const

// Translate a unique-constraint violation on one of the exclusive-slot indexes
// into the matching typed EngineError, so an index-caught race surfaces as a
// clean 409 (via engineErrorHttpStatus) instead of a raw 500. Recognizes both
// Prisma's P2002 shape and the libSQL adapter's raw "UNIQUE constraint failed"
// message. Returns null for any other error, which the caller should rethrow.
export function exclusiveSlotConstraintError(err: unknown): EngineError | null {
  const e = err as { code?: string; message?: string; meta?: { target?: unknown } }
  const isUnique = e?.code === 'P2002' ||
    (typeof e?.message === 'string' && e.message.includes('UNIQUE constraint failed'))
  if (!isUnique) return null
  // The violation identifier is reported either as the index NAME (Prisma may
  // surface it) or as the raw "table.col, table.col" column list (libSQL). Match
  // both, and require the exact column PAIR so an unrelated unique violation
  // (e.g. a primary-key collision) returns null and propagates as a 500 rather
  // than being masked as a scheduling conflict. Column checks are
  // case-sensitive, so the "SponsorMeeting" table prefix never matches the
  // lowercase "sponsorId" column token.
  const hay = (Array.isArray(e?.meta?.target)
    ? (e!.meta!.target as unknown[]).join(',')
    : String(e?.meta?.target ?? '')) + ' ' + (e?.message ?? '')
  const col = (c: string) => hay.includes(c)
  if (hay.includes(EXCLUSIVE_SLOT_INDEXES.userBlock) || (col('userId') && col('timeBlockId') && !col('sponsorId')))
    return new EngineError('CANDIDATE_BUSY', 'The attendee already has a meeting in that time block')
  if (hay.includes(EXCLUSIVE_SLOT_INDEXES.sponsorUser) || (col('sponsorId') && col('userId') && !col('timeBlockId')))
    return new EngineError('ALREADY_SCHEDULED', 'This pairing already has a confirmed meeting')
  if (hay.includes(EXCLUSIVE_SLOT_INDEXES.sponsorBlock) || (col('sponsorId') && col('timeBlockId') && !col('userId')))
    return new EngineError('SPONSOR_FULL', 'The company already has a meeting in that time block')
  return null
}

// Run a write and, if it fails on an exclusive-slot index, rethrow the mapped
// EngineError so every caller gets the same typed conflict the guards produce.
export async function commitOrConflict<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    const conflict = exclusiveSlotConstraintError(err)
    if (conflict) throw conflict
    throw err
  }
}

// ── Party resolution ────────────────────────────────────────────────────────
// A request "belongs" to a sponsor when either the request targets the sponsor
// (an attendee → sponsor ask) or the requester is a rep of the sponsor
// (a sponsor → attendee ask). Returns the non-sponsor user (the candidate).
export interface ResolvedParties {
  sponsorId: string
  userId: string       // the attendee/speaker being met
  repId: string | null // the sponsor rep, when the rep initiated the request
}
interface RequestLike {
  requesterId: string
  targetUserId: string | null
  targetSponsorId: string | null
  requester?: { sponsorId?: string | null } | null
}
export function resolveParties(req: RequestLike): ResolvedParties | null {
  // Precedence: a request that targets a sponsor is always treated as
  // attendee→sponsor (the requester is the candidate), even if the requester
  // also happens to carry a sponsorId. Rep→attendee is only inferred when there
  // is no sponsor target. These two shapes are mutually exclusive in practice.
  if (req.targetSponsorId) {
    return { sponsorId: req.targetSponsorId, userId: req.requesterId, repId: null }
  }
  const repSponsor = req.requester?.sponsorId ?? null
  if (repSponsor && req.targetUserId) {
    return { sponsorId: repSponsor, userId: req.targetUserId, repId: req.requesterId }
  }
  return null
}

// ── Time helpers ────────────────────────────────────────────────────────────
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime()
}
// Slots are stored as real UTC instants; days are grouped and labeled in the
// event timezone so every surface reads in local conference time (e.g. a block
// stored at 18:00Z is an 11 AM PDT slot and belongs to that PDT day).
export const EVENT_TZ = 'America/Los_Angeles'
const DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: EVENT_TZ,
})
function dayKeyOf(d: Date): string {
  return DAY_KEY_FMT.format(d) // yyyy-mm-dd in EVENT_TZ
}
const DAY_LABEL_FMT = new Intl.DateTimeFormat('en-US', {
  weekday: 'short', month: 'short', day: 'numeric', timeZone: EVENT_TZ,
})
export function dayLabel(d: Date): string {
  return DAY_LABEL_FMT.format(d)
}

async function resolveConferenceId(prisma: Db, conferenceId?: string): Promise<string> {
  if (conferenceId) return conferenceId
  const active = await prisma.conference.findFirst({ where: { active: true }, select: { id: true } })
  return active?.id ?? 'conf-2025'
}

// ── Company directory ───────────────────────────────────────────────────────
export interface DirectoryRow {
  id: string
  name: string
  logoUrl: string | null
  tier: string
  createdAt: string          // Company "Created"
  lastLogin: string | null   // most recent rep activity (proxy)
  numLogins: number          // number of company reps (proxy for login count)
  receiveRequests: boolean   // company accepts meeting requests
  requestsMade: number       // requests this company's reps sent to attendees
  requestsReceived: number   // requests targeting this company
  confirmed: number          // Total Confirmed Meetings
  // Retained for internal use (bank size / fill meter), not eTail columns.
  requests: number
  pending: number
  unscheduled: number
  requiredMeetings: number   // per-company confirmed-meeting target — admin override or the sponsor default
  fillRate: number
}
export async function getCompanyDirectory(prisma: Db, conferenceId?: string): Promise<DirectoryRow[]> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const [sponsors, requests, meetings, reps, settings] = await Promise.all([
    prisma.sponsor.findMany({
      where: { conferenceId: confId },
      select: { id: true, name: true, logoUrl: true, tier: true, createdAt: true },
      orderBy: { name: 'asc' },
    }),
    prisma.meetingRequest.findMany({
      where: { status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
      select: {
        requesterId: true, targetUserId: true, targetSponsorId: true, status: true,
        requester: { select: { sponsorId: true } },
      },
    }),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED' },
      select: { sponsorId: true, userId: true },
    }),
    prisma.user.groupBy({
      by: ['sponsorId'],
      where: { sponsorId: { not: null } },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    getMeetingRequirementSettings(prisma),
  ])

  const confirmedBySponsor = new Map<string, number>()
  const scheduledPairs = new Set<string>() // `${sponsorId}::${userId}` with a live meeting
  for (const m of meetings) {
    confirmedBySponsor.set(m.sponsorId, (confirmedBySponsor.get(m.sponsorId) ?? 0) + 1)
    scheduledPairs.add(`${m.sponsorId}::${m.userId}`)
  }

  const repStats = new Map<string, { count: number; lastLogin: Date | null }>()
  for (const r of reps) if (r.sponsorId) repStats.set(r.sponsorId, { count: r._count._all, lastLogin: r._max.updatedAt ?? null })

  const agg = new Map<string, { requests: number; pending: number; unscheduled: number; made: number; received: number }>()
  for (const r of requests) {
    const parties = resolveParties(r)
    if (!parties) continue
    const cur = agg.get(parties.sponsorId) ?? { requests: 0, pending: 0, unscheduled: 0, made: 0, received: 0 }
    cur.requests++
    if (r.targetSponsorId) cur.received++       // attendee → this company
    else cur.made++                             // this company's rep → attendee
    if (r.status === 'PENDING') cur.pending++
    else if (r.status === 'APPROVED' && !scheduledPairs.has(`${parties.sponsorId}::${parties.userId}`)) cur.unscheduled++
    agg.set(parties.sponsorId, cur)
  }

  return sponsors.map(s => {
    const a = agg.get(s.id) ?? { requests: 0, pending: 0, unscheduled: 0, made: 0, received: 0 }
    const confirmed = confirmedBySponsor.get(s.id) ?? 0
    const rep = repStats.get(s.id)
    const required = requiredMeetingsForSponsor(settings, s.id)
    return {
      id: s.id, name: s.name, logoUrl: s.logoUrl, tier: s.tier,
      createdAt: s.createdAt.toISOString(),
      lastLogin: rep?.lastLogin ? rep.lastLogin.toISOString() : null,
      numLogins: rep?.count ?? 0,
      receiveRequests: true,
      requestsMade: a.made,
      requestsReceived: a.received,
      confirmed,
      requests: a.requests, pending: a.pending, unscheduled: a.unscheduled,
      requiredMeetings: required,
      fillRate: required > 0 ? Math.min(1, confirmed / required) : 1,
    }
  })
}

// ── Schedule matrix (per company) ───────────────────────────────────────────
export interface BankItem {
  requestId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  message: string | null
  priority: MeetingPriority
  rank: number
  total: number
  interest: InterestLevel
  interestScore: number
  interestOutOf5: number
  matched: string[]
  confirmedCount: number // the candidate's load across all companies
  status: 'Inbound' | 'Approved'
}
export interface PendingItem {
  requestId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  message: string | null
  priority: MeetingPriority
  interest: InterestLevel
  interestScore: number
}
// A candidate already scheduled with this company (sidebar "Already Scheduled").
export interface ScheduledItem {
  sponsorMeetingId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  confirmedCount: number
  timeBlockId: string
  room: string | null
}
// A declined/withdrawn request (sidebar "Misc"). REJECTED requests read as
// 'Declined'; CANCELLED ones (cancel-with-remove or withdrawal) read as
// 'Removed'. Deliberately slim — no avatar/solutions payload — because the
// terminal-request list grows without bound over a conference's life.
export interface MiscItem {
  requestId: string
  userId: string
  name: string
  company: string | null
  status: 'Declined' | 'Removed'
}
export interface SlotMeeting {
  sponsorMeetingId: string
  userId: string
  name: string
  company: string | null
  image: string | null
  room: string | null
  // This attendee's CONFIRMED meeting count across all companies — the numerator
  // of the per-person "current / required" widget. Denominator is the matrix's
  // requiredMeetingsPerPerson (the admin-configured global attendee requirement).
  confirmedCount: number
}
export interface MatrixSlot {
  timeBlockId: string
  startsAt: string
  endsAt: string
  meetings: SlotMeeting[]
  capacityLeft: number
}
export interface MatrixDay {
  dayKey: string
  label: string
  slots: MatrixSlot[]
}
// A user linked to the sponsor company (User.sponsorId) — the company's own
// reps, shown in the scheduler header. `jobTitle` is their role at the company.
export interface SponsorTeamMember {
  userId: string
  name: string
  jobTitle: string | null
  image: string | null
}
export interface ScheduleMatrix {
  sponsor: { id: string; name: string; logoUrl: string | null; tier: string }
  team: SponsorTeamMember[]
  rooms: MeetingRoom[]          // physical table labels (display only)
  slotCapacity: number          // meetings a sponsor may hold per block (exclusive: 1)
  bank: BankItem[]              // Unscheduled — APPROVED, awaiting a slot
  pending: PendingItem[]        // Unscheduled — PENDING (Inbound)
  alreadyScheduled: ScheduledItem[]
  misc: MiscItem[]              // Declined / withdrawn
  days: MatrixDay[]
  confirmedCount: number
  requiredMeetings: number          // this company's confirmed-meeting target (override or sponsor default)
  requiredMeetingsPerPerson: number // global attendee requirement (per-person widget denominator)
}

export async function getSponsorScheduleMatrix(
  prisma: Db, sponsorId: string, conferenceId?: string,
): Promise<ScheduleMatrix> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const sponsor = await prisma.sponsor.findUnique({
    where: { id: sponsorId },
    select: {
      id: true, name: true, logoUrl: true, tier: true,
      solutionsSeeking: true, solutionsOffering: true,
    },
  })
  if (!sponsor) throw new EngineError('REQUEST_NOT_FOUND', 'Sponsor not found')

  const [timeBlocks, sponsorMeetings, requests, terminalRequests, requirementSettings, teamUsers, tables] = await Promise.all([
    prisma.timeBlock.findMany({
      where: { conferenceId: confId },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    // Scope to this conference's blocks so meetings booked against another
    // conference never inflate the fill meter or list without a grid row.
    prisma.sponsorMeeting.findMany({
      where: { sponsorId, status: 'CONFIRMED', timeBlock: { conferenceId: confId } },
      select: {
        id: true, userId: true, timeBlockId: true, location: true,
        user: { select: { name: true, company: true, image: true } },
      },
    }),
    prisma.meetingRequest.findMany({
      where: {
        status: { in: ['PENDING', 'APPROVED'] },
        OR: [
          { targetSponsorId: sponsorId },
          { requester: { sponsorId } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, requesterId: true, targetUserId: true, targetSponsorId: true,
        status: true, message: true, priority: true, createdAt: true,
        requester: {
          select: {
            sponsorId: true, name: true, company: true, image: true,
            solutionsOffering: true, solutionsSeeking: true,
          },
        },
        targetUser: {
          select: {
            name: true, company: true, image: true,
            solutionsOffering: true, solutionsSeeking: true,
          },
        },
      },
    }),
    // Terminal requests only feed the "Misc" sidebar — fetch them slim (no
    // base64 avatars, no solutions blobs) and skip the scoring pipeline. The
    // CANCELLED graveyard grows forever, so this path must stay cheap.
    prisma.meetingRequest.findMany({
      where: {
        status: { in: ['REJECTED', 'CANCELLED'] },
        OR: [
          { targetSponsorId: sponsorId },
          { requester: { sponsorId } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, requesterId: true, targetUserId: true, targetSponsorId: true, status: true,
        requester: { select: { sponsorId: true, name: true, company: true } },
        targetUser: { select: { name: true, company: true } },
      },
    }),
    getMeetingRequirementSettings(prisma),
    prisma.user.findMany({
      where: { sponsorId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, jobTitle: true, image: true },
    }),
    getMeetingTables(prisma),
  ])

  const sponsorSeeking = parseSolutions(sponsor.solutionsSeeking)
  const sponsorOffering = parseSolutions(sponsor.solutionsOffering)

  // Score every request for ranking; rank across ALL active requests for the company.
  interface Scored {
    req: (typeof requests)[number]
    parties: ResolvedParties
    userName: string
    company: string | null
    image: string | null
    userOffering: string[]
    userSeeking: string[]
    score: number
    matched: string[]
  }
  const scored: Scored[] = []
  for (const req of requests) {
    const parties = resolveParties(req as RequestLike)
    if (!parties || parties.sponsorId !== sponsorId) continue
    // The candidate's profile is on whichever side is NOT the sponsor.
    const cand = req.targetSponsorId ? req.requester : req.targetUser
    const userOffering = parseSolutions(cand?.solutionsOffering ?? null)
    const userSeeking = parseSolutions(cand?.solutionsSeeking ?? null)
    const { score, matched } = scoreSolutionsMatch(sponsorSeeking, sponsorOffering, userOffering, userSeeking)
    scored.push({
      req, parties, userName: cand?.name ?? 'Unknown',
      company: cand?.company ?? null, image: cand?.image ?? null,
      userOffering, userSeeking, score, matched,
    }) // PENDING + APPROVED are ranked together
  }
  // Rank reflects the order the auto-scheduler will fill slots: priority tier
  // first (Best Fit → Med → Low), then fit score, then oldest request wins.
  scored.sort((a, b) =>
    priorityRank(normalizePriority(a.req.priority)) - priorityRank(normalizePriority(b.req.priority)) ||
    b.score - a.score ||
    a.req.createdAt.getTime() - b.req.createdAt.getTime())
  const total = scored.length
  const rankByRequestId = new Map<string, number>()
  scored.forEach((s, i) => rankByRequestId.set(s.req.id, i + 1))

  // A user already scheduled with this sponsor is not in the bank.
  const scheduledUserIds = new Set(sponsorMeetings.map(m => m.userId))

  // Load per-candidate confirmed-meeting counts (their load, across all companies).
  const candidateIds = Array.from(new Set([
    ...scored.map(s => s.parties.userId),
    ...sponsorMeetings.map(m => m.userId),
  ]))
  const loadCounts = candidateIds.length
    ? await prisma.sponsorMeeting.groupBy({
        by: ['userId'],
        where: { status: 'CONFIRMED', userId: { in: candidateIds } },
        _count: { _all: true },
      })
    : []
  const loadByUser = new Map<string, number>()
  for (const l of loadCounts) loadByUser.set(l.userId, l._count._all)

  const bank: BankItem[] = []
  const pending: PendingItem[] = []
  for (const s of scored) {
    if (s.req.status === 'PENDING') {
      pending.push({
        requestId: s.req.id, userId: s.parties.userId, name: s.userName,
        company: s.company, image: s.image, message: s.req.message,
        priority: normalizePriority(s.req.priority),
        interest: interestLevel(s.score), interestScore: s.score,
      })
      continue
    }
    // APPROVED
    if (scheduledUserIds.has(s.parties.userId)) continue // already has a meeting
    bank.push({
      requestId: s.req.id, userId: s.parties.userId, name: s.userName,
      company: s.company, image: s.image, message: s.req.message,
      priority: normalizePriority(s.req.priority),
      rank: rankByRequestId.get(s.req.id) ?? 0, total,
      interest: interestLevel(s.score), interestScore: s.score,
      interestOutOf5: interestOutOf5(s.score), matched: s.matched,
      confirmedCount: loadByUser.get(s.parties.userId) ?? 0,
      status: 'Approved',
    })
  }

  // Sidebar "Misc" — declined (REJECTED) and removed (CANCELLED) requests.
  const misc: MiscItem[] = []
  for (const req of terminalRequests) {
    const parties = resolveParties(req as RequestLike)
    if (!parties || parties.sponsorId !== sponsorId) continue
    const cand = req.targetSponsorId ? req.requester : req.targetUser
    misc.push({
      requestId: req.id, userId: parties.userId,
      name: cand?.name ?? 'Unknown', company: cand?.company ?? null,
      status: req.status === 'CANCELLED' ? 'Removed' : 'Declined',
    })
  }

  // Build day → slots with their meetings.
  const meetingsByBlock = new Map<string, SlotMeeting[]>()
  for (const m of sponsorMeetings) {
    const arr = meetingsByBlock.get(m.timeBlockId) ?? []
    arr.push({
      sponsorMeetingId: m.id, userId: m.userId,
      name: m.user?.name ?? 'Unknown', company: m.user?.company ?? null,
      image: m.user?.image ?? null, room: m.location,
      confirmedCount: loadByUser.get(m.userId) ?? 0,
    })
    meetingsByBlock.set(m.timeBlockId, arr)
  }
  const dayMap = new Map<string, MatrixDay>()
  for (const tb of timeBlocks) {
    const key = dayKeyOf(tb.startsAt)
    let day = dayMap.get(key)
    if (!day) {
      day = { dayKey: key, label: dayLabel(tb.startsAt), slots: [] }
      dayMap.set(key, day)
    }
    const meetings = meetingsByBlock.get(tb.id) ?? []
    day.slots.push({
      timeBlockId: tb.id,
      startsAt: tb.startsAt.toISOString(),
      endsAt: tb.endsAt.toISOString(),
      meetings,
      capacityLeft: Math.max(0, MEETINGS_PER_BLOCK - meetings.length),
    })
  }

  // Sidebar "Already Scheduled" — candidates with a confirmed meeting here.
  const alreadyScheduled: ScheduledItem[] = sponsorMeetings.map(m => ({
    sponsorMeetingId: m.id, userId: m.userId,
    name: m.user?.name ?? 'Unknown', company: m.user?.company ?? null,
    image: m.user?.image ?? null,
    confirmedCount: loadByUser.get(m.userId) ?? 0,
    timeBlockId: m.timeBlockId, room: m.location,
  }))

  return {
    sponsor: { id: sponsor.id, name: sponsor.name, logoUrl: sponsor.logoUrl, tier: sponsor.tier },
    team: teamUsers.map(u => ({
      userId: u.id, name: u.name ?? 'Unknown', jobTitle: u.jobTitle, image: u.image,
    })),
    rooms: tables,
    slotCapacity: MEETINGS_PER_BLOCK,
    bank,
    pending,
    alreadyScheduled,
    misc,
    days: Array.from(dayMap.values()),
    confirmedCount: sponsorMeetings.length,
    requiredMeetings: requiredMeetingsForSponsor(requirementSettings, sponsorId),
    requiredMeetingsPerPerson: requirementSettings.attendeeRequired,
  }
}

// ── Availability (for the assign / reschedule sheets) ───────────────────────
export interface RoomAvailability {
  name: string
  capacity: number
  occupancy: number
  available: boolean
}
export interface AvailabilitySlot {
  timeBlockId: string
  startsAt: string
  endsAt: string
  candidateFree: boolean
  sponsorHasCapacity: boolean
  available: boolean // candidateFree && sponsorHasCapacity && some room free
  rooms: RoomAvailability[]
}
export interface AvailabilityDay {
  dayKey: string
  label: string
  slots: AvailabilitySlot[]
}
export interface CandidateAvailability {
  sponsorId: string
  userId: string
  days: AvailabilityDay[]
}

// Shared core: compute availability for a (sponsor, candidate) pair, optionally
// excluding one SponsorMeeting (used when rescheduling so the moved meeting does
// not conflict with itself).
async function computeAvailability(
  prisma: Db, sponsorId: string, userId: string, confId: string, excludeMeetingId?: string,
): Promise<AvailabilityDay[]> {
  const [timeBlocks, blackouts, candidateSponsorMtgs, candidateMeetings, sponsorMtgs, tables] = await Promise.all([
    prisma.timeBlock.findMany({
      where: { conferenceId: confId }, orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    prisma.blackoutTime.findMany({
      where: { userId }, select: { startsAt: true, endsAt: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { userId, status: 'CONFIRMED', ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) },
      select: { timeBlockId: true },
    }),
    prisma.meeting.findMany({
      where: {
        status: { in: ['PENDING', 'CONFIRMED'] },
        OR: [{ attendeeAId: userId }, { attendeeBId: userId }],
      },
      select: { timeBlockId: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { sponsorId, status: 'CONFIRMED', ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) },
      select: { timeBlockId: true, location: true },
    }),
    getMeetingTables(prisma),
  ])

  const candidateBusyBlocks = new Set<string>([
    ...candidateSponsorMtgs.map(m => m.timeBlockId),
    ...candidateMeetings.map(m => m.timeBlockId),
  ])
  const sponsorCountByBlock = new Map<string, number>()
  const sponsorRoomByBlock = new Map<string, Map<string, number>>()
  for (const m of sponsorMtgs) {
    sponsorCountByBlock.set(m.timeBlockId, (sponsorCountByBlock.get(m.timeBlockId) ?? 0) + 1)
    if (m.location) {
      const roomMap = sponsorRoomByBlock.get(m.timeBlockId) ?? new Map<string, number>()
      roomMap.set(m.location, (roomMap.get(m.location) ?? 0) + 1)
      sponsorRoomByBlock.set(m.timeBlockId, roomMap)
    }
  }

  const dayMap = new Map<string, AvailabilityDay>()
  for (const tb of timeBlocks) {
    const hasBlackout = blackouts.some(b => overlaps(tb.startsAt, tb.endsAt, b.startsAt, b.endsAt))
    const candidateFree = !hasBlackout && !candidateBusyBlocks.has(tb.id)
    const sponsorCount = sponsorCountByBlock.get(tb.id) ?? 0
    const sponsorHasCapacity = sponsorCount < MEETINGS_PER_BLOCK
    const roomMap = sponsorRoomByBlock.get(tb.id) ?? new Map<string, number>()
    const rooms: RoomAvailability[] = tables.map(r => {
      const occupancy = roomMap.get(r.name) ?? 0
      return { name: r.name, capacity: r.capacity, occupancy, available: occupancy < r.capacity }
    })
    const available = candidateFree && sponsorHasCapacity && rooms.some(r => r.available)
    const key = dayKeyOf(tb.startsAt)
    let day = dayMap.get(key)
    if (!day) { day = { dayKey: key, label: dayLabel(tb.startsAt), slots: [] }; dayMap.set(key, day) }
    day.slots.push({
      timeBlockId: tb.id,
      startsAt: tb.startsAt.toISOString(),
      endsAt: tb.endsAt.toISOString(),
      candidateFree, sponsorHasCapacity, available, rooms,
    })
  }
  return Array.from(dayMap.values())
}

export async function getCandidateAvailability(
  prisma: Db, requestId: string, conferenceId?: string,
): Promise<CandidateAvailability> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const req = await prisma.meetingRequest.findUnique({
    where: { id: requestId },
    select: {
      requesterId: true, targetUserId: true, targetSponsorId: true,
      requester: { select: { sponsorId: true } },
    },
  })
  if (!req) throw new EngineError('REQUEST_NOT_FOUND')
  const parties = resolveParties(req as RequestLike)
  if (!parties) throw new EngineError('NOT_A_SPONSOR_REQUEST')
  const days = await computeAvailability(prisma, parties.sponsorId, parties.userId, confId)
  return { sponsorId: parties.sponsorId, userId: parties.userId, days }
}

// Availability for RESCHEDULING an existing meeting: excludes the meeting being
// moved so its current slot/room reads as free. Also returns the current slot.
export interface RescheduleAvailability extends CandidateAvailability {
  sponsorMeetingId: string
  current: { timeBlockId: string; room: string | null }
}
export async function getMeetingRescheduleAvailability(
  prisma: Db, sponsorMeetingId: string, conferenceId?: string,
): Promise<RescheduleAvailability> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const m = await prisma.sponsorMeeting.findUnique({
    where: { id: sponsorMeetingId },
    select: { id: true, sponsorId: true, userId: true, timeBlockId: true, location: true },
  })
  if (!m) throw new EngineError('MEETING_NOT_FOUND')
  const days = await computeAvailability(prisma, m.sponsorId, m.userId, confId, m.id)
  return {
    sponsorId: m.sponsorId, userId: m.userId, days,
    sponsorMeetingId: m.id, current: { timeBlockId: m.timeBlockId, room: m.location },
  }
}

// ── Guarded mutations ───────────────────────────────────────────────────────
// The single bookability rule, shared by every write path (engine mutations
// below AND the legacy confirm routes in apps/web, apps/meetings, apps/sponsor):
// the attendee must be free at the block (no confirmed sponsor meeting, no peer
// meeting, no blackout) and the block must be OPEN for the sponsor (exclusive
// slots — MEETINGS_PER_BLOCK). Throws EngineError on any violation.
export async function assertBlockOpen(
  prisma: Db, sponsorId: string, userId: string, timeBlockId: string, excludeMeetingId?: string,
) {
  const tb = await prisma.timeBlock.findUnique({
    where: { id: timeBlockId }, select: { startsAt: true, endsAt: true },
  })
  if (!tb) throw new EngineError('BAD_STATUS', 'Time block not found')

  const [blackouts, candMtgs, candMeetings, sponsorMtgs] = await Promise.all([
    prisma.blackoutTime.findMany({ where: { userId }, select: { startsAt: true, endsAt: true } }),
    prisma.sponsorMeeting.findMany({
      where: { userId, status: 'CONFIRMED', ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) },
      select: { timeBlockId: true },
    }),
    prisma.meeting.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] }, OR: [{ attendeeAId: userId }, { attendeeBId: userId }] },
      select: { timeBlockId: true },
    }),
    prisma.sponsorMeeting.count({
      where: { sponsorId, timeBlockId, status: 'CONFIRMED', ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}) },
    }),
  ])
  const hasBlackout = blackouts.some(b => overlaps(tb.startsAt, tb.endsAt, b.startsAt, b.endsAt))
  const candidateBusy = hasBlackout ||
    candMtgs.some(m => m.timeBlockId === timeBlockId) ||
    candMeetings.some(m => m.timeBlockId === timeBlockId)
  if (candidateBusy) throw new EngineError('CANDIDATE_BUSY', 'Attendee is already booked or unavailable at that time')

  if (sponsorMtgs >= MEETINGS_PER_BLOCK) {
    throw new EngineError('SPONSOR_FULL', 'The company already has a meeting in that time block')
  }
}

async function assertSlotBookable(
  prisma: Db, sponsorId: string, userId: string, timeBlockId: string, room: string, excludeMeetingId?: string,
) {
  // Validate against the live admin-managed inventory, not the constant
  // defaults, so custom tables are bookable and removed ones are not.
  const tables = await getMeetingTables(prisma)
  if (!tables.some(t => t.name === room)) throw new EngineError('UNKNOWN_ROOM', `Unknown room: ${room}`)
  await assertBlockOpen(prisma, sponsorId, userId, timeBlockId, excludeMeetingId)
}

// First chronological time block that is OPEN for the sponsor and free for the
// attendee, or null when none exists. Used by legacy auto-assign paths (the
// sponsor-portal approve flow) so they follow the exact same rule as the
// Companies scheduler.
export async function findFirstOpenSlot(
  prisma: Db, sponsorId: string, userId: string, conferenceId?: string,
): Promise<{ timeBlockId: string; room: string } | null> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const [days, tables] = await Promise.all([
    computeAvailability(prisma, sponsorId, userId, confId),
    getMeetingTables(prisma),
  ])
  for (const day of days) {
    const slot = day.slots.find(s => s.available)
    if (slot) return { timeBlockId: slot.timeBlockId, room: tables[0].name }
  }
  return null
}

export interface AssignInput {
  requestId: string
  timeBlockId: string
  room: string
  repId?: string | null
}
export async function assignMeeting(prisma: Db, input: AssignInput) {
  const req = await prisma.meetingRequest.findUnique({
    where: { id: input.requestId },
    select: {
      id: true, requesterId: true, targetUserId: true, targetSponsorId: true, status: true,
      requester: { select: { sponsorId: true } },
    },
  })
  if (!req) throw new EngineError('REQUEST_NOT_FOUND')
  if (!['PENDING', 'APPROVED'].includes(req.status)) {
    throw new EngineError('BAD_STATUS', `Cannot schedule a ${req.status} request`)
  }
  const parties = resolveParties(req as RequestLike)
  if (!parties) throw new EngineError('NOT_A_SPONSOR_REQUEST')

  const existing = await prisma.sponsorMeeting.findFirst({
    where: { sponsorId: parties.sponsorId, userId: parties.userId, status: 'CONFIRMED' },
    select: { id: true },
  })
  if (existing) throw new EngineError('ALREADY_SCHEDULED', 'This pairing already has a confirmed meeting')

  await assertSlotBookable(prisma, parties.sponsorId, parties.userId, input.timeBlockId, input.room)

  const [meeting] = await commitOrConflict(() => prisma.$transaction([
    prisma.sponsorMeeting.create({
      data: {
        sponsorId: parties.sponsorId,
        userId: parties.userId,
        repId: input.repId ?? parties.repId,
        timeBlockId: input.timeBlockId,
        location: input.room,
        status: 'CONFIRMED',
      },
    }),
    prisma.meetingRequest.update({
      where: { id: req.id },
      data: { status: 'CONFIRMED', timeBlockId: input.timeBlockId },
    }),
  ]))
  return meeting
}

// Find the CONFIRMED MeetingRequest that materialized into a given SponsorMeeting.
async function findLinkedRequest(prisma: Db, sponsorId: string, userId: string) {
  return prisma.meetingRequest.findFirst({
    where: {
      status: 'CONFIRMED',
      OR: [
        { targetSponsorId: sponsorId, requesterId: userId },
        { requester: { sponsorId }, targetUserId: userId },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
}

export interface RescheduleInput {
  sponsorMeetingId: string
  timeBlockId: string
  room: string
}
export async function rescheduleMeeting(prisma: Db, input: RescheduleInput) {
  const m = await prisma.sponsorMeeting.findUnique({
    where: { id: input.sponsorMeetingId },
    select: { id: true, sponsorId: true, userId: true, status: true },
  })
  if (!m) throw new EngineError('MEETING_NOT_FOUND')
  if (m.status !== 'CONFIRMED') throw new EngineError('BAD_STATUS', 'Only confirmed meetings can be rescheduled')

  await assertSlotBookable(prisma, m.sponsorId, m.userId, input.timeBlockId, input.room, m.id)

  const linked = await findLinkedRequest(prisma, m.sponsorId, m.userId)
  const writes: any[] = [
    prisma.sponsorMeeting.update({
      where: { id: m.id },
      data: { timeBlockId: input.timeBlockId, location: input.room },
    }),
  ]
  if (linked) {
    writes.push(prisma.meetingRequest.update({
      where: { id: linked.id }, data: { timeBlockId: input.timeBlockId },
    }))
  }
  const [meeting] = await commitOrConflict(() => prisma.$transaction(writes))
  return meeting
}

export interface CancelInput {
  sponsorMeetingId: string
  preserveRequest: boolean
  reason?: string | null
  notes?: string | null
}
export async function cancelMeeting(prisma: Db, input: CancelInput) {
  const m = await prisma.sponsorMeeting.findUnique({
    where: { id: input.sponsorMeetingId },
    select: { id: true, sponsorId: true, userId: true, status: true, notes: true },
  })
  if (!m) throw new EngineError('MEETING_NOT_FOUND')
  // Guard against a stale/duplicate cancel: without this, re-cancelling an
  // already-CANCELLED meeting would flip whatever confirmed request the pair
  // now has (e.g. a re-booked meeting) back to the bank, orphaning it.
  if (m.status !== 'CONFIRMED') throw new EngineError('BAD_STATUS', 'Only confirmed meetings can be cancelled')

  const linked = await findLinkedRequest(prisma, m.sponsorId, m.userId)
  const writes: any[] = [
    prisma.sponsorMeeting.update({
      where: { id: m.id },
      data: {
        status: 'CANCELLED',
        reason: input.reason ?? null,
        notes: input.notes ?? m.notes ?? null,
      },
    }),
  ]
  if (linked) {
    writes.push(prisma.meetingRequest.update({
      where: { id: linked.id },
      data: input.preserveRequest
        ? { status: 'APPROVED', timeBlockId: null }  // back to the bank
        : { status: 'CANCELLED' },                   // removed entirely
    }))
  }
  const [meeting] = await prisma.$transaction(writes)
  return { meeting, preserved: input.preserveRequest, requestUpdated: !!linked }
}

// ── On-site floor check-in ──────────────────────────────────────────────────
// The floor portal is a master attendance grid across EVERY company: meetings
// grouped chronologically by time slot and sorted alphabetically by sponsor
// within each slot, with dual arrival check-offs (sponsor / buyer), an internal
// note per meeting, and running completion tallies for the footer.
export interface CheckInMeeting {
  sponsorMeetingId: string
  sponsorId: string
  sponsorName: string
  sponsorLogo: string | null
  sponsorTier: string
  attendeeName: string
  attendeeCompany: string | null
  room: string | null
  sponsorArrivedAt: string | null
  buyerArrivedAt: string | null
  notes: string | null
}
export interface CheckInTotals {
  meetings: number
  completed: number      // both parties arrived
  sponsorArrived: number
  buyerArrived: number
  awaiting: number       // neither party arrived yet
}
export interface CheckInSlot {
  timeBlockId: string
  startsAt: string
  endsAt: string
  meetings: CheckInMeeting[] // alphabetical by sponsor, then attendee
  completed: number
}
export interface CheckInDay {
  dayKey: string
  label: string
  slots: CheckInSlot[]       // chronological
  totals: CheckInTotals
}
export interface CheckInBoard {
  days: CheckInDay[]
  totals: CheckInTotals
}

function tallyCheckIns(meetings: CheckInMeeting[]): CheckInTotals {
  const totals: CheckInTotals = { meetings: meetings.length, completed: 0, sponsorArrived: 0, buyerArrived: 0, awaiting: 0 }
  for (const m of meetings) {
    if (m.sponsorArrivedAt) totals.sponsorArrived++
    if (m.buyerArrivedAt) totals.buyerArrived++
    if (m.sponsorArrivedAt && m.buyerArrivedAt) totals.completed++
    else if (!m.sponsorArrivedAt && !m.buyerArrivedAt) totals.awaiting++
  }
  return totals
}

export async function getCheckInBoard(prisma: Db, conferenceId?: string): Promise<CheckInBoard> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const [timeBlocks, meetings] = await Promise.all([
    prisma.timeBlock.findMany({
      where: { conferenceId: confId },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED', timeBlock: { conferenceId: confId } },
      select: {
        id: true, sponsorId: true, timeBlockId: true, location: true, notes: true,
        sponsorArrivedAt: true, buyerArrivedAt: true,
        sponsor: { select: { name: true, logoUrl: true, tier: true } },
        user: { select: { name: true, company: true } },
      },
    }),
  ])

  const byBlock = new Map<string, CheckInMeeting[]>()
  for (const m of meetings) {
    const row: CheckInMeeting = {
      sponsorMeetingId: m.id,
      sponsorId: m.sponsorId,
      sponsorName: m.sponsor?.name ?? 'Unknown',
      sponsorLogo: m.sponsor?.logoUrl ?? null,
      sponsorTier: m.sponsor?.tier ?? 'BRONZE',
      attendeeName: m.user?.name ?? 'Unknown',
      attendeeCompany: m.user?.company ?? null,
      room: m.location,
      sponsorArrivedAt: m.sponsorArrivedAt ? m.sponsorArrivedAt.toISOString() : null,
      buyerArrivedAt: m.buyerArrivedAt ? m.buyerArrivedAt.toISOString() : null,
      notes: m.notes,
    }
    const arr = byBlock.get(m.timeBlockId) ?? []
    arr.push(row)
    byBlock.set(m.timeBlockId, arr)
  }

  const dayMap = new Map<string, CheckInDay>()
  const all: CheckInMeeting[] = []
  for (const tb of timeBlocks) {
    const slotMeetings = byBlock.get(tb.id)
    if (!slotMeetings?.length) continue // the floor grid only shows slots with meetings
    slotMeetings.sort((a, b) =>
      a.sponsorName.localeCompare(b.sponsorName) || a.attendeeName.localeCompare(b.attendeeName))
    all.push(...slotMeetings)
    const key = dayKeyOf(tb.startsAt)
    let day = dayMap.get(key)
    if (!day) {
      day = {
        dayKey: key, label: dayLabel(tb.startsAt), slots: [],
        totals: { meetings: 0, completed: 0, sponsorArrived: 0, buyerArrived: 0, awaiting: 0 },
      }
      dayMap.set(key, day)
    }
    day.slots.push({
      timeBlockId: tb.id,
      startsAt: tb.startsAt.toISOString(),
      endsAt: tb.endsAt.toISOString(),
      meetings: slotMeetings,
      completed: slotMeetings.filter(m => m.sponsorArrivedAt && m.buyerArrivedAt).length,
    })
  }
  const days = Array.from(dayMap.values())
  for (const day of days) day.totals = tallyCheckIns(day.slots.flatMap(s => s.meetings))

  return { days, totals: tallyCheckIns(all) }
}

// Toggle arrivals / edit the internal note for one meeting. Fields left
// undefined are untouched, so a checkbox tick never clobbers a concurrent
// note edit (and vice versa). Only CONFIRMED meetings can be checked in.
export interface CheckInUpdate {
  sponsorMeetingId: string
  sponsorArrived?: boolean
  buyerArrived?: boolean
  notes?: string | null
}
export async function setMeetingCheckIn(prisma: Db, input: CheckInUpdate) {
  const m = await prisma.sponsorMeeting.findUnique({
    where: { id: input.sponsorMeetingId },
    select: { id: true, status: true },
  })
  if (!m) throw new EngineError('MEETING_NOT_FOUND')
  if (m.status !== 'CONFIRMED') throw new EngineError('BAD_STATUS', 'Only confirmed meetings can be checked in')

  const data: Record<string, unknown> = {}
  if (input.sponsorArrived !== undefined) data.sponsorArrivedAt = input.sponsorArrived ? new Date() : null
  if (input.buyerArrived !== undefined) data.buyerArrivedAt = input.buyerArrived ? new Date() : null
  if (input.notes !== undefined) data.notes = input.notes?.trim() ? input.notes.trim() : null

  const updated = await prisma.sponsorMeeting.update({
    where: { id: m.id },
    data,
    select: { id: true, sponsorArrivedAt: true, buyerArrivedAt: true, notes: true },
  })
  return {
    sponsorMeetingId: updated.id,
    sponsorArrivedAt: updated.sponsorArrivedAt ? updated.sponsorArrivedAt.toISOString() : null,
    buyerArrivedAt: updated.buyerArrivedAt ? updated.buyerArrivedAt.toISOString() : null,
    notes: updated.notes,
  }
}

// ── Table assignment board (Meetings → Settings → Meeting Tables) ────────────
// A conference-wide view of every CONFIRMED meeting's table: day → time block →
// meetings, with per-block occupancy against the admin-managed inventory.
// Tables are a GLOBAL resource per block (unlike the per-sponsor availability
// grid), so two different sponsors booked at "Table 1" in the same block is a
// conflict — this board is where such double-bookings surface and get fixed.
export interface TableBoardMeeting {
  sponsorMeetingId: string
  sponsorId: string
  sponsorName: string
  sponsorLogo: string | null
  sponsorTier: string
  attendeeName: string
  attendeeCompany: string | null
  table: string | null      // SponsorMeeting.location
  tableKnown: boolean       // false when location names a table not in the inventory
}
export interface TableBoardSlot {
  timeBlockId: string
  startsAt: string
  endsAt: string
  meetings: TableBoardMeeting[] // by table (unassigned last), then sponsor, then attendee
  conflictTables: string[]      // inventory tables over capacity in this block
  unassigned: number
}
export interface TableBoardDay {
  dayKey: string
  label: string
  slots: TableBoardSlot[]
}
export interface TableBoardTable extends MeetingRoom {
  assignedCount: number // confirmed meetings at this table across the conference
}
export interface TableBoardTotals {
  meetings: number
  assigned: number     // at a table that exists in the inventory
  unassigned: number   // no table at all
  unknownTable: number // at a label the inventory no longer contains
  conflicts: number    // (block, table) pairs over capacity
}
export interface TableBoard {
  tables: TableBoardTable[]
  days: TableBoardDay[]
  totals: TableBoardTotals
}

export async function getTableBoard(prisma: Db, conferenceId?: string): Promise<TableBoard> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const [tables, timeBlocks, meetings] = await Promise.all([
    getMeetingTables(prisma),
    prisma.timeBlock.findMany({
      where: { conferenceId: confId },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED', timeBlock: { conferenceId: confId } },
      select: {
        id: true, sponsorId: true, timeBlockId: true, location: true,
        sponsor: { select: { name: true, logoUrl: true, tier: true } },
        user: { select: { name: true, company: true } },
      },
    }),
  ])
  const known = new Set(tables.map(t => t.name))
  const capacityOf = new Map(tables.map(t => [t.name, t.capacity]))

  const byBlock = new Map<string, TableBoardMeeting[]>()
  for (const m of meetings) {
    const row: TableBoardMeeting = {
      sponsorMeetingId: m.id,
      sponsorId: m.sponsorId,
      sponsorName: m.sponsor?.name ?? 'Unknown',
      sponsorLogo: m.sponsor?.logoUrl ?? null,
      sponsorTier: m.sponsor?.tier ?? 'BRONZE',
      attendeeName: m.user?.name ?? 'Unknown',
      attendeeCompany: m.user?.company ?? null,
      table: m.location,
      tableKnown: m.location === null || known.has(m.location),
    }
    const arr = byBlock.get(m.timeBlockId) ?? []
    arr.push(row)
    byBlock.set(m.timeBlockId, arr)
  }

  const assignedByTable = new Map<string, number>()
  const totals: TableBoardTotals = { meetings: 0, assigned: 0, unassigned: 0, unknownTable: 0, conflicts: 0 }
  const dayMap = new Map<string, TableBoardDay>()
  for (const tb of timeBlocks) {
    const slotMeetings = byBlock.get(tb.id)
    if (!slotMeetings?.length) continue // like the check-in grid, only slots with meetings
    slotMeetings.sort((a, b) => {
      if ((a.table === null) !== (b.table === null)) return a.table === null ? 1 : -1
      return (a.table ?? '').localeCompare(b.table ?? '') ||
        a.sponsorName.localeCompare(b.sponsorName) ||
        a.attendeeName.localeCompare(b.attendeeName)
    })

    const occupancy = new Map<string, number>()
    let unassigned = 0
    for (const m of slotMeetings) {
      totals.meetings++
      if (m.table === null) { unassigned++; totals.unassigned++; continue }
      if (!known.has(m.table)) { totals.unknownTable++; continue }
      totals.assigned++
      occupancy.set(m.table, (occupancy.get(m.table) ?? 0) + 1)
      assignedByTable.set(m.table, (assignedByTable.get(m.table) ?? 0) + 1)
    }
    const conflictTables = [...occupancy.entries()]
      .filter(([name, count]) => count > (capacityOf.get(name) ?? 1))
      .map(([name]) => name)
      .sort((a, b) => a.localeCompare(b))
    totals.conflicts += conflictTables.length

    const key = dayKeyOf(tb.startsAt)
    let day = dayMap.get(key)
    if (!day) {
      day = { dayKey: key, label: dayLabel(tb.startsAt), slots: [] }
      dayMap.set(key, day)
    }
    day.slots.push({
      timeBlockId: tb.id,
      startsAt: tb.startsAt.toISOString(),
      endsAt: tb.endsAt.toISOString(),
      meetings: slotMeetings,
      conflictTables,
      unassigned,
    })
  }

  return {
    tables: tables.map(t => ({ ...t, assignedCount: assignedByTable.get(t.name) ?? 0 })),
    days: Array.from(dayMap.values()),
    totals,
  }
}

// Assign one confirmed meeting to a table (or clear it with table: null).
// The capacity guard is GLOBAL per block: every sponsor's confirmed meetings
// at that table in that block count against its capacity.
export interface SetMeetingTableInput {
  sponsorMeetingId: string
  table: string | null
}
export async function setMeetingTable(prisma: Db, input: SetMeetingTableInput) {
  const m = await prisma.sponsorMeeting.findUnique({
    where: { id: input.sponsorMeetingId },
    select: { id: true, timeBlockId: true, status: true },
  })
  if (!m) throw new EngineError('MEETING_NOT_FOUND')
  if (m.status !== 'CONFIRMED') throw new EngineError('BAD_STATUS', 'Only confirmed meetings can be assigned a table')

  let location: string | null = null
  if (input.table !== null) {
    const name = normalizeTableName(input.table)
    if (!name) throw new EngineError('BAD_STATUS', 'Table name is required')
    const tables = await getMeetingTables(prisma)
    const t = tables.find(x => x.name === name)
    if (!t) throw new EngineError('UNKNOWN_ROOM', `Unknown table: ${name}`)
    const occupied = await prisma.sponsorMeeting.count({
      where: { status: 'CONFIRMED', timeBlockId: m.timeBlockId, location: t.name, id: { not: m.id } },
    })
    if (occupied >= t.capacity) {
      throw new EngineError('TABLE_TAKEN', `“${t.name}” is already full in that time block`)
    }
    location = t.name
  }
  return prisma.sponsorMeeting.update({
    where: { id: m.id },
    data: { location },
    select: { id: true, timeBlockId: true, location: true },
  })
}

// Fill tables across the whole conference: every unassigned confirmed meeting
// (plus meetings stranded on labels the inventory no longer contains, and —
// with includeConflicts — the over-capacity extras) gets the first table with
// free capacity in its block. Deterministic: blocks chronological, meetings by
// sponsor then attendee then id, tables in inventory order. Meetings that fit
// nowhere are left untouched and counted as unplaced.
export interface AutoAssignTablesInput {
  includeConflicts?: boolean
  conferenceId?: string
}
export interface AutoAssignTablesResult {
  assigned: number   // locations written
  unplaced: number   // needed a table but every table in the block was full
  totalMeetings: number
}
export async function autoAssignTables(prisma: Db, input: AutoAssignTablesInput = {}): Promise<AutoAssignTablesResult> {
  const confId = await resolveConferenceId(prisma, input.conferenceId)
  const [tables, meetings] = await Promise.all([
    getMeetingTables(prisma),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED', timeBlock: { conferenceId: confId } },
      select: {
        id: true, timeBlockId: true, location: true,
        timeBlock: { select: { startsAt: true } },
        sponsor: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
  ])
  const capacityOf = new Map(tables.map(t => [t.name, t.capacity]))

  const byBlock = new Map<string, typeof meetings>()
  for (const m of meetings) {
    const arr = byBlock.get(m.timeBlockId) ?? []
    arr.push(m)
    byBlock.set(m.timeBlockId, arr)
  }
  const blocks = [...byBlock.entries()].sort(
    (a, b) => (a[1][0].timeBlock?.startsAt.getTime() ?? 0) - (b[1][0].timeBlock?.startsAt.getTime() ?? 0),
  )

  const updates: { id: string; location: string }[] = []
  let unplaced = 0
  for (const [, rows] of blocks) {
    rows.sort((a, b) =>
      (a.sponsor?.name ?? '').localeCompare(b.sponsor?.name ?? '') ||
      (a.user?.name ?? '').localeCompare(b.user?.name ?? '') ||
      a.id.localeCompare(b.id))

    // Keepers hold their current table up to its capacity; the rest need a seat.
    const occupancy = new Map<string, number>()
    const pending: typeof rows = []
    for (const m of rows) {
      if (m.location && capacityOf.has(m.location)) {
        const used = occupancy.get(m.location) ?? 0
        if (used < capacityOf.get(m.location)!) {
          occupancy.set(m.location, used + 1)
          continue
        }
        // Over-capacity extra — only touched when the caller opts in.
        if (input.includeConflicts) pending.push(m)
        continue
      }
      // Unassigned, or stranded on a label the inventory no longer contains.
      pending.push(m)
    }
    for (const m of pending) {
      const t = tables.find(x => (occupancy.get(x.name) ?? 0) < x.capacity)
      if (!t) { unplaced++; continue }
      occupancy.set(t.name, (occupancy.get(t.name) ?? 0) + 1)
      updates.push({ id: m.id, location: t.name })
    }
  }

  for (const u of updates) {
    await prisma.sponsorMeeting.update({ where: { id: u.id }, data: { location: u.location } })
  }
  return { assigned: updates.length, unplaced, totalMeetings: meetings.length }
}

// ── Load-balancing hint ─────────────────────────────────────────────────────
// Given candidate loads, recommend scheduling the one with the fewest meetings
// (spreads attention across attendees). Returns the userId to prefer.
export function loadBalancePreferred(
  candidates: { userId: string; confirmedCount: number }[],
): string | null {
  if (candidates.length === 0) return null
  return candidates.reduce((best, c) => (c.confirmedCount < best.confirmedCount ? c : best)).userId
}

// ── Load-balancing auto-scheduler ─────────────────────────────────────────────
// Greedily materializes eligible MeetingRequests into confirmed SponsorMeetings.
// Ordering (product rule): the attendee with the FEWEST confirmed meetings is
// scheduled first (least → most, spreading meetings evenly across people), then
// ties break by priority tier (Best Fit → Med → Low), then fit/rank score, then
// oldest request. Load is evaluated live, so a meeting pushed this run raises
// that attendee's load and lighter attendees keep winning. Honors every
// constraint assertSlotBookable enforces (candidate blackouts, one meeting per
// candidate per block, one meeting per sponsor per block) via an in-memory
// occupancy simulation seeded from the existing confirmed state, so a whole
// conference is scheduled in one pass. Each candidate lands in the FIRST time
// block (chronological) that is OPEN for the sponsor and free for the attendee.
// Before committing, the plan is revalidated against the live DB so a slot taken
// concurrently (manual assign, second click) is skipped, never double-booked.
// dryRun returns the same plan without writing — used by the admin preview.
export interface AutoScheduleInput {
  conferenceId?: string
  sponsorId?: string    // limit to one company's booth; omit = every company
  statuses?: string[]   // eligible request statuses; default PENDING + APPROVED
  priorities?: MeetingPriority[] // eligible tiers; omit = all (the requests-board bulk scheduler passes MED+LOW so it never reaches into the Auto lane)
  requestIds?: string[] // limit to specific requests (the mutual-match scheduler)
  dryRun?: boolean      // simulate only, persist nothing
}
export interface AutoScheduledEntry {
  requestId: string
  sponsorId: string
  sponsorName: string
  userId: string
  userName: string
  priority: MeetingPriority
  score: number
  timeBlockId: string
  startsAt: string
  room: string
}
export interface AutoSkippedEntry {
  requestId: string
  sponsorId: string
  sponsorName: string
  userId: string
  userName: string
  priority: MeetingPriority
  reason: string
}
export interface TierSummary {
  tier: MeetingPriority
  eligible: number
  scheduled: number
  skipped: number
}
export interface AutoScheduleResult {
  dryRun: boolean
  scheduled: AutoScheduledEntry[]
  skipped: AutoSkippedEntry[]
  byTier: TierSummary[]
  totalEligible: number
}

export async function autoScheduleByPriority(
  prisma: Db, input: AutoScheduleInput = {},
): Promise<AutoScheduleResult> {
  const confId = await resolveConferenceId(prisma, input.conferenceId)
  const statuses = input.statuses ?? ['PENDING', 'APPROVED']
  const dryRun = !!input.dryRun

  const [timeBlocks, sponsors, confirmedMtgs, peerMeetings, blackouts, requests, tables] = await Promise.all([
    prisma.timeBlock.findMany({
      where: { conferenceId: confId }, orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, endsAt: true },
    }),
    prisma.sponsor.findMany({
      where: input.sponsorId ? { id: input.sponsorId } : { conferenceId: confId },
      select: { id: true, name: true, solutionsSeeking: true, solutionsOffering: true },
    }),
    prisma.sponsorMeeting.findMany({
      where: { status: 'CONFIRMED' },
      select: { sponsorId: true, userId: true, timeBlockId: true },
    }),
    prisma.meeting.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] } },
      select: { attendeeAId: true, attendeeBId: true, timeBlockId: true },
    }),
    prisma.blackoutTime.findMany({ select: { userId: true, startsAt: true, endsAt: true } }),
    prisma.meetingRequest.findMany({
      where: {
        status: { in: statuses },
        ...(input.priorities ? { priority: { in: input.priorities } } : {}),
        ...(input.requestIds ? { id: { in: input.requestIds } } : {}),
        ...(input.sponsorId
          ? { OR: [{ targetSponsorId: input.sponsorId }, { requester: { sponsorId: input.sponsorId } }] }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, requesterId: true, targetUserId: true, targetSponsorId: true,
        status: true, priority: true, createdAt: true,
        requester: { select: { sponsorId: true, name: true, solutionsOffering: true, solutionsSeeking: true } },
        targetUser: { select: { name: true, solutionsOffering: true, solutionsSeeking: true } },
      },
    }),
    getMeetingTables(prisma),
  ])

  const sponsorById = new Map(sponsors.map(s => [s.id, s]))
  const sponsorIdSet = new Set(sponsors.map(s => s.id))

  // In-memory occupancy, seeded from the existing confirmed state. Slots are
  // exclusive, so a sponsor's occupancy is simply the set of taken blocks.
  const sponsorBusy = new Map<string, Set<string>>()   // sponsor → taken blocks
  const candidateBusy = new Map<string, Set<string>>() // user → busy blocks
  const scheduledPairs = new Set<string>()             // `${sponsorId}::${userId}`

  const setOf = (map: Map<string, Set<string>>, key: string): Set<string> => {
    let s = map.get(key)
    if (!s) { s = new Set(); map.set(key, s) }
    return s
  }
  const busyOf = (uid: string) => setOf(candidateBusy, uid)
  const sponsorTaken = (sid: string) => setOf(sponsorBusy, sid)

  for (const m of confirmedMtgs) {
    sponsorTaken(m.sponsorId).add(m.timeBlockId)
    busyOf(m.userId).add(m.timeBlockId)
    scheduledPairs.add(`${m.sponsorId}::${m.userId}`)
  }
  for (const pm of peerMeetings) {
    busyOf(pm.attendeeAId).add(pm.timeBlockId)
    busyOf(pm.attendeeBId).add(pm.timeBlockId)
  }

  // Per-candidate blackout-blocked time blocks (memoized).
  const blackoutByUser = new Map<string, { startsAt: Date; endsAt: Date }[]>()
  for (const b of blackouts) {
    const arr = blackoutByUser.get(b.userId) ?? []
    arr.push({ startsAt: b.startsAt, endsAt: b.endsAt })
    blackoutByUser.set(b.userId, arr)
  }
  const blockedCache = new Map<string, Set<string>>()
  const blockedOf = (uid: string): Set<string> => {
    let s = blockedCache.get(uid)
    if (!s) {
      s = new Set()
      const bl = blackoutByUser.get(uid)
      if (bl) for (const tb of timeBlocks) {
        if (bl.some(x => overlaps(tb.startsAt, tb.endsAt, x.startsAt, x.endsAt))) s.add(tb.id)
      }
      blockedCache.set(uid, s)
    }
    return s
  }

  // Build the eligible, scored candidate list. Ordering happens dynamically in
  // the placement loop below (it depends on live per-attendee load).
  interface Cand {
    reqId: string; sponsorId: string; sponsorName: string; userId: string; userName: string
    repId: string | null; priority: MeetingPriority; score: number; createdAt: Date
  }
  const cands: Cand[] = []
  for (const req of requests) {
    const parties = resolveParties(req as RequestLike)
    if (!parties || !sponsorIdSet.has(parties.sponsorId)) continue
    const sponsor = sponsorById.get(parties.sponsorId)!
    const cand = req.targetSponsorId ? req.requester : req.targetUser
    const { score } = scoreSolutionsMatch(
      parseSolutions(sponsor.solutionsSeeking), parseSolutions(sponsor.solutionsOffering),
      parseSolutions(cand?.solutionsOffering ?? null), parseSolutions(cand?.solutionsSeeking ?? null),
    )
    cands.push({
      reqId: req.id, sponsorId: parties.sponsorId, sponsorName: sponsor.name,
      userId: parties.userId, userName: cand?.name ?? 'Unknown', repId: parties.repId,
      priority: normalizePriority(req.priority), score, createdAt: req.createdAt,
    })
  }

  // Live per-attendee load = their confirmed SponsorMeetings across all
  // companies (the "N confirmed" the bank shows), seeded from current state and
  // incremented as we place, so ordering reflects meetings pushed this run too.
  const load = new Map<string, number>()
  for (const m of confirmedMtgs) load.set(m.userId, (load.get(m.userId) ?? 0) + 1)
  const loadOf = (uid: string) => load.get(uid) ?? 0

  // Ordering (product rule): spread meetings evenly FIRST — the attendee with
  // the FEWEST confirmed meetings is scheduled first (least → most) — then break
  // ties by priority tier (Best Fit → Med → Low), then fit/rank score, then
  // oldest request. Negative = a should be picked before b. Evaluated live on
  // every pick, so placing a meeting raises that attendee's load and a
  // heavily-booked attendee keeps yielding to lighter ones across the run.
  const order = (a: Cand, b: Cand) =>
    loadOf(a.userId) - loadOf(b.userId) ||
    priorityRank(a.priority) - priorityRank(b.priority) ||
    b.score - a.score ||
    a.createdAt.getTime() - b.createdAt.getTime()

  const toSkip = (c: Cand) => ({
    requestId: c.reqId, sponsorId: c.sponsorId, sponsorName: c.sponsorName,
    userId: c.userId, userName: c.userName, priority: c.priority,
  })

  let scheduled: AutoScheduledEntry[] = []
  const skipped: AutoSkippedEntry[] = []
  const repByRequest = new Map<string, string | null>()

  // Greedy: repeatedly take the current least-loaded candidate and push it into
  // the first open slot that works for both sides. Re-selecting by live load
  // each pass is what balances the schedule across attendees.
  const remaining = [...cands]
  while (remaining.length) {
    let bi = 0
    for (let i = 1; i < remaining.length; i++) if (order(remaining[i], remaining[bi]) < 0) bi = i
    const c = remaining.splice(bi, 1)[0]

    const pairKey = `${c.sponsorId}::${c.userId}`
    if (scheduledPairs.has(pairKey)) {
      skipped.push({ ...toSkip(c), reason: 'Already has a meeting with this company' })
      continue
    }
    const busy = busyOf(c.userId)
    const blocked = blockedOf(c.userId)
    const taken = sponsorTaken(c.sponsorId)
    // First chronological block that is OPEN for the sponsor and free for the
    // attendee. An open block has no meeting, so the first table is the room.
    const placed = timeBlocks.find(tb => !busy.has(tb.id) && !blocked.has(tb.id) && !taken.has(tb.id))
    if (!placed) {
      skipped.push({ ...toSkip(c), reason: 'No open slot that works for both sides' })
      continue
    }
    // Commit to in-memory state so later candidates see this occupancy and the
    // attendee's raised load.
    taken.add(placed.id)
    busy.add(placed.id)
    scheduledPairs.add(pairKey)
    load.set(c.userId, loadOf(c.userId) + 1)
    scheduled.push({
      requestId: c.reqId, sponsorId: c.sponsorId, sponsorName: c.sponsorName,
      userId: c.userId, userName: c.userName, priority: c.priority, score: c.score,
      timeBlockId: placed.id, startsAt: placed.startsAt.toISOString(), room: tables[0].name,
    })
    repByRequest.set(c.reqId, c.repId)
  }

  if (!dryRun && scheduled.length) {
    // Commit-time revalidation: the plan above was computed from a read
    // snapshot, so a concurrent manual assignment, reschedule, or second
    // auto-schedule run may have taken one of these slots in the meantime.
    // Re-read the occupancy the plan depends on and drop any placement that
    // no longer fits — a double booking is never written; a rerun re-places
    // the dropped request in its next free slot.
    const planBlockIds = [...new Set(scheduled.map(s => s.timeBlockId))]
    const planUserIds = [...new Set(scheduled.map(s => s.userId))]
    const [freshSponsorMtgs, freshPeerMtgs] = await Promise.all([
      prisma.sponsorMeeting.findMany({
        where: {
          status: 'CONFIRMED',
          OR: [{ timeBlockId: { in: planBlockIds } }, { userId: { in: planUserIds } }],
        },
        select: { sponsorId: true, userId: true, timeBlockId: true },
      }),
      prisma.meeting.findMany({
        where: { status: { in: ['PENDING', 'CONFIRMED'] }, timeBlockId: { in: planBlockIds } },
        select: { attendeeAId: true, attendeeBId: true, timeBlockId: true },
      }),
    ])
    const freshUserBusy = new Set<string>()    // `${userId}::${block}`
    const freshPairs = new Set<string>()       // `${sponsorId}::${userId}`
    const freshSponsorBusy = new Set<string>() // `${sponsorId}::${block}`
    for (const m of freshSponsorMtgs) {
      freshUserBusy.add(`${m.userId}::${m.timeBlockId}`)
      freshPairs.add(`${m.sponsorId}::${m.userId}`)
      freshSponsorBusy.add(`${m.sponsorId}::${m.timeBlockId}`)
    }
    for (const pm of freshPeerMtgs) {
      freshUserBusy.add(`${pm.attendeeAId}::${pm.timeBlockId}`)
      freshUserBusy.add(`${pm.attendeeBId}::${pm.timeBlockId}`)
    }
    const survivors: AutoScheduledEntry[] = []
    for (const s of scheduled) {
      const conflict =
        freshPairs.has(`${s.sponsorId}::${s.userId}`) ||
        freshUserBusy.has(`${s.userId}::${s.timeBlockId}`) ||
        freshSponsorBusy.has(`${s.sponsorId}::${s.timeBlockId}`)
      if (conflict) {
        skipped.push({
          requestId: s.requestId, sponsorId: s.sponsorId, sponsorName: s.sponsorName,
          userId: s.userId, userName: s.userName, priority: s.priority,
          reason: 'Slot was taken while scheduling — run auto-schedule again',
        })
        continue
      }
      // Claim the surviving placement so a later plan entry can't reuse the
      // same block for this sponsor or attendee.
      freshUserBusy.add(`${s.userId}::${s.timeBlockId}`)
      freshPairs.add(`${s.sponsorId}::${s.userId}`)
      freshSponsorBusy.add(`${s.sponsorId}::${s.timeBlockId}`)
      survivors.push(s)
    }
    // Per-pair commits (not one batch transaction) so the DB-level backstop
    // can reject a single raced pair without rolling back every other booking:
    // if the exclusive-slot index rejects a write (a concurrent writer beat us
    // between the revalidation read and this commit), that pair moves to
    // skipped and the rest still land. A NON-conflict error (e.g. a dropped
    // connection) is rethrown — earlier pairs stay committed and the caller
    // gets a 500, which is honest about an outage (vs. masking it as spurious
    // "slot taken" skips) and safe to retry: the pair guards skip what landed.
    const committed: AutoScheduledEntry[] = []
    for (const s of survivors) {
      try {
        await commitOrConflict(() => prisma.$transaction([
          prisma.sponsorMeeting.create({
            data: {
              sponsorId: s.sponsorId, userId: s.userId, repId: repByRequest.get(s.requestId) ?? null,
              timeBlockId: s.timeBlockId, location: s.room, status: 'CONFIRMED',
            },
          }),
          prisma.meetingRequest.update({
            where: { id: s.requestId }, data: { status: 'CONFIRMED', timeBlockId: s.timeBlockId },
          }),
        ]))
        committed.push(s)
      } catch (err) {
        if (err instanceof EngineError) {
          skipped.push({
            requestId: s.requestId, sponsorId: s.sponsorId, sponsorName: s.sponsorName,
            userId: s.userId, userName: s.userName, priority: s.priority,
            reason: 'Slot was taken while scheduling — run auto-schedule again',
          })
          continue
        }
        throw err
      }
    }
    scheduled = committed
  }

  const byTier: TierSummary[] = MEETING_PRIORITIES.map(tier => ({
    tier,
    eligible: cands.filter(c => c.priority === tier).length,
    scheduled: scheduled.filter(s => s.priority === tier).length,
    skipped: skipped.filter(s => s.priority === tier).length,
  }))

  return { dryRun, scheduled, skipped, byTier, totalEligible: cands.length }
}

// ── Scheduling lanes ────────────────────────────────────────────────────────
// Every sponsor↔attendee BEST_FIT request belongs to the Auto lane (admin
// Meetings → Auto): a mutual pair is scheduled automatically, a one-sided pick
// waits there for reciprocation. The Meeting Requests board owns the rest —
// MED and LOW requests (full and half matches alike) plus peer-to-peer
// requests, which have no Auto lane. Both boards build on these shared where
// fragments so a Best Fit pick can never land in the manual review queue.
export const autoLaneRequestWhere: Prisma.MeetingRequestWhereInput = {
  priority: 'BEST_FIT',
  OR: [
    { targetSponsorId: { not: null } },                                       // attendee → sponsor pick
    { targetUserId: { not: null }, requester: { sponsorId: { not: null } } }, // rep → attendee pick
  ],
}
export const requestBoardWhere: Prisma.MeetingRequestWhereInput = { NOT: autoLaneRequestWhere }
// The tiers the requests-board bulk schedulers may touch (everything but the
// Auto lane's tier).
export const REQUEST_BOARD_PRIORITIES: MeetingPriority[] = ['MED', 'LOW']

// ── Mutual Best Fit auto-matching ───────────────────────────────────────────
// A pair is an "auto match" when BOTH sides independently tagged each other
// Best Fit through their portals: the attendee filed a BEST_FIT request
// targeting the sponsor AND one of the sponsor's reps filed a BEST_FIT request
// targeting that attendee. Matches are derived live from MeetingRequest rows —
// nothing extra is persisted, so a pick (or a downgrade/rejection) on either
// side immediately makes or breaks the match. A pick the other side has not
// reciprocated yet is a "half match": it stays visible on the Auto board as
// awaiting reciprocation rather than re-entering the manual review queue.
export interface AutoMatchPick {
  requestId: string
  status: string   // PENDING | APPROVED | CONFIRMED
  message: string | null
  byName: string   // who made the pick: the attendee, or the sponsor rep
  pickedAt: string // ISO createdAt of the Best Fit request
}
export interface AutoMatchMeeting {
  sponsorMeetingId: string
  timeBlockId: string
  startsAt: string
  endsAt: string
  room: string | null
}
export interface AutoMatch {
  key: string // `${sponsorId}::${userId}` — the engine's pair identity
  sponsor: { id: string; name: string; logoUrl: string | null; tier: string }
  attendee: { id: string; name: string; company: string | null; image: string | null }
  sponsorPick: AutoMatchPick  // rep → attendee
  attendeePick: AutoMatchPick // attendee → sponsor
  matchedAt: string           // the later of the two picks — when the match formed
  score: number               // solutions fit score (0–100)
  matchedSolutions: string[]
  meeting: AutoMatchMeeting | null // the pair's confirmed meeting, once scheduled
}
export interface AutoMatchHalf {
  key: string // `${sponsorId}::${userId}` — same pair identity as AutoMatch
  sponsor: { id: string; name: string; logoUrl: string | null; tier: string }
  attendee: { id: string; name: string; company: string | null; image: string | null }
  pickedBy: 'SPONSOR' | 'ATTENDEE' // which side has picked Best Fit so far
  pick: AutoMatchPick
  counterpartPriority: MeetingPriority | null // the other side's strongest live pick, when one exists at Med/Low
  score: number // solutions fit score (0–100)
}
export interface AutoMatchTotals {
  matches: number
  ready: number     // matched, awaiting a meeting
  scheduled: number // matched with a confirmed meeting
  awaitingReciprocation: number // half matches — one side picked, the other hasn't
}
export type AutoMatchEventType = 'MATCHED' | 'SCHEDULED' | 'RESCHEDULED' | 'CANCELLED'
export interface AutoMatchLogEntry {
  id: string
  event: AutoMatchEventType
  sponsorId: string
  userId: string
  sponsorName: string
  attendeeName: string
  room: string | null      // SCHEDULED only
  startsAt: string | null  // SCHEDULED only — the meeting's slot start (ISO)
  createdAt: string
}
export interface AutoMatchBoard {
  matches: AutoMatch[] // ready first (best score, then oldest match), then scheduled by meeting time
  halfMatches: AutoMatchHalf[] // best score first, then oldest pick
  totals: AutoMatchTotals
  log: AutoMatchLogEntry[] // newest first
}

interface ComputedAutoMatches {
  matches: AutoMatch[]
  halfMatches: AutoMatchHalf[]
}

async function computeAutoMatches(prisma: Db, confId: string): Promise<ComputedAutoMatches> {
  const [sponsors, requests] = await Promise.all([
    prisma.sponsor.findMany({
      where: { conferenceId: confId },
      select: { id: true, name: true, logoUrl: true, tier: true, solutionsSeeking: true, solutionsOffering: true },
    }),
    // All live requests, not just BEST_FIT: the Med/Low rows tell a half-match
    // card what the unreciprocated side has picked so far.
    prisma.meetingRequest.findMany({
      where: { status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, requesterId: true, targetUserId: true, targetSponsorId: true,
        status: true, priority: true, message: true, createdAt: true,
        requester: { select: { sponsorId: true, name: true, company: true, image: true, solutionsOffering: true, solutionsSeeking: true } },
        targetUser: { select: { name: true, company: true, image: true, solutionsOffering: true, solutionsSeeking: true } },
      },
    }),
  ])
  const sponsorById = new Map(sponsors.map(s => [s.id, s]))

  // First live BEST_FIT pick per side of each pair. Rows arrive createdAt-asc,
  // so when e.g. two reps of one company pick the same attendee, the earliest
  // pick represents the sponsor side. Non-Best-Fit rows only contribute the
  // strongest counterpart tier per side (for half-match cards).
  type Pick = (typeof requests)[number]
  const attendeePicks = new Map<string, Pick>() // attendee → sponsor
  const sponsorPicks = new Map<string, Pick>()  // rep → attendee
  const attendeeTier = new Map<string, MeetingPriority>() // attendee side's Med/Low pick
  const sponsorTier = new Map<string, MeetingPriority>()  // sponsor side's Med/Low pick
  for (const req of requests) {
    const parties = resolveParties(req as RequestLike)
    if (!parties || !sponsorById.has(parties.sponsorId)) continue
    const attendeeSide = !!req.targetSponsorId
    const key = `${parties.sponsorId}::${parties.userId}`
    if (req.priority === 'BEST_FIT') {
      const side = attendeeSide ? attendeePicks : sponsorPicks
      if (!side.has(key)) side.set(key, req)
    } else {
      const tiers = attendeeSide ? attendeeTier : sponsorTier
      const p = normalizePriority(req.priority)
      const cur = tiers.get(key)
      if (!cur || priorityRank(p) < priorityRank(cur)) tiers.set(key, p)
    }
  }
  const matchedKeys = [...attendeePicks.keys()].filter(k => sponsorPicks.has(k))
  const matchedSet = new Set(matchedKeys)
  const halfKeys = [...new Set([...attendeePicks.keys(), ...sponsorPicks.keys()])]
    .filter(k => !matchedSet.has(k))
  if (matchedKeys.length === 0 && halfKeys.length === 0) return { matches: [], halfMatches: [] }

  // Confirmed meetings for every involved pair — the same pair notion as the
  // ALREADY_SCHEDULED guard in assignMeeting (conference-agnostic). Matches use
  // it as their scheduled state; a half whose pair already meets needs no
  // reciprocation and drops off the board.
  const involvedUserIds = [...new Set([...matchedKeys, ...halfKeys].map(k => k.split('::')[1]))]
  const confirmed = await prisma.sponsorMeeting.findMany({
    where: { status: 'CONFIRMED', userId: { in: involvedUserIds } },
    select: {
      id: true, sponsorId: true, userId: true, timeBlockId: true, location: true,
      timeBlock: { select: { startsAt: true, endsAt: true } },
    },
  })
  const meetingByPair = new Map(confirmed.map(m => [`${m.sponsorId}::${m.userId}`, m]))

  const matches: AutoMatch[] = matchedKeys.map(key => {
    const aPick = attendeePicks.get(key)!
    const sPick = sponsorPicks.get(key)!
    const sponsor = sponsorById.get(aPick.targetSponsorId!)!
    const attendee = aPick.requester
    const { score, matched } = scoreSolutionsMatch(
      parseSolutions(sponsor.solutionsSeeking), parseSolutions(sponsor.solutionsOffering),
      parseSolutions(attendee?.solutionsOffering), parseSolutions(attendee?.solutionsSeeking),
    )
    const m = meetingByPair.get(key)
    return {
      key,
      sponsor: { id: sponsor.id, name: sponsor.name, logoUrl: sponsor.logoUrl, tier: sponsor.tier },
      attendee: { id: aPick.requesterId, name: attendee?.name ?? 'Unknown', company: attendee?.company ?? null, image: attendee?.image ?? null },
      sponsorPick: {
        requestId: sPick.id, status: sPick.status, message: sPick.message,
        byName: sPick.requester?.name ?? sponsor.name, pickedAt: sPick.createdAt.toISOString(),
      },
      attendeePick: {
        requestId: aPick.id, status: aPick.status, message: aPick.message,
        byName: attendee?.name ?? 'Unknown', pickedAt: aPick.createdAt.toISOString(),
      },
      matchedAt: new Date(Math.max(aPick.createdAt.getTime(), sPick.createdAt.getTime())).toISOString(),
      score,
      matchedSolutions: matched,
      meeting: m ? {
        sponsorMeetingId: m.id, timeBlockId: m.timeBlockId,
        startsAt: m.timeBlock.startsAt.toISOString(), endsAt: m.timeBlock.endsAt.toISOString(),
        room: m.location,
      } : null,
    }
  })
  matches.sort((a, b) => {
    if (!a.meeting !== !b.meeting) return a.meeting ? 1 : -1
    if (!a.meeting) return b.score - a.score || a.matchedAt.localeCompare(b.matchedAt)
    return a.meeting.startsAt.localeCompare(b.meeting!.startsAt)
  })

  const halfMatches: AutoMatchHalf[] = []
  for (const key of halfKeys) {
    if (meetingByPair.has(key)) continue // the pair already meets — nothing to reciprocate
    const pickedBy = attendeePicks.has(key) ? ('ATTENDEE' as const) : ('SPONSOR' as const)
    const req = (attendeePicks.get(key) ?? sponsorPicks.get(key))!
    const sponsor = sponsorById.get(key.split('::')[0])!
    // The candidate (the attendee being met) is the requester on an
    // attendee-side pick and the target on a sponsor-side pick.
    const cand = pickedBy === 'ATTENDEE' ? req.requester : req.targetUser
    const { score } = scoreSolutionsMatch(
      parseSolutions(sponsor.solutionsSeeking), parseSolutions(sponsor.solutionsOffering),
      parseSolutions(cand?.solutionsOffering), parseSolutions(cand?.solutionsSeeking),
    )
    halfMatches.push({
      key,
      sponsor: { id: sponsor.id, name: sponsor.name, logoUrl: sponsor.logoUrl, tier: sponsor.tier },
      attendee: { id: key.split('::')[1], name: cand?.name ?? 'Unknown', company: cand?.company ?? null, image: cand?.image ?? null },
      pickedBy,
      pick: {
        requestId: req.id, status: req.status, message: req.message,
        byName: req.requester?.name ?? (pickedBy === 'SPONSOR' ? sponsor.name : 'Unknown'),
        pickedAt: req.createdAt.toISOString(),
      },
      counterpartPriority: (pickedBy === 'ATTENDEE' ? sponsorTier : attendeeTier).get(key) ?? null,
      score,
    })
  }
  halfMatches.sort((a, b) => b.score - a.score || a.pick.pickedAt.localeCompare(b.pick.pickedAt))

  return { matches, halfMatches }
}

export async function getAutoMatchLog(prisma: Db, limit = 50): Promise<AutoMatchLogEntry[]> {
  const rows = await prisma.autoMatchEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(r => ({
    id: r.id,
    event: r.event as AutoMatchEventType,
    sponsorId: r.sponsorId,
    userId: r.userId,
    sponsorName: r.sponsorName,
    attendeeName: r.attendeeName,
    room: r.room,
    startsAt: r.startsAt ? r.startsAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function getAutoMatchBoard(prisma: Db, conferenceId?: string): Promise<AutoMatchBoard> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const [{ matches, halfMatches }, log] = await Promise.all([
    computeAutoMatches(prisma, confId),
    getAutoMatchLog(prisma),
  ])
  const scheduled = matches.filter(m => m.meeting).length
  return {
    matches,
    halfMatches,
    totals: {
      matches: matches.length,
      ready: matches.length - scheduled,
      scheduled,
      awaitingReciprocation: halfMatches.length,
    },
    log,
  }
}

// One schedulable request per ready match — the sponsor-side request when it is
// still live, so the created meeting inherits the rep who made the pick.
function readyRequestIds(matches: AutoMatch[]): string[] {
  const ids: string[] = []
  for (const m of matches) {
    if (m.meeting) continue
    const pick = [m.sponsorPick, m.attendeePick].find(p => p.status === 'PENDING' || p.status === 'APPROVED')
    if (pick) ids.push(pick.requestId)
  }
  return ids
}

// Materialize every ready match into a confirmed meeting via the priority
// auto-scheduler. All booking constraints (blackouts, one meeting per attendee
// per block, booth/room capacity) apply unchanged.
export interface AutoMatchScheduleResult extends AutoScheduleResult {
  matchedPairs: number // ready matches this run attempted to schedule
}
export async function scheduleAutoMatches(
  prisma: Db, input: { conferenceId?: string; dryRun?: boolean } = {},
): Promise<AutoMatchScheduleResult> {
  const confId = await resolveConferenceId(prisma, input.conferenceId)
  const requestIds = readyRequestIds((await computeAutoMatches(prisma, confId)).matches)
  if (requestIds.length === 0) {
    return {
      dryRun: !!input.dryRun, scheduled: [], skipped: [],
      byTier: MEETING_PRIORITIES.map(tier => ({ tier, eligible: 0, scheduled: 0, skipped: 0 })),
      totalEligible: 0, matchedPairs: 0,
    }
  }
  const result = await autoScheduleByPriority(prisma, { conferenceId: confId, dryRun: input.dryRun, requestIds })
  return { ...result, matchedPairs: requestIds.length }
}

// The auto-matching sweep: schedule every ready mutual match, then reconcile
// the audit log with reality — one MATCHED event per pair, one SCHEDULED event
// once the pair has a confirmed meeting, whichever path created it (this
// sweep, a portal pick trigger, or a manual assignment). Idempotent, so it can
// run on every read of the board and on every Best Fit pick.
export interface AutoMatchSyncResult {
  scheduled: AutoScheduledEntry[] // meetings created by this sweep
  matchedLogged: number           // new MATCHED events written
  scheduledLogged: number         // new SCHEDULED events written (incl. backfill)
}
export async function syncAutoMatches(prisma: Db, conferenceId?: string): Promise<AutoMatchSyncResult> {
  const confId = await resolveConferenceId(prisma, conferenceId)
  const { matches } = await computeAutoMatches(prisma, confId)
  if (matches.length === 0) return { scheduled: [], matchedLogged: 0, scheduledLogged: 0 }

  const requestIds = readyRequestIds(matches)
  const run = requestIds.length
    ? await autoScheduleByPriority(prisma, { conferenceId: confId, requestIds })
    : null

  const existing = await prisma.autoMatchEvent.findMany({
    where: { userId: { in: matches.map(m => m.attendee.id) } },
    select: { sponsorId: true, userId: true, event: true, createdAt: true },
  })
  // A cancelled match that re-forms (both sides pick each other again) gets
  // fresh MATCHED/SCHEDULED entries: dedup only against events newer than the
  // pair's most recent cancellation.
  const lastCancelled = new Map<string, number>()
  for (const e of existing) {
    if (e.event !== 'CANCELLED') continue
    const k = `${e.sponsorId}::${e.userId}`
    lastCancelled.set(k, Math.max(lastCancelled.get(k) ?? 0, e.createdAt.getTime()))
  }
  const seen = new Set(
    existing
      .filter(e => e.createdAt.getTime() > (lastCancelled.get(`${e.sponsorId}::${e.userId}`) ?? -1))
      .map(e => `${e.event}|${e.sponsorId}::${e.userId}`),
  )
  const placedNow = new Map((run?.scheduled ?? []).map(s => [`${s.sponsorId}::${s.userId}`, s]))

  const rows: {
    sponsorId: string; userId: string; sponsorName: string; attendeeName: string
    event: AutoMatchEventType; room: string | null; startsAt: Date | null
  }[] = []
  for (const m of matches) {
    const base = { sponsorId: m.sponsor.id, userId: m.attendee.id, sponsorName: m.sponsor.name, attendeeName: m.attendee.name }
    if (!seen.has(`MATCHED|${m.key}`)) {
      rows.push({ ...base, event: 'MATCHED', room: null, startsAt: null })
    }
    const placed = m.meeting
      ? { room: m.meeting.room, startsAt: new Date(m.meeting.startsAt) }
      : placedNow.has(m.key)
        ? { room: placedNow.get(m.key)!.room, startsAt: new Date(placedNow.get(m.key)!.startsAt) }
        : null
    if (placed && !seen.has(`SCHEDULED|${m.key}`)) {
      rows.push({ ...base, event: 'SCHEDULED', ...placed })
    }
  }
  if (rows.length) await prisma.autoMatchEvent.createMany({ data: rows })

  const matchedLogged = rows.filter(r => r.event === 'MATCHED').length
  return { scheduled: run?.scheduled ?? [], matchedLogged, scheduledLogged: rows.length - matchedLogged }
}

// ── Auto-match meeting actions ──────────────────────────────────────────────
// Reschedule / cancel for meetings on the Auto board. Both reuse the engine's
// guarded mutations and extend the auto-match audit trail.
async function autoMatchPairNames(prisma: Db, sponsorId: string, userId: string) {
  const [sponsor, user] = await Promise.all([
    prisma.sponsor.findUnique({ where: { id: sponsorId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
  ])
  return { sponsorName: sponsor?.name ?? 'Company', attendeeName: user?.name ?? 'Attendee' }
}

export async function rescheduleAutoMatchMeeting(prisma: Db, input: RescheduleInput) {
  const meeting = await rescheduleMeeting(prisma, input)
  const [tb, names] = await Promise.all([
    prisma.timeBlock.findUnique({ where: { id: input.timeBlockId }, select: { startsAt: true } }),
    autoMatchPairNames(prisma, meeting.sponsorId, meeting.userId),
  ])
  await prisma.autoMatchEvent.create({
    data: {
      sponsorId: meeting.sponsorId, userId: meeting.userId, ...names,
      event: 'RESCHEDULED', room: input.room, startsAt: tb?.startsAt ?? null,
    },
  })
  return meeting
}

// Cancelling an auto-matched meeting dissolves the match: every live Best Fit
// pick between the pair is withdrawn (CANCELLED) along with the meeting.
// Anything less would be self-defeating — a surviving mutual pick re-forms the
// match and the very next sweep re-schedules the meeting the admin just
// cancelled. A fresh pick from both sides re-creates the match organically.
export interface AutoMatchCancelInput {
  sponsorMeetingId: string
  reason?: string | null
}
export async function cancelAutoMatchMeeting(prisma: Db, input: AutoMatchCancelInput) {
  const result = await cancelMeeting(prisma, {
    sponsorMeetingId: input.sponsorMeetingId,
    preserveRequest: false,
    reason: input.reason ?? null,
  })
  const { sponsorId, userId } = result.meeting
  const [, names] = await Promise.all([
    prisma.meetingRequest.updateMany({
      where: {
        priority: 'BEST_FIT',
        status: { in: ['PENDING', 'APPROVED', 'CONFIRMED'] },
        OR: [
          { targetSponsorId: sponsorId, requesterId: userId },
          { requester: { sponsorId }, targetUserId: userId },
        ],
      },
      data: { status: 'CANCELLED' },
    }),
    autoMatchPairNames(prisma, sponsorId, userId),
  ])
  await prisma.autoMatchEvent.create({
    data: {
      sponsorId, userId, ...names,
      event: 'CANCELLED', room: null, startsAt: null,
    },
  })
  return result
}
