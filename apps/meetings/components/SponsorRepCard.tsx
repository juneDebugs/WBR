'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { SolutionBadge } from './SolutionBadge'

interface Rep {
  id: string
  name: string | null
  jobTitle: string | null
  image: string | null
  role: string
}

interface Sponsor {
  id: string
  name: string
  logoUrl: string | null
  tier: string
  description: string | null
  website: string | null
  companySize: string | null
  annualRevenue: string | null
  solutionsOffering: string | null
  solutionsSeeking: string | null
}

interface Props {
  sponsor: Sponsor
  rep: Rep
  requested: boolean
}

const TIER_COLORS: Record<string, string> = {
  PLATINUM: 'bg-slate-100 text-slate-700',
  GOLD: 'bg-amber-100 text-amber-700',
  SILVER: 'bg-gray-100 text-gray-600',
  BRONZE: 'bg-orange-100 text-orange-700',
}

const ROLE_COLORS: Record<string, string> = {
  SPEAKER: 'bg-brand-100 text-brand-700',
  ATTENDEE: 'bg-blue-100 text-blue-700',
  SPONSOR: 'bg-amber-100 text-amber-700',
}

const ROLE_BORDER: Record<string, string> = {
  SPEAKER: 'border-brand-200',
  ATTENDEE: 'border-blue-200',
  SPONSOR: 'border-amber-200',
}

export function SponsorRepCard({ sponsor, rep, requested: initialRequested }: Props) {
  const [requested, setRequested] = useState(initialRequested)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const qc = useQueryClient()

  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  const offerTags = sponsor.solutionsOffering ? JSON.parse(sponsor.solutionsOffering) as string[] : []

  async function sendRequest() {
    setLoading(true)
    try {
      const res = await fetch('/api/meeting-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSponsorId: sponsor.id, message }),
      })
      if (res.ok || res.status === 409) {
        setRequested(true); setShowModal(false); router.refresh()
        qc.invalidateQueries({ queryKey: ['meetings'] })
        qc.invalidateQueries({ queryKey: ['dashboard'] })
        qc.invalidateQueries({ queryKey: ['browse-requests'] })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className={`card hover:shadow-elevated transition-shadow flex flex-col justify-between border-t-4 ${ROLE_BORDER[rep.role] ?? 'border-hairline'}`}>

        {/* Sponsor identity row */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg border border-hairline bg-surface flex-shrink-0 overflow-hidden flex items-center justify-center p-0.5">
            {sponsor.logoUrl ? (
              <Image src={sponsor.logoUrl} alt={sponsor.name} width={32} height={32} className="object-contain" />
            ) : (
              <span className="text-ink-2 font-bold text-xs">{sponsor.name[0]}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink-2">{sponsor.name}</span>
            <span className={`badge ${TIER_COLORS[sponsor.tier] ?? 'badge-neutral'}`}>
              {sponsor.tier}
            </span>
          </div>
        </div>

        {/* Rep — the star of the card */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-fill flex-shrink-0 overflow-hidden flex items-center justify-center">
            {rep.image ? (
              <img src={rep.image} alt={rep.name ?? ''} className="w-full h-full object-cover" />
            ) : (
              <span className="text-ink-2 font-bold text-xl">{(rep.name ?? '?')[0].toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-ink text-base leading-tight">{rep.name ?? '—'}</p>
            {rep.jobTitle && (
              <p className="text-sm font-semibold text-primary mt-0.5">{rep.jobTitle}</p>
            )}
            <span className={`badge mt-1.5 ${ROLE_COLORS[rep.role] ?? 'badge-neutral'}`}>
              {rep.role.charAt(0) + rep.role.slice(1).toLowerCase()}
            </span>
          </div>
        </div>

        <div className="flex-1" />

        {/* Solutions snippet */}
        {offerTags.length > 0 && (
          <div className="mb-3">
            <p className="text-caption font-semibold text-ink-2 uppercase mb-1">Sponsor Offers</p>
            <div className="flex flex-wrap gap-1">
              {offerTags.slice(0, 5).map(t => (
                <SolutionBadge key={t} label={t} />
              ))}
              {offerTags.length > 5 && <span className="badge badge-neutral">+{offerTags.length - 5}</span>}
            </div>
          </div>
        )}

        <button
          onClick={() => requested ? null : setShowModal(true)}
          disabled={requested || loading}
          className={`w-full ${requested ? 'btn-secondary' : 'btn-primary'}`}
        >
          {requested ? '✓ Requested' : `Request Meeting`}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="fixed inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Request a meeting with ${rep.name ?? sponsor.name}`}
            className="relative bg-surface rounded-2xl w-full max-w-md p-5 shadow-elevated"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-bold text-ink mb-1">Request a meeting</h2>
            <p className="text-sm text-ink-2 mb-4">
              with <span className="font-semibold text-ink">{rep.name}</span>
              <span className="text-ink-2"> · {rep.jobTitle}</span>
              <br />
              <span className="text-xs text-ink-2">{sponsor.name}</span>
            </p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What would you like to discuss? (optional)"
              rows={3}
              className="textarea mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={sendRequest} disabled={loading} className="btn-primary flex-1">
                {loading ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
