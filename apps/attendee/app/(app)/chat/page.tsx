export const dynamic = 'force-dynamic'
import { prisma } from '@conference/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

export default async function ChatPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const rooms = await prisma.chatRoom.findMany({
    where: { members: { some: { userId } } },
    include: {
      members: { include: { user: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { sender: true },
      },
      _count: { select: { messages: true } },
    },
  })

  // Sort: channels first, then DMs by latest message
  const sorted = rooms.sort((a, b) => {
    if (a.type === 'CHANNEL' && b.type !== 'CHANNEL') return -1
    if (b.type === 'CHANNEL' && a.type !== 'CHANNEL') return 1
    const aTime = a.messages[0]?.createdAt.getTime() ?? 0
    const bTime = b.messages[0]?.createdAt.getTime() ?? 0
    return bTime - aTime
  })

  return (
    <div className="min-h-screen bg-white">
      {/* Instagram-style header */}
      <div className="px-4 pt-12 pb-3 flex items-center justify-between border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        <Link href="/chat/new" className="w-8 h-8 flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </Link>
      </div>

      {/* Conversation list */}
      <div className="divide-y divide-gray-50 pb-24">
        {sorted.map(room => {
          const lastMsg = room.messages[0]
          const isChannel = room.type === 'CHANNEL'
          const otherMember = !isChannel
            ? room.members.find(m => m.userId !== userId)?.user
            : null
          const displayName = isChannel ? room.name : (otherMember?.name ?? 'Unknown')
          const avatar = otherMember?.image ?? null

          return (
            <Link key={room.id} href={`/chat/${room.id}`}
              className="flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  isChannel ? 'bg-gradient-to-br from-primary to-purple-600' : 'bg-gray-200'
                }`}>
                  {isChannel ? (
                    <span className="text-white font-bold text-xl">#</span>
                  ) : avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar} alt="" className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <span className="text-gray-600 font-bold text-xl">{(displayName ?? '?')[0]}</span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900 text-sm">{displayName}</p>
                  {lastMsg && (
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {formatDistanceToNow(lastMsg.createdAt, { addSuffix: false })}
                    </span>
                  )}
                </div>
                {lastMsg ? (
                  <p className="text-sm text-gray-500 truncate mt-0.5">
                    {lastMsg.sender.id === userId ? 'You: ' : ''}
                    {lastMsg.content}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic mt-0.5">No messages yet</p>
                )}
              </div>
            </Link>
          )
        })}

        {sorted.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="font-semibold text-gray-900">Your messages</p>
            <p className="text-sm text-gray-500 mt-1">Send a message to get started.</p>
            <Link href="/chat/new" className="inline-block mt-4 bg-primary text-white text-sm font-semibold px-5 py-2.5 rounded-xl">
              Send message
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
