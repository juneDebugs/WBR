'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'

function parsePhotoPos(pos: string | null | undefined) {
  const parts = (pos ?? '50% 50%').trim().split(/\s+/)
  return {
    position: `${parts[0] ?? '50%'} ${parts[1] ?? '50%'}`,
    scale: parts.length >= 3 ? parseFloat(parts[2]) || 1 : 1,
  }
}

/** Optimize remote image URLs for the requested display size */
function optimizeUrl(url: string, size: number): string {
  if (!url || url.startsWith('data:')) return url
  // Unsplash: rewrite to requested width + quality
  if (url.includes('images.unsplash.com')) {
    const base = url.split('?')[0]
    return `${base}?w=${size}&q=60&fit=crop&crop=face&auto=format`
  }
  return url
}

type ConfSessionInfo = {
  id: string
  title: string
  description: string | null
  startsAt: string
  track: string | null
  type: string
}

type Speaker = {
  id: string
  name: string
  photoUrl: string | null
  photoPosition?: string | null
  jobTitle: string | null
  company: string | null
  bio?: string | null
  twitterHandle?: string | null
  linkedinUrl?: string | null
  confSessions?: ConfSessionInfo[]
  _count: { confSessions: number }
}

function getProfileCompletion(s: Speaker): { pct: number; missing: string[] } {
  const fields: [string, boolean][] = [
    ['Photo', !!s.photoUrl],
    ['Bio', !!s.bio?.trim()],
    ['Company', !!s.company?.trim()],
    ['Title', !!s.jobTitle?.trim()],
    ['Social', !!(s.twitterHandle?.trim() || s.linkedinUrl?.trim())],
  ]
  const filled = fields.filter(([, ok]) => ok).length
  return { pct: Math.round((filled / fields.length) * 100), missing: fields.filter(([, ok]) => !ok).map(([n]) => n) }
}

function completionColor(pct: number): { bar: string; text: string } {
  if (pct === 100) return { bar: 'bg-success', text: 'text-success-ink' }
  if (pct >= 80) return { bar: 'bg-info', text: 'text-info-ink' }
  if (pct >= 50) return { bar: 'bg-warning', text: 'text-warning-ink' }
  if (pct >= 30) return { bar: 'bg-warning', text: 'text-warning-ink' }
  return { bar: 'bg-danger', text: 'text-danger-ink' }
}

function getSessionOutlineStatus(s: Speaker): 'complete' | 'partial' | 'missing' | 'none' {
  const sessions = s.confSessions ?? []
  if (sessions.length === 0) return 'none'
  const withDesc = sessions.filter(sess => sess.description?.trim())
  if (withDesc.length === sessions.length) return 'complete'
  if (withDesc.length > 0) return 'partial'
  return 'missing'
}

type SortKey = 'name' | 'company' | 'completion' | 'sessions'
type SortDir = 'asc' | 'desc'

type SpeakerForm = {
  name: string
  company: string
  jobTitle: string
  bio: string
  photoUrl: string
  photoPosition: string
  photoScale: number
  twitterHandle: string
  linkedinUrl: string
}

