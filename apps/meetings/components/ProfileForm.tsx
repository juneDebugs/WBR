'use client'
import { useState, useRef } from 'react'
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
      <h2 className="font-semibold text-ink pb-3 border-b border-hairline">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-ink-2 mb-1.5">{hint}</p>}
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
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-ink-2 mb-2">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {SOLUTIONS.map(s => {
          const active = value.includes(s)
          const colors = SOLUTION_COLORS[s]
          return (
            <button key={s} type="button" onClick={() => toggle(s)}
              className="chip"
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
    image: user.image ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setForm(f => ({ ...f, image: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

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
          <h1 className="text-title1 text-ink">My Profile</h1>
          <p className="text-sm text-ink-2 mt-1">This information helps sponsors and attendees find and match with you</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-success-ink font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
          {error && <span className="text-sm text-danger-ink">{error}</span>}
          <button type="submit" disabled={saving} className="btn-primary btn-sm">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Profile preview card */}
      <div className="card p-5 flex items-center gap-5">
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handlePhotoFile} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="relative group flex-shrink-0">
          {form.image ? (
            <img src={form.image} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-xl font-bold text-primary">{(user.name ?? '?')[0]}</span>
            </div>
          )}
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink text-lg">{user.name ?? 'No name'}</p>
          <p className="text-sm text-ink-2 truncate">
            {form.jobTitle && form.company ? `${form.jobTitle} at ${form.company}` : form.company || form.jobTitle || user.email}
          </p>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="text-xs text-primary font-medium mt-1 hover:underline">
            Change photo
          </button>
        </div>
        {form.image && form.image !== user.image && (
          <button type="button" onClick={() => setForm(f => ({ ...f, image: user.image ?? '' }))}
            className="text-xs text-ink-2 hover:text-danger flex-shrink-0">
            Undo
          </button>
        )}
      </div>

      {/* About You */}
      <Section title="About You">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company">
            <input className="input"
              value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
              placeholder="Your company name" />
          </Field>
          <Field label="Job Title">
            <input className="input"
              value={form.jobTitle} onChange={e => setForm(f => ({ ...f, jobTitle: e.target.value }))}
              placeholder="e.g. Head of eCommerce" />
          </Field>
        </div>
        <Field label="Bio" hint="A brief intro that helps others understand what you do and what you're looking for">
          <textarea className="textarea min-h-[100px]"
            value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
            placeholder="Tell sponsors and attendees what you're working on and what you're here to learn…" />
        </Field>
        <Field label="Website">
          <input className="input"
            value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
            placeholder="https://yourcompany.com" />
        </Field>
      </Section>

      {/* Company Details */}
      <Section title="Company Details">
        <p className="text-xs text-ink-2 -mt-2">Helps sponsors understand if you're a fit for their solutions</p>
        <Field label="Company Size">
          <div className="flex flex-wrap gap-2 mt-1">
            {COMPANY_SIZES.map(s => (
              <button key={s} type="button"
                onClick={() => setForm(f => ({ ...f, companySize: f.companySize === s ? '' : s }))}
                className={`chip ${form.companySize === s ? 'chip-active' : 'chip-inactive'}`}>
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
                className={`chip ${form.annualRevenue === r ? 'chip-active' : 'chip-inactive'}`}>
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
          className={`btn-primary ${saved ? 'bg-success hover:bg-success' : ''}`}>
          {saved ? '✓ Saved!' : saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>
    </form>
  )
}
