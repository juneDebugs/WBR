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

// ── Border colors (pastel, matching meeting portal) ─────────────────────────

const SOLUTION_CATEGORY_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Marketing', items: ['Email Marketing', 'SMS Marketing', 'Reviews & UGC', 'Personalization'] },
  { label: 'Commerce & Payments', items: ['Payment Processing', 'Subscription Management', 'B2B Commerce', 'Headless Commerce', 'Marketplace Integration'] },
  { label: 'Operations', items: ['Shipping & Fulfillment', 'Inventory Management', 'Returns Management', 'ERP / Operations'] },
  { label: 'Data & AI', items: ['Analytics & Reporting', 'AI & Automation', 'Search & Discovery'] },
  { label: 'Customer', items: ['Customer Support', 'Loyalty & Rewards'] },
]

function getSolutionCategory(solution: string): string | null {
  for (const cat of SOLUTION_CATEGORY_GROUPS) {
    if (cat.items.includes(solution)) return cat.label
  }
  return null
}

const CATEGORY_BORDER_COLORS_LIGHT: Record<string, string> = {
  'Marketing': '#fecdd3',
  'Commerce & Payments': '#bfdbfe',
  'Operations': '#fed7aa',
  'Data & AI': '#ddd6fe',
  'Customer': '#fbcfe8',
}

export function getBorderColorForSeeking(seekingJson: string | null | undefined): string {
  if (!seekingJson) return '#e5e5ea'
  let seeking: string[]
  try { seeking = JSON.parse(seekingJson) } catch { return '#e5e5ea' }
  if (seeking.length === 0) return '#e5e5ea'
  const cat = getSolutionCategory(seeking[0])
  return cat ? (CATEGORY_BORDER_COLORS_LIGHT[cat] ?? '#e5e5ea') : '#e5e5ea'
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
const BEAUTY_SET = new Set(['Charlotte Tilbury DTC','ColourPop','Fenty Beauty DTC','Florence by Mills','Glossier','Gwyneth Paltrow Beauty','Haus Labs','Huda Beauty DTC','IL MAKIAGE','Ilia Beauty','Jones Road','Kosas','Kylie Cosmetics','Milk Makeup','Morphe','NARS DTC','Saie Beauty','Summer Fridays','Tarte Cosmetics','Too Faced DTC','Tower 28','Urban Decay','Urban Decay DTC','Victoria Beckham Beauty','Westman Atelier'])
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
  'Marketing',
  'Ecommerce',
  'Stores/Retail',
  'Customer Experience',
  'Digital',
  'Strategy/Innovation',
  'Information Technology',
  'Operations',
  'C-Suite/GM',
  'Supply Chain/Logistics',
  'Merchandising',
] as const

export type JobFunction = typeof JOB_FUNCTIONS[number]

