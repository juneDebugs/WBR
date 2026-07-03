'use client'
import { useState, useMemo, useCallback, useDeferredValue, type ReactElement } from 'react'
import { FilterPanel, Filters, EMPTY_FILTERS } from './FilterPanel'
import { PersonCard } from './PersonCard'
import { SponsorCard } from './SponsorCard'
import { SponsorRepCard } from './SponsorRepCard'
import { getPeopleCategory, PEOPLE_CATEGORIES } from '@/lib/solutions'
import { filterMeetingsPeople, filterMeetingsSponsors } from '@conference/db/src/browse-taxonomy'
import { useBrowseSponsors, useBrowsePeople, useBrowseRequests } from '@/lib/hooks'

const PAGE_SIZE = 48

interface Props {
  mode: 'sponsor-browsing-people' | 'attendee-browsing-sponsors'
}

function safeParse(raw: string | null): string[] {
  if (!raw) return []
  try { return JSON.parse(raw) } catch { return [] }
}

export function BrowseView({ mode }: Props) {
  // TanStack Query: fetch once, cache for 5 min — no server round-trip on navigation
  const { data: rawSponsors = [], isLoading: sponsorsLoading } = useBrowseSponsors()
  const { data: rawPeople = [], isLoading: peopleLoading } = useBrowsePeople()
  const { data: requests } = useBrowseRequests()

  // Pre-parse JSON solutions once instead of on every filter evaluation
  const people = useMemo(() => rawPeople.map(p => ({
    ...p,
    _parsedOffering: safeParse(p.solutionsOffering),
    _parsedSeeking: safeParse(p.solutionsSeeking),
  })), [rawPeople])

  const sponsors = useMemo(() => rawSponsors.map(s => ({
    ...s,
    _parsedOffering: safeParse(s.solutionsOffering),
    _parsedSeeking: safeParse(s.solutionsSeeking),
  })), [rawSponsors])
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [filterOpen, setFilterOpen] = useState(false)
  const [browseTab, setBrowseTab] = useState<'sponsors' | 'people'>('sponsors')
  const [category, setCategory] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const deferredFilters = useDeferredValue(filters)
  const deferredCategory = useDeferredValue(category)

  const requestedUserSet = useMemo(() => new Set(requests?.userIds ?? []), [requests?.userIds])
  const requestedSponsorSet = useMemo(() => new Set(requests?.sponsorIds ?? []), [requests?.sponsorIds])

  const loading = (sponsorsLoading || peopleLoading) && rawSponsors.length === 0 && rawPeople.length === 0

  // Reset pagination when filters or category change
  const handleCategoryChange = useCallback((cat: string | null) => {
    setCategory(cat)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const handleFiltersChange = useCallback((f: Filters) => {
    setFilters(f)
    setVisibleCount(PAGE_SIZE)
  }, [])

  const handleTabChange = useCallback((tab: 'sponsors' | 'people') => {
    setBrowseTab(tab)
    setVisibleCount(PAGE_SIZE)
    setCategory(null)
    setFilters(EMPTY_FILTERS)
  }, [])

  const filteredPeople = useMemo(() => {
    return filterMeetingsPeople(people, deferredFilters, deferredCategory)
  }, [people, deferredFilters, deferredCategory])

  const filteredSponsors = useMemo(() => {
    return filterMeetingsSponsors(sponsors, deferredFilters)
  }, [sponsors, deferredFilters])

  // Category counts for sub-tabs (memoized)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const cat of PEOPLE_CATEGORIES) counts[cat] = 0
    for (const p of people) {
      const cat = getPeopleCategory(p.company)
      if (cat) counts[cat]++
    }
    return counts
  }, [people])

  const activeFilterCount =
    filters.roles.length + filters.industries.length + filters.titleLevels.length +
    filters.jobFunctions.length + filters.companySizes.length + filters.revenues.length +
    filters.solutionsOffering.length + filters.solutionsSeeking.length + (filters.search ? 1 : 0)

  // What to render
  const isSponsorsView = mode === 'sponsor-browsing-people' ? false : browseTab === 'sponsors'
  const isPeopleView = mode === 'sponsor-browsing-people' || browseTab === 'people'

  const visiblePeople = filteredPeople.results.slice(0, visibleCount)

  // Build sponsor rep cards once per (results, requested) change: the card
  // count and the strict/similar boundary both depend on the same rep split.
  const sponsorGrid = useMemo(() => {
    if (!isSponsorsView) return { cards: [] as ReactElement[], strictCards: 0 }
    let strictCards = 0
    const cards = filteredSponsors.results.flatMap((s, i) => {
      const reps = (s.users ?? []).filter((u: any) => u.role !== 'SPONSOR')
      if (i < filteredSponsors.strictCount) strictCards += reps.length || 1
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
    return { cards, strictCards }
  }, [isSponsorsView, filteredSponsors, requestedSponsorSet])

  const strictShown = isSponsorsView ? sponsorGrid.strictCards : filteredPeople.strictCount
  const similarShown = isSponsorsView ? sponsorGrid.cards.length - sponsorGrid.strictCards : filteredPeople.similarCount
  const totalFiltered = isSponsorsView ? sponsorGrid.cards.length : filteredPeople.results.length
  const hasMore = isPeopleView && visibleCount < filteredPeople.results.length

  // The engine only backfills when a chip filter is active, so similarShown > 0
  // already implies an active chip filter.
  const dividerIndex = isSponsorsView ? sponsorGrid.strictCards : filteredPeople.strictCount
  const showDivider = similarShown > 0 && (isSponsorsView || dividerIndex < visiblePeople.length)

  const gridCards = isSponsorsView
    ? [...sponsorGrid.cards]
    : visiblePeople.map(p => <PersonCard key={p.id} person={p} requested={requestedUserSet.has(p.id)} />)
  if (showDivider) {
    gridCards.splice(dividerIndex, 0, (
      <div key="similar-divider" className="col-span-full">
        <div className="flex items-center gap-3 my-2">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Similar matches</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
        {strictShown === 0 && (
          <p className="text-sm text-gray-500 text-center">No exact matches for your filters — showing the closest results.</p>
        )}
      </div>
    ))
  }

  const resultsLabel = strictShown > 0 && similarShown > 0
    ? `${strictShown} result${strictShown !== 1 ? 's' : ''} · ${similarShown} similar`
    : strictShown === 0 && similarShown > 0
      ? `${similarShown} similar result${similarShown !== 1 ? 's' : ''}`
      : `${totalFiltered} result${totalFiltered !== 1 ? 's' : ''}`

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 border-r border-gray-100 bg-white overflow-y-auto">
        <div className="p-5">
          <h2 className="font-bold text-gray-900 text-sm mb-4">Filters</h2>
          <FilterPanel filters={filters} onChange={handleFiltersChange} mode={mode === 'sponsor-browsing-people' ? mode : browseTab === 'people' ? 'sponsor-browsing-people' : mode} />
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
          <FilterPanel filters={filters} onChange={handleFiltersChange} mode={mode === 'sponsor-browsing-people' ? mode : browseTab === 'people' ? 'sponsor-browsing-people' : mode} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">

          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="font-bold text-gray-900">
                {mode === 'sponsor-browsing-people'
                  ? 'Browse Attendees & Speakers'
                  : browseTab === 'sponsors' ? 'Solution Providers' : 'People'}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">{loading ? 'Loading...' : resultsLabel}</p>
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

          {/* Sponsors / People tab switcher (attendee mode only) */}
          {mode === 'attendee-browsing-sponsors' && (
            <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-xl w-fit">
              <button
                onClick={() => handleTabChange('sponsors')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  browseTab === 'sponsors' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Solution Providers
              </button>
              <button
                onClick={() => handleTabChange('people')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  browseTab === 'people' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                People
              </button>
            </div>
          )}

          {/* Category sub-tabs (People view only) */}
          {isPeopleView && mode === 'attendee-browsing-sponsors' && (
            <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
              <CategoryTab label="All" count={people.length} active={category === null} onClick={() => handleCategoryChange(null)} />
              {PEOPLE_CATEGORIES.map(cat => (
                <CategoryTab key={cat} label={cat} count={categoryCounts[cat]} active={category === cat} onClick={() => handleCategoryChange(cat)} />
              ))}
            </div>
          )}

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {filters.industries.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => handleFiltersChange({ ...filters, industries: filters.industries.filter(x => x !== v) })} />
              ))}
              {filters.titleLevels.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => handleFiltersChange({ ...filters, titleLevels: filters.titleLevels.filter(x => x !== v) })} />
              ))}
              {filters.jobFunctions.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => handleFiltersChange({ ...filters, jobFunctions: filters.jobFunctions.filter(x => x !== v) })} />
              ))}
              {filters.roles.map(v => (
                <ActiveChip key={v} label={v.charAt(0) + v.slice(1).toLowerCase()} onRemove={() => handleFiltersChange({ ...filters, roles: filters.roles.filter(x => x !== v) })} />
              ))}
              {filters.companySizes.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => handleFiltersChange({ ...filters, companySizes: filters.companySizes.filter(x => x !== v) })} />
              ))}
              {filters.revenues.map(v => (
                <ActiveChip key={v} label={v} onRemove={() => handleFiltersChange({ ...filters, revenues: filters.revenues.filter(x => x !== v) })} />
              ))}
              {filters.solutionsOffering.map(v => (
                <ActiveChip key={`off-${v}`} label={`Offers: ${v}`} onRemove={() => handleFiltersChange({ ...filters, solutionsOffering: filters.solutionsOffering.filter(x => x !== v) })} />
              ))}
              {filters.solutionsSeeking.map(v => (
                <ActiveChip key={`seek-${v}`} label={`Seeks: ${v}`} onRemove={() => handleFiltersChange({ ...filters, solutionsSeeking: filters.solutionsSeeking.filter(x => x !== v) })} />
              ))}
              <button onClick={() => handleFiltersChange(EMPTY_FILTERS)} className="text-xs text-gray-400 hover:text-red-500 px-2 py-1">
                Clear all
              </button>
            </div>
          )}

          {/* Grid */}
          {totalFiltered === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">No results match your filters.</p>
              <button onClick={() => { handleFiltersChange(EMPTY_FILTERS); handleCategoryChange(null) }} className="mt-2 text-primary text-sm hover:underline">Clear filters</button>
            </div>
          ) : (
            <>
              <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
                {gridCards}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    className="px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:border-primary hover:text-primary transition-colors shadow-sm"
                  >
                    Show more ({filteredPeople.results.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CategoryTab({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-primary text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-primary hover:text-primary'
      }`}
    >
      {label}
      <span className={`ml-1.5 text-xs ${active ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
    </button>
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
