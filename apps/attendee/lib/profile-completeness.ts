/**
 * Profile-completeness policy for the attendee onboarding gate.
 *
 * Single source of truth: both the gate (the `(app)` layout redirect) and the
 * checklist UI read from here, so the two can never disagree about what
 * "complete" means.
 *
 * Pure and I/O-free on purpose — no Prisma, no fetch, no React. It takes a
 * plain object of profile values and returns which required fields are still
 * missing. That keeps it unit-testable if a runner is ever added (the repo has
 * none today; behaviour is covered in-flow by the Phase 1 Playwright script).
 *
 * Moving a field between required and optional is a one-line edit to
 * ATTENDEE_REQUIRED_FIELDS plus a redeploy.
 */

/**
 * The attendee required set. Photo, bio, website and linkedinUrl are
 * deliberately optional.
 */
export const ATTENDEE_REQUIRED_FIELDS = [
  'name',
  'jobTitle',
  'company',
  'companySize',
  'annualRevenue',
  'solutionsSeeking',
] as const

export type RequiredField = (typeof ATTENDEE_REQUIRED_FIELDS)[number]

/**
 * Fields persisted as JSON-encoded array strings in a `String?` column rather
 * than as scalars. These need parsing to detect emptiness — see
 * isFieldMissing.
 */
const ARRAY_FIELDS: ReadonlySet<string> = new Set<RequiredField>(['solutionsSeeking'])

/**
 * Attendee-facing labels. Attendees are buyers, so the multi-select is
 * "seeking" — never "offering".
 */
export const FIELD_LABELS: Record<RequiredField, string> = {
  name: 'Name',
  jobTitle: 'Job title',
  company: 'Company',
  companySize: 'Company size',
  annualRevenue: 'Annual revenue',
  solutionsSeeking: 'Solutions you’re seeking',
}

/** Any object carrying some or all of the required fields, e.g. a Prisma User. */
export type CompletenessProfile = Partial<Record<RequiredField, string | null | undefined>>

/**
 * Parse a JSON-encoded array column into a list of non-blank strings.
 *
 * Returns [] for null/undefined/empty, for unparseable JSON, and for JSON that
 * is valid but not an array of strings. That last case matters: a bare `"5"`
 * parses to the number 5, and reading `.length` off a number yields undefined,
 * which would otherwise slip past an emptiness check.
 */
export function parseArrayField(value: string | null | undefined): string[] {
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
 * Is one required field missing?
 *
 * Array fields are missing when they parse to an empty list — the case that
 * matters is an empty selection persisted as the string "[]", which is a
 * truthy string but represents no data. This mirrors the sponsor-side
 * completeness fix (apps/sponsor/components/DashboardView.tsx).
 *
 * Scalar fields are missing when absent or blank. Blank-after-trim counts as
 * missing here, which is stricter than the sponsor metric's plain falsy check:
 * this gate is a hard block, so a single space must not buy a way past it.
 */
function isFieldMissing(profile: CompletenessProfile, field: RequiredField): boolean {
  const raw = profile[field]
  if (ARRAY_FIELDS.has(field)) return parseArrayField(raw).length === 0
  return typeof raw !== 'string' || raw.trim() === ''
}

/**
 * Which required fields are still missing, in the order they are declared —
 * so the checklist lists them in a stable, predictable order.
 */
export function missingFields(
  profile: CompletenessProfile,
  required: readonly RequiredField[] = ATTENDEE_REQUIRED_FIELDS,
): RequiredField[] {
  return required.filter(field => isFieldMissing(profile, field))
}

/** Is the whole required set populated? */
export function isComplete(
  profile: CompletenessProfile,
  required: readonly RequiredField[] = ATTENDEE_REQUIRED_FIELDS,
): boolean {
  return missingFields(profile, required).length === 0
}

/**
 * The Prisma `select` covering exactly the required set. Kept next to the
 * policy so adding a required field cannot leave a caller silently reading a
 * field it never fetched (an unfetched field reads as undefined, which the
 * policy would report as missing).
 */
export const REQUIRED_FIELD_SELECT = {
  name: true,
  jobTitle: true,
  company: true,
  companySize: true,
  annualRevenue: true,
  solutionsSeeking: true,
} as const
