'use client'
import { useState, useRef } from 'react'

const SOLUTIONS = [
  'Analytics & Data', 'Email Marketing', 'SMS Marketing', 'Loyalty & Retention',
  'Payments & Checkout', 'Logistics & Fulfillment', 'Customer Support',
  'SEO & Content', 'Paid Advertising', 'Social Commerce', 'Subscription Management',
  'Reviews & UGC', 'Personalization & AI', 'Influencer Marketing', 'Headless Commerce',
  'ERP & Operations', 'Returns & Exchanges', 'Tax & Compliance',
]
const COMPANY_SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1,000', '1,000+']
const REVENUE_RANGES = ['<$1M', '$1M–$10M', '$10M–$50M', '$50M–$250M', '$250M+']
const INDUSTRIES = [
  'Apparel & Fashion', 'Beauty & Personal Care', 'Health & Wellness', 'Food & Beverage',
  'Home & Garden', 'Electronics & Tech', 'Sports & Outdoors', 'Jewelry & Accessories',
  'Pet Supplies', 'B2B / Wholesale', 'Luxury & Premium', 'Subscription Boxes',
  'Marketplace & Aggregator', 'SaaS & Software', 'Agency & Services',
]

function parseArr(v: string | null | undefined): string[] {
  if (!v) return []
  try { return JSON.parse(v) } catch { return [] }
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
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

function MultiChips({ label, options, value, onChange }: {
  label: string; options: string[]; value: string[]; onChange: (v: string[]) => void
}) {
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex flex-wrap gap-2 mt-1">
        {options.map(o => (
          <button key={o} type="button" onClick={() => toggle(o)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              value.includes(o)
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-gray-600 border-gray-200 hover:border-primary hover:text-primary'
            }`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

function LogoUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<'url' | 'upload'>(value ? 'url' : 'url')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    // Convert to base64 data URL for local storage (no external service needed)
    const reader = new FileReader()
    reader.onload = (ev) => {
      onChange(ev.target?.result as string)
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        <button type="button" onClick={() => setMode('url')}
          className={`px-3 py-1.5 rounded-full border font-medium transition-colors ${mode === 'url' ? 'bg-primary text-white border-primary' : 'text-gray-600 border-gray-200 hover:border-primary'}`}>
          URL
        </button>
        <button type="button" onClick={() => setMode('upload')}
          className={`px-3 py-1.5 rounded-full border font-medium transition-colors ${mode === 'upload' ? 'bg-primary text-white border-primary' : 'text-gray-600 border-gray-200 hover:border-primary'}`}>
          Upload file
        </button>
      </div>

      {mode === 'url' ? (
        <input className="input" type="url" value={value} onChange={e => onChange(e.target.value)}
          placeholder="https://yourcompany.com/logo.png  (PNG, JPG, SVG, WebP)" />
      ) : (
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
            className="hidden" onChange={handleFile} />
          <button type="button" onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="btn-secondary text-sm px-4 py-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? 'Processing…' : 'Choose file (PNG, JPG, SVG, WebP)'}
          </button>
        </div>
      )}

      {value && (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
          <img
            src={value}
            alt="Logo preview"
            className="w-14 h-14 object-contain rounded-lg border border-gray-100 bg-white"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="text-xs text-gray-500">
            <p className="font-medium text-gray-700">Logo preview</p>
            <p className="truncate max-w-[200px]">{value.startsWith('data:') ? 'Uploaded file' : value}</p>
          </div>
          <button type="button" onClick={() => onChange('')}
            className="ml-auto text-gray-400 hover:text-red-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function TeammateManager({ teammates, available, onAdd, onRemove }: {
  teammates: any[]; available: any[];
  onAdd: (userId: string) => void; onRemove: (userId: string) => void;
}) {
  const [search, setSearch] = useState('')
  const filtered = available.filter(u =>
    `${u.name} ${u.email} ${u.jobTitle}`.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20)

  return (
    <div className="space-y-4">
      {/* Current teammates */}
      {teammates.length === 0 ? (
        <p className="text-sm text-gray-400">No teammates added yet.</p>
      ) : (
        <div className="space-y-2">
          {teammates.map(t => (
            <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              {t.image ? (
                <img src={t.image} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">{t.name?.[0] ?? '?'}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{t.name}</p>
                <p className="text-xs text-gray-500 truncate">{t.jobTitle} · {t.email}</p>
              </div>
              <button type="button" onClick={() => onRemove(t.id)}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add teammates */}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-2">Add a teammate</p>
        <input className="input text-sm mb-2" placeholder="Search by name or email…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <div className="border border-gray-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 p-3">No users found</p>
            ) : filtered.map(u => (
              <button key={u.id} type="button" onClick={() => { onAdd(u.id); setSearch('') }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-0">
                {u.image ? (
                  <img src={u.image} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{u.name?.[0] ?? '?'}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                  <p className="text-xs text-gray-500 truncate">{u.jobTitle} · {u.email}</p>
                </div>
                <svg className="w-4 h-4 text-primary ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function ProfileEditor({ sponsor, currentUserId, availableUsers }: {
  sponsor: any; currentUserId: string; availableUsers: any[]
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Personal rep fields
  const [repName, setRepName] = useState('')
  const [repTitle, setRepTitle] = useState('')

  // Sponsor / company fields
  const [name, setName] = useState(sponsor.name ?? '')
  const [tagline, setTagline] = useState(sponsor.tagline ?? '')
  const [description, setDescription] = useState(sponsor.description ?? '')
  const [logoUrl, setLogoUrl] = useState(sponsor.logoUrl ?? '')
  const [heroImageUrl, setHeroImageUrl] = useState(sponsor.heroImageUrl ?? '')
  const [website, setWebsite] = useState(sponsor.website ?? '')
  const [contactName, setContactName] = useState(sponsor.contactName ?? '')
  const [contactEmail, setContactEmail] = useState(sponsor.contactEmail ?? '')
  const [contactPhone, setContactPhone] = useState(sponsor.contactPhone ?? '')
  const [companySize, setCompanySize] = useState(sponsor.companySize ?? '')
  const [annualRevenue, setAnnualRevenue] = useState(sponsor.annualRevenue ?? '')
  const [founded, setFounded] = useState(sponsor.founded ?? '')
  const [headquarters, setHeadquarters] = useState(sponsor.headquarters ?? '')
  const [boothNumber, setBoothNumber] = useState(sponsor.boothNumber ?? '')
  const [socialLinkedIn, setSocialLinkedIn] = useState(sponsor.socialLinkedIn ?? '')
  const [socialTwitter, setSocialTwitter] = useState(sponsor.socialTwitter ?? '')
  const [solutionsOffering, setSolutionsOffering] = useState<string[]>(parseArr(sponsor.solutionsOffering))
  const [solutionsSeeking, setSolutionsSeeking] = useState<string[]>(parseArr(sponsor.solutionsSeeking))
  const [targetIndustries, setTargetIndustries] = useState<string[]>(parseArr(sponsor.targetIndustries))
  const [targetCompanySizes, setTargetCompanySizes] = useState<string[]>(parseArr(sponsor.targetCompanySizes))
  const [targetRevenues, setTargetRevenues] = useState<string[]>(parseArr(sponsor.targetRevenues))

  // Teammates
  const [teammates, setTeammates] = useState<any[]>(sponsor.users ?? [])

  async function addTeammate(userId: string) {
    const res = await fetch('/api/profile/teammates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      const user = availableUsers.find(u => u.id === userId)
      if (user) setTeammates(prev => [...prev, user])
    }
  }

  async function removeTeammate(userId: string) {
    const res = await fetch('/api/profile/teammates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      setTeammates(prev => prev.filter(t => t.id !== userId))
    }
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
        body: JSON.stringify({
          name, tagline, description, logoUrl, heroImageUrl, website,
          contactName, contactEmail, contactPhone,
          companySize, annualRevenue, founded, headquarters, boothNumber,
          socialLinkedIn, socialTwitter,
          solutionsOffering, solutionsSeeking,
          targetIndustries, targetCompanySizes, targetRevenues,
        }),
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

  const availableToAdd = availableUsers.filter(u => !teammates.find(t => t.id === u.id))

  return (
    <form onSubmit={handleSave} className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sponsor Profile</h1>
          <p className="text-sm text-gray-500 mt-1">Changes sync instantly to all WBR 2027 apps</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-emerald-600 font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved & synced
            </span>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <button type="submit" disabled={saving} className="btn-primary px-6 py-2">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Live preview banner */}
      {(logoUrl || name) && (
        <div className="card overflow-hidden">
          {heroImageUrl && (
            <div className="h-36 bg-gray-100 overflow-hidden">
              <img src={heroImageUrl} alt="Hero" loading="lazy" className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
            </div>
          )}
          <div className="p-4 flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" loading="lazy" className="w-14 h-14 object-contain rounded-xl border border-gray-100 bg-white p-1"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
                <span className="text-lg font-bold text-primary">{name[0]}</span>
              </div>
            )}
            <div>
              <p className="font-bold text-gray-900 text-lg">{name}</p>
              {tagline && <p className="text-sm text-gray-500">{tagline}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Company identity */}
      <Section title="Company Identity">
        <Field label="Company Name" hint="Shown across all apps — attendee app, meeting portal, admin">
          <input className="input" value={name} onChange={e => setName(e.target.value)}
            placeholder="Shopify" required />
        </Field>
        <Field label="Tagline" hint="One line that captures your value prop">
          <input className="input" value={tagline} onChange={e => setTagline(e.target.value)}
            placeholder="The commerce platform powering millions of businesses" maxLength={120} />
        </Field>
        <Field label="Company Description" hint="Shown on your sponsor card and profile across all apps">
          <textarea className="input min-h-[120px] resize-y" value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="We help DTC brands grow through…" />
        </Field>
        <Field label="Logo" hint="Supports URL, PNG, JPG, SVG, or WebP upload">
          <LogoUploader value={logoUrl} onChange={setLogoUrl} />
        </Field>
        <Field label="Hero / Banner Image URL" hint="Wide banner shown at top of your profile (1200×400px ideal)">
          <input className="input" type="url" value={heroImageUrl} onChange={e => setHeroImageUrl(e.target.value)}
            placeholder="https://yourcompany.com/banner.jpg" />
        </Field>
        <Field label="Website">
          <input className="input" value={website} onChange={e => setWebsite(e.target.value)}
            placeholder="https://yourcompany.com" />
        </Field>
      </Section>

      {/* Company details */}
      <Section title="Company Details">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Founded Year">
            <input className="input" value={founded} onChange={e => setFounded(e.target.value)}
              placeholder="2006" maxLength={4} />
          </Field>
          <Field label="Headquarters">
            <input className="input" value={headquarters} onChange={e => setHeadquarters(e.target.value)}
              placeholder="Ottawa, Canada" />
          </Field>
          <Field label="Company Size">
            <select className="input" value={companySize} onChange={e => setCompanySize(e.target.value)}>
              <option value="">Select…</option>
              {COMPANY_SIZES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Annual Revenue">
            <select className="input" value={annualRevenue} onChange={e => setAnnualRevenue(e.target.value)}>
              <option value="">Select…</option>
              {REVENUE_RANGES.map(r => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Booth Number">
            <input className="input" value={boothNumber} onChange={e => setBoothNumber(e.target.value)}
              placeholder="A-12" />
          </Field>
        </div>
      </Section>

      {/* Contact */}
      <Section title="Primary Contact">
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Name">
            <input className="input" value={contactName} onChange={e => setContactName(e.target.value)}
              placeholder="Jane Smith" />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)}
              placeholder="jane@yourcompany.com" />
          </Field>
          <Field label="Phone">
            <input className="input" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
              placeholder="+1 (555) 000-0000" />
          </Field>
        </div>
      </Section>

      {/* Social */}
      <Section title="Social Links">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="LinkedIn">
            <input className="input" type="url" value={socialLinkedIn} onChange={e => setSocialLinkedIn(e.target.value)}
              placeholder="https://linkedin.com/company/yourcompany" />
          </Field>
          <Field label="Twitter / X">
            <input className="input" value={socialTwitter} onChange={e => setSocialTwitter(e.target.value)}
              placeholder="@yourcompany" />
          </Field>
        </div>
      </Section>

      {/* Solutions */}
      <Section title="What You Offer">
        <MultiChips label="Solutions & Categories" options={SOLUTIONS}
          value={solutionsOffering} onChange={setSolutionsOffering} />
      </Section>

      {/* Target audience */}
      <Section title="Ideal Customer Profile">
        <p className="text-xs text-gray-500 -mt-2">Who you want to meet at WBR 2027 — used to match you with relevant attendees</p>
        <MultiChips label="Solutions They're Looking For" options={SOLUTIONS}
          value={solutionsSeeking} onChange={setSolutionsSeeking} />
        <MultiChips label="Industries" options={INDUSTRIES}
          value={targetIndustries} onChange={setTargetIndustries} />
        <MultiChips label="Company Sizes" options={COMPANY_SIZES}
          value={targetCompanySizes} onChange={setTargetCompanySizes} />
        <MultiChips label="Revenue Ranges" options={REVENUE_RANGES}
          value={targetRevenues} onChange={setTargetRevenues} />
      </Section>

      {/* Teammates */}
      <Section title="Team at WBR 2027">
        <p className="text-xs text-gray-500 -mt-2">
          Teammates appear on your sponsor card in the meeting portal and attendee app.
          Adding someone links their account to your company.
        </p>
        <TeammateManager
          teammates={teammates}
          available={availableToAdd}
          onAdd={addTeammate}
          onRemove={removeTeammate}
        />
      </Section>

      {/* Save bottom */}
      <div className="flex justify-end pt-2 pb-8">
        <button type="submit" disabled={saving} className="btn-primary px-8 py-2.5 text-base">
          {saving ? 'Saving…' : 'Save All Changes'}
        </button>
      </div>
    </form>
  )
}
