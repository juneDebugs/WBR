// ─── Browse taxonomy + guaranteed-minimum filter engine ──────────────────────
//
// Single source of truth for solution/industry/size/revenue matching across
// the meetings and sponsor Browse surfaces. The codebase historically carried
// three competing solution vocabularies:
//
//   A. Canonical 18  — stored in User.solutionsOffering + Sponsor.solutions*
//   B. Sponsor ProfileEditor 18 — differently-worded, stored by sponsor saves
//   C. RetailX long-form ~83 — sponsor Browse chips + most User.solutionsSeeking
//
// Exact-string comparison across these returns zero matches. This module maps
// every label from A/B/C (plus unknown variants, via keyword heuristics) onto
// the canonical 18, and provides `filterWithGuarantee`, which returns strict
// matches first and then backfills relevance-ranked "similar" results so any
// combination of chip filters yields at least `minResults` rows.
//
// This file is intentionally dependency-free and import-free so it can be
// consumed three ways: by Next.js apps via `@conference/db/src/browse-taxonomy`
// (transpilePackages), by Node test scripts via a relative path, and without
// pulling the Prisma client into client-component bundles.

// ─── Canonical solutions (Taxonomy A) ────────────────────────────────────────

export const CANONICAL_SOLUTIONS = [
  'Email Marketing',
  'SMS Marketing',
  'Loyalty & Rewards',
  'Subscription Management',
  'Returns Management',
  'Customer Support',
  'Shipping & Fulfillment',
  'Inventory Management',
  'Analytics & Reporting',
  'Payment Processing',
  'Search & Discovery',
  'ERP / Operations',
  'Personalization',
  'Reviews & UGC',
  'Marketplace Integration',
  'B2B Commerce',
  'Headless Commerce',
  'AI & Automation',
] as const

export type CanonicalSolution = (typeof CANONICAL_SOLUTIONS)[number]

// Five presentation groups over the canonical 18 (mirrors SOLUTION_CATEGORY_GROUPS
// in the app libs). Used for partial-credit scoring when two labels don't share
// a canonical solution but live in the same neighborhood.
const CANONICAL_GROUPS: Record<string, CanonicalSolution[]> = {
  'Marketing': ['Email Marketing', 'SMS Marketing', 'Reviews & UGC', 'Personalization'],
  'Commerce & Payments': ['Payment Processing', 'Subscription Management', 'B2B Commerce', 'Headless Commerce', 'Marketplace Integration'],
  'Operations': ['Shipping & Fulfillment', 'Inventory Management', 'Returns Management', 'ERP / Operations'],
  'Data & AI': ['Analytics & Reporting', 'AI & Automation', 'Search & Discovery'],
  'Customer': ['Customer Support', 'Loyalty & Rewards'],
}

const GROUP_OF_CANONICAL: Record<string, string> = {}
for (const [group, items] of Object.entries(CANONICAL_GROUPS)) {
  for (const item of items) GROUP_OF_CANONICAL[item] = group
}

// ─── Label normalization ─────────────────────────────────────────────────────

// Generic trailing nouns that carry no meaning for matching:
// "Email Marketing Solutions" ≡ "Email Marketing".
const GENERIC_SUFFIXES = new Set([
  'solutions', 'solution', 'platforms', 'platform', 'systems', 'system',
  'services', 'service', 'tools', 'tool', 'software', 'providers', 'provider',
])

/** Normalize a label to a comparison slug: lowercase, parentheticals stripped,
 *  punctuation collapsed, generic trailing nouns removed. */
export function slugifyLabel(label: string): string {
  let s = label.toLowerCase()
  s = s.replace(/\(.*?\)/g, ' ')          // drop "(inc. Rebates)", "(CRM)", …
  s = s.replace(/&/g, ' and ')
  s = s.replace(/[^a-z0-9]+/g, ' ').trim()
  const words = s.split(' ').filter(Boolean)
  while (words.length > 1 && GENERIC_SUFFIXES.has(words[words.length - 1])) {
    words.pop()
  }
  return words.join(' ')
}

// ─── Cross-taxonomy synonym map ──────────────────────────────────────────────
// Keys are original labels (any taxonomy); values are the canonical solutions
// they map to. Keyed internally by slug so casing/suffix variants also hit.

