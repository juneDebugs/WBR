'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  SPEAKER: 'bg-purple-100 text-purple-700',
  ATTENDEE: 'bg-blue-100 text-blue-700',
  SPONSOR: 'bg-amber-100 text-amber-700',
}

export function SponsorCard({ sponsor, requested: initialRequested }: Props) {
  const [requested, setRequested] = useState(initialRequested)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

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
        body: JSON.stringify({ targetSponsorId: sponsor.id, message }),
      })
      if (res.ok || res.status === 409) { setRequested(true); setShowModal(false); router.refresh() }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="card border-t-4 hover:shadow-md transition-shadow flex flex-col justify-between" style={{ borderTopColor: borderColor }}>
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl border border-gray-200 bg-white flex-shrink-0 overflow-hidden flex items-center justify-center p-1">
            {sponsor.logoUrl ? (
              <Image src={sponsor.logoUrl} alt={sponsor.name} width={48} height={48} className="object-contain" />
            ) : (
              <span className="text-gray-500 font-bold text-lg">{sponsor.name[0]}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm">{sponsor.name}</h3>
              <span className={`badge ${TIER_COLORS[sponsor.tier] ?? 'bg-gray-100 text-gray-600'}`}>
                {sponsor.tier}
              </span>
            </div>
            {sponsor.companySize && (
              <p className="text-xs text-gray-400 mt-0.5">{sponsor.companySize}</p>
            )}
          </div>
        </div>

        {sponsor.description && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{sponsor.description}</p>}

        {/* Team members from this sponsor */}
        {reps.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">
              Attending ({reps.length})
            </p>
            <div className="space-y-1.5">
              {reps.map(rep => (
                <div key={rep.id} className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {rep.image ? (
                      <Image src={rep.image} alt={rep.name ?? ''} width={28} height={28} className="object-cover" />
                    ) : (
                      <span className="text-gray-500 font-bold text-xs">{(rep.name ?? '?')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{rep.name}</p>
                    {rep.jobTitle && <p className="text-[10px] text-gray-400 truncate">{rep.jobTitle}</p>}
                  </div>
                  <span className={`badge flex-shrink-0 text-[9px] ${ROLE_COLORS[rep.role] ?? 'bg-gray-100 text-gray-500'}`}>
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
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Offers</p>
            <div className="flex flex-wrap gap-1">
              {offerTags.slice(0, 5).map(t => <SolutionBadge key={t} label={t} />)}
              {offerTags.length > 5 && <span className="badge bg-gray-100 text-gray-500">+{offerTags.length - 5}</span>}
            </div>
          </div>
        )}

        {seekTags.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Seeking</p>
            <div className="flex flex-wrap gap-1">
              {seekTags.slice(0, 4).map(t => <SolutionBadge key={t} label={t} />)}
              {seekTags.length > 4 && <span className="badge bg-gray-100 text-gray-500">+{seekTags.length - 4}</span>}
            </div>
          </div>
        )}

        <button
          onClick={() => requested ? null : setShowModal(true)}
          disabled={requested || loading}
          className={`w-full py-2 rounded-xl text-sm font-semibold transition-colors ${
            requested
              ? 'bg-green-50 text-green-600 cursor-default'
              : 'bg-primary text-white hover:bg-primary-dark active:scale-95'
          }`}
        >
          {requested ? '✓ Requested' : 'Request Meeting'}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <h2 className="font-bold text-gray-900 mb-1">Request a meeting</h2>
            <p className="text-sm text-gray-500 mb-4">with {sponsor.name}</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What would you like to discuss? (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4 resize-none"
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
