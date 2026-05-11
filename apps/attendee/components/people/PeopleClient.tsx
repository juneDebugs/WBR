'use client'

import React, { useState, useTransition, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { usePeopleData } from '@/lib/hooks'

interface Person {
  id: string
  name: string | null
  image: string | null
  company: string | null
  jobTitle: string | null
  bio: string | null
  website: string | null
  linkedinUrl: string | null
}

interface Props {
  currentUserId: string
  allUsers: Person[]
  totalCount: number
  friends: Person[]
  friendIds: string[]
  conversations: Conversation[]
}

interface Conversation {
  roomId: string
  userId: string
  name: string
  image: string | null
  lastMessage: string | null
  lastMessageSenderId: string | null
  lastMessageAt: string | null
}

const TABS = ['Discover', 'Friends', 'Messages'] as const

import Image from 'next/image'
import { getIndustry, type Industry } from '@/lib/solutions'

type Group = 'Fashion & Style' | 'Beauty & Wellness' | 'Home, Food & Lifestyle' | 'Technology'

const INDUSTRY_TO_GROUP: Record<Industry, Group> = {
  'Fashion & Apparel': 'Fashion & Style',
  'Jewelry & Accessories': 'Fashion & Style',
  'Luxury': 'Fashion & Style',
  'Beauty & Cosmetics': 'Beauty & Wellness',
  'Skincare': 'Beauty & Wellness',
  'Health & Wellness': 'Beauty & Wellness',
  'Food & Beverage': 'Home, Food & Lifestyle',
  'Home & Lifestyle': 'Home, Food & Lifestyle',
  'Pet': 'Home, Food & Lifestyle',
  'Kids & Baby': 'Home, Food & Lifestyle',
  'Technology': 'Technology',
}

function getGroup(company: string | null): Group {
  return INDUSTRY_TO_GROUP[getIndustry(company)]
}

const GROUP_ORDER: Group[] = ['Fashion & Style', 'Beauty & Wellness', 'Home, Food & Lifestyle', 'Technology']

const GROUP_ICONS: Record<Group, React.ReactNode> = {
  'Fashion & Style': (
    <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l3.057-3 3.943 3v7.5c0 1.38-1.12 2.5-2.5 2.5S7 11.88 7 10.5V7H5V3zm4 0h2M16 3h3v4h-2v3.5c0 1.38-1.12 2.5-2.5 2.5S12 11.88 12 10.5V10" />
    </svg>
  ),
  'Beauty & Wellness': (
    <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  'Home, Food & Lifestyle': (
    <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
    </svg>
  ),
  'Technology': (
    <svg className="w-5 h-5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
}

const PAGE_SIZE = 20

// ── Memoized PersonRow ──────────────────────────────────────────────────────

const PersonRow = memo(function PersonRow({ user, isFriend, pending, onSelect, onToggleFriend }: {
  user: Person
  isFriend: boolean
  pending: boolean
  onSelect: (user: Person) => void
  onToggleFriend: (userId: string, e?: React.MouseEvent) => void
}) {
  return (
    <div
      onClick={() => onSelect(user)}
      className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 cursor-pointer active:bg-gray-50 transition-colors"
    >
      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        {user.image ? (
          <img src={user.image} alt="" loading="lazy" className="w-11 h-11 rounded-full object-cover" />
        ) : (
          <span className="text-primary font-bold">{(user.name ?? '?')[0]}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">{user.name ?? 'Unknown'}</p>
        {user.jobTitle && <p className="text-xs text-gray-400 truncate">{user.jobTitle}</p>}
        {user.company && (
          user.website ? (
            <a href={user.website} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs font-medium text-primary truncate flex items-center gap-0.5 hover:underline w-fit">
              {user.company}
              <svg className="w-2.5 h-2.5 opacity-60 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          ) : (
            <p className="text-xs font-medium text-primary truncate">{user.company}</p>
          )
        )}
      </div>
      <button
        onClick={e => onToggleFriend(user.id, e)}
        disabled={pending}
        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          isFriend ? 'bg-gray-100 text-gray-600' : 'bg-primary text-white'
        }`}>
        {isFriend ? 'Added' : 'Add'}
      </button>
    </div>
  )
})

// ── Component ────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  content: string
  senderId: string
  createdAt: string
  sender: { name: string | null; image: string | null }
}

export function PeopleClient(_props: Props) {
  const { data, isLoading } = usePeopleData()

  if (isLoading || !data) {
    return (
      <div className="page-container">
        <h1 className="text-2xl font-bold mb-4">People</h1>
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return <PeopleClientInner data={data} />
}

function PeopleClientInner({ data }: { data: { currentUserId: string; allUsers: Person[]; totalCount: number; friends: Person[]; friendIds: string[]; conversations: Conversation[] } }) {
  const { currentUserId, allUsers, totalCount, friends, friendIds, conversations } = data

  const [tab, setTab] = useState<typeof TABS[number]>('Discover')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Person | null>(null)
  const [searchResults, setSearchResults] = useState<Person[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [loadedUsers, setLoadedUsers] = useState<Person[]>(allUsers)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(allUsers.length < totalCount ? allUsers[allUsers.length - 1]?.id ?? null : null)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [chatRoomId, setChatRoomId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Global chat state
  const [globalOpen, setGlobalOpen] = useState(false)
  const [globalMessages, setGlobalMessages] = useState<ChatMessage[]>([])
  const [globalInput, setGlobalInput] = useState('')
  const [globalLoading, setGlobalLoading] = useState(false)
  const [globalSending, setGlobalSending] = useState(false)
  const [latestBroadcast, setLatestBroadcast] = useState<string | null>(null)
  const globalEndRef = useRef<HTMLDivElement>(null)

  const [friendState, setFriendState] = useState<Record<string, boolean>>(
    Object.fromEntries(friendIds.map(id => [id, true]))
  )

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({})
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  // Debounced search via API when user types
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!search.trim()) {
      setSearchResults(null)
      return
    }
    setSearchLoading(true)
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/people?search=${encodeURIComponent(search.trim())}&limit=100`)
        const data = await res.json()
        setSearchResults(data.users ?? [])
      } catch {
        setSearchResults(null)
      } finally {
        setSearchLoading(false)
      }
    }, 300)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [search])

  async function loadMoreUsers() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/people?cursor=${nextCursor}&limit=200`)
      const data = await res.json()
      setLoadedUsers(prev => [...prev, ...(data.users ?? [])])
      setNextCursor(data.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!selected) { setChatRoomId(null); setMessages([]); setChatInput(''); return }
    setChatLoading(true)
    fetch('/api/chat/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: selected.id }),
    })
      .then(r => r.json())
      .then(room => {
        setChatRoomId(room.id)
        return fetch(`/api/chat/rooms/${room.id}/messages`)
      })
      .then(r => r.json())
      .then(msgs => { setMessages(msgs); setChatLoading(false) })
      .catch(() => setChatLoading(false))
  }, [selected])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    globalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [globalMessages])

  // Fetch latest broadcast on mount
  useEffect(() => {
    fetch('/api/chat/global')
      .then(r => r.json())
      .then(data => {
        const msgs: ChatMessage[] = data.messages ?? []
        if (msgs.length > 0) setLatestBroadcast(msgs[msgs.length - 1].content)
      })
      .catch(() => {})
  }, [])

  async function openGlobalChat() {
    setGlobalOpen(true)
    setGlobalLoading(true)
    try {
      const res = await fetch('/api/chat/global')
      const data = await res.json()
      setGlobalMessages(data.messages ?? [])
    } finally {
      setGlobalLoading(false)
    }
  }

  async function sendGlobal() {
    if (!globalInput.trim() || globalSending) return
    setGlobalSending(true)
    const content = globalInput.trim()
    setGlobalInput('')
    const res = await fetch('/api/chat/global', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      const msg = await res.json()
      setGlobalMessages(prev => [...prev, msg])
    }
    setGlobalSending(false)
  }

  async function sendMessage() {
    if (!chatInput.trim() || !chatRoomId || sending) return
    setSending(true)
    const content = chatInput.trim()
    setChatInput('')
    const res = await fetch(`/api/chat/rooms/${chatRoomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      const msg = await res.json()
      setMessages(prev => [...prev, msg])
    }
    setSending(false)
  }

  const searchLower = search.toLowerCase()

  // Build an optimistic friends list from friendState + all known users
  const optimisticFriends = useMemo(() => {
    const allKnown = new Map<string, Person>()
    for (const u of friends) allKnown.set(u.id, u)
    for (const u of loadedUsers) allKnown.set(u.id, u)
    return Array.from(allKnown.values()).filter(u => friendState[u.id])
  }, [friends, loadedUsers, friendState])

  const filteredPeople = useMemo(() => {
    if (tab === 'Messages') return []
    if (tab === 'Discover') {
      if (search && searchResults !== null) return searchResults
      if (!search) return loadedUsers
      // Fallback: filter loaded users while API search is in flight
      return loadedUsers.filter(u =>
        (u.name ?? '').toLowerCase().includes(searchLower) ||
        (u.company ?? '').toLowerCase().includes(searchLower)
      )
    }
    // Friends tab — use optimistic list for instant updates
    if (!search) return optimisticFriends
    return optimisticFriends.filter(u =>
      (u.name ?? '').toLowerCase().includes(searchLower) ||
      (u.company ?? '').toLowerCase().includes(searchLower)
    )
  }, [tab, loadedUsers, optimisticFriends, search, searchLower, searchResults])

  const filteredConvos = useMemo(() => {
    if (tab !== 'Messages') return []
    if (!search) return conversations
    return conversations.filter(c => c.name.toLowerCase().includes(searchLower))
  }, [tab, conversations, search, searchLower])

  const toggleFriend = useCallback((userId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    startTransition(async () => {
      const res = await fetch(`/api/follow/${userId}`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      setFriendState(prev => ({ ...prev, [userId]: data.following }))
      router.refresh()
    })
  }, [router])

  const handleSelect = useCallback((user: Person) => setSelected(user), [])

  function toggleGroup(key: string) {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))
    // Reset page limit when opening a group
    setGroupLimits(prev => ({ ...prev, [key]: PAGE_SIZE }))
  }

  function showMore(group: string) {
    setGroupLimits(prev => ({ ...prev, [group]: (prev[group] ?? PAGE_SIZE) + PAGE_SIZE }))
  }

  // Group by broad category (only used in Discover tab) - memoized
  const grouped = useMemo(() => {
    if (tab !== 'Discover') return {} as Partial<Record<Group, Person[]>>
    const result: Partial<Record<Group, Person[]>> = {}
    for (const u of filteredPeople) {
      const g = getGroup(u.company)
      if (!result[g]) result[g] = []
      result[g]!.push(u)
    }
    return result
  }, [tab, filteredPeople])

  function GroupSection({ group, people }: { group: Group; people: Person[] }) {
    const open = openGroups[group] ?? false
    const limit = groupLimits[group] ?? PAGE_SIZE
    const visible = people.slice(0, limit)
    const hasMore = people.length > limit
    return (
      <div className="mb-4">
        <button
          onClick={() => toggleGroup(group)}
          className="w-full flex items-center justify-between py-2 text-left"
        >
          <div className="flex items-center gap-2">
            {GROUP_ICONS[group]}
            <span className="text-base font-bold text-pink-500">{group}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-400">{people.length}</span>
            <svg
              className={`w-4 h-4 text-pink-400 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>
        {open && (
          <div className="space-y-2">
            {visible.map(u => (
              <PersonRow
                key={u.id}
                user={u}
                isFriend={friendState[u.id] ?? false}
                pending={pending}
                onSelect={handleSelect}
                onToggleFriend={toggleFriend}
              />
            ))}
            {hasMore && (
              <button
                onClick={() => showMore(group)}
                className="w-full py-2.5 text-sm font-semibold text-primary bg-primary/5 rounded-xl active:bg-primary/10 transition-colors"
              >
                Show more ({people.length - limit} remaining)
              </button>
            )}
          </div>
        )}
      </div>
    )
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
          placeholder={tab === 'Messages' ? 'Search messages…' : 'Search people…'}
          className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-shrink-0 flex items-center gap-1 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'text-primary border-b-2 border-primary' : 'text-gray-500'
            }`}>
            {t}
            {t === 'Friends' && optimisticFriends.length > 0 && (
              <span className="text-xs text-gray-400">({optimisticFriends.length})</span>
            )}
            {t === 'Messages' && conversations.length > 0 && (
              <span className="text-xs text-gray-400">({conversations.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Messages tab */}
      {tab === 'Messages' && (
        <div className="space-y-1">
          {filteredConvos.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-700">No messages yet</p>
              <p className="text-xs text-gray-400 mt-1">Tap a person to start a conversation.</p>
            </div>
          ) : (
            filteredConvos.map(convo => {
              const person = allUsers.find(u => u.id === convo.userId)
              return (
                <button
                  key={convo.roomId}
                  onClick={() => person && setSelected(person)}
                  className="w-full flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3 active:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {convo.image ? (
                      <img src={convo.image} alt="" loading="lazy" className="w-12 h-12 object-cover" />
                    ) : (
                      <span className="text-gray-600 font-bold text-lg">{convo.name[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{convo.name}</p>
                    {convo.lastMessage ? (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {convo.lastMessageSenderId === currentUserId ? 'You: ' : ''}
                        {convo.lastMessage}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 italic mt-0.5">No messages yet</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )
            })
          )}
        </div>
      )}

      {/* Friends tab */}
      {tab === 'Friends' && (
        <div className="space-y-2">
          {filteredPeople.map(u => (
            <PersonRow
              key={u.id}
              user={u}
              isFriend={friendState[u.id] ?? false}
              pending={pending}
              onSelect={handleSelect}
              onToggleFriend={toggleFriend}
            />
          ))}
          {filteredPeople.length === 0 && (
            <p className="text-center text-gray-400 py-12">
              {search ? 'No results found.' : "No friends added yet. Discover people and hit Add."}
            </p>
          )}
        </div>
      )}

      {/* Discover tab — grouped */}
      {tab === 'Discover' && (
        <div>
          {/* WBR module */}
          <div
            className="w-full flex items-center gap-3 rounded-2xl p-4 mb-5"
            style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)' }}
          >
            <div className="flex-shrink-0 rounded-full p-[2px]" style={{ boxShadow: '0 0 8px 2px #f72585, 0 0 16px 4px #f72585', background: 'linear-gradient(135deg, #f72585, #ff85c1)' }}>
              <Image src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSgAAvPlrRRvUDB1RF75eTXwrpt20VLulV3Dg&s" alt="WBR 2027" width={44} height={44} className="w-11 h-11 rounded-full object-cover block" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white text-sm">WBR</p>
              <p className="text-sm text-white/70 mt-0.5 truncate">
                {latestBroadcast ?? 'No messages yet'}
              </p>
            </div>
          </div>

          {searchLoading && tab === 'Discover' && search && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {filteredPeople.length === 0 && !searchLoading ? (
            <p className="text-center text-gray-400 py-12">{search ? 'No results found.' : 'No other attendees yet.'}</p>
          ) : (
            <>
              {GROUP_ORDER.filter(g => grouped[g]?.length).map(g => (
                <GroupSection key={g} group={g} people={grouped[g]!} />
              ))}
              {!search && nextCursor && (
                <button
                  onClick={loadMoreUsers}
                  disabled={loadingMore}
                  className="w-full py-3 mt-2 text-sm font-semibold text-primary bg-primary/5 rounded-xl active:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading...' : `Load more people (${totalCount - loadedUsers.length} remaining)`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* WBR modal */}
      {globalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-5" onClick={() => setGlobalOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
            style={{ height: '75dvh', maxHeight: 'calc(100dvh - 60px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #2563eb 100%)' }}>
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-bold text-white text-sm leading-tight">WBR</p>
                <p className="text-xs text-white/70">Everyone at the conference</p>
              </div>
              <button
                onClick={() => setGlobalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {globalLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : globalMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}>
                    <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-700">Be the first to say hello!</p>
                  <p className="text-xs text-gray-400 mt-1">Start the global conversation</p>
                </div>
              ) : (
                globalMessages.map(msg => {
                  const isMe = msg.senderId === currentUserId
                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                      {!isMe && (
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-indigo-100 flex items-center justify-center flex-shrink-0 mb-0.5">
                          {msg.sender.image ? (
                            <img src={msg.sender.image} alt="" loading="lazy" className="w-6 h-6 object-cover" />
                          ) : (
                            <span className="text-indigo-700 font-bold text-[10px]">{(msg.sender.name ?? '?')[0]}</span>
                          )}
                        </div>
                      )}
                      <div className="flex flex-col gap-0.5 max-w-[72%]">
                        {!isMe && (
                          <Link href={`/people/${msg.senderId}`} className="text-[10px] text-gray-400 px-1 active:opacity-70">
                            {msg.sender.name}
                          </Link>
                        )}
                        <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? 'text-white rounded-br-sm'
                            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                        }`} style={isMe ? { background: 'linear-gradient(135deg, #7c3aed, #2563eb)' } : {}}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={globalEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 flex-shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <input
                value={globalInput}
                onChange={e => setGlobalInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGlobal() } }}
                placeholder="Message everyone…"
                className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <button
                onClick={sendGlobal}
                disabled={!globalInput.trim() || globalSending}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #2563eb)' }}
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DM Chat modal */}
      {selected && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:px-5"
          onClick={() => setSelected(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
            style={{ height: '70dvh', maxHeight: 'calc(100dvh - 60px)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <Link href={`/people/${selected.id}`} className="w-9 h-9 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0 active:opacity-70">
                {selected.image ? (
                  <img src={selected.image} alt="" loading="lazy" className="w-9 h-9 object-cover" />
                ) : (
                  <span className="text-primary font-bold text-sm">{(selected.name ?? '?')[0]}</span>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/people/${selected.id}`} className="font-semibold text-gray-900 text-sm leading-tight truncate block active:opacity-70">
                  {selected.name ?? 'Unknown'}
                </Link>
                {selected.company && (
                  selected.website ? (
                    <a href={selected.website} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5 w-fit">
                      {selected.company}
                      <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <p className="text-xs text-primary font-medium truncate">{selected.company}</p>
                  )
                )}
              </div>
              <Link
                href={`/people/${selected.id}`}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                title="View Profile"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </Link>
              <button
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {chatLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">Say hello to {selected.name?.split(' ')[0]}</p>
                  <p className="text-xs text-gray-400 mt-1">Start a conversation below</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.senderId === currentUserId
                  return (
                    <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                      {!isMe && (
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0 mb-0.5">
                          {msg.sender.image ? (
                            <img src={msg.sender.image} alt="" loading="lazy" className="w-6 h-6 object-cover" />
                          ) : (
                            <span className="text-primary font-bold text-[10px]">{(msg.sender.name ?? '?')[0]}</span>
                          )}
                        </div>
                      )}
                      <div className={`max-w-[72%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                        isMe ? 'bg-primary text-white rounded-br-sm' : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="flex items-center gap-2 px-3 py-3 border-t border-gray-100 flex-shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Message…"
                className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={sendMessage}
                disabled={!chatInput.trim() || sending}
                className="w-9 h-9 rounded-full bg-primary flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