const RAW_SOLUTION_SYNONYMS: Record<string, CanonicalSolution[]> = {
  // ── Taxonomy B (sponsor ProfileEditor) ──
  'Analytics & Data': ['Analytics & Reporting'],
  'Loyalty & Retention': ['Loyalty & Rewards'],
  'Payments & Checkout': ['Payment Processing'],
  'Logistics & Fulfillment': ['Shipping & Fulfillment'],
  'Personalization & AI': ['Personalization', 'AI & Automation'],
  'ERP & Operations': ['ERP / Operations'],
  'Returns & Exchanges': ['Returns Management'],
  'SEO & Content': ['Search & Discovery'],
  'Social Commerce': ['Marketplace Integration'],
  'Influencer Marketing': ['Reviews & UGC'],
  'Tax & Compliance': ['ERP / Operations'],

  // ── Taxonomy C (RetailX long-form chips / User.solutionsSeeking data) ──
  // Labels with no honest canonical equivalent are deliberately absent: they
  // still match identical stored labels by slug, and fall back to group-level
  // partial credit (0.5) via GROUP_KEYWORD_RULES instead of polluting strict
  // matches with a wrong canonical.
  // Marketing
  'Consumer Sentiment & Reviews': ['Reviews & UGC'],
  'Email Marketing Solutions': ['Email Marketing'],
  'Influencer Marketing Solutions': ['Reviews & UGC'],
  'Location Based Marketing Solutions': ['SMS Marketing'],
  'Loyalty & Rewards (inc. Rebates) Solutions': ['Loyalty & Rewards'],
  'Marketing Analytics': ['Analytics & Reporting'],
  'Marketing Automation Platforms': ['AI & Automation', 'Email Marketing'],
  'Marketing Personalization Solutions': ['Personalization'],
  'Mobile, App & SMS Marketing Solutions': ['SMS Marketing'],
  'Multichannel Marketing Platforms': ['Email Marketing', 'SMS Marketing'],
  'Retargeting Solutions': ['Personalization'],
  'Search Engine Optimization & Marketing (SEO & SEM)': ['Search & Discovery'],
  // Data, Analytics & AI
  'Artificial Intelligence (inc. Machine Learning)': ['AI & Automation'],
  'Business Intelligence Tools': ['Analytics & Reporting'],
  'Data Visualization Tools': ['Analytics & Reporting'],
  'In-Store Analytics': ['Analytics & Reporting'],
  'Predictive Analytics': ['Analytics & Reporting', 'AI & Automation'],
  'Product Data Management Solutions': ['Inventory Management'],
  'Web & App Analytics': ['Analytics & Reporting'],
  // Commerce platforms
  'B2B Ecommerce Platforms': ['B2B Commerce'],
  'Cross-Border Ecommerce Platforms': ['B2B Commerce', 'Marketplace Integration'],
  'Ecommerce Platforms': ['Headless Commerce', 'B2B Commerce'],
  'Marketplace Platforms': ['Marketplace Integration'],
  'Mobile & App Commerce Platforms': ['Headless Commerce'],
  'Social Commerce Platforms': ['Marketplace Integration'],
  // Web & mobile
  'Product Information Management (PIM) Solutions': ['Inventory Management'],
  'Site Personalization Solutions': ['Personalization'],
  'Site Search Solutions': ['Search & Discovery'],
  // In-store
  'Associate Mobility Solutions': ['ERP / Operations'],
  'Automated Retail Solutions': ['AI & Automation'],
  'POS Hardware & Peripherals': ['Payment Processing'],
  // Payments, banking & embedded
  'BNPL, Customer Installment Lending & Financing Solutions': ['Payment Processing'],
  'Fraud Detection & Risk Management Solutions': ['Payment Processing'],
  'Merchant Services Solutions': ['Payment Processing'],
  'Mobile POS Solutions': ['Payment Processing'],
  'Mobile Wallets & Payments Solutions': ['Payment Processing'],
  'POS Solutions': ['Payment Processing'],
  'Subscription Management & Recurring Payment Solutions': ['Subscription Management', 'Payment Processing'],
  // CRM & customer service
  'Clienteling Solutions': ['Personalization', 'Customer Support'],
  'Customer Data Platforms': ['Analytics & Reporting', 'Personalization'],
  'Customer Feedback Solutions': ['Reviews & UGC'],
  'Customer Relationship Management (CRM) Solutions': ['Customer Support'],
  'Live Chat, Chatbots & Virtual Assistants Solutions': ['Customer Support', 'AI & Automation'],
  'Loyalty Management Solutions': ['Loyalty & Rewards'],
  // Infrastructure & IT
  'Data Architecture & Infrastructure Solutions': ['Analytics & Reporting'],
  'Data Management Platforms': ['Analytics & Reporting'],
  // Supply chain, merchandising, pricing & planning
  'Category Management Solutions': ['Inventory Management'],
  'Competitive Pricing Insights & Solutions': ['Analytics & Reporting'],
  'Delivery (inc. Last Mile) & Pickup Solutions': ['Shipping & Fulfillment'],
  'Forecasting & Replenishment Solutions': ['Inventory Management'],
  'Fulfillment Solutions': ['Shipping & Fulfillment'],
  'Inventory Management Systems': ['Inventory Management'],
  'Inventory Planning & Optimization Tools': ['Inventory Management'],
  'Merchandising Analytics': ['Analytics & Reporting'],
  'Merchandising Assortment Planning & Management': ['Inventory Management'],
  'Order Management Systems': ['ERP / Operations'],
  'Price Optimization Solutions': ['Analytics & Reporting'],
  'Product Lifecycle Management (PLM) Solutions': ['ERP / Operations'],
  'Returns Solutions': ['Returns Management'],
  'Sourcing Solutions & Services': ['Inventory Management'],
  'Supply Chain Management Software': ['Shipping & Fulfillment', 'ERP / Operations'],
  'Sustainability Solutions': ['Shipping & Fulfillment'],
  'Third Party Logistics (3PL) Services': ['Shipping & Fulfillment'],
  'Warehouse & Distribution Center Management': ['Shipping & Fulfillment', 'Inventory Management'],
  // Professional services
  'Market Research & Analysis Services': ['Analytics & Reporting'],
  // Back office & HR
  'Back Office & Financial Solutions': ['ERP / Operations'],
  'HR & Payroll Solutions': ['ERP / Operations'],
}

