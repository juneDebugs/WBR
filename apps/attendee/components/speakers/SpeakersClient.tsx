'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useSpeakersData } from '@/lib/hooks'
import { CompanyLogo, COMPANY_LOGO_NAMES } from './CompanyLogos'

function parsePhotoPos(pos: string | null | undefined) {
  const parts = (pos ?? '50% 50%').trim().split(/\s+/)
  return {
    position: `${parts[0] ?? '50%'} ${parts[1] ?? '50%'}`,
    scale: parts.length >= 3 ? parseFloat(parts[2]) || 1 : 1,
  }
}

function photoStyle(pos: string | null | undefined, fallback?: string) {
  const { position, scale } = parsePhotoPos(pos ?? fallback)
  return {
    objectPosition: position,
    ...(scale !== 1 && { transform: `scale(${scale})`, transformOrigin: position }),
  }
}

// Resize Unsplash URLs to optimal size for context and apply sharpening
function optimizePhoto(url: string | null, width: number, height?: number): string | null {
  if (!url) return null
  // Only optimize Unsplash URLs; leave data URIs and other URLs untouched
  if (!url.startsWith('https://images.unsplash.com')) return url
  let optimized = url.replace(/w=\d+/, `w=${width}`).replace(/q=\d+/, `q=${width > 600 ? 85 : 70}`)
  if (height) {
    optimized = optimized.includes('h=')
      ? optimized.replace(/h=\d+/, `h=${height}`)
      : optimized + `&h=${height}`
  }
  // Use crop=face,top to preserve full head in headshots
  if (height) {
    optimized = optimized.replace(/crop=[^&]+/, 'crop=face,top')
  }
  if (!optimized.includes('sharp=')) optimized += '&sharp=15'
  return optimized
}

function isExternalUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}


interface Speaker {
  id: string
  name: string
  jobTitle: string | null
  company: string | null
  photoUrl: string | null
  photoPosition: string | null
  bio: string | null
  role: string | null
  lookingFor: string | null
  twitterHandle: string | null
  linkedinUrl: string | null
  track: string | null
}

const AVATAR_GRADIENTS: [string, string][] = [
  ['#7c3aed', '#6366f1'],
  ['#6366f1', '#3b82f6'],
  ['#ec4899', '#f43f5e'],
  ['#f59e0b', '#f97316'],
  ['#14b8a6', '#06b6d4'],
  ['#10b981', '#14b8a6'],
  ['#d946ef', '#ec4899'],
  ['#38bdf8', '#818cf8'],
]

const TRACK_PALETTES = [
  { from: '#7c3aed', to: '#6366f1', chip: '#ede9fe', chipText: '#5b21b6' },
  { from: '#6366f1', to: '#2563eb', chip: '#dbeafe', chipText: '#1d4ed8' },
  { from: '#db2777', to: '#e11d48', chip: '#fce7f3', chipText: '#9d174d' },
  { from: '#d97706', to: '#ea580c', chip: '#fef3c7', chipText: '#92400e' },
  { from: '#0d9488', to: '#0891b2', chip: '#ccfbf1', chipText: '#0f766e' },
  { from: '#059669', to: '#0d9488', chip: '#d1fae5', chipText: '#065f46' },
  { from: '#a21caf', to: '#db2777', chip: '#fae8ff', chipText: '#86198f' },
  { from: '#0284c7', to: '#6366f1', chip: '#e0f2fe', chipText: '#0369a1' },
]

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function avatarGradient(name: string) {
  return AVATAR_GRADIENTS[hash(name) % AVATAR_GRADIENTS.length]
}

function trackPalette(track: string) {
  return TRACK_PALETTES[hash(track) % TRACK_PALETTES.length]
}

// ─── Speaker Detail Modal (iOS bottom sheet) ──────────────────────────────────

