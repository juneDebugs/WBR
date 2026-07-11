'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { FriendStatus } from '@conference/db'
import { friendAriaLabel } from '@/lib/friend-labels'

// ── Shared types ─────────────────────────────────────────────────────────────

export interface Person {
  id: string
  name: string | null
  image: string | null
  company: string | null
  jobTitle: string | null
  bio: string | null
  website: string | null
  linkedinUrl: string | null
}

interface FeedSender {
  id?: string
  name: string | null
  image: string | null
  company?: string | null
  jobTitle?: string | null
}

// One DM thread as returned by /api/data/people — the same shape the Messages
// tab renders. The Feed rail consumes these so both surfaces stay in sync.
export interface Conversation {
  roomId: string
  userId: string
  name: string
  image: string | null
  lastMessage: string | null
  lastMessageSenderId: string | null
  lastMessageAt: string | null
}

export interface FeedMessage {
  id: string
  roomId?: string
  senderId: string
  content: string
  imageUrl: string | null
  createdAt: string
  sender: FeedSender
  likeCount: number
  commentCount: number
  likedByMe: boolean
}

interface FeedComment {
  id: string
  messageId: string
  content: string
  createdAt: string
  user: {
    id: string
    name: string | null
    image: string | null
    company?: string | null
    jobTitle?: string | null
  }
}

const SAVED_STORAGE_KEY = 'wbr-feed-saved'

// ── Time formatting ───────────────────────────────────────────────────────────

