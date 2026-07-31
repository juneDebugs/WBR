// ─── The onboarding required set — one definition of "complete" ───────────────
//
// The SINGLE source of truth for the question "is this participant's profile
// complete, and if not, what is still missing?" — for both kinds of participant.
//
// Everything that asks that question reads this module: the attendee app's
// screen gate, its request guard, its onboarding checklist, and the admin app's
// exhibitor reminder email. Before this module existed, the gate and the
// reminder each owned their own list, which meant an organizer could chase an
// exhibitor for one set of items while the app refused them on a different set.
//
// ── Hard rule, not a soft measure ────────────────────────────────────────────
//
// This is the `onboarding required set` in CONTEXT.md — a BLOCK. It is distinct
// from the four `profile completeness` measures elsewhere in the codebase (the
// sponsor dashboard's 18-field percentage, the meetings portal's 8-field
// percentage, the attendee home screen's 6-field percentage, and this module's
// own nine-item reminder list). Those nudge; this refuses. They are not expected
// to agree with each other or with this, and making them agree is deliberately
// out of scope.
//
// Because it blocks, its emptiness rules are stricter than any of those
// measures. See parseStringList below for the exact table.
//
// ── Purity, and why it matters ───────────────────────────────────────────────
//
// This module has NO imports of any kind — not the Prisma client, not a type,
// not a relative path. Three separate reasons, each independently sufficient:
//
//   1. Browser bundles. packages/db/src/index.ts line 1 exports the live
//      database client and line 2 re-exports the whole generated Prisma client,
//      so importing ANYTHING through the package root (`@conference/db`) pulls
//      database code in at runtime. Browser components must therefore
//      deep-import this file by its module path:
//
//        import { ... } from '@conference/db/src/onboarding-policy'
//
//      Getting that wrong does NOT fail a type check — it silently inflates a
//      browser bundle with database code. This is the existing convention, not
//      a new one: see apps/meetings/components/NavBar.tsx importing isWbrStaff
//      from '@conference/db/src/app-access', and the two browse-taxonomy
//      importers in apps/sponsor and apps/meetings.
//
//   2. Node test scripts type-strip files in this package directly and cannot
//      resolve extensionless relative specifiers. Same constraint documented at
//      the top of app-access.ts and chat-settings.ts. Do not add relative
//      imports here.
//
//   3. It can be exercised exhaustively without a database if a unit runner is
//      ever added. The repository has none today and adding one was previously
//      ruled out of scope; the awkward inputs are written out below so a future
//      runner has its cases already.
//
// Server code may import from the package root instead — it already pulls
// Prisma in.
//
// ── Precedent followed ───────────────────────────────────────────────────────
//
// Same shape as chat-settings.ts in this package: substantial shared rules and
// a pure decision function here, a thin per-app adapter that supplies the
// caller's identity. app-access.ts and staff-roster.ts establish that policy
// and vocabulary belong in this package rather than inside one app.

// ─── Emptiness rules ──────────────────────────────────────────────────────────

/**
 * Parse a JSON-encoded array column into a list of non-blank strings.
 *
 * Several profile columns hold a multi-select as a JSON string in a `String?`
 * column rather than as a real list. Detecting "the person selected nothing"
 * therefore needs parsing: the stored value `"[]"` is a truthy string that
 * represents no data at all.
 *
 * AWKWARD INPUTS AND THEIR OUTCOMES — the unit-test cases, written out so a
 * future runner has them ready. Every one of these must count as MISSING except
 * where noted:
 *
 *   stored value    | parses to        | result   | why
 *   ----------------|------------------|----------|--------------------------------
 *   `[]`            | empty list       | missing  | nothing selected
 *   `["a"]`         | list of strings  | FILLED   | the only filled case
 *   `5`             | the number 5     | missing  | not a list; `.length` on a
 *                   |                  |          | number is undefined, which
 *                   |                  |          | would otherwise slip past an
 *                   |                  |          | emptiness check
 *   `"hello"`       | the string hello | missing  | not a list
 *   `{}`            | an object        | missing  | not a list
 *   `null`          | null             | missing  | not a list (and reading
 *                   |                  |          | `.length` off it throws)
 *   `not json`      | throws           | missing  | unparseable
 *   `` (empty)      | —                | missing  | absent
 *   null/undefined  | —                | missing  | absent
 *
 * A list containing non-string entries keeps only the strings: `["a", 5]` is
 * filled (one usable value), `[5]` is missing (none).
 */
