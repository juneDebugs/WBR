'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'

import Link from 'next/link'
import { useAttendees } from '@/lib/hooks'

interface User {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  company: string | null
  jobTitle: string | null
}

const PAGE_SIZE = 50

const ROLE_COLORS: Record<string, string> = {
  ATTENDEE: 'bg-blue-50 text-blue-700',
  SPEAKER: 'bg-purple-50 text-purple-700',
  SPONSOR: 'bg-amber-50 text-amber-700',
  STAFF: 'bg-emerald-50 text-emerald-700',
}

export function AttendeesTable({ users: initialUsers = [] }: { users?: User[] }) {
  const { data, isLoading } = useAttendees()
  const [users, setUsers] = useState(initialUsers)

  // Update users when hook data arrives
  useEffect(() => {
    if (data && Array.isArray(data)) {
      setUsers(data)
    }
  }, [data])

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('')
  const [page, setPage] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', company: '', jobTitle: '', role: 'ATTENDEE', password: '' })

  const filtered = useMemo(() => {
    let result = users
    if (roleFilter) {
      result = result.filter(u => u.role === roleFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(u =>
        (u.name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.company ?? '').toLowerCase().includes(q) ||
        (u.jobTitle ?? '').toLowerCase().includes(q)
      )
    }
    return result
  }, [users, search, roleFilter])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(0)
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setAddError(null)
    try {
      const res = await fetch('/api/attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error ?? 'Failed to create attendee.'); return }
      setUsers(prev => [...prev, data].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')))
      setForm({ name: '', email: '', company: '', jobTitle: '', role: 'ATTENDEE', password: '' })
      setShowAdd(false)
    } catch {
      setAddError('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (isLoading && users.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-9 w-72 bg-gray-200 rounded-xl animate-pulse" />
            <div className="h-9 w-28 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
              <div className="w-9 h-9 bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-4 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{filtered.length} users</p>
          <select
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(0) }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-primary/50"
          >
            <option value="">All roles</option>
            <option value="ATTENDEE">Attendee</option>
            <option value="SPEAKER">Speaker</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl bg-white focus-within:ring-2 focus-within:ring-primary/40 w-72">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              className="flex-1 text-sm focus:outline-none bg-transparent"
              placeholder="Search name, email, company…"
              value={search}
              onChange={handleSearch}
            />
            {search && (
              <button onClick={() => { setSearch(''); setPage(0) }} className="text-gray-300 hover:text-gray-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={() => { setShowAdd(true); setAddError(null) }}
            className="btn-primary flex items-center gap-1.5 text-xs whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Attendee
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">User</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paged.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/attendees/${user.id}`} className="flex items-center gap-3 group">
                    {user.image ? (
                      <img src={user.image} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                        <span className="text-gray-500 text-sm font-semibold">{(user.name ?? '?')[0]}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="font-medium text-gray-900 group-hover:text-primary truncate block">{user.name ?? '—'}</span>
                      {user.jobTitle && <span className="text-xs text-gray-400 truncate block">{user.jobTitle}</span>}
                    </div>
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">{user.email ?? '—'}</td>
                <td className="px-4 py-3 text-gray-500 truncate max-w-[160px]">{user.company ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {user.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {paged.length === 0 && (
          <p className="text-center text-gray-400 py-12">No users match your search.</p>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 7) {
                pageNum = i
              } else if (page < 4) {
                pageNum = i
              } else if (page > totalPages - 5) {
                pageNum = totalPages - 7 + i
              } else {
                pageNum = page - 3 + i
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 text-xs font-medium rounded-lg ${
                    page === pageNum
                      ? 'bg-primary text-white'
                      : 'border border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
                  }`}
                >
                  {pageNum + 1}
                </button>
              )
            })}
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add Attendee Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
            <h2 className="font-bold text-gray-900 text-lg mb-1">Add New Attendee</h2>
            <p className="text-sm text-gray-500 mb-5">Create a login for a new attendee or speaker</p>

            {addError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200/60 text-red-600 text-xs mb-4">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {addError}
              </div>
            )}

            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                  <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Steph Curry" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="steph@curry.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                  <input type="text" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
                    placeholder="Curry Brand" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Title</label>
                  <input type="text" value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
                    placeholder="CEO" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 bg-white">
                    <option value="ATTENDEE">Attendee</option>
                    <option value="SPEAKER">Speaker</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                  <input type="password" required minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Min 6 characters" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary text-sm">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary text-sm">
                  {saving ? 'Creating...' : 'Create Attendee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
