'use client'

import { useState } from 'react'
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

function scoreBadgeClass(score: number) {
  if (score >= 75) return 'badge-success'
  if (score >= 50) return 'badge-brand'
  if (score >= 25) return 'badge-warning'
  return 'badge-neutral'
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
    }
    setRequesting(null)
  }

  if (matches.length === 0) return null

  return (
    <div>
      {/* Section header */}
      <div className="mb-4">
        <h2 className="text-headline text-ink">{heading}</h2>
        <p className="text-footnote text-ink-2 mt-0.5">{subheading}</p>
      </div>

      {/* Horizontal scroll row — iOS App Store style */}
      <div className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide">
        {matches.map(match => {
          const isDone = requested.has(match.id)
          const isLoading = requesting === match.id

          return (
            <div
              key={match.id}
              className="flex-shrink-0 snap-start w-44 bg-surface rounded-2xl overflow-hidden border border-hairline shadow-card flex flex-col"
            >
              {/* Header band */}
              <div className="h-16 flex items-center justify-center relative bg-brand-50">
                {/* Match score badge */}
                <div className={`badge ${scoreBadgeClass(match.matchScore)} absolute top-2 right-2 font-bold`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                  {match.matchScore}%
                </div>

                {/* Logo / avatar */}
                {match.logoUrl ? (
                  <Image
                    src={match.logoUrl}
                    alt=""
                    width={48}
                    height={48}
                    className="rounded-xl object-cover shadow-card"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-surface/70 flex items-center justify-center shadow-card">
                    <span className="text-xl font-black text-ink-2">{match.name[0]}</span>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="px-3 pt-2.5 pb-3 flex flex-col flex-1 gap-1.5">
                <div>
                  <p className="text-sm font-bold text-ink leading-snug line-clamp-1">{match.name}</p>
                  {(match.jobTitle || match.company) && (
                    <p className="text-caption text-ink-2 leading-tight line-clamp-2 mt-0.5">
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
                          className={`text-caption font-semibold px-1.5 py-0.5 rounded-full leading-none ${c ? '' : 'badge-neutral'}`}
                          style={c ? { background: `linear-gradient(90deg, ${c.bgFrom}, ${c.bgTo})`, color: c.text } : undefined}
                        >
                          {sol}
                        </span>
                      )
                    })}
                    {match.matchedSolutions.length > 2 && (
                      <span className="text-caption text-ink-2">+{match.matchedSolutions.length - 2}</span>
                    )}
                  </div>
                )}

                {/* Spacer */}
                <div className="flex-1" />

                {/* CTA */}
                <button
                  onClick={() => requestMeeting(match)}
                  disabled={isDone || !!requesting}
                  className={`btn-sm w-full mt-1 ${isDone ? 'btn-secondary' : 'btn-primary'}`}
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