// Long relative timestamp for post footers: "Just now" / "12 minutes ago" /
// "3 hours ago" / "1 day ago" / "Jun 30".
function feedTimeAgo(iso: string): string {
  const date = new Date(iso)
  const diffMins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Short relative timestamp for comments: "now", "5m", "2h", "Yesterday", date.
function timeAgoShort(iso: string): string {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

// Backfill enriched fields defensively so older payloads (e.g. a cached
// service-worker response from before the feed API grew likes/comments)
// render instead of crashing.
function normalizeMessage(m: Partial<FeedMessage> & { id: string }): FeedMessage {
  return {
    id: m.id,
    roomId: m.roomId,
    senderId: m.senderId ?? '',
    content: m.content ?? '',
    imageUrl: m.imageUrl ?? null,
    createdAt: m.createdAt ?? new Date().toISOString(),
    sender: m.sender ?? { name: null, image: null },
    likeCount: m.likeCount ?? 0,
    commentCount: m.commentCount ?? 0,
    likedByMe: m.likedByMe ?? false,
  }
}

function personFromSender(msg: FeedMessage): Person {
  return {
    id: msg.sender.id ?? msg.senderId,
    name: msg.sender.name,
    image: msg.sender.image,
    company: msg.sender.company ?? null,
    jobTitle: msg.sender.jobTitle ?? null,
    bio: null,
    website: null,
    linkedinUrl: null,
  }
}

// Client-side image pipeline for the composer: downscale to ≤1080px on the
// longest side and re-encode as JPEG so the data URI fits the API's 2M-char cap.
function processImageFile(file: File): Promise<{ dataUrl: string } | { error: string }> {
  const LIMIT = 1_900_000
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onerror = () => resolve({ error: 'Could not read that file.' })
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => resolve({ error: 'That file is not a supported image.' })
      img.onload = () => {
        const MAX = 1080
        const scale = Math.min(1, MAX / Math.max(img.width, img.height, 1))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({ error: 'Could not process the image.' })
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        let dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        if (dataUrl.length > LIMIT) dataUrl = canvas.toDataURL('image/jpeg', 0.6)
        if (dataUrl.length > LIMIT) {
          resolve({ error: 'That image is too large — please try a smaller one.' })
          return
        }
        resolve({ dataUrl })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

// ── Small presentational pieces ───────────────────────────────────────────────

function AvatarCircle({ person, sizeClass, textClass = 'text-sm' }: {
  person: { name: string | null; image: string | null } | null
  sizeClass: string
  textClass?: string
}) {
  return (
    <div className={`${sizeClass} rounded-full bg-fill-2 overflow-hidden flex items-center justify-center flex-shrink-0`}>
      {person?.image ? (
        <img src={person.image} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : person?.name ? (
        <span className={`text-ink-2 font-bold ${textClass}`}>{person.name[0]}</span>
      ) : (
        <svg className="w-1/2 h-1/2 text-ink-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )}
    </div>
  )
}

// Instagram-style gradient ring: outer gradient, inner surface gap, avatar.
function GradientRingAvatar({ person, sizeClass, outerPad, innerPad, textClass = 'text-sm' }: {
  person: { name: string | null; image: string | null }
  sizeClass: string
  outerPad: string
  innerPad: string
  textClass?: string
}) {
  return (
    <div className={`${sizeClass} rounded-full bg-brand-gradient ${outerPad} flex-shrink-0`}>
      <div className={`w-full h-full rounded-full bg-surface ${innerPad}`}>
        <div className="w-full h-full rounded-full bg-fill-2 overflow-hidden flex items-center justify-center">
          {person.image ? (
            <img src={person.image} alt="" loading="lazy" className="w-full h-full object-cover" />
          ) : (
            <span className={`text-ink-2 font-bold ${textClass}`}>{(person.name ?? '?')[0]}</span>
          )}
        </div>
      </div>
    </div>
  )
}

const HEART_PATH = 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z'

function HeartIcon({ filled, className }: { filled: boolean; className: string }) {
  return filled ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={HEART_PATH} />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={HEART_PATH} />
    </svg>
  )
}

function CommentIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}

function PlaneIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}

function BookmarkIcon({ filled, className }: { filled: boolean; className: string }) {
  const d = 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z'
  return filled ? (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

// ── Friend button copy (post header) ─────────────────────────────────────────

const FRIEND_BUTTON_LABEL: Record<FriendStatus, string> = {
  none: 'Friend',
  pending_outgoing: 'Pending',
  pending_incoming: 'Accept',
  friends: 'Friends',
}

// ── Feed header (rendered by PeopleClient in place of the "People" h1) ────────

export interface FeedHeaderProps {
  conferenceName?: string | null
  onCreate: () => void
  onOpenMessages: () => void
  hasConversations: boolean
}

export function FeedHeader({ conferenceName, onCreate, onOpenMessages, hasConversations }: FeedHeaderProps) {
  return (
    <div className="flex items-center justify-between -mx-2 mb-1">
      <button type="button" onClick={onCreate} aria-label="New post" className="icon-btn text-ink">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>
      <div data-testid="feed-wordmark" className="flex items-center gap-1 min-w-0 px-1">
        <span className="text-[24px] font-extrabold tracking-tight text-ink truncate">{conferenceName ?? 'WBR'}</span>
        <svg className="w-3.5 h-3.5 text-ink mt-1 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      <button type="button" onClick={onOpenMessages} aria-label="Messages" className="icon-btn text-ink relative">
        <PlaneIcon className="w-6 h-6" />
        {hasConversations && (
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-danger ring-2 ring-surface" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}

// ── FeedTab ───────────────────────────────────────────────────────────────────

export interface FeedTabProps {
  currentUserId: string
  me: Person | null
  people: Person[]
  friends: Person[]
  conversations: Conversation[]
  friendState: Record<string, FriendStatus>
  pendingFriend: boolean
  onFriendAction: (userId: string, e?: React.MouseEvent) => void
  onOpenDm: (person: Person) => void
  onOpenMessages: () => void
  composerOpen: boolean
  onComposerOpenChange: (open: boolean) => void
}

export function FeedTab({
  currentUserId,
  me,
  people,
  friends,
  conversations,
  friendState,
  pendingFriend,
  onFriendAction,
  onOpenDm,
  onOpenMessages,
  composerOpen,
  onComposerOpenChange,
}: FeedTabProps) {
  const router = useRouter()

  // Feed state — messages are stored ASCENDING (oldest→newest, as the API
  // returns) and reversed for display so the newest post is at the top.
  const [feedMessages, setFeedMessages] = useState<FeedMessage[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const latestIdRef = useRef('')

  // Composer state
  const [composerText, setComposerText] = useState('')
  const [stagedImage, setStagedImage] = useState<string | null>(null)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Comments sheet state
  const [commentsFor, setCommentsFor] = useState<string | null>(null)
  const [comments, setComments] = useState<FeedComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentInput, setCommentInput] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  // Bumped whenever local comment state supersedes an in-flight list fetch
  // (see openComments / sendComment).
  const commentsGenRef = useRef(0)

  // Per-post options sheet (••• on others' posts)
  const [optionsFor, setOptionsFor] = useState<FeedMessage | null>(null)

  // Saved posts — client-side only, persisted in localStorage.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_STORAGE_KEY)
      if (raw) setSavedIds(new Set(JSON.parse(raw) as string[]))
    } catch {}
  }, [])
  function toggleSaved(id: string) {
    setSavedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify([...next])) } catch {}
      return next
    })
  }

  // Fetch the feed on mount (FeedTab only mounts while the Feed tab is active).
  useEffect(() => {
    let cancelled = false
    fetch('/api/chat/global')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        const msgs: FeedMessage[] = (data.messages ?? []).map(normalizeMessage)
        latestIdRef.current = msgs[msgs.length - 1]?.id ?? ''
        setFeedMessages(msgs)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFeedLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Poll while mounted — this is the delivery mechanism for admin-scheduled
  // broadcasts. Mirrors the latestIdRef pattern in components/chat/ChatView.tsx
  // to skip re-renders when nothing changed, and preserves any optimistic
  // (temp) messages still awaiting their POST.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/chat/global')
        if (!res.ok) return
        const data = await res.json()
        const msgs: FeedMessage[] = (data.messages ?? []).map(normalizeMessage)
        const latest = msgs[msgs.length - 1]?.id ?? ''
        if (latest !== latestIdRef.current) {
          latestIdRef.current = latest
          setFeedMessages(prev => [...msgs, ...prev.filter(m => m.id.startsWith('temp-'))])
        }
      } catch {}
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  // Newest-first for display
  const feedDisplay = useMemo(() => [...feedMessages].reverse(), [feedMessages])

  // Messages rail: one tile per DM conversation, in the same order the
  // Messages tab shows them (most recent message first). Tapping a tile opens
  // that conversation directly. People we already have full profiles for are
  // enriched from friends/people; otherwise the conversation payload itself
  // carries enough (id, name, image) to open the DM.
  const railConversations = useMemo(() => {
    const byId = new Map<string, Person>()
    for (const p of [...friends, ...people]) if (!byId.has(p.id)) byId.set(p.id, p)
    return conversations
      .filter(c => c.userId && c.userId !== currentUserId)
      .slice(0, 15)
      .map(c => ({
        convo: c,
        person: byId.get(c.userId) ?? {
          id: c.userId,
          name: c.name,
          image: c.image,
          company: null,
          jobTitle: null,
          bio: null,
          website: null,
          linkedinUrl: null,
        },
      }))
  }, [conversations, friends, people, currentUserId])

  // Badge/label count: only conversations the rail can actually represent
  // (orphaned rooms whose other member was deleted arrive with userId '').
  const railConvoCount = useMemo(
    () => conversations.filter(c => c.userId && c.userId !== currentUserId).length,
    [conversations, currentUserId]
  )

  function openComposer() {
    setComposerError(null)
    onComposerOpenChange(true)
  }
  function closeComposer() {
    onComposerOpenChange(false)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setComposerError(null)
    const result = await processImageFile(file)
    if ('error' in result) setComposerError(result.error)
    else setStagedImage(result.dataUrl)
  }

  // Optimistic post: append a temp- message (rendered instantly at the top),
  // close the sheet, then reconcile with the saved message or roll back and
  // restore the draft on failure.
  async function sendPost() {
    const content = composerText.trim()
    const imageUrl = stagedImage
    if ((!content && !imageUrl) || sending) return
    setSending(true)
    setComposerError(null)

    const temp: FeedMessage = {
      id: `temp-${Date.now()}`,
      senderId: currentUserId,
      content,
      imageUrl: imageUrl ?? null,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId,
        name: me?.name ?? 'You',
        image: me?.image ?? null,
        company: me?.company ?? null,
        jobTitle: me?.jobTitle ?? null,
      },
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
    }
    setFeedMessages(prev => [...prev, temp])
    setComposerText('')
    setStagedImage(null)
    onComposerOpenChange(false)

    try {
      const res = await fetch('/api/chat/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, imageUrl: imageUrl ?? null }),
      })
      if (res.ok) {
        const saved = normalizeMessage(await res.json())
        setFeedMessages(prev => {
          const withoutTemp = prev.filter(m => m.id !== temp.id)
          // A poll may have already delivered the saved message — don't duplicate.
          return withoutTemp.some(m => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved]
        })
        latestIdRef.current = saved.id
      } else {
        setFeedMessages(prev => prev.filter(m => m.id !== temp.id))
        setComposerText(content)
        setStagedImage(imageUrl)
        setComposerError('Could not share your post — please try again.')
      }
    } catch {
      setFeedMessages(prev => prev.filter(m => m.id !== temp.id))
      setComposerText(content)
      setStagedImage(imageUrl)
      setComposerError('Could not share your post — please try again.')
    }
    setSending(false)
  }

  // Optimistic like toggle with reconcile-on-response, rollback on failure.
  async function toggleLike(msg: FeedMessage) {
    if (msg.id.startsWith('temp-')) return
    const id = msg.id
    const wasLiked = msg.likedByMe
    setFeedMessages(prev => prev.map(m =>
      m.id === id
        ? { ...m, likedByMe: !wasLiked, likeCount: Math.max(0, m.likeCount + (wasLiked ? -1 : 1)) }
        : m
    ))
    try {
      const res = await fetch(`/api/feed/${id}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('like failed')
      const data: { liked: boolean; likeCount: number } = await res.json()
      setFeedMessages(prev => prev.map(m =>
        m.id === id ? { ...m, likedByMe: data.liked, likeCount: data.likeCount } : m
      ))
    } catch {
      setFeedMessages(prev => prev.map(m =>
        m.id === id
          ? { ...m, likedByMe: wasLiked, likeCount: Math.max(0, m.likeCount + (wasLiked ? 1 : -1)) }
          : m
      ))
    }
  }

  function openComments(messageId: string) {
    if (messageId.startsWith('temp-')) return
    setCommentsFor(messageId)
    setComments([])
    setCommentInput('')
    setCommentsLoading(true)
    // Generation guard: if a comment is posted (or the sheet is reopened)
    // while this list fetch is in flight, its stale snapshot must not clobber
    // the newer local state — posting a comment races a slow list response.
    const gen = ++commentsGenRef.current
    fetch(`/api/feed/${messageId}/comments`)
      .then(r => r.json())
      .then(data => { if (commentsGenRef.current === gen) setComments(data.comments ?? []) })
      .catch(() => {})
      .finally(() => { if (commentsGenRef.current === gen) setCommentsLoading(false) })
  }

  async function sendComment() {
    const content = commentInput.trim()
    if (!content || !commentsFor || commentSending) return
    const messageId = commentsFor
    setCommentSending(true)
    setCommentInput('')
    // Local state now supersedes any in-flight list fetch for this sheet —
    // including its loading flag, which that fetch will no longer clear.
    commentsGenRef.current++
    setCommentsLoading(false)

    const temp: FeedComment = {
      id: `temp-${Date.now()}`,
      messageId,
      content,
      createdAt: new Date().toISOString(),
      user: {
        id: currentUserId,
        name: me?.name ?? 'You',
        image: me?.image ?? null,
        company: me?.company ?? null,
        jobTitle: me?.jobTitle ?? null,
      },
    }
    setComments(prev => [...prev, temp])

    try {
      const res = await fetch(`/api/feed/${messageId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const saved: FeedComment = await res.json()
        setComments(prev => prev.map(c => (c.id === temp.id ? saved : c)))
        setFeedMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, commentCount: m.commentCount + 1 } : m
        ))
      } else {
        setComments(prev => prev.filter(c => c.id !== temp.id))
        setCommentInput(content)
      }
    } catch {
      setComments(prev => prev.filter(c => c.id !== temp.id))
      setCommentInput(content)
    }
    setCommentSending(false)
  }

  return (
    <div>
      {/* ── Stories rail + posts ── */}
      {feedLoading ? (
        <div>
          {/* Skeleton stories rail */}
          <div className="-mx-4 px-4 flex gap-2 overflow-hidden pb-3">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="w-[72px] flex-shrink-0 flex flex-col items-center gap-1.5">
                <div className="skeleton w-16 h-16 rounded-full" />
                <div className="skeleton h-2.5 w-12" />
              </div>
            ))}
          </div>
          {/* Skeleton posts */}
          <div className="-mx-4">
            {[0, 1].map(i => (
              <div key={i} className={`bg-surface border-b border-hairline ${i === 0 ? 'border-t' : ''}`}>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <div className="skeleton w-9 h-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-1/3" />
                    <div className="skeleton h-2.5 w-1/2" />
                  </div>
                </div>
                <div className="skeleton h-64 w-full rounded-none" />
                <div className="flex items-center gap-4 px-4 py-3">
                  <div className="skeleton w-6 h-6 rounded-full" />
                  <div className="skeleton w-6 h-6 rounded-full" />
                  <div className="skeleton w-6 h-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Messages rail — mirrors the Messages tab's conversation list */}
          <div className="-mx-4 px-4 flex gap-2 overflow-x-auto pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Messages entry point — jumps to the Messages tab */}
            <button
              type="button"
              onClick={onOpenMessages}
              aria-label={railConvoCount > 0
                ? `Messages, ${railConvoCount} conversation${railConvoCount === 1 ? '' : 's'}`
                : 'Messages'}
              className="w-[72px] flex-shrink-0 flex flex-col items-center gap-1 active:opacity-70"
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-fill-2 flex items-center justify-center">
                  <PlaneIcon className="w-7 h-7 text-ink-2" />
                </div>
                {railConvoCount > 0 && (
                  <span
                    className="absolute bottom-0 right-0 min-w-[20px] h-5 px-1 rounded-full bg-primary ring-2 ring-surface flex items-center justify-center text-[10px] font-bold text-white"
                    aria-hidden="true"
                  >
                    {railConvoCount > 9 ? '9+' : railConvoCount}
                  </span>
                )}
              </div>
              <span className="text-caption text-ink text-center truncate w-16">Messages</span>
            </button>
            {railConversations.map(({ convo, person }) => (
              <button
                key={convo.roomId}
                type="button"
                onClick={() => onOpenDm(person)}
                aria-label={`Open conversation with ${person.name ?? 'attendee'}`}
                className="w-[72px] flex-shrink-0 flex flex-col items-center gap-1 active:opacity-70"
              >
                <GradientRingAvatar person={person} sizeClass="w-16 h-16" outerPad="p-[2.5px]" innerPad="p-[2px]" textClass="text-lg" />
                <span className="text-caption text-ink text-center truncate w-16">
                  {(person.name ?? 'Unknown').split(' ')[0]}
                </span>
              </button>
            ))}
          </div>

          {/* Posts */}
          {feedDisplay.length === 0 ? (
            <div className="empty-state">
              <div className="w-16 h-16 rounded-full border-2 border-ink flex items-center justify-center">
                <svg className="w-8 h-8 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-headline text-ink">Be the first to share</p>
              <p className="text-footnote text-ink-3">Posts here are visible to everyone at WBR.</p>
              <button type="button" onClick={openComposer} className="btn-primary btn-sm mt-1">
                Create post
              </button>
            </div>
          ) : (
            <div className="-mx-4">
              {feedDisplay.map((msg, idx) => {
                const senderId = msg.sender.id ?? msg.senderId
                const isMe = senderId === currentUserId
                const isTemp = msg.id.startsWith('temp-')
                const friendStatus: FriendStatus = friendState[senderId] ?? 'none'
                const saved = savedIds.has(msg.id)
                const caption = [msg.sender.company, msg.sender.jobTitle].filter(Boolean).join(' · ')
                const name = msg.sender.name ?? (isMe ? 'You' : 'Unknown')
                return (
                  <article
                    key={msg.id}
                    data-testid="feed-post"
                    className={`bg-surface border-b border-hairline ${idx === 0 ? 'border-t' : ''} ${isTemp ? 'opacity-60' : ''}`}
                  >
                    {/* Post header */}
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      {isMe ? (
                        <GradientRingAvatar person={msg.sender} sizeClass="w-9 h-9" outerPad="p-[2px]" innerPad="p-[1.5px]" textClass="text-xs" />
                      ) : (
                        <Link href={`/people/${senderId}`} className="active:opacity-70 flex-shrink-0" aria-label={`View ${name}'s profile`}>
                          <GradientRingAvatar person={msg.sender} sizeClass="w-9 h-9" outerPad="p-[2px]" innerPad="p-[1.5px]" textClass="text-xs" />
                        </Link>
                      )}
                      <div className="flex-1 min-w-0">
                        {isMe ? (
                          <span className="block text-sm font-semibold text-ink truncate">{name}</span>
                        ) : (
                          <Link href={`/people/${senderId}`} className="block text-sm font-semibold text-ink truncate active:opacity-70">
                            {name}
                          </Link>
                        )}
                        {caption && <p className="text-footnote text-ink-3 truncate">{caption}</p>}
                      </div>
                      {!isMe && (
                        <>
                          <button
                            type="button"
                            onClick={e => onFriendAction(senderId, e)}
                            disabled={pendingFriend || friendStatus === 'friends'}
                            aria-disabled={friendStatus === 'friends' || undefined}
                            aria-label={friendAriaLabel(friendStatus, name)}
                            className={`flex-shrink-0 text-sm font-semibold px-2 py-3 -my-3 transition-opacity ${
                              friendStatus === 'friends'
                                // Terminal state: calm secondary label, full opacity even
                                // though disabled — it's a state, not a broken control.
                                ? 'text-ink-3'
                                : friendStatus === 'pending_outgoing'
                                  ? 'text-ink-3 active:opacity-70 disabled:opacity-50'
                                  : 'text-primary active:opacity-70 disabled:opacity-50'
                            }`}
                          >
                            {FRIEND_BUTTON_LABEL[friendStatus]}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOptionsFor(msg)}
                            aria-label="More options"
                            className="flex-shrink-0 p-2.5 -my-2.5 -mr-2.5 text-ink active:opacity-70"
                          >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                              <circle cx="5" cy="12" r="1.6" />
                              <circle cx="12" cy="12" r="1.6" />
                              <circle cx="19" cy="12" r="1.6" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Image */}
                    {msg.imageUrl && (
                      <img
                        src={msg.imageUrl}
                        alt=""
                        loading="lazy"
                        className="w-full max-h-[520px] object-cover bg-fill"
                      />
                    )}

                    {/* Caption — no author prefix; the name already leads the post header */}
                    {msg.content && (
                      <p className="px-4 pt-1 text-subhead text-ink whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    )}

                    {/* Action row — below the message text */}
                    <div className="flex items-center px-3 py-1.5">
                      <button
                        type="button"
                        data-testid="like-button"
                        onClick={() => toggleLike(msg)}
                        disabled={isTemp}
                        aria-label={msg.likedByMe ? 'Unlike' : 'Like'}
                        aria-pressed={msg.likedByMe}
                        className="group flex items-center gap-1.5 p-2.5 disabled:opacity-40"
                      >
                        <HeartIcon
                          filled={msg.likedByMe}
                          className={`w-6 h-6 transition-transform group-active:scale-90 ${msg.likedByMe ? 'text-danger' : 'text-ink'}`}
                        />
                        {msg.likeCount > 0 && (
                          <span data-testid="like-count" className="text-sm font-semibold text-ink">{msg.likeCount}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        data-testid="comment-button"
                        onClick={() => openComments(msg.id)}
                        disabled={isTemp}
                        aria-label="Comments"
                        className="group flex items-center gap-1.5 p-2.5 disabled:opacity-40"
                      >
                        <CommentIcon className="w-6 h-6 text-ink transition-transform group-active:scale-90" />
                        {msg.commentCount > 0 && (
                          <span className="text-sm font-semibold text-ink">{msg.commentCount}</span>
                        )}
                      </button>
                      {!isMe && (
                        <button
                          type="button"
                          onClick={() => onOpenDm(personFromSender(msg))}
                          aria-label="Send as message"
                          className="group p-2.5"
                        >
                          <PlaneIcon className="w-6 h-6 text-ink transition-transform group-active:scale-90" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleSaved(msg.id)}
                        aria-label={saved ? 'Remove from saved' : 'Save'}
                        aria-pressed={saved}
                        className="group p-2.5 ml-auto"
                      >
                        <BookmarkIcon filled={saved} className="w-6 h-6 text-ink transition-transform group-active:scale-90" />
                      </button>
                    </div>

                    {msg.commentCount > 0 && !isTemp && (
                      <button
                        type="button"
                        onClick={() => openComments(msg.id)}
                        className="block px-4 pt-1.5 pb-1 -mb-1 text-sm text-ink-3 active:opacity-70"
                      >
                        {msg.commentCount === 1 ? 'View 1 comment' : `View all ${msg.commentCount} comments`}
                      </button>
                    )}
                    <p className="px-4 pb-3 pt-0.5 text-caption text-ink-3">{feedTimeAgo(msg.createdAt)}</p>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Composer bottom sheet ── */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:px-5"
          onClick={closeComposer}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            data-testid="composer-sheet"
            className="relative w-full max-w-sm bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="pt-2.5 pb-1">
              <div className="w-9 h-1 rounded-full bg-fill-2 mx-auto" />
            </div>
            <div className="flex items-center justify-between px-3 py-1">
              <button type="button" onClick={closeComposer} className="btn-ghost btn-sm">
                Cancel
              </button>
              <h2 className="text-headline text-ink">New post</h2>
              <button
                type="button"
                onClick={sendPost}
                disabled={(!composerText.trim() && !stagedImage) || sending}
                className="btn-primary btn-sm"
              >
                {sending ? 'Sharing…' : 'Share'}
              </button>
            </div>
            <div className="flex items-center gap-3 px-4 pt-3 pb-1">
              <AvatarCircle person={me} sizeClass="w-9 h-9" textClass="text-xs" />
              <span className="text-sm font-semibold text-ink truncate">{me?.name ?? 'You'}</span>
            </div>
            <div className="px-4 pt-1">
              <textarea
                value={composerText}
                onChange={e => setComposerText(e.target.value)}
                placeholder="Share something with everyone at WBR…"
                maxLength={5000}
                rows={4}
                className="w-full text-body text-ink placeholder:text-ink-3 focus:outline-none resize-none bg-transparent"
              />
            </div>
            <div className="px-4 pb-3">
              {stagedImage ? (
                <div className="relative">
                  <img src={stagedImage} alt="" className="rounded-xl max-h-64 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setStagedImage(null)}
                    aria-label="Remove photo"
                    className="absolute top-0 right-0 p-2 active:opacity-70"
                  >
                    <span className="w-7 h-7 rounded-full bg-ink/60 flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full min-h-[44px] py-4 border border-dashed border-hairline rounded-xl flex items-center justify-center gap-2 text-ink-2 active:bg-fill transition-colors"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-footnote font-medium">Add photo</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              {composerError && <p className="text-danger text-footnote mt-2">{composerError}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Comments bottom sheet ── */}
      {commentsFor && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:px-5"
          onClick={() => setCommentsFor(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            data-testid="comments-sheet"
            className="relative w-full max-w-sm bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
            style={{ height: '70dvh', maxHeight: 'calc(100dvh - 60px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="pt-2.5 pb-1 flex-shrink-0">
              <div className="w-9 h-1 rounded-full bg-fill-2 mx-auto" />
            </div>
            <div className="relative flex items-center justify-center px-4 py-2 border-b border-hairline flex-shrink-0">
              <h2 className="text-headline text-ink">Comments</h2>
              <button
                type="button"
                onClick={() => setCommentsFor(null)}
                aria-label="Close comments"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 text-ink-2 active:opacity-70"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {commentsLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex items-center justify-center h-full px-6 text-center">
                  <p className="text-sm text-ink-3">No comments yet — start the conversation.</p>
                </div>
              ) : (
                comments.map(c => (
                  <div key={c.id} className={`flex items-start gap-3 px-4 py-2 ${c.id.startsWith('temp-') ? 'opacity-60' : ''}`}>
                    <AvatarCircle person={c.user} sizeClass="w-7 h-7" textClass="text-[10px]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink break-words">
                        <span className="font-semibold">{c.user.name ?? 'Unknown'}</span>{' '}
                        {c.content}
                      </p>
                      <p className="text-caption text-ink-3 mt-0.5">{timeAgoShort(c.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              className="flex items-center gap-2 px-3 py-3 border-t border-hairline flex-shrink-0"
              style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
            >
              <AvatarCircle person={me} sizeClass="w-8 h-8" textClass="text-[11px]" />
              <input
                value={commentInput}
                onChange={e => setCommentInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment() } }}
                placeholder="Add a comment…"
                className="flex-1 bg-fill rounded-full px-4 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={sendComment}
                disabled={!commentInput.trim() || commentSending}
                className="text-primary font-semibold text-sm px-2 min-h-[44px] disabled:opacity-40"
              >
                Post
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Post options bottom sheet (••• on others' posts) ── */}
      {optionsFor && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:px-5"
          onClick={() => setOptionsFor(null)}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm bg-surface rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
            style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="pt-2.5 pb-1">
              <div className="w-9 h-1 rounded-full bg-fill-2 mx-auto" />
            </div>
            <button
              type="button"
              onClick={() => {
                const p = personFromSender(optionsFor)
                setOptionsFor(null)
                router.push(`/people/${p.id}`)
              }}
              className="w-full min-h-[52px] text-subhead font-medium text-ink border-b border-hairline active:bg-fill transition-colors"
            >
              View profile
            </button>
            <button
              type="button"
              onClick={() => {
                const p = personFromSender(optionsFor)
                setOptionsFor(null)
                onOpenDm(p)
              }}
              className="w-full min-h-[52px] text-subhead font-medium text-ink border-b border-hairline active:bg-fill transition-colors"
            >
              Message
            </button>
            <button
              type="button"
              onClick={() => setOptionsFor(null)}
              className="w-full min-h-[52px] text-subhead font-semibold text-ink active:bg-fill transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
