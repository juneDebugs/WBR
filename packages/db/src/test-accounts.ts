import { prisma } from './client'
import { hashPassword, verifyPassword } from './password'

// ─── Canonical demo/test accounts — single source of truth ───────────────────
//
// These three accounts back the login page on every app and every e2e/smoke
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
// Keep this list in sync with packages/db/prisma/seed.ts (demoUsers) and
// packages/db/scripts/reset-test-accounts.mjs (ACCOUNTS). All three describe
// the same three accounts; this one is the runtime-enforced copy.

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
  solutionsSeeking?: string
  solutionsOffering?: string
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
  },
]

const CANONICAL_BY_EMAIL = new Map(CANONICAL_TEST_ACCOUNTS.map((a) => [a.email, a]))

/** True if `email` is one of the canonical demo/test accounts. */
export function isCanonicalTestEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return CANONICAL_BY_EMAIL.has(email.trim().toLowerCase())
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

    const existing = await prisma.user.findUnique({
      where: { email: def.email },
      select: { id: true, password: true, role: true, sponsorId: true },
    })

    // Already healthy? No write needed.
    if (
      existing &&
      existing.password &&
      existing.role === def.role &&
      (existing.sponsorId ?? null) === (def.sponsorId ?? null) &&
      (await verifyPassword(def.password, existing.password))
    ) {
      return false
    }

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
    return true
  } catch (e: any) {
    // Never let a heal failure block the login flow; the normal credential
    // check below will simply fail if the row is still bad.
    console.error('[test-accounts] ensureCanonicalTestAccount failed:', e?.message)
    return false
  }
}
