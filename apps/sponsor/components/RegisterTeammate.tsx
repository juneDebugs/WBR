'use client'

import { useState } from 'react'


interface Teammate {
  id: string
  name: string | null
  email: string | null
  image: string | null
  jobTitle: string | null
  role: string | null
}

interface Props {
  teammates: Teammate[]
}

export function RegisterTeammate({ teammates: initial }: Props) {
  const [teammates, setTeammates] = useState<Teammate[]>(initial)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  function resetForm() {
    setName('')
    setEmail('')
    setJobTitle('')
    setPassword('')
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/profile/teammates/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), jobTitle: jobTitle.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to register teammate.')
        return
      }
      setTeammates(prev => [...prev, data])
      setSuccess(`${data.name ?? data.email} has been added to your team.`)
      resetForm()
      setShowForm(false)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this teammate from your team?')) return
    setRemoving(id)
    try {
      const res = await fetch('/api/profile/teammates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      })
      if (res.ok) {
        setTeammates(prev => prev.filter(t => t.id !== id))
      }
    } finally {
      setRemoving(null)
    }
  }

  return (
    <div className="card p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Team Members</h2>
          <p className="text-xs text-gray-400 mt-0.5">{teammates.length} teammate{teammates.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); resetForm() }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white transition-all active:scale-95"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={showForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'} />
          </svg>
          {showForm ? 'Cancel' : 'Add Teammate'}
        </button>
      </div>

      {/* Success message */}
      {success && (
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-sm">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {success}
        </div>
      )}

      {/* Registration form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl bg-gray-50 p-5 space-y-4 border border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Register a new teammate</p>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 border border-red-200/60 text-red-600 text-xs">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Full Name</label>
              <input
                type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Jane Doe"
                className="input"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="jane@company.com"
                className="input"
              />
            </div>
            <div>
              <label className="label">Job Title</label>
              <input
                type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                placeholder="VP of Partnerships"
                className="input"
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password" required value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                minLength={6}
                className="input"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-xs">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary text-xs">
              {saving ? 'Registering...' : 'Register Teammate'}
            </button>
          </div>
        </form>
      )}

      {/* Team list */}
      {teammates.length === 0 && !showForm ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-500">No teammates yet</p>
          <p className="text-xs text-gray-400 mt-1">Add your team so they can log in and manage meetings</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teammates.map(t => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border border-gray-100 hover:border-gray-200 transition-colors group">
              {t.image ? (
                <img src={t.image} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-primary">{(t.name ?? t.email ?? '?')[0].toUpperCase()}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{t.name ?? 'Unnamed'}</p>
                <p className="text-xs text-gray-400 truncate">{t.jobTitle ? `${t.jobTitle} · ` : ''}{t.email}</p>
              </div>
              <button
                onClick={() => handleRemove(t.id)}
                disabled={removing === t.id}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 p-1"
                title="Remove teammate"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
