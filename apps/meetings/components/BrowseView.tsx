'use client'
import { useState, useMemo } from 'react'
import { FilterPanel, Filters, EMPTY_FILTERS } from './FilterPanel'
import { PersonCard } from './PersonCard'
import { SponsorCard } from './SponsorCard'
import { SponsorRepCard } from './SponsorRepCard'
import { getIndustry, getJobFunction, getTitleLevel } from '@/lib/solutions'

interface Props {
  mode: 'sponsor-browsing-people' | 'attendee-browsing-sponsors'
  people: any[]
  sponsors: any[]
  requestedUserIds: string[]
  requestedSponsorIds: string[]
}

export function BrowseView({ mode, people, sponsors, requestedUserIds, requestedSponsorIds }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [browseTab, setBrowseTab] = useState<'sponsors' | 'people'>('sponsors')

  const requestedUserSet = new Set(requestedUserIds)
  const requestedSponsorSet = new Set(requestedSponsorIds)

  const filteredPeople = useMemo(() => {
    return people.filter(p => {
      if (filters.roles.length > 0 && !filters.roles.includes(p.role)) return false
      if (filters.industries.length > 0 && !filters.industries.includes(getIndustry(p.company))) return false
      if (filters.titleLevels.length > 0 && !filters.titleLevels.includes(getTitleLevel(p.jobTitle))) return false
      if (filters.jobFunctions.length > 0 && !filters.jobFunctions.includes(getJobFunction(p.jobTitle))) return false
      if (filters.companySizes.length > 0 && !filters.companySizes.includes(p.companySize)) return false
      if (filters.revenues.length > 0 && !filters.revenues.includes(p.annualRevenue)) return false
      if (filters.solutionsOffering.length > 0) {
        const pOffers: string[] = p.solutionsOffering ? JSON.parse(p.solutionsOffering) : []
        if (!filters.solutionsOffering.some(s => pOffers.includes(s))) return false
      }
      if (filters.solutionsSeeking.length > 0) {
        const pSeeks: string[] = p.solutionsSeeking ? JSON.parse(p.solutionsSeeking) : []
        if (!filters.solutionsSeeking.some(s => pSeeks.includes(s))) return false
      }
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!`${p.name ?? ''} ${p.company ?? ''} ${p.jobTitle ?? ''} ${p.email ?? ''}`.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [people, filters])

  const filteredSponsors = useMemo(() => {
    return sponsors.filter(s => {
      if (filters.industries.length > 0 && !filters.industries.includes(getIndustry(s.name))) return false
      if (filters.companySizes.length > 0 && !filters.companySizes.includes(s.companySize)) return false
      if (filters.revenues.length > 0 && !filters.revenues.includes(s.annualRevenue)) return false
      if (filters.solutionsOffering.length > 0) {
        const sOffers: string[] = s.solutionsOffering ? JSON.parse(s.solutionsOffering) : []
        if (!filters.solutionsOffering.some(x => sOffers.includes(x))) return false
      }
      if (filters.solutionsSeeking.length > 0) {
        const sSeeks: string[] = s.solutionsSeeking ? JSON.parse(s.solutionsSeeking) : []
        if (!filters.solutionsSeeking.some(x => sSeeks.includes(x))) return false
      }
      if (filters.search) {
        const q = filters.search.toLowerCase()
        if (!`${s.name} ${s.description ?? ''}`.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [sponsors, filters])

  const activeFilterCount =
    filters.roles.length + filters.industries.length + filters.titleLevels.length +
    filters.jobFunctions.length + filters.companySizes.length + filters.revenues.length +
    filters.solutionsOffering.length + filters.solutionsSeeking.length + (filters.search ? 1 : 0)

  // What to render in the grid
  const isSponsorsView = mode === 'sponsor-browsing-people' ? false : browseTab === 'sponsors'
  const gridItems = isSponsorsView ? filteredSponsors : filteredPeople
  const totalItems = isSponsorsView
    ? filteredSponsors.flatMap(s => { const r = (s.users ?? []).filter((u: any) => u.role !== 'SPONSOR'); return r.length ? r : [s] }).length
    : filteredPeople.length

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 border-r border-gray-100 bg-white overflow-y-auto">
        <div className="p-5">
          <h2 className="font-bold text-gray-900 text-sm mb-4">Filters</h2>
          <FilterPanel filters={filters} onChange={setFilters} mode={mode === 'sponsor-browsing-people' ? mode : browseTab === 'people' ? 'sponsor-browsing-people' : mode} />
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
          <FilterPanel filters={filters} onChange={setFilters} mode={mode === 'sponsor-browsing-people' ? mode : browseTab === 'people' ? 'sponsor-browsing-people' : mode} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">

          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-bold text-gray-900">
                {mode === 'sponsor-browsing-people' ? 'Browse Attendees & Speakers' : 'Solution Providers'}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">{totalItems} result{totalItems !== 1 ? 's' : ''}</p>
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
          {totalItems === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">No results match your filters.</p>
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="mt-2 text-primary text-sm hover:underline">Clear filters</button>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
              {isSponsorsView
                ? filteredSponsors.flatMap(s => {
                    const reps = (s.users ?? []).filter((u: any) => u.role !== 'SPONSOR')
                    if (reps.length === 0) {
                      return [<SponsorCard key={s.id} sponsor={s} requested={requestedSponsorSet.has(s.id)} />]
                    }
                    return reps.map((rep: any) => (
                      <SponsorRepCard
                        key={`${s.id}-${rep.id}`}
                        sponsor={s}
                        rep={rep}
                        requested={requestedSponsorSet.has(s.id)}
                      />
                    ))
                  })
                : filteredPeople.map(p => (
                    <PersonCard key={p.id} person={p} requested={requestedUserSet.has(p.id)} />
                  ))
              }
            </div>
          )}
        </div>
      </div>
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