function SpeakerModal({ speaker, onClose }: { speaker: Speaker; onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [ag1, ag2] = avatarGradient(speaker.name)
  const palette = speaker.track ? trackPalette(speaker.track) : TRACK_PALETTES[0]
  const hasLogo = speaker.company ? COMPANY_LOGO_NAMES.has(speaker.company) : false

  useEffect(() => {
    // Trigger slide-up animation
    const t = setTimeout(() => setVisible(true), 10)
    document.body.style.overflow = 'hidden'
    // Reset scroll position to top
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    return () => {
      clearTimeout(t)
      document.body.style.overflow = ''
    }
  }, [])

  function dismiss() {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-0 sm:px-4"
      style={{ background: visible ? 'rgba(0,0,0,0.50)' : 'rgba(0,0,0,0)', transition: 'background 0.25s ease' }}
      onClick={e => { if (e.target === e.currentTarget) dismiss() }}
    >
      <div
        className="relative rounded-t-[32px] sm:rounded-[32px] overflow-hidden flex flex-col w-full sm:max-w-sm md:max-w-md"
        style={{
          background: '#fff',
          maxHeight: '92dvh',
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(24px)',
          transition: 'opacity 0.28s ease, transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Scrollable content */}
        <div ref={scrollRef} className="overflow-y-auto overscroll-contain pb-10">
          {/* Hero photo / gradient — portrait aspect ratio to show full headshot */}
          <div className="relative w-full" style={{ aspectRatio: '4/5', maxHeight: '50dvh' }}>
            {/* Drag handle — overlaid on image, mobile only */}
            <div className="sm:hidden absolute top-2.5 left-0 right-0 z-10 flex justify-center">
              <div className="w-9 h-1 rounded-full bg-white/50" />
            </div>
            {speaker.photoUrl ? (
              isExternalUrl(speaker.photoUrl) ? (
                <Image
                  src={optimizePhoto(speaker.photoUrl, 800, 1000)!}
                  alt={speaker.name}
                  fill
                  priority
                  className="absolute inset-0 w-full h-full object-cover"
                  style={photoStyle(speaker.photoPosition, '50% 20%')}
                />
              ) : (
                <img
                  src={speaker.photoUrl}
                  alt={speaker.name}
                  className="absolute inset-0 w-full h-full object-cover"
                  style={photoStyle(speaker.photoPosition, '50% 20%')}
                />
              )
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${ag1}, ${ag2})` }}
              >
                <span className="text-white font-black" style={{ fontSize: 80 }}>{speaker.name[0]}</span>
              </div>
            )}
            {/* Scrim */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0) 55%)' }} />

            {/* Close button */}
            <button
              onClick={dismiss}
              className="absolute top-3 right-4 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(8px)' }}
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Name overlay */}
            <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
              <h2 className="text-2xl font-bold text-white leading-tight drop-shadow">{speaker.name}</h2>
              {speaker.jobTitle && (
                <p className="text-sm text-white/80 mt-0.5 drop-shadow">{speaker.jobTitle}</p>
              )}
            </div>
          </div>

          {/* Company row */}
          {speaker.company && (
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
              {hasLogo ? (
                <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
                  <CompanyLogo company={speaker.company!} size={28} />
                </div>
              ) : (
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }}
                >
                  <span className="text-white text-xs font-bold">{speaker.company[0]}</span>
                </div>
              )}
              <span className="font-semibold text-gray-900 text-sm">{speaker.company}</span>
              {speaker.track && (
                <span
                  className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full"
                  style={{ background: palette.chip, color: palette.chipText }}
                >
                  {speaker.track}
                </span>
              )}
            </div>
          )}

          {/* Info cards */}
          <div className="px-5 pt-4 space-y-3">

            {/* Role */}
            {speaker.role && (
              <div className="rounded-2xl overflow-hidden" style={{ background: '#f9f9fb' }}>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${palette.from}, ${palette.to})` }}
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Role</span>
                </div>
                <p className="px-4 pb-3.5 text-sm font-semibold text-gray-900 leading-snug">{speaker.role}</p>
              </div>
            )}

            {/* Bio */}
            {speaker.bio && (
              <div className="rounded-2xl overflow-hidden" style={{ background: '#f9f9fb' }}>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">About</span>
                </div>
                <p className="px-4 pb-3.5 text-sm text-gray-600 leading-relaxed">{speaker.bio}</p>
              </div>
            )}

            {/* Looking for */}
            {speaker.lookingFor && (
              <div className="rounded-2xl overflow-hidden" style={{ background: '#f0fdf4' }}>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Looking For</span>
                </div>
                <p className="px-4 pb-3.5 text-sm text-emerald-800 leading-relaxed">{speaker.lookingFor}</p>
              </div>
            )}

            {/* Social links */}
            {(speaker.twitterHandle || speaker.linkedinUrl) && (
              <div className="rounded-2xl overflow-hidden" style={{ background: '#f9f9fb' }}>
                <div className="px-4 pt-3 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Connect</span>
                </div>
                <div className="px-4 pb-3.5 flex gap-3">
                  {speaker.twitterHandle && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-black">
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.259 5.632L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
                      </svg>
                      <span className="text-xs font-semibold text-white">{speaker.twitterHandle}</span>
                    </div>
                  )}
                  {speaker.linkedinUrl && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0A66C2]">
                      <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                      </svg>
                      <span className="text-xs font-semibold text-white">LinkedIn</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SpeakersClient({ speakers: propSpeakers }: { speakers: Speaker[] }) {
  const { data: hookData, isLoading } = useSpeakersData()
  const speakers: Speaker[] = hookData?.speakers ?? (propSpeakers.length > 0 ? propSpeakers : [])
  const speakerCount = hookData?.count ?? speakers.length

  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Speaker | null>(null)

  const filtered = useMemo(() =>
    speakers.filter(s =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.company ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.jobTitle ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.track ?? '').toLowerCase().includes(search.toLowerCase())
    ),
    [speakers, search]
  )

  const groups = useMemo(() => {
    const map = new Map<string, Speaker[]>()
    const unassigned: Speaker[] = []

    for (const s of filtered) {
      if (s.track) {
        if (!map.has(s.track)) map.set(s.track, [])
        map.get(s.track)!.push(s)
      } else {
        unassigned.push(s)
      }
    }

    const trackKeys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b))
    if (trackKeys.length > 0) {
      unassigned.forEach((s, i) => {
        map.get(trackKeys[i % trackKeys.length])!.push(s)
      })
    }

    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  if (isLoading && speakers.length === 0) {
    return (
      <>
        <div className="px-4 sm:px-5 md:px-8 lg:px-12 pt-4 pb-3 sticky top-0 z-10 backdrop-blur-md border-b border-gray-100/60" style={{ background: 'rgba(238, 242, 255, 0.85)' }}>
          <h1 className="text-2xl sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Speakers</h1>
          <p className="text-sm text-gray-400 mt-0.5">Loading...</p>
        </div>
        <div className="px-4 sm:px-5 md:px-8 lg:px-12 pt-4 pb-28 animate-pulse">
          <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-3 mb-6 shadow-sm border border-gray-100">
            <div className="h-4 w-4 bg-gray-200 rounded" />
            <div className="h-4 flex-1 bg-gray-200 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-[3/4] bg-gray-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="px-4 sm:px-5 md:px-8 lg:px-12 pt-4 pb-3 sticky top-0 z-10 backdrop-blur-md border-b border-gray-100/60" style={{ background: 'rgba(238, 242, 255, 0.85)' }}>
        <h1 className="text-2xl sm:text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">Speakers</h1>
        <p className="text-sm text-gray-400 mt-0.5">{speakerCount} speakers</p>
      </div>
      <div className="px-4 sm:px-5 md:px-8 lg:px-12 pt-4 pb-28">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white rounded-2xl px-4 py-3 mb-6 shadow-sm border border-gray-100">
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search speakers, topics…"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-gray-300 active:text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <p className="font-semibold text-gray-500">No speakers found</p>
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map(([track, group]) => {
              const p = trackPalette(track)

              return (
                <section key={track}>
                  <div className="flex items-center gap-2 mb-4">
                    <div
                      className="w-1 h-5 rounded-full flex-shrink-0"
                      style={{ background: `linear-gradient(to bottom, ${p.from}, ${p.to})` }}
                    />
                    <h2 className="font-bold text-gray-900 text-base tracking-tight">{track}</h2>
                    <span
                      className="ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full"
                      style={{ background: p.chip, color: p.chipText }}
                    >
                      {group.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                    {group.map(speaker => {
                      const [ag1, ag2] = avatarGradient(speaker.name)

                      return (
                        <button
                          key={speaker.id}
                          onClick={() => setSelected(speaker)}
                          className="block group active:scale-[0.97] transition-transform text-left"
                        >
                          <div className="relative rounded-xl sm:rounded-2xl overflow-hidden p-[3px] sm:p-[4px]">
                            <div
                              className="absolute w-[200%] h-[200%] top-[-50%] left-[-50%]"
                              style={{
                                background: 'conic-gradient(from 0deg, #3b82f6, #a855f7, #ec4899, #a855f7, #3b82f6)',
                                animation: 'border-spin 3s linear infinite',
                              }}
                            />
                            <div className="relative bg-white rounded-[10px] sm:rounded-[13px] overflow-hidden">
                              <div className="relative w-full" style={{ paddingBottom: '130%' }}>
                                {speaker.photoUrl ? (
                                  isExternalUrl(speaker.photoUrl) ? (
                                    <Image
                                      src={optimizePhoto(speaker.photoUrl, 300)!}
                                      alt={speaker.name}
                                      fill
                                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                      style={photoStyle(speaker.photoPosition)}
                                    />
                                  ) : (
                                    <img
                                      src={speaker.photoUrl}
                                      alt={speaker.name}
                                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                      style={photoStyle(speaker.photoPosition)}
                                    />
                                  )
                                ) : (
                                  <div
                                    className="absolute inset-0 flex items-center justify-center"
                                    style={{ background: `linear-gradient(135deg, ${ag1}, ${ag2})` }}
                                  >
                                    <span className="text-white font-black text-4xl sm:text-3xl md:text-4xl lg:text-3xl xl:text-4xl">{speaker.name[0]}</span>
                                  </div>
                                )}
                              </div>

                              <div className="px-1.5 sm:px-2 pt-2 sm:pt-2.5 pb-2.5 sm:pb-3">
                                <p className="font-bold text-gray-900 text-xs sm:text-sm md:text-xs lg:text-[11px] xl:text-xs leading-snug line-clamp-2 text-center">
                                  {speaker.name}
                                </p>
                                {speaker.jobTitle && (
                                  <p className="text-[10px] sm:text-xs md:text-[10px] text-gray-400 mt-0.5 sm:mt-1 leading-tight line-clamp-2 text-center">
                                    {speaker.jobTitle}
                                  </p>
                                )}
                                {speaker.company && (
                                  <p className="text-[10px] sm:text-xs md:text-[10px] font-semibold mt-0.5 text-center line-clamp-1" style={{ color: p.chipText }}>
                                    {speaker.company}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {selected && (
        <SpeakerModal speaker={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
