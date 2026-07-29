'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DirectoryRow } from '@conference/db'
import { useCompanyDirectory } from '@/lib/scheduler-hooks'
import { FILL_TARGET, meterClass } from '@/lib/meetings-ui'
import { fmtDate } from '@/lib/format'

type SortKey = 'name' | 'confirmed' | 'fill'

// Section order + visual identity for the tier bands. Unknown tiers fall back
// to OTHER and render after Bronze.
const TIER_ORDER = ['PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as const

const TIER_STYLES: Record<string, { title: string; band: string; gem: string; label: string; count: string }> = {
  PLATINUM: {
    title: 'Platinum',
    band: 'bg-gradient-to-r from-slate-100 via-slate-50 to-white',
    gem: 'from-slate-300 via-slate-400 to-slate-600',
    label: 'text-slate-700',
    count: 'bg-slate-200/70 text-slate-700',
  },
  GOLD: {
    title: 'Gold',
    band: 'bg-gradient-to-r from-amber-100/80 via-amber-50 to-white',
    gem: 'from-amber-300 via-amber-400 to-yellow-600',
    label: 'text-amber-800',
    count: 'bg-amber-200/60 text-amber-800',
  },
  SILVER: {
    title: 'Silver',
    band: 'bg-gradient-to-r from-gray-100 via-gray-50 to-white',
    gem: 'from-gray-200 via-gray-300 to-gray-500',
    label: 'text-gray-600',
    count: 'bg-gray-200/70 text-gray-600',
  },
  BRONZE: {
    title: 'Bronze',
    band: 'bg-gradient-to-r from-orange-100/80 via-orange-50 to-white',
    gem: 'from-orange-300 via-orange-400 to-orange-700',
    label: 'text-orange-800',
    count: 'bg-orange-200/60 text-orange-800',
  },
  OTHER: {
    title: 'Other',
    band: 'bg-gradient-to-r from-fill via-fill/50 to-white',
    gem: 'from-ink-3 to-ink-2',
    label: 'text-ink-2',
    count: 'bg-fill-2 text-ink-2',
  },
}

type TierSection = {
  tier: string
  rows: DirectoryRow[]
  confirmed: number
  avgFill: number
}

// HIG grouped table of every sponsor company with request/meeting counts and
// a fill meter, sectioned by sponsorship tier (Platinum → Gold → Silver →
// Bronze). Each tier band carries its aggregate confirmed count and average
// fill; each row is one click target that opens the company's schedule matrix
// (?tab=companies&company=<id>).
export function CompanyDirectory() {
  const router = useRouter()
  const { data, isLoading, isError, refetch } = useCompanyDirectory()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const { sections, matchCount } = useMemo(() => {
    const all = data ?? []
    const q = query.trim().toLowerCase()
    const filtered = q ? all.filter(r => r.name.toLowerCase().includes(q)) : [...all]
    filtered.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortKey === 'confirmed') cmp = a.confirmed - b.confirmed
      else cmp = a.fillRate - b.fillRate
      return sortDir === 'asc' ? cmp : -cmp
    })

    const byTier = new Map<string, DirectoryRow[]>()
    for (const row of filtered) {
      const key = TIER_ORDER.includes(row.tier as (typeof TIER_ORDER)[number]) ? row.tier : 'OTHER'
      const bucket = byTier.get(key)
      if (bucket) bucket.push(row)
      else byTier.set(key, [row])
    }

    const sections: TierSection[] = [...TIER_ORDER, 'OTHER']
      .filter(tier => byTier.has(tier))
      .map(tier => {
        const rows = byTier.get(tier)!
        const confirmed = rows.reduce((sum, r) => sum + r.confirmed, 0)
        const avgFill = Math.round((rows.reduce((sum, r) => sum + r.fillRate, 0) / rows.length) * 100)
        return { tier, rows, confirmed, avgFill }
      })

    return { sections, matchCount: filtered.length }
  }, [data, query, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'name' ? 'asc' : 'desc')
    }
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | undefined {
    if (sortKey !== key) return undefined
    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? <span aria-hidden="true" className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  if (isError) {
    return (
      <div className="rounded-xl bg-danger-soft text-danger-ink text-sm px-4 py-3" role="alert">
        Couldn&rsquo;t load the company directory.{' '}
        <button type="button" onClick={() => refetch()} className="underline font-medium">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <input
          type="search"
          className="input w-64"
          placeholder="Search companies"
          aria-label="Search companies"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {data && (
          <p className="text-caption text-ink-2">
            {matchCount} of {data.length} companies
          </p>
        )}
      </div>

      <div className="bg-white border border-hairline rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-fill border-b border-hairline">
            <tr>
              <th className="text-left px-4 py-3" aria-sort={ariaSort('name')}>
                <button
                  type="button"
                  onClick={() => toggleSort('name')}
                  className="text-xs font-semibold text-ink-2 uppercase tracking-wide hover:text-ink transition-colors"
                >
                  Company{sortIndicator('name')}
                </button>
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Last login</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Requests received</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Requests made</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Pending</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-ink-2 uppercase tracking-wide">Unscheduled</th>
              <th className="text-right px-4 py-3" aria-sort={ariaSort('confirmed')}>
                <button
                  type="button"
                  onClick={() => toggleSort('confirmed')}
                  className="text-xs font-semibold text-ink-2 uppercase tracking-wide hover:text-ink transition-colors"
                >
                  Confirmed{sortIndicator('confirmed')}
                </button>
              </th>
              <th className="text-left px-4 py-3 w-40" aria-sort={ariaSort('fill')}>
                <button
                  type="button"
                  onClick={() => toggleSort('fill')}
                  className="text-xs font-semibold text-ink-2 uppercase tracking-wide hover:text-ink transition-colors"
                >
                  Meeting fill{sortIndicator('fill')}
                </button>
              </th>
            </tr>
          </thead>
          {isLoading && !data ? (
            <tbody className="divide-y divide-hairline">
              {[...Array(6)].map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="skeleton w-8 h-8 rounded-lg" />
                      <div className="skeleton h-4 w-40" />
                    </div>
                  </td>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-3.5">
                      <div className="skeleton h-4 w-12 ml-auto" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : (
            sections.map(section => (
              <TierSectionBody
                key={section.tier}
                section={section}
                onOpen={id => router.push(`?tab=companies&company=${id}`)}
              />
            ))
          )}
        </table>

        {!isLoading && matchCount === 0 && (
          <div className="empty-state">
            <p className="font-medium text-ink">No companies match &ldquo;{query}&rdquo;</p>
            <p className="text-sm text-ink-2">Try a different name.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// One <tbody> per tier: a tinted band row announcing the tier with its
// aggregates, followed by that tier's company rows.
function TierSectionBody({ section, onOpen }: { section: TierSection; onOpen: (id: string) => void }) {
  const style = TIER_STYLES[section.tier] ?? TIER_STYLES.OTHER
  return (
    <tbody className="divide-y divide-hairline border-t border-hairline">
      <tr className={style.band}>
        <th colSpan={8} scope="colgroup" className="px-4 py-2.5 text-left font-normal">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`w-4 h-4 rounded bg-gradient-to-br ${style.gem} shadow-sm ring-1 ring-black/10 rotate-45 scale-90`}
              />
              <span className={`text-sm font-bold tracking-wide ${style.label}`}>{style.title}</span>
              <span className={`badge text-caption ${style.count}`}>
                {section.rows.length} {section.rows.length === 1 ? 'company' : 'companies'}
              </span>
            </div>
            <p className="text-caption tabular-nums text-ink-2">
              {section.confirmed} confirmed · {section.avgFill}% avg fill
            </p>
          </div>
        </th>
      </tr>
      {section.rows.map(row => (
        <DirectoryTableRow key={row.id} row={row} onOpen={() => onOpen(row.id)} />
      ))}
    </tbody>
  )
}

function DirectoryTableRow({ row, onOpen }: { row: DirectoryRow; onOpen: () => void }) {
  return (
    <tr
      className="cursor-pointer hover:bg-fill has-[a:focus-visible]:bg-fill transition-colors align-middle"
      onClick={e => {
        // The name Link is the row's single focusable control; let it handle
        // its own clicks so navigation doesn't fire twice.
        if ((e.target as HTMLElement).closest('a')) return
        onOpen()
      }}
    >
      <td className="px-4 py-3.5">
        <Link
          href={`?tab=companies&company=${row.id}`}
          className="flex items-center gap-2.5 rounded-lg"
          aria-label={`Open schedule for ${row.name}`}
        >
          {row.logoUrl ? (
            <div className="w-8 h-8 rounded-lg border border-hairline bg-white flex items-center justify-center overflow-hidden flex-shrink-0 p-0.5">
              <Image src={row.logoUrl} alt="" width={32} height={32} className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-fill flex items-center justify-center text-ink-2 font-bold text-sm flex-shrink-0">
              {row.name[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <span className="font-semibold text-ink">{row.name}</span>
        </Link>
      </td>
      <td className="px-4 py-3.5">
        {/* PRD 1.1 "login stats": most recent rep activity + how many reps hold accounts */}
        <p className="text-sm text-ink-2">{row.lastLogin ? fmtDate(row.lastLogin) : '—'}</p>
        <p className="text-caption text-ink-3">{row.numLogins} rep{row.numLogins === 1 ? '' : 's'}</p>
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-2">{row.requestsReceived}</td>
      <td className="px-4 py-3.5 text-right tabular-nums text-ink-2">{row.requestsMade}</td>
      <td className="px-4 py-3.5 text-right">
        {row.pending > 0 ? (
          <span className="badge badge-warning tabular-nums">{row.pending}</span>
        ) : (
          <span className="tabular-nums text-ink-3">0</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        {row.unscheduled > 0 ? (
          <span className="badge badge-brand tabular-nums">{row.unscheduled}</span>
        ) : (
          <span className="tabular-nums text-ink-3">0</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-ink">{row.confirmed}</td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <div className="meter w-16 flex-shrink-0">
            <div className={`meter-fill ${meterClass(row.fillRate)}`} style={{ width: `${Math.min(row.fillRate * 100, 100)}%` }} />
          </div>
          <span className="text-caption tabular-nums text-ink-2 whitespace-nowrap">
            {row.confirmed}/{FILL_TARGET}
          </span>
        </div>
      </td>
    </tr>
  )
}
