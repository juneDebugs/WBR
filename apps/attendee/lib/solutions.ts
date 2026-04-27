// Inline style colors for each solution — avoids Tailwind JIT purging dynamic class names
export const SOLUTION_COLORS: Record<string, {
  bgFrom: string; bgTo: string;   // light bg gradient (filter chip inactive)
  activeFrom: string; activeTo: string; // full-color gradient (chip active + badge)
  text: string;                   // text color for inactive chip
  dot: string;                    // dot color for inactive chip
}> = {
  'Email Marketing':         { bgFrom:'#fff1f2', bgTo:'#fdf2f8', activeFrom:'#f43f5e', activeTo:'#ec4899', text:'#e11d48', dot:'#fb7185' },
  'SMS Marketing':           { bgFrom:'#fff7ed', bgTo:'#fffbeb', activeFrom:'#f97316', activeTo:'#f59e0b', text:'#ea580c', dot:'#fb923c' },
  'Loyalty & Rewards':       { bgFrom:'#fefce8', bgTo:'#fffbeb', activeFrom:'#eab308', activeTo:'#f59e0b', text:'#ca8a04', dot:'#facc15' },
  'Subscription Management': { bgFrom:'#f0fdfa', bgTo:'#ecfeff', activeFrom:'#14b8a6', activeTo:'#06b6d4', text:'#0d9488', dot:'#2dd4bf' },
  'Returns Management':      { bgFrom:'#eff6ff', bgTo:'#f0f9ff', activeFrom:'#3b82f6', activeTo:'#0ea5e9', text:'#2563eb', dot:'#60a5fa' },
  'Customer Support':        { bgFrom:'#f0f9ff', bgTo:'#eef2ff', activeFrom:'#0ea5e9', activeTo:'#6366f1', text:'#0284c7', dot:'#38bdf8' },
  'Shipping & Fulfillment':  { bgFrom:'#eef2ff', bgTo:'#eff6ff', activeFrom:'#6366f1', activeTo:'#3b82f6', text:'#4f46e5', dot:'#818cf8' },
  'Inventory Management':    { bgFrom:'#f5f3ff', bgTo:'#faf5ff', activeFrom:'#8b5cf6', activeTo:'#a855f7', text:'#7c3aed', dot:'#a78bfa' },
  'Analytics & Reporting':   { bgFrom:'#faf5ff', bgTo:'#fdf4ff', activeFrom:'#a855f7', activeTo:'#d946ef', text:'#9333ea', dot:'#c084fc' },
  'Payment Processing':      { bgFrom:'#ecfdf5', bgTo:'#f0fdf4', activeFrom:'#10b981', activeTo:'#22c55e', text:'#059669', dot:'#34d399' },
  'Search & Discovery':      { bgFrom:'#f7fee7', bgTo:'#f0fdf4', activeFrom:'#84cc16', activeTo:'#22c55e', text:'#65a30d', dot:'#a3e635' },
  'ERP / Operations':        { bgFrom:'#f8fafc', bgTo:'#f4f4f5', activeFrom:'#64748b', activeTo:'#71717a', text:'#475569', dot:'#94a3b8' },
  'Personalization':         { bgFrom:'#fdf4ff', bgTo:'#fdf2f8', activeFrom:'#d946ef', activeTo:'#ec4899', text:'#c026d3', dot:'#e879f9' },
  'Reviews & UGC':           { bgFrom:'#fffbeb', bgTo:'#fff7ed', activeFrom:'#f59e0b', activeTo:'#f97316', text:'#b45309', dot:'#fbbf24' },
  'Marketplace Integration': { bgFrom:'#ecfeff', bgTo:'#eff6ff', activeFrom:'#06b6d4', activeTo:'#3b82f6', text:'#0e7490', dot:'#22d3ee' },
  'B2B Commerce':            { bgFrom:'#f8fafc', bgTo:'#eff6ff', activeFrom:'#475569', activeTo:'#3b82f6', text:'#334155', dot:'#64748b' },
  'Headless Commerce':       { bgFrom:'#eef2ff', bgTo:'#f5f3ff', activeFrom:'#4f46e5', activeTo:'#8b5cf6', text:'#3730a3', dot:'#818cf8' },
  'AI & Automation':         { bgFrom:'#f5f3ff', bgTo:'#fdf2f8', activeFrom:'#7c3aed', activeTo:'#ec4899', text:'#6d28d9', dot:'#a78bfa' },
}