export function parseStringList(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  } catch {
    return []
  }
}

/**
 * Is a scalar value present?
 *
 * Blank-after-trim counts as ABSENT. That is stricter than the plain truthy
 * check the soft measures use, and deliberately so: this is a hard block, and a
 * single space must not buy a way past it.
 *
 *   `"Acme"` → present    `" "` → absent    `""` → absent    null → absent
 */
export function isScalarFilled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

// ─── Delegate required set ────────────────────────────────────────────────────
//
// A delegate is a buyer. The set therefore includes `solutionsSeeking` and
// NEVER `solutionsOffering` — see the buyer/seller mirror in CONTEXT.md. The
// sponsor set below mirrors this in the opposite direction.
//
// Unchanged from Phase 1: the same six fields, in the same order, with the same
// labels. Photo, biography, website and LinkedIn address stay optional.

/** The six fields a delegate must have populated. Declaration order is display order. */
export const DELEGATE_REQUIRED_FIELDS = [
  'name',
  'jobTitle',
  'company',
  'companySize',
  'annualRevenue',
  'solutionsSeeking',
] as const

export type DelegateField = (typeof DELEGATE_REQUIRED_FIELDS)[number]

/** Which of those fields hold a JSON-encoded list rather than a scalar. */
const DELEGATE_LIST_FIELDS: ReadonlySet<string> = new Set<DelegateField>(['solutionsSeeking'])

/**
 * The human sentence for each field — the words the checklist shows.
 *
 * Noun phrases here, because the delegate checklist labels form fields. The
 * sponsor items below use imperative sentences instead, because those are the
 * words the reminder email already sends and a refusal must not describe the
 * same task differently from the email that chased it.
 */
export const DELEGATE_FIELD_LABELS: Record<DelegateField, string> = {
  name: 'Name',
  jobTitle: 'Job title',
  company: 'Company',
  companySize: 'Company size',
  annualRevenue: 'Annual revenue',
  solutionsSeeking: 'Solutions you’re seeking',
}

/** Any object carrying some or all of the required fields — e.g. a Prisma User row. */
export type DelegateProfile = Partial<Record<DelegateField, string | null | undefined>>

/** Is one delegate field missing? */
function isDelegateFieldMissing(profile: DelegateProfile, field: DelegateField): boolean {
  const raw = profile[field]
  if (DELEGATE_LIST_FIELDS.has(field)) return parseStringList(raw).length === 0
  return !isScalarFilled(raw)
}

/**
 * Which delegate fields are still missing, in declaration order — so any list
 * rendered from this is stable rather than reordering between renders.
 */
export function missingDelegateFields(
  profile: DelegateProfile,
  required: readonly DelegateField[] = DELEGATE_REQUIRED_FIELDS,
): DelegateField[] {
  return required.filter(field => isDelegateFieldMissing(profile, field))
}

/**
 * Build the database `select` covering exactly a given set of delegate fields.
 *
 * DERIVED from the set, never written out beside it. This matters: a field that
 * was not fetched reads as `undefined`, which the rules above report as missing,
 * so a hardcoded select that drifts from the required set would block every
 * delegate on a field they had actually filled in. Deriving it makes that class
 * of bug unreachable — adding a field to DELEGATE_REQUIRED_FIELDS extends the
 * select automatically.
 */
export function delegateFieldSelect<const T extends readonly DelegateField[]>(
  fields: T,
): { [K in T[number]]: true } {
  const select = {} as { [K in T[number]]: true }
  for (const field of fields) select[field as T[number]] = true
  return select
}

/** The select covering the full delegate required set. */
export const DELEGATE_REQUIRED_SELECT = delegateFieldSelect(DELEGATE_REQUIRED_FIELDS)

