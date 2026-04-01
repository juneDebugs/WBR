import { prisma } from '@conference/db'
import { AdminHeader } from '@/components/AdminHeader'
import { format } from 'date-fns'

export default async function ChatAdminPage() {
  const rooms = await prisma.chatRoom.findMany({
    include: {
      members: { include: { user: true } },
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { sender: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return (
    <>
      <AdminHeader title="Chat" />
      <main className="flex-1 p-6">
        <p className="text-sm text-gray-500 mb-6">{rooms.length} rooms total</p>

        <div className="space-y-4">
          {rooms.map((room) => {
            const isChannel = room.type === 'CHANNEL'
            const memberNames = room.members.map(m => m.user.name ?? m.user.email ?? '?').join(', ')

            return (
              <div key={room.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {isChannel ? `# ${room.name}` : `DM: ${memberNames}`}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {room._count.messages} messages · {room.members.length} members
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    isChannel ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {isChannel ? 'Channel' : 'Direct'}
                  </span>
                </div>

                {room.messages.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {room.messages.reverse().map((msg) => (
                      <div key={msg.id} className="px-5 py-2.5 flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-primary text-xs font-semibold">
                            {(msg.sender.name ?? '?')[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-gray-700">{msg.sender.name}</span>
                            <span className="text-xs text-gray-400">{format(msg.createdAt, 'MMM d, h:mm a')}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {room.messages.length === 0 && (
                  <p className="px-5 py-3 text-sm text-gray-400 italic">No messages yet</p>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </>
  )
}
