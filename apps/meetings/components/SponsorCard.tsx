'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { SolutionBadge } from './SolutionBadge'
import { getBorderColorForOffering } from '../lib/solutions'

interface SponsorRep {
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
  users?: SponsorRep[]
}

interface Props {
  sponsor: Sponsor
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

export function SponsorCard({ sponsor, requested: initialRequested }: Props) {
  const [requested, setRequested] = useState(initialRequested)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState<'BEST_FIT' | 'MED' | 'LOW'>('BEST_FIT')
  const router = useRouter()
  const qc = useQueryClient()

  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showModal])

  const offerTags = sponsor.solutionsOffering ? JSON.parse(sponsor.solutionsOffering) as string[] : []
  const seekTags = sponsor.solutionsSeeking ? JSON.parse(sponsor.solutionsSeeking) as string[] : []
  const borderColor = getBorderColorForOffering(sponsor.solutionsOffering)
  const reps = (sponsor.users ?? []).filter(u => u.role !== 'SPONSOR') // show real attendees/speakers only, not demo accounts

  async function sendRequest() {
    setLoading(true)
    try {
      const res = await fetch('/api/meeting-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetSponsorId: sponsor.id, message, priority }),
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
      <div className="card border-t-4 hover:shadow-elevated transition-shadow flex flex-col justify-between" style={{ borderColor }}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl border border-hairline bg-surface flex-shrink-0 overflow-hidden flex items-center justify-center p-1">
            {sponsor.logoUrl ? (
              <Image src={sponsor.logoUrl} alt={sponsor.name} width={48} height={48} className="object-contain" />
            ) : (
              <span className="text-ink-2 font-bold text-lg">{sponsor.name[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-ink text-sm">{sponsor.name}</h3>
              <span className={`badge ${TIER_COLORS[sponsor.tier] ?? 'badge-neutral'}`}>
                {sponsor.tier}
              </span>
            </div>
            {sponsor.companySize && (
              <p className="text-xs text-ink-2 mt-0.5">{sponsor.companySize}</p>
            )}
          </div>
        </div>

        {sponsor.description && <p className="text-xs text-ink-2 mb-3 line-clamp-2">{sponsor.description}</p>}

        {/* Team members from this sponsor */}
        {reps.length > 0 && (
          <div className="mb-3">
            <p className="text-caption font-semibold text-ink-2 uppercase mb-2">
              Attending ({reps.length})
            </p>
            <div className="space-y-1.5">
              {reps.map(rep => (
                <div key={rep.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-fill flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {rep.image ? (
                      <Image src={rep.image} alt={rep.name ?? ''} width={28} height={28} className="object-cover" />
                    ) : (
                      <span className="text-ink-2 font-bold text-xs">{(rep.name ?? '?')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{rep.name}</p>
                    {rep.jobTitle && <p className="text-caption text-ink-2 truncate">{rep.jobTitle}</p>}
                  </div>
                  <span className={`badge flex-shrink-0 ${ROLE_COLORS[rep.role] ?? 'badge-neutral'}`}>
                    {rep.role.charAt(0) + rep.role.slice(1).toLowerCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1" />

        {offerTags.length > 0 && (
          <div className="mb-2">
            <p className="text-caption font-semibold text-ink-2 uppercase mb-1">Offers</p>
            <div className="flex flex-wrap gap-1">
              {offerTags.slice(0, 5).map(t => <SolutionBadge key={t} label={t} />)}
              {offerTags.length > 5 && <span className="badge badge-neutral">+{offerTags.length - 5}</span>}
            </div>
          </div>
        )}

        {seekTags.length > 0 && (
          <div className="mb-3">
            <p className="text-caption font-semibold text-ink-2 uppercase mb-1">Seeking</p>
            <div className="flex flex-wrap gap-1">
              {seekTags.slice(0, 4).map(t => <SolutionBadge key={t} label={t} />)}
              {seekTags.length > 4 && <span className="badge badge-neutral">+{seekTags.length - 4}</span>}
            </div>
          </div>
        )}

        <button
          onClick={() => requested ? null : setShowModal(true)}
          disabled={requested || loading}
          className={`w-full ${requested ? 'btn-secondary' : 'btn-primary'}`}
        >
          {requested ? '✓ Requested' : 'Request Meeting'}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="fixed inset-0 bg-black/40" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Request a meeting with ${sponsor.name}`}
            className="relative bg-surface rounded-2xl w-full max-w-md p-5 shadow-elevated"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-bold text-ink mb-1">Request a meeting</h2>
            <p className="text-sm text-ink-2 mb-4">with {sponsor.name}</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What would you like to discuss? (optional)"
              rows={3}
              className="textarea mb-4"
            />
            <div className="mb-4">
              <label className="block text-sm font-medium text-ink mb-1.5">Meeting priority</label>
              <p className="text-xs text-ink-3 mb-2">How strong a fit is this meeting for you? This sets scheduling order.</p>
              <div className="segmented w-full" role="radiogroup" aria-label="Meeting priority">
                {([['BEST_FIT','Best Fit'],['MED','Med'],['LOW','Low']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    role="radio"
                    aria-checked={priority === val}
                    onClick={() => setPriority(val)}
                    className={`segmented-item${priority === val ? ' active' : ''}`}
                  >{label}</button>
                ))}
              </div>
            </div>
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
