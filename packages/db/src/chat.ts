// Chat — shared logic for the attendee home feed (general room, including its
// social layer: image posts, likes, comments) and direct messages. Consumed
// the same ways as scheduled-messages.ts:
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
// `role` is safe (it is not a credential) and lets the attendee feed tell an
// admin global broadcast apart from an ordinary post — see
// packages/db/src/broadcast.ts.
export const CHAT_SENDER_SELECT = {
  id: true,
  name: true,
  image: true,
  company: true,
  jobTitle: true,
  role: true,
} as const

// Cap on the data-URI length of a feed image (~1.5MB of binary once the
// base64 overhead is accounted for). Messages store images inline as base64
// data URIs, matching the repo-wide base64-images-in-DB decision (ADR 0004).
export const MAX_FEED_IMAGE_CHARS = 2_000_000

const FEED_IMAGE_DATA_URI = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/

export type ChatContentValidation =
  | { ok: true; content: string }
  | { ok: false; error: string }

export type FeedImageValidation =
  | { ok: true; imageUrl: string | null }
  | { ok: false; error: string }

/**
 * Validates an optional feed-post image. Pure — safe to import from node test
 * scripts without pulling in the Prisma runtime. Absent images are fine
 * (posts don't require one); present images must be a base64 data URI of a
 * web image type and fit under MAX_FEED_IMAGE_CHARS.
 */
export function validateFeedImage(imageUrl: unknown): FeedImageValidation {
  if (imageUrl === null || imageUrl === undefined) {
    return { ok: true, imageUrl: null }
  }
  if (typeof imageUrl !== 'string' || !FEED_IMAGE_DATA_URI.test(imageUrl)) {
    return { ok: false, error: 'Invalid image' }
  }
  if (imageUrl.length > MAX_FEED_IMAGE_CHARS) {
    return { ok: false, error: 'Image too large' }
  }
  return { ok: true, imageUrl }
}

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
 *
 * Each message is enriched with the social fields the feed UI renders:
 * `likeCount`, `commentCount`, and `likedByMe` (always false when no
 * `viewerId` is provided).
 */
export async function listGlobalFeed(
  prismaClient: AnyPrismaClient,
  limit = 100,
  viewerId?: string
) {
  await ensureGeneralRoom(prismaClient)
  // Cast: the likes/comments relations only exist in the generated Prisma
  // client after the orchestrator re-runs `prisma db push` + generate.
  const messages: any[] = await prismaClient.message.findMany({
    where: { roomId: GENERAL_ROOM_ID },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      sender: { select: CHAT_SENDER_SELECT },
      _count: { select: { likes: true, comments: true } },
    },
  } as any)

  let likedIds = new Set<string>()
  if (viewerId && messages.length > 0) {
    // Cast: messageLike delegate is absent until the client is regenerated.
    const likes = await (prismaClient as any).messageLike.findMany({
      where: { userId: viewerId, messageId: { in: messages.map((m) => m.id) } },
      select: { messageId: true },
    })
    likedIds = new Set<string>(likes.map((l: any) => l.messageId))
  }

  messages.reverse()
  return messages.map(({ _count, ...message }) => ({
    ...message,
    likeCount: _count.likes,
    commentCount: _count.comments,
    likedByMe: likedIds.has(message.id),
  }))
}

/**
 * Posts a message to the general room, ensuring the room exists and the
 * sender is a member first. An optional base64 data-URI image may accompany
 * the text; when a valid image is present the text may be empty (stored as
 * ''), but non-empty text is still trimmed and length-capped. Returns the
 * message in the same enriched shape as listGlobalFeed (a brand-new post has
 * no likes or comments yet).
 */
export async function postGlobalMessage(
  prismaClient: AnyPrismaClient,
  senderId: string,
  content: unknown,
  imageUrl?: unknown
) {
  const image = validateFeedImage(imageUrl)
  if (!image.ok) return { ok: false as const, error: image.error }

  let finalContent = ''
  const isEmptyContent =
    content === null || content === undefined || (typeof content === 'string' && !content.trim())
  if (!image.imageUrl || !isEmptyContent) {
    const validation = validateChatContent(content)
    if (!validation.ok) return { ok: false as const, error: validation.error }
    finalContent = validation.content
  }

  await ensureGeneralRoom(prismaClient)
  await prismaClient.chatMember.upsert({
    where: { roomId_userId: { roomId: GENERAL_ROOM_ID, userId: senderId } },
    create: { roomId: GENERAL_ROOM_ID, userId: senderId },
    update: {},
  })

  // Cast: Message.imageUrl only exists in the regenerated Prisma client.
  const message = await prismaClient.message.create({
    data: {
      roomId: GENERAL_ROOM_ID,
      senderId,
      content: finalContent,
      imageUrl: image.imageUrl,
    },
    include: { sender: { select: CHAT_SENDER_SELECT } },
  } as any)
  return {
    ok: true as const,
    message: { ...message, likeCount: 0, commentCount: 0, likedByMe: false },
  }
}