const SOLUTION_SYNONYMS = new Map<string, CanonicalSolution[]>()
for (const [label, canonicals] of Object.entries(RAW_SOLUTION_SYNONYMS)) {
  SOLUTION_SYNONYMS.set(slugifyLabel(label), canonicals)
}
const CANONICAL_BY_SLUG = new Map<string, CanonicalSolution>()
for (const c of CANONICAL_SOLUTIONS) CANONICAL_BY_SLUG.set(slugifyLabel(c), c)

// ─── Keyword heuristics (fallback for labels not in the synonym map) ─────────

const KEYWORD_RULES: Array<[RegExp, CanonicalSolution]> = [
  [/\bemail\b/, 'Email Marketing'],
  [/\bsms\b|text message/, 'SMS Marketing'],
  [/loyalty|rewards|retention|rebate/, 'Loyalty & Rewards'],
  [/subscription|recurring/, 'Subscription Management'],
  [/\breturns?\b|exchange/, 'Returns Management'],
  [/customer (support|service|care)|\bcrm\b|help ?desk|live chat|chatbot/, 'Customer Support'],
  [/shipping|fulfil?lment|logistics|delivery|last mile|3pl|freight|warehouse|supply chain/, 'Shipping & Fulfillment'],
  [/inventory|replenish|forecast|assortment|\bpim\b|product (data|information)|sourcing/, 'Inventory Management'],
  [/analytics|reporting|business intelligence|insight|data (visuali[sz]ation|management|platform)|measurement|research/, 'Analytics & Reporting'],
  [/payment|checkout|\bpos\b|point of sale|bnpl|wallet|merchant|fraud|billing|financing/, 'Payment Processing'],
  [/\bsearch\b|discovery|\bseo\b|\bsem\b/, 'Search & Discovery'],
  [/\berp\b|back office|order management|operations|\bplm\b|payroll|compliance/, 'ERP / Operations'],
  [/personali[sz]ation|clienteling|recommendation/, 'Personalization'],
  [/review|\bugc\b|user generated|sentiment|feedback|influencer/, 'Reviews & UGC'],
  [/marketplace|social commerce/, 'Marketplace Integration'],
  [/\bb2b\b|wholesale/, 'B2B Commerce'],
  [/headless|composable|storefront api/, 'Headless Commerce'],
  [/\bai\b|artificial intelligence|machine learning|automation|predictive/, 'AI & Automation'],
]

// Group-level keyword fallback, for partial credit on labels that map to no
// canonical solution at all.
const GROUP_KEYWORD_RULES: Array<[RegExp, string]> = [
  [/marketing|advertis|brand|media|creative|content|social|video|campaign/, 'Marketing'],
  [/commerce|platform|store|retail|payment|checkout|pos/, 'Commerce & Payments'],
  [/supply|logistic|inventory|warehouse|operation|fulfil|shipping|merchandis/, 'Operations'],
  [/data|analytic|intelligence|\bai\b|machine|insight|research/, 'Data & AI'],
  [/customer|loyalty|service|support|experience|crm/, 'Customer'],
]

// ─── Canonicalization (cached) ───────────────────────────────────────────────

const canonicalCache = new Map<string, ReadonlySet<string>>()
const groupCache = new Map<string, ReadonlySet<string>>()

/** Map any solution label (taxonomy A, B, C, or unknown) to its canonical
 *  solution set. Unknown labels fall back to keyword heuristics. */
export function canonicalizeSolution(label: string): ReadonlySet<string> {
  const cached = canonicalCache.get(label)
  if (cached) return cached
  const slug = slugifyLabel(label)
  const out = new Set<string>()
  const direct = CANONICAL_BY_SLUG.get(slug)
  if (direct) out.add(direct)
  const mapped = SOLUTION_SYNONYMS.get(slug)
  if (mapped) for (const c of mapped) out.add(c)
  if (out.size === 0) {
    for (const [re, canonical] of KEYWORD_RULES) {
      if (re.test(slug)) out.add(canonical)
    }
  }
  canonicalCache.set(label, out)
  return out
}

/** Solution groups a label belongs to (via canonicals, else keyword fallback). */
export function solutionGroups(label: string): ReadonlySet<string> {
  const cached = groupCache.get(label)
  if (cached) return cached
  const out = new Set<string>()
  for (const c of canonicalizeSolution(label)) {
    const g = GROUP_OF_CANONICAL[c]
    if (g) out.add(g)
  }
  if (out.size === 0) {
    const slug = slugifyLabel(label)
    for (const [re, group] of GROUP_KEYWORD_RULES) {
      if (re.test(slug)) out.add(group)
    }
  }
  groupCache.set(label, out)
  return out
}

const pairScoreCache = new Map<string, number>()

