'use client'

import { useState } from 'react'

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

const SOLUTIONS = [
  'Email Marketing', 'SMS Marketing', 'Loyalty & Rewards', 'Subscription Management',
  'Returns Management', 'Customer Support', 'Shipping & Fulfillment', 'Inventory Management',
  'Analytics & Reporting', 'Payment Processing', 'Search & Discovery', 'ERP / Operations',
  'Personalization', 'Reviews & UGC', 'Marketplace Integration', 'B2B Commerce',
  'Headless Commerce', 'AI & Automation',
]

function parseArr(val: string | null | undefined): string[] {
  if (!val) return []
  try { return JSON.parse(val) } catch { return [] }
}

function ChipPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  function toggle(s: string) {
    onChange(selected.includes(s) ? selected.filter(x => x !== s) : [...selected, s])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {SOLUTIONS.map(s => (
        <button key={s} type="button" onClick={() => toggle(s)}
          className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
            selected.includes(s)
              ? 'bg-primary text-white border-primary'
              : 'bg-white text-ink-2 border-hairline hover:border-primary/50'
          }`}
        >{s}</button>
      ))}
    </div>
  )
}

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
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    password: '',
  })

  const [offering, setOffering] = useState<string[]>(parseArr(user.solutionsOffering))
  const [seeking, setSeeking] = useState<string[]>(parseArr(user.solutionsSeeking))

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
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
          solutionsOffering: JSON.stringify(offering),
          solutionsSeeking: JSON.stringify(seeking),
          ...(form.password && { password: form.password }),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to save.')
        return
      }
      setEditing(false)
    } catch {
      setError('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <button
        onClick={() => { setEditing(true); setError(null) }}
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
    <div className="bg-white border border-hairline rounded-xl p-6 mt-4">
      <div className="flex items-center justify-between mb-5">
        <h3 className="font-bold text-ink">Edit Profile</h3>
        <button onClick={() => setEditing(false)} className="text-ink-2 hover:text-ink-2" aria-label="Close editor">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg bg-danger-soft border border-danger/20 text-danger-ink text-xs">{error}</div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Name</label>
            <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Profile Image URL</label>
            <input type="url" value={form.image} onChange={e => set('image', e.target.value)}
              placeholder="https://..." className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Role</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className="form-input">
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Company</label>
            <input type="text" value={form.company} onChange={e => set('company', e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Job Title</label>
            <input type="text" value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)}
              className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Company Size</label>
            <select value={form.companySize} onChange={e => set('companySize', e.target.value)} className="form-input">
              {COMPANY_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Annual Revenue</label>
            <select value={form.annualRevenue} onChange={e => set('annualRevenue', e.target.value)} className="form-input">
              {REVENUE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Website</label>
            <input type="url" value={form.website} onChange={e => set('website', e.target.value)}
              placeholder="https://..." className="form-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-2 block mb-1">Reset Password</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
              placeholder="Leave blank to keep current" minLength={6} className="form-input" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-ink-2 block mb-1">Bio</label>
            <textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={3}
              className="form-input resize-none" />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-ink-2 block mb-2">Solutions Offering</label>
            <ChipPicker selected={offering} onChange={setOffering} />
          </div>
          <div className="col-span-2">
            <label className="text-xs font-medium text-ink-2 block mb-2">Solutions Seeking</label>
            <ChipPicker selected={seeking} onChange={setSeeking} />
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
