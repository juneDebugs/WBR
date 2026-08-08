import { prisma } from './client'
import { hashPassword, verifyPassword } from './password'
import {
  DELEGATE_REQUIRED_FIELDS,
  DELEGATE_REQUIRED_SELECT,
  type DelegateField,
  type SponsorReadinessColumn,
} from './onboarding-policy'
import {
  GATE_DEMO_SPONSOR_ID,
  GATE_DEMO_SPONSOR_PINNED,
} from './gate-demo-sponsor'

// ─── Canonical demo/test accounts — single source of truth ───────────────────
//
// These four accounts back the login page on every app and every e2e/smoke
// script. They live as ordinary rows in the shared Turso DB, which means the
// pile of ad-hoc maintenance scripts in packages/db/scripts/ (set-dummy-
// passwords, diversify-users, fill-all-combos, …) and manual "account resets"
// have repeatedly clobbered or deleted them — breaking the demo logins over
// and over.
//
// The durable fix is `ensureCanonicalTestAccount()` below, called from every
// app's NextAuth authorize(): if one of these logins is attempted with the
// correct demo password but the row is missing / has the wrong password / has
// drifted role, it is repaired in place before the credential check. The demo
// logins therefore self-heal and can no longer be permanently broken by a
// stray script.
//
// Keep this list in sync with packages/db/prisma/seed.ts (demoUsers),
// packages/db/scripts/reset-test-accounts.mjs (ACCOUNTS) and
// packages/db/scripts/backfill-onboarding-required-fields.mjs (demoFields, for
// the delegate gate demonstration account only). All four describe the same
// accounts; this one is the runtime-enforced copy. Three of them pass the
// attendee onboarding gate; onboarding-demo@test.com and
// sponsor-onboarding-demo@test.com are deliberately left blocked — see their
// entries below.
//
// ── The two restore mechanisms, and why there are two ────────────────────────
//
// A `gate demonstration account` (CONTEXT.md) returns to its incomplete state
// on every password sign-in, so a rehearsal cannot use it up. There is one per
// kind of participant, and they are NOT restored by the same code, because the
// two kinds are measured on different subjects:
//
//   - `restoreRequiredFields` extends the health check to the six DELEGATE
//     profile fields the gate measures on the User row itself. This is what the
//     attendee app and the meetings portal read.
//   - `restoreSponsorCompany` pins named columns on the SPONSOR COMPANY the
//     account is attached to. This is what the sponsor portal reads: a sponsor
//     representative's own profile is not consulted there at all.
//
// Setting the first on a sponsor account would restore fields nothing on that
// portal reads and leave the company completed, so the demonstration would
// still be used up. Recorded as UF-59.
//
// Accounts carrying neither flag are compared exactly as they were before
// either existed, and are never written by either. That containment is the
// property the phase 2 and phase 3 acceptance criteria are about, and it is
// covered by packages/db/scripts/test-canonical-account-restore.ts and
// packages/db/scripts/test-sponsor-gate-demo.ts.

// The Tailor ERP sponsor company the Sponsor account links to (see seed.ts).
export const TAILOR_SPONSOR_ID = 'cmngb2h4h0007vm28mbcpxjg5'

const HEADSHOT = (id: string) => `https://images.unsplash.com/${id}?w=400&h=400&q=80&fit=crop&crop=face`

