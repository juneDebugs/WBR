'use client'

import { useState, useMemo } from 'react'
import Image from 'next/image'

type UserRow = {
  id: string
  name: string | null
  email: string | null
  image: string | null
  role: string
  hasPassword: boolean
  createdAt: string
}

const ROLES = ['ATTENDEE', 'SPEAKER', 'STAFF', 'ORGANIZER']

const roleColors: Record<string, string> = {
  ORGANIZER: 'bg-purple-100 text-purple-700',
  STAFF: 'bg-blue-100 text-blue-700',
  SPEAKER: 'bg-green-100 text-green-700',
  ATTENDEE: 'bg-gray-100 text-gray-600',
}

type CredentialModal = {
  userId: string
  name: string | null
  email: string | null
  hasPassword: boolean
}

export function AccessClient({ users: initial }: { users: UserRow[] }) {
  const [users, setUsers] = useState(initial)
  const [tab, setTab] = useState<'all' | 'admins' | 'invite'>('all')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState<string | null>(null)

  // Credential modal state
  const [credModal, setCredModal] = useState<CredentialModal | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [savedPassword, setSavedPassword] = useState<string | null>(null)
  const [credSaving, setCredSaving] = useState(false)
  const [credErr, setCredErr] = useState('')

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('ORGANIZER')
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [inviteErr, setInviteErr] = useState('')

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of ROLES) counts[r] = 0
    for (const u of users) counts[u.role] = (counts[u.role] ?? 0) + 1
    return counts
  }, [users])

  const filtered = useMemo(() => {
    const base = tab === 'admins'
      ? users.filter(u => u.role === 'ORGANIZER' || u.role === 'STAFF')
      : users
    if (!search.trim()) return base
    const q = search.toLowerCase()
    return base.filter(u =>
      u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    )
  }, [users, tab, search])

  async function changeRole(userId: string, role: string) {
    setSaving(userId)
    const res = await fetch('/api/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'setRole', role }),
    })
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
    }
    setSaving(null)
  }

  function openCred(user: UserRow) {
    setCredModal({ userId: user.id, name: user.name, email: user.email, hasPassword: user.hasPassword })
    setNewPassword('')
    setShowPassword(false)
    setSavedPassword(null)
    setCredErr('')
  }

  function closeCred() {
    setCredModal(null)
    setSavedPassword(null)
  }

  async function handleSetPassword() {
    if (!credModal) return
    if (newPassword.length < 6) { setCredErr('Must be at least 6 characters'); return }
    setCredSaving(true)
    setCredErr('')
    const res = await fetch('/api/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: credModal.userId, action: 'setPassword', password: newPassword }),
    })
    if (res.ok) {
      setSavedPassword(newPassword)
      setNewPassword('')
      setCredModal(prev => prev ? { ...prev, hasPassword: true } : prev)
      setUsers(prev => prev.map(u => u.id === credModal.userId ? { ...u, hasPassword: true } : u))
    } else {
      const d = await res.json()
      setCredErr(d.error ?? 'Failed to set password')
    }
    setCredSaving(false)
  }

  async function handleClearPassword() {
    if (!credModal) return
    setCredSaving(true)
    setCredErr('')
    const res = await fetch('/api/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: credModal.userId, action: 'clearPassword' }),
    })
    if (res.ok) {
      setSavedPassword(null)
      setCredModal(prev => prev ? { ...prev, hasPassword: false } : prev)
      setUsers(prev => prev.map(u => u.id === credModal.userId ? { ...u, hasPassword: false } : u))
    }
    setCredSaving(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteStatus('saving')
    setInviteErr('')
    const res = await fetch('/api/access', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'inviteAdmin', email: inviteEmail, name: inviteName, role: inviteRole }),
    })
    const data = await res.json()
    if (res.ok) {
      setInviteStatus('ok')
      setInviteEmail('')
      setInviteName('')
      setUsers(prev => {
        const exists = prev.find(u => u.id === data.user.id)
        if (exists) return prev.map(u => u.id === data.user.id ? { ...u, ...data.user } : u)
        return [...prev, { ...data.user, image: null, hasPassword: false, createdAt: new Date().toISOString() }]
      })
      setTimeout(() => setInviteStatus('idle'), 3000)
    } else {
      setInviteStatus('err')
      setInviteErr(data.error ?? 'Failed')
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Role overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {ROLES.map(r => (
          <div key={r} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">{roleCounts[r] ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium">
              {r.charAt(0) + r.slice(1).toLowerCase()}{(roleCounts[r] ?? 0) !== 1 ? 's' : ''}
            </p>
          </div>
        ))}
      </div>

      {/* Tabs + table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-gray-200">
          {(['all', 'admins', 'invite'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t === 'all' ? `All Users (${users.length})` : t === 'admins' ? 'Admins & Staff' : 'Add / Invite'}
            </button>
          ))}
        </div>

        {tab !== 'invite' && (
          <div className="p-4 border-b border-gray-100">
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full max-w-sm px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}

        {tab === 'invite' ? (
          <div className="p-6 max-w-md">
            <h3 className="font-semibold text-gray-900 mb-1">Add or update a user</h3>
            <p className="text-sm text-gray-500 mb-4">
              If the email already exists their role will be updated. Otherwise a new account is created.
            </p>
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Display name</label>
                <input
                  type="text"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                >
                  <option value="ORGANIZER">Organizer</option>
                  <option value="STAFF">Staff</option>
                  <option value="SPEAKER">Speaker</option>
                  <option value="ATTENDEE">Attendee</option>
                </select>
              </div>
              {inviteStatus === 'err' && <p className="text-sm text-red-600">{inviteErr}</p>}
              {inviteStatus === 'ok' && <p className="text-sm text-green-600">User saved successfully.</p>}
              <button
                type="submit"
                disabled={inviteStatus === 'saving'}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {inviteStatus === 'saving' ? 'Saving…' : 'Save User'}
              </button>
            </form>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-400 p-6">No users found.</p>
            )}
            {filtered.map(user => (
              <div key={user.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                {user.image ? (
                  <Image src={user.image} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-500">
                    {(user.name ?? user.email ?? '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.name ?? '—'}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>

                {/* Password status */}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${user.hasPassword ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                  {user.hasPassword ? 'Password set' : 'No password'}
                </span>

                {/* Credentials button */}
                <button
                  onClick={() => openCred(user)}
                  className="text-xs text-gray-500 hover:text-primary px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                  title="Manage credentials"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </button>

                <select
                  value={user.role}
                  disabled={saving === user.id}
                  onChange={e => changeRole(user.id, e.target.value)}
                  className={`text-xs font-medium px-2 py-1 rounded-lg border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${roleColors[user.role] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>
                  ))}
                </select>

                {saving === user.id && (
                  <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Credentials modal */}
      {credModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={closeCred}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-semibold text-gray-900 text-lg">User Credentials</h2>
                <p className="text-xs text-gray-400 mt-0.5">{credModal.name ?? credModal.email}</p>
              </div>
              <button onClick={closeCred} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Username row */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 mb-1">Username (Email)</p>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                </svg>
                <span className="text-sm text-gray-800 font-mono flex-1">{credModal.email ?? '—'}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(credModal.email ?? '')}
                  className="text-xs text-gray-400 hover:text-primary"
                  title="Copy"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${credModal.hasPassword ? 'bg-gray-50 border-gray-200' : 'bg-yellow-50 border-yellow-200'}`}>
                  <svg className={`w-4 h-4 flex-shrink-0 ${credModal.hasPassword ? 'text-gray-400' : 'text-yellow-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                    placeholder="New password (min 6 chars)"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSetPassword()}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              {credErr && <p className="text-xs text-red-500 mt-1">{credErr}</p>}
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
