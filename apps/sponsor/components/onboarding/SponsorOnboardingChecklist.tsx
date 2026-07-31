'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SOLUTIONS } from '@/lib/solutions'
import { LogoUploader } from '@/components/LogoUploader'
// DEEP IMPORT, deliberately. This is a browser component, and the package root
// ('@conference/db') exports the live database client and re-exports the whole
// generated client — importing through it would pull database code into the
// browser bundle. That failure is silent: it does not break a type check, it
// just inflates the bundle. Same convention as the attendee checklist, the
// meetings portal's NavBar, and the two browse-taxonomy importers.
import {
  SPONSOR_REQUIRED_ITEMS,
  missingSponsorItems,
  parseStringList,
  type SponsorReadinessSubject,
} from '@conference/db/src/onboarding-policy'

function toggle<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]
}

interface Props {
  company: SponsorReadinessSubject
  companyName: string
}

/**
 * The sponsor onboarding checklist.
 *
 * Collects exactly the six required items and nothing else. Note what is absent:
 * "solutions seeking". An exhibitor is at the event to SELL, so they are asked
 * only what they offer — the mirror of the attendee checklist, which asks only
 * what that person is seeking. (The fuller profile editor still shows both;
 * correcting that inversion is deliberately out of scope, as it was in Phase 1.)
 *
 * Which items are outstanding is computed by the same policy module the gate
 * uses, from the values currently in the form, so the list a representative
 * reads and the rule that releases them cannot disagree. That includes the
 * awkward cases the policy documents: an empty multi-select stored as the string
 * "[]" counts as missing, and a description has to clear 20 characters rather
 * than merely exist.
 *
 * The wording of each item comes from SPONSOR_REQUIRED_ITEMS, which is the same
 * list and the same sentences the admin app's exhibitor reminder email sends.
 * An exhibitor who received that email and then hits this screen reads the same
 * task described the same way. Do not retype those labels here.
 */
