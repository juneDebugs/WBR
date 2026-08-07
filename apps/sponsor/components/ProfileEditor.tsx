'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useInvalidate } from '@/lib/hooks'
import { LogoUploader } from '@/components/LogoUploader'
// The canonical solutions vocabulary, per docs/adr/0006-sponsor-solution-taxonomy-reconciliation.md.
//
// That record — dated 2026-07-29 — named lib/solutions.ts as the single canonical
// taxonomy and listed "ProfileEditor.tsx chip list replaced with an import from
// lib/solutions.ts. Local const SOLUTIONS deleted" as a load-bearing subtask. The
// code half was never done. This is it.
//
// WHY IT COULD NOT WAIT FOR ITS OWN CHANGE. All 20 seeded companies store
// canonical strings ("Analytics & Reporting", "AI & Automation", "Loyalty &
// Rewards" — checked, none outside the canonical list), while this file's own list
// held a different 18 strings that overlapped on only 6. A representative opening
// this screen therefore saw NONE of their real solutions selected, and saving
// replaced their canonical values with non-canonical ones. That path was dormant
// only because this form could not be submitted at all — every company's relative
// logo path failed browser URL validation, so pressing Save did nothing. Phase 5
// fixed that, which would have turned a dormant data-corruption path into a live
// one. Fixing the vocabulary at the same time is what stops that.
//
// The data re-map that record also called for needs no work: the stored values are
// already canonical.
import { SOLUTIONS } from '@/lib/solutions'

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
      <h2 className="font-semibold text-ink pb-3 border-b border-hairline">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {hint && <p className="text-xs text-ink-3 mb-1.5">{hint}</p>}
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
            className={`chip ${value.includes(o) ? 'chip-active' : 'chip-inactive'}`}>
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

