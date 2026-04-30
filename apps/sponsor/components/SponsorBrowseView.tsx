'use client'
import { useState, useMemo } from 'react'
import { getIndustry, getJobFunction, getTitleLevel } from '@/lib/solutions'
import { FilterPanel, Filters, EMPTY_FILTERS } from './FilterPanel'
import { SolutionBadge } from './SolutionBadge'

function parseArr(val: string | null | undefined): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

export function SponsorBrowseView({
  people, sponsorId, isStaff,
}: {
  people: any[]; sponsorId: string | null; isStaff: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [requested, setRequested] = useState<Set<string>>(new Set())
  const [showModal, setShowModal] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const filtered = useMemo(() => {
    return people.filter(p => {
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!`${p.name} ${p.company} ${p.jobTitle} ${p.bio}`.toLowerCase().includes(q)) return false
      }
      if (filters.roles.length && !filters.roles.includes(p.role)) return false
      if (filters.jobFunctions.length && !filters.jobFunctions.includes(getJobFunction(p.jobTitle))) return false
      if (filters.industries.length && !filters.industries.includes(getIndustry(p.company))) return false
      if (filters.companySizes.length && !filters.companySizes.includes(p.companySize)) return false
      if (filters.revenues.length && !filters.revenues.includes(p.annualRevenue)) return false
      if (filters.titleLevels.length && !filters.titleLevels.includes(getTitleLevel(p.jobTitle))) return false
      if (filters.solutionsOffering.length) {
        const their: string[] = parseArr(p.solutionsOffering)
        if (!filters.solutionsOffering.some(s => their.includes(s))) return false
      }
      if (filters.solutionsSeeking.length) {
        const their: string[] = parseArr(p.solutionsSeeking)
        if (!filters.solutionsSeeking.some(s => their.includes(s))) return false
      }
      return true
    })
  }, [people, filters])

  async function requestMeeting() {
    if (!sponsorId || !showModal) return
    setSending(true)
    try {
      await fetch('/api/request-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: showModal, message }),
      })
      setRequested(prev => new Set([...prev, showModal]))
    } finally {
      setSending(false)
      setShowModal(null)
      setMessage('')
    }
  }

  const modalPerson = showModal ? filtered.find(p => p.id === showModal) ?? people.find(p => p.id === showModal) : null

  const activeFilterCount =
    filters.roles.length + filters.industries.length + filters.titleLevels.length +
    filters.jobFunctions.length + filters.companySizes.length + filters.revenues.length +
    filters.solutionsOffering.length + filters.solutionsSeeking.length + (filters.search ? 1 : 0)

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 border-r border-gray-100 bg-white overflow-y-auto">
        <div className="p-5">
          <h2 className="font-bold text-gray-900 text-sm mb-4">Filters</h2>
          <FilterPanel filters={filters} onChange={setFilters} mode="sponsor-browsing-people" />
        </div>
      </aside>

      {/* Mobile filter drawer backdrop */}
      {filterOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setFilterOpen(false)} />
      )}

      {/* Mobile filter drawer */}
      <div className={`fixed inset-y-0 left-0 w-80 max-w-[90vw] bg-white z-40 shadow-2xl overflow-y-auto transition-transform lg:hidden ${filterOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Filters</h2>
          <button onClick={() => setFilterOpen(false)} className="p-1 rounded-lg hover:bg-gray-100">
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5">
          <FilterPanel filters={filters} onChange={setFilters} mode="sponsor-browsing-people" />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">

          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-bold text-gray-900">Browse Attendees & Speakers</h1>
              <p className="text-xs text-gray-400 mt-0.5">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <button
              onClick={() => setFilterOpen(true)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-primary text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">{activeFilterCount}</span>
              )}
            </button>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {filters.industries.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => setFilters(f => ({ ...f, industries: f.industries.filter(x => x !== v) }))} />
              ))}
              {filters.titleLevels.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => setFilters(f => ({ ...f, titleLevels: f.titleLevels.filter(x => x !== v) }))} />
              ))}
              {filters.jobFunctions.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => setFilters(f => ({ ...f, jobFunctions: f.jobFunctions.filter(x => x !== v) }))} />
              ))}
              {filters.roles.map(v => (
                <ActiveChip key={v} label={v.charAt(0) + v.slice(1).toLowerCase()} onRemove={() => setFilters(f => ({ ...f, roles: f.roles.filter(x => x !== v) }))} />
              ))}
              {filters.companySizes.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => setFilters(f => ({ ...f, companySizes: f.companySizes.filter(x => x !== v) }))} />
              ))}
              {filters.revenues.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => setFilters(f => ({ ...f, revenues: f.revenues.filter(x => x !== v) }))} />
              ))}
              {filters.solutionsOffering.map(v => (
                <ActiveChip key={`off-${v}`} label={`Offers: ${v}`} onRemove={() => setFilters(f => ({ ...f, solutionsOffering: f.solutionsOffering.filter(x => x !== v) }))} />
              ))}
              {filters.solutionsSeeking.map(v => (
                <ActiveChip key={`seek-${v}`} label={`Seeks: ${v}`} onRemove={() => setFilters(f => ({ ...f, solutionsSeeking: f.solutionsSeeking.filter(x => x !== v) }))} />
              ))}
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1">
                Clear all
              </button>
            </div>
          )}

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">No results match your filters.</p>
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="mt-2 text-primary text-sm hover:underline">Clear filters</button>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
              {filtered.map(p => {
                const theirSeeking = parseArr(p.solutionsSeeking)
                const theirOffering = parseArr(p.solutionsOffering)
                const isRequested = requested.has(p.id)
                const industry = getIndustry(p.company)
                const jobFn = getJobFunction(p.jobTitle)
                const titleLevel = getTitleLevel(p.jobTitle)

                return (
                  <div key={p.id} className="card hover:shadow-md transition-shadow flex flex-col justify-between">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                        {p.image ? (
                          <img src={p.image} alt={p.name ?? ''} loading="lazy" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary font-bold text-lg">
                            {(p.name ?? '?')[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900 text-sm">{p.name ?? '—'}</h3>
                          <span className={`badge ${
                            p.role === 'SPEAKER' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {p.role.charAt(0) + p.role.slice(1).toLowerCase()}
                          </span>
                        </div>
                        {p.jobTitle && (
                          <p className="text-xs text-gray-700 font-medium mt-0.5">{p.jobTitle}</p>
                        )}
                        {p.company && (
                          <p className="text-xs text-gray-400">{p.company}</p>
                        )}
                      </div>
                    </div>

                    {/* Industry / Function / Title metadata */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="badge bg-violet-50 text-violet-700">{industry}</span>
                      <span className="badge bg-sky-50 text-sky-700">{jobFn}</span>
                      <span className="badge bg-gray-100 text-gray-600">{titleLevel}</span>
                      {p.annualRevenue && (
                        <span className="badge bg-emerald-50 text-emerald-700">{p.annualRevenue} ARR</span>
                      )}
                    </div>

                    {p.bio && <p className="text-xs text-gray-500 mb-3 line-clamp-2">{p.bio}</p>}
                    <div className="flex-1" />

                    {theirOffering.length > 0 && (
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">Offers</p>
                        <div className="flex flex-wrap gap-1">
                          {theirOffering.slice(0, 4).map(t => <SolutionBadge key={t} label={t} />)}
                          {theirOffering.length > 4 && <span className="badge bg-gray-100 text-gray-500">+{theirOffering.length - 4}</span>}
                        </div>
                      </div>
                    )}

                    {theirSeeking.length > 0 && (
                      <div className="mb-3 bg-primary/5 rounded-xl p-2.5">
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1.5">Looking For</p>
                        <div className="flex flex-wrap gap-1">
                          {theirSeeking.slice(0, 5).map(t => <SolutionBadge key={t} label={t} />)}
                          {theirSeeking.length > 5 && <span className="badge bg-gray-100 text-gray-500">+{theirSeeking.length - 5}</span>}
                        </div>
                      </div>
                    )}

                    {/* Request meeting */}
                    {sponsorId && (
                      <button
                        onClick={() => isRequested ? null : setShowModal(p.id)}
                        disabled={isRequested}
                        className={`w-full py-2 rounded-xl text-sm font-semibold transition-colors ${
                          isRequested
                            ? 'bg-green-50 text-green-600 cursor-default'
                            : 'bg-primary text-white hover:bg-primary-dark active:scale-95'
                        }`}
                      >
                        {isRequested ? '✓ Requested' : 'Request Meeting'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Request Meeting Modal */}
      {showModal && modalPerson && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <h2 className="font-bold text-gray-900 mb-1">Request a meeting</h2>
            <p className="text-sm text-gray-500 mb-4">with {modalPerson.name} ({modalPerson.company ?? modalPerson.role})</p>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="What would you like to discuss? (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 mb-4 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => { setShowModal(null); setMessage('') }} className="btn-secondary flex-1">Cancel</button>
              <button onClick={requestMeeting} disabled={sending} className="btn-primary flex-1">
                {sending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-primary-dark">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  )
}
