'use client'
import { useState } from 'react'
import { SOLUTIONS, COMPANY_SIZES, REVENUE_RANGES, COMPANY_SIZE_LABELS, REVENUE_LABELS, SOLUTION_COLORS } from '@/lib/solutions'

interface User {
  id: string
  name: string | null
  email: string | null
  image: string | null
  company: string | null
  jobTitle: string | null
  bio: string | null
  website: string | null
  companySize: string | null
  annualRevenue: string | null
  solutionsOffering: string | null
  solutionsSeeking: string | null
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6 space-y-5">
      <h2 className="font-semibold text-gray-900 pb-3 border-b border-gray-100">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

function SolutionChips({ label, hint, value, onChange }: {
  label: string; hint?: string; value: string[]; onChange: (v: string[]) => void
}) {
  const toggle = (s: string) =>
    onChange(value.includes(s) ? value.filter(x => x !== s) : [...value, s])

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {SOLUTIONS.map(s => {
          const active = value.includes(s)
          const colors = SOLUTION_COLORS[s]
          return (
            <button key={s} type="button" onClick={() => toggle(s)}
              className="text-xs px-3 py-1.5 rounded-full border font-medium transition-all"
              style={active && colors
                ? { background: `linear-gradient(135deg, ${colors.activeFrom}, ${colors.activeTo})`, color: '#fff', borderColor: 'transparent' }
                : colors
                ? { background: `linear-gradient(135deg, ${colors.bgFrom}, ${colors.bgTo})`, color: colors.text, borderColor: 'transparent' }
                : active
                ? { background: '#6366f1', color: '#fff', borderColor: 'transparent' }
                : {}
              }>
              {s}
            </button>
          )
        })}
      </div>
    </div>
  )
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
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error(await res.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) {
      setError(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-sm text-gray-500 mt-1">This information helps sponsors and attendees find and match with you</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button type="submit" disabled={saving}
            className="px-6 py-2 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 disabled:opacity-60 transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Profile preview card */}
      <div className="card p-4 flex items-center gap-4">
        {user.image ? (
          <img src={user.image} alt="" className="w-14 h-14 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-lg font-bold text-primary">{(user.name ?? '?')[0]}</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="font-bold text-gray-900 text-lg">{user.name ?? 'No name'}</p>
          <p className="text-sm text-gray-500 truncate">
            {form.jobTitle && form.company ? `${form.jobTitle} at ${form.company}` : form.company || form.jobTitle || user.email}
          </p>
        </div>
      </div>

      {/* About You */}
      <Section title="About You">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company">
            <input className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
              placeholder="Your company name" />
          </Field>
          <Field label="Job Title">
            <input className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
              placeholder="e.g. Head of eCommerce" />
          </Field>
        </div>
        <Field label="Bio" hint="A brief intro that helps others understand what you do and what you're looking for">
          <textarea className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 min-h-[100px] resize-y"
            value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="Tell sponsors and attendees what you're working on and what you're here to learn…" />
        </Field>
        <Field label="Website">
          <input className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
            placeholder="https://yourcompany.com" />
        </Field>
      </Section>

      {/* Company Details */}
      <Section title="Company Details">
        <p className="text-xs text-gray-500 -mt-2">Helps sponsors understand if you're a fit for their solutions</p>
        <Field label="Company Size">
          <div className="flex flex-wrap gap-2 mt-1">
            {COMPANY_SIZES.map(s => (
              <button key={s} type="button"
                onClick={() => setForm(f => ({ ...f, companySize: f.companySize === s ? '' : s }))}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  form.companySize === s
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'
                }`}>
                {COMPANY_SIZE_LABELS[s]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Annual Revenue">
          <div className="flex flex-wrap gap-2 mt-1">
            {REVENUE_RANGES.map(r => (
              <button key={r} type="button"
                onClick={() => setForm(f => ({ ...f, annualRevenue: f.annualRevenue === r ? '' : r }))}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  form.annualRevenue === r
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'
                }`}>
                {REVENUE_LABELS[r]}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* Solutions */}
      <Section title="Solutions & Interests">
        <SolutionChips label="Solutions I Offer"
          hint="What capabilities does your company bring to the table?"
          value={form.solutionsOffering}
          onChange={v => setForm(f => ({ ...f, solutionsOffering: v }))} />
        <SolutionChips label="Solutions I'm Seeking"
          hint="What are you looking for at WBR? Used to match you with sponsors and peers"
          value={form.solutionsSeeking}
          onChange={v => setForm(f => ({ ...f, solutionsSeeking: v }))} />
      </Section>

      {/* Save bottom */}
      <div className="flex justify-end pt-2 pb-8">
        <button type="submit" disabled={saving}
          className={`px-8 py-2.5 rounded-xl font-semibold text-base transition-colors ${
            saved ? 'bg-emerald-500 text-white' : 'bg-primary text-white hover:bg-primary/90'
          } disabled:opacity-60`}>
          {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>
    </form>
  )
}