/**
 * Loads a message and confirms it belongs to the general room. Likes and
 * comments are feed-only features — DM-room messages must behave as if they
 * don't exist ('Not found'), never 'Forbidden', so the response doesn't
 * confirm that a private message id is real.
 */
async function findGeneralRoomMessage(prismaClient: AnyPrismaClient, messageId: string) {
  const message = await prismaClient.message.findUnique({
    where: { id: messageId },
    select: { id: true, roomId: true },
  })
  if (!message || message.roomId !== GENERAL_ROOM_ID) return null
  return message
}

/**
 * Toggles the user's like on a general-room feed message. Returns the new
 * liked state plus the fresh total so the UI can reconcile its optimistic
 * count. A concurrent-create race on the unique (messageId, userId) key is
 * resolved as "already liked" and toggled off — it never throws.
 */
export async function toggleMessageLike(
  prismaClient: AnyPrismaClient,
  messageId: string,
  userId: string
) {
  const message = await findGeneralRoomMessage(prismaClient, messageId)
  if (!message) return { ok: false as const, error: 'Not found' }

  // Cast: messageLike delegate is absent until the client is regenerated.
  const messageLike = (prismaClient as any).messageLike
  const existing = await messageLike.findUnique({
    where: { messageId_userId: { messageId, userId } },
  })
  let liked: boolean
  if (existing) {
    await messageLike.delete({ where: { messageId_userId: { messageId, userId } } })
    liked = false
  } else {
    try {
      await messageLike.create({ data: { messageId, userId } })
      liked = true
    } catch {
      // Unique-constraint race: a concurrent request created the like row
      // between findUnique and create, so this toggle lands on "unlike".
      await messageLike
        .delete({ where: { messageId_userId: { messageId, userId } } })
        .catch(() => {})
      liked = false
    }
  }

  const likeCount = await messageLike.count({ where: { messageId } })
  return { ok: true as const, liked, likeCount }
}

/**
 * Comments on a general-room feed message, ascending (chronological), each
 * carrying the same safe user projection as message senders.
 */
export async function listMessageComments(prismaClient: AnyPrismaClient, messageId: string) {
  const message = await findGeneralRoomMessage(prismaClient, messageId)
  if (!message) return { ok: false as const, error: 'Not found' }

  // Cast: messageComment delegate is absent until the client is regenerated.
  const comments = await (prismaClient as any).messageComment.findMany({
    where: { messageId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      messageId: true,
      content: true,
      createdAt: true,
      user: { select: CHAT_SENDER_SELECT },
    },
  })
  return { ok: true as const, comments }
}

/**
 * Adds a comment to a general-room feed message. Content follows the same
 * validation as chat messages (trimmed, non-empty, length-capped).
 */
export async function postMessageComment(
  prismaClient: AnyPrismaClient,
  messageId: string,
  userId: string,
  content: unknown
) {
  const validation = validateChatContent(content)
  if (!validation.ok) return { ok: false as const, error: validation.error }

  const message = await findGeneralRoomMessage(prismaClient, messageId)
  if (!message) return { ok: false as const, error: 'Not found' }

  // Cast: messageComment delegate is absent until the client is regenerated.
  const comment = await (prismaClient as any).messageComment.create({
    data: { messageId, userId, content: validation.content },
    select: {
      id: true,
      messageId: true,
      content: true,
      createdAt: true,
      user: { select: CHAT_SENDER_SELECT },
    },
  })
  return { ok: true as const, comment }
}

/**
 * Returns the existing DIRECT room shared by these two users, creating it
 * (with both memberships) when none exists. DIRECT rooms only ever have two
 * members, so "contains both users" identifies the pair's room.
 *
 * Creating a NEW room is gated on mutual friendship (see ./friends.ts) and
 * fails with code 'NOT_FRIENDS' otherwise. Existing rooms are returned
 * regardless of current friendship, so past conversations keep working after
 * an unfriend.
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

  // Mutual-Follow friendship check, inlined rather than imported from
  // ./friends (a relative import would break node test scripts that
  // type-strip this file directly — same reason GENERAL_ROOM_ID is mirrored
  // above). Semantics must match areFriends in ./friends.ts.
  const edges = await prismaClient.follow.count({
    where: {
      OR: [
        { followerId: userId, followingId: targetUserId },
        { followerId: targetUserId, followingId: userId },
      ],
    },
  })
  if (edges < 2) {
    return {
      ok: false as const,
      error: 'You must be friends to message',
      code: 'NOT_FRIENDS' as const,
    }
  }

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
 *
 * Deliberately membership-gated only, NOT friendship-gated: the friendship
 * gate applies to creating a new DIRECT room (above), while conversations
 * that already exist keep working after an unfriend. test:friends asserts
 * this grandfathering.
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
