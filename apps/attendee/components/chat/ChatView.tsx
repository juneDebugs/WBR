'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { format } from 'date-fns'

interface ChatMessage {
  id: string
  content: string
  createdAt: string
  sender: { id: string; name: string | null; image: string | null }
}

interface Props {
  roomId: string
  displayName: string
  initialMessages: ChatMessage[]
  currentUserId: string
  currentUserName: string
}

export function ChatView({ roomId, displayName, initialMessages, currentUserId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const latestIdRef = useRef(initialMessages[initialMessages.length - 1]?.id ?? '')
  const router = useRouter()

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  // Poll for new messages every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/chat/rooms/${roomId}/messages`)
        if (!res.ok) return
        const data: ChatMessage[] = await res.json()
        const latest = data[data.length - 1]?.id ?? ''
        if (latest !== latestIdRef.current) {
          latestIdRef.current = latest
          setMessages(data)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [roomId])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    setInput('')

    const tempMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      content,
      createdAt: new Date().toISOString(),
      sender: { id: currentUserId, name: 'You', image: null },
    }
    setMessages(prev => [...prev, tempMsg])

    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const saved: ChatMessage = await res.json()
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? saved : m))
        latestIdRef.current = saved.id
      }
    } catch {}
    setSending(false)
  }

  const grouped = useMemo(() => messages.map((msg, i) => ({
    ...msg,
    showHeader: i === 0 || messages[i - 1].sender.id !== msg.sender.id,
  })), [messages])

  return (
    <div className="flex flex-col bg-gray-50" style={{ height: '100dvh' }}>
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 flex items-center gap-3 flex-shrink-0"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}>
        <button onClick={() => router.back()} className="text-primary p-1 -ml-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-semibold text-gray-900 text-base">{displayName}</h1>
      </div>

      {/* Messages — scrollable middle */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {grouped.length === 0 && (
          <p className="text-center text-gray-400 text-sm mt-16">No messages yet. Say hello!</p>
        )}
        {grouped.map((msg) => {
          const isMe = msg.sender.id === currentUserId
          return (
            <div key={msg.id} className={`${msg.showHeader ? 'mt-4' : 'mt-0.5'}`}>
              {msg.showHeader && !isMe && (
                <div className="flex items-center gap-2 mb-1 ml-1">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {msg.sender.image ? (
                      <Image src={msg.sender.image} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <span className="text-primary text-xs font-bold">{(msg.sender.name ?? '?')[0]}</span>
                    )}
                  </div>
                  <span className="text-xs font-semibold text-gray-600">{msg.sender.name}</span>
                  <span className="text-xs text-gray-400">{format(new Date(msg.createdAt), 'h:mm a')}</span>
                </div>
              )}
              <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? 'bg-primary text-white rounded-br-sm'
                    : 'bg-white border border-gray-100 text-gray-900 rounded-bl-sm shadow-sm'
                } ${msg.id.startsWith('temp-') ? 'opacity-60' : ''}`}>
                  {msg.content}
                </div>
              </div>
              {isMe && msg.showHeader && (
                <p className="text-right text-[10px] text-gray-400 mt-0.5 mr-1">
                  {format(new Date(msg.createdAt), 'h:mm a')}
                </p>
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input — pinned to bottom, moves up with keyboard */}
      <div className="bg-white border-t border-gray-100 px-3 py-2 flex-shrink-0"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <form onSubmit={sendMessage} className="flex items-center gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Message…"
            autoComplete="off"
            className="flex-1 bg-gray-100 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-9 h-9 bg-primary rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 active:scale-95 transition-transform"
          >
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