/** Score how well a selected chip matches a stored label.
 *  1 = same concept (identical slug or shared canonical solution)
 *  0.5 = same neighborhood (shared group)
 *  0 = unrelated */
export function solutionMatchScore(selected: string, stored: string): number {
  const key = selected + '\u0000' + stored
  const cached = pairScoreCache.get(key)
  if (cached !== undefined) return cached
  let score = 0
  if (slugifyLabel(selected) === slugifyLabel(stored)) {
    score = 1
  } else {
    const a = canonicalizeSolution(selected)
    const b = canonicalizeSolution(stored)
    for (const c of a) {
      if (b.has(c)) { score = 1; break }
    }
    if (score === 0) {
      const ga = solutionGroups(selected)
      const gb = solutionGroups(stored)
      for (const g of ga) {
        if (gb.has(g)) { score = 0.5; break }
      }
    }
  }
  pairScoreCache.set(key, score)
  return score
}

// ─── Industry normalization ──────────────────────────────────────────────────

export const CANONICAL_INDUSTRIES = [
  'Fashion & Apparel',
  'Jewelry & Accessories',
  'Luxury',
  'Beauty & Cosmetics',
  'Skincare',
  'Health & Wellness',
  'Food & Beverage',
  'Home & Lifestyle',
  'Pet',
  'Kids & Baby',
  'Technology',
] as const

const RAW_INDUSTRY_SYNONYMS: Record<string, string> = {
  'Apparel & Fashion': 'Fashion & Apparel',
  'Beauty & Personal Care': 'Beauty & Cosmetics',
  'Home & Garden': 'Home & Lifestyle',
  'Electronics & Tech': 'Technology',
  'SaaS & Software': 'Technology',
  'Marketplace & Aggregator': 'Technology',
  'Pet Supplies': 'Pet',
  'Luxury & Premium': 'Luxury',
  'Sports & Outdoors': 'Health & Wellness',
  'Subscription Boxes': 'Home & Lifestyle',
  'B2B / Wholesale': 'Technology',
  'Agency & Services': 'Technology',
}

const INDUSTRY_SYNONYMS = new Map<string, string>()
for (const c of CANONICAL_INDUSTRIES) INDUSTRY_SYNONYMS.set(slugifyLabel(c), c)
for (const [label, canonical] of Object.entries(RAW_INDUSTRY_SYNONYMS)) {
  INDUSTRY_SYNONYMS.set(slugifyLabel(label), canonical)
}

export function canonicalizeIndustry(label: string): string | null {
  return INDUSTRY_SYNONYMS.get(slugifyLabel(label)) ?? null
}

function industryMatchScore(selected: string, stored: string): number {
  if (slugifyLabel(selected) === slugifyLabel(stored)) return 1
  const a = canonicalizeIndustry(selected)
  const b = canonicalizeIndustry(stored)
  if (a && b && a === b) return 1
  return 0
}

// ─── Company size + revenue normalization ────────────────────────────────────

const SIZE_ORDER = ['STARTUP', 'SMB', 'MIDMARKET', 'ENTERPRISE'] as const

function normalizeDashes(s: string): string {
  return s.replace(/[–—]/g, '-').replace(/,/g, '').replace(/\$/g, '').trim()
}

/** Map a company-size value (canonical code or ProfileEditor headcount range)
 *  to a canonical code. */
export function canonicalizeCompanySize(value: string): string | null {
  const v = normalizeDashes(value).toUpperCase()
  if ((SIZE_ORDER as readonly string[]).includes(v)) return v
  switch (v) {
    case '1-10': return 'STARTUP'
    case '11-50': return 'SMB'
    case '51-200':
    case '201-500': return 'MIDMARKET'
    case '501-1000':
    case '1000+': return 'ENTERPRISE'
    default: return null
  }
}

const REVENUE_ORDER = ['<1M', '1M-10M', '10M-50M', '50M-250M', '250M+'] as const

/** Map a revenue value (canonical code or "$1M–$10M"-style label) to canonical. */
export function canonicalizeRevenue(value: string): string | null {
  const v = normalizeDashes(value).toUpperCase()
  if ((REVENUE_ORDER as readonly string[]).includes(v)) return v
  // "UNDER 1M" / "<1M" variants
  const compact = v.replace(/\s+/g, '')
  if ((REVENUE_ORDER as readonly string[]).includes(compact)) return compact
  if (compact === 'UNDER1M') return '<1M'
  return null
}

function orderedMatchScore(order: readonly string[], canonicalize: (v: string) => string | null) {
  return (selected: string, stored: string): number => {
    const a = canonicalize(selected)
    const b = canonicalize(stored)
    if (!a || !b) return slugifyLabel(selected) === slugifyLabel(stored) ? 1 : 0
    if (a === b) return 1
    const diff = Math.abs(order.indexOf(a) - order.indexOf(b))
    return diff === 1 ? 0.5 : 0
  }
}

const sizeMatchScore = orderedMatchScore(SIZE_ORDER, canonicalizeCompanySize)
const revenueMatchScore = orderedMatchScore(REVENUE_ORDER, canonicalizeRevenue)

function exactMatchScore(selected: string, stored: string): number {
  return slugifyLabel(selected) === slugifyLabel(stored) ? 1 : 0
}

