'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

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
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2">
          <span className="text-sm font-medium text-gray-500">To:</span>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {filtered.map(user => (
          <button key={user.id} onClick={() => startDm(user.id)}
            disabled={loading === user.id}
            className="w-full flex items-center gap-3 px-4 py-3 active:bg-gray-50 transition-colors text-left">
            <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
              {user.image ? (
                <Image src={user.image} alt="" width={48} height={48} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <span className="text-gray-600 font-bold text-lg">{(user.name ?? '?')[0]}</span>
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">{user.name ?? 'Unknown'}</p>
              {user.company && <p className="text-xs text-gray-400">{user.company}</p>}
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
