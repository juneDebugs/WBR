'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { DirectoryRow } from '@conference/db'
import { fmtDate, fmtDateTime } from './format'

const PAGE_SIZE = 20

// eTail Connect "Company List" — dense enterprise data grid.
export function CompaniesTable({ onMeetingTimes }: { onMeetingTimes: (row: { id: string; name: string }) => void }) {
  const [rows, setRows] = useState<DirectoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menuFor, setMenuFor] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/staff/companies')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load companies')))
      .then(d => { if (alive) setRows(d.companies) })
      .catch(e => { if (alive) setError(e.message) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const close = () => setMenuFor(null)
    if (menuFor) { document.addEventListener('click', close); return () => document.removeEventListener('click', close) }
  }, [menuFor])

  const total = rows?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const view = useMemo(() => (rows ?? []).slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [rows, page])

  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const allOnPageSelected = view.length > 0 && view.every(r => selected.has(r.id))

  const TH = 'border border-[#ddd] bg-[#f5f5f5] px-2 py-1.5 text-left text-[12px] font-bold text-[#333] whitespace-nowrap'
  const TD = 'border border-[#ddd] px-2 py-1.5 text-[12px] text-[#333] whitespace-nowrap'

  return (
    <div className="px-4 py-3" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Companies submenu bar */}
      <div className="flex items-center gap-4 text-[13px] text-[#337ab7] border-b border-[#ddd] pb-1.5 mb-2">
        <span className="font-semibold text-[#333]">Company List</span>
        <span className="hover:underline cursor-default">Add Company</span>
        <span className="hover:underline cursor-default">Deletion Log</span>
        <span className="hover:underline cursor-default">Import</span>
        <span className="hover:underline cursor-default">Uploads</span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="text-[13px] text-[#333]">
          Number of Companies: <b>{total}</b> <span className="text-[#777]">(out of {total} total)</span>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-[#337ab7]">Select</span>
          <button className="text-[#337ab7] hover:underline" onClick={() => setSelected(new Set(view.map(r => r.id)))}>All</button>
          <span className="text-[#777]">,</span>
          <button className="text-[#337ab7] hover:underline" onClick={() => setSelected(new Set())}>None</button>
          <span className="ml-3 text-[#777]">Load report</span>
          <select className="border border-[#ccc] rounded px-1.5 py-0.5 text-[12px] bg-white"><option>Select report…</option></select>
        </div>
      </div>

      {error && <div className="border border-[#d9534f] bg-[#f2dede] text-[#a94442] px-3 py-2 text-[13px] rounded">Couldn’t load companies. <button className="underline" onClick={() => location.reload()}>Retry</button></div>}

      {!rows && !error && <div className="text-[13px] text-[#777] py-6">Loading companies…</div>}

      {rows && !error && (
        <div className="overflow-x-auto">
          <table className="border-collapse" style={{ minWidth: 1080 }}>
            <thead>
              <tr>
                <th className={TH}><input type="checkbox" aria-label="Select all on page" checked={allOnPageSelected} onChange={() => setSelected(allOnPageSelected ? new Set() : new Set(view.map(r => r.id)))} /></th>
                <th className={TH}>Company Name</th>
                <th className={TH}>Created</th>
                <th className={TH}>Last Login</th>
                <th className={TH}>Num Logins</th>
                <th className={TH}>Receive Requests</th>
                <th className={TH}>Requests Made</th>
                <th className={TH}>Requests Received</th>
                <th className={TH}>Total Confirmed Meetings</th>
                <th className={TH}>Login</th>
                <th className={TH}>Action</th>
              </tr>
            </thead>
            <tbody>
              {view.map(r => (
                <tr key={r.id} className="hover:bg-[#f9f9f9]">
                  <td className={TD}><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                  <td className={`${TD} font-semibold`}>
                    <button className="text-[#337ab7] hover:underline" onClick={() => onMeetingTimes({ id: r.id, name: r.name })}>{r.name}</button>
                  </td>
                  <td className={TD}>{fmtDateTime(r.createdAt)}</td>
                  <td className={TD}>{fmtDateTime(r.lastLogin)}</td>
                  <td className={`${TD} text-center`}>{r.numLogins}</td>
                  <td className={`${TD} text-center`}>{r.receiveRequests ? 'Y' : 'N'}</td>
                  <td className={`${TD} text-center`}>{r.requestsMade}</td>
                  <td className={`${TD} text-center`}>{r.requestsReceived}</td>
                  <td className={`${TD} text-center`}>{r.confirmed}</td>
                  <td className={TD}>
                    <span className="inline-block bg-[#5cb85c] text-white text-[11px] px-2 py-0.5 rounded cursor-default">login</span>
                  </td>
                  <td className={`${TD} relative`}>
                    <button
                      className="inline-flex items-center gap-1 border border-[#ccc] bg-white rounded px-2 py-0.5 text-[12px] hover:bg-[#e6e6e6]"
                      onClick={e => { e.stopPropagation(); setMenuFor(menuFor === r.id ? null : r.id) }}
                    >
                      Choose <span className="text-[9px]">▾</span>
                    </button>
                    {menuFor === r.id && (
                      <div className="absolute right-2 z-30 mt-1 w-44 bg-white border border-[#ccc] rounded shadow-lg text-[12px]" role="menu" onClick={e => e.stopPropagation()}>
                        <button className="block w-full text-left px-3 py-1.5 text-[#2f6fb3] font-semibold hover:bg-[#337ab7] hover:text-white" onClick={() => { setMenuFor(null); onMeetingTimes({ id: r.id, name: r.name }) }}>Meeting Times</button>
                        <button className="block w-full text-left px-3 py-1.5 hover:bg-[#f0f0f0]" onClick={() => setMenuFor(null)}>Meeting Requests</button>
                        <button className="block w-full text-left px-3 py-1.5 hover:bg-[#f0f0f0]" onClick={() => setMenuFor(null)}>Edit Company</button>
                        <button className="block w-full text-left px-3 py-1.5 hover:bg-[#f0f0f0]" onClick={() => setMenuFor(null)}>Login as</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {rows && pageCount > 1 && (
        <div className="flex items-center gap-1 mt-3 text-[12px]">
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i)}
              className={`min-w-[26px] px-2 py-1 border rounded ${i === page ? 'bg-[#337ab7] text-white border-[#2e6da4]' : 'bg-white text-[#337ab7] border-[#ddd] hover:bg-[#eee]'}`}
            >{i + 1}</button>
          ))}
        </div>
      )}
    </div>
  )
}
