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
