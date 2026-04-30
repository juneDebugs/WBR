'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const COMPANY_SIZES = [
  { value: '', label: 'Not set' },
  { value: 'STARTUP', label: 'Startup (1–50)' },
  { value: 'SMB', label: 'SMB (51–500)' },
  { value: 'MIDMARKET', label: 'Mid-Market (501–2K)' },
  { value: 'ENTERPRISE', label: 'Enterprise (2K+)' },
]

const REVENUE_RANGES = [
  { value: '', label: 'Not set' },
  { value: '<1M', label: 'Under $1M' },
  { value: '1M-10M', label: '$1M – $10M' },
  { value: '10M-50M', label: '$10M – $50M' },
  { value: '50M-250M', label: '$50M – $250M' },
  { value: '250M+', label: '$250M+' },
]

const ROLES = [
  { value: 'ATTENDEE', label: 'Attendee' },
  { value: 'SPEAKER', label: 'Speaker' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'ORGANIZER', label: 'Organizer' },
  { value: 'ADMIN', label: 'Admin' },
]

interface UserData {
  id: string
  name: string | null
  email: string | null
  image: string | null
  bio: string | null
  company: string | null
  jobTitle: string | null
  role: string
  website: string | null
  companySize: string | null
  annualRevenue: string | null
  solutionsOffering: string | null
  solutionsSeeking: string | null
}

export function AttendeeProfileEditor({ user }: { user: UserData }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    name: user.name ?? '',
    email: user.email ?? '',
    image: user.image ?? '',
    bio: user.bio ?? '',
    company: user.company ?? '',
    jobTitle: user.jobTitle ?? '',
    role: user.role,
    website: user.website ?? '',
    companySize: user.companySize ?? '',
    annualRevenue: user.annualRevenue ?? '',
    solutionsOffering: user.solutionsOffering ?? '[]',
    solutionsSeeking: user.solutionsSeeking ?? '[]',
  })

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch(`/api/attendees/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || null,
          email: form.email || null,
          image: form.image || null,
          bio: form.bio || null,
          company: form.company || null,
          jobTitle: form.jobTitle || null,
          role: form.role,
          website: form.website || null,
          companySize: form.companySize || null,
          annualRevenue: form.annualRevenue || null,
          solutionsOffering: form.solutionsOffering,
          solutionsSeeking: form.solutionsSeeking,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save.')
        return
      }
      setSuccess(true)
      setEditing(false)
      router.refresh()
    } catch {
      setError('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setSuccess(false); setError(null) }}
        className="btn-primary text-xs flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Edit Profile
      </button>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mt-4">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-gray-900">Edit Profile</h3>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200/60 text-red-600 text-xs">{error}</div>
      )}
      {success && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200/60 text-emerald-600 text-xs">Profile saved.</div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Name</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Profile Image URL</label>
            <input type="url" value={form.image} onChange={e => set('image', e.target.value)}
              placeholder="https://..." className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className="form-input">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Company</label>
            <input type="text" value={form.company} onChange={e => set('company', e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Job Title</label>
            <input type="text" value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Company Size</label>
            <select value={form.companySize} onChange={e => set('companySize', e.target.value)} className="form-input">
              {COMPANY_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Annual Revenue</label>
            <select value={form.annualRevenue} onChange={e => set('annualRevenue', e.target.value)} className="form-input">
              {REVENUE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Website</label>
            <input type="url" value={form.website} onChange={e => set('website', e.target.value)}
              placeholder="https://..." className="form-input" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Bio</label>
            <textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={3}
              className="form-input resize-none" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Solutions Offering (JSON array)</label>
            <input type="text" value={form.solutionsOffering} onChange={e => set('solutionsOffering', e.target.value)}
              placeholder='["Email Marketing","AI & Automation"]' className="form-input font-mono text-xs" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Solutions Seeking (JSON array)</label>
            <input type="text" value={form.solutionsSeeking} onChange={e => set('solutionsSeeking', e.target.value)}
              placeholder='["Analytics & Reporting"]' className="form-input font-mono text-xs" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={() => setEditing(false)} className="btn-secondary text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
