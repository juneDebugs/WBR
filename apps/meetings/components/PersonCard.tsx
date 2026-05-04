'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

import { getIndustry, getJobFunction, getTitleLevel, getCompanyDescription, getBorderColorForSeeking } from '@/lib/solutions'
import { SolutionBadge } from './SolutionBadge'

interface Person {
  id: string
  name: string | null
  email: string | null
  image: string | null
  company: string | null
  jobTitle: string | null
  role: string
  bio: string | null
  companySize: string | null
  annualRevenue: string | null
  solutionsOffering: string | null
  solutionsSeeking: string | null
  website: string | null
}

interface Props {
  person: Person
  requested: boolean
}

const ROLE_COLORS: Record<string, string> = {
  ATTENDEE: 'bg-blue-100 text-blue-700',
  SPEAKER: 'bg-purple-100 text-purple-700',
}

export function PersonCard({ person, requested: initialRequested }: Props) {
  const [requested, setRequested] = useState(initialRequested)
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const offerTags = person.solutionsOffering ? JSON.parse(person.solutionsOffering) as string[] : []
  const seekTags = person.solutionsSeeking ? JSON.parse(person.solutionsSeeking) as string[] : []
  const industry = getIndustry(person.company)
  const jobFn = getJobFunction(person.jobTitle)
  const titleLevel = getTitleLevel(person.jobTitle)
  const companyDesc = getCompanyDescription(person.company)
  const borderColor = getBorderColorForSeeking(person.solutionsSeeking)

  async function sendRequest() {
    setLoading(true)
    try {
      const res = await fetch('/api/meeting-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: person.id, message }),
      })
      if (res.ok) { setRequested(true); setShowModal(false); router.refresh() }
      else if (res.status === 409) { setRequested(true); setShowModal(false); router.refresh() }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="card hover:shadow-md transition-shadow flex flex-col justify-between border-t-4" style={{ borderColor }}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
            {person.image ? (
              <img src={person.image} alt={person.name ?? ''} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold text-lg">
                {(person.name ?? '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm">{person.name ?? '—'}</h3>
              <span className={`badge ${ROLE_COLORS[person.role] ?? 'bg-gray-100 text-gray-600'}`}>
                {person.role.charAt(0) + person.role.slice(1).toLowerCase()}
              </span>
            </div>
            {person.jobTitle && (
              <p className="text-xs text-gray-700 font-medium mt-0.5">{person.jobTitle}</p>
            )}
            {person.company && (
              <p className="text-xs text-gray-400">{person.company}</p>
            )}
          </div>
        </div>

        {/* Company description — iOS style */}
        {companyDesc && (
          <div className="mb-3 rounded-2xl bg-gray-50 px-3.5 py-2.5">
            <p className="text-[11px] leading-relaxed text-gray-500">{companyDesc}</p>
          </div>
        )}

        {/* Industry / Function / Title metadata */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="badge bg-violet-50 text-violet-700">{industry}</span>
          <span className="badge bg-sky-50 text-sky-700">{jobFn}</span>
          <span className="badge bg-gray-100 text-gray-600">{titleLevel}</span>
          {person.annualRevenue && (
            <span className="badge bg-emerald-50 text-emerald-700">{person.annualRevenue} ARR</span>
          )}
        </div>

        {person.bio && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{person.bio}</p>}
        <div className="flex-1" />

        {offerTags.length > 0 && (
          <div className="mb-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Offers</p>
            <div className="flex flex-wrap gap-1">
              {offerTags.slice(0, 4).map(t => <SolutionBadge key={t} label={t} />)}
              {offerTags.length > 4 && <span className="badge bg-gray-100 text-gray-500">+{offerTags.length - 4}</span>}
            </div>
          </div>
        )}

        {seekTags.length > 0 && (
          <div className="mb-3 bg-primary/5 rounded-xl p-2.5">
            <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1.5">Looking For</p>
            <div className="flex flex-wrap gap-1">
              {seekTags.slice(0, 5).map(t => <SolutionBadge key={t} label={t} />)}
              {seekTags.length > 5 && <span className="badge bg-gray-100 text-gray-500">+{seekTags.length - 5}</span>}
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
            <p className="text-sm text-gray-500 mb-4">with {person.name} ({person.company ?? person.role})</p>
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
