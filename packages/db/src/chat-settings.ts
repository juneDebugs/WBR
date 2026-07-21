// Admin-controlled chat messaging permissions.
//
// This module is the single source of truth for the "Chat Settings" surface in
// the admin app (apps/web → Chat → Settings tab) and the enforcement layer that
// gates who may send friend requests / start new DMs in the attendee app.
//
// Three independent controls, mirroring the product spec:
//   1. A GLOBAL master switch for ALL vendor → attendee/speaker outreach.
//   2. Per-vendor (per Sponsor company) switches: may this vendor message
//      Attendees and/or Speakers.
//   3. Per-staff (per WBR Staff member) switches: may this staffer message
//      Attendees, Vendors and/or Speakers.
//
// Design notes (match the repo's established conventions):
//   • NO relative imports. Node test scripts type-strip this .ts file directly
//     (they can't resolve extensionless relative specifiers), exactly like
//     chat.ts / friends.ts. Everything is either self-contained or takes the
//     Prisma client as a parameter.
//   • Persistence follows the RolePermission precedent: the repo has no
//     migration history, so we own the backing table with a defensive
//     `CREATE TABLE IF NOT EXISTS`. The column shape matches the
//     ChatMessagingPermission model in schema.prisma exactly, so a future
//     `prisma db push` is a no-op.
//   • Defaults are PERMISSIVE (everything enabled) so the feature is purely an
//     opt-in restriction layer on top of the existing friendship gate — turning
//     nothing on preserves today's behavior. Reads FAIL OPEN on a transient DB
//     error: a moderation toggle should never hard-break peer messaging.

import type { PrismaClient } from '@prisma/client'

// ─── Settings shapes ─────────────────────────────────────────────────────────

export type VendorGlobalSettings = { enabled: boolean }
export type VendorSettings = { toAttendees: boolean; toSpeakers: boolean }
export type StaffSettings = { toAttendees: boolean; toVendors: boolean; toSpeakers: boolean }

export const DEFAULT_VENDOR_GLOBAL: VendorGlobalSettings = { enabled: true }
export const DEFAULT_VENDOR_SETTINGS: VendorSettings = { toAttendees: true, toSpeakers: true }
export const DEFAULT_STAFF_SETTINGS: StaffSettings = { toAttendees: true, toVendors: true, toSpeakers: true }

export const CHAT_PERMISSION_SCOPE = {
  VENDOR_GLOBAL: 'VENDOR_GLOBAL',
  VENDOR: 'VENDOR',
  STAFF: 'STAFF',
} as const
export type ChatPermissionScope = (typeof CHAT_PERMISSION_SCOPE)[keyof typeof CHAT_PERMISSION_SCOPE]

// ─── Actor / target classification ───────────────────────────────────────────
// Roles are a free-form String column on User (no Prisma enum):
//   ATTENDEE | SPEAKER | ORGANIZER | STAFF | ADMIN | SPONSOR.
// A "vendor" is anyone affiliated with a Sponsor company — i.e. a non-null
// sponsorId (genuine reps) OR the placeholder role 'SPONSOR' (demo accounts).

export type RoleShape = { role?: string | null; sponsorId?: string | null }
export type ActorKind = 'vendor' | 'staff' | 'other'
export type TargetKind = 'attendee' | 'speaker' | 'vendor' | 'staff' | 'other'

export function isVendorAffiliated(r: RoleShape): boolean {
  return !!r.sponsorId || r.role === 'SPONSOR'
}

// Staff is checked before vendor: a staffer never carries a sponsorId, but this
// keeps the classification total and unambiguous.
export function classifyActor(r: RoleShape): ActorKind {
  if (r.role === 'STAFF') return 'staff'
  if (isVendorAffiliated(r)) return 'vendor'
  return 'other'
}

// Vendor-affiliation wins over the raw role for targets too, so a sponsor rep
// who also holds a SPEAKER role is treated as a vendor consistently on both
// sides. ORGANIZER/ADMIN targets are 'other' (never gated as recipients).
export function classifyTarget(r: RoleShape): TargetKind {
  if (isVendorAffiliated(r)) return 'vendor'
  if (r.role === 'STAFF') return 'staff'
  if (r.role === 'SPEAKER') return 'speaker'
  if (r.role === 'ATTENDEE') return 'attendee'
  return 'other'
}

