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
  _count: { confSessions: number }
}

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
  const iosInput = 'w-full bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none'

  const [search, setSearch] = useState('')

  const filtered = speakers.filter((s: Speaker) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q)
      || (s.company ?? '').toLowerCase().includes(q)
      || (s.jobTitle ?? '').toLowerCase().includes(q)
  })

  if (isLoading && speakers.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-gray-200/60 rounded-lg animate-pulse" />
          <div className="h-9 w-32 bg-gray-200/60 rounded-xl animate-pulse" />
        </div>
        <div className="h-10 bg-gray-200/40 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/60 animate-pulse">
              <div className="w-24 h-24 rounded-full bg-gray-100" />
              <div className="h-4 w-24 bg-gray-100 rounded-lg" />
              <div className="h-3 w-20 bg-gray-100/60 rounded-lg" />
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
        <p className="text-[13px] text-gray-400 font-medium">{speakers.length} speaker{speakers.length !== 1 ? 's' : ''}</p>
        <Link
          href="/dashboard/speakers/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white bg-[#007AFF] rounded-xl hover:bg-[#0066d6] active:bg-[#004dad] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          Add Speaker
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search speakers..."
          className="w-full pl-9 pr-4 py-2.5 bg-white/80 backdrop-blur-sm rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 outline-none ring-1 ring-black/[0.04] focus:ring-[#007AFF]/40 focus:ring-2 transition-shadow"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300/60 flex items-center justify-center hover:bg-gray-300 transition-colors">
            <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {/* Speaker grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((speaker, idx) => {
            const pp = parsePhotoPos(speaker.photoPosition)
            return (
              <button
                key={speaker.id}
                onClick={() => openEdit(speaker)}
                className="group flex flex-col items-center text-center p-6 rounded-2xl bg-white ring-1 ring-black/[0.04] hover:ring-[#007AFF]/30 hover:shadow-lg hover:shadow-blue-500/[0.06] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 cursor-pointer"
              >
                {/* Avatar */}
                {speaker.photoUrl ? (
                  <div className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0 bg-gray-100 ring-1 ring-black/[0.06] mb-3.5">
                    <img
                      src={optimizeUrl(speaker.photoUrl!, 192)}
                      alt={speaker.name}
                      width={96}
                      height={96}
                      loading={idx < 15 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="w-full h-full object-cover"
                      style={{
                        objectPosition: pp.position,
                        ...(pp.scale !== 1 && { transform: `scale(${pp.scale})`, transformOrigin: pp.position }),
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center flex-shrink-0 ring-1 ring-black/[0.04] mb-3.5">
                    <span className="text-gray-400 font-semibold text-3xl">{speaker.name[0]}</span>
                  </div>
                )}

                {/* Info */}
                <p className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2">{speaker.name}</p>
                {speaker.jobTitle && (
                  <p className="text-[13px] text-gray-400 mt-0.5 leading-tight line-clamp-1">{speaker.jobTitle}</p>
                )}
                {speaker.company && (
                  <p className="text-[13px] font-medium text-[#007AFF]/80 mt-0.5 leading-tight line-clamp-1">{speaker.company}</p>
                )}
                {speaker._count.confSessions > 0 && (
                  <div className="mt-3 px-2.5 py-0.5 rounded-full bg-gray-100/80 text-[11px] font-medium text-gray-500">
                    {speaker._count.confSessions} session{speaker._count.confSessions !== 1 ? 's' : ''}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20">
          {search ? (
            <>
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
              </div>
              <p className="text-[15px] font-medium text-gray-900">No results</p>
              <p className="text-[13px] text-gray-400 mt-1">No speakers match &ldquo;{search}&rdquo;</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>
              </div>
              <p className="text-[15px] font-medium text-gray-900">No speakers yet</p>
              <p className="text-[13px] text-gray-400 mt-1">Add your first speaker to get started</p>
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
            className="w-full max-w-md max-h-[88vh] flex flex-col transition-all duration-250"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(20px)',
              borderRadius: '20px',
              background: '#f2f2f7',
              boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 0 0 0.5px rgba(0,0,0,0.08)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* iOS-style navigation bar */}
            <div className="flex items-center justify-between px-5 pt-5 pb-2 flex-shrink-0">
              <button onClick={closeEdit} className="text-[#007AFF] text-[15px] font-normal hover:opacity-70 transition-opacity">
                Cancel
              </button>
              <h2 className="text-[17px] font-semibold text-gray-900">Edit Speaker</h2>
              <button
                onClick={handleSave as any}
                disabled={saving || deleting || !form.name.trim()}
                className="text-[#007AFF] text-[15px] font-semibold hover:opacity-70 transition-opacity disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Done'}
              </button>
            </div>

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
                {error && (
                  <div className="mx-1 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                {/* Mobile App Photo Section */}
                <div>
                  <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Mobile App Photo</p>
                  {repositioning && form.photoUrl ? (
                    /* LinkedIn-style reposition mode */
                    <div className="bg-[#1b1f23] rounded-2xl overflow-hidden">
                      {/* Segmented control + info banner */}
                      <div className="px-4 pt-3 pb-2">
                        <div className="flex bg-white/10 rounded-lg p-0.5 max-w-[220px] mx-auto">
                          {(['profile', 'card', 'detail'] as const).map(mode => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setPhotoPreview(mode)}
                              className={`flex-1 py-1 text-[11px] font-medium rounded-md transition-all ${
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
                        <span className="text-white/60 text-[12px]">Drag to reposition</span>
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
                          className="px-4 py-1.5 text-[13px] font-semibold text-white rounded-full border border-white/30 hover:bg-white/10 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => setRepositioning(false)}
                          className="px-4 py-1.5 text-[13px] font-semibold text-white bg-[#0a66c2] rounded-full hover:bg-[#004182] transition-colors"
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
                          <div className="flex bg-[#f2f2f7] rounded-lg p-0.5 mb-4 w-full max-w-[260px]">
                            {(['profile', 'card', 'detail'] as const).map(mode => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setPhotoPreview(mode)}
                                className={`flex-1 py-1 text-[12px] font-medium rounded-md transition-all ${
                                  photoPreview === mode
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
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
                              <div className="w-28 h-28 rounded-full overflow-hidden bg-gray-100 ring-1 ring-black/5">
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
                                  <p className="text-[9px] font-bold text-gray-900 leading-tight text-center truncate">{form.name}</p>
                                  {form.jobTitle && <p className="text-[7px] text-gray-400 mt-0.5 text-center truncate">{form.jobTitle}</p>}
                                  {form.company && <p className="text-[7px] font-semibold text-blue-600 mt-0.5 text-center truncate">{form.company}</p>}
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
                                    {form.jobTitle && <p className="text-[10px] text-white/80 mt-0.5 truncate">{form.jobTitle}</p>}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center mb-4">
                            <span className="text-gray-500 font-bold text-3xl">{form.name?.[0] ?? '?'}</span>
                          </div>
                        )}

                        {/* Action buttons row */}
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            className="text-[#007AFF] text-[13px] font-medium hover:opacity-70 transition-opacity"
                          >
                            {uploading ? 'Uploading...' : form.photoUrl ? 'Change Photo' : 'Add Photo'}
                          </button>
                          {form.photoUrl && (
                            <>
                              <span className="text-gray-300 text-xs">|</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setReposSavedPosition(form.photoPosition)
                                  setReposSavedScale(form.photoScale)
                                  setRepositioning(true)
                                }}
                                className="text-[#007AFF] text-[13px] font-medium hover:opacity-70 transition-opacity"
                              >
                                Reposition
                              </button>
                              <span className="text-gray-300 text-xs">|</span>
                              <button
                                type="button"
                                onClick={() => { setForm(f => ({ ...f, photoUrl: '', photoPosition: '50% 50%', photoScale: 1 })); setRepositioning(false) }}
                                className="text-[#FF3B30] text-[13px] font-medium hover:opacity-70 transition-opacity"
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
                              className="w-full px-3 py-2 bg-[#f2f2f7] rounded-lg text-[13px] text-gray-900 placeholder:text-gray-400 outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Info Group */}
                <div>
                  <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Info</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    {/* Name */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Name</label>
                      <input type="text" required value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Required"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-gray-100" />
                    {/* Company */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Company</label>
                      <input type="text" value={form.company}
                        onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                        placeholder="Optional"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-gray-100" />
                    {/* Job Title */}
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">Title</label>
                      <input type="text" value={form.jobTitle}
                        onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                        placeholder="Optional"
                        className={iosInput} />
                    </div>
                  </div>
                </div>

                {/* Bio Group */}
                <div>
                  <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Bio</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    <textarea
                      value={form.bio}
                      onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                      rows={4}
                      placeholder="Write a short bio..."
                      className="w-full px-4 py-3 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 outline-none resize-none"
                    />
                  </div>
                </div>

                {/* Social Group */}
                <div>
                  <p className="text-[13px] font-medium text-gray-500 uppercase tracking-wide px-4 mb-1.5">Social</p>
                  <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 0 0 0.5px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">X / Twitter</label>
                      <input type="text" value={form.twitterHandle}
                        onChange={e => setForm(f => ({ ...f, twitterHandle: e.target.value }))}
                        placeholder="@handle"
                        className={iosInput} />
                    </div>
                    <div className="ml-24 border-b border-gray-100" />
                    <div className="flex items-center px-4 py-2.5">
                      <label className="text-[15px] text-gray-900 w-20 flex-shrink-0">LinkedIn</label>
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
                    className="w-full px-4 py-3 text-[#FF3B30] text-[15px] font-normal text-center hover:bg-red-50 transition-colors disabled:opacity-40"
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