// LogoUploader used to live here. It moved to components/LogoUploader.tsx in
// Phase 5 so the sponsor onboarding checklist could use the same input instead
// of the app growing a second one. Pure move; see the note in that file.

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
        <p className="text-sm text-ink-3">No teammates added yet.</p>
      ) : (
        <div className="space-y-2">
          {teammates.map(t => (
            <div key={t.id} className="flex items-center gap-3 p-3 bg-fill rounded-xl">
              {t.image ? (
                <img src={t.image} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary">{t.name?.[0] ?? '?'}</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{t.name}</p>
                <p className="text-xs text-ink-2 truncate">{t.jobTitle} · {t.email}</p>
              </div>
              <button type="button" onClick={() => onRemove(t.id)}
                className="text-xs text-danger hover:text-danger px-2 py-1 rounded-lg hover:bg-danger-soft transition-colors flex-shrink-0">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add teammates */}
      <div>
        <p className="text-xs font-medium text-ink mb-2">Add a teammate</p>
        <input className="input mb-2" placeholder="Search by name or email…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <div className="border border-hairline rounded-xl overflow-hidden max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-ink-3 p-3">No users found</p>
            ) : filtered.map(u => (
              <button key={u.id} type="button" onClick={() => { onAdd(u.id); setSearch('') }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-fill transition-colors text-left border-b border-hairline last:border-0">
                {u.image ? (
                  <img src={u.image} alt="" loading="lazy" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">{u.name?.[0] ?? '?'}</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{u.name}</p>
                  <p className="text-xs text-ink-2 truncate">{u.jobTitle} · {u.email}</p>
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
  const invalidate = useInvalidate()
  // Used only to re-run the server layouts after a save, so the onboarding gate
  // re-reads the company. See the note at the router.refresh() call below.
  const router = useRouter()
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
  // Read, never edited here. The booth number is assigned by the event organizer
  // from the floor plan screen — a company does not choose where the floor sells
  // it a stand — and the profile-save address refuses the field outright. Holding
  // it in state with a setter would build a control that looks editable and a
  // save that is refused.
  const boothNumber = sponsor.boothNumber ?? ''
  const [socialLinkedIn, setSocialLinkedIn] = useState(sponsor.socialLinkedIn ?? '')
  const [socialTwitter, setSocialTwitter] = useState(sponsor.socialTwitter ?? '')
  const [solutionsOffering, setSolutionsOffering] = useState<string[]>(parseArr(sponsor.solutionsOffering))
  const [solutionsSeeking, setSolutionsSeeking] = useState<string[]>(parseArr(sponsor.solutionsSeeking))
  const [targetIndustries, setTargetIndustries] = useState<string[]>(parseArr(sponsor.targetIndustries))
  const [targetCompanySizes, setTargetCompanySizes] = useState<string[]>(parseArr(sponsor.targetCompanySizes))
  const [targetRevenues, setTargetRevenues] = useState<string[]>(parseArr(sponsor.targetRevenues))

  // Teammates
  const [teammates, setTeammates] = useState<any[]>(sponsor.users ?? [])
  // Phase 13: refusals from the teammate addresses used to be discarded. See
  // refusalMessage() below.
  const [teammateError, setTeammateError] = useState<string | null>(null)

  /**
   * Read the reason a teammate change was refused, or fall back to a sentence
   * that at least says something happened.
   *
   * Phase 13. Both handlers below used to test `res.ok` and do nothing at all
   * when it was false, so every refusal looked to the exhibitor like a button
   * that does not work. That mattered more once this phase started refusing on
   * purpose: attaching an account that already belongs to another company now
   * answers 409, and an identifier matching nothing answers 404. A silent
   * refusal is the same failure Phase 5 found on the checklist, where a button
   * that could not submit produced no request and no message.
   */
  async function refusalMessage(res: Response, fallback: string): Promise<string> {
    try {
      const body = await res.json()
      if (body?.error) return String(body.error)
    } catch {
      // Not JSON — the fallback is the honest answer.
    }
    return fallback
  }

  async function addTeammate(userId: string) {
    setTeammateError(null)
    const res = await fetch('/api/profile/teammates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      const user = availableUsers.find(u => u.id === userId)
      if (user) setTeammates(prev => [...prev, user])
      invalidate.teammates(); invalidate.sponsor()
      return
    }
    setTeammateError(await refusalMessage(res, 'Could not add that person to your team.'))
  }

  async function removeTeammate(userId: string) {
    setTeammateError(null)
    const res = await fetch('/api/profile/teammates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (res.ok) {
      setTeammates(prev => prev.filter(t => t.id !== userId))
      invalidate.teammates(); invalidate.sponsor()
      return
    }
    setTeammateError(await refusalMessage(res, 'Could not remove that person from your team.'))
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
          // boothNumber is deliberately absent: the organizer owns it, and the
          // save address refuses any request that carries the key at all.
          companySize, annualRevenue, founded, headquarters,
          socialLinkedIn, socialTwitter,
          solutionsOffering, solutionsSeeking,
          targetIndustries, targetCompanySizes, targetRevenues,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      await Promise.all([invalidate.sponsor(), invalidate.profile()])
      // THIS IS THE ONBOARDING GATE'S ONLY IN-APP CLOSE. Added in Phase 5.
      //
      // The gate runs in the (portal) layout, and all six portal screens SHARE
      // that layout, so Next.js does not re-run it on client-side navigation —
      // measured, not assumed: after clearing a required item behind an open tab,
      // in-app navigation reached both an already-visited screen and a
      // not-yet-visited one without being stopped, while a hard load was stopped
      // correctly. This screen is the only place inside the portal where a
      // required item can be emptied, so it is the only place that can close the
      // window. The two invalidations above refresh react-query data; they do not
      // re-run a server layout. This does.
      //
      // Same decision and same reason as the attendee app's settings screen, per
      // FP finding F-1. Residual, accepted there and here: an item cleared
      // OUTSIDE this tab — an organizer editing from the admin app, or the same
      // person on a second device — leaves that tab able to move between portal
      // screens it has already loaded until the next hard load.
      router.refresh()
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
          <h1 className="text-2xl font-bold text-ink">Sponsor Profile</h1>
          <p className="text-sm text-ink-2 mt-1">Changes sync instantly to all WBR 2027 apps</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-sm text-success-ink font-medium flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved & synced
            </span>
          )}
          {error && <span className="text-sm text-danger">{error}</span>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Live preview banner */}
      {(logoUrl || name) && (
        <div className="card p-0 overflow-hidden">
          {heroImageUrl && (
            <div className="h-36 bg-fill overflow-hidden">
              <img src={heroImageUrl} alt="Hero" loading="lazy" className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = 'none' }} />
            </div>
          )}
          <div className="p-4 flex items-center gap-4">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" loading="lazy" className="w-14 h-14 object-contain rounded-xl border border-hairline bg-surface p-1"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center">
                <span className="text-lg font-bold text-primary">{name[0]}</span>
              </div>
            )}
            <div>
              <p className="font-bold text-ink text-lg">{name}</p>
              {tagline && <p className="text-sm text-ink-2">{tagline}</p>}
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
          <textarea className="textarea min-h-[120px]" value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="We help DTC brands grow through…" />
        </Field>
        <Field label="Logo" hint="Supports URL, PNG, JPG, SVG, or WebP upload">
          <LogoUploader value={logoUrl} onChange={setLogoUrl} />
        </Field>
        <Field label="Hero / Banner Image URL" hint="Wide banner shown at top of your profile (1200×400px ideal)">
          {/* type="text", not type="url" — the same latent trap the logo input
              had, and disarmed for the same reason. This column holds an image
              address the app renders straight into an <img src>, so a relative
              path like /sponsors/banner.jpg is a legitimate value; type="url"
              rejects it, and rejection makes the WHOLE form unsubmittable with
              no request, no error and nothing on screen to explain it. Empty for
              all 20 seeded companies today, so nothing is broken by it right now
              — changed because the failure is silent and total when it does
              happen, which is what made the logo version of it expensive to
              find. socialLinkedIn below keeps type="url" deliberately: a social
              profile link genuinely has to be absolute, and every stored value
              already is. */}
          <input className="input" type="text" inputMode="url" value={heroImageUrl}
            onChange={e => setHeroImageUrl(e.target.value)}
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
            {/* Read-only by design, not disabled by oversight.

                A disabled input would look like a control that is temporarily
                unavailable and invite someone to hunt for the way to turn it on.
                Plain text plus one sentence says what is actually true: this
                value belongs to the organizer, who assigns stands.

                The empty case is worth as much as the filled one — "not assigned
                yet" tells a representative the number is coming, where an empty
                box would read as something they forgot to fill in. */}
            <p data-testid="booth-number-value" className="text-sm text-ink">
              {boothNumber || <span className="text-ink/50">Not assigned yet</span>}
            </p>
            <p className="mt-1 text-xs text-ink/60">
              Assigned by the event organizer.
            </p>
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
        <p className="text-xs text-ink-2 -mt-2">Who you want to meet at WBR 2027 — used to match you with relevant attendees</p>
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
        <p className="text-xs text-ink-2 -mt-2">
          Teammates appear on your sponsor card in the meeting portal and attendee app.
          Adding someone links their account to your company.
        </p>
        {/* Phase 13. This sentence exists because the behaviour above it is not
            what an exhibitor would assume. Adding an existing account here shares
            the company's records with them and leaves their sign-in permissions
            exactly as they were, so they still cannot open this portal. The
            alternative — giving them the SPONSOR role — would let them in and
            would take away their access to the meetings portal, and detaching
            them later would not give it back. Decided 2026-07-31; the reasoning
            and the rejected alternatives are in the plan's Phase 13, and the
            matching notes are at app/api/profile/teammates/route.ts and
            app/api/profile/teammates/register/route.ts. To give a colleague
            access to this portal, create their account on the Submissions screen
            instead. */}
        <p className="text-xs text-ink-2" data-testid="teammate-access-note">
          Adding someone here does not give them access to this sponsor portal — it
          shares your company&apos;s records and leaves their existing sign-in
          unchanged. To create a colleague who can sign in to the portal, use
          &ldquo;Register a teammate&rdquo; on the Submissions screen.
        </p>
        {teammateError && (
          <p className="text-xs text-danger" data-testid="teammate-error" role="alert">
            {teammateError}
          </p>
        )}
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
