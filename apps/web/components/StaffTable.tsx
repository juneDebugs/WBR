'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useStaffData, type StaffDataParams } from '@/lib/hooks'
import { useDialogFocus } from '@/lib/useDialogFocus'
import type { StaffPage, StaffRow } from '@/lib/staff-query'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 250
const MIN_PASSWORD_LENGTH = 8

// A staff member is only ever Staff or Organizer. Attendee/Speaker are managed
// on the Access page, not here — offering them as a demotion target on the
// Staff directory never made sense. The out-of-list fallback in the <select>
// below still renders any legacy role truthfully.
const ROLES = ['STAFF', 'ORGANIZER']

const roleColors: Record<string, string> = {
  ORGANIZER: 'bg-purple-100 text-purple-700',
  STAFF: 'bg-blue-100 text-blue-700',
  SPEAKER: 'bg-green-100 text-green-700',
  ATTENDEE: 'bg-gray-100 text-gray-600',
}

// Same cache-override key as AccessClient/AttendeesTable: the params object for
// the first, unfiltered page. Overriding this entry on mount makes return
// navigation render the fresh SSR-provided page instead of a stale cache hit.
const INITIAL_PARAMS_KEY = ['staff', { page: 0, q: '' }] as const

function subtitleFor(row: StaffRow): string {
  return [row.company, row.jobTitle].filter(Boolean).join(' · ')
}

type CredentialModal = {
  userId: string
  name: string | null
  email: string | null
  hasPassword: boolean
}