export interface CanonicalTestAccount {
  id: string
  email: string
  password: string
  name: string
  role: string
  company: string
  jobTitle: string
  sponsorId: string | null
  image: string
  bio?: string
  // Required by the attendee app's onboarding gate, along with name, jobTitle
  // and company above. An account missing any of them is routed to the
  // onboarding checklist instead of the app — including ORGANIZER and SPONSOR
  // accounts, since the attendee app admits those roles too. Before these were
  // added, a self-healed wbr@ or sponsor@ account could sign in to the attendee
  // app and immediately be blocked by it.
  companySize?: string
  annualRevenue?: string
  solutionsSeeking?: string
  solutionsOffering?: string
  /**
   * Mark this account a `gate demonstration account` (CONTEXT.md): its
   * incompleteness is restored when it signs in WITH ITS PASSWORD, so a
   * rehearsal cannot use it up.
   *
   * PASSWORD SIGN-IN ONLY, and that is the whole of it. This function is called
   * from authorize(), which only the email-and-password provider runs. The
   * Google and LinkedIn signIn callbacks find or create a row by email address
   * and issue a session without consulting it, so an account arriving that way
   * is NOT restored.
   *
   * Stated rather than fixed, on an OPERATIONAL ASSUMPTION rather than an
   * enforced rule: these addresses are at @test.com and nobody is expected to
   * hold a Google or LinkedIn account there. Nothing in the code enforces it —
   * the OAuth callbacks match on whatever address the provider returns. A
   * demonstration account at a real email address would need this looked at
   * again.
   *
   * When set, the health check below ALSO compares the six DELEGATE_REQUIRED_
   * FIELDS values against this definition, so a profile completed by hand
   * counts as unhealthy and the repair that already exists puts it back. Without
   * it the check compares password, role and company link only, and a completed
   * profile stays completed until a reseed.
   *
   * SCOPE. This restores a DELEGATE's own six fields. A sponsor representative
   * is gated on their exhibiting COMPANY rather than on their own profile, so a
   * sponsor-side gate demonstration account is not covered by this flag and
   * needs its own mechanism against the Sponsor row.
   *
   * The photograph is deliberately outside the comparison, and outside it by
   * construction rather than by an exception: DELEGATE_REQUIRED_FIELDS does not
   * contain `image`. A definition holds a picture address while the stored row
   * may hold nothing, so comparing it would leave the account permanently
   * unhealthy and write on every single sign-in. A restore that fires for some
   * other reason does still set the photograph, because buildData writes the
   * whole definition.
   */
  restoreRequiredFields?: true
  /**
   * Mark this account the SPONSOR-SIDE `gate demonstration account`: the named
   * columns on the exhibiting company at `sponsorId` are pinned to the values
   * below and put back when the stored row disagrees.
   *
   * This is the second of the two restore mechanisms described at the top of
   * this file, and it exists because `restoreRequiredFields` cannot do this job
   * (UF-59). That flag restores DELEGATE_REQUIRED_FIELDS on the User row; the
   * sponsor onboarding gate never looks at a representative's own profile, only
   * at their attached Sponsor company's six required items.
   *
   * PASSWORD SIGN-IN ONLY, exactly as `restoreRequiredFields` is, and for the
   * same reason: this whole function is called from authorize(), which only the
   * email-and-password provider runs. The same operational assumption applies —
   * the address is at @test.com and no Google or LinkedIn account is expected
   * to hold one. Recorded at length as UF-43.
   *
   * WHAT IT WRITES IS EXACTLY WHAT IS LISTED, AND ONLY WHEN IT DISAGREES.
   * Not the whole company definition. A restore wider than the pin would keep
   * rewriting the tagline, description, logo, website and offerings on every
   * sign-in for as long as they differed from the file, which is the trap UF-40
   * and UF-47 record on the delegate half. Only the columns that actually
   * differ are written, so a settled row costs one read and no write.
   *
   * IT DOES NOT CREATE THE COMPANY. If the Sponsor row is absent this is a
   * no-op, deliberately, and that is a real limitation rather than an
   * oversight. The delegate half creates its User row when missing because a
   * User is self-contained; a Sponsor belongs to a Conference this function
   * would have to go and find, on a path that runs on every canonical sign-in,
   * to write event content from a login. The recovery for a deleted company is
   * `packages/db/scripts/reset-test-accounts.mjs`, which recreates it, and the
   * visible symptom in the meantime is the sponsor portal's existing "no
   * exhibiting company attached" refusal rather than a silent wrong state.
   *
   * CONTAINMENT. Only an account carrying this field is ever compared, and the
   * company written is only ever the one that account's own `sponsorId` names —
   * there is no second identifier to drift. `sponsor@test.com` carries no such
   * field, so Tailor ERP is never read and never written by this.
   */
  restoreSponsorCompany?: Readonly<Partial<Record<SponsorReadinessColumn, string | null>>>
}