export function SponsorOnboardingChecklist({ company, companyName }: Props) {
  const router = useRouter()

  // The values as this page loaded them. Kept so the save can send only what the
  // representative actually changed — see the note in handleSubmit.
  const initial = useMemo(
    () => ({
      logoUrl: company.logoUrl ?? '',
      tagline: company.tagline ?? '',
      description: company.description ?? '',
      contactName: company.contactName ?? '',
      contactEmail: company.contactEmail ?? '',
      website: company.website ?? '',
      solutionsOffering: parseStringList(company.solutionsOffering),
    }),
    [company],
  )

  const [form, setForm] = useState({
    logoUrl: company.logoUrl ?? '',
    tagline: company.tagline ?? '',
    description: company.description ?? '',
    contactName: company.contactName ?? '',
    contactEmail: company.contactEmail ?? '',
    website: company.website ?? '',
    // parseStringList rather than a bare JSON.parse. FP finding F-7 recorded a
    // screen blanking out because a malformed value in one of these columns
    // threw during render, invisible over HTTP because the server still answered
    // 200. The policy's parser returns an empty list for unparseable text and
    // for valid-but-wrong-shape values such as a bare number.
    solutionsOffering: parseStringList(company.solutionsOffering),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Route the live form state back through the shared policy, so the checklist
  // and the gate apply one rule rather than two lookalike ones.
  const missing = useMemo(
    () =>
      missingSponsorItems(
        {
          ...form,
          solutionsOffering: JSON.stringify(form.solutionsOffering),
          // Carried through from the server read. No REQUIRED item consults it
          // today, but passing it keeps this subject the whole thing the policy
          // documents rather than a partial one that would fail closed if the
          // team-member item were ever made required.
          attachedUserCount: company.attachedUserCount,
        },
        SPONSOR_REQUIRED_ITEMS,
      ),
    [form, company.attachedUserCount],
  )
  const complete = missing.length === 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!complete || saving) return
    setError('')
    setSaving(true)
    // SEND ONLY WHAT CHANGED, never the whole required set.
    //
    // The obvious version of this posted all six items every time. That reads as
    // harmless and is not: this screen holds the values it loaded with, so if an
    // organizer corrects or deliberately clears one of them from the admin app
    // while this tab is open, submitting would write the tab's older value back
    // over the organizer's — and, because the gate then reads a required set that
    // looks satisfied again, would release the representative on the restored
    // stale value. An old tab could quietly undo a deliberate re-block.
    //
    // Sending only edited fields means an untouched field is not in the request
    // at all, and /api/profile only writes keys the body carries, so a concurrent
    // change to a field this person did not touch survives. This does not make
    // the save transactional — two people editing the SAME field still race, and
    // detecting that would need a version column, which is a schema change and
    // deliberately out of scope for this phase. It removes the case that costs
    // something: silently reversing someone else's correction.
    const changed: Record<string, string | string[]> = {}
    for (const key of ['logoUrl', 'tagline', 'description', 'contactName', 'contactEmail', 'website'] as const) {
      const next = form[key].trim()
      if (next !== initial[key].trim()) changed[key] = next
    }
    if (JSON.stringify(form.solutionsOffering) !== JSON.stringify(initial.solutionsOffering)) {
      changed.solutionsOffering = form.solutionsOffering
    }

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      })
      if (!res.ok) throw new Error('Could not save your company profile. Please try again.')
      // Drop any cached render so the gate re-reads the saved company, then hand
      // the representative straight to the portal. replace() rather than push()
      // so the back button cannot land them on a checklist they have finished.
      router.refresh()
      router.replace('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
    }
  }

  const chipCls = (active: boolean) => `chip ${active ? 'chip-active' : 'chip-inactive'}`

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6" data-testid="sponsor-onboarding-checklist">

      <div>
        <h1 className="text-2xl font-bold text-ink">Complete your company profile</h1>
        <p className="text-sm text-ink-2 mt-1">
          Buyers see this profile before they agree to meet you, so {companyName} needs these
          filled in before the portal opens.
        </p>
      </div>

      {/* What is still outstanding. Rendered from the shared policy in its
          declaration order, so it can never list something the gate disagrees
          about, and the order never shuffles between renders. */}
      <div className="card p-6" data-testid="sponsor-onboarding-missing">
        {complete ? (
          <p className="text-sm font-medium text-success-ink" data-testid="sponsor-onboarding-missing-none">
            Everything required is filled in.
          </p>
        ) : (
          <>
            <p className="text-xs font-semibold text-ink-2 uppercase mb-2">
              Still needed ({missing.length})
            </p>
            <ul className="space-y-1">
              {missing.map(item => (
                <li
                  key={item.key}
                  className="text-sm text-ink flex items-center gap-2"
                  data-testid={`sponsor-onboarding-missing-${item.key}`}
                >
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                  {item.label}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="card p-6 space-y-5">
          <div>
            {/* htmlFor points at the address field inside LogoUploader. Without
                it this was a bare line of text next to an unnamed input, which is
                nothing to somebody using a screen reader — and this screen is the
                only route out for a blocked representative. */}
            <label htmlFor="sponsor-onboarding-logoUrl" className="label">Company logo</label>
            <LogoUploader
              value={form.logoUrl}
              onChange={v => setForm(f => ({ ...f, logoUrl: v }))}
              inputId="sponsor-onboarding-logoUrl"
            />
          </div>

          <div>
            <label htmlFor="sponsor-onboarding-tagline" className="label">Tagline</label>
            <p className="text-xs text-ink-3 mb-1.5">One line on what your company does.</p>
            <input
              id="sponsor-onboarding-tagline"
              name="tagline"
              type="text"
              className="input"
              value={form.tagline}
              onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
              placeholder="e.g. Composable ERP for high-growth commerce"
              data-testid="sponsor-onboarding-input-tagline"
            />
          </div>

          <div>
            <label htmlFor="sponsor-onboarding-description" className="label">Description</label>
            {/* THE NUMBER HERE MUST MATCH THE POLICY, AND IT IS NOT 20.
                The policy's rule is `trim().length > 20`, so the smallest
                description that satisfies it is 21 characters — checked against
                the module, not read off the comment: 20 fails, 21 passes.
                This copy said "at least 20" with a /20 counter, which meant a
                representative who typed exactly 20 saw the requirement apparently
                met while the item stayed outstanding and the button stayed
                disabled, on the one screen that can release them and with nothing
                to explain the discrepancy. Found by adversarial review.
                The copy changed rather than the policy: the policy is shared with
                the admin app's reminder email and moving its threshold would
                change who that email chases. */}
            <p className="text-xs text-ink-3 mb-1.5">
              At least 21 characters. {form.description.trim().length}/21
            </p>
            <textarea
              id="sponsor-onboarding-description"
              name="description"
              rows={4}
              className="input"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What you sell, who you sell it to, and why a buyer should stop at your booth."
              data-testid="sponsor-onboarding-input-description"
            />
          </div>

          <div>
            <label htmlFor="sponsor-onboarding-website" className="label">Website</label>
            {/* type="text", not type="url", for the same reason as the logo
                input — see the note in components/LogoUploader.tsx. The required
                rule is that a website is present, so browser URL validation can
                only refuse a save the rule would have accepted, and it refuses
                by silently never firing the submit event. Someone typing
                "tailor.tech" without a scheme gets released rather than stuck on
                a screen that does nothing when pressed. */}
            <input
              id="sponsor-onboarding-website"
              name="website"
              type="text"
              inputMode="url"
              className="input"
              value={form.website}
              onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
              placeholder="https://yourcompany.com"
              data-testid="sponsor-onboarding-input-website"
            />
          </div>
        </div>

        {/* Both halves of one item. The policy treats contact name and contact
            email as a single required item spanning two columns, and both must
            be present, so they are grouped here to match. */}
        <div className="card p-6 space-y-5">
          <h2 className="font-semibold text-ink pb-3 border-b border-hairline">Primary contact</h2>
          <div>
            <label htmlFor="sponsor-onboarding-contactName" className="label">Contact name</label>
            <input
              id="sponsor-onboarding-contactName"
              name="contactName"
              type="text"
              className="input"
              value={form.contactName}
              onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
              placeholder="Who should buyers deal with?"
              data-testid="sponsor-onboarding-input-contactName"
            />
          </div>
          <div>
            <label htmlFor="sponsor-onboarding-contactEmail" className="label">Contact email</label>
            <input
              id="sponsor-onboarding-contactEmail"
              name="contactEmail"
              type="email"
              className="input"
              value={form.contactEmail}
              onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
              placeholder="name@yourcompany.com"
              data-testid="sponsor-onboarding-input-contactEmail"
            />
          </div>
        </div>

        {/* OFFERING ONLY. Exhibitors sell; there is no "seeking" block here by
            design, and adding one would reintroduce the buyer/seller inversion
            this checklist exists to get right. The option list is the sponsor
            app's lib/solutions.ts, which is the vocabulary the seeded companies
            actually store — checked against all 20 rows, not assumed. */}
        {/* A labelled group, not a heading followed by loose buttons. Eighteen
            toggle buttons with no group name announce themselves one at a time
            with no indication of what they belong to. `fieldset`/`legend` is the
            plain HTML way to say "these belong together and this is their name",
            and it needs no scripting to work. */}
        <fieldset className="card p-6">
          <legend className="label">Solutions we offer</legend>
          <p className="text-xs text-ink-3 mb-3">
            Pick at least one. This is what buyers are matched to you on.
          </p>
          <div className="flex flex-wrap gap-2">
            {SOLUTIONS.map(s => (
              <button
                key={s}
                type="button"
                aria-pressed={form.solutionsOffering.includes(s)}
                onClick={() => setForm(f => ({ ...f, solutionsOffering: toggle(f.solutionsOffering, s) }))}
                className={chipCls(form.solutionsOffering.includes(s))}
                data-testid={`sponsor-onboarding-solution-${s}`}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="text-sm text-danger-ink" data-testid="sponsor-onboarding-error">{error}</p>
        )}

        <button
          type="submit"
          disabled={!complete || saving}
          className="btn-primary w-full disabled:opacity-50"
          data-testid="sponsor-onboarding-submit"
        >
          {saving ? 'Saving…' : complete ? 'Open the portal' : `${missing.length} still needed`}
        </button>

        {/* A quiet reminder of which fields the outstanding list refers to,
            for the case where a representative has scrolled past one. */}
        {!complete && (
          <p className="text-xs text-ink-3 text-center">
            Outstanding: {missing.map(i => i.key).join(', ')}
          </p>
        )}
      </form>
    </div>
  )
}
