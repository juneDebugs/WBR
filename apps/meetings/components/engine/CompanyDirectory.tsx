'use client'
import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import type { DirectoryRow } from '@conference/db'
import { fillMeterClass, initials } from './format'

type SortKey = 'name' | 'requests' | 'pending' | 'unscheduled' | 'confirmed' | 'fillRate'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'name', label: 'Company' },
  { key: 'requests', label: 'Requests', numeric: true },
  { key: 'pending', label: 'Needs review', numeric: true },
  { key: 'unscheduled', label: 'Unscheduled', numeric: true },
  { key: 'confirmed', label: 'Confirmed', numeric: true },
  { key: 'fillRate', label: 'Fill rate' },
]

export function CompanyDirectory({ onOpen }: { onOpen: (row: { id: string; name: string }) => void }) {
  const [rows, setRows] = useState<DirectoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'unscheduled', dir: 'desc' })

  useEffect(() => {
    let alive = true
    fetch('/api/staff/companies')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load companies')))
      .then(d => { if (alive) setRows(d.companies) })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  const view = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    const filtered = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sort.key === 'name') return a.name.localeCompare(b.name) * dir
      return ((a[sort.key] as number) - (b[sort.key] as number)) * dir
    })
  }, [rows, query, sort])

  function toggleSort(key: SortKey) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' })
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-title1 text-ink">Meeting Engine</h1>
          <p className="text-subhead text-ink-2 mt-1">Pick a company to manage its meeting schedule.</p>
        </div>
        <input
          className="input w-80 max-w-full"
          placeholder="Search companies…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search companies"
        />
      </div>

      {error && (
        <div className="card border-danger flex items-center justify-between">
          <span className="text-body text-danger-ink">Couldn’t load companies.</span>
          <button className="btn-secondary btn-sm" onClick={() => location.reload()}>Retry</button>
        </div>
      )}

      {!rows && !error && (
        <div className="card p-0 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 h-16 border-b border-hairline last:border-0">
              <div className="skeleton w-8 h-8 rounded-lg" />
              <div className="skeleton h-4 w-40" />
              <div className="skeleton h-4 w-10 ml-auto" />
            </div>
          ))}
        </div>
      )}

      {rows && !error && (
        view.length === 0 ? (
          <div className="empty-state">
            <p className="text-body">No companies match “{query}”.</p>
            <button className="btn-ghost btn-sm" onClick={() => setQuery('')}>Clear search</button>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-hairline">
                  {COLUMNS.map(col => {
                    const active = sort.key === col.key
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`px-6 py-3 ${col.numeric ? 'text-right' : 'text-left'}`}
                      >
                        <button
                          onClick={() => toggleSort(col.key)}
                          className={`section-title !mb-0 inline-flex items-center gap-1 hover:text-ink ${col.numeric ? 'flex-row-reverse' : ''}`}
                        >
                          {col.label}
                          <span className={`transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}>
                            {sort.dir === 'asc' ? '▲' : '▼'}
                          </span>
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {view.map(row => (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => onOpen({ id: row.id, name: row.name })}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen({ id: row.id, name: row.name }) } }}
                    className="border-b border-hairline last:border-0 cursor-pointer hover:bg-fill/50 focus:bg-fill/50 focus:outline-none transition-colors"
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-fill border border-hairline overflow-hidden flex items-center justify-center flex-shrink-0">
                          {row.logoUrl
                            ? <Image src={row.logoUrl} alt="" width={32} height={32} className="object-contain p-0.5" />
                            : <span className="text-ink-2 font-bold text-xs">{initials(row.name)}</span>}
                        </div>
                        <div className="min-w-0">
                          <p className="text-headline text-ink truncate">{row.name}</p>
                          <p className="text-caption text-ink-3">{row.tier}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right text-body text-ink tabular-nums">{row.requests}</td>
                    <td className="px-6 py-3 text-right">
                      {row.pending > 0
                        ? <span className="badge badge-warning tabular-nums">{row.pending}</span>
                        : <span className="text-body text-ink-3 tabular-nums">0</span>}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {row.unscheduled > 0
                        ? <span className="badge badge-brand tabular-nums">{row.unscheduled}</span>
                        : <span className="text-body text-ink-3 tabular-nums">0</span>}
                    </td>
                    <td className="px-6 py-3 text-right text-body text-ink tabular-nums">{row.confirmed}</td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <div className="meter w-24">
                          <div className={`meter-fill ${fillMeterClass(row.fillRate)}`} style={{ width: `${Math.round(row.fillRate * 100)}%` }} />
                        </div>
                        <span className="text-caption text-ink-2 tabular-nums w-9 text-right">{Math.round(row.fillRate * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