// ─── Pure decision function ──────────────────────────────────────────────────

export type MessagingDecision = { allowed: boolean; code?: string; message?: string }

const ALLOW: MessagingDecision = { allowed: true }

// Given the actor/target kinds and the resolved settings, decide whether the
// actor may send a friend request / start a new DM with the target. Pure and
// synchronous so it can be unit-tested exhaustively without a database.
export function evaluateMessagingPermission(input: {
  actorKind: ActorKind
  targetKind: TargetKind
  vendorGlobalEnabled: boolean
  vendorSettings: VendorSettings
  staffSettings: StaffSettings
}): MessagingDecision {
  const { actorKind, targetKind } = input

  if (actorKind === 'vendor') {
    // The global master switch overrides every per-vendor setting.
    if (!input.vendorGlobalEnabled) {
      return {
        allowed: false,
        code: 'VENDOR_MESSAGING_DISABLED',
        message: 'Vendor messaging to attendees and speakers is currently turned off by the organizers.',
      }
    }
    if (targetKind === 'attendee' && !input.vendorSettings.toAttendees) {
      return {
        allowed: false,
        code: 'VENDOR_BLOCKED_ATTENDEES',
        message: 'Your organization isn’t permitted to message attendees.',
      }
    }
    if (targetKind === 'speaker' && !input.vendorSettings.toSpeakers) {
      return {
        allowed: false,
        code: 'VENDOR_BLOCKED_SPEAKERS',
        message: 'Your organization isn’t permitted to message speakers.',
      }
    }
    // Vendor → vendor / staff / other is outside this feature's scope.
    return ALLOW
  }

  if (actorKind === 'staff') {
    if (targetKind === 'attendee' && !input.staffSettings.toAttendees) {
      return { allowed: false, code: 'STAFF_BLOCKED_ATTENDEES', message: 'You’re not permitted to message attendees.' }
    }
    if (targetKind === 'vendor' && !input.staffSettings.toVendors) {
      return { allowed: false, code: 'STAFF_BLOCKED_VENDORS', message: 'You’re not permitted to message vendors.' }
    }
    if (targetKind === 'speaker' && !input.staffSettings.toSpeakers) {
      return { allowed: false, code: 'STAFF_BLOCKED_SPEAKERS', message: 'You’re not permitted to message speakers.' }
    }
    return ALLOW
  }

  // Attendees, speakers, organizers, admins are not restricted by this feature.
  return ALLOW
}

// ─── Normalizers (coerce arbitrary/hostile input to strict booleans) ─────────

export function normalizeVendorGlobal(s: Partial<VendorGlobalSettings> | null | undefined): VendorGlobalSettings {
  return { enabled: s?.enabled !== false }
}
export function normalizeVendorSettings(s: Partial<VendorSettings> | null | undefined): VendorSettings {
  return { toAttendees: s?.toAttendees !== false, toSpeakers: s?.toSpeakers !== false }
}
export function normalizeStaffSettings(s: Partial<StaffSettings> | null | undefined): StaffSettings {
  return {
    toAttendees: s?.toAttendees !== false,
    toVendors: s?.toVendors !== false,
    toSpeakers: s?.toSpeakers !== false,
  }
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `CREATE TABLE IF NOT EXISTS "ChatMessagingPermission" (
  "scope" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "settings" TEXT NOT NULL,
  "updatedAt" DATETIME NOT NULL,
  PRIMARY KEY ("scope", "subjectId")
)`

let ensured: Promise<void> | null = null
// Memoized per process; IF NOT EXISTS makes re-runs harmless if a serverless
// instance resets the module. Reset on failure so a transient error retries.
export function ensureChatSettingsTable(prismaClient: PrismaClient): Promise<void> {
  if (!ensured) {
    ensured = prismaClient
      .$executeRawUnsafe(CREATE_TABLE_SQL)
      .then(() => undefined)
      .catch(err => {
        ensured = null
        throw err
      })
  }
  return ensured
}

type Row = { scope: string; subjectId: string; settings: string }

function parseSettings<T>(raw: string, fallback: T): T {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? { ...fallback, ...parsed } : fallback
  } catch {
    return fallback
  }
}

