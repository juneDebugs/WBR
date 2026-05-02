'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { getCompanyDescription } from '@/lib/solutions'

interface Attendee {
  id: string
  name: string
  image: string | null
  company: string | null
  jobTitle: string | null
  matchScore: number
  matchedTags: string[]
  allTags: string[]
}

interface Props {
  attendees: Attendee[]
  sponsorId: string | null
}

export function RecommendedAttendees({ attendees, sponsorId }: Props) {
  const router = useRouter()
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<string | null>(null)

  async function connect(attendeeId: string) {
    if (!sponsorId) return
    setLoading(attendeeId)
    try {
      await fetch('/api/meeting-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: attendeeId }),
      })
      setRequested(prev => new Set([...prev, attendeeId]))
    } finally {
      setLoading(null)
    }
  }

  if (attendees.length === 0) return null

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Recommended Attendees</h2>
          <p className="text-sm text-gray-500 mt-0.5">People whose offerings &amp; interests align with your solutions</p>
        </div>
        <button
          onClick={() => router.push('/browse')}
          className="text-xs text-primary hover:underline font-medium flex-shrink-0 mt-1"
        >
          Browse all →
        </button>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {attendees.map(a => {
          const isRequested = requested.has(a.id)
          const isLoading = loading === a.id
          const topMatched = a.matchedTags.slice(0, 1)
          const otherTags = a.allTags.filter(t => !topMatched.includes(t))
          const extraCount = otherTags.length > 1 ? otherTags.length - 1 : 0

          return (
            <div
              key={a.id}
              className="flex-shrink-0 w-52 bg-white border border-gray-100 rounded-2xl shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Avatar + score */}
              <div className="relative px-4 pt-5 pb-2 flex flex-col items-center">
                <div className="relative">
                  {a.image ? (
                    <Image src={a.image} alt={a.name ?? ''} width={64} height={64} className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-white shadow">
                      <span className="text-xl font-bold text-primary">{(a.name ?? '?')[0]}</span>
                    </div>
                  )}
                  <span className={`absolute -top-1 -right-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm ${
                    a.matchScore >= 60 ? 'bg-indigo-500 text-white' : a.matchScore >= 40 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {a.matchScore}%
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="px-4 pb-3 flex-1 flex flex-col">
                <p className="font-bold text-gray-900 text-sm leading-snug truncate">{a.name}</p>
                {(a.jobTitle || a.company) && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {[a.jobTitle, a.company].filter(Boolean).join(' · ')}
                  </p>
                )}

                {/* Company description */}
                {(() => {
                  const desc = getCompanyDescription(a.company)
                  return desc ? (
                    <p className="text-[10px] leading-snug text-gray-400 mt-1.5 line-clamp-2 min-h-[28px]">{desc}</p>
                  ) : (
                    <div className="min-h-[28px] mt-1.5" />
                  )
                })()}

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mt-2.5">
                  {topMatched.map(tag => (
                    <span key={tag} className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                  {otherTags.slice(0, 1).map(tag => (
                    <span key={tag} className="text-[10px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                  {extraCount > 0 && (
                    <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                      +{extraCount}
                    </span>
                  )}
                </div>

                {/* Connect button */}
                <button
                  onClick={() => connect(a.id)}
                  disabled={isRequested || isLoading || !sponsorId}
                  className={`mt-3 w-full py-2 rounded-xl text-sm font-semibold transition-all ${
                    isRequested
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      : 'bg-primary text-white hover:bg-primary/90 disabled:opacity-50'
                  }`}
                >
                  {isLoading ? '…' : isRequested ? '✓ Requested' : 'Connect'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
