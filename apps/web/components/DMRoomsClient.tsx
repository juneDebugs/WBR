'use client'

import { useState } from 'react'
import { format } from 'date-fns'

interface Member {
  name: string | null
  email: string | null
  image: string | null
}

interface PreviewMessage {
  id: string
  content: string
  createdAt: string
  sender: { name: string | null; email: string | null }
}

interface Room {
  id: string
  members: Member[]
  messageCount: number
  lastMessage: PreviewMessage | null
}

interface FullMessage {
  id: string
  content: string
  createdAt: string
  sender: { id: string; name: string | null; email: string | null; image: string | null }
}

export function DMRoomsClient({ rooms }: { rooms: Room[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [history, setHistory] = useState<Record<string, FullMessage[]>>({})
  const [loading, setLoading] = useState<string | null>(null)

  async function toggle(roomId: string) {
    if (expanded === roomId) {
      setExpanded(null)
      return
    }
    setExpanded(roomId)
    if (history[roomId]) return
    setLoading(roomId)
    const res = await fetch(`/api/chat/rooms/${roomId}`)
    const msgs = await res.json()
    setHistory(prev => ({ ...prev, [roomId]: msgs }))
    setLoading(null)
  }

  if (rooms.length === 0) {
    return <p className="text-sm text-gray-400 italic py-2">No direct messages yet.</p>
  }

  return (
    <div className="space-y-3">
      {rooms.map(room => {
        const [a, b] = room.members
        const isOpen = expanded === room.id
        const msgs = history[room.id] ?? []

        return (
          <div key={room.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {/* Header — clickable */}
            <button
              onClick={() => toggle(room.id)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
            >
              {/* Avatars */}
              <div className="relative w-10 h-10 flex-shrink-0">
                <Avatar user={a} className="w-7 h-7 absolute top-0 left-0 ring-2 ring-white" />
                <Avatar user={b} className="w-7 h-7 absolute bottom-0 right-0 ring-2 ring-white" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">
                  {room.members.map(m => m.name ?? m.email ?? '?').join(' & ')}
                </p>
                {room.lastMessage ? (
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    <span className="font-medium text-gray-500">{room.lastMessage.sender.name?.split(' ')[0]}:</span>{' '}
                    {room.lastMessage.content}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 italic mt-0.5">No messages yet</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-gray-400">{room.messageCount} msg{room.messageCount !== 1 ? 's' : ''}</span>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expanded history */}
            {isOpen && (
              <div className="border-t border-gray-100">
                {loading === room.id ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : msgs.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-gray-400 italic">No messages yet.</p>
                ) : (
                  <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                    {msgs.map(msg => (
                      <div key={msg.id} className="px-5 py-2.5 flex items-start gap-3">
                        <Avatar user={msg.sender} className="w-7 h-7 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-semibold text-gray-700">
                              {msg.sender.name ?? msg.sender.email}
                            </span>
                            <span className="text-xs text-gray-400">
                              {format(new Date(msg.createdAt), 'MMM d, h:mm a')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Avatar({ user, className }: { user: { name: string | null; email: string | null; image?: string | null } | undefined; className?: string }) {
  if (!user) return null
  return user?.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.image} alt="" loading="lazy" className={`rounded-full object-cover ${className}`} />
  ) : (
    <div className={`rounded-full bg-primary/10 flex items-center justify-center ${className}`}>
      <span className="text-primary font-semibold text-[10px]">
        {(user.name ?? user.email ?? '?')[0].toUpperCase()}
      </span>
    </div>
  )
}