// ─── Generic guaranteed-minimum filter engine ────────────────────────────────

export type DimensionKind =
  | 'solutions'
  | 'industry'
  | 'companySize'
  | 'revenue'
  | 'exact'

export interface BrowseFilterDimension<T> {
  kind: DimensionKind
  /** Chip labels the user selected in this dimension. Empty = inactive. */
  selected: string[]
  /** Extract the item's value(s) for this dimension. */
  getValue: (item: T) => string | string[] | null | undefined
}

export interface GuaranteedResults<T> {
  /** Strict matches first (existing AND-across / OR-within semantics, with
   *  canonical matching), then relevance-ranked similar results, up to at
   *  least `minTarget` when the pool allows. */
  results: T[]
  /** Number of leading results that match every active filter. */
  strictCount: number
  /** Number of backfilled similar results (results.length - strictCount). */
  similarCount: number
  minTarget: number
  /** Size of the candidate pool the guarantee draws from. */
  poolSize: number
}

const SCORERS: Record<DimensionKind, (selected: string, stored: string) => number> = {
  solutions: solutionMatchScore,
  industry: industryMatchScore,
  companySize: sizeMatchScore,
  revenue: revenueMatchScore,
  exact: exactMatchScore,
}

function dimensionScore<T>(item: T, dim: BrowseFilterDimension<T>): number {
  const raw = dim.getValue(item)
  if (raw === null || raw === undefined) return 0
  const values = Array.isArray(raw) ? raw : [raw]
  if (values.length === 0) return 0
  const scorer = SCORERS[dim.kind]
  let best = 0
  for (const sel of dim.selected) {
    for (const val of values) {
      if (typeof val !== 'string' || val === '') continue
      const s = scorer(sel, val)
      if (s > best) {
        best = s
        if (best >= 1) return 1
      }
    }
  }
  return best
}

/** Filter `items` by the active dimensions. Strict matches (every active
 *  dimension satisfied) come first in original order; if fewer than
 *  `minResults`, the remaining items are appended ranked by how closely they
 *  match (score descending, original order as tiebreak) until `minResults`
 *  is reached or the pool is exhausted. */
export function filterWithGuarantee<T>(
  items: T[],
  dimensions: BrowseFilterDimension<T>[],
  minResults: number,
): GuaranteedResults<T> {
  const active = dimensions.filter(d => d.selected.length > 0)
  if (active.length === 0) {
    return {
      results: items.slice(),
      strictCount: items.length,
      similarCount: 0,
      minTarget: minResults,
      poolSize: items.length,
    }
  }

  const strict: T[] = []
  const rest: Array<{ item: T; score: number; index: number }> = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    let total = 0
    let allMatched = true
    for (const dim of active) {
      const s = dimensionScore(item, dim)
      total += s
      if (s < 1) allMatched = false
    }
    if (allMatched) {
      strict.push(item)
    } else {
      rest.push({ item, score: total / active.length, index: i })
    }
  }

  const results = strict.slice()
  const needed = minResults - results.length
  if (needed > 0 && rest.length > 0) {
    if (needed >= rest.length) {
      rest.sort((a, b) => (b.score - a.score) || (a.index - b.index))
      for (const r of rest) results.push(r.item)
    } else {
      // Bounded top-k selection: k is small (≤ minResults) while rest can be
      // the whole pool — avoids sorting thousands of rows per keystroke.
      const top: typeof rest = []
      for (const r of rest) {
        let lo = 0
        let hi = top.length
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          const t = top[mid]
          if (t.score > r.score || (t.score === r.score && t.index < r.index)) lo = mid + 1
          else hi = mid
        }
        if (lo < needed) {
          top.splice(lo, 0, r)
          if (top.length > needed) top.pop()
        }
      }
      for (const r of top) results.push(r.item)
    }
  }

  return {
    results,
    strictCount: strict.length,
    similarCount: results.length - strict.length,
    minTarget: minResults,
    poolSize: items.length,
  }
}

// ─── Derivation helpers (verbatim behavior of apps/{meetings,sponsor}/lib) ───
// Copied here so the portal-level filter functions below are fully
// self-contained and byte-identical between the two portals and the tests.

