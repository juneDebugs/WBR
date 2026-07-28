'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { DirectoryRow } from '@conference/db'
import { useCompanyDirectory } from '@/lib/scheduler-hooks'
import { TIER_COLORS, TIER_FALLBACK, FILL_TARGET, meterClass } from '@/lib/meetings-ui'
import { fmtDate } from '@/lib/format'

type SortKey = 'name' | 'confirmed' | 'fill'

// HIG grouped table of every sponsor company with request/meeting counts and
// a fill meter. Each row is one click target that opens the company's
// schedule matrix (?tab=companies&company=<id>).
export function CompanyDirectory() {
  const router = useRouter()
  const { data, isLoading, isError, refetch } = useCompanyDirectory()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const rows = useMemo(() => {
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
    return filtered
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
            {rows.length} of {data.length} companies
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
          <tbody className="divide-y divide-hairline">
            {isLoading && !data
              ? [...Array(6)].map((_, i) => (
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
                ))
              : rows.map(row => <DirectoryTableRow key={row.id} row={row} onOpen={() => router.push(`?tab=companies&company=${row.id}`)} />)}
          </tbody>
        </table>

        {!isLoading && rows.length === 0 && (
          <div className="empty-state">
            <p className="font-medium text-ink">No companies match &ldquo;{query}&rdquo;</p>
            <p className="text-sm text-ink-2">Try a different name.</p>
          </div>
        )}
      </div>
    </div>
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
          <span className={`badge text-caption ${TIER_COLORS[row.tier] ?? TIER_FALLBACK}`}>{row.tier}</span>
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
