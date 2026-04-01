'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

const COMPANY_LOGOS: Record<string, string> = {
  'Google Cloud':       'https://logo.clearbit.com/cloud.google.com',
  'Robinhood':          'https://logo.clearbit.com/robinhood.com',
  'OpenAI':             'https://logo.clearbit.com/openai.com',
  'Palo Alto Networks': 'https://logo.clearbit.com/paloaltonetworks.com',
  'DeepMind':           'https://logo.clearbit.com/deepmind.com',
  'Meta AI':            'https://logo.clearbit.com/meta.com',
  'Stripe':             'https://logo.clearbit.com/stripe.com',
  'Anthropic':          'https://logo.clearbit.com/anthropic.com',
  'Notion':             'https://logo.clearbit.com/notion.so',
  'Cloudflare':         'https://logo.clearbit.com/cloudflare.com',
  'Shopify':            'https://logo.clearbit.com/shopify.com',
  'Vercel':             'https://logo.clearbit.com/vercel.com',
  'Spotify':            'https://logo.clearbit.com/spotify.com',
  'GitHub':             'https://logo.clearbit.com/github.com',
  'Crowdstrike':        'https://logo.clearbit.com/crowdstrike.com',
  'Plaid':              'https://logo.clearbit.com/plaid.com',
  'Palantir':           'https://logo.clearbit.com/palantir.com',
  'Figma':              'https://logo.clearbit.com/figma.com',
  'Linear':             'https://logo.clearbit.com/linear.app',
  'Loom':               'https://logo.clearbit.com/loom.com',
  'Raycast':            'https://logo.clearbit.com/raycast.com',
  'Supabase':           'https://logo.clearbit.com/supabase.com',
}

interface Speaker {
  id: string
  name: string
  jobTitle: string | null
  company: string | null
  photoUrl: string | null
  track: string | null
}

// Avatar fill gradients (for speakers without photos)
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

// Track border gradients + label chip colors
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

export function SpeakersClient({ speakers }: { speakers: Speaker[] }) {
  const [search, setSearch] = useState('')

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
    for (const s of filtered) {
      const key = s.track ?? 'General'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'General') return 1
      if (b === 'General') return -1
      return a.localeCompare(b)
    })
  }, [filtered])

  return (
    <div className="px-5 pt-4 pb-28">
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
            const isGeneral = track === 'General'

            return (
              <section key={track}>
                {/* Section header */}
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

                {/* Speaker tile grid — 4 columns, portrait */}
                <div className="grid grid-cols-6 gap-2">
                  {group.map(speaker => {
                    const [ag1, ag2] = avatarGradient(speaker.name)
                    const borderFrom = isGeneral ? '#e5e7eb' : p.from
                    const borderTo = isGeneral ? '#d1d5db' : p.to

                    return (
                      <Link
                        key={speaker.id}
                        href={`/speakers/${speaker.id}`}
                        className="block group active:scale-[0.97] transition-transform"
                      >
                        {/* Animated gradient border */}
                        <div className="relative rounded-2xl overflow-hidden p-[4px]">
                          <div
                            className="absolute w-[200%] h-[200%] top-[-50%] left-[-50%]"
                            style={{
                              background: 'conic-gradient(from 0deg, #3b82f6, #a855f7, #ec4899, #a855f7, #3b82f6)',
                              animation: 'border-spin 3s linear infinite',
                            }}
                          />
                          <div className="relative bg-white rounded-[13px] overflow-hidden">
                            {/* Portrait photo */}
                            <div className="relative w-full" style={{ paddingBottom: '130%' }}>
                              {speaker.photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={speaker.photoUrl}
                                  alt={speaker.name}
                                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <div
                                  className="absolute inset-0 flex items-center justify-center"
                                  style={{ background: `linear-gradient(135deg, ${ag1}, ${ag2})` }}
                                >
                                  <span className="text-white font-black text-3xl">{speaker.name[0]}</span>
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="px-2 pt-2.5 pb-3">
                              <p className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 text-center">
                                {speaker.name}
                              </p>
                              {speaker.jobTitle && (
                                <p className="text-xs text-gray-400 mt-1 leading-tight line-clamp-2 text-center">
                                  {speaker.jobTitle}
                                </p>
                              )}
                              {speaker.company && (
                                <p className="text-xs font-semibold mt-0.5 text-center line-clamp-1" style={{ color: p.chipText }}>
                                  {speaker.company}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