const FASHION_SET = new Set(['ASOS DTC','Aerie','Alex Mill','Allbirds','Boohoo DTC','Browns Fashion','Buck Mason','Chubbies','Cotopaxi','Cuyana','Danner','Depop','Eloquii','Entireworld','Everlane','Faherty Brand','Farfetch','Fossil DTC','Grailed','Helm Boots','Koio','M.Gemi','Margaux','Michael Kors DTC','Ministry of Supply','Natori','Nisolo','Noihsaf Bazaar','Outdoor Voices','Outerknown','PrettyLittleThing','Public Rec','Quince','Reformation','Rent the Runway',"Rothy's",'SSENSE','Saks Fifth Avenue DTC','Selfridges Digital','Shein DTC','Shopbop','Stitch Fix','Tecovas','Temu Brand','ThredUp','Thursday Boot','Torrid','True Classic','Universal Standard','Vuori','Warby Parker','Wolf & Badger'])
const JEWELRY_SET = new Set(['Alex and Ani','Ana Luisa','Aurate','Baublebar','Catbird','Clocks and Colours','EyeBuyDirect','Gorjana','JINS Eyewear','MVMT','Mejuri','Missoma','Monica Vinader','Olive & Piper','Pandora DTC','Studs','Vrai'])
const LUXURY_SET = new Set(['Barneys NY Online','Harrods Digital','Harvey Nichols DTC','Kate Spade DTC','Liberty London','Luisaviaroma','Mytheresa','Net-a-Porter','Neiman Marcus DTC','SSENSE','Selfridges Digital','The RealReal','Vestiaire Collective'])
const BEAUTY_SET = new Set(['Charlotte Tilbury DTC','ColourPop','Fenty Beauty DTC','Florence by Mills','Glossier','Gwyneth Paltrow Beauty','Haus Labs','Huda Beauty DTC','IL MAKIAGE','Ilia Beauty','Jones Road','Kosas','Kylie Cosmetics','Milk Makeup','Morphe','NARS DTC','Saie Beauty','Summer Fridays','Tarte Cosmetics','Too Faced DTC','Tower 28','Urban Decay','Urban Decay DTC','Victoria Beckham Beauty','Westman Atelier'])
const SKINCARE_SET = new Set(['Beautycounter','Biossance','COSRX','Care/of','CeraVe DTC','Credo Beauty','Dermalogica DTC','Dermstore','Drunk Elephant','Follain','Glow Recipe','Herbivore Botanicals','Innisfree DTC','La Roche-Posay DTC','Murad DTC','Ordinary DTC',"Paula's Choice",'Peter Thomas Roth DTC','Rescue Spa','SK-II DTC','SkinCeuticals DTC','Sulwhasoo DTC','Sunday Riley DTC','Tatcha','The Detox Market','Tula Skincare','Versed'])
const HEALTH_SET = new Set(['AG1 (Athletic Greens)','Calm','Headspace DTC','Hims & Hers','Hyperice','Mirror DTC','NordicTrack DTC','Oura','Peloton DTC','Roman Health','Therabody','Tonal','Wahoo Fitness','Whoop'])
const FOOD_SET = new Set(['Baked by Melissa DTC','Brightland','Burlap & Barrel','Compartés','Diaspora Co','Goldbelly','Jacobsen Salt',"Jeni's Ice Cream",'Levain Bakery DTC','Magic Spoon','Milk Bar DTC','Poppi','Salt & Straw DTC','Sugarfina','Vosges'])
const HOME_SET = new Set(['Albany Park','Apt2B','Arhaus DTC','Article','Bear Mattress','Boll & Branch','Brooklinen','Brooklyn Bedding','Buffy','Burrow','Cedar & Moss','Coyuchi','Design Within Reach DTC','Eight Sleep','Floyd','Hawkins NY','Helix Sleep','Interior Define','Interior Icons','Joybird','Parachute Home','Purple Innovation','Rejuvenation','Room & Board DTC','Schoolhouse','Snowe','Tuft & Needle','Visual Comfort DTC','Year & Day'])
const PET_SET = new Set(['A Pup Above','BarkBox DTC','Ollie','Open Farm','Spot & Tango','Sundays for Dogs',"The Farmer's Dog",'Wild One'])
const KIDS_SET = new Set(['4moms DTC','BIBS','Ergobaby DTC','Kyte Baby','Little Sleepies'])

const deriveCache = new Map<string, string>()

function memoDerive(prefix: string, key: string | null | undefined, compute: () => string): string {
  const cacheKey = prefix + (key ?? '')
  const cached = deriveCache.get(cacheKey)
  if (cached !== undefined) return cached
  const value = compute()
  deriveCache.set(cacheKey, value)
  return value
}

export function deriveIndustry(company: string | null | undefined): string {
  return memoDerive('i:', company, () => deriveIndustryUncached(company))
}

function deriveIndustryUncached(company: string | null | undefined): string {
  if (!company) return 'Technology'
  if (FASHION_SET.has(company)) return 'Fashion & Apparel'
  if (JEWELRY_SET.has(company)) return 'Jewelry & Accessories'
  if (LUXURY_SET.has(company)) return 'Luxury'
  if (BEAUTY_SET.has(company)) return 'Beauty & Cosmetics'
  if (SKINCARE_SET.has(company)) return 'Skincare'
  if (HEALTH_SET.has(company)) return 'Health & Wellness'
  if (FOOD_SET.has(company)) return 'Food & Beverage'
  if (HOME_SET.has(company)) return 'Home & Lifestyle'
  if (PET_SET.has(company)) return 'Pet'
  if (KIDS_SET.has(company)) return 'Kids & Baby'
  return 'Technology'
}

const INDUSTRY_TO_CATEGORY: Record<string, string | null> = {
  'Beauty & Cosmetics': 'Beauty & Wellness',
  'Skincare': 'Beauty & Wellness',
  'Health & Wellness': 'Beauty & Wellness',
  'Home & Lifestyle': 'Home',
  'Food & Beverage': 'Food & Lifestyle',
  'Pet': 'Food & Lifestyle',
  'Kids & Baby': 'Food & Lifestyle',
  'Fashion & Apparel': null,
  'Jewelry & Accessories': null,
  'Luxury': null,
  'Technology': 'Technology',
}

