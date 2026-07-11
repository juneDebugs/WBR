'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { FriendStatus } from '@conference/db'
import { friendAriaLabel } from '@/lib/friend-labels'

// Profile-page action tile (iOS Contacts style) for the friend relationship.
// Tapping auto-advances the friendship: none → request, pending_outgoing →
// cancel, pending_incoming → accept. 'friends' is a terminal, inert state —
// unfriending is only offered from the People list behind a confirm.
export function FriendActionButton({ userId, name, initialStatus }: {
  userId: string
  name: string | null
  initialStatus: FriendStatus
}) {
  const router = useRouter()
  const [status, setStatus] = useState<FriendStatus>(initialStatus)
  const [pending, setPending] = useState(false)

  const displayName = name ?? 'this attendee'
  const isFriends = status === 'friends'
  const tinted = status === 'none' || status === 'pending_incoming'

  async function act() {
    if (pending || isFriends) return
    setPending(true)
    try {
      const res = await fetch(`/api/friend/${userId}`, { method: 'POST' })
      if (res.ok) {
        const data: { status: FriendStatus } = await res.json()
        setStatus(data.status)
        // Re-render the server component so the Message tile appears once friends.
        router.refresh()
      }
    } catch {
      // network error — leave the current state untouched
    }
    setPending(false)
  }

  const caption =
    status === 'none' ? 'Add Friend'
    : status === 'pending_outgoing' ? 'Pending'
    : status === 'pending_incoming' ? 'Accept'
    : 'Friends'

  const ariaLabel = friendAriaLabel(status, displayName)

  return (
    <button
      type="button"
      onClick={act}
      disabled={pending || isFriends}
      aria-disabled={isFriends || undefined}
      aria-label={ariaLabel}
      className={`flex flex-col items-center gap-1 flex-1 max-w-[80px] transition-opacity ${
        isFriends ? '' : 'active:opacity-50 disabled:opacity-50'
      }`}
    >
      <div className={`w-11 h-11 rounded-full flex items-center justify-center ${
        tinted ? 'bg-primary/10' : 'bg-ink/5'
      }`}>
        {isFriends ? (
          // Person with checkmark
          <svg className="w-[20px] h-[20px] text-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15 19v-1a6 6 0 00-12 0v1h12zM13 7a4 4 0 11-8 0 4 4 0 018 0zM16 11l2 2 4-4" />
          </svg>
        ) : (
          // Person with plus
          <svg className={`w-[20px] h-[20px] ${tinted ? 'text-primary' : 'text-ink'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M15 19v-1a6 6 0 00-12 0v1h12zM13 7a4 4 0 11-8 0 4 4 0 018 0zM19 8v6M22 11h-6" />
          </svg>
        )}
      </div>
      <span className={`text-[10px] font-medium ${tinted ? 'text-primary' : 'text-ink-3'}`}>
        {caption}
      </span>
    </button>
  )
}