export const CANONICAL_TEST_ACCOUNTS: CanonicalTestAccount[] = [
  {
    id: 'test-wbr',
    email: 'wbr@test.com',
    password: 'password123',
    name: 'WBR',
    role: 'ORGANIZER',
    company: 'WBR',
    jobTitle: 'Conference Organizer',
    sponsorId: null,
    image: HEADSHOT('photo-1560250097-0b93528c311a'),
    companySize: 'SMB',
    annualRevenue: '1M-10M',
    solutionsSeeking: JSON.stringify(['Analytics & Reporting', 'AI & Automation']),
  },
  {
    // The Brand-tier account, restored as Steph Curry (was demo-attendee-steph).
    id: 'test-brand',
    email: 'stephcurry@test.com',
    password: 'password123',
    name: 'Steph Curry',
    role: 'BRAND',
    company: 'Golden State Warriors',
    jobTitle: 'Point Guard',
    bio: 'Point guard for the Golden State Warriors. At WBR to scout commerce, brand, and loyalty tooling for the next signature drop.',
    sponsorId: null,
    image: HEADSHOT('photo-1507003211169-0a1dd7228f2d'),
    companySize: 'ENTERPRISE',
    annualRevenue: '250M+',
    solutionsSeeking: JSON.stringify(['AI & Automation', 'Personalization', 'Analytics & Reporting']),
    solutionsOffering: JSON.stringify(['Email Marketing', 'Loyalty & Rewards']),
  },
  {
    id: 'test-sponsor',
    email: 'sponsor@test.com',
    password: 'password123',
    name: 'Sponsor',
    role: 'SPONSOR',
    company: 'Tailor ERP',
    jobTitle: 'Partner Manager',
    sponsorId: TAILOR_SPONSOR_ID,
    image: HEADSHOT('photo-1519085360753-af0119f7cbe7'),
    companySize: 'MIDMARKET',
    annualRevenue: '10M-50M',
    solutionsSeeking: JSON.stringify(['B2B Commerce', 'Marketplace Integration']),
  },
  {
    // DELIBERATELY INCOMPLETE. This is the one account meant to hit the attendee
    // onboarding gate, so the gate can be demonstrated on cue instead of turning
    // up unannounced on someone else's login. Complete in every required field
    // except solutionsSeeking, which is an explicitly empty array.
    //
    // Do NOT "fix" this account — it is doing its job when it is blocked. It is
    // listed here so a stray maintenance script cannot quietly delete the demo
    // prop; self-heal recreates it in the same blocked state.
    //
    // `restoreRequiredFields` is what keeps it blocked across rehearsals: the
    // health check compares the six required fields against this definition, so
    // completing the profile by hand makes the account unhealthy and the next
    // sign-in puts solutionsSeeking back to the empty array. Before that flag
    // existed the check compared password, role and company link only, and a
    // completed profile stayed completed until `pnpm db:backfill-onboarding`
    // was run by hand — which is still available and still resets this account
    // specifically, but is no longer the only way back.
    id: 'test-onboarding-demo',
    email: 'onboarding-demo@test.com',
    password: 'password123',
    name: 'Onboarding Gate Demo',
    role: 'ATTENDEE',
    company: 'Gate Demo Co',
    jobTitle: 'Head of eCommerce',
    sponsorId: null,
    image: HEADSHOT('photo-1507003211169-0a1dd7228f2d'),
    companySize: 'MIDMARKET',
    annualRevenue: '10M-50M',
    solutionsSeeking: JSON.stringify([]),
    restoreRequiredFields: true,
  },
  {
    // DELIBERATELY BLOCKED, ON THE SPONSOR PORTAL. The sponsor-side counterpart
    // of onboarding-demo@test.com above, and the reason it has to exist at all:
    // the account documented as reaching all four applications is wbr@test.com,
    // which holds ORGANIZER, and the gate releases every WBR-side role before
    // asking any completeness question — so there was no account the sponsor
    // gate could stop, and it could not be demonstrated (UF-8).
    //
    // Do NOT "fix" this account or its company. Both are doing their job when
    // the checklist appears.
    //
    // WHAT IS INCOMPLETE IS THE COMPANY, NOT THIS PERSON. The six delegate
    // fields below are all filled, on purpose: the attendee app admits the
    // SPONSOR role too, so leaving them short would block this account THERE as
    // well and produce a second, unintended gate demonstration on a screen
    // nobody meant to show. The incompleteness that matters lives on the
    // Gate Demo Exhibitor company — see ./gate-demo-sponsor.ts — and is put
    // back by `restoreSponsorCompany` below.
    id: 'test-sponsor-onboarding-demo',
    email: 'sponsor-onboarding-demo@test.com',
    password: 'password123',
    name: 'Sponsor Gate Demo',
    role: 'SPONSOR',
    company: 'Gate Demo Exhibitor',
    jobTitle: 'Exhibitor Manager',
    sponsorId: GATE_DEMO_SPONSOR_ID,
    // A face none of the other four use. UF-40 recorded that
    // onboarding-demo@test.com and stephcurry@test.com already share one, which
    // matters if a screen ever shows both at once; this does not add a third to
    // that pair. Checked rather than assumed: this address answers 200.
    image: HEADSHOT('photo-1500648767791-00dcc994a43e'),
    companySize: 'SMB',
    annualRevenue: '1M-10M',
    solutionsSeeking: JSON.stringify(['Analytics & Reporting']),
    restoreSponsorCompany: GATE_DEMO_SPONSOR_PINNED,
  },
]