export function StaffTable({ initialData }: { initialData: StaffPage }) {
  const queryClient = useQueryClient()

  // React Query persists across route navigation under the dashboard's shared
  // QueryProvider. With `staleTime: 60_000`, an entry cached from a previous
  // mount would be returned ahead of the fresh SSR-provided initialData.
  // Override the cache on every mount so return navigation sees the
  // server-rendered first page.
  useEffect(() => {
    queryClient.setQueryData(INITIAL_PARAMS_KEY, initialData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData])

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(0)
  const [saving, setSaving] = useState<string | null>(null)
  const [actionErr, setActionErr] = useState('')

  // Credential modal state
  const [credModal, setCredModal] = useState<CredentialModal | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [savedPassword, setSavedPassword] = useState<string | null>(null)
  const [credSaving, setCredSaving] = useState(false)
  const [credErr, setCredErr] = useState('')

  // Add-staff modal state
  const [showAdd, setShowAdd] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addErr, setAddErr] = useState('')

  // Debounce search and reset page in the same batched update so the queryKey
  // moves from {page:N, q:''} straight to {page:0, q:'new'} — avoids the
  // intermediate {page:N, q:'new'} render that would fire a wasted request.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [search])

  const params: StaffDataParams = { page, q: debouncedSearch }
  const isInitialParams = params.page === 0 && params.q === ''
  const { data, isLoading } = useStaffData(params, isInitialParams ? initialData : undefined)

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
  }, [])

  // Role and credential changes both move the Staff count, which the Access
  // page's "Staff" stat card also reads — invalidate both caches to keep them
  // in sync.
  async function refreshStaff() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['staff'] }),
      queryClient.invalidateQueries({ queryKey: ['access'] }),
    ])
  }

  async function changeRole(userId: string, role: string) {
    setSaving(userId)
    setActionErr('')
    try {
      const res = await fetch('/api/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action: 'setRole', role }),
      })
      if (res.ok) {
        await refreshStaff()
      } else {
        const d = await res.json().catch(() => ({}))
        setActionErr(d.error ?? 'Role change failed — the role was not updated.')
      }
    } catch {
      setActionErr('Network error — the role was not updated.')
    } finally {
      setSaving(null)
    }
  }

  function openCred(user: StaffRow) {
    setCredModal({ userId: user.id, name: user.name, email: user.email, hasPassword: user.hasPassword })
    setNewPassword('')
    setShowPassword(false)
    setSavedPassword(null)
    setCredErr('')
  }

  const closeCred = useCallback(() => {
    setCredModal(null)
    setSavedPassword(null)
  }, [])

  const closeAdd = useCallback(() => {
    setShowAdd(false)
  }, [])

  // HIG: modals must be dismissable with Escape.
  useEffect(() => {
    if (!credModal && !showAdd) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (credModal) closeCred()
      else if (showAdd) closeAdd()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [credModal, showAdd, closeCred, closeAdd])

  // HIG/ARIA dialog pattern: focus moves into the dialog on open, stays
  // trapped while it is up, and returns to the trigger on close.
  const credDialogRef = useDialogFocus<HTMLDivElement>(Boolean(credModal))
  const addDialogRef = useDialogFocus<HTMLDivElement>(showAdd)

  async function handleSetPassword() {
    if (!credModal) return
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setCredErr(`Must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    setCredSaving(true)
    setCredErr('')
    try {
      const res = await fetch('/api/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: credModal.userId, action: 'setPassword', password: newPassword }),
      })
      if (res.ok) {
        setSavedPassword(newPassword)
        setNewPassword('')
        setCredModal(prev => prev ? { ...prev, hasPassword: true } : prev)
        await refreshStaff()
      } else {
        const d = await res.json().catch(() => ({}))
        setCredErr(d.error ?? 'Failed to set password')
      }
    } catch {
      setCredErr('Network error — password not changed.')
    } finally {
      setCredSaving(false)
    }
  }

  async function handleClearPassword() {
    if (!credModal) return
    setCredSaving(true)
    setCredErr('')
    try {
      const res = await fetch('/api/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: credModal.userId, action: 'clearPassword' }),
      })
      if (res.ok) {
        setSavedPassword(null)
        setCredModal(prev => prev ? { ...prev, hasPassword: false } : prev)
        await refreshStaff()
      } else {
        const d = await res.json().catch(() => ({}))
        setCredErr(d.error ?? 'Failed to remove password')
      }
    } catch {
      setCredErr('Network error — password not removed.')
    } finally {
      setCredSaving(false)
    }
  }

  function openAdd() {
    setAddName('')
    setAddEmail('')
    setAddPassword('')
    setAddErr('')
    setShowAdd(true)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (addPassword && addPassword.length < MIN_PASSWORD_LENGTH) {
      setAddErr(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    setAddSaving(true)
    setAddErr('')
    try {
      const res = await fetch('/api/access', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inviteAdmin',
          email: addEmail,
          name: addName,
          role: 'STAFF',
          ...(addPassword ? { password: addPassword } : {}),
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddErr(d.error ?? 'Failed to add staff member.')
        return
      }
      await refreshStaff()
      setAddName('')
      setAddEmail('')
      setAddPassword('')
      setShowAdd(false)
    } catch {
      setAddErr('Something went wrong.')
    } finally {
      setAddSaving(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      {/* Toolbar: count + Add Staff */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500 tabular-nums">{total.toLocaleString()} staff</p>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Staff
        </button>
      </div>

      {/* Search + list card */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg bg-white focus-within:ring-2 focus-within:ring-primary/30 w-full max-w-sm">
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, company…"
              aria-label="Search staff by name, email, or company"
              value={search}
              onChange={handleSearch}
              className="flex-1 text-sm focus:outline-none bg-transparent"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-300 hover:text-gray-500" aria-label="Clear search">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {actionErr && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 border-b border-red-100" role="alert">
            <p className="text-sm text-red-700">{actionErr}</p>
            <button onClick={() => setActionErr('')} className="text-red-400 hover:text-red-600" aria-label="Dismiss error">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="divide-y divide-gray-100" aria-busy={isLoading}>
          {rows.length === 0 && (
            <p className="text-sm text-gray-400 p-6">
              {isLoading
                ? 'Loading staff…'
                : debouncedSearch
                  ? `No staff match “${debouncedSearch}”.`
                  : 'No staff yet.'}
            </p>
          )}
          {rows.map(user => {
            const subtitle = subtitleFor(user)
            return (
              <div key={user.id} className="flex items-center gap-3 px-4 py-3 min-h-[44px] hover:bg-gray-50 transition-colors">
                {user.image ? (
                  <img src={user.image} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500" aria-hidden="true">
                    {/* `||` (not `??`) so an empty-string name/email falls through to '?'; charAt never throws. */}
                    {(user.name?.trim() || user.email?.trim() || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.name ?? '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email ?? '—'}</p>
                  {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
                </div>

                {/* Password status */}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.hasPassword ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                  {user.hasPassword ? 'Password set' : 'No password'}
                </span>

                {/* Credentials button */}
                <button
                  onClick={() => openCred(user)}
                  className="text-xs text-gray-500 hover:text-primary px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                  title="Manage credentials"
                  aria-label={`Manage credentials for ${user.name ?? user.email ?? 'staff member'}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </button>

                <select
                  value={user.role}
                  disabled={saving === user.id}
                  onChange={e => changeRole(user.id, e.target.value)}
                  aria-label={`Role for ${user.name ?? user.email ?? 'staff member'}`}
                  className={`text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${roleColors[user.role] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {/* A role outside ROLES (e.g. ADMIN) must still display truthfully,
                      not fall back to the browser default of the first option. */}
                  {!ROLES.includes(user.role) && (
                    <option value={user.role} disabled>{user.role.charAt(0) + user.role.slice(1).toLowerCase()}</option>
                  )}
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                  ))}
                </select>

                {saving === user.id && (
                  <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 tabular-nums">
              Showing {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-2 text-xs text-gray-500 tabular-nums">
                Page {page + 1} of {totalPages}
              </span>
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
      </div>

      {/* Add Staff modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeAdd}>
          <div
            ref={addDialogRef}
            tabIndex={-1}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 focus:outline-none"
            role="dialog"
            aria-modal="true"
            aria-label="Add staff member"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-semibold text-gray-900 text-lg">Add Staff</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  If the email already exists their role is set to Staff. Otherwise a new account is created.
                </p>
              </div>
              <button onClick={closeAdd} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label htmlFor="staff-add-name" className="block text-xs font-medium text-gray-600 mb-1">Full name</label>
                <input
                  id="staff-add-name"
                  type="text"
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label htmlFor="staff-add-email" className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input
                  id="staff-add-email"
                  type="email"
                  required
                  value={addEmail}
                  onChange={e => setAddEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label htmlFor="staff-add-password" className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                <input
                  id="staff-add-password"
                  type="password"
                  value={addPassword}
                  onChange={e => setAddPassword(e.target.value)}
                  placeholder={`Optional (min ${MIN_PASSWORD_LENGTH} chars)`}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <p className="text-[11px] text-gray-400 mt-1">Leave blank to let them sign in without a password.</p>
              </div>
              {addErr && <p className="text-sm text-red-600" role="alert">{addErr}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeAdd}
                  className="min-h-[44px] px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSaving}
                  className="min-h-[44px] px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {addSaving ? 'Saving…' : 'Add Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials modal */}
      {credModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeCred}>
          <div
            ref={credDialogRef}
            tabIndex={-1}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 focus:outline-none"
            role="dialog"
            aria-modal="true"
            aria-label="Staff credentials"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-semibold text-gray-900 text-lg">Staff Credentials</h2>
                <p className="text-xs text-gray-400 mt-0.5">{credModal.name ?? credModal.email}</p>
              </div>
              <button onClick={closeCred} className="text-gray-400 hover:text-gray-600" aria-label="Close">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Username row */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-1">Username (Email)</p>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <span className="text-sm text-gray-800 font-mono flex-1">{credModal.email ?? '—'}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(credModal.email ?? '')}
                  className="text-xs text-gray-400 hover:text-primary"
                  title="Copy"
                  aria-label="Copy email"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Current password status */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-1">Password</p>
              {savedPassword ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm font-mono text-green-800 flex-1">
                    {showPassword ? savedPassword : '••••••••••'}
                  </span>
                  <button onClick={() => setShowPassword(v => !v)} className="text-xs text-green-600 hover:text-green-800">
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(savedPassword)}
                    className="text-green-500 hover:text-green-700"
                    title="Copy"
                    aria-label="Copy password"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${credModal.hasPassword ? 'bg-gray-50 border-gray-200' : 'bg-yellow-50 border-yellow-200'}`}>
                  <svg className={`w-4 h-4 flex-shrink-0 ${credModal.hasPassword ? 'text-gray-400' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className={`text-sm flex-1 ${credModal.hasPassword ? 'text-gray-500' : 'text-yellow-700'}`}>
                    {credModal.hasPassword ? 'Password is set (hashed — set a new one to view)' : 'No password — user logs in with any email'}
                  </span>
                </div>
              )}
            </div>

            {/* Set / reset password */}
            <div className="mb-2">
              <p className="text-xs font-medium text-gray-500 mb-1">
                {credModal.hasPassword ? 'Reset password' : 'Set password'}
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={`New password (min ${MIN_PASSWORD_LENGTH} chars)`}
                    aria-label="New password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleSetPassword}
                  disabled={credSaving || !newPassword}
                  className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                >
                  {credSaving ? '…' : credModal.hasPassword ? 'Reset' : 'Set'}
                </button>
              </div>
              {credErr && <p className="text-xs text-red-500 mt-1" role="alert">{credErr}</p>}
            </div>

            {credModal.hasPassword && !savedPassword && (
              <button
                onClick={handleClearPassword}
                disabled={credSaving}
                className="text-xs text-red-500 hover:text-red-700 mt-2"
              >
                Remove password (restore open access)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