// Full snapshot of every stored row, keyed for easy merge in the admin UI.
export type ChatMessagingSettings = {
  vendorGlobal: VendorGlobalSettings
  vendors: Record<string, VendorSettings> // keyed by sponsorId
  staff: Record<string, StaffSettings> // keyed by userId
}

export async function getAllChatMessagingSettings(prismaClient: PrismaClient): Promise<ChatMessagingSettings> {
  const out: ChatMessagingSettings = { vendorGlobal: { ...DEFAULT_VENDOR_GLOBAL }, vendors: {}, staff: {} }
  try {
    await ensureChatSettingsTable(prismaClient)
    const rows = await prismaClient.$queryRawUnsafe<Row[]>(
      `SELECT "scope", "subjectId", "settings" FROM "ChatMessagingPermission"`,
    )
    for (const row of rows) {
      if (row.scope === CHAT_PERMISSION_SCOPE.VENDOR_GLOBAL) {
        out.vendorGlobal = normalizeVendorGlobal(parseSettings(row.settings, DEFAULT_VENDOR_GLOBAL))
      } else if (row.scope === CHAT_PERMISSION_SCOPE.VENDOR) {
        out.vendors[row.subjectId] = normalizeVendorSettings(parseSettings(row.settings, DEFAULT_VENDOR_SETTINGS))
      } else if (row.scope === CHAT_PERMISSION_SCOPE.STAFF) {
        out.staff[row.subjectId] = normalizeStaffSettings(parseSettings(row.settings, DEFAULT_STAFF_SETTINGS))
      }
    }
  } catch (err) {
    // Fail open: return permissive defaults rather than break the settings page.
    console.error('[chat-settings] read failed, returning defaults:', err)
  }
  return out
}

// Targeted single-row reads used by the enforcement path (cheaper than loading
// the whole table on every friend-request / DM attempt). All fail open.

export async function getVendorGlobalEnabled(prismaClient: PrismaClient): Promise<boolean> {
  try {
    await ensureChatSettingsTable(prismaClient)
    const rows = await prismaClient.$queryRawUnsafe<Row[]>(
      `SELECT "scope", "subjectId", "settings" FROM "ChatMessagingPermission" WHERE "scope" = ? AND "subjectId" = ?`,
      CHAT_PERMISSION_SCOPE.VENDOR_GLOBAL,
      '',
    )
    if (!rows.length) return DEFAULT_VENDOR_GLOBAL.enabled
    return normalizeVendorGlobal(parseSettings(rows[0].settings, DEFAULT_VENDOR_GLOBAL)).enabled
  } catch (err) {
    console.error('[chat-settings] vendor-global read failed, allowing:', err)
    return DEFAULT_VENDOR_GLOBAL.enabled
  }
}

export async function getVendorSettings(prismaClient: PrismaClient, sponsorId: string): Promise<VendorSettings> {
  if (!sponsorId) return { ...DEFAULT_VENDOR_SETTINGS }
  try {
    await ensureChatSettingsTable(prismaClient)
    const rows = await prismaClient.$queryRawUnsafe<Row[]>(
      `SELECT "scope", "subjectId", "settings" FROM "ChatMessagingPermission" WHERE "scope" = ? AND "subjectId" = ?`,
      CHAT_PERMISSION_SCOPE.VENDOR,
      sponsorId,
    )
    if (!rows.length) return { ...DEFAULT_VENDOR_SETTINGS }
    return normalizeVendorSettings(parseSettings(rows[0].settings, DEFAULT_VENDOR_SETTINGS))
  } catch (err) {
    console.error('[chat-settings] vendor read failed, allowing:', err)
    return { ...DEFAULT_VENDOR_SETTINGS }
  }
}

