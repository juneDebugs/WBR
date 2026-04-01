'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'

interface FeedPost {
  id: string
  content: string
  createdAt: string
  author: { id: string; name: string | null; image: string | null; company: string | null; jobTitle: string | null }
  likes: { userId: string }[]
  _count: { likes: number }
}

export function FeedClient({ currentUserId, currentUserName }: { currentUserId: string; currentUserName: string }) {
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [input, setInput] = useState('')
  const [posting, setPosting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [likeState, setLikeState] = useState<Record<string, boolean>>({})
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/posts')
      if (res.ok) {
        const data: FeedPost[] = await res.json()
        setPosts(data)
        const likes: Record<string, boolean> = {}
        const counts: Record<string, number> = {}
        data.forEach(p => {
          likes[p.id] = p.likes.some(l => l.userId === currentUserId)
          counts[p.id] = p._count.likes
        })
        setLikeState(prev => ({ ...likes, ...prev }))
        setLikeCounts(prev => ({ ...counts, ...prev }))
      }
    } finally {
      setLoading(false)
    }
  }, [currentUserId])

  useEffect(() => {
    loadFeed()
    const interval = setInterval(loadFeed, 15000)
    return () => clearInterval(interval)
  }, [loadFeed])

  async function submitPost(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || posting) return
    setPosting(true)
    const content = input.trim()
    setInput('')

    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      const newPost: FeedPost = await res.json()
      setPosts(prev => [newPost, ...prev])
      setLikeState(prev => ({ ...prev, [newPost.id]: false }))
      setLikeCounts(prev => ({ ...prev, [newPost.id]: 0 }))
    }
    setPosting(false)
  }

  async function toggleLike(postId: string) {
    const wasLiked = likeState[postId] ?? false
    setLikeState(prev => ({ ...prev, [postId]: !wasLiked }))
    setLikeCounts(prev => ({ ...prev, [postId]: (prev[postId] ?? 0) + (wasLiked ? -1 : 1) }))

    await fetch(`/api/posts/${postId}/like`, { method: 'POST' })
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white px-4 pt-12 pb-3 border-b border-gray-100 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-900">Feed</h1>
      </div>

      {/* Compose box */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <form onSubmit={submitPost} className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
            <span className="text-primary font-bold text-sm">{(currentUserName || '?')[0]}</span>
          </div>
          <div className="flex-1">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="What's happening at the conference?"
              rows={2}
              className="w-full text-sm text-gray-900 placeholder-gray-400 resize-none focus:outline-none bg-transparent"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${input.length > 280 ? 'text-red-500' : 'text-gray-400'}`}>
                {input.length}/280
              </span>
              <button
                type="submit"
                disabled={!input.trim() || posting || input.length > 280}
                className="bg-primary text-white text-sm font-semibold px-4 py-1.5 rounded-full disabled:opacity-40 active:scale-95 transition-transform"
              >
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Posts */}
      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading feed…</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
          <p className="font-semibold text-gray-900">No posts yet</p>
          <p className="text-sm text-gray-500 mt-1">Follow people or be the first to post!</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 bg-white">
          {posts.map(post => {
            const liked = likeState[post.id] ?? false
            const count = likeCounts[post.id] ?? 0
            const isMe = post.author.id === currentUserId

            return (
              <div key={post.id} className="px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    {post.author.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.author.image} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <span className="text-primary font-bold">{(post.author.name ?? '?')[0]}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-gray-900 text-sm">
                        {isMe ? 'You' : post.author.name}
                      </span>
                      {post.author.company && (
                        <span className="text-xs text-gray-400">{post.author.company}</span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">
                        {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">{post.content}</p>

                    {/* Actions */}
                    <div className="flex items-center gap-5 mt-3">
                      <button
                        onClick={() => toggleLike(post.id)}
                        className="flex items-center gap-1.5 text-gray-400 active:scale-90 transition-transform"
                      >
                        <svg className={`w-5 h-5 transition-colors ${liked ? 'text-red-500 fill-red-500' : ''}`}
                          fill={liked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        {count > 0 && <span className={`text-xs font-medium ${liked ? 'text-red-500' : 'text-gray-400'}`}>{count}</span>}
                      </button>

                      <button className="flex items-center gap-1.5 text-gray-400">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
