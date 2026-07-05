'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { getCompanyDescription } from '@/lib/solutions'
import {
  canDraft,
  getCanDraftBlockers,
  BLOCKER_COPY,
  CAP_HIT_COPY,
} from '@/lib/ai-intro'
import { useAiQuota, useInvalidate } from '@/lib/hooks'
import { IntroDraftModal } from './IntroDraftModal'
import { SolutionBadge } from './SolutionBadge'

// AI intro draft is a client-mirror feature flag; server-side gate on
// the /api/recommendations/[attendeeId]/draft-intro route is authoritative.
const AI_DRAFT_INTRO_ENABLED =
  process.env.NEXT_PUBLIC_WBR_AI_SPONSOR_DRAFT_INTRO_ENABLED === 'true'

// crypto.randomUUID exists on modern browsers + Node ≥14.17. Guard for
// old browsers with a v4-shaped fallback so the button click never
// throws — the idempotency key just needs to be a fresh nonce.
function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export interface Attendee {
  id: string
  name: string
  image: string | null
  company: string | null
  jobTitle: string | null
  bio: string | null
  matchScore: number
  matchedTags: string[]
  allTags: string[]
}

export interface SponsorContext {
  id: string
  name: string | null
  tagline: string | null
}

interface Props {
  attendees: Attendee[]
  sponsorId: string | null
  sponsor?: SponsorContext | null
}