// ─── Sponsor representative required set ──────────────────────────────────────
//
// A sponsor representative is gated on their EXHIBITING COMPANY's profile, not
// on their own. A sponsor is a seller, so the set mirrors the delegate set:
// `solutionsOffering` and never `solutionsSeeking`.
//
// The list below is the nine curated items the admin app's exhibitor reminder
// email already chases. It was authored by the business, is written in the
// imperative, and predates the gate. Six of the nine are the required set; the
// gate blocks on those six, while the reminder continues to chase all nine.
//
// WHY NOT THE SPONSOR DASHBOARD'S PERCENTAGE. The sponsor portal shows a
// percentage over 18 fields of a company record. Measured against the seeded
// dataset, 0 of 20 companies satisfy all 18 and the best satisfies 13, so
// adopting it as a condition of entry would refuse every exhibitor including the
// demonstration login. Against the six items below, 14 of 20 pass — the
// demonstration company among them — and the six that fail all fail on tagline
// alone.
//
// THE THREE EXCLUSIONS, each with its reason, so this is not re-litigated:
//   booth      — assigned by the organizer, not supplied by the exhibitor.
//                Blocking someone on a value they cannot set is a trap.
//   teammates  — already true of anyone who can reach the sponsor portal at all,
//                since being attached to a company is what produces the team
//                member. It can never be the thing that blocks.
//   social     — optional marketing, and absent for half the seeded companies.

/**
 * What a sponsor readiness check reads. Columns of an exhibiting company, plus
 * one relation count — "has at least one team member" counts related user rows
 * rather than reading a column, which is why the subject is a company PLUS a
 * count rather than a company alone.
 */
export interface SponsorReadinessSubject {
  logoUrl?: string | null
  tagline?: string | null
  description?: string | null
  contactName?: string | null
  contactEmail?: string | null
  boothNumber?: string | null
  solutionsOffering?: string | null
  website?: string | null
  socialLinkedIn?: string | null
  socialTwitter?: string | null
  /** Number of user accounts attached to the company. Absent counts as zero — fail closed. */
  attachedUserCount?: number
}

/** Columns of an exhibiting company that any readiness item reads. */
export type SponsorReadinessColumn = Exclude<keyof SponsorReadinessSubject, 'attachedUserCount'>

export interface SponsorReadinessItem {
  /** Stable identifier. Never shown to a person. */
  readonly key: string
  /** The human sentence — the exact words the reminder email sends. */
  readonly label: string
  /** Company columns this item reads, so a query can be derived rather than guessed. */
  readonly columns: readonly SponsorReadinessColumn[]
  /** True when the gate blocks on this item; false when the reminder chases it but the gate does not. */
  readonly required: boolean
  readonly check: (subject: SponsorReadinessSubject) => boolean
}

/**
 * The nine items, in the order the reminder email lists them. Order is part of
 * the contract: the email numbers them, and its completion percentage is
 * computed over this list's length.
 */
export const SPONSOR_READINESS_ITEMS: readonly SponsorReadinessItem[] = [
  {
    key: 'logo',
    label: 'Upload your company logo',
    columns: ['logoUrl'],
    required: true,
    check: s => isScalarFilled(s.logoUrl),
  },
  {
    key: 'tagline',
    label: 'Add a company tagline',
    columns: ['tagline'],
    required: true,
    check: s => isScalarFilled(s.tagline),
  },
  {
    key: 'description',
    label: 'Write a company description',
    columns: ['description'],
    required: true,
    // A content rule rather than a presence rule — the only one in the list.
    check: s => (typeof s.description === 'string' ? s.description.trim().length : 0) > 20,
  },
  {
    key: 'contact',
    label: 'Set primary contact name & email',
    columns: ['contactName', 'contactEmail'],
    required: true,
    // Spans two columns; both must be present.
    check: s => isScalarFilled(s.contactName) && isScalarFilled(s.contactEmail),
  },
  {
    key: 'booth',
    label: 'Confirm your booth number',
    columns: ['boothNumber'],
    required: false, // organizer-assigned — see the exclusions note above
    check: s => isScalarFilled(s.boothNumber),
  },
  {
    key: 'solutions',
    label: 'List your solutions / offerings',
    columns: ['solutionsOffering'],
    required: true,
    // Sellers offer. The buyer/seller mirror of the delegate set's solutionsSeeking.
    check: s => parseStringList(s.solutionsOffering).length > 0,
  },
  {
    key: 'teammates',
    label: 'Assign at least one team member',
    columns: [], // a relation count, not a column
    required: false, // already true of anyone who can reach the portal
    check: s => (s.attachedUserCount ?? 0) > 0,
  },
  {
    key: 'website',
    label: 'Add your website URL',
    columns: ['website'],
    required: true,
    check: s => isScalarFilled(s.website),
  },
  {
    key: 'social',
    label: 'Add LinkedIn or Twitter/X link',
    columns: ['socialLinkedIn', 'socialTwitter'],
    required: false, // optional marketing
    // Spans two columns; EITHER satisfies it.
    check: s => isScalarFilled(s.socialLinkedIn) || isScalarFilled(s.socialTwitter),
  },
]

