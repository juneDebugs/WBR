import { prisma, checkMessagingPermission, type MessagingDecision } from '@conference/db'

// Admin-controlled gating for who may initiate contact (friend request / new
// DM). The rules live in the admin Chat → Settings tab and are evaluated by
// checkMessagingPermission in @conference/db. All of these fail OPEN on error so
// a transient DB blip never blocks legitimate messaging.

export type Actor = { id: string; role?: string | null; sponsorId?: string | null }

// `session` is loosely typed because the attendee NextAuth session augmentation
// doesn't necessarily surface sponsorId; the JWT/session callbacks do populate
// role and sponsorId on session.user at runtime.
export function actorFromSession(session: any): Actor | null {
  const u = session?.user
  if (!u?.id) return null
  return { id: u.id as string, role: (u.role ?? null) as string | null, sponsorId: (u.sponsorId ?? null) as string | null }
}

// Gate a friend-request initiation (the 'request' action). Accept/decline/cancel
// /remove are teardown or responses and are never gated.
export function guardFriendRequest(actor: Actor, targetUserId: string): Promise<MessagingDecision> {
  return checkMessagingPermission(prisma, actor, targetUserId)
}

// Gate creation of a NEW direct room. Existing conversations are grandfathered
// (mirrors the NOT_FRIENDS friendship gate): once a thread exists, the admin
// controls no longer interrupt it.
export async function guardNewDirectRoom(actor: Actor, targetUserId: string): Promise<MessagingDecision> {
  const existing = await prisma.chatRoom.findFirst({
    where: {
      type: 'DIRECT',
      AND: [{ members: { some: { userId: actor.id } } }, { members: { some: { userId: targetUserId } } }],
    },
    select: { id: true },
  })
  if (existing) return { allowed: true }
  return checkMessagingPermission(prisma, actor, targetUserId)
}