const CANONICAL_BY_EMAIL = new Map(CANONICAL_TEST_ACCOUNTS.map((a) => [a.email, a]))

/** True if `email` is one of the canonical demo/test accounts. */
export function isCanonicalTestEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return CANONICAL_BY_EMAIL.has(email.trim().toLowerCase())
}

/**
 * The required fields buildData writes ONLY when the definition's value is
 * truthy — its spreads below are conditional for exactly these three. Kept
 * beside the comparison because the comparison has to agree with the write; if
 * buildData's spreads change, this changes with them.
 */
const CONDITIONALLY_WRITTEN_FIELDS: ReadonlySet<DelegateField> = new Set<DelegateField>([
  'companySize',
  'annualRevenue',
  'solutionsSeeking',
])

/**
 * For a `restoreRequiredFields` account: does the stored row still hold the
 * required-field values this definition pins?
 *
 * Returns true — "nothing to restore" — for every account without the flag, so
 * this can sit unconditionally in the health check without changing behaviour
 * for the other canonical accounts. That containment is the property the phase
 * 2 acceptance criteria are about, and it is expressed here as a single early
 * return rather than as a condition at the call site, so there is one place to
 * read.
 *
 * ONLY FIELDS buildData WILL ACTUALLY WRITE ARE COMPARED. Two cases are skipped
 * for the same reason: comparing a field the repair does not write leaves the
 * account unhealthy forever, so every single sign-in writes and none of them
 * ever satisfies the comparison.
 *
 *   - A field the definition leaves undefined. It pins nothing there.
 *   - A field the definition sets to an empty string, WHERE buildData writes it
 *     conditionally on a truthy value — companySize, annualRevenue and
 *     solutionsSeeking. name, jobTitle and company are written unconditionally,
 *     so an empty string there is both comparable and restorable.
 *
 * The second case has no caller today; it is a trap laid for whoever adds the
 * next gate demonstration account, because "hold this field empty so the gate
 * blocks" is the obvious thing to reach for. Note that `solutionsSeeking: "[]"`
 * is NOT this case — "[]" is a non-empty string, truthy, written and compared.
 *
 * The comparison is on the stored string, not on "is this field complete".
 * `solutionsSeeking` for the gate demonstration account is the string `"[]"`,
 * which the onboarding policy reads as EMPTY but which is a perfectly ordinary
 * value to store and restore. Asking "does the row match the definition" keeps
 * those two questions apart.
 */
