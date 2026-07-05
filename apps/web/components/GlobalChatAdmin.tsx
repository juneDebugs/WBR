'use client'

import { useState, useRef } from 'react'
import { format } from 'date-fns'

interface RecentMessage {
  id: string
  content: string
  createdAt: string
  sender: { name: string | null; email: string | null }
}

interface Props {
  memberCount: number
  totalUsers: number
  messageCount: number
  recentMessages: RecentMessage[]
}

function SwipeableMessage({
  msg,
  onDelete,
}: {
  msg: RecentMessage
  onDelete: (id: string) => void
}) {
  const startX = useRef<number | null>(null)
  const [offset, setOffset] = useState(0)
  const [deleting, setDeleting] = useState(false)
  const THRESHOLD = 80

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    if (dx < 0) setOffset(Math.max(dx, -THRESHOLD - 20))
  }

  function onPointerUp() {
    if (startX.current === null) return
    startX.current = null
    if (offset <= -THRESHOLD) {
      setOffset(-THRESHOLD)
    } else {
      setOffset(0)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    await fetch(`/api/chat/messages?id=${msg.id}`, { method: 'DELETE' })
    onDelete(msg.id)
  }

  return (
    <div className="relative overflow-hidden">
      {/* Red delete bg */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-end px-4 bg-danger w-20">
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </div>

      {/* Message row */}
      <div
        className="relative px-5 py-2.5 flex items-start gap-3 bg-white touch-pan-y select-none"
        style={{
          transform: `translateX(${offset}px)`,
          transition: startX.current === null ? 'transform 0.25s ease' : 'none',
          cursor: offset <= -THRESHOLD ? 'pointer' : 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onClick={offset <= -THRESHOLD ? confirmDelete : undefined}
      >
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-brand/10">
          <span className="text-brand text-xs font-semibold">
            {(msg.sender.name ?? msg.sender.email ?? '?')[0].toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-semibold text-ink">{msg.sender.name ?? msg.sender.email}</span>
            <span className="text-xs text-ink-2">{format(new Date(msg.createdAt), 'MMM d, h:mm a')}</span>
          </div>
          <p className={`text-sm mt-0.5 ${deleting ? 'text-ink-3' : 'text-ink-2'}`}>{msg.content}</p>
        </div>
        {offset <= -THRESHOLD && (
          <span className="text-xs text-danger font-semibold self-center flex-shrink-0">Tap to delete</span>
        )}
      </div>
    </div>
  )
}

export function GlobalChatAdmin({ memberCount, totalUsers, messageCount, recentMessages }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ total: number; added: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [localMessages, setLocalMessages] = useState<RecentMessage[]>(recentMessages)
  const [clearing, setClearing] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)


  async function syncMembers() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/chat/sync-members', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(data)
      }
    } finally {
      setSyncing(false)
    }
  }

  async function sendBroadcast() {
    if (!draft.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/chat/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setDraft('')
        setSent(true)
        setLocalMessages(prev => [
          { id: data.message.id, content: data.message.content, createdAt: data.message.createdAt, sender: data.message.sender },
          ...prev,
        ].slice(0, 20))
        setTimeout(() => setSent(false), 3000)
      }
    } finally {
      setSending(false)
    }
  }

  async function clearAll() {
    setClearing(true)
    await fetch('/api/chat/messages', { method: 'DELETE' })
    setLocalMessages([])
    setConfirmClear(false)
    setClearing(false)
  }

  function deleteOne(id: string) {
    setLocalMessages(prev => prev.filter(m => m.id !== id))
  }

  const synced = memberCount >= totalUsers

  return (
    <div className="bg-white border border-hairline rounded-xl overflow-hidden mb-6">
      {/* Header */}
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between gap-3 bg-brand-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-gradient">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <div>
            <h2 className="font-semibold text-ink">Global Broadcast</h2>
            <p className="text-xs text-ink-2">
              {memberCount.toLocaleString()} of {totalUsers.toLocaleString()} users · {messageCount} messages
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {syncResult && (
            <span className="text-xs text-success-ink font-medium">
              ✓ {syncResult.added} new members added
            </span>
          )}
          {synced ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-success-ink bg-success-soft px-3 py-1.5 rounded-lg border border-success/30">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
              All users synced
            </span>
          ) : (
            <button
              onClick={syncMembers}
              disabled={syncing}
              className="btn-primary btn-sm"
            >
              {syncing ? (
                <>
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                  </svg>
                  Syncing…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync All {totalUsers.toLocaleString()} Users
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Compose box */}
      <div className="px-5 py-4 border-b border-hairline bg-fill">
        <p className="text-xs font-semibold text-ink-2 uppercase tracking-widest mb-2">Send to all users</p>
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBroadcast() } }}
            placeholder="Type a broadcast message… (Enter to send)"
            rows={2}
            className="flex-1 text-sm text-ink placeholder-ink-3 bg-white border border-hairline rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-300 resize-none"
          />
          <button
            onClick={sendBroadcast}
            disabled={!draft.trim() || sending}
            className="btn-primary btn-sm flex-shrink-0 self-end"
          >
            {sending ? (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
            ) : sent ? '✓ Sent' : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Messages list */}
      {localMessages.length > 0 ? (
        <>
          <div className="px-5 py-2 flex items-center justify-between border-b border-hairline bg-fill">
            <p className="text-xs text-ink-2 italic">← Swipe a message left to delete it</p>
            {confirmClear ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-2">Clear all?</span>
                <button
                  onClick={clearAll}
                  disabled={clearing}
                  className="btn-danger btn-sm"
                >
                  {clearing ? 'Clearing…' : 'Yes, clear'}
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-xs text-ink-2 hover:text-ink px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="text-xs text-danger hover:text-danger-ink font-medium flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear all
              </button>
            )}
          </div>
          <div className="divide-y divide-hairline">
            {localMessages.map(msg => (
              <SwipeableMessage key={msg.id} msg={msg} onDelete={deleteOne} />
            ))}
          </div>
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-ink-2 italic">No messages yet — send the first broadcast above</p>
      )}
    </div>
  )
}
