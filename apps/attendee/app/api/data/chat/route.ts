import { NextResponse } from 'next/server'
import { prisma } from '@conference/db'
import { getUserFromHeaders } from '@/lib/user'

// Response shape (breaking change vs. pre-Phase-15 — see PRD §6 Phase 15):
//   { userId: string, rooms: ChatRoomEntry[] }
//   ChatRoomEntry = {
//     id: string
//     name: string | null
//     type: 'CHANNEL' | 'DIRECT'
//     otherMember: { id, name, image } | null   // null for CHANNEL and self-chat DMs
//     lastMessage: { id, content, createdAt, sender: { id, name } } | null
//   }
// The pre-Phase-15 shape included a `members` array on every room; sole consumer
// is `apps/attendee/components/chat/ChatClient.tsx`. Verified by grep before
// changing the contract; re-verify if adding a second consumer.
export async function GET() {
  const user = await getUserFromHeaders()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = user.id

  // Fetch only the chat-list UI's needed fields. The chat-list renders a "#"
  // gradient icon on CHANNEL rooms (no member data needed) and exactly one
  // avatar+name on DIRECT rooms (the non-self member). Selecting the full
  // members array previously shipped ~4 MB of base64-encoded avatars on every
  // authenticated layout mount because the seed-data "General" CHANNEL
  // auto-enrolls every attendee.
  const rooms = await prisma.chatRoom.findMany({
    where: { members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      type: true,
      // Limit to one non-self member per room. For DIRECT rooms this is the
      // counterparty whose avatar+name we render; for CHANNEL rooms we drop
      // this in the mapping below. orderBy: joinedAt asc keeps the selection
      // deterministic if a DIRECT room somehow has more than two members
      // (schema enforces unique (roomId, userId) but not exactly-two cardinality
      // for DIRECT rooms — Phase 15 R1 finding).
      members: {
        where: { userId: { not: userId } },
        orderBy: { joinedAt: 'asc' },
        take: 1,
        select: { user: { select: { id: true, name: true, image: true } } },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, content: true, createdAt: true, sender: { select: { id: true, name: true } } },
      },
    },
  })

  // Sort: channels first, then DMs by latest message. Tie-break on room id
  // so rooms with identical last-message timestamps order deterministically
  // (Phase 15 R3 finding — top-level findMany has no orderBy, so equal-time
  // rooms would otherwise carry DB-row ordering through to the response).
  const sorted = rooms.sort((a, b) => {
    if (a.type === 'CHANNEL' && b.type !== 'CHANNEL') return -1
    if (b.type === 'CHANNEL' && a.type !== 'CHANNEL') return 1
    const aTime = a.messages[0]?.createdAt.getTime() ?? 0
    const bTime = b.messages[0]?.createdAt.getTime() ?? 0
    if (aTime !== bTime) return bTime - aTime
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  return NextResponse.json({
    userId,
    rooms: sorted.map(room => ({
      id: room.id,
      name: room.name,
      type: room.type,
      // DIRECT rooms: the counterparty (or null for a self-chat where the only
      // member is the current user). CHANNEL rooms always emit null — the UI
      // uses the room's "#" icon and never reads otherMember on channels.
      otherMember: room.type === 'DIRECT' ? (room.members[0]?.user ?? null) : null,
      lastMessage: room.messages[0]
        ? {
            id: room.messages[0].id,
            content: room.messages[0].content,
            createdAt: room.messages[0].createdAt.toISOString(),
            sender: room.messages[0].sender,
          }
        : null,
    })),
  })
}
