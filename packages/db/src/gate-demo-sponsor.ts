// ─── The sponsor-side gate demonstration company ─────────────────────────────
//
// A `gate demonstration account` (CONTEXT.md) exists so the onboarding gate can
// be shown on cue instead of being met unannounced on somebody else's sign-in.
// There are two, because the two kinds of participant are measured on different
// subjects: a delegate on their own profile, a sponsor representative on their
// exhibiting COMPANY. The delegate one is an account definition in
// ./test-accounts.ts. This is the company half of the sponsor one.
//
// ── Why this is a module of its own, importing nothing ───────────────────────
//
// Three files need these values and none of them may pull in the others:
//
//   - ./test-accounts.ts, which pins the company back to its incomplete state
//     on the sign-in path;
//   - ../prisma/seed.ts, which creates the company on a reseed;
//   - ../scripts/reset-test-accounts.mjs, which recreates it by hand.
//
// The seed builds its OWN Prisma client (createPrismaClient() there reads the
// Turso variables before DATABASE_URL), so importing ./test-accounts.ts from it
// would drag in ./client.ts and construct a second, differently-configured
// client at import time. A module with no imports at all cannot do that to
// anybody.
//
// ── Why it is not in ../prisma/seed-sponsors.ts with the other companies ─────
//
// That file's own header states what it is: the twenty exhibiting companies,
// "generated from the working database on 2026-08-02, which is the content the
// demonstration shows". This is a test prop rather than that content. Keeping
// it out means scripts/test-booth-card-data.mjs and
// scripts/migrate-sponsor-card-fields.mjs, which both read SPONSOR_DEFS as the
// roster of real exhibitors, need no change and cannot start comparing a prop
// against the database as though it were an exhibitor.

/** The company row the sponsor gate demonstration depends on. */
export const GATE_DEMO_SPONSOR_ID = 'sponsor-gate-demo'

/**
 * THE POINT OF THIS COMPANY: it satisfies five of the six items the sponsor
 * onboarding gate blocks on and is short the sixth, so the gate always refuses
 * its representative and routes them to the checklist.
 *
 * The six live in ./onboarding-policy.ts as SPONSOR_REQUIRED_ITEMS: logo,
 * tagline, description, contact, solutions offered, website. Five are filled
 * below. `contactName` and `contactEmail` are absent, and that pair is the
 * `contact` item.
 *
 * ── Why CONTACT specifically, and not one of the other five ──────────────────
 *
 * Recorded as UF-11 and UF-12. The organizer's reminder route
 * (apps/web/app/api/sponsors/remind/route.ts) does send real mail over SMTP,
 * and it addresses `sponsor.contactEmail`. A company holding no contact holds
 * no address, so that route has no recipient and this demonstration data cannot
 * reach anybody outside the system. That is closed BY CONSTRUCTION rather than
 * by relying on no mail account being connected — which is a second and
 * independent reason, and the one that still holds after somebody connects one.
 *
 * Traced through both cases rather than assumed (UF-62): with no mail account
 * the route logs `EmailLog` with status FAILED and recipient 'unknown' and then
 * answers 200 with `ok: true`; with one connected the send throws, the same
 * FAILED row is written, and it answers 500. No mail leaves under either.
 *
 * ── Why NO booth number ──────────────────────────────────────────────────────
 *
 * Recorded as UF-60. scripts/build-floor-plan-maps.mjs and
 * scripts/seed-floor-plan.mjs read the booth roster from the database and share
 * layoutBooths() from scripts/floor-plan-demo-venue.mjs, which spreads
 * companies down the hall in rows of at most three. The committed picture
 * apps/attendee/public/maps/exhibit-hall.png was drawn from the four-row layout
 * that exactly ten booth-carrying companies produce. An eleventh changes the
 * layout and puts every marker off every drawn stand — which ../prisma/
 * seed-sponsors.ts records as having already happened once, when eight
 * companies gave three rows.
 *
 * Costs this demonstration nothing: `booth` is one of the three items the gate
 * does NOT block on, because the number is the organizer's to assign and the
 * gate never blocks a sponsor on a value the sponsor cannot supply.
 */
export const GATE_DEMO_SPONSOR = {
  id: GATE_DEMO_SPONSOR_ID,
  name: 'Gate Demo Exhibitor',
  tier: 'BRONZE',
  // Named to read as a test prop rather than as a plausible company, because
  // this name is visible to delegates in exhibitor lists during the
  // demonstration. Matches the delegate demonstration account's 'Gate Demo Co'.
  tagline: 'A test exhibitor used to demonstrate the onboarding gate',
  // The description item is the only CONTENT rule in the six rather than a
  // presence rule: it requires more than 20 characters after trimming.
  description:
    'A test exhibitor that exists so the sponsor onboarding gate can be shown on cue. Not a real company, and not attending anything.',
  logoUrl: '/sponsors/gate-demo.png',
  website: 'https://example.com',
  // example.com is reserved by RFC 2606 for exactly this and can never be
  // registered by anybody, so a delegate who taps through from an exhibitor
  // list during the demonstration cannot reach a stranger's website.
  solutionsOffering: JSON.stringify(['Analytics & Reporting']),
  boothNumber: null,
  contactName: null,
  contactEmail: null,
} as const

/**
 * The company columns pinned to their incomplete values, restored on the
 * sign-in path by ensureCanonicalTestAccount() in ./test-accounts.ts.
 *
 * This is the whole of what the restore writes. It is deliberately NOT the
 * whole definition above: a restore that rewrote every column would put a
 * tagline, description, logo, website and offerings back on every sign-in for
 * as long as they disagreed with this file, which is the trap UF-40 and UF-47
 * record in the delegate half — a comparison wider than the write, or a write
 * wider than it needs to be, produces an account that is unhealthy forever and
 * writes on every single sign-in.
 *
 * `null` rather than an empty string, deliberately. The gate's `contact` check
 * is isScalarFilled() on both columns, which treats a blank string and null
 * alike, but the reminder route reads `sponsor.contactEmail` straight into a
 * mail recipient — and null is the value that unambiguously means "no address"
 * to every reader, including a person looking at the row in a database browser.
 */
export const GATE_DEMO_SPONSOR_PINNED = {
  contactName: null,
  contactEmail: null,
} as const

/** The columns GATE_DEMO_SPONSOR_PINNED holds, as a list for a `select`. */
export const GATE_DEMO_SPONSOR_PINNED_COLUMNS = Object.keys(
  GATE_DEMO_SPONSOR_PINNED,
) as (keyof typeof GATE_DEMO_SPONSOR_PINNED)[]
