'use client'

import { useMemo, useState } from 'react'
import { SOLUTIONS, COMPANY_SIZES, REVENUE_RANGES, COMPANY_SIZE_LABELS, REVENUE_LABELS } from '@/lib/solutions'
// DEEP IMPORT, deliberately. This is a browser component, and the package root
// ('@conference/db') exports the live database client — importing through it
// would pull database code into the browser bundle. That failure is silent: it
// does not break a type check. Same convention as NavBar.tsx in this app.
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
  /**
   * The stored picture, or null. Separate from `profile` because that type is
   * exactly the required set and a photo is not in it — nothing about the gate
   * reads this. It is here so a picture already on the account is visible on the
   * screen a blocked person is sent to, rather than the checklist looking like a
   * different person's.
   */
  image: string | null
}

/**
 * The onboarding checklist form for the meetings portal.
 *
 * The third copy of a form that already exists in the participant app and, over
 * the sponsor required set, in the sponsor portal. Copied rather than shared:
 * this repository has no shared front-end package — `packages/ui` is a Tailwind
 * preset, not components — and the classes below (`card`, `chip`, `input`,
 * `btn-primary`, the `ink` colours) all come from that preset, so the copy
 * renders identically without importing anything new.
 *
 * What is NOT copied is the rule. Which fields are outstanding is computed by
 * `missingDelegateFields` from packages/db/src/onboarding-policy.ts — the same
 * function the gate uses — from the values currently in the form. That is what
 * keeps the list a person reads and the rule that releases them in agreement,
 * including the awkward case where an empty multi-select is stored as the string
 * "[]" and has to count as missing.
 *
 * Note what is absent: "solutions offering". A person admitted to this portal
 * who is not WBR-side is a delegate — a buyer — so they are asked only what they
 * are seeking, exactly as in the participant app.
 */
export function OnboardingChecklist({ profile, image }: Props) {
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
          solutionsSeeking: form.solutionsSeeking,
        }),
      })
      if (!res.ok) {
        // Say what the server said, when it said anything. A blocked person is
        // stuck on this screen until the save works, so "something went wrong"
        // leaves them guessing which box to change. The generic sentence stays
        // as the fallback for a refusal that carries no message.
        const reason = await res.json().then(d => d?.error).catch(() => null)
        throw new Error(
          typeof reason === 'string' && reason
            ? `Could not save your profile: ${reason}`
            : 'Could not save your profile. Please try again.',
        )
      }

      // ── A FULL PAGE LOAD, NOT A CLIENT NAVIGATION ────────────────────────────
      //
      // Copied deliberately from the participant app's checklist, where the pair
      // `router.refresh()` then `router.replace(...)` was measured looping: the
      // save reached the database and the server released the account, while the
      // browser handed back its cached copy of the checklist with the answers
      // gone. refresh() returns nothing to wait for, so the navigation began
      // before it finished.
      //
      // replace() and not assign(): assign pushes a history entry, so pressing
      // Back would return a released person to the checklist — and because
      // setSaving(false) never runs on the success path, that restored page comes
      // back with the button disabled and reading "Saving…".
      //
      // '/' is this portal's dashboard, which is inside the gated route group. A
      // person who has just filled in the last field passes the gate there; one
      // who somehow has not is sent straight back here, which is the gate working.
      window.location.replace('/')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const chipCls = (active: boolean) => `chip ${active ? 'chip-active' : 'chip-inactive'}`

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6" data-testid="onboarding-checklist">

      {/*
        The picture, read-only.

        Present whether or not there is one to show, so the layout does not move
        between a person whose account carries a photo and one whose does not. No
        control to change it: the photo is not in the required set, so it alters
        nothing the gate reads, and editing a photo belongs on the profile screen
        that already exists.

        A plain <img> rather than next/image because the address may be on a
        picture host this app does not list as allowed. The initial circle
        matches the treatment ProfileForm.tsx already uses in this portal.
      */}
      <div data-testid="onboarding-photo">
        {image ? (
          <img
            src={image}
            alt=""
            data-testid="onboarding-photo-image"
            className="w-16 h-16 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            data-testid="onboarding-photo-initials"
            className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center"
          >
            <span className="text-xl font-bold text-primary">
              {form.name.trim().slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-ink">Complete your profile</h1>
        <p className="text-sm text-ink-2 mt-1">
          These details drive who you get matched with at the event, so they are required before you
          start booking meetings.
        </p>
      </div>

      {/* What is still outstanding. Rendered from the shared policy, so it can
          never list something the gate disagrees about. */}
      <div className="card p-5" data-testid="onboarding-missing">
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

        <div className="card p-5 space-y-4">
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
                // The same limit the save address enforces (MAX_LEN in
                // app/api/profile/route.ts). Without it the button was enabled
                // for a value the save would always refuse, and the person was
                // told only that something went wrong — with no way to tell
                // which of the three boxes was the problem, while still blocked.
                maxLength={1000}
                data-testid={`onboarding-input-${key}`}
              />
            </div>
          ))}
        </div>

        <div className="card p-5 space-y-5">
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

        {/* Seeking only. A delegate is a buyer — there is no "offering" block
            here by design, and the save leaves any stored offering untouched. */}
        <div className="card p-5">
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
          {saving ? 'Saving…' : complete ? 'Enter the portal' : `${missing.length} still needed`}
        </button>
      </form>
    </div>
  )
}
