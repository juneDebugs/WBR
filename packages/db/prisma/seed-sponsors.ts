// The conference's exhibiting companies — the single definition the seed writes
// and the Phase 9 checks read.
//
// ── Why this is a module of its own ──────────────────────────────────────────
//
// packages/db/prisma/seed.ts calls main() at module scope, so importing that
// file to find out what the seed writes would run the whole seed. Keeping the
// definitions here means scripts/test-booth-card-data.mjs compares the database
// against THE VALUES THE SEED ACTUALLY USES, rather than against a second copy
// of them that can drift.
//
// ── Why every field below is filled in, including ones nothing displayed before
//
// Recorded as finding F-10 on 2026-08-02. The previous version of the seed
// upserted each company with `update: { name, tier, logoUrl }`, so tagline,
// website and booth number were written only when a row was first created and
// never corrected afterwards; and `solutionsOffering` was never written to an
// exhibiting company at all. The working database and the seed had drifted into
// two different sets of booth numbers — ten in `P-01` form against eight in
// `P1` form — and the booth card built in Phase 9 shows exactly the fields that
// had drifted.
//
// That is not only a content difference. scripts/build-floor-plan-maps.mjs and
// scripts/seed-floor-plan.mjs both read the booth roster from the database and
// share layoutBooths() from scripts/floor-plan-demo-venue.mjs, which spreads
// companies down the hall in rows of at most three grouped by the first
// character of the booth number. Ten companies give four rows; the old seed's
// eight gave three. apps/attendee/public/maps/exhibit-hall.png is committed and
// was drawn from the four-row layout, so a database rebuilt from the old seed
// put every marker off every drawn stand.
//
// ── The rule used to produce these values ────────────────────────────────────
//
// Generated from the working database on 2026-08-02, which is the content the
// demonstration shows. Where the database held nothing for a field and the
// previous seed had a usable value, the previous seed's value was kept rather
// than blanked — that applies to the taglines and descriptions of companies
// that do not exhibit.
//
// 10 of these 20 companies carry a booth number and therefore appear on the
// exhibit-hall map with a card. Those are listed first.

export type SponsorDef = {
  id: string
  name: string
  tier: string
  website: string | null
  tagline: string | null
  description: string | null
  logoUrl: string | null
  /** Null for a company that does not exhibit. A value here puts it on the map. */
  boothNumber: string | null
  /** JSON-encoded array of strings, or null. The card renders one chip each. */
  solutionsOffering: string | null
}

