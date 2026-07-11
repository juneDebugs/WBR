'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'


interface User {
  id: string
  name: string | null
  image: string | null
  company: string | null
}

export function NewDmClient({ users }: { users: User[] }) {
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  const filtered = users.filter(u =>
    !search || (u.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.company ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function startDm(targetId: string) {
    setLoading(targetId)
    router.push(`/chat/dm/${targetId}`)
  }

  return (
    <div>
      <div className="px-4 py-3 border-b border-hairline">
        <div className="flex items-center gap-2 bg-fill rounded-xl px-3 py-2">
          <span className="text-sm font-medium text-ink-2">To:</span>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="text-center px-6 py-16">
          <div className="w-12 h-12 rounded-full bg-fill flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 19v-1a6 6 0 00-12 0v1h12zM13 7a4 4 0 11-8 0 4 4 0 018 0zM19 8v6M22 11h-6" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-ink">
            {users.length === 0 ? 'No friends to message yet' : 'No results found'}
          </p>
          {users.length === 0 && (
            <p className="text-xs text-ink-3 mt-1">
              Find people on the People tab and send a friend request — you can message once you&apos;re friends.
            </p>
          )}
        </div>
      )}
      <div className="divide-y divide-hairline">
        {filtered.map(user => (
          <button key={user.id} onClick={() => startDm(user.id)}
            disabled={loading === user.id}
            className="w-full flex items-center gap-3 px-4 py-3 active:bg-fill transition-colors text-left">
            <div className="w-12 h-12 rounded-full bg-fill flex items-center justify-center flex-shrink-0">
              {user.image ? (
                <img src={user.image} alt="" loading="lazy" className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <span className="text-ink-2 font-bold text-lg">{(user.name ?? '?')[0]}</span>
              )}
            </div>
            <div>
              <p className="font-semibold text-ink text-sm">{user.name ?? 'Unknown'}</p>
              {user.company && <p className="text-xs text-ink-2">{user.company}</p>}
            </div>
            {loading === user.id && (
              <div className="ml-auto w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