export function derivePeopleCategory(company: string | null | undefined): string | null {
  return INDUSTRY_TO_CATEGORY[deriveIndustry(company)] ?? null
}

export function deriveJobFunction(jobTitle: string | null | undefined): string {
  return memoDerive('j:', jobTitle, () => deriveJobFunctionUncached(jobTitle))
}

function deriveJobFunctionUncached(jobTitle: string | null | undefined): string {
  if (!jobTitle) return 'C-Suite/GM'
  const t = jobTitle.toLowerCase()
  if (t.includes('ceo') || t.includes('coo') || t.includes('cfo') || t.includes('cto') || t.includes('cmo') || t.includes('founder') || t.includes('president') || t.includes('owner') || t.includes('general manager') || t.includes('managing director')) return 'C-Suite/GM'
  if (t.includes('marketing') || t.includes('brand') || t.includes('acquisition') || t.includes('retention') || t.includes('performance') || t.includes('seo') || t.includes('content') || t.includes('creative') || t.includes('communications')) return 'Marketing'
  if (t.includes('ecommerce') || t.includes('e-commerce') || t.includes('dtc') || t.includes('commerce') || t.includes('marketplace') || t.includes('online')) return 'Ecommerce'
  if (t.includes('store') || t.includes('retail') || t.includes('wholesale') || t.includes('omnichannel')) return 'Stores/Retail'
  if (t.includes('customer') || t.includes('cx') || t.includes('experience') || t.includes('support') || t.includes('success') || t.includes('service')) return 'Customer Experience'
  if (t.includes('digital') || t.includes('growth') || t.includes('web') || t.includes('social media')) return 'Digital'
  if (t.includes('strategy') || t.includes('innovation') || t.includes('transformation') || t.includes('consulting')) return 'Strategy/Innovation'
  if (t.includes('tech') || t.includes('engineering') || t.includes('developer') || t.includes('software') || t.includes('platform') || t.includes('architect') || t.includes('data') || t.includes('it ') || t.includes('information')) return 'Information Technology'
  if (t.includes('operations') || t.includes('ops') || t.includes('fulfillment') || t.includes('warehouse') || t.includes('procurement')) return 'Operations'
  if (t.includes('supply') || t.includes('logistics') || t.includes('shipping') || t.includes('distribution')) return 'Supply Chain/Logistics'
  if (t.includes('merchandis') || t.includes('buyer') || t.includes('product') || t.includes('assortment') || t.includes('planning')) return 'Merchandising'
  if (t.includes('sales') || t.includes('partnerships') || t.includes('account') || t.includes('revenue')) return 'Stores/Retail'
  if (t.includes('finance') || t.includes('financial') || t.includes('analytics') || t.includes('accounting') || t.includes('reporting')) return 'Strategy/Innovation'
  return 'C-Suite/GM'
}

export function deriveTitleLevel(jobTitle: string | null | undefined): string {
  return memoDerive('t:', jobTitle, () => deriveTitleLevelUncached(jobTitle))
}

function deriveTitleLevelUncached(jobTitle: string | null | undefined): string {
  if (!jobTitle) return 'Manager / Lead'
  const t = jobTitle.toLowerCase()
  if (t.startsWith('ceo') || t.startsWith('coo') || t.startsWith('cfo') || t.startsWith('cto') || t.startsWith('cmo') || t.startsWith('cpo') || t === 'chief') return 'C-Suite'
  if (t.includes('founder') || t.includes('co-founder')) return 'Founder / Co-Founder'
  if (t.startsWith('svp') || t.startsWith('vp ') || t.startsWith('vp,') || t.includes('vice president')) return 'SVP / VP'
  if (t.startsWith('director') || t.endsWith('director')) return 'Director'
  if (t.startsWith('head of') || t.startsWith('head,')) return 'Head of'
  return 'Manager / Lead'
}

// ─── Shared parsing ──────────────────────────────────────────────────────────

