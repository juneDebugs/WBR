'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { SOLUTION_COLORS } from '@/lib/solutions'

export interface RecommendedMatch {
  id: string
  type: 'sponsor' | 'person'
  name: string
  logoUrl: string | null
  company: string | null
  jobTitle: string | null
  tier: string | null
  matchScore: number       // 0–100
  matchedSolutions: string[] // solutions that aligned
  alreadyRequested: boolean
}

const TIER_STYLES: Record<string, { gradient: string; label: string; text: string }> = {
  PLATINUM: { gradient: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)', label: 'Platinum', text: '#334155' },
  GOLD:     { gradient: 'linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)', label: 'Gold',     text: '#92400e' },
  SILVER:   { gradient: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', label: 'Silver',   text: '#475569' },
  BRONZE:   { gradient: 'linear-gradient(135deg, #ffedd5 0%, #fed7aa 100%)', label: 'Bronze',   text: '#9a3412' },
}

function scoreColor(score: number) {
  if (score >= 75) return { bg: '#dcfce7', text: '#15803d', dot: '#22c55e' }
  if (score >= 50) return { bg: '#dbeafe', text: '#1d4ed8', dot: '#3b82f6' }
  if (score >= 25) return { bg: '#fef3c7', text: '#92400e', dot: '#f59e0b' }
  return { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' }
}

interface Props {
  matches: RecommendedMatch[]
  heading: string
  subheading: string
}

export function RecommendedMatchesClient({ matches, heading, subheading }: Props) {
  const [requesting, setRequesting] = useState<string | null>(null)
  const [requested, setRequested] = useState<Set<string>>(
    new Set(matches.filter(m => m.alreadyRequested).map(m => m.id))
  )
  const router = useRouter()

  async function requestMeeting(match: RecommendedMatch) {
    if (requested.has(match.id) || requesting) return
    setRequesting(match.id)
    const body = match.type === 'sponsor'
      ? { targetSponsorId: match.id, message: `Hi! I'd love to connect — your solutions align well with what we're looking for.` }
      : { targetUserId: match.id, message: `Hi ${match.name?.split(' ')[0]}! Your profile caught my eye — would love to connect at WBR 2027.` }

    const res = await fetch('/api/meeting-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setRequested(prev => new Set([...prev, match.id]))
      router.refresh()
    }
    setRequesting(null)
  }

  if (matches.length === 0) return null

  return (
    <div>
      {/* Section header */}
      <div className="mb-4">
        <h2 className="text-base font-bold text-gray-900">{heading}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{subheading}</p>
      </div>

      {/* Horizontal scroll row — iOS App Store style */}
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
        {matches.map(match => {
          const tier = match.tier ? TIER_STYLES[match.tier] : null
          const sc = scoreColor(match.matchScore)
          const isDone = requested.has(match.id)
          const isLoading = requesting === match.id

          return (
            <div
              key={match.id}
              className="flex-shrink-0 snap-start w-44 bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col"
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)' }}
            >
              {/* Header band */}
              <div
                className="h-16 flex items-center justify-center relative"
                style={{
                  background: tier?.gradient ?? 'linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)',
                }}
              >
                {/* Match score badge */}
                <div
                  className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: sc.bg, color: sc.text }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: sc.dot }} />
                  {match.matchScore}%
                </div>

                {/* Logo / avatar */}
                {match.logoUrl ? (
                  <Image
                    src={match.logoUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="rounded-xl object-cover shadow-sm"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-white/70 flex items-center justify-center shadow-sm">
                    <span className="text-xl font-black text-gray-500">{match.name[0]}</span>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="px-3 pt-2.5 pb-3 flex flex-col flex-1 gap-1.5">
                <div>
                  <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-1">{match.name}</p>
                  {(match.jobTitle || match.company) && (
                    <p className="text-[10px] text-gray-400 leading-tight line-clamp-2 mt-0.5">
                      {match.type === 'sponsor'
                        ? (match.jobTitle ?? '')
                        : [match.jobTitle, match.company].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>

                {/* Matched solutions */}
                {match.matchedSolutions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {match.matchedSolutions.slice(0, 2).map(sol => {
                      const c = SOLUTION_COLORS[sol]
                      return (
                        <span
                          key={sol}
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
                          style={c ? { background: `linear-gradient(90deg, ${c.bgFrom}, ${c.bgTo})`, color: c.text } : { background: '#f3f4f6', color: '#6b7280' }}
                        >
                          {sol}
                        </span>
                      )
                    })}
                    {match.matchedSolutions.length > 2 && (
                      <span className="text-[9px] text-gray-400">+{match.matchedSolutions.length - 2}</span>
                    )}
                  </div>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* CTA */}
                <button
                  onClick={() => requestMeeting(match)}
                  disabled={isDone || !!requesting}
                  className="w-full mt-1 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  style={isDone
                    ? { background: '#f0fdf4', color: '#16a34a' }
                    : { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }
                  }
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-1">
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" />
                      </svg>
                      Sending…
                    </span>
                  ) : isDone ? '✓ Requested' : 'Connect'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