export function getJobFunction(jobTitle: string | null | undefined): JobFunction {
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

// ── Company Description ──────────────────────────────────────────────────────

const COMPANY_DESCRIPTIONS: Record<string, string> = {
  // Fashion & Apparel
  'Allbirds': 'Sustainable footwear brand using natural materials.',
  'Everlane': 'Transparent pricing and ethical modern essentials.',
  'Reformation': 'Sustainable fashion with a cool-girl edge.',
  'Stitch Fix': 'AI-powered personal styling delivered to your door.',
  'Rent the Runway': 'Designer fashion rental for everyday and events.',
  'ThredUp': 'Online consignment and thrift for secondhand fashion.',
  'Warby Parker': 'Affordable designer eyewear with a social mission.',
  'Vuori': 'Performance apparel inspired by the active California lifestyle.',
  'Quince': 'Luxury-quality essentials at radically low prices.',
  'Faherty Brand': 'Sustainably-minded coastal lifestyle clothing.',
  'Outdoor Voices': 'Activewear designed for recreation, not competition.',
  'Buck Mason': 'Elevated American basics for the modern wardrobe.',
  'Chubbies': 'Weekend wear and shorts with a fun-first philosophy.',
  'Cotopaxi': 'Outdoor gear brand fueled by adventure and social impact.',
  'True Classic': 'Premium-fit basics at accessible price points.',
  'Torrid': 'Fashion-forward plus-size clothing and intimates.',
  'Boohoo DTC': 'Fast-fashion retailer delivering trend-led styles worldwide.',
  'Depop': 'Social marketplace for unique fashion and vintage finds.',
  'Entireworld': 'Colorful, comfort-first essentials for everyday wear.',
  'Noihsaf Bazaar': 'Curated vintage and pre-loved designer fashion.',
  'SSENSE': 'Luxury and streetwear platform curating global designers.',

  // Jewelry & Accessories
  'Olive & Piper': 'Affordable everyday jewelry with a modern feminine touch.',

  // Beauty & Cosmetics
  'Glossier': 'Beauty products inspired by real life and real skin.',
  'Fenty Beauty DTC': 'Inclusive beauty for every skin tone by Rihanna.',
  'Charlotte Tilbury DTC': 'Luxury beauty powered by backstage expertise.',
  'IL MAKIAGE': 'Tech-driven beauty with AI shade matching.',
  'Kosas': 'Clean makeup that feels like skincare.',
  'Tower 28': 'Clean, non-toxic beauty made for sensitive skin.',
  'Saie Beauty': 'Clean beauty essentials with an effortless glow.',
  'Ilia Beauty': 'Clean beauty that delivers real results.',
  'ColourPop': 'Trend-driven beauty at drugstore prices.',
  'Florence by Mills': 'Clean beauty brand created for Gen Z by Millie Bobby Brown.',
  'Haus Labs': 'Supercharged clean artistry beauty by Lady Gaga.',
  'Huda Beauty DTC': 'Global beauty empire driven by social-first innovation.',
  'Jones Road': 'Clean, high-performance makeup for effortless beauty.',
  'Kylie Cosmetics': 'Culture-driven beauty brand by Kylie Jenner.',
  'Milk Makeup': 'Vegan, cruelty-free beauty built for real life.',
  'Morphe': 'Creator-led beauty brand known for bold color palettes.',
  'NARS DTC': 'Iconic luxury beauty brand known for bold color and artistry.',
  'Summer Fridays': 'Feel-good skincare and beauty rooted in self-care rituals.',
  'Tarte Cosmetics': 'High-performance natural beauty powered by superfruits.',
  'Too Faced DTC': 'Playful, cruelty-free cosmetics with bold color payoff.',
  'Urban Decay': 'Edgy, high-performance beauty for rule-breakers.',
  'Victoria Beckham Beauty': 'Luxury clean beauty with a modern British point of view.',
  'Westman Atelier': 'Clean luxury makeup crafted for a lit-from-within glow.',

  // Skincare
  'Beautycounter': 'Clean beauty and skincare with rigorous safety standards.',
  'Drunk Elephant': 'Biocompatible skincare free of the "suspicious six."',
  'Glow Recipe': 'Fruit-powered skincare for a dewy, lit-from-within glow.',
  'Tatcha': 'Japanese beauty rituals for timeless skin.',
  'Tula Skincare': 'Probiotic-powered skincare for balanced, healthy skin.',
  "Paula's Choice": 'Research-backed skincare with ingredient transparency.',
  'Biossance': 'Squalane-powered clean skincare backed by biotech.',
  'COSRX': 'Korean skincare essentials for simple, effective routines.',
  'CeraVe DTC': 'Dermatologist-recommended skincare with essential ceramides.',
  'Herbivore Botanicals': 'Natural, plant-based skincare with luxe ingredients.',
  'SK-II DTC': 'Prestige Japanese skincare powered by PITERA essence.',
  'Versed': 'Affordable clean skincare voted on by the community.',

  // Food & Beverage
  'Magic Spoon': 'High-protein, low-carb cereal that tastes like childhood.',
  'Goldbelly': 'Iconic restaurant food shipped nationwide.',
  'Poppi': 'Prebiotic soda that is actually good for your gut.',
  'Baked by Melissa DTC': 'Bite-size cupcakes in an ever-changing lineup of flavors.',
  'Brightland': 'California-crafted olive oils and vinegars for home cooks.',
  'Burlap & Barrel': 'Single-origin spices sourced directly from smallholder farmers.',
  'Compartés': 'Artisan chocolate blending unexpected flavors and fine art.',
  'Diaspora Co': 'Single-origin spices supporting equitable farm partnerships.',
  'Jacobsen Salt': 'Hand-harvested sea salt from the Oregon coast.',
  "Jeni's Ice Cream": 'Artisan ice cream made with grass-fed milk and creative flavors.',
  'Levain Bakery DTC': 'Legendary oversized cookies baked fresh and shipped nationwide.',
  'Milk Bar DTC': 'Inventive desserts and treats from the cult NYC bakery.',
  'Salt & Straw DTC': 'Small-batch ice cream featuring imaginative, seasonal flavors.',
  'Sugarfina': 'Luxury candy boutique with artisan sweets from around the globe.',
  'Vosges': 'Exotic luxury chocolate infusing global flavors and spices.',

  // Home & Lifestyle
  'Year & Day': 'Modern tableware designed to elevate everyday dining.',
  'Brooklinen': 'Luxury bedding and bath essentials at a fair price.',
  'Parachute Home': 'Premium bedding, bath, and home essentials.',
  'Article': 'Modern furniture delivered directly to your door.',
  'Eight Sleep': 'Smart mattress technology for optimal sleep.',
  'Burrow': 'Modular, easy-to-assemble furniture for modern living.',
  'Albany Park': 'Beautifully designed sofas and furniture delivered in a box.',
  'Apt2B': 'Stylish, affordable furniture built to last.',
  'Arhaus DTC': 'Handcrafted, sustainably sourced home furnishings.',
  'Bear Mattress': 'Recovery-focused mattresses designed for active lifestyles.',
  'Boll & Branch': 'Organic, Fair Trade-certified luxury bedding.',
  'Brooklyn Bedding': 'Handcrafted mattresses offering personalized comfort.',
  'Buffy': 'Eco-friendly bedding made from recycled and natural materials.',
  'Cedar & Moss': 'Handcrafted modern lighting made in Portland, Oregon.',
  'Coyuchi': 'Organic bedding and bath essentials for sustainable living.',
  'Design Within Reach DTC': 'Authentic modern furniture from iconic designers.',
  'Floyd': 'Modular, American-made furniture for flexible living.',
  'Hawkins NY': 'Simple, functional kitchen and homeware essentials.',
  'Helix Sleep': 'Personalized mattresses matched to your sleep style.',
  'Interior Define': 'Custom furniture designed to fit your space and style.',
  'Interior Icons': 'Iconic designer furniture reproductions at accessible prices.',
  'Joybird': 'Custom mid-century modern furniture in bold colors and fabrics.',
  'Purple Innovation': 'Comfort technology mattresses using the GelFlex Grid.',
  'Rejuvenation': 'Period-authentic lighting and hardware for classic homes.',
  'Room & Board DTC': 'Modern, American-made furniture built to last.',
  'Schoolhouse': 'Timeless lighting, hardware, and home goods made in Portland.',
  'Snowe': 'Elevated everyday home essentials with clean design.',
  'Tuft & Needle': 'Honestly built mattresses at a fair price.',
  'Visual Comfort DTC': 'Designer lighting collections for luxury interiors.',

  // Health & Wellness
  'AG1 (Athletic Greens)': 'All-in-one daily nutritional supplement.',
  'Hims & Hers': 'Telehealth platform for personalized wellness.',
  'Peloton DTC': 'Connected fitness platform with world-class instructors.',
  'Oura': 'Smart ring tracking sleep, readiness, and activity.',
  'Therabody': 'Percussive therapy and wellness technology.',
  'Whoop': 'Wearable performance optimization and recovery tracker.',
  'Roman Health': 'Digital health clinic for convenient, everyday care.',

  // Pet
  "The Farmer's Dog": 'Fresh, human-grade dog food delivered to your door.',
  'BarkBox DTC': 'Monthly themed toys and treats for dogs.',
  'Wild One': 'Modern essentials designed for dogs and their people.',
  'Ollie': 'Human-grade fresh dog food customized for every dog.',
  'Open Farm': 'Ethically sourced, transparently crafted pet food.',
  'A Pup Above': 'Sous-vide cooked, human-grade dog food.',
  'Spot & Tango': 'Fresh and dry dog food made with real ingredients.',
  'Sundays for Dogs': 'Air-dried dog food with simple, human-grade ingredients.',

  // Kids & Baby
  'Kyte Baby': 'Ultra-soft bamboo sleepwear and essentials for babies.',
  'Little Sleepies': 'Buttery-soft bamboo pajamas for the whole family.',
  '4moms DTC': 'Innovative baby gear powered by robotics and technology.',
  'BIBS': 'Danish-designed baby essentials rooted in Scandinavian simplicity.',
  'Ergobaby DTC': 'Ergonomic baby carriers and gear for on-the-go families.',

  // Luxury Retail
  'Selfridges Digital': 'Iconic luxury department store with a digital-first experience.',

  // Technology & Commerce
  'Algolia Search': 'AI-powered search and discovery platform for digital commerce.',
  'Amplitude Analytics': 'Product analytics platform for understanding user behavior.',
  'Braze': 'Customer engagement platform for cross-channel messaging.',
  'Builder.io': 'Visual development platform for building digital experiences.',
  'Census': 'Reverse ETL platform syncing data warehouse to business tools.',
  'Cloudflare Edge': 'Edge computing and security platform for web performance.',
  'Contentful CMS': 'Composable content platform powering digital experiences.',
  'Datadog Commerce': 'Observability platform for monitoring commerce infrastructure.',
  'Fivetran': 'Automated data integration delivering analysis-ready data.',
  'FullStory': 'Digital experience intelligence platform with session replay.',
  'Golden State': 'Innovative retail brand based in California.',
  'Heap Analytics': 'Auto-capture analytics for complete user journey insights.',
  'Hotjar': 'Behavior analytics with heatmaps and session recordings.',
  'Iterable': 'AI-powered customer communication platform for growth.',
  'Klaviyo': 'Marketing automation platform purpose-built for ecommerce.',
  'LaunchDarkly': 'Feature management platform for controlled software rollouts.',
  'Mixpanel': 'Product analytics helping teams understand user engagement.',
  'Netlify Commerce': 'Web platform for building and deploying modern storefronts.',
  'Optimizely': 'Digital experience platform for experimentation and optimization.',
  'PlanetScale': 'Serverless MySQL database platform built for scale.',
  'Rudderstack': 'Customer data platform for building data pipelines.',
  'Sanity CMS': 'Composable content platform for structured, real-time editing.',
  'Segment CDP': 'Customer data platform unifying data across every touchpoint.',
  'Sentry': 'Application monitoring and error tracking for developers.',
  'Shopify': 'Commerce platform powering millions of online stores worldwide.',
  'Snowflake Retail': 'Cloud data platform enabling retail analytics at scale.',
  'Split.io': 'Feature delivery platform combining flags with data insights.',
  'Statsig': 'Feature gating and experimentation platform for product teams.',
  'Stripe Commerce': 'Financial infrastructure platform powering online payments.',
  'Supabase': 'Open-source backend platform with database, auth, and APIs.',
  'Twilio Engage': 'Customer engagement platform with multichannel communication.',
  'Vercel DTC': 'Frontend cloud platform for deploying fast web experiences.',
  'dbt Labs': 'Analytics engineering platform transforming data in warehouses.',
}

const INDUSTRY_FALLBACKS: Record<string, string> = {
  'Fashion & Apparel': 'Fashion and apparel brand redefining modern style.',
  'Jewelry & Accessories': 'Accessories brand crafting standout everyday pieces.',
  'Luxury': 'Luxury retailer curating premium experiences.',
  'Beauty & Cosmetics': 'Beauty brand innovating color and self-expression.',
  'Skincare': 'Skincare company focused on healthy, radiant skin.',
  'Health & Wellness': 'Health and wellness company empowering better living.',
  'Food & Beverage': 'Food and beverage brand with a fresh take on flavor.',
  'Home & Lifestyle': 'Home brand designing spaces people love to live in.',
  'Pet': 'Pet brand making life better for pets and their people.',
  'Kids & Baby': 'Kids and baby brand crafted with care and comfort.',
  'Technology': 'Technology company building solutions for modern commerce.',
}

export function getCompanyDescription(company: string | null | undefined): string {
  if (!company) return 'Innovative brand driving modern commerce forward.'
  if (COMPANY_DESCRIPTIONS[company]) return COMPANY_DESCRIPTIONS[company]
  const industry = getIndustry(company)
  return INDUSTRY_FALLBACKS[industry] ?? 'Innovative brand driving modern commerce forward.'
}