export function RecommendedAttendees({ attendees, sponsorId, sponsor }: Props) {
  const router = useRouter()
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [requestedWithIntro, setRequestedWithIntro] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<string | null>(null)
  const [draftTarget, setDraftTarget] = useState<Attendee | null>(null)
  // Fresh idempotency key generated on Draft intro click, threaded to
  // the modal for its POST body. Cleared when the modal closes so the
  // next open produces a new key (per PRD §6 Phase 12b: "Client
  // generates a fresh idempotencyKey UUID per Draft intro button click").
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  const quota = useAiQuota()
  const invalidate = useInvalidate()
  const capHit = AI_DRAFT_INTRO_ENABLED ? quota.data?.capHit ?? null : null

  async function connect(attendeeId: string) {
    if (!sponsorId) return
    setLoading(attendeeId)
    try {
      await fetch('/api/request-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: attendeeId }),
      })
      setRequested(prev => new Set([...prev, attendeeId]))
      invalidate.meetings()
    } finally {
      setLoading(null)
    }
  }

  function onSent(attendeeId: string, withIntro: boolean) {
    setRequested(prev => new Set([...prev, attendeeId]))
    invalidate.meetings()
    if (withIntro) setRequestedWithIntro(prev => new Set([...prev, attendeeId]))
    setDraftTarget(null)
    setPendingKey(null)
  }

  function onDraftIntroClick(a: Attendee, disabled: boolean) {
    if (disabled) return
    setPendingKey(newIdempotencyKey())
    setDraftTarget(a)
  }

  function onDraftClose() {
    setDraftTarget(null)
    setPendingKey(null)
  }

  if (attendees.length === 0) return null

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Recommended Attendees</h2>
          <p className="text-sm text-ink-2 mt-0.5">People whose offerings &amp; interests align with your solutions</p>
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
          const withIntro = requestedWithIntro.has(a.id)
          // Show up to 4 tags: matched tags first (purple), then remaining (gray)
          const matchedSet = new Set(a.matchedTags)
          const matched = a.allTags.filter(t => matchedSet.has(t))
          const unmatched = a.allTags.filter(t => !matchedSet.has(t))
          const orderedTags = [...matched, ...unmatched]
          const visibleTags = orderedTags.slice(0, 4)
          const extraCount = orderedTags.length - visibleTags.length

          const blockers = sponsor
            ? getCanDraftBlockers({ attendee: { bio: a.bio }, sponsor: { tagline: sponsor.tagline } })
            : ['tagline_missing' as const]
          // Blocker precedence: data-side blockers (bio/tagline) come
          // first because the user can fix them; cap-hit is a temporal
          // state that will pass on its own. Both make the button
          // non-clickable, but the label + tooltip reflect the first
          // reason in the precedence list.
          const blockerCopy = blockers.length > 0 ? BLOCKER_COPY[blockers[0]] : null
          const capHitCopy = capHit ? CAP_HIT_COPY[capHit] : null
          const draftDisabled = blockers.length > 0 || isRequested || capHit !== null
          const draftLabel = blockerCopy
            ? 'Draft intro'
            : capHitCopy
              ? capHitCopy
              : 'Draft intro'
          const draftTooltip = blockerCopy ?? capHitCopy ?? undefined

          return (
            <div
              key={a.id}
              className="card p-0 flex-shrink-0 w-56 flex flex-col overflow-hidden hover:shadow-elevated transition-shadow"
            >
              {/* Avatar + score */}
              <div className="relative px-4 pt-5 pb-2 flex flex-col items-center">
                <div className="relative">
                  {a.image ? (
                    <img src={a.image} alt={a.name ?? ''} className="w-16 h-16 rounded-full object-cover ring-2 ring-white shadow" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-white shadow">
                      <span className="text-xl font-bold text-primary">{(a.name ?? '?')[0]}</span>
                    </div>
                  )}
                  <span className="absolute -top-1 left-12 whitespace-nowrap text-[11px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white shadow-sm badge-brand">
                    {a.matchScore}%
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="px-4 pb-3 flex-1 flex flex-col">
                <p className="font-bold text-ink text-sm leading-snug truncate">{a.name}</p>
                {(a.jobTitle || a.company) && (
                  <p className="text-xs text-ink-2 truncate mt-0.5">
                    {[a.jobTitle, a.company].filter(Boolean).join(' · ')}
                  </p>
                )}

                {/* Company description */}
                <p className="text-[10px] leading-snug text-ink-3 mt-1.5 line-clamp-2 min-h-[28px]">{getCompanyDescription(a.company)}</p>

                {/* Tags — at least 2, up to 4 */}
                <div className="flex flex-wrap gap-1 mt-2.5 mb-2">
                  {visibleTags.map(tag => (
                    <SolutionBadge key={tag} label={tag} />
                  ))}
                  {extraCount > 0 && (
                    <span className="badge badge-neutral">
                      +{extraCount}
                    </span>
                  )}
                </div>

                {/* Connect + Draft intro buttons */}
                <div className="mt-auto pt-3 flex flex-col gap-2">
                  <button
                    onClick={() => connect(a.id)}
                    disabled={isRequested || isLoading || !sponsorId}
                    className={`w-full ${
                      isRequested
                        ? 'inline-flex items-center justify-center min-h-[44px] rounded-xl bg-success-soft text-success-ink border border-success/30 text-sm font-semibold'
                        : 'btn-primary'
                    }`}
                  >
                    {isLoading
                      ? '…'
                      : isRequested
                      ? withIntro
                        ? '✓ Requested · with intro'
                        : '✓ Requested'
                      : 'Connect'}
                  </button>

                  {AI_DRAFT_INTRO_ENABLED && sponsor && (
                    <button
                      onClick={() => onDraftIntroClick(a, draftDisabled)}
                      disabled={draftDisabled}
                      title={draftTooltip}
                      data-cap-hit={capHit ?? undefined}
                      className="w-full py-2 rounded-xl text-[11px] leading-tight font-semibold border border-primary text-primary bg-transparent hover:bg-primary/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed sm:text-sm"
                    >
                      {draftLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {draftTarget &&
        sponsor &&
        pendingKey &&
        canDraft({ attendee: { bio: draftTarget.bio }, sponsor: { tagline: sponsor.tagline } }) && (
          <IntroDraftModal
            attendee={draftTarget}
            sponsor={sponsor}
            idempotencyKey={pendingKey}
            onClose={onDraftClose}
            onSent={withIntro => onSent(draftTarget.id, withIntro)}
          />
        )}
    </div>
  )
}