export const SPONSOR_DEFS: SponsorDef[] = [
  {
    id: 'cmngb2h4h000hvm28vn41ytgc',
    name: 'AfterShip',
    tier: 'BRONZE',
    website: 'https://aftership.com',
    tagline: 'Shipment tracking trusted by 17,000+ retailers',
    description: 'Shipment tracking and returns platform trusted by 17,000+ retailers.',
    logoUrl: '/sponsors/aftership.png',
    boothNumber: 'B-01',
    solutionsOffering: JSON.stringify(["Shipping & Fulfillment","Returns Management","Analytics & Reporting","AI & Automation","Marketplace Integration"]),
  },
  {
    id: 'cmngb2h4h0004vm28nn3rme1o',
    name: 'Klaviyo',
    tier: 'GOLD',
    website: 'https://klaviyo.com',
    tagline: 'Email and SMS that drives real revenue for ecommerce',
    description: 'Email and SMS marketing automation platform for ecommerce.',
    logoUrl: '/sponsors/klaviyo.png',
    boothNumber: 'G-01',
    solutionsOffering: JSON.stringify(["Email Marketing","SMS Marketing","Analytics & Reporting","Personalization","Loyalty & Rewards","AI & Automation"]),
  },
  {
    id: 'cmngb2h4h0003vm281j76qc4e',
    name: 'Loop Returns',
    tier: 'GOLD',
    website: 'https://loopreturns.com',
    tagline: 'The smartest returns platform for Shopify brands',
    description: 'Returns management platform built for Shopify brands.',
    logoUrl: '/sponsors/loop-returns.png',
    boothNumber: 'G-02',
    solutionsOffering: JSON.stringify(["Returns Management","AI & Automation","Analytics & Reporting","Customer Support","Shipping & Fulfillment"]),
  },
  {
    id: 'cmngb2h4h0002vm28jsro8se9',
    name: 'ShipStation',
    tier: 'GOLD',
    website: 'https://shipstation.com',
    tagline: 'Ship smarter with multi-channel order management',
    description: 'Multi-channel shipping software to streamline order fulfillment.',
    logoUrl: '/sponsors/shipstation.png',
    boothNumber: 'G-03',
    solutionsOffering: JSON.stringify(["Shipping & Fulfillment","Marketplace Integration","Analytics & Reporting","Inventory Management","Returns Management","AI & Automation"]),
  },
  {
    id: 'cmngb2h4h0000vm28ssjt1m0z',
    name: 'Shopify',
    tier: 'PLATINUM',
    website: 'https://shopify.com',
    tagline: 'The commerce platform powering 2M+ merchants worldwide',
    description: 'The leading commerce platform powering millions of businesses worldwide.',
    logoUrl: '/sponsors/shopify.png',
    boothNumber: 'P-01',
    solutionsOffering: JSON.stringify(["Headless Commerce","B2B Commerce","Subscription Management","AI & Automation","Payment Processing","Marketplace Integration","Analytics & Reporting"]),
  },
  {
    id: 'cmngb2h4h0001vm2889slafvy',
    name: 'BigCommerce',
    tier: 'PLATINUM',
    website: 'https://bigcommerce.com',
    tagline: 'Open SaaS for mid-market and enterprise ecommerce',
    description: 'Open SaaS ecommerce platform for fast-growing and enterprise brands.',
    logoUrl: '/sponsors/bigcommerce.png',
    boothNumber: 'P-02',
    solutionsOffering: JSON.stringify(["Headless Commerce","B2B Commerce","Subscription Management","Marketplace Integration","Payment Processing","Search & Discovery","AI & Automation"]),
  },
  {
    id: 'cmngb2h4h0007vm28mbcpxjg5',
    name: 'Tailor ERP',
    tier: 'PLATINUM',
    website: 'https://tailor.tech',
    tagline: 'Composable ERP for modern commerce operations',
    description: 'Composable ERP platform built for modern commerce operations.',
    logoUrl: '/sponsors/tailor-erp.png',
    boothNumber: 'P-03',
    solutionsOffering: JSON.stringify(["ERP / Operations","B2B Commerce","Headless Commerce","Inventory Management","Analytics & Reporting","AI & Automation"]),
  },
  {
    id: 'cmngb2h4h0008vm28i6338gp9',
    name: 'Yotpo',
    tier: 'SILVER',
    website: 'https://yotpo.com',
    tagline: 'The retention platform for high-growth DTC brands',
    description: 'eCommerce retention marketing platform — reviews, loyalty, and SMS.',
    logoUrl: '/sponsors/yotpo.png',
    boothNumber: 'S-01',
    solutionsOffering: JSON.stringify(["Loyalty & Rewards","Reviews & UGC","SMS Marketing","Personalization","Analytics & Reporting","AI & Automation"]),
  },
  {
    id: 'cmngb2h4h000avm28j2vs0j0k',
    name: 'Postscript',
    tier: 'SILVER',
    website: 'https://postscript.io',
    tagline: 'SMS marketing that feels personal at scale',
    description: 'SMS marketing platform designed exclusively for Shopify stores.',
    logoUrl: '/sponsors/postscript.png',
    boothNumber: 'S-02',
    solutionsOffering: JSON.stringify(["SMS Marketing","Analytics & Reporting","Personalization","Loyalty & Rewards","AI & Automation"]),
  },
  {
    id: 'cmngbix6w0001fwpj6dwlwyri',
    name: 'Google Cloud',
    tier: 'SILVER',
    website: 'https://cloud.google.com',
    tagline: 'Cloud AI and data infrastructure for commerce',
    description: 'Cloud computing, data analytics, and AI infrastructure for modern commerce.',
    logoUrl: '/sponsors/google-cloud.png',
    boothNumber: 'S-03',
    solutionsOffering: JSON.stringify(["AI & Automation","Analytics & Reporting","Headless Commerce","Personalization","Search & Discovery","ERP / Operations"]),
  },
  {
    id: 'cmngb2h4h0009vm28no2j8b6p',
    name: 'Attentive',
    tier: 'SILVER',
    website: 'https://attentivemobile.com',
    tagline: 'AI-powered SMS and email at commerce scale',
    description: 'SMS and email marketing platform for personalized commerce.',
    logoUrl: '/sponsors/attentive.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["SMS Marketing","Email Marketing","Personalization","Analytics & Reporting","AI & Automation","Loyalty & Rewards"]),
  },
  {
    id: 'cmngb2h4h000dvm289vmdaki3',
    name: 'Extensiv',
    tier: 'SILVER',
    website: 'https://extensiv.com',
    tagline: 'Omnichannel fulfillment platform',
    description: 'Order and warehouse management software for 3PL and brands.',
    logoUrl: '/sponsors/extensiv.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["ERP / Operations","Shipping & Fulfillment","Inventory Management","Analytics & Reporting","Marketplace Integration"]),
  },
  {
    id: 'cmngb2h4h0005vm28mg7g52fh',
    name: 'Gorgias',
    tier: 'GOLD',
    website: 'https://gorgias.com',
    tagline: 'Customer support built for ecommerce growth',
    description: 'Customer support helpdesk built for ecommerce brands.',
    logoUrl: '/sponsors/gorgias.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["Customer Support","AI & Automation","Analytics & Reporting","Personalization","Reviews & UGC"]),
  },
  {
    id: 'cmngb2h4h000cvm28dh6mc5bh',
    name: 'Narvar',
    tier: 'SILVER',
    website: 'https://narvar.com',
    tagline: 'Post-purchase experiences that build loyalty',
    description: 'Post-purchase experience platform — tracking, returns, and notifications.',
    logoUrl: '/sponsors/narvar.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["Shipping & Fulfillment","Returns Management","Analytics & Reporting","AI & Automation","Customer Support"]),
  },
  {
    id: 'cmngb2h4h000evm286epvlnxs',
    name: 'Okendo',
    tier: 'BRONZE',
    website: 'https://okendo.io',
    tagline: 'Customer review platform',
    description: 'Customer reviews, quizzes, and loyalty for Shopify brands.',
    logoUrl: '/sponsors/okendo.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["Reviews & UGC","Loyalty & Rewards","Personalization","Analytics & Reporting","AI & Automation"]),
  },
  {
    id: 'cmngb2h4h000fvm28fzk7rs4l',
    name: 'Ordergroove',
    tier: 'BRONZE',
    website: 'https://ordergroove.com',
    tagline: 'Relationship commerce',
    description: 'Subscription commerce solutions for enterprise retailers.',
    logoUrl: '/sponsors/ordergroove.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["Subscription Management","Loyalty & Rewards","Personalization","AI & Automation","Analytics & Reporting","Reviews & UGC"]),
  },
  {
    id: 'cmngb2h4h000jvm28zwqqu86h',
    name: 'Rebuy Engine',
    tier: 'BRONZE',
    website: 'https://rebuyengine.com',
    tagline: 'Personalization for Shopify',
    description: 'Personalized product recommendations and upsells for Shopify.',
    logoUrl: '/sponsors/rebuy-engine.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["Personalization","Search & Discovery","AI & Automation","Analytics & Reporting","Marketplace Integration","Headless Commerce"]),
  },
  {
    id: 'cmngb2h4h0006vm28enbuld34',
    name: 'Recharge',
    tier: 'GOLD',
    website: 'https://rechargepayments.com',
    tagline: 'Power subscriptions that subscribers love',
    description: 'Subscription and recurring billing platform for Shopify merchants.',
    logoUrl: '/sponsors/recharge.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["Subscription Management","Payment Processing","Loyalty & Rewards","Analytics & Reporting","AI & Automation"]),
  },
  {
    id: 'cmngb2h4h000ivm281ido85fq',
    name: 'Searchspring',
    tier: 'BRONZE',
    website: 'https://searchspring.com',
    tagline: 'Site search & merchandising',
    description: 'Search, merchandising, and personalization for ecommerce sites.',
    logoUrl: '/sponsors/searchspring.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["Search & Discovery","Personalization","AI & Automation","Analytics & Reporting","Marketplace Integration"]),
  },
  {
    id: 'cmngb2h4h000gvm28202yjuux',
    name: 'Skio',
    tier: 'BRONZE',
    website: 'https://skio.com',
    tagline: 'Subscriptions for Shopify',
    description: 'Modern subscription platform with group buying and referrals.',
    logoUrl: '/sponsors/skio.png',
    boothNumber: null,
    solutionsOffering: JSON.stringify(["Subscription Management","Loyalty & Rewards","Analytics & Reporting","Payment Processing","AI & Automation"]),
  },
]