function requiredFieldsMatchDefinition(
  def: CanonicalTestAccount,
  row: Partial<Record<DelegateField, string | null>>,
): boolean {
  if (!def.restoreRequiredFields) return true
  for (const field of DELEGATE_REQUIRED_FIELDS) {
    const wanted = def[field]
    if (wanted === undefined) continue
    if (!wanted && CONDITIONALLY_WRITTEN_FIELDS.has(field)) continue
    if ((row[field] ?? null) !== wanted) return false
  }
  return true
}

/**
 * Put the sponsor-side gate demonstration company back to its pinned columns.
 *
 * Returns true if a write was performed, false in every other case — including
 * the two that are NOT failures and must not be reported as one: an account
 * that carries no pin, and a company whose stored columns already agree.
 *
 * WHY THIS IS NOT FOLDED INTO THE USER-ROW HEALTH CHECK. The two are
 * independent questions about two different rows. A user row can be perfectly
 * healthy while the company it points at has been completed by hand during a
 * rehearsal — which is the exact state this whole phase exists to recover from.
 * Its caller therefore runs this even when the user row needed nothing.
 *
 * ORDER. It runs AFTER the user-row repair, so that on the sign-in where a
 * missing account is recreated, the company it links to is settled once the
 * link exists rather than before it.
 */
async function restoreSponsorCompanyPin(def: CanonicalTestAccount): Promise<boolean> {
  const pin = def.restoreSponsorCompany
  // The containment property, as a single early return, matching the shape
  // requiredFieldsMatchDefinition() uses for the delegate half: an account
  // without the field is never compared and its company is never read.
  if (!pin) return false
  if (!def.sponsorId) return false

  const columns = Object.keys(pin) as SponsorReadinessColumn[]
  if (columns.length === 0) return false

  const select: Record<string, true> = {}
  for (const column of columns) select[column] = true

  const row = (await prisma.sponsor.findUnique({
    where: { id: def.sponsorId },
    select,
  })) as Record<string, string | null> | null

  // Company absent. A no-op by design, not a silent failure to restore — see
  // the note at `restoreSponsorCompany`'s definition for why this path does not
  // create a Sponsor row, and what recreates it instead.
  if (!row) return false

  const drifted = columns.filter(column => (row[column] ?? null) !== (pin[column] ?? null))
  if (drifted.length === 0) return false

  // Only the columns that actually differ. A write covering every pinned column
  // would settle too, but this keeps the write as narrow as the drift and makes
  // the log line below say what really changed.
  const data: Record<string, string | null> = {}
  for (const column of drifted) data[column] = pin[column] ?? null

  await prisma.sponsor.update({ where: { id: def.sponsorId }, data })
  console.warn(
    `[test-accounts] Restored gate demonstration company ${def.sponsorId}: ${drifted.join(', ')}`,
  )
  return true
}

function buildData(def: CanonicalTestAccount, passwordHash: string, sponsorId: string | null) {
  return {
    email: def.email,
    name: def.name,
    role: def.role,
    password: passwordHash,
    company: def.company,
    jobTitle: def.jobTitle,
    sponsorId,
    image: def.image,
    ...(def.bio ? { bio: def.bio } : {}),
    ...(def.companySize ? { companySize: def.companySize } : {}),
    ...(def.annualRevenue ? { annualRevenue: def.annualRevenue } : {}),
    ...(def.solutionsSeeking ? { solutionsSeeking: def.solutionsSeeking } : {}),
    ...(def.solutionsOffering ? { solutionsOffering: def.solutionsOffering } : {}),
  }
}

