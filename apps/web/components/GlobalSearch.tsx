'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

import { useRouter } from 'next/navigation'

interface SearchResult {
  entityType: string
  entityId: string
  title: string
  subtitle: string | null
  image: string | null
  href: string
  score: number
}

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  speaker: { label: 'Speaker', color: '#7c3aed', bg: '#ede9fe' },
  user:    { label: 'Attendee', color: '#0891b2', bg: '#cffafe' },
  session: { label: 'Session', color: '#2563eb', bg: '#dbeafe' },
  sponsor: { label: 'Sponsor', color: '#d97706', bg: '#fef3c7' },
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const router = useRouter()

  // Cmd+K shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50) }
    else { setQuery(''); setResults([]) }
  }, [open])

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results ?? [])
      setSelected(0)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(query), 350)
    return () => clearTimeout(debounceRef.current)
  }, [query, search])

  function navigate(r: SearchResult) {
    router.push(r.href)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && results[selected]) navigate(results[selected])
  }

  return (
    <>
      {/* Trigger — looks like a real search bar */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-64 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-400 text-sm transition-colors text-left"
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="flex-1 hidden sm:inline">Search…</span>
        <kbd className="hidden sm:inline text-[10px] font-mono bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-400">⌘K</kbd>
      </button>

      {!open ? null : (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
              {loading ? (
                <svg className="w-4 h-4 text-primary animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search speakers, sessions, attendees, sponsors…"
                className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
              />
              {query && (
                <button onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }} className="text-gray-300 hover:text-gray-500">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              <kbd className="text-[10px] font-mono bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 text-gray-400 flex-shrink-0">Esc</kbd>
            </div>

            {/* Results */}
            {results.length > 0 && (
              <ul className="py-2 max-h-96 overflow-y-auto">
                {results.map((r, i) => {
                  const meta = TYPE_META[r.entityType] ?? { label: r.entityType, color: '#6b7280', bg: '#f3f4f6' }
                  return (
                    <li key={`${r.entityType}-${r.entityId}`}>
                      <button
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === selected ? 'bg-primary/5' : 'hover:bg-gray-50'}`}
                        onClick={() => navigate(r)}
                        onMouseEnter={() => setSelected(i)}
                      >
                        {/* Avatar / icon */}
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center bg-gray-100">
                          {r.image ? (
                            <img src={r.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-gray-500">{r.title?.[0] ?? '?'}</span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{r.title}</p>
                          {r.subtitle && <p className="text-xs text-gray-400 truncate">{r.subtitle}</p>}
                        </div>

                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {query && !loading && results.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">No results for "{query}"</div>
            )}

            {!query && (
              <div className="py-6 text-center text-sm text-gray-400">
                Ask anything — "find AI speakers", "who is looking for investors"…
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <kbd className="font-mono bg-white border border-gray-200 rounded px-1">↑↓</kbd> navigate
              </div>
              <div className="flex items-center gap-1 text-[10px] text-gray-400">
                <kbd className="font-mono bg-white border border-gray-200 rounded px-1">↵</kbd> open
              </div>
              <div className="ml-auto flex items-center gap-1 text-[10px] text-gray-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />
                AI semantic search
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
