'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'


interface ScheduleItem {
  id: string
  type: 'meeting' | 'talk' | 'workshop' | 'keynote' | 'panel' | 'break'
  title: string
  startsAt: string
  endsAt: string
  location: string | null
  otherName?: string | null
  otherImage?: string | null
  status?: string
  track?: string | null
}

interface Sponsor {
  id: string
  name: string
  logoUrl: string | null
  tier: string
  website: string | null
}

interface Speaker {
  id: string
  name: string
  photoUrl: string | null
  company: string | null
  jobTitle: string | null
}

interface Props {
  conference: {
    name: string
    venue: string | null
    venueLat: number | null
    venueLon: number | null
    venueTimezone: string | null
    startDate: string
    endDate: string
    heroImageUrl: string | null
    wifiName: string | null
    wifiPassword: string | null
  } | null
  user: { name: string | null; image: string | null; company: string | null; jobTitle: string | null }
  meetingCount: number
  sessionCount: number
  profilePct: number
  missingFields: string[]
  scheduleItems: ScheduleItem[]
  speakers: Speaker[]
  sponsors: Sponsor[]
}

// ─── Weather tile (fetches Open-Meteo, free, no key) ─────────────────────────

function WeatherTile({ venue, lat, lon, timezone }: { venue: string | null; lat: number | null; lon: number | null; timezone: string | null }) {
  const [weather, setWeather] = useState<{
    temp: number; condition: string; high: number; low: number; icon: string
  } | null>(null)

  const city = venue?.split(',').slice(-1)[0]?.trim() ?? 'San Francisco'

  useEffect(() => {
    // Use stored coordinates directly — no geocoding needed
    const useLat = lat ?? 37.7749
    const useLon = lon ?? -122.4194
    const useTz = timezone ?? 'America/Los_Angeles'
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${useLat}&longitude=${useLon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=${encodeURIComponent(useTz)}&forecast_days=1`)
      .then(r => r.json())
      .then(d => {
        const code = d.current.weather_code
        const temp = Math.round(d.current.temperature_2m)
        const high = Math.round(d.daily.temperature_2m_max[0])
        const low  = Math.round(d.daily.temperature_2m_min[0])
        const icon = code <= 1 ? '☀️' : code <= 3 ? '⛅' : code <= 48 ? '🌫️' : code <= 67 ? '🌧️' : code <= 77 ? '❄️' : code <= 82 ? '🌦️' : '⛈️'
        const condition = code <= 1 ? 'Clear' : code <= 3 ? 'Partly Cloudy' : code <= 48 ? 'Foggy' : code <= 67 ? 'Rainy' : code <= 77 ? 'Snow' : code <= 82 ? 'Showers' : 'Stormy'
        setWeather({ temp, condition, high, low, icon })
      })
      .catch(() => {})
  }, [lat, lon, timezone])

  return (
    <div
      className="relative overflow-hidden flex flex-col justify-between p-5 h-full"
      style={{
        borderRadius: '28px 28px 28px 8px',
        background: weather
          ? 'linear-gradient(135deg, #1a6cf5 0%, #38b2f7 60%, #7dd3fc 100%)'
          : 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 100%)',
      }}
    >
      {/* Cloud decorations */}
      <div className="absolute top-3 right-4 text-white/10 text-8xl select-none pointer-events-none leading-none">☁</div>
      <div className="absolute bottom-8 right-10 text-white/10 text-5xl select-none pointer-events-none leading-none">☁</div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70 mb-1">Weather</p>
        <p className="text-xs text-white/80">{city}</p>
      </div>

      {weather ? (
        <div>
          <div className="flex items-end gap-3">
            <span className="text-5xl leading-none">{weather.icon}</span>
            <span className="text-5xl font-bold text-white leading-none">{weather.temp}°</span>
          </div>
          <p className="text-sm font-semibold text-white mt-2">{weather.condition}</p>
          <p className="text-xs text-white/70 mt-0.5">H:{weather.high}° · L:{weather.low}°</p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          <p className="text-sm text-white/70">Loading…</p>
        </div>
      )}
    </div>
  )
}

// ─── Location tile ────────────────────────────────────────────────────────────

function LocationTile({ venue, startDate, endDate }: { venue: string | null; startDate: string; endDate: string }) {
  const [line1, line2] = venue ? [venue.split(',')[0], venue.split(',').slice(1).join(',').trim()] : ['Venue TBD', '']
  const dateRange = (() => {
    const s = new Date(startDate), e = new Date(endDate)
    if (s.getMonth() === e.getMonth()) return `${format(s, 'MMM d')}–${format(e, 'd')}`
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d')}`
  })()

  const mapsUrl = venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}` : '#'

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative overflow-hidden flex flex-col justify-between p-5 h-full active:opacity-80 transition-opacity"
      style={{
        borderRadius: '8px 28px 8px 28px',
        background: 'linear-gradient(160deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%)',
      }}
    >
      {/* Pin dot at top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-red-400 shadow-lg shadow-red-400/50" />

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/80 mb-3">Venue</p>
        <p className="text-base font-bold text-white leading-snug">{line1}</p>
        {line2 && <p className="text-xs text-indigo-200/70 mt-0.5">{line2}</p>}
      </div>

      <div>
        <div className="flex items-center gap-1.5 mt-3">
          <svg className="w-3.5 h-3.5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-xs font-semibold text-indigo-200">{dateRange}</p>
        </div>
        {/* Mini map grid decoration */}
        <div className="mt-3 grid grid-cols-4 gap-0.5 opacity-20">
          {[1, 0.3, 1, 1, 0.3, 1, 0.3, 1].map((o, i) => (
            <div key={i} className="h-1.5 rounded-sm bg-indigo-300" style={{ opacity: o }} />
          ))}
        </div>
      </div>
    </a>
  )
}

// ─── WiFi tile ────────────────────────────────────────────────────────────────

function generatePassword() {
  const words = ['Amber', 'Falcon', 'Spark', 'Nova', 'Ridge', 'Coral', 'Swift', 'Ember', 'Lunar', 'Peak']
  const word = words[Math.floor(Math.random() * words.length)]
  const num = Math.floor(100 + Math.random() * 900)
  const syms = ['!', '@', '#', '$', '%']
  const sym = syms[Math.floor(Math.random() * syms.length)]
  return `${word}${num}${sym}`
}

function WifiTile({ name, password }: { name: string | null; password: string | null }) {
  const [copiedName, setCopiedName] = useState(false)
  const [copiedPass, setCopiedPass] = useState(false)
  const generatedPass = useMemo(() => generatePassword(), [])
  const displayPass = password ?? generatedPass

  function copy(text: string, which: 'name' | 'pass') {
    const setC = which === 'name' ? setCopiedName : setCopiedPass
    try {
      navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setC(true)
    setTimeout(() => setC(false), 2000)
  }

  return (
    <div
      className="relative flex flex-col justify-between p-4 h-full"
      style={{
        borderRadius: '28px 8px 28px 28px',
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
      }}
    >
      {/* Signal arcs decoration — clipped to its own bounds */}
      <div className="absolute bottom-3 right-3 opacity-10 overflow-hidden pointer-events-none">
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <path d="M8 44 Q32 20 56 44" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"/>
          <path d="M16 52 Q32 36 48 52" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"/>
          <circle cx="32" cy="58" r="3" fill="white"/>
        </svg>
      </div>

      <div className="flex flex-col gap-2 h-full justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80">WiFi</p>

        <div className="space-y-2">
          {/* Network name */}
          <div className="bg-white/10 rounded-xl px-3 py-2">
            <p className="text-[10px] text-emerald-300/70 font-medium mb-0.5">Network</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white truncate">{name ?? 'Conference_WiFi'}</p>
              <button
                type="button"
                onClick={() => copy(name ?? 'Conference_WiFi', 'name')}
                className="flex-shrink-0 flex items-center gap-1 bg-white/15 hover:bg-white/25 active:bg-white/30 rounded-lg px-2 py-1 transition-colors"
              >
                {copiedName ? (
                  <svg className="w-3 h-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                <span className="text-[10px] text-white font-medium">{copiedName ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Password */}
          <div className="bg-white/10 rounded-xl px-3 py-2">
            <p className="text-[10px] text-emerald-300/70 font-medium mb-0.5">Password</p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-white font-mono tracking-wider truncate">
                ••••••••
              </p>
              <button
                type="button"
                onClick={() => copy(displayPass, 'pass')}
                className="flex-shrink-0 flex items-center gap-1 bg-white/15 hover:bg-white/25 active:bg-white/30 rounded-lg px-2 py-1 transition-colors"
              >
                {copiedPass ? (
                  <svg className="w-3 h-3 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
                <span className="text-[10px] text-white font-medium">{copiedPass ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Meetings tile ────────────────────────────────────────────────────────────

function MeetingsTile({ meetingCount, sessionCount }: { meetingCount: number; sessionCount: number }) {
  return (
    <div
      className="relative overflow-hidden flex items-center gap-5 px-5 py-4 h-full"
      style={{
        borderRadius: '12px 28px 12px 28px',
        background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
      }}
    >
      {/* Overlapping circles decoration */}
      <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/5" />
      <div className="absolute -right-8 top-4 w-20 h-20 rounded-full bg-white/5" />

      <div className="flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-200/80 mb-2">Your Meetings</p>
        <div className="flex items-baseline gap-3">
          <div>
            <span className="text-3xl font-black text-white">{meetingCount}</span>
            <p className="text-[10px] text-violet-200 font-medium mt-0.5">1-on-1s booked</p>
          </div>
          <div className="w-px h-8 bg-white/20" />
          <div>
            <span className="text-3xl font-black text-white">{sessionCount}</span>
            <p className="text-[10px] text-violet-200 font-medium mt-0.5">sessions saved</p>
          </div>
        </div>
      </div>

    </div>
  )
}

// ─── Profile tile ─────────────────────────────────────────────────────────────

function ProfileTile({ name, image, pct, company, jobTitle, missingFields }: {
  name: string | null; image: string | null; pct: number
  company: string | null; jobTitle: string | null
  missingFields: string[]
}) {
  const [animatedPct, setAnimatedPct] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setAnimatedPct(pct), 100)
    return () => clearTimeout(t)
  }, [pct])

  const barColor = pct === 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#f43f5e'

  return (
    <a href="/setup" className="relative w-full h-full block rounded-2xl overflow-hidden flex flex-col"
      style={{ background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)' }}>

      {/* Top label */}
      <div className="px-3 pt-2.5 pb-1 flex-shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">My Profile</span>
      </div>

      {/* Avatar with progress ring */}
      <div className="flex-1 flex flex-col items-center justify-center relative" style={{ gap: 4 }}>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div style={{
            width: 70, height: 70, borderRadius: '50%',
            background: `radial-gradient(ellipse at center, ${barColor}55 0%, transparent 70%)`,
            filter: 'blur(16px)',
          }} />
        </div>
        <div className="relative" style={{ width: 80, height: 80 }}>
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 -rotate-90">
            <circle cx="40" cy="40" r="37" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="3.5" />
            <circle
              cx="40" cy="40" r="37"
              fill="none"
              stroke={barColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={`${(animatedPct / 100) * (2 * Math.PI * 37)} ${2 * Math.PI * 37}`}
              style={{
                transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)',
                filter: `drop-shadow(0 0 4px ${barColor})`,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" loading="lazy" className="object-cover"
                style={{ width: 66, height: 66, borderRadius: '50%', objectPosition: 'center 20%' }} />
            ) : (
              <div className="flex items-center justify-center bg-slate-700"
                style={{ width: 66, height: 66, borderRadius: '50%' }}>
                <span className="text-2xl font-black text-white/50">{(name ?? '?')[0]}</span>
              </div>
            )}
          </div>
        </div>
        <p className="text-xl font-black leading-none" style={{ color: barColor }}>{animatedPct}%</p>
        <p className="text-[10px] font-semibold text-slate-500 leading-none">complete</p>
      </div>

      {/* CTA row */}
      <div className="mx-3 mb-3 flex items-center gap-1.5 rounded-xl px-2.5 py-2 flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${barColor}33` }}>
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: barColor }} />
        <p className="text-[10px] font-medium flex-1 truncate" style={{ color: pct === 100 ? '#10b981' : '#94a3b8' }}>
          {pct === 100 ? 'Profile complete ✓' : `Missing: ${missingFields.join(' · ')}`}
        </p>
        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          style={{ color: barColor }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </a>
  )
}