export const SOLUTIONS = [
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
]

export const COMPANY_SIZES = ['STARTUP', 'SMB', 'MIDMARKET', 'ENTERPRISE'] as const
export const REVENUE_RANGES = ['<1M', '1M-10M', '10M-50M', '50M-250M', '250M+'] as const

export const COMPANY_SIZE_LABELS: Record<string, string> = {
  STARTUP: 'Startup (1–50)',
  SMB: 'SMB (51–500)',
  MIDMARKET: 'Mid-Market (501–2K)',
  ENTERPRISE: 'Enterprise (2K+)',
}

export const REVENUE_LABELS: Record<string, string> = {
  '<1M': 'Under $1M',
  '1M-10M': '$1M – $10M',
  '10M-50M': '$10M – $50M',
  '50M-250M': '$50M – $250M',
  '250M+': '$250M+',
}

// ── Industry ─────────────────────────────────────────────────────────────────

export const INDUSTRIES = [
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

export type Industry = typeof INDUSTRIES[number]

const FASHION_SET = new Set(['ASOS DTC','Aerie','Alex Mill','Allbirds','Boohoo DTC','Browns Fashion','Buck Mason','Chubbies','Cotopaxi','Cuyana','Danner','Depop','Eloquii','Entireworld','Everlane','Faherty Brand','Farfetch','Fossil DTC','Grailed','Helm Boots','Koio','M.Gemi','Margaux','Michael Kors DTC','Ministry of Supply','Natori','Nisolo','Noihsaf Bazaar','Outdoor Voices','Outerknown','PrettyLittleThing','Public Rec','Quince','Reformation','Rent the Runway',"Rothy's",'SSENSE','Saks Fifth Avenue DTC','Selfridges Digital','Shein DTC','Shopbop','Stitch Fix','Tecovas','Temu Brand','ThredUp','Thursday Boot','Torrid','True Classic','Universal Standard','Vuori','Warby Parker','Wolf & Badger'])
const JEWELRY_SET = new Set(['Alex and Ani','Ana Luisa','Aurate','Baublebar','Catbird','Clocks and Colours','EyeBuyDirect','Gorjana','JINS Eyewear','MVMT','Mejuri','Missoma','Monica Vinader','Olive & Piper','Pandora DTC','Studs','Vrai'])
const LUXURY_SET = new Set(['Barneys NY Online','Harrods Digital','Harvey Nichols DTC','Kate Spade DTC','Liberty London','Luisaviaroma','Mytheresa','Net-a-Porter','Neiman Marcus DTC','SSENSE','Selfridges Digital','The RealReal','Vestiaire Collective'])
const BEAUTY_SET = new Set(['Charlotte Tilbury DTC','ColourPop','Fenty Beauty DTC','Florence by Mills','Glossier','Gwyneth Paltrow Beauty','Haus Labs','Huda Beauty DTC','IL MAKIAGE','Ilia Beauty','Jones Road','Kosas','Kylie Cosmetics','Milk Makeup','Morphe','NARS DTC','Saie Beauty','Summer Fridays','Tarte Cosmetics','Too Faced DTC','Tower 28','Urban Decay DTC','Victoria Beckham Beauty','Westman Atelier'])
const SKINCARE_SET = new Set(['Beautycounter','Biossance','COSRX','Care/of','CeraVe DTC','Credo Beauty','Dermalogica DTC','Dermstore','Drunk Elephant','Follain','Glow Recipe','Herbivore Botanicals','Innisfree DTC','La Roche-Posay DTC','Murad DTC','Ordinary DTC',"Paula's Choice",'Peter Thomas Roth DTC','Rescue Spa','SK-II DTC','SkinCeuticals DTC','Sulwhasoo DTC','Sunday Riley DTC','Tatcha','The Detox Market','Tula Skincare','Versed'])
const HEALTH_SET = new Set(['AG1 (Athletic Greens)','Calm','Headspace DTC','Hims & Hers','Hyperice','Mirror DTC','NordicTrack DTC','Oura','Peloton DTC','Roman Health','Therabody','Tonal','Wahoo Fitness','Whoop'])
const FOOD_SET = new Set(['Baked by Melissa DTC','Brightland','Burlap & Barrel','Compartés','Diaspora Co','Goldbelly','Jacobsen Salt',"Jeni's Ice Cream",'Levain Bakery DTC','Magic Spoon','Milk Bar DTC','Poppi','Salt & Straw DTC','Sugarfina','Vosges'])
const HOME_SET = new Set(['Albany Park','Apt2B','Arhaus DTC','Article','Bear Mattress','Boll & Branch','Brooklinen','Brooklyn Bedding','Buffy','Burrow','Cedar & Moss','Coyuchi','Design Within Reach DTC','Eight Sleep','Floyd','Hawkins NY','Helix Sleep','Interior Define','Interior Icons','Joybird','Parachute Home','Purple Innovation','Rejuvenation','Room & Board DTC','Schoolhouse','Snowe','Tuft & Needle','Visual Comfort DTC','Year & Day'])
const PET_SET = new Set(['A Pup Above','BarkBox DTC','Ollie','Open Farm','Spot & Tango','Sundays for Dogs',"The Farmer's Dog",'Wild One'])
const KIDS_SET = new Set(['4moms DTC','BIBS','Ergobaby DTC','Kyte Baby','Little Sleepies'])

export function getIndustry(company: string | null | undefined): Industry {
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

// ── Job Function ──────────────────────────────────────────────────────────────

export const JOB_FUNCTIONS = [
  'Executive / Founder',
  'Marketing',
  'Commerce & Growth',
  'Technology & Product',
  'Operations & Logistics',
  'Finance & Analytics',
  'Sales & Partnerships',
] as const

export type JobFunction = typeof JOB_FUNCTIONS[number]

export function getJobFunction(jobTitle: string | null | undefined): JobFunction {
  if (!jobTitle) return 'Executive / Founder'
  const t = jobTitle.toLowerCase()
  if (t.includes('ceo') || t.includes('coo') || t.includes('cfo') || t.includes('cto') || t.includes('cmo') || t.includes('founder') || t.includes('president') || t.includes('owner')) return 'Executive / Founder'
  if (t.includes('marketing') || t.includes('brand') || t.includes('acquisition') || t.includes('retention') || t.includes('performance') || t.includes('seo') || t.includes('content') || t.includes('creative')) return 'Marketing'
  if (t.includes('ecommerce') || t.includes('e-commerce') || t.includes('dtc') || t.includes('growth') || t.includes('revenue') || t.includes('marketplace') || t.includes('digital commerce') || t.includes('commerce')) return 'Commerce & Growth'
  if (t.includes('tech') || t.includes('engineering') || t.includes('product') || t.includes('data') || t.includes('developer') || t.includes('software') || t.includes('platform') || t.includes('architect')) return 'Technology & Product'
  if (t.includes('operations') || t.includes('ops') || t.includes('logistics') || t.includes('supply') || t.includes('fulfillment') || t.includes('warehouse') || t.includes('procurement')) return 'Operations & Logistics'
  if (t.includes('finance') || t.includes('financial') || t.includes('analytics') || t.includes('accounting') || t.includes('reporting') || t.includes('bi ') || t.includes('insights')) return 'Finance & Analytics'
  if (t.includes('sales') || t.includes('partnerships') || t.includes('wholesale') || t.includes('retail') || t.includes('customer success') || t.includes('account')) return 'Sales & Partnerships'
  return 'Executive / Founder'
}

// ── Title Seniority ───────────────────────────────────────────────────────────

export const TITLE_LEVELS = [
  'C-Suite',
  'Founder / Co-Founder',
  'SVP / VP',
  'Director',
  'Head of',
  'Manager / Lead',
] as const

export type TitleLevel = typeof TITLE_LEVELS[number]

export function getTitleLevel(jobTitle: string | null | undefined): TitleLevel {
  if (!jobTitle) return 'Manager / Lead'
  const t = jobTitle.toLowerCase()
  if (t.startsWith('ceo') || t.startsWith('coo') || t.startsWith('cfo') || t.startsWith('cto') || t.startsWith('cmo') || t.startsWith('cpo') || t === 'chief') return 'C-Suite'
  if (t.includes('founder') || t.includes('co-founder')) return 'Founder / Co-Founder'
  if (t.startsWith('svp') || t.startsWith('vp ') || t.startsWith('vp,') || t.includes('vice president')) return 'SVP / VP'
  if (t.startsWith('director') || t.endsWith('director')) return 'Director'
  if (t.startsWith('head of') || t.startsWith('head,')) return 'Head of'
  return 'Manager / Lead'
}