/**
 * Self-heal a canonical demo/test account on the login path.
 *
 * If `email` is one of the canonical accounts AND `submittedPassword` is that
 * account's real demo password, this guarantees the row exists with the correct
 * password/role/profile before the caller runs its credential check — creating
 * or repairing it as needed. It is a self-repair toward the known-good state,
 * NOT a backdoor: a wrong password is a no-op, so it can never grant access that
 * the normal password check wouldn't already grant once the row is healthy.
 *
 * Returns true if a write was performed (row created or repaired), false if the
 * account was already healthy, the email isn't canonical, or the password didn't
 * match. Never throws — a failed heal degrades to the normal (failing) login.
 */
export async function ensureCanonicalTestAccount(email: string, submittedPassword: string): Promise<boolean> {
  try {
    const def = CANONICAL_BY_EMAIL.get(email.trim().toLowerCase())
    if (!def) return false
    // Only ever heal toward the known-good state, and only when the caller
    // supplied the real demo password. Wrong-password attempts change nothing.
    if (submittedPassword !== def.password) return false

    // The six required fields are DERIVED into this select rather than written
    // out beside it, so adding a field to the delegate required set extends the
    // read automatically. A field that was not fetched would arrive as
    // undefined, which the comparison below would read as a mismatch, and the
    // account would be restored on every sign-in.
    const existing = await prisma.user.findUnique({
      where: { email: def.email },
      select: { id: true, password: true, role: true, sponsorId: true, ...DELEGATE_REQUIRED_SELECT },
    })

    // Already healthy? No write needed to the USER ROW.
    //
    // The required-field comparison sits BEFORE verifyPassword deliberately:
    // it is six string comparisons against a row already in hand, while
    // verifyPassword runs scrypt. Putting the cheap test first means a gate
    // demonstration account that needs restoring skips the hash entirely.
    const userRowHealthy = !!(
      existing &&
      existing.password &&
      existing.role === def.role &&
      (existing.sponsorId ?? null) === (def.sponsorId ?? null) &&
      requiredFieldsMatchDefinition(def, existing) &&
      (await verifyPassword(def.password, existing.password))
    )

    // THIS USED TO BE `return false`, AND IT CANNOT BE ANY MORE (UF-59). A
    // healthy user row says nothing about the exhibiting company the sponsor
    // gate actually measures, and "the account is fine but a rehearsal
    // completed its company" is precisely the state the sponsor-side
    // demonstration has to recover from. Both restores are therefore
    // considered on every call, and the return value is whether EITHER wrote.
    let wrote = false

    if (!userRowHealthy) {
      const passwordHash = await hashPassword(def.password)

      // The Sponsor account links to a sponsor company via FK. If that row is
      // missing, fall back to a null link so the login still works rather than
      // failing the write on a foreign-key violation.
      let sponsorId = def.sponsorId
      if (sponsorId) {
        const sponsorExists = await prisma.sponsor.findUnique({ where: { id: sponsorId }, select: { id: true } })
        if (!sponsorExists) sponsorId = null
      }

      const data = buildData(def, passwordHash, sponsorId)

      // Upsert by email, with an id-collision fallback (mirrors seed.ts / reset).
      if (existing) {
        await prisma.user.update({ where: { email: def.email }, data })
      } else {
        const byId = await prisma.user.findUnique({ where: { id: def.id }, select: { id: true } })
        if (byId) await prisma.user.update({ where: { id: def.id }, data })
        else await prisma.user.create({ data: { id: def.id, ...data } })
      }

      console.warn(`[test-accounts] Self-healed canonical demo account: ${def.email}`)
      wrote = true
    }

    // Runs whether or not the user row needed anything. A no-op for every
    // account that carries no company pin, which is four of the five.
    if (await restoreSponsorCompanyPin(def)) wrote = true

    return wrote
  } catch (e: any) {
    // Never let a heal failure block the login flow; the normal credential
    // check below will simply fail if the row is still bad.
    console.error('[test-accounts] ensureCanonicalTestAccount failed:', e?.message)
    return false
  }
}
