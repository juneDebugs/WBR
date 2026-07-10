// Chat — shared logic for the attendee home feed (general room) and direct
// messages. Consumed the same ways as scheduled-messages.ts:
//   1. Next.js API routes via `@conference/db` (transpilePackages)
//   2. Node test scripts importing this file's pure helpers directly
//
// All DB-touching functions take a PrismaClient as their first argument and
// return result objects ({ ok: true, ... } | { ok: false, error }) so the
// routes can map failures to 4xx responses without try/catch plumbing.

type AnyPrismaClient = import('@prisma/client').PrismaClient

// Mirrors GENERAL_ROOM_ID in ./scheduled-messages.ts (not imported: a relative
// import would break node test scripts that type-strip this file directly, and
// re-exporting it here would collide with index.ts's `export *`). The
// test:feed suite asserts the two stay in sync behaviorally.
const GENERAL_ROOM_ID = 'room-general'

export const MAX_CHAT_CONTENT_LENGTH = 5000

// Explicit sender projection used everywhere a message is returned to a
// client. Never widen this to `sender: true` — the User row carries
// credentials (password, pushToken) that must not leak into chat payloads.
export const CHAT_SENDER_SELECT = {
  id: true,
  name: true,
  image: true,
  company: true,
  jobTitle: true,
} as const

export type ChatContentValidation =
  | { ok: true; content: string }
  | { ok: false; error: string }

/**
 * Validates a chat message body. Pure — safe to import from node test
 * scripts without pulling in the Prisma runtime.
 */
export function validateChatContent(content: unknown): ChatContentValidation {
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, error: 'Empty message' }
  }
  const trimmed = content.trim()
  if (trimmed.length > MAX_CHAT_CONTENT_LENGTH) {
    return { ok: false, error: 'Message too long' }
  }
  return { ok: true, content: trimmed }
}

/**
 * Makes sure the shared general room exists. Idempotent and race-safe
 * (upsert on the fixed id).
 */
export async function ensureGeneralRoom(prismaClient: AnyPrismaClient) {
  await prismaClient.chatRoom.upsert({
    where: { id: GENERAL_ROOM_ID },
    create: { id: GENERAL_ROOM_ID, name: 'General', type: 'CHANNEL' },
    update: {},
  })
}

/**
 * Latest `limit` messages of the general room in ascending (chronological)
 * order — fetch newest-first, then reverse, so a busy room shows the most
 * recent conversation instead of the oldest 100 rows.
 */
export async function listGlobalFeed(prismaClient: AnyPrismaClient, limit = 100) {
  await ensureGeneralRoom(prismaClient)
  const messages = await prismaClient.message.findMany({
    where: { roomId: GENERAL_ROOM_ID },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { sender: { select: CHAT_SENDER_SELECT } },
  })
  return messages.reverse()
}

/**
 * Posts a message to the general room, ensuring the room exists and the
 * sender is a member first.
 */
export async function postGlobalMessage(
  prismaClient: AnyPrismaClient,
  senderId: string,
  content: unknown
) {
  const validation = validateChatContent(content)
  if (!validation.ok) return { ok: false as const, error: validation.error }

  await ensureGeneralRoom(prismaClient)
  await prismaClient.chatMember.upsert({
    where: { roomId_userId: { roomId: GENERAL_ROOM_ID, userId: senderId } },
    create: { roomId: GENERAL_ROOM_ID, userId: senderId },
    update: {},
  })

  const message = await prismaClient.message.create({
    data: { roomId: GENERAL_ROOM_ID, senderId, content: validation.content },
    include: { sender: { select: CHAT_SENDER_SELECT } },
  })
  return { ok: true as const, message }
}

/**
 * Returns the existing DIRECT room shared by these two users, creating it
 * (with both memberships) when none exists. DIRECT rooms only ever have two
 * members, so "contains both users" identifies the pair's room.
 */
export async function getOrCreateDirectRoom(
  prismaClient: AnyPrismaClient,
  userId: string,
  targetUserId: string
) {
  if (userId === targetUserId) {
    return { ok: false as const, error: 'Cannot message yourself' }
  }

  const target = await prismaClient.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  })
  if (!target) return { ok: false as const, error: 'User not found' }

  const existing = await prismaClient.chatRoom.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { members: { some: { userId } } },
        { members: { some: { userId: targetUserId } } },
      ],
    },
  })
  if (existing) return { ok: true as const, room: existing }

  const room = await prismaClient.chatRoom.create({
    data: {
      type: 'DIRECT',
      members: {
        create: [{ userId }, { userId: targetUserId }],
      },
    },
  })
  return { ok: true as const, room }
}

/**
 * Latest `limit` messages of a room in ascending order, gated on membership,
 * marking the room read for the caller as a side effect.
 */
export async function listRoomMessagesForUser(
  prismaClient: AnyPrismaClient,
  roomId: string,
  userId: string,
  limit = 100
) {
  const member = await prismaClient.chatMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  })
  if (!member) return { ok: false as const, error: 'Forbidden' }

  const messages = await prismaClient.message.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { sender: { select: CHAT_SENDER_SELECT } },
  })
  messages.reverse()

  await prismaClient.chatMember.update({
    where: { roomId_userId: { roomId, userId } },
    data: { lastReadAt: new Date() },
  })

  return { ok: true as const, messages }
}

/**
 * Posts a message to a room the sender is a member of.
 */
export async function postRoomMessage(
  prismaClient: AnyPrismaClient,
  roomId: string,
  senderId: string,
  content: unknown
) {
  const member = await prismaClient.chatMember.findUnique({
    where: { roomId_userId: { roomId, userId: senderId } },
  })
  if (!member) return { ok: false as const, error: 'Forbidden' }

  const validation = validateChatContent(content)
  if (!validation.ok) return { ok: false as const, error: validation.error }

  const message = await prismaClient.message.create({
    data: { roomId, senderId, content: validation.content },
    include: { sender: { select: CHAT_SENDER_SELECT } },
  })
  return { ok: true as const, message }
}