export default function SpeakersClient({ initialSpeakers = [] }: { initialSpeakers?: Speaker[] }) {
  const { data, isLoading } = useQuery({
    queryKey: ['speakers'],
    queryFn: () => fetch('/api/data/speakers').then(r => r.json()),
    staleTime: 60_000,
    initialData: initialSpeakers.length > 0 ? initialSpeakers : undefined,
  })
  const [localUpdates, setLocalUpdates] = useState<Speaker[] | null>(null)

  // Use local updates (from edit/delete) if available, otherwise use React Query data or initial SSR data
  const speakers = localUpdates ?? (data && Array.isArray(data) ? data : initialSpeakers)

  const [editingSpeaker, setEditingSpeaker] = useState<Speaker | null>(null)
  const [form, setForm] = useState<SpeakerForm>({
    name: '', company: '', jobTitle: '', bio: '', photoUrl: '', photoPosition: '50% 50%', photoScale: 1, twitterHandle: '', linkedinUrl: '',
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [repositioning, setRepositioning] = useState(false)
  const [reposSavedPosition, setReposSavedPosition] = useState('50% 50%')
  const [reposSavedScale, setReposSavedScale] = useState(1)
  const [visible, setVisible] = useState(false)
  const [photoPreview, setPhotoPreview] = useState<'profile' | 'card' | 'detail'>('profile')
  const fileRef = useRef<HTMLInputElement>(null)
  const reposContainerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  function openEdit(speaker: Speaker) {
    setEditingSpeaker(speaker)
    const { position, scale } = parsePhotoPos(speaker.photoPosition)
    setForm({
      name: speaker.name,
      company: speaker.company ?? '',
      jobTitle: speaker.jobTitle ?? '',
      bio: speaker.bio ?? '',
      photoUrl: speaker.photoUrl ?? '',
      photoPosition: position,
      photoScale: scale,
      twitterHandle: speaker.twitterHandle ?? '',
      linkedinUrl: speaker.linkedinUrl ?? '',
    })
    setError('')
    setRepositioning(false)
    // Trigger animation
    requestAnimationFrame(() => setVisible(true))
  }

  function closeEdit() {
    setVisible(false)
    setTimeout(() => {
      setEditingSpeaker(null)
      setError('')
      setRepositioning(false)
    }, 250)
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && editingSpeaker) closeEdit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingSpeaker])

  function compressImage(file: File, maxWidth: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const scale = Math.min(1, maxWidth / img.width)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = url
    })
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5MB')
      return
    }
    setUploading(true)
    setError('')
    compressImage(file, 400, 0.65)
      .then(dataUrl => {
        setForm(f => ({ ...f, photoUrl: dataUrl, photoPosition: '50% 50%', photoScale: 1 }))
        setUploading(false)
      })
      .catch(() => {
        setError('Failed to read file')
        setUploading(false)
      })
    e.target.value = ''
  }

  const handleReposMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
  }, [])

  const handleReposMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current || !reposContainerRef.current) return
    const rect = reposContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))
    setForm(f => ({ ...f, photoPosition: `${Math.round(x)}% ${Math.round(y)}%` }))
  }, [])

  const handleReposMouseUp = useCallback(() => {
    isDragging.current = false
  }, [])

  const handleReposTouchMove = useCallback((e: React.TouchEvent) => {
    if (!reposContainerRef.current) return
    const touch = e.touches[0]
    const rect = reposContainerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((touch.clientX - rect.left) / rect.width) * 100))
    const y = Math.max(0, Math.min(100, ((touch.clientY - rect.top) / rect.height) * 100))
    setForm(f => ({ ...f, photoPosition: `${Math.round(x)}% ${Math.round(y)}%` }))
  }, [])

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    setForm(f => ({
      ...f,
      photoScale: Math.round(Math.max(1, Math.min(3, f.photoScale - e.deltaY * 0.003)) * 100) / 100,
    }))
  }, [])

  // Attach wheel listener to reposition container (needs { passive: false } to preventDefault)
  useEffect(() => {
    const el = reposContainerRef.current
    if (!repositioning || !el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [repositioning, handleWheel])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editingSpeaker) return
    setSaving(true)
    setError('')
    try {
      // Only send photoUrl if it actually changed (avoids re-sending large base64 strings)
      const photoChanged = form.photoUrl !== (editingSpeaker.photoUrl ?? '')
      const payload: Record<string, string> = {
        name: form.name,
        company: form.company,
        jobTitle: form.jobTitle,
        bio: form.bio,
        photoPosition: form.photoScale !== 1 ? `${form.photoPosition} ${form.photoScale}` : form.photoPosition,
        twitterHandle: form.twitterHandle,
        linkedinUrl: form.linkedinUrl,
      }
      if (photoChanged) {
        payload.photoUrl = form.photoUrl
      }

      const res = await fetch(`/api/speakers/${editingSpeaker.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      let data: any
      try {
        data = await res.json()
      } catch {
        throw new Error(res.ok ? 'Unexpected server response' : `Server error (${res.status})`)
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save')
      }

      setLocalUpdates(speakers.map(s => s.id === editingSpeaker.id ? { ...s, ...updated(data, photoChanged) } : s))
      closeEdit()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function updated(data: any, photoChanged: boolean) {
    // If photo wasn't sent, preserve the current form value in local state
    return photoChanged ? data : { ...data, photoUrl: form.photoUrl }
  }

  async function handleDelete() {
    if (!editingSpeaker) return
    if (!confirm('Delete this speaker? This cannot be undone.')) return
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/speakers/${editingSpeaker.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete')
      }
      setLocalUpdates(speakers.filter(s => s.id !== editingSpeaker.id))
      closeEdit()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  // iOS-style grouped input
  const iosInput = 'w-full bg-transparent text-subhead text-ink placeholder:text-ink-3 outline-none'

  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })

  const filtered = speakers.filter((s: Speaker) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q)
      || (s.company ?? '').toLowerCase().includes(q)
      || (s.jobTitle ?? '').toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    switch (sort.key) {
      case 'name': return dir * a.name.localeCompare(b.name)
      case 'company': return dir * (a.company ?? '').localeCompare(b.company ?? '')
      case 'completion': return dir * (getProfileCompletion(a).pct - getProfileCompletion(b).pct)
      case 'sessions': return dir * (a._count.confSessions - b._count.confSessions)
      default: return 0
    }
  })

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sort.key !== col) return <svg className="w-3.5 h-3.5 text-ink-3 ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" /></svg>
    return <svg className="w-3.5 h-3.5 text-primary ml-1" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d={sort.dir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} /></svg>
  }

  // Stats for header
  const totalSpeakers = speakers.length
  const avgCompletion = totalSpeakers > 0 ? Math.round(speakers.reduce((sum: number, s: Speaker) => sum + getProfileCompletion(s).pct, 0) / totalSpeakers) : 0
  const totalSessions = speakers.reduce((sum: number, s: Speaker) => sum + s._count.confSessions, 0)
  const outlineComplete = speakers.filter((s: Speaker) => getSessionOutlineStatus(s) === 'complete').length
  const speakersWithSessions = speakers.filter((s: Speaker) => s._count.confSessions > 0).length

  if (isLoading && speakers.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-fill-2 rounded-lg animate-pulse" />
          <div className="h-9 w-32 bg-fill-2 rounded-xl animate-pulse" />
        </div>
        <div className="h-10 bg-fill-2/60 rounded-xl animate-pulse" />
        <div className="bg-white rounded-2xl overflow-hidden ring-1 ring-black/[0.04]">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-hairline last:border-b-0 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-fill flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-fill rounded" />
                <div className="h-3 w-24 bg-fill/60 rounded" />
              </div>
              <div className="h-3 w-20 bg-fill rounded" />
              <div className="h-3 w-16 bg-fill rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-5">
        <p className="text-footnote text-ink-2 font-medium">{totalSpeakers} speaker{totalSpeakers !== 1 ? 's' : ''}</p>
        <Link
          href="/dashboard/speakers/new"
          className="btn-primary btn-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Speaker
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-2xl px-4 py-3 ring-1 ring-black/[0.04]">
          <p className="text-caption font-medium text-ink-2 uppercase tracking-wider">Avg Profile</p>
          <p className="text-title2 font-bold text-ink mt-0.5">{avgCompletion}%</p>
        </div>
        <div className="bg-white rounded-2xl px-4 py-3 ring-1 ring-black/[0.04]">
          <p className="text-caption font-medium text-ink-2 uppercase tracking-wider">Sessions</p>
          <p className="text-title2 font-bold text-ink mt-0.5">{totalSessions}</p>
        </div>
        <div className="bg-white rounded-2xl px-4 py-3 ring-1 ring-black/[0.04]">
          <p className="text-caption font-medium text-ink-2 uppercase tracking-wider">Assigned</p>
          <p className="text-title2 font-bold text-ink mt-0.5">{speakersWithSessions}<span className="text-footnote font-normal text-ink-2">/{totalSpeakers}</span></p>
        </div>
        <div className="bg-white rounded-2xl px-4 py-3 ring-1 ring-black/[0.04]">
          <p className="text-caption font-medium text-ink-2 uppercase tracking-wider">Outlines Done</p>
          <p className="text-title2 font-bold text-ink mt-0.5">{outlineComplete}<span className="text-footnote font-normal text-ink-2">/{speakersWithSessions}</span></p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-2" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search speakers..."
          className="w-full pl-9 pr-4 py-2.5 bg-white/80 backdrop-blur-sm rounded-xl text-subhead text-ink placeholder:text-ink-3 outline-none ring-1 ring-black/[0.04] focus:ring-primary/40 focus:ring-2 transition-shadow"
        />
        {search && (
          <button aria-label="Clear search" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-fill-2 flex items-center justify-center hover:bg-hairline transition-colors">
            <svg className="w-3 h-3 text-ink-2" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Speaker table */}
      {sorted.length > 0 ? (
        <div className="bg-white rounded-2xl overflow-hidden ring-1 ring-black/[0.04] overflow-x-auto">
          {/* Table header */}
          <div className="hidden lg:grid grid-cols-[minmax(180px,1fr)_200px_70px_90px_90px_50px] items-center px-5 py-2.5 bg-fill/80 border-b border-hairline text-caption font-semibold text-ink-2 uppercase tracking-wider min-w-[740px]">
            <button onClick={() => toggleSort('name')} className="flex items-center text-left hover:text-ink-2 transition-colors">
              Speaker <SortIcon col="name" />
            </button>
            <button onClick={() => toggleSort('completion')} className="flex items-center justify-center hover:text-ink-2 transition-colors">
              Profile <SortIcon col="completion" />
            </button>
            <button onClick={() => toggleSort('sessions')} className="flex items-center justify-center hover:text-ink-2 transition-colors">
              Sessions <SortIcon col="sessions" />
            </button>
            <div className="text-center">Track</div>
            <div className="text-center">Outline</div>
            <div className="text-center">Social</div>
          </div>

          {/* Rows */}
          {sorted.map((speaker, idx) => {
            const pp = parsePhotoPos(speaker.photoPosition)
            const profile = getProfileCompletion(speaker)
            const outline = getSessionOutlineStatus(speaker)
            const sessions = speaker.confSessions ?? []
            const tracks = Array.from(new Set(sessions.map((s: ConfSessionInfo) => s.track).filter((t: string | null): t is string => !!t)))
            const sessionTypes = Array.from(new Set(sessions.map((s: ConfSessionInfo) => s.type)))
            const hasTwitter = !!speaker.twitterHandle?.trim()
            const hasLinkedin = !!speaker.linkedinUrl?.trim()
            return (
              <button
                key={speaker.id}
                onClick={() => openEdit(speaker)}
                className="w-full grid grid-cols-1 lg:grid-cols-[minmax(180px,1fr)_200px_70px_90px_90px_50px] items-center px-5 py-3 border-b border-hairline last:border-b-0 hover:bg-primary/[0.03] active:bg-primary/[0.06] transition-colors text-left cursor-pointer group min-w-[700px]"
              >
                {/* Speaker info */}
                <div className="flex items-center gap-3.5 min-w-0">
                  {speaker.photoUrl ? (
                    <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-fill ring-1 ring-black/[0.06]">
                      <img
                        src={optimizeUrl(speaker.photoUrl!, 72)}
                        alt={speaker.name}
                        width={36}
                        height={36}
                        loading={idx < 20 ? 'eager' : 'lazy'}
                        decoding="async"
                        className="w-full h-full object-cover"
                        style={{
                          objectPosition: pp.position,
                          ...(pp.scale !== 1 && { transform: `scale(${pp.scale})`, transformOrigin: pp.position }),
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-fill flex items-center justify-center flex-shrink-0 ring-1 ring-black/[0.04]">
                      <span className="text-ink-2 font-semibold text-sm">{speaker.name[0]}</span>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-footnote font-semibold text-ink leading-snug truncate group-hover:text-primary transition-colors">{speaker.name}</p>
                      {sessionTypes.includes('KEYNOTE') && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-warning-soft text-[9px] font-bold text-warning-ink uppercase tracking-wide">Keynote</span>
                      )}
                    </div>
                    <p className="text-caption text-ink-2 leading-tight truncate">
                      {[speaker.jobTitle, speaker.company].filter(Boolean).join(' · ') || 'No details'}
                    </p>
                  </div>
                </div>

                {/* Profile completion */}
                <div className="hidden lg:flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2.5 w-full max-w-[200px]">
                    <div className="flex-1 h-2.5 bg-fill rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${completionColor(profile.pct).bar}`}
                        style={{ width: `${profile.pct}%` }}
                      />
                    </div>
                    <span className={`text-caption font-semibold tabular-nums ${completionColor(profile.pct).text}`}>{profile.pct}%</span>
                  </div>
                  {profile.missing.length > 0 && profile.missing.length <= 4 && (
                    <p className="text-[9px] text-ink-2 leading-none truncate max-w-[200px]">{profile.missing.join(', ')}</p>
                  )}
                </div>

                {/* Sessions */}
                <div className="hidden lg:flex justify-center">
                  {speaker._count.confSessions > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-caption font-medium text-brand-700">
                      {speaker._count.confSessions}
                    </span>
                  ) : (
                    <span className="text-caption text-ink-3">--</span>
                  )}
                </div>

                {/* Track */}
                <div className="hidden lg:flex justify-center">
                  {tracks.length > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-brand-50 text-caption font-medium text-brand-700 truncate max-w-[90px]">
                      {tracks[0] as string}{tracks.length > 1 ? ` +${tracks.length - 1}` : ''}
                    </span>
                  ) : (
                    <span className="text-caption text-ink-3">--</span>
                  )}
                </div>

                {/* Outline status */}
                <div className="hidden lg:flex justify-center">
                  {outline === 'complete' && (
                    <span className="inline-flex items-center gap-1 text-caption font-medium text-success-ink">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      Done
                    </span>
                  )}
                  {outline === 'partial' && (
                    <span className="inline-flex items-center gap-1 text-caption font-medium text-warning-ink">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" /></svg>
                      Partial
                    </span>
                  )}
                  {outline === 'missing' && (
                    <span className="inline-flex items-center gap-1 text-caption font-medium text-danger-ink">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                      Missing
                    </span>
                  )}
                  {outline === 'none' && (
                    <span className="text-caption text-ink-3">--</span>
                  )}
                </div>

                {/* Social icons */}
                <div className="hidden lg:flex justify-center items-center gap-1.5">
                  {hasTwitter && (
                    <svg className="w-3.5 h-3.5 text-ink-2" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                  )}
                  {hasLinkedin && (
                    <svg className="w-3.5 h-3.5 text-ink-2" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                  )}
                  {!hasTwitter && !hasLinkedin && (
                    <span className="text-caption text-ink-3">--</span>
                  )}
                </div>

                {/* Mobile meta row */}
                <div className="flex lg:hidden items-center gap-3 mt-2 ml-[50px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1.5 bg-fill rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${profile.pct === 100 ? 'bg-success' : profile.pct >= 60 ? 'bg-primary' : 'bg-warning'}`} style={{ width: `${profile.pct}%` }} />
                    </div>
                    <span className="text-caption font-medium text-ink-2">{profile.pct}%</span>
                  </div>
                  {speaker._count.confSessions > 0 && (
                    <span className="text-caption font-medium text-ink-2">{speaker._count.confSessions} session{speaker._count.confSessions !== 1 ? 's' : ''}</span>
                  )}
                  {outline !== 'none' && outline !== 'complete' && (
                    <span className={`text-caption font-medium ${outline === 'missing' ? 'text-danger-ink' : 'text-warning-ink'}`}>Outline {outline}</span>
                  )}
                  {(hasTwitter || hasLinkedin) && (
                    <div className="flex items-center gap-1">
                      {hasTwitter && <svg className="w-3 h-3 text-ink-2" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>}
                      {hasLinkedin && <svg className="w-3 h-3 text-ink-2" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          {search ? (
            <>
              <div className="w-14 h-14 rounded-full bg-fill flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-ink-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              </div>
              <p className="text-subhead font-medium text-ink">No results</p>
              <p className="text-footnote text-ink-2 mt-1">No speakers match &ldquo;{search}&rdquo;</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-fill flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-ink-2" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              </div>
              <p className="text-subhead font-medium text-ink">No speakers yet</p>
              <p className="text-footnote text-ink-2 mt-1">Add your first speaker to get started</p>
            </>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

      {/* iOS-style Edit Speaker Modal */}
      {editingSpeaker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-250"
          style={{
            backgroundColor: visible ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0)',
            backdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
            WebkitBackdropFilter: visible ? 'blur(8px)' : 'blur(0px)',
          }}
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-md max-h-[88vh] flex flex-col transition-all duration-250 bg-fill"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
              borderRadius: '20px',
              boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* iOS-style navigation bar */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
              <button onClick={closeEdit} className="text-primary text-subhead font-normal hover:opacity-70 transition-opacity">
                Cancel
              </button>
              <h2 className="text-headline font-semibold text-ink">Edit Speaker</h2>
              <button
                onClick={handleSave as any}
                disabled={saving || deleting || !form.name.trim()}
                className="text-primary text-subhead font-semibold hover:opacity-70 transition-opacity disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Done'}
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
                {error && (
                  <div className="mx-1 px-4 py-3 rounded-xl bg-danger-soft border border-danger/20 text-danger-ink text-footnote flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Mobile App Photo Section */}
                <div>
                  <p className="text-footnote font-medium text-ink-2 uppercase tracking-wide px-4 mb-1.5">Mobile App Photo</p>
                  {repositioning && form.photoUrl ? (
                    /* LinkedIn-style reposition mode */
                    <div className="bg-ink rounded-2xl overflow-hidden">
                      {/* Segmented control + info banner */}
                      <div className="px-4 pt-3 pb-2">
                        <div className="flex bg-white/10 rounded-lg p-0.5 max-w-[220px] mx-auto">
                          {(['profile', 'card', 'detail'] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setPhotoPreview(mode)}
                              className={`flex-1 py-1 text-caption font-medium rounded-md transition-all ${
                                photoPreview === mode
                                  ? 'bg-white/20 text-white'
                                  : 'text-white/50 hover:text-white/70'
                              }`}
                            >
                              {mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-center gap-2 px-4 py-1.5">
                        <svg className="w-3.5 h-3.5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                        <span className="text-white/60 text-caption">Drag to reposition</span>
                      </div>

                      {/* Reposition area — shape matches selected preview */}
                      <div className="relative flex items-center justify-center py-5 px-5 overflow-hidden">
                        <div
                          ref={reposContainerRef}
                          className={`relative cursor-grab active:cursor-grabbing select-none ${
                            photoPreview === 'profile' ? 'w-48 h-48' :
                            photoPreview === 'card' ? 'w-40 h-52' :
                            'w-[280px] h-[144px]'
                          }`}
                          onMouseDown={handleReposMouseDown}
                          onMouseMove={handleReposMouseMove}
                          onMouseUp={handleReposMouseUp}
                          onMouseLeave={handleReposMouseUp}
                          onTouchStart={() => { isDragging.current = true }}
                          onTouchMove={handleReposTouchMove}
                          onTouchEnd={handleReposMouseUp}
                        >
                          {/* Full image */}
                          <img
                            src={form.photoUrl}
                            alt="Reposition"
                            className={`w-full h-full object-cover pointer-events-none ${
                              photoPreview === 'profile' ? 'rounded-full' :
                              photoPreview === 'card' ? 'rounded-xl' :
                              'rounded-xl'
                            }`}
                            style={{ objectPosition: form.photoPosition, transform: `scale(${form.photoScale})`, transformOrigin: form.photoPosition }}
                            draggable={false}
                          />
                          {/* Semi-transparent overlay */}
                          <div className={`absolute inset-0 pointer-events-none ${
                            photoPreview === 'profile' ? 'rounded-full' :
                            'rounded-xl'
                          }`}
                            style={{ boxShadow: `0 0 0 80px rgba(27,31,35,0.65)` }} />
                          {/* Dashed border */}
                          <div className={`absolute inset-0 border-2 border-dashed border-white/40 pointer-events-none ${
                            photoPreview === 'profile' ? 'rounded-full' :
                            'rounded-xl'
                          }`} />
                          {/* Gradient scrim for detail mode */}
                          {photoPreview === 'detail' && (
                            <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 50%)' }} />
                          )}
                        </div>
                      </div>


                      {/* Zoom slider */}
                      <div className="flex items-center gap-3 px-5 py-2">
                        <svg className="w-4 h-4 text-white/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                        </svg>
                        <input
                          type="range"
                          min="1"
                          max="3"
                          step="0.01"
                          value={form.photoScale}
                          onChange={e => setForm(f => ({ ...f, photoScale: parseFloat(e.target.value) }))}
                          className="flex-1 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                        />
                        <svg className="w-5 h-5 text-white/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                        </svg>
                      </div>

                      {/* Reposition actions */}
                      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => {
                            setForm(f => ({ ...f, photoPosition: reposSavedPosition, photoScale: reposSavedScale }))
                            setRepositioning(false)
                          }}
                          className="px-4 py-1.5 text-footnote font-semibold text-white rounded-full border border-white/30 hover:bg-white/10 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepositioning(false)}
                          className="px-4 py-1.5 text-footnote font-semibold text-white bg-[#0a66c2] rounded-full hover:bg-[#004182] transition-colors"
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal photo card with mobile previews */
                    <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                      <div className="flex flex-col items-center py-5 px-4">
                        {/* Segmented control */}
                        {form.photoUrl && (
                          <div className="flex bg-fill rounded-lg p-0.5 mb-4 w-full max-w-[260px]">
                            {(['profile', 'card', 'detail'] as const).map(mode => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setPhotoPreview(mode)}
                                className={`flex-1 py-1 text-caption font-medium rounded-md transition-all ${
                                  photoPreview === mode
                                    ? 'bg-white text-ink shadow-sm'
                                    : 'text-ink-2 hover:text-ink'
                                }`}
                              >
                                {mode.charAt(0).toUpperCase() + mode.slice(1)}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Preview area */}
                        {form.photoUrl ? (
                          <div className="flex items-center justify-center mb-4">
                            {/* Profile preview — circular avatar */}
                            {photoPreview === 'profile' && (
                              <div className="w-28 h-28 rounded-full overflow-hidden bg-fill ring-1 ring-black/5">
                                <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover"
                                  style={{ objectPosition: form.photoPosition, transform: `scale(${form.photoScale})`, transformOrigin: form.photoPosition }}
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                              </div>
                            )}
                            {/* Card preview — portrait card like mobile grid */}
                            {photoPreview === 'card' && (
                              <div className="w-28 rounded-xl overflow-hidden bg-white ring-1 ring-black/5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
                                <div className="relative w-full overflow-hidden" style={{ paddingBottom: '130%' }}>
                                  <img src={form.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
                                    style={{ objectPosition: form.photoPosition, transform: `scale(${form.photoScale})`, transformOrigin: form.photoPosition }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                </div>
                                <div className="py-2 px-1.5">
                                  <p className="text-[9px] font-bold text-ink leading-tight text-center truncate">{form.name}</p>
                                  {form.jobTitle && <p className="text-[7px] text-ink-2 mt-0.5 text-center truncate">{form.jobTitle}</p>}
                                  {form.company && <p className="text-[7px] font-semibold text-brand mt-0.5 text-center truncate">{form.company}</p>}
                                </div>
                              </div>
                            )}
                            {/* Detail preview — hero banner like mobile detail modal (~1.95:1 on 390px phone) */}
                            {photoPreview === 'detail' && (
                              <div className="w-[280px] rounded-xl overflow-hidden ring-1 ring-black/5" style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
                                <div className="relative w-full overflow-hidden" style={{ paddingBottom: '51.3%' }}>
                                  <img src={form.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover"
                                    style={{ objectPosition: form.photoPosition, transform: `scale(${form.photoScale})`, transformOrigin: form.photoPosition }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                  <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 55%)' }} />
                                  <div className="absolute bottom-0 left-0 right-0 px-3 pb-2.5">
                                    <p className="text-sm font-bold text-white leading-tight truncate">{form.name}</p>
                                    {form.jobTitle && <p className="text-caption text-white/80 mt-0.5 truncate">{form.jobTitle}</p>}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-24 h-24 rounded-full bg-fill-2 flex items-center justify-center mb-4">
                            <span className="text-ink-2 font-bold text-3xl">{form.name?.[0] ?? '?'}</span>
                          </div>
                        )}

                        {/* Action buttons row */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="text-primary text-footnote font-medium hover:opacity-70 transition-opacity"
                          >
                            {uploading ? 'Uploading...' : form.photoUrl ? 'Change Photo' : 'Add Photo'}
                          </button>
                          {form.photoUrl && (
                            <>
                              <span className="text-ink-3 text-xs">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setReposSavedPosition(form.photoPosition)
                                  setReposSavedScale(form.photoScale)
                                  setRepositioning(true)
                                }}
                                className="text-primary text-footnote font-medium hover:opacity-70 transition-opacity"
                              >
                                Reposition
                              </button>
                              <span className="text-ink-3 text-xs">|</span>
                              <button
                                type="button"
                                onClick={() => { setForm(f => ({ ...f, photoUrl: '', photoPosition: '50% 50%', photoScale: 1 })); setRepositioning(false) }}
                                className="text-danger text-footnote font-medium hover:opacity-70 transition-opacity"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>

                        {/* URL input for external images */}
                        {form.photoUrl && !form.photoUrl.startsWith('data:') && !form.photoUrl.startsWith('/api/') && (
                          <div className="w-full mt-3 px-1">
                            <input
                              type="text"
                              value={form.photoUrl}
                              onChange={e => setForm(f => ({ ...f, photoUrl: e.target.value, photoPosition: '50% 50%', photoScale: 1 }))}
                              placeholder="Or paste an image URL..."
                              className="w-full px-3 py-2 bg-fill rounded-lg text-footnote text-ink placeholder:text-ink-3 outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Info Group */}
                <div>
                  <p className="text-footnote font-medium text-ink-2 uppercase tracking-wide px-4 mb-1.5">Info</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    {/* Name */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-subhead text-ink w-20 flex-shrink-0">Name</label>
                      <input type="text" required value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Required"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-hairline" />
                    {/* Company */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-subhead text-ink w-20 flex-shrink-0">Company</label>
                      <input type="text" value={form.company}
                        onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                        placeholder="Optional"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-hairline" />
                    {/* Job Title */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-subhead text-ink w-20 flex-shrink-0">Title</label>
                      <input type="text" value={form.jobTitle}
                        onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                        placeholder="Optional"
                        className={iosInput} />
                    </div>
                  </div>
                </div>

                {/* Bio Group */}
                <div>
                  <p className="text-footnote font-medium text-ink-2 uppercase tracking-wide px-4 mb-1.5">Bio</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    <textarea
                      value={form.bio}
                      onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                      rows={4}
                      placeholder="Write a short bio..."
                      className="w-full px-4 py-3 bg-transparent text-subhead text-ink placeholder:text-ink-3 outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Social Group */}
                <div>
                  <p className="text-footnote font-medium text-ink-2 uppercase tracking-wide px-4 mb-1.5">Social</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-subhead text-ink w-20 flex-shrink-0">X / Twitter</label>
                      <input type="text" value={form.twitterHandle}
                        onChange={e => setForm(f => ({ ...f, twitterHandle: e.target.value }))}
                        placeholder="@handle"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-hairline" />
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-subhead text-ink w-20 flex-shrink-0">LinkedIn</label>
                      <input type="url" value={form.linkedinUrl}
                        onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                        placeholder="https://linkedin.com/in/..."
                        className={iosInput} />
                    </div>
                  </div>
                </div>

                {/* Delete */}
                <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting || saving}
                    className="w-full px-4 py-3 text-danger text-subhead font-normal text-center hover:bg-danger-soft transition-colors disabled:opacity-40"
                  >
                    {deleting ? 'Deleting...' : 'Delete Speaker'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