/** The six of the nine the gate blocks on, in the same order. */
export const SPONSOR_REQUIRED_ITEMS: readonly SponsorReadinessItem[] =
  SPONSOR_READINESS_ITEMS.filter(item => item.required)

/**
 * The database `select` covering exactly the columns the required items read.
 * Derived, for the same reason the delegate select is — see delegateFieldSelect.
 */
export function sponsorReadinessSelect(
  items: readonly SponsorReadinessItem[],
): Record<SponsorReadinessColumn, true> {
  const select = {} as Record<SponsorReadinessColumn, true>
  for (const item of items) for (const column of item.columns) select[column] = true
  return select
}

/** The select covering the sponsor required set. */
export const SPONSOR_REQUIRED_SELECT = sponsorReadinessSelect(SPONSOR_REQUIRED_ITEMS)

/**
 * Which readiness items a company has not satisfied, in declaration order.
 *
 * Defaults to the full nine — the reminder's chase list. Pass
 * SPONSOR_REQUIRED_ITEMS for the six the gate blocks on.
 */
export function missingSponsorItems(
  subject: SponsorReadinessSubject,
  items: readonly SponsorReadinessItem[] = SPONSOR_READINESS_ITEMS,
): SponsorReadinessItem[] {
  return items.filter(item => !item.check(subject))
}

// ─── The named-set interface ──────────────────────────────────────────────────
//
// Two functions over a named set, which is the whole surface an enforcement
// adapter needs. The typed helpers above stay exported because a caller that
// knows which kind of participant it has gets better types from them.

export type RequiredSetName = 'delegate' | 'sponsor'

/** The subject a given required set is measured against. */
export type RequiredSetSubject = DelegateProfile | SponsorReadinessSubject

/**
 * The human sentences for everything still missing from a named required set,
 * in declaration order. The one call an adapter needs to render a checklist.
 */
export function missingRequiredLabels(
  set: RequiredSetName,
  subject: RequiredSetSubject,
): string[] {
  if (set === 'delegate') {
    return missingDelegateFields(subject as DelegateProfile).map(f => DELEGATE_FIELD_LABELS[f])
  }
  return missingSponsorItems(subject as SponsorReadinessSubject, SPONSOR_REQUIRED_ITEMS).map(
    i => i.label,
  )
}

/**
 * Is a subject complete against a named required set?
 *
 * NOTE ON FAIL DIRECTION. This answers only the completeness question. It has
 * no way to tell "an empty profile" from "no profile row at all", because both
 * arrive here as an object with nothing in it — and both answer false, which is
 * the refusing direction. Establishing that a row EXISTS is the caller's job,
 * and callers must refuse when it does not. A guard that allowed on a missing
 * row was measured wrong once already: a session pointing at a deleted person
 * created records against real participants.
 */
export function isRequiredSetComplete(
  set: RequiredSetName,
  subject: RequiredSetSubject,
): boolean {
  if (set === 'delegate') return missingDelegateFields(subject as DelegateProfile).length === 0
  return missingSponsorItems(subject as SponsorReadinessSubject, SPONSOR_REQUIRED_ITEMS).length === 0
}
