// Friends — shared logic for the attendee friend-request system, built on the
// existing Follow model with NO schema change. A friendship is represented as
// MUTUAL Follow edges:
//
//   - no edge either direction              → 'none'
//   - my edge only (me→them)                → 'pending_outgoing' (I requested)
//   - their edge only (them→me)             → 'pending_incoming' (they requested)
//   - both edges exist                      → 'friends'
//
// Sending a request creates my edge; accepting creates my edge back; declining
// deletes their edge; cancelling deletes mine; removing deletes both. DM room
// creation is gated on the 'friends' state (see getOrCreateDirectRoom in
// ./chat.ts).
//
// Consumed the same ways as chat.ts:
//   1. Next.js API routes via `@conference/db` (transpilePackages)
//   2. Node test scripts importing this file directly
//
// All DB-touching functions take a PrismaClient as their first argument and
// return result objects ({ ok: true, ... } | { ok: false, error }) so the
// routes can map failures to 4xx responses without try/catch plumbing.

type AnyPrismaClient = import('@prisma/client').PrismaClient

export type FriendStatus = 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends'

export type FriendAction = 'request' | 'cancel' | 'accept' | 'decline' | 'remove'

function deriveStatus(outgoing: boolean, incoming: boolean): FriendStatus {
  if (outgoing && incoming) return 'friends'
  if (outgoing) return 'pending_outgoing'
  if (incoming) return 'pending_incoming'
  return 'none'
}

/**
 * Pure derivation of per-user friend statuses from the two directional edge
 * lists. The single source of the mutual-edge rules — callers that already
 * hold the edge rows (e.g. /api/data/people, which fetches them with user
 * projections) use this instead of re-implementing the classification.
 * Users with no edge in either direction ('none') are absent from the map.
 */
export function deriveFriendStatusMap(
  outgoingIds: Iterable<string>,
  incomingIds: Iterable<string>
): Record<string, FriendStatus> {
  const incoming = new Set(incomingIds)
  const statuses: Record<string, FriendStatus> = {}
  for (const id of outgoingIds) {
    statuses[id] = deriveStatus(true, incoming.has(id))
  }
  for (const id of incoming) {
    if (!(id in statuses)) statuses[id] = deriveStatus(false, true)
  }
  return statuses
}

/**
 * The friend status between `userId` and `targetUserId` from `userId`'s point
 * of view, derived from the two directional Follow edges.
 */
export async function getFriendStatus(
  prismaClient: AnyPrismaClient,
  userId: string,
  targetUserId: string
): Promise<FriendStatus> {
  const [outgoing, incoming] = await Promise.all([
    prismaClient.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: targetUserId } },
      select: { id: true },
    }),
    prismaClient.follow.findUnique({
      where: { followerId_followingId: { followerId: targetUserId, followingId: userId } },
      select: { id: true },
    }),
  ])
  return deriveStatus(!!outgoing, !!incoming)
}

/**
 * Friend statuses between `userId` and every user they share at least one
 * Follow edge with, keyed by the other user's id. Users with no edge in
 * either direction ('none') are simply absent from the map.
 */
export async function getFriendStatuses(
  prismaClient: AnyPrismaClient,
  userId: string
): Promise<Record<string, FriendStatus>> {
  const [outgoingEdges, incomingEdges] = await Promise.all([
    prismaClient.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
    prismaClient.follow.findMany({
      where: { followingId: userId },
      select: { followerId: true },
    }),
  ])

  return deriveFriendStatusMap(
    outgoingEdges.map((e) => e.followingId),
    incomingEdges.map((e) => e.followerId)
  )
}

/**
 * True when both directional edges exist — i.e. the two users are friends.
 */
export async function areFriends(
  prismaClient: AnyPrismaClient,
  a: string,
  b: string
): Promise<boolean> {
  return (await getFriendStatus(prismaClient, a, b)) === 'friends'
}

/**
 * Ids of all users who share mutual Follow edges with `userId`.
 */
export async function listFriendIds(
  prismaClient: AnyPrismaClient,
  userId: string
): Promise<string[]> {
  const statuses = await getFriendStatuses(prismaClient, userId)
  return Object.keys(statuses).filter((id) => statuses[id] === 'friends')
}

/**
 * Applies a friend action on behalf of `userId` toward `targetUserId` and
 * returns the freshly derived resulting status. When `action` is omitted it
 * is inferred from the current status: none→request, pending_outgoing→cancel,
 * pending_incoming→accept; 'friends' is a no-op (unfriending must be an
 * explicit 'remove'). All actions are idempotent.
 */
export async function applyFriendAction(
  prismaClient: AnyPrismaClient,
  userId: string,
  targetUserId: string,
  action?: FriendAction
): Promise<{ ok: true; status: FriendStatus } | { ok: false; error: string }> {
  if (userId === targetUserId) {
    return { ok: false as const, error: 'Cannot friend yourself' }
  }

  // Target-existence check and current status are independent — one hop
  // instead of two (Turso-over-HTTP makes every round trip count).
  const [target, status] = await Promise.all([
    prismaClient.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    }),
    getFriendStatus(prismaClient, userId, targetUserId),
  ])
  if (!target) return { ok: false as const, error: 'User not found' }

  let effective = action
  if (!effective) {
    if (status === 'none') effective = 'request'
    else if (status === 'pending_outgoing') effective = 'cancel'
    else if (status === 'pending_incoming') effective = 'accept'
    // 'friends' with no explicit action is a no-op — unfriending must be an
    // explicit 'remove' so a stale button can't silently break a friendship.
    else return { ok: true as const, status: 'friends' as const }
  }

  const myEdgeKey = { followerId: userId, followingId: targetUserId }
  const theirEdgeKey = { followerId: targetUserId, followingId: userId }

  // Every action sets one (or both) edges to a known value, so the final
  // status is derivable from the pre-mutation booleans without re-reading —
  // saves two queries per action (see the round-trip note above).
  let outgoing = status === 'pending_outgoing' || status === 'friends'
  let incoming = status === 'pending_incoming' || status === 'friends'

  switch (effective) {
    case 'request':
    case 'accept':
      // Create my edge (me→them) if missing. 'request' against an existing
      // incoming edge naturally lands on 'friends' — that IS accepting.
      await prismaClient.follow.upsert({
        where: { followerId_followingId: myEdgeKey },
        create: myEdgeKey,
        update: {},
      })
      outgoing = true
      break
    case 'cancel':
      if (status === 'friends') {
        return { ok: false as const, error: 'Already friends — use remove' }
      }
      // Idempotent: nothing to cancel is a success.
      await prismaClient.follow.deleteMany({ where: myEdgeKey })
      outgoing = false
      break
    case 'decline':
      if (status === 'friends') {
        return { ok: false as const, error: 'Already friends — use remove' }
      }
      // Deletes THEIR edge (them→me). Idempotent when no incoming edge.
      await prismaClient.follow.deleteMany({ where: theirEdgeKey })
      incoming = false
      break
    case 'remove':
      await prismaClient.follow.deleteMany({
        where: { OR: [myEdgeKey, theirEdgeKey] },
      })
      outgoing = false
      incoming = false
      break
    default:
      return { ok: false as const, error: 'Invalid action' }
  }

  return { ok: true as const, status: deriveStatus(outgoing, incoming) }
}