// ─── What's Next tile ────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ScheduleItem['type'], { label: string; color: string; bg: string; path: string }> = {
  meeting:  { label: '1-1 Meeting', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  keynote:  { label: 'Keynote',     color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  path: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  talk:     { label: 'Talk',        color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', path: 'M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z' },
  workshop: { label: 'Workshop',    color: '#34d399', bg: 'rgba(52,211,153,0.12)',  path: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  panel:    { label: 'Panel',       color: '#f472b6', bg: 'rgba(244,114,182,0.12)', path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM3 10a3 3 0 106 0 3 3 0 00-6 0z' },
  break:    { label: 'Break',       color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', path: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
}

function WhatsNextTile({ items }: { items: ScheduleItem[] }) {
  return (
    <a
      href="/my-schedule"
      className="col-span-2 block rounded-2xl overflow-hidden active:opacity-80 transition-opacity"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-slate-300">Up Next</span>
        </div>
        <span className="text-[10px] text-indigo-400 font-semibold">
          {items.length > 0 ? `${items.length} upcoming →` : 'View schedule →'}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="px-4 pb-4 space-y-2">
          {items.map((item, i) => {
            const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.talk
            const starts = new Date(item.startsAt)
            const ends = new Date(item.endsAt)
            return (
              <div key={item.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: i === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)' }}>
                {/* Time */}
                <div className="flex-shrink-0 text-center w-10">
                  <p className="text-sm font-bold text-white leading-none">{format(starts, 'h:mm')}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">{format(starts, 'a')}</p>
                </div>
                <div className="w-px h-8 bg-white/10 flex-shrink-0" />

                {/* Type icon or avatar */}
                {item.type === 'meeting' && item.otherImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.otherImage} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover flex-shrink-0 ring-1 ring-white/20" />
                ) : item.type === 'meeting' ? (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: cfg.bg }}>
                    <span className="text-xs font-bold" style={{ color: cfg.color }}>{(item.otherName ?? '?')[0]}</span>
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: cfg.bg }}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      style={{ color: cfg.color }}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={cfg.path} />
                    </svg>
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                    {item.track && (
                      <>
                        <span className="text-white/20 text-[9px]">·</span>
                        <span className="text-[9px] text-slate-500 truncate">{item.track}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-white truncate leading-tight">{item.title}</p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {format(starts, 'h:mm')}–{format(ends, 'h:mm a')}{item.location ? ` · ${item.location}` : ''}
                  </p>
                </div>

                {i === 0 && (
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-indigo-400" />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="px-4 pb-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-300">Nothing scheduled yet</p>
            <p className="text-xs text-slate-500 mt-0.5">Book meetings & save sessions to see them here</p>
          </div>
        </div>
      )}
    </a>
  )
}


// ─── Sponsor Carousel Tile ────────────────────────────────────────────────────

function SponsorCarouselTile({ sponsors }: { sponsors: Sponsor[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || sponsors.length === 0) return
    let pos = 0
    const speed = 0.4
    const step = () => {
      pos += speed
      if (pos >= el.scrollWidth / 2) pos = 0
      el.scrollLeft = pos
      rafRef.current = requestAnimationFrame(step)
    }
    const rafRef = { current: 0 }
    rafRef.current = requestAnimationFrame(step)
    const pause = () => cancelAnimationFrame(rafRef.current)
    const resume = () => { rafRef.current = requestAnimationFrame(step) }
    el.addEventListener('mouseenter', pause)
    el.addEventListener('mouseleave', resume)
    el.addEventListener('touchstart', pause)
    el.addEventListener('touchend', resume)
    return () => {
      cancelAnimationFrame(rafRef.current)
      el.removeEventListener('mouseenter', pause)
      el.removeEventListener('mouseleave', resume)
      el.removeEventListener('touchstart', pause)
      el.removeEventListener('touchend', resume)
    }
  }, [sponsors.length])

  if (sponsors.length === 0) return null

  const doubled = [...sponsors, ...sponsors]

  return (
    <div className="col-span-2 rounded-2xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Our Sponsors</span>
        <span className="text-[10px] text-slate-500">{sponsors.length} sponsors</span>
      </div>
      <div
        ref={scrollRef}
        className="flex gap-4 pb-5 px-4 overflow-x-auto"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', userSelect: 'none' }}
      >
        {doubled.map((s, i) => (
          <div key={`${s.id}-${i}`} className="flex-shrink-0 flex flex-col items-center gap-2">
            <div className="flex items-center justify-center rounded-2xl"
              style={{ width: 96, height: 96, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {s.logoUrl ? (
                <img src={s.logoUrl} alt={s.name} loading="lazy" decoding="async"
                  className="w-16 h-16 object-contain rounded-xl" />
              ) : (
                <span className="text-xs font-bold text-white/50 text-center px-2 leading-tight">{s.name}</span>
              )}
            </div>
            <p className="text-[10px] text-white/40 text-center max-w-[96px] truncate">{s.name}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Speaker Carousel Tile ────────────────────────────────────────────────────

function SpeakerCarouselTile({ speakers }: { speakers: Speaker[] }) {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (speakers.length <= 1) return
    const t = setInterval(() => setIdx(i => (i + 1) % speakers.length), 4000)
    return () => clearInterval(t)
  }, [speakers.length])

  if (speakers.length === 0) return null

  const s = speakers[idx]

  return (
    <a href="/speakers" className="w-full h-full block rounded-2xl overflow-hidden relative"
      style={{ background: '#0f172a' }}>

      {/* Full-bleed photo */}
      {s.photoUrl ? (
        <img src={s.photoUrl} alt={s.name} loading="lazy" decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: 'center 20%' }} />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
          <span className="text-5xl font-bold text-white/20">{s.name[0]}</span>
        </div>
      )}

      {/* Top label */}
      <div className="absolute top-0 inset-x-0 px-3 pt-2.5 flex items-center justify-between z-20">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Speakers</span>
        <span className="text-[10px] text-white/40">{speakers.length} →</span>
      </div>

      {/* Bottom gradient + info */}
      <div className="absolute inset-x-0 bottom-0 z-20 px-3 pb-2.5 pt-8"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)' }}>
        <p className="text-sm font-bold text-white leading-tight truncate">{s.name}</p>
        {s.jobTitle && <p className="text-xs text-white/70 truncate leading-tight mt-0.5">{s.jobTitle}</p>}
        {s.company && <p className="text-xs text-white/50 truncate leading-tight">{s.company}</p>}

        {/* Dot indicators */}
        {speakers.length > 1 && (
          <div className="flex gap-1 mt-1.5">
            {speakers.slice(0, 8).map((_, i) => (
              <div key={i} className="h-0.5 rounded-full transition-all duration-300"
                style={{
                  width: i === idx ? 12 : 4,
                  background: i === idx ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)'
                }} />
            ))}
          </div>
        )}
      </div>
    </a>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'All',      href: '/home' },
  { label: 'Agenda',   href: '/schedule' },
  { label: 'Speakers', href: '/speakers' },
  { label: 'People',   href: '/people' },
  { label: 'Schedule', href: '/my-schedule' },
]

export function HomeScreen({ conference, user, meetingCount, sessionCount, profilePct, missingFields, scheduleItems, speakers, sponsors }: Props) {
  const now = new Date()
  const firstName = user.name?.split(' ')[0] ?? ''

  return (
    <div className="min-h-screen" style={{ background: '#f0ece4' }}>
      {/* ── Outer shell — mobile full-width, desktop 2x wider ── */}
      <div className="w-full md:max-w-2xl mx-auto">

        {/* ── Full hero — image behind everything ── */}
        <div className="relative overflow-hidden" style={{ borderRadius: '0 0 28px 28px' }}>
          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={conference?.heroImageUrl ?? 'https://agcdn-1d97e.kxcdn.com/wp-content/uploads/2020/12/alphagamma-eTail-2021-opportunities-1024x640.jpg'}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            style={{ objectPosition: '50% 100%', transform: 'translateY(50px)', height: 'calc(100% + 50px)', top: '-50px' }}
          />
          {/* Black gradient from top */}
          <div className="absolute inset-0 z-10 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 100%)' }} />

          {/* All content overlaid */}
          <div className="relative z-20 px-5 pt-[10px] pb-4">
            {/* Title + search */}
            <h1 className="text-2xl font-black text-white text-center leading-tight tracking-tight mb-2 drop-shadow-lg">
              {conference?.name ?? 'Conference'}
            </h1>
            <a href="/speakers" className="w-full rounded-full px-5 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
              style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)' }}>
              <svg className="w-4 h-4 text-pink-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-gray-400 text-sm">Search speakers, sessions…</span>
            </a>

            {/* Spacer — image shows here */}
            <div style={{ height: 80 }} />

            {/* Venue + date + pills */}
            <p className="text-xs font-extrabold tracking-[0.2em] uppercase text-white/80 mb-1 drop-shadow">{conference?.venue ?? ''}</p>
            <h2 className="text-2xl font-bold text-white leading-snug drop-shadow">
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h2>
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {QUICK_LINKS.map(({ label, href }) => (
                <a key={label} href={href}
                  className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold text-gray-800 active:scale-95 transition-transform"
                  style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}>
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="border-t border-b border-[#ede9e0] px-5 py-4 flex items-center justify-between" style={{ background: '#f5f2ec' }}>
          <span className="text-gray-900 font-semibold text-sm">Hi, {firstName || 'there'}</span>
          <a href="/my-schedule" className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>{meetingCount} meetings</span>
            <span className="text-gray-300">•</span>
            <span>{sessionCount} sessions saved</span>
            <svg className="w-3.5 h-3.5 text-gray-400 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>

        {/* ── Tiles ── */}
        <div className="pt-5 pb-5" style={{ background: '#f0ece4' }}>
        <div className="px-4 grid grid-cols-2 gap-3">

        {/* What's Next */}
        <WhatsNextTile items={scheduleItems} />

        {/* Weather */}
        <div className="col-span-1" style={{ aspectRatio: '1/1' }}>
          <WeatherTile venue={conference?.venue ?? null} lat={conference?.venueLat ?? null} lon={conference?.venueLon ?? null} timezone={conference?.venueTimezone ?? null} />
        </div>

        {/* Profile */}
        <div className="col-span-1" style={{ aspectRatio: '1/1' }}>
          <ProfileTile name={user.name} image={user.image} pct={profilePct} company={user.company} jobTitle={user.jobTitle} missingFields={missingFields} />
        </div>

        {/* Speakers */}
        <div className="col-span-1" style={{ aspectRatio: '1/1' }}>
          <SpeakerCarouselTile speakers={speakers} />
        </div>

        {/* Meetings count */}
        <div className="col-span-1" style={{ aspectRatio: '1/1' }}>
          <MeetingsTile meetingCount={meetingCount} sessionCount={sessionCount} />
        </div>

        {/* Sponsors */}
        <SponsorCarouselTile sponsors={sponsors} />

        {/* Location / Venue */}
        <div className="col-span-1" style={{ aspectRatio: '1/1' }}>
          <LocationTile
            venue={conference?.venue ?? null}
            startDate={conference?.startDate ?? new Date().toISOString()}
            endDate={conference?.endDate ?? new Date().toISOString()}
          />
        </div>

        {/* WiFi */}
        <div className="col-span-1" style={{ aspectRatio: '1/1' }}>
          <WifiTile name={conference?.wifiName ?? null} password={conference?.wifiPassword ?? null} />
        </div>

      </div>
      </div>{/* end bg-cream */}
      </div>{/* end md:max-w-2xl */}
    </div>
  )
}
