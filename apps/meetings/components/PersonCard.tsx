'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'

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
  SPEAKER: 'bg-brand-100 text-brand-700',
}

export function PersonCard({ person, requested: initialRequested }: Props) {
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
        body: JSON.stringify({ targetUserId: person.id, message, priority }),
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
      <div className="card hover:shadow-elevated transition-shadow flex flex-col justify-between border-t-4" style={{ borderColor }}>
        <div className="flex items-start gap-3 mb-3">
          <div className="w-12 h-12 rounded-xl bg-fill flex-shrink-0 overflow-hidden">
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
              <h3 className="font-semibold text-ink text-sm">{person.name ?? '—'}</h3>
              <span className={`badge ${ROLE_COLORS[person.role] ?? 'badge-neutral'}`}>
                {person.role.charAt(0) + person.role.slice(1).toLowerCase()}
              </span>
            </div>
            {person.jobTitle && (
              <p className="text-xs text-ink font-medium mt-0.5">{person.jobTitle}</p>
            )}
            {person.company && (
              <p className="text-xs text-ink-2">{person.company}</p>
            )}
          </div>
        </div>

        {/* Company description — iOS style */}
        {companyDesc && (
          <div className="mb-3 rounded-2xl bg-fill px-3.5 py-2.5">
            <p className="text-footnote leading-relaxed text-ink-2">{companyDesc}</p>
          </div>
        )}

        {/* Industry / Function / Title metadata */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="badge bg-brand-50 text-brand-700">{industry}</span>
          <span className="badge bg-sky-50 text-sky-700">{jobFn}</span>
          <span className="badge badge-neutral">{titleLevel}</span>
          {person.annualRevenue && (
            <span className="badge bg-emerald-50 text-emerald-700">{person.annualRevenue} ARR</span>
          )}
        </div>

        {person.bio && <p className="text-xs text-ink-2 mb-3 line-clamp-2">{person.bio}</p>}
        <div className="flex-1" />

        {offerTags.length > 0 && (
          <div className="mb-2">
            <p className="text-caption font-semibold text-ink-2 uppercase mb-1">Offers</p>
            <div className="flex flex-wrap gap-1">
              {offerTags.slice(0, 4).map(t => <SolutionBadge key={t} label={t} />)}
              {offerTags.length > 4 && <span className="badge badge-neutral">+{offerTags.length - 4}</span>}
            </div>
          </div>
        )}

        {seekTags.length > 0 && (
          <div className="mb-3 bg-primary/5 rounded-xl p-2.5">
            <p className="text-caption font-bold text-primary uppercase tracking-wide mb-1.5">Looking For</p>
            <div className="flex flex-wrap gap-1">
              {seekTags.slice(0, 5).map(t => <SolutionBadge key={t} label={t} />)}
              {seekTags.length > 5 && <span className="badge badge-neutral">+{seekTags.length - 5}</span>}
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
            aria-label={`Request a meeting with ${person.name ?? 'this person'}`}
            className="relative bg-surface rounded-2xl w-full max-w-md p-5 shadow-elevated"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="font-bold text-ink mb-1">Request a meeting</h2>
            <p className="text-sm text-ink-2 mb-4">with {person.name} ({person.company ?? person.role})</p>
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
