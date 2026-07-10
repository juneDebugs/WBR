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

const TABS = ['Feed', 'Discover', 'Friends', 'Messages'] as const

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
    <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l3.057-3 3.943 3v7.5c0 1.38-1.12 2.5-2.5 2.5S7 11.88 7 10.5V7H5V3zm4 0h2M16 3h3v4h-2v3.5c0 1.38-1.12 2.5-2.5 2.5S12 11.88 12 10.5V10" />
    </svg>
  ),
  'Beauty & Wellness': (
    <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  ),
  'Home, Food & Lifestyle': (
    <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z" />
    </svg>
  ),
  'Technology': (
    <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
      className="card flex items-center gap-3 cursor-pointer active:bg-fill transition-colors"
    >
      <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        {user.image ? (
          <img src={user.image} alt="" loading="lazy" className="w-11 h-11 rounded-full object-cover" />
        ) : (
          <span className="text-primary font-bold">{(user.name ?? '?')[0]}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink text-sm truncate">{user.name ?? 'Unknown'}</p>
        {user.jobTitle && <p className="text-xs text-ink-3 truncate">{user.jobTitle}</p>}
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
        className={`flex-shrink-0 btn-sm ${isFriend ? 'btn-secondary' : 'btn-primary'}`}>
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
  sender: {
    id?: string
    name: string | null
    image: string | null
    company?: string | null
    jobTitle?: string | null
  }
}

// Relative timestamp for feed cards: "now", "5m", "2h", "Yesterday", else short date.
function timeAgo(iso: string): string {
  const date = new Date(iso)
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (diffMins < 1) return 'now'
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function PeopleClient(_props: Props) {
  const { data, isLoading } = usePeopleData()

  if (isLoading || !data?.currentUserId) {
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

  const [tab, setTab] = useState<typeof TABS[number]>('Feed')
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

  // Feed state — conference-wide home feed backed by /api/chat/global.
  // Messages are stored ASCENDING (oldest→newest, as the API returns) and
  // reversed for display so the newest post is at the top.
  const [feedMessages, setFeedMessages] = useState<ChatMessage[]>([])
  const [feedInput, setFeedInput] = useState('')
  const [feedLoading, setFeedLoading] = useState(true)
  const [feedSending, setFeedSending] = useState(false)
  const feedFetchedRef = useRef(false)
  const feedLatestIdRef = useRef('')

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

  // Fetch the feed once, the first time the Feed tab becomes active
  // (immediately on mount, since Feed is the default tab).
  useEffect(() => {
    if (tab !== 'Feed' || feedFetchedRef.current) return
    feedFetchedRef.current = true
    setFeedLoading(true)
    fetch('/api/chat/global')
      .then(r => r.json())
      .then(data => {
        const msgs: ChatMessage[] = data.messages ?? []
        feedLatestIdRef.current = msgs[msgs.length - 1]?.id ?? ''
        setFeedMessages(msgs)
      })
      .catch(() => {})
      .finally(() => setFeedLoading(false))
  }, [tab])

  // Poll while the Feed tab is active — this is the delivery mechanism for
  // admin-scheduled broadcasts. Mirrors the latestIdRef pattern in
  // components/chat/ChatView.tsx to skip re-renders when nothing changed.
  useEffect(() => {
    if (tab !== 'Feed') return
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/chat/global')
        if (!res.ok) return
        const data = await res.json()
        const msgs: ChatMessage[] = data.messages ?? []
        const latest = msgs[msgs.length - 1]?.id ?? ''
        if (latest !== feedLatestIdRef.current) {
          feedLatestIdRef.current = latest
          // Preserve any optimistic (temp) messages still awaiting their POST.
          setFeedMessages(prev => [...msgs, ...prev.filter(m => m.id.startsWith('temp-'))])
        }
      } catch {}
    }, 15000)
    return () => clearInterval(interval)
  }, [tab])

  // Current user's profile (for the composer avatar), if already loaded.
  const me = useMemo(
    () =>
      loadedUsers.find(u => u.id === currentUserId) ??
      friends.find(u => u.id === currentUserId) ??
      null,
    [loadedUsers, friends, currentUserId]
  )

  // Newest-first for display
  const feedDisplay = useMemo(() => [...feedMessages].reverse(), [feedMessages])

  async function sendFeedPost() {
    const content = feedInput.trim()
    if (!content || feedSending) return
    setFeedSending(true)
    setFeedInput('')

    // Optimistic append — stored list is ascending, so appending puts the
    // temp message at the top of the (reversed) feed.
    const temp: ChatMessage = {
      id: `temp-${Date.now()}`,
      content,
      senderId: currentUserId,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId,
        name: me?.name ?? 'You',
        image: me?.image ?? null,
        company: me?.company ?? null,
        jobTitle: me?.jobTitle ?? null,
      },
    }
    setFeedMessages(prev => [...prev, temp])

    try {
      const res = await fetch('/api/chat/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const saved: ChatMessage = await res.json()
        setFeedMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== temp.id)
          // A poll may have already delivered the saved message — don't duplicate.
          return withoutTemp.some(m => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved]
        })
        feedLatestIdRef.current = saved.id
      } else {
        // Validation failure (e.g. 400) — remove the temp post, restore input.
        setFeedMessages(prev => prev.filter(m => m.id !== temp.id))
        setFeedInput(content)
      }
    } catch {
      setFeedMessages(prev => prev.filter(m => m.id !== temp.id))
      setFeedInput(content)
    }
    setFeedSending(false)
  }

  // Open the existing DM modal for a feed post's author.
  function openDmWith(msg: ChatMessage) {
    const senderId = msg.sender.id ?? msg.senderId
    if (senderId === currentUserId) return
    setSelected({
      id: senderId,
      name: msg.sender.name,
      image: msg.sender.image,
      company: msg.sender.company ?? null,
      jobTitle: msg.sender.jobTitle ?? null,
      bio: null,
      website: null,
      linkedinUrl: null,
    })
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
            <span className="text-base font-bold text-brand">{group}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink-3">{people.length}</span>
            <svg
              className={`w-4 h-4 text-brand-400 transition-transform ${open ? 'rotate-180' : ''}`}
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

      {/* Search (not used by the Feed tab) */}
      {tab !== 'Feed' && (
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'Messages' ? 'Search messages…' : 'Search people…'}
            className="input pl-9 bg-fill"
          />
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-hairline mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-shrink-0 flex items-center gap-1 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'text-primary border-b-2 border-primary' : 'text-ink-2'
            }`}>
            {t}
            {t === 'Friends' && optimisticFriends.length > 0 && (
              <span className="text-xs text-ink-3">({optimisticFriends.length})</span>
            )}
            {t === 'Messages' && conversations.length > 0 && (
              <span className="text-xs text-ink-3">({conversations.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Feed tab */}
      {tab === 'Feed' && (
        <div>
          {/* Composer */}
          <div className="card mb-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-fill overflow-hidden flex items-center justify-center flex-shrink-0">
                {me?.image ? (
                  <img src={me.image} alt="" className="w-10 h-10 object-cover" />
                ) : (
                  <svg className="w-5 h-5 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <textarea
                  value={feedInput}
                  onChange={e => setFeedInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendFeedPost() } }}
                  placeholder="Share something with everyone at WBR…"
                  maxLength={5000}
                  rows={2}
                  className="textarea w-full min-h-[44px]"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={sendFeedPost}
                    disabled={!feedInput.trim() || feedSending}
                    className="btn-primary btn-sm min-h-[44px]"
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feed — newest first */}
          {feedLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="card">
                  <div className="flex items-start gap-3">
                    <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-0.5">
                      <div className="skeleton h-3.5 w-1/3" />
                      <div className="skeleton h-3 w-1/2" />
                      <div className="skeleton h-3.5 w-full" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : feedDisplay.length === 0 ? (
            <div className="empty-state">
              <div className="w-12 h-12 rounded-full bg-fill flex items-center justify-center">
                <svg className="w-6 h-6 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">Be the first to say hello to the conference</p>
              <p className="text-footnote text-ink-3">Posts here are visible to everyone at WBR.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {feedDisplay.map(msg => {
                const senderId = msg.sender.id ?? msg.senderId
                const isMe = senderId === currentUserId
                const isTemp = msg.id.startsWith('temp-')
                const caption = [msg.sender.company, msg.sender.jobTitle].filter(Boolean).join(' · ')
                return (
                  <div key={msg.id} className={`card ${isTemp ? 'opacity-60' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-fill overflow-hidden flex items-center justify-center flex-shrink-0">
                        {msg.sender.image ? (
                          <img src={msg.sender.image} alt="" loading="lazy" className="w-10 h-10 object-cover" />
                        ) : (
                          <span className="text-ink-2 font-bold">{(msg.sender.name ?? '?')[0]}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 min-w-0">
                          {isMe ? (
                            <span className="font-semibold text-ink text-sm truncate">{msg.sender.name ?? 'You'}</span>
                          ) : (
                            <Link href={`/people/${senderId}`} className="font-semibold text-ink text-sm truncate active:opacity-70">
                              {msg.sender.name ?? 'Unknown'}
                            </Link>
                          )}
                          <span className="text-caption text-ink-3 flex-shrink-0">{timeAgo(msg.createdAt)}</span>
                        </div>
                        {caption && <p className="text-footnote text-ink-3 truncate">{caption}</p>}
                      </div>
                      {!isMe && (
                        <button
                          onClick={() => openDmWith(msg)}
                          className="btn-ghost btn-sm min-h-[44px] -my-2 -mr-2 flex-shrink-0"
                        >
                          Message
                        </button>
                      )}
                    </div>
                    <p className="text-subhead text-ink whitespace-pre-wrap break-words mt-2">{msg.content}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Messages tab */}
      {tab === 'Messages' && (
        <div className="space-y-1">
          {filteredConvos.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-fill flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-ink">No messages yet</p>
              <p className="text-xs text-ink-3 mt-1">Tap a person to start a conversation.</p>
            </div>
          ) : (
            filteredConvos.map(convo => {
              const person = allUsers.find(u => u.id === convo.userId)
              return (
                <button
                  key={convo.roomId}
                  onClick={() => person && setSelected(person)}
                  className="card w-full flex items-center gap-3 active:bg-fill transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-fill flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {convo.image ? (
                      <img src={convo.image} alt="" loading="lazy" className="w-12 h-12 object-cover" />
                    ) : (
                      <span className="text-ink-2 font-bold text-lg">{convo.name[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-ink text-sm">{convo.name}</p>
                    {convo.lastMessage ? (
                      <p className="text-xs text-ink-2 truncate mt-0.5">
                        {convo.lastMessageSenderId === currentUserId ? 'You: ' : ''}
                        {convo.lastMessage}
                      </p>
                    ) : (
                      <p className="text-xs text-ink-3 italic mt-0.5">No messages yet</p>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-ink-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <p className="text-center text-ink-3 py-12">
              {search ? 'No results found.' : "No friends added yet. Discover people and hit Add."}
            </p>
          )}
        </div>
      )}

      {/* Discover tab — grouped */}
      {tab === 'Discover' && (
        <div>
          {searchLoading && tab === 'Discover' && search && (
            <div className="flex justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {filteredPeople.length === 0 && !searchLoading ? (
            <p className="text-center text-ink-3 py-12">{search ? 'No results found.' : 'No other attendees yet.'}</p>
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
            <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline flex-shrink-0">
              <Link href={`/people/${selected.id}`} className="w-9 h-9 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center flex-shrink-0 active:opacity-70">
                {selected.image ? (
                  <img src={selected.image} alt="" loading="lazy" className="w-9 h-9 object-cover" />
                ) : (
                  <span className="text-primary font-bold text-sm">{(selected.name ?? '?')[0]}</span>
                )}
              </Link>
              <div className="flex-1 min-w-0">
                <Link href={`/people/${selected.id}`} className="font-semibold text-ink text-sm leading-tight truncate block active:opacity-70">
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
                className="w-8 h-8 rounded-full bg-fill flex items-center justify-center flex-shrink-0 active:scale-95 transition-transform"
                title="View Profile"
              >
                <svg className="w-4 h-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </Link>
              <button
                onClick={() => setSelected(null)}
                className="w-8 h-8 rounded-full bg-fill flex items-center justify-center flex-shrink-0"
              >
                <svg className="w-4 h-4 text-ink-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  <div className="w-12 h-12 rounded-full bg-fill flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-ink-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm text-ink-2 font-medium">Say hello to {selected.name?.split(' ')[0]}</p>
                  <p className="text-xs text-ink-3 mt-1">Start a conversation below</p>
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
                        isMe ? 'bg-primary text-white rounded-br-sm' : 'bg-fill text-ink rounded-bl-sm'
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
            <div className="flex items-center gap-2 px-3 py-3 border-t border-hairline flex-shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder="Message…"
                className="flex-1 bg-fill rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
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
