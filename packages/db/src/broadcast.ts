// Broadcast identity — the single source of truth for "is this feed post an
// admin global broadcast?".
//
// Admins have exactly one way to write into the shared general room
// (`room-general`): the admin app's "Global Broadcast" composer (and the
// scheduled-broadcast dispatcher, which posts on their behalf). Both persist an
// ordinary Message row with no distinguishing flag — the ONLY signal that a
// feed post is a global broadcast is that its sender holds an admin role. So
// this file defines that role set once and everything else keys off it.
//
// Pure by design: NO imports (no relative modules, no Prisma). That keeps it
// importable by the type-strip node test scripts under scripts/, and cheap to
// mirror into client bundles that must not pull the Prisma runtime.
//
// NOTE: the attendee client (apps/attendee/components/people/FeedTab.tsx) keeps
// a hand-copy of this role set rather than importing it, because importing any
// runtime value from '@conference/db' would bundle the Prisma client into the
// browser. A sync test (scripts/test-broadcast-glow.mjs) asserts the two never
// drift.

// Roles whose general-room posts are treated as admin global broadcasts. Mirror
// of the gate in apps/web/app/api/chat/broadcast/route.ts.
export const ADMIN_BROADCAST_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN'] as const

export type AdminBroadcastRole = (typeof ADMIN_BROADCAST_ROLES)[number]

const ADMIN_BROADCAST_ROLE_SET: ReadonlySet<string> = new Set(ADMIN_BROADCAST_ROLES)

/**
 * True when a feed post's sender role marks it as an admin global broadcast.
 * Null-safe: attendees carry `role = 'ATTENDEE'` (or null on legacy rows),
 * neither of which is a broadcast.
 */
export function isAdminBroadcastRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_BROADCAST_ROLE_SET.has(role)
}
