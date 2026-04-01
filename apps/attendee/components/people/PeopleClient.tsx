'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'

interface Session {
  id: string
  title: string
  startsAt: string
  room: string | null
  track: string | null
}

interface Person {
  id: string
  name: string | null
  image: string | null
  company: string | null
  jobTitle: string | null
  bio: string | null
  sessions: Session[]
}

interface Props {
  currentUserId: string
  allUsers: Person[]
  following: Person[]
  followers: Person[]
  followingIds: string[]
}

const TABS = ['Discover', 'Following', 'Followers'] as const

export function PeopleClient({ currentUserId, allUsers, following, followers, followingIds }: Props) {
  const [tab, setTab] = useState<typeof TABS[number]>('Discover')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Person | null>(null)
  const [followState, setFollowState] = useState<Record<string, boolean>>(
    Object.fromEntries(followingIds.map(id => [id, true]))
  )
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const lists: Record<typeof TABS[number], Person[]> = {
    Discover: allUsers,
    Following: following,
    Followers: followers,
  }

  const filtered = lists[tab].filter(u =>
    !search ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (u.company ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function toggleFollow(userId: string, e?: React.MouseEvent) {
    e?.stopPropagation()
    startTransition(async () => {
      const res = await fetch(`/api/follow/${userId}`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      setFollowState(prev => ({ ...prev, [userId]: data.following }))
      router.refresh()
    })
  }

  return (
    <div className="page-container">
      <h1 className="text-2xl font-bold mb-4">People</h1>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search people…"
          className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
            }`}>
            {t}
            {t === 'Following' && following.length > 0 && (
              <span className="ml-1 text-xs text-gray-400">({following.length})</span>
            )}
            {t === 'Followers' && followers.length > 0 && (
              <span className="ml-1 text-xs text-gray-400">({followers.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.map(user => {
          const isFollowing = followState[user.id] ?? false
          return (
            <div
              key={user.id}
              onClick={() => setSelected(user)}
              className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 cursor-pointer active:bg-gray-50 transition-colors"
            >
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <span className="text-primary font-bold">{(user.name ?? '?')[0]}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{user.name ?? 'Unknown'}</p>
                {(user.jobTitle || user.company) && (
                  <p className="text-xs text-gray-400 truncate">
                    {[user.jobTitle, user.company].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <button
                onClick={e => toggleFollow(user.id, e)}
                disabled={pending}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  isFollowing ? 'bg-gray-100 text-gray-600' : 'bg-primary text-white'
                }`}>
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-12">
            {search ? 'No results found.' : tab === 'Following' ? "You're not following anyone yet." : tab === 'Followers' ? 'No followers yet.' : 'No other attendees yet.'}
          </p>
        )}
      </div>

      {/* Centered profile modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-5"
          onClick={() => setSelected(null)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/20 flex items-center justify-center"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Gradient header */}
            <div className="h-28 bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500" />

            {/* Avatar */}
            <div className="px-5 -mt-10">
              <div className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg overflow-hidden bg-primary/10 flex items-center justify-center">
                {selected.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary font-bold text-3xl">{(selected.name ?? '?')[0]}</span>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="px-5 pt-3 pb-2">
              <h2 className="text-xl font-bold text-gray-900 leading-tight">{selected.name ?? 'Unknown'}</h2>
              {selected.jobTitle && (
                <p className="text-sm text-gray-500 mt-0.5">{selected.jobTitle}</p>
              )}
              {selected.company && (
                <p className="text-sm font-semibold text-primary mt-0.5">{selected.company}</p>
              )}
              {selected.bio ? (
                <p className="text-sm text-gray-600 mt-3 leading-relaxed">{selected.bio}</p>
              ) : (
                <p className="text-sm text-gray-400 mt-3 italic">No bio yet.</p>
              )}
            </div>

            {/* Sessions */}
            {selected.sessions.length > 0 && (
              <div className="px-5 pt-2 pb-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Sessions</h3>
                <div className="space-y-2">
                  {selected.sessions.map(s => (
                    <div key={s.id} className="flex items-start gap-3 bg-gray-50 rounded-xl p-3">
                      <div className="flex-shrink-0 text-center w-12">
                        <p className="text-indigo-600 font-bold text-xs">{format(new Date(s.startsAt), 'h:mm')}</p>
                        <p className="text-gray-400 text-[10px]">{format(new Date(s.startsAt), 'a')}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">{s.title}</p>
                        {s.room && <p className="text-xs text-gray-400 mt-0.5">{s.room}</p>}
                        {s.track && (
                          <span className="inline-block mt-1 text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                            {s.track}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => { setSelected(null); router.push(`/chat/dm/${selected.id}`) }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Message
              </button>
              <button
                onClick={() => toggleFollow(selected.id)}
                disabled={pending}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  followState[selected.id] ? 'bg-gray-100 text-gray-700' : 'bg-primary text-white'
                }`}
              >
                {followState[selected.id] ? 'Following' : 'Follow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
