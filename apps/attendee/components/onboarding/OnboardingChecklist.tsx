'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SOLUTIONS, COMPANY_SIZES, REVENUE_RANGES, COMPANY_SIZE_LABELS, REVENUE_LABELS } from '@/lib/solutions'
// DEEP IMPORT, deliberately. This is a browser component, and the package root
// ('@conference/db') exports the live database client — importing through it
// would pull database code into the browser bundle. That failure is silent: it
// does not break a type check. Same convention as NavBar.tsx in the meetings
// portal and the two browse-taxonomy importers.
import {
  DELEGATE_FIELD_LABELS,
  missingDelegateFields,
  parseStringList,
  type DelegateProfile,
  type DelegateField,
} from '@conference/db/src/onboarding-policy'

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

interface Props {
  profile: DelegateProfile
}

/**
 * The onboarding checklist form.
 *
 * Collects exactly the required set and nothing else. Note what is absent:
 * "solutions offering". Attendees come to the event to buy, so they are asked
 * only what they are seeking. (The older Settings screen still shows both;
 * correcting that is deliberately out of scope for this phase.)
 *
 * Which fields are outstanding is computed by the same policy module the gate
 * uses, from the values currently in the form. That is what keeps the list the
 * attendee reads and the rule that releases them in agreement — including the
 * awkward case where an empty multi-select is stored as the string "[]" and
 * has to count as missing.
 */
export function OnboardingChecklist({ profile }: Props) {
  const router = useRouter()

  const [form, setForm] = useState({
    name: profile.name ?? '',
    jobTitle: profile.jobTitle ?? '',
    company: profile.company ?? '',
    companySize: profile.companySize ?? '',
    annualRevenue: profile.annualRevenue ?? '',
    solutionsSeeking: parseStringList(profile.solutionsSeeking),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Route the live form state back through the shared policy, so the checklist
  // and the gate apply one rule rather than two lookalike ones.
  const missing = useMemo<DelegateField[]>(
    () =>
      missingDelegateFields({
        name: form.name,
        jobTitle: form.jobTitle,
        company: form.company,
        companySize: form.companySize,
        annualRevenue: form.annualRevenue,
        solutionsSeeking: JSON.stringify(form.solutionsSeeking),
      }),
    [form],
  )
  const complete = missing.length === 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!complete || saving) return
    setError('')
    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          jobTitle: form.jobTitle.trim(),
          company: form.company.trim(),
          companySize: form.companySize,
          annualRevenue: form.annualRevenue,
          solutionsSeeking: JSON.stringify(form.solutionsSeeking),
        }),
      })
      if (!res.ok) throw new Error('Could not save your profile. Please try again.')
      // Drop the cached app shell so the gate re-reads the saved profile, then
      // hand the attendee straight to the app. replace() rather than push() so
      // the back button cannot land them on a checklist they have finished.
      router.refresh()
      router.replace('/home')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const chipCls = (active: boolean) => `chip ${active ? 'chip-active' : 'chip-inactive'}`

  return (
    <div className="page-container space-y-6" data-testid="onboarding-checklist">

      <div>
        <h1 className="text-2xl font-bold text-ink">Complete your profile</h1>
        <p className="text-sm text-ink-2 mt-1">
          These details drive who you get matched with at the event, so they are required before you
          start.
        </p>
      </div>

      {/* What is still outstanding. Rendered from the shared policy, so it can
          never list something the gate disagrees about. */}
      <div className="card" data-testid="onboarding-missing">
        {complete ? (
          <p className="text-sm font-medium text-success-ink" data-testid="onboarding-missing-none">
            Everything required is filled in.
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold text-ink-2 uppercase mb-2">
              Still needed ({missing.length})
            </p>
            <ul className="space-y-1">
              {missing.map(field => (
                <li
                  key={field}
                  className="text-sm text-ink flex items-center gap-2"
                  data-testid={`onboarding-missing-${field}`}
                >
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                  {DELEGATE_FIELD_LABELS[field]}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="card space-y-4">
          {([
            ['name', 'Name', 'Your name'],
            ['jobTitle', 'Job Title', 'e.g. Head of eCommerce'],
            ['company', 'Company', 'Your company'],
          ] as const).map(([key, label, placeholder]) => (
            <div key={key}>
              <label htmlFor={`onboarding-${key}`} className="block text-xs font-semibold text-ink-2 uppercase mb-1">
                {label}
              </label>
              <input
                id={`onboarding-${key}`}
                name={key}
                type="text"
                value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="input"
                data-testid={`onboarding-input-${key}`}
              />
            </div>
          ))}
        </div>

        <div className="card space-y-5">
          <div>
            <span className="block text-xs font-semibold text-ink-2 uppercase mb-2">Company Size</span>
            <div className="flex flex-wrap gap-2">
              {COMPANY_SIZES.map(s => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={form.companySize === s}
                  onClick={() => setForm(f => ({ ...f, companySize: f.companySize === s ? '' : s }))}
                  className={chipCls(form.companySize === s)}
                  data-testid={`onboarding-companySize-${s}`}
                >
                  {COMPANY_SIZE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs font-semibold text-ink-2 uppercase mb-2">Annual Revenue</span>
            <div className="flex flex-wrap gap-2">
              {REVENUE_RANGES.map(r => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={form.annualRevenue === r}
                  onClick={() => setForm(f => ({ ...f, annualRevenue: f.annualRevenue === r ? '' : r }))}
                  className={chipCls(form.annualRevenue === r)}
                  data-testid={`onboarding-annualRevenue-${r}`}
                >
                  {REVENUE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Seeking only. Attendees are buyers — there is no "offering" block
            here by design. */}
        <div className="card">
          <span className="block text-xs font-semibold text-ink-2 uppercase mb-2">
            Solutions I am Seeking
          </span>
          <p className="text-xs text-ink-3 mb-3">Pick at least one. This is what we match you on.</p>
          <div className="flex flex-wrap gap-2">
            {SOLUTIONS.map(s => (
              <button
                key={s}
                type="button"
                aria-pressed={form.solutionsSeeking.includes(s)}
                onClick={() => setForm(f => ({ ...f, solutionsSeeking: toggle(f.solutionsSeeking, s) }))}
                className={chipCls(form.solutionsSeeking.includes(s))}
                data-testid={`onboarding-solutionsSeeking-${s}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-danger-ink" data-testid="onboarding-error">{error}</p>}

        <button
          type="submit"
          disabled={!complete || saving}
          className="btn-primary w-full disabled:opacity-50"
          data-testid="onboarding-submit"
        >
          {saving ? 'Saving…' : complete ? 'Enter the event' : `${missing.length} still needed`}
        </button>
      </form>
    </div>
  )
}