/**
 * Everything the seed writes when it CREATES an exhibiting company.
 *
 * This is the set that makes a database built from nothing reproduce the same
 * ten booth cards and the same hall layout. Finding F-10 exists because these
 * definitions and the working database had drifted into two different rosters.
 *
 * scripts/test-booth-card-data.mjs asserts the returned key set, so dropping a
 * field here fails a check rather than passing quietly.
 */
export function sponsorCreateFields(s: SponsorDef) {
  return {
    name: s.name,
    tier: s.tier,
    website: s.website,
    tagline: s.tagline,
    description: s.description,
    logoUrl: s.logoUrl,
    boothNumber: s.boothNumber,
    solutionsOffering: s.solutionsOffering,
  }
}

/**
 * The much smaller set the seed writes when the company row ALREADY EXISTS.
 *
 * ── Why this is deliberately narrower than the create set ────────────────────
 *
 * Revised 2026-08-02, during Phase 9's adversarial review, which is recorded as
 * a correction to finding F-10.
 *
 * F-10's first fix widened this branch to the full set, reasoning that a field
 * absent here is a field that never corrects on a populated database. That is
 * true, and it is also how you destroy an organizer's work.
 *
 * The seed is not reliably pointed at a throwaway database. createPrismaClient()
 * in ./seed.ts checks TURSO_DATABASE_URL and TURSO_AUTH_TOKEN BEFORE it looks at
 * DATABASE_URL, so `pnpm db:seed` connects to the shared production database
 * whenever those variables are present in the environment — even though the npm
 * script hard-codes a local file path. With the full set on this branch, one
 * such run silently replaces every tagline, description, website and booth
 * number an organizer has edited in the admin app with the generated copy.
 *
 * The narrow set below cannot do that. Reproducibility is not lost, because it
 * comes from the CREATE branch: a database built from nothing still gets
 * everything. What is given up is silent self-correction of a populated
 * database, and that is replaced by two better things:
 *
 *   1. scripts/test-booth-card-data.mjs compares these definitions against the
 *      database field by field and FAILS when they disagree. Drift is now
 *      detected rather than quietly papered over.
 *   2. scripts/migrate-sponsor-card-fields.mjs corrects a populated database
 *      deliberately. It reports by default and requires --apply to write.
 *
 * Detect, then correct on purpose. Do not overwrite as a side effect of seeding.
 */
export function sponsorUpdateFields(s: SponsorDef) {
  return {
    name: s.name,
    tier: s.tier,
    logoUrl: s.logoUrl,
  }
}
