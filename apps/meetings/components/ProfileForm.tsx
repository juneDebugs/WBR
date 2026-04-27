'use client'
import { useState } from 'react'
import { SOLUTIONS, COMPANY_SIZES, REVENUE_RANGES, COMPANY_SIZE_LABELS, REVENUE_LABELS } from '@/lib/solutions'

interface User {
  id: string
  name: string | null
  email: string | null
  company: string | null
  jobTitle: string | null
  bio: string | null
  website: string | null
  companySize: string | null
  annualRevenue: string | null
  solutionsOffering: string | null
  solutionsSeeking: string | null
}

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

export function ProfileForm({ user }: { user: User }) {
  const [form, setForm] = useState({
    company: user.company ?? '',
    jobTitle: user.jobTitle ?? '',
    bio: user.bio ?? '',
    website: user.website ?? '',
    companySize: user.companySize ?? '',
    annualRevenue: user.annualRevenue ?? '',
    solutionsOffering: user.solutionsOffering ? JSON.parse(user.solutionsOffering) as string[] : [],
    solutionsSeeking: user.solutionsSeeking ? JSON.parse(user.solutionsSeeking) as string[] : [],
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function save() {
    setSaving(true)
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-bold text-gray-900 text-lg mb-1">My Profile</h1>
      <p className="text-sm text-gray-500 mb-6">This information helps others find and filter you in the meeting portal.</p>

      <div className="card space-y-4 mb-5">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Company</label>
          <input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
            placeholder="Your company" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Job Title</label>
          <input value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
            placeholder="e.g. Head of eCommerce" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Bio</label>
          <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="A brief intro…" rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Website</label>
          <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
            placeholder="https://yourcompany.com" className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
        </div>
      </div>

      <div className="card space-y-5 mb-5">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Company Size</label>
          <div className="flex flex-wrap gap-2">
            {COMPANY_SIZES.map(s => (
              <button key={s} onClick={() => setForm(f => ({ ...f, companySize: f.companySize === s ? '' : s }))}
                className={`chip ${form.companySize === s ? 'chip-active' : 'chip-inactive'}`}>
                {COMPANY_SIZE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Annual Revenue</label>
          <div className="flex flex-wrap gap-2">
            {REVENUE_RANGES.map(r => (
              <button key={r} onClick={() => setForm(f => ({ ...f, annualRevenue: f.annualRevenue === r ? '' : r }))}
                className={`chip ${form.annualRevenue === r ? 'chip-active' : 'chip-inactive'}`}>
                {REVENUE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card space-y-5 mb-6">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Solutions I Offer</label>
          <div className="flex flex-wrap gap-2">
            {SOLUTIONS.map(s => (
              <button key={s} onClick={() => setForm(f => ({ ...f, solutionsOffering: toggle(f.solutionsOffering, s) }))}
                className={`chip ${form.solutionsOffering.includes(s) ? 'chip-active' : 'chip-inactive'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Solutions I&apos;m Seeking</label>
          <div className="flex flex-wrap gap-2">
            {SOLUTIONS.map(s => (
              <button key={s} onClick={() => setForm(f => ({ ...f, solutionsSeeking: toggle(f.solutionsSeeking, s) }))}
                className={`chip ${form.solutionsSeeking.includes(s) ? 'chip-active' : 'chip-inactive'}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
          saved ? 'bg-green-500 text-white' : 'bg-primary text-white hover:bg-primary-dark active:scale-95'
        } disabled:opacity-60`}>
        {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save Profile'}
      </button>
    </div>
  )
}
