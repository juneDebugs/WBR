'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  SPEAKER: 'bg-purple-100 text-purple-700',
  ATTENDEE: 'bg-blue-100 text-blue-700',
  SPONSOR: 'bg-amber-100 text-amber-700',
}

const ROLE_BORDER: Record<string, string> = {
  SPEAKER: 'border-purple-200',
  ATTENDEE: 'border-blue-200',
  SPONSOR: 'border-amber-200',
}

export function SponsorRepCard({ sponsor, rep, requested: initialRequested }: Props) {
  const [requested, setRequested] = useState(initialRequested)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const offerTags = sponsor.solutionsOffering ? JSON.parse(sponsor.solutionsOffering) as string[] : []

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
      <div className={`card hover:shadow-md transition-shadow flex flex-col justify-between border-t-4 ${ROLE_BORDER[rep.role] ?? 'border-gray-200'}`}>

        {/* Sponsor identity row */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex-shrink-0 overflow-hidden flex items-center justify-center p-0.5">
            {sponsor.logoUrl ? (
              <img src={sponsor.logoUrl} alt={sponsor.name} loading="lazy" className="w-full h-full object-contain" />
            ) : (
              <span className="text-gray-500 font-bold text-xs">{sponsor.name[0]}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-600">{sponsor.name}</span>
            <span className={`badge text-[10px] ${TIER_COLORS[sponsor.tier] ?? 'bg-gray-100 text-gray-600'}`}>
              {sponsor.tier}
            </span>
          </div>
        </div>

        {/* Rep — the star of the card */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {rep.image ? (
              <img src={rep.image} alt={rep.name ?? ''} loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <span className="text-gray-500 font-bold text-xl">{(rep.name ?? '?')[0].toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-base leading-tight">{rep.name ?? '—'}</p>
            {rep.jobTitle && (
              <p className="text-sm font-semibold text-primary mt-0.5">{rep.jobTitle}</p>
            )}
            <span className={`inline-flex items-center mt-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_COLORS[rep.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {rep.role.charAt(0) + rep.role.slice(1).toLowerCase()}
            </span>
          </div>
        </div>

        <div className="flex-1" />

        {/* Solutions snippet */}
        {offerTags.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Sponsor Offers</p>
            <div className="flex flex-wrap gap-1">
              {offerTags.slice(0, 5).map(t => (
                <SolutionBadge key={t} label={t} />
              ))}
              {offerTags.length > 5 && <span className="badge bg-gray-100 text-gray-500">+{offerTags.length - 5}</span>}
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
          {requested ? '✓ Requested' : `Request Meeting`}
        </button>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <h2 className="font-bold text-gray-900 mb-1">Request a meeting</h2>
            <p className="text-sm text-gray-500 mb-4">
              with <span className="font-semibold text-gray-700">{rep.name}</span>
              <span className="text-gray-400"> · {rep.jobTitle}</span>
              <br />
              <span className="text-xs text-gray-400">{sponsor.name}</span>
            </p>
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