export async function getStaffSettings(prismaClient: PrismaClient, userId: string): Promise<StaffSettings> {
  if (!userId) return { ...DEFAULT_STAFF_SETTINGS }
  try {
    await ensureChatSettingsTable(prismaClient)
    const rows = await prismaClient.$queryRawUnsafe<Row[]>(
      `SELECT "scope", "subjectId", "settings" FROM "ChatMessagingPermission" WHERE "scope" = ? AND "subjectId" = ?`,
      CHAT_PERMISSION_SCOPE.STAFF,
      userId,
    )
    if (!rows.length) return { ...DEFAULT_STAFF_SETTINGS }
    return normalizeStaffSettings(parseSettings(rows[0].settings, DEFAULT_STAFF_SETTINGS))
  } catch (err) {
    console.error('[chat-settings] staff read failed, allowing:', err)
    return { ...DEFAULT_STAFF_SETTINGS }
  }
}

// Bulk upsert from the admin Settings tab. Only the provided slices are written,
// so the client can send just the rows the user actually changed.
export async function saveChatMessagingSettings(
  prismaClient: PrismaClient,
  payload: {
    vendorGlobal?: Partial<VendorGlobalSettings> | null
    vendors?: { sponsorId: string; settings: Partial<VendorSettings> }[]
    staff?: { userId: string; settings: Partial<StaffSettings> }[]
  },
): Promise<void> {
  await ensureChatSettingsTable(prismaClient)
  const now = new Date().toISOString()
  const upsert = (scope: ChatPermissionScope, subjectId: string, settings: unknown) =>
    prismaClient.$executeRawUnsafe(
      `INSERT INTO "ChatMessagingPermission" ("scope", "subjectId", "settings", "updatedAt")
       VALUES (?, ?, ?, ?)
       ON CONFLICT("scope", "subjectId") DO UPDATE SET
         "settings" = excluded."settings",
         "updatedAt" = excluded."updatedAt"`,
      scope,
      subjectId,
      JSON.stringify(settings),
      now,
    )

  if (payload.vendorGlobal) {
    await upsert(CHAT_PERMISSION_SCOPE.VENDOR_GLOBAL, '', normalizeVendorGlobal(payload.vendorGlobal))
  }
  for (const v of payload.vendors ?? []) {
    if (!v?.sponsorId) continue
    await upsert(CHAT_PERMISSION_SCOPE.VENDOR, v.sponsorId, normalizeVendorSettings(v.settings))
  }
  for (const s of payload.staff ?? []) {
    if (!s?.userId) continue
    await upsert(CHAT_PERMISSION_SCOPE.STAFF, s.userId, normalizeStaffSettings(s.settings))
  }
}

// ─── Enforcement entry point ─────────────────────────────────────────────────
//
// The single composite check used by every friend-request / new-DM code path in
// the attendee app. Loads only what it needs and fails OPEN on any error so a
// transient DB blip never blocks legitimate messaging.
export async function checkMessagingPermission(
  prismaClient: PrismaClient,
  actor: { id: string; role?: string | null; sponsorId?: string | null },
  targetUserId: string,
): Promise<MessagingDecision> {
  try {
    const actorKind = classifyActor(actor)
    // Only vendors and staff are ever restricted — skip all DB work otherwise.
    if (actorKind === 'other') return ALLOW

    const target = await prismaClient.user.findUnique({
      where: { id: targetUserId },
      select: { role: true, sponsorId: true },
    })
    // Missing target: let the downstream helper surface "User not found".
    if (!target) return ALLOW
    const targetKind = classifyTarget(target)

    if (actorKind === 'vendor') {
      const [vendorGlobalEnabled, vendorSettings] = await Promise.all([
        getVendorGlobalEnabled(prismaClient),
        actor.sponsorId ? getVendorSettings(prismaClient, actor.sponsorId) : Promise.resolve({ ...DEFAULT_VENDOR_SETTINGS }),
      ])
      return evaluateMessagingPermission({
        actorKind,
        targetKind,
        vendorGlobalEnabled,
        vendorSettings,
        staffSettings: DEFAULT_STAFF_SETTINGS,
      })
    }

    // actorKind === 'staff'
    const staffSettings = await getStaffSettings(prismaClient, actor.id)
    return evaluateMessagingPermission({
      actorKind,
      targetKind,
      vendorGlobalEnabled: true,
      vendorSettings: DEFAULT_VENDOR_SETTINGS,
      staffSettings,
    })
  } catch (err) {
    console.error('[chat-settings] permission check failed, allowing:', err)
    return ALLOW
  }
}