/** Parse a JSON-string-array column defensively; accepts pre-parsed arrays. */
export function parseSolutionsArray(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string')
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

// ─── Portal-level filter functions ───────────────────────────────────────────

export const MEETINGS_MIN_RESULTS = 8
export const SPONSOR_MIN_RESULTS = 20

export interface BrowsePersonRecord {
  name?: string | null
  email?: string | null
  company?: string | null
  jobTitle?: string | null
  bio?: string | null
  role?: string | null
  companySize?: string | null
  annualRevenue?: string | null
  solutionsOffering?: string | null
  solutionsSeeking?: string | null
  /** Optional pre-parsed arrays (components pre-parse for render perf). */
  _parsedOffering?: string[]
  _parsedSeeking?: string[]
}

export interface MeetingsBrowseFilters {
  roles: string[]
  industries: string[]
  titleLevels: string[]
  jobFunctions: string[]
  companySizes: string[]
  revenues: string[]
  solutionsOffering: string[]
  solutionsSeeking: string[]
  search: string
}

const personSolutionsCache = new WeakMap<object, string[]>()

function personSolutions(p: BrowsePersonRecord): string[] {
  const cached = personSolutionsCache.get(p)
  if (cached) return cached
  const offering = p._parsedOffering ?? parseSolutionsArray(p.solutionsOffering)
  const seeking = p._parsedSeeking ?? parseSolutionsArray(p.solutionsSeeking)
  const combined = offering.length === 0 ? seeking : seeking.length === 0 ? offering : [...offering, ...seeking]
  personSolutionsCache.set(p, combined)
  return combined
}

function textMatches(haystack: Array<string | null | undefined>, q: string): boolean {
  const needle = q.toLowerCase()
  return haystack.map(h => h ?? '').join(' ').toLowerCase().includes(needle)
}

/** Meetings portal → People tab. Free-text search and the People category tab
 *  are hard scopes; chip filters are guaranteed to return at least
 *  MEETINGS_MIN_RESULTS (pool permitting). */
export function filterMeetingsPeople<T extends BrowsePersonRecord>(
  people: T[],
  filters: MeetingsBrowseFilters,
  category: string | null,
  minResults: number = MEETINGS_MIN_RESULTS,
): GuaranteedResults<T> {
  let pool = people
  if (category !== null) pool = pool.filter(p => derivePeopleCategory(p.company) === category)
  if (filters.search) pool = pool.filter(p => textMatches([p.name, p.company, p.jobTitle, p.email], filters.search))

  const dimensions: BrowseFilterDimension<T>[] = [
    { kind: 'exact', selected: filters.roles, getValue: p => p.role },
    { kind: 'industry', selected: filters.industries, getValue: p => deriveIndustry(p.company) },
    { kind: 'exact', selected: filters.titleLevels, getValue: p => deriveTitleLevel(p.jobTitle) },
    { kind: 'exact', selected: filters.jobFunctions, getValue: p => deriveJobFunction(p.jobTitle) },
    { kind: 'companySize', selected: filters.companySizes, getValue: p => p.companySize },
    { kind: 'revenue', selected: filters.revenues, getValue: p => p.annualRevenue },
    {
      kind: 'solutions',
      selected: [...filters.solutionsOffering, ...filters.solutionsSeeking],
      getValue: p => personSolutions(p),
    },
  ]
  return filterWithGuarantee(pool, dimensions, minResults)
}

export interface BrowseSponsorRecord {
  name?: string | null
  description?: string | null
  companySize?: string | null
  annualRevenue?: string | null
  solutionsOffering?: string | null
  solutionsSeeking?: string | null
  _parsedOffering?: string[]
  _parsedSeeking?: string[]
}

/** Meetings portal → Solution Providers tab (sponsor companies). */
export function filterMeetingsSponsors<T extends BrowseSponsorRecord>(
  sponsors: T[],
  filters: MeetingsBrowseFilters,
  minResults: number = MEETINGS_MIN_RESULTS,
): GuaranteedResults<T> {
  let pool = sponsors
  if (filters.search) pool = pool.filter(s => textMatches([s.name, s.description], filters.search))

  const dimensions: BrowseFilterDimension<T>[] = [
    { kind: 'industry', selected: filters.industries, getValue: s => deriveIndustry(s.name) },
    { kind: 'companySize', selected: filters.companySizes, getValue: s => s.companySize },
    { kind: 'revenue', selected: filters.revenues, getValue: s => s.annualRevenue },
    {
      kind: 'solutions',
      selected: [...filters.solutionsOffering, ...filters.solutionsSeeking],
      getValue: s => personSolutions(s),
    },
  ]
  return filterWithGuarantee(pool, dimensions, minResults)
}

export interface SponsorPortalFilters {
  roles: string[]
  jobFunctions: string[]
  industries: string[]
  sizes: string[]
  revenues: string[]
  seeking: string[]
  search: string
}

/** Sponsor portal → attendee Browse. Guarantees at least SPONSOR_MIN_RESULTS
 *  for any chip-filter combination (pool permitting); free-text search is a
 *  hard scope. */
export function filterSponsorPortalAttendees<T extends BrowsePersonRecord>(
  people: T[],
  filters: SponsorPortalFilters,
  minResults: number = SPONSOR_MIN_RESULTS,
): GuaranteedResults<T> {
  let pool = people
  if (filters.search) pool = pool.filter(p => textMatches([p.name, p.company, p.jobTitle, p.bio], filters.search))

  const dimensions: BrowseFilterDimension<T>[] = [
    { kind: 'exact', selected: filters.roles, getValue: p => p.role },
    { kind: 'exact', selected: filters.jobFunctions, getValue: p => deriveJobFunction(p.jobTitle) },
    { kind: 'industry', selected: filters.industries, getValue: p => deriveIndustry(p.company) },
    { kind: 'companySize', selected: filters.sizes, getValue: p => p.companySize },
    { kind: 'revenue', selected: filters.revenues, getValue: p => p.annualRevenue },
    { kind: 'solutions', selected: filters.seeking, getValue: p => personSolutions(p) },
  ]
  return filterWithGuarantee(pool, dimensions, minResults)
}
