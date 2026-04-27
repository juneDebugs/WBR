// Comprehensive diversification: within each industry group, independently cycle
// through all title levels × company sizes × revenues so every filter combo returns results.
// Uses k = within-industry-index, then:
//   titleLevel = k % 6
//   companySize = floor(k/6) % 4
//   revenue     = floor(k/24) % 5
// This covers all 120 combos within 120 users; with ~33 users per industry we hit 33/120
// but the key combos (Founder+SMB+1M-10M etc.) fall at low k values.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SOLUTIONS = [
  'Email Marketing', 'SMS Marketing', 'Loyalty & Rewards', 'Subscription Management',
  'Returns Management', 'Customer Support', 'Shipping & Fulfillment', 'Inventory Management',
  'Analytics & Reporting', 'Payment Processing', 'Search & Discovery', 'ERP / Operations',
  'Personalization', 'Reviews & UGC', 'Marketplace Integration', 'B2B Commerce',
  'Headless Commerce', 'AI & Automation',
]

// Title pools per level — chosen so getTitleLevel + getJobFunction both match correctly
// Level 0: Founder/Co-Founder → both getTitleLevel='Founder/Co-Founder' AND getJobFunction='Executive/Founder'
// Level 1: C-Suite             → getTitleLevel='C-Suite', getJobFunction='Executive/Founder'
// Level 2: SVP / VP            → getTitleLevel='SVP/VP', getJobFunction varies
// Level 3: Director            → getTitleLevel='Director', getJobFunction varies
// Level 4: Head of             → getTitleLevel='Head of', getJobFunction varies
// Level 5: Manager / Lead      → getTitleLevel='Manager/Lead', getJobFunction varies
const TITLE_POOLS = [
  ['Founder', 'Co-Founder', 'Founder & CEO', 'Co-Founder & President'],
  ['CEO', 'COO', 'CMO', 'CTO', 'CFO'],
  ['VP of eCommerce', 'VP of Marketing', 'VP of Growth', 'SVP of Digital Commerce', 'VP of Operations', 'VP of Product', 'VP of Finance', 'VP of Partnerships'],
  ['Director of eCommerce', 'Director of Marketing', 'Director of Operations', 'Director of Product', 'Director of Finance', 'Director of Analytics', 'Director of Sales'],
  ['Head of Marketing', 'Head of eCommerce', 'Head of DTC', 'Head of Partnerships', 'Head of Supply Chain', 'Head of Technology', 'Head of Analytics'],
  ['Sr. Manager of eCommerce', 'Manager of Digital Marketing', 'Sr. Manager of Operations', 'Manager of Analytics', 'Manager of Partnerships', 'Lead of Growth Marketing'],
]

const COMPANY_SIZES = ['STARTUP', 'SMB', 'MIDMARKET', 'ENTERPRISE']
const REVENUE_RANGES = ['<1M', '1M-10M', '10M-50M', '50M-250M', '250M+']

const INDUSTRY_COMPANIES = {
  'Fashion & Apparel':     ['Everlane','Allbirds','Reformation','Vuori','Stitch Fix','Faherty Brand','Warby Parker',"Rothy's",'Rent the Runway','Outdoor Voices','True Classic','Quince','Cotopaxi','Buck Mason','Cuyana'],
  'Beauty & Cosmetics':    ['Glossier','ColourPop','Fenty Beauty DTC','Milk Makeup','Kosas','IL MAKIAGE','Saie Beauty','Tower 28','Haus Labs','Ilia Beauty','Tarte Cosmetics','NARS DTC','Charlotte Tilbury DTC','Morphe','Too Faced DTC'],
  'Skincare':              ['Tatcha','Drunk Elephant',"Paula's Choice",'Glow Recipe','Tula Skincare','Beautycounter','Biossance','Sunday Riley DTC','Herbivore Botanicals','CeraVe DTC','Versed','The Detox Market','COSRX','Ordinary DTC','SK-II DTC'],
  'Health & Wellness':     ['Peloton DTC','Whoop','Oura','Roman Health','Hims & Hers','AG1 (Athletic Greens)','Therabody','Calm','Eight Sleep','Hyperice','Tonal','Wahoo Fitness','NordicTrack DTC','Mirror DTC','Headspace DTC'],
  'Food & Beverage':       ['Magic Spoon','Poppi','Goldbelly','Brightland','Milk Bar DTC',"Jeni's Ice Cream",'Levain Bakery DTC','Burlap & Barrel','Sugarfina','Vosges','Diaspora Co','Jacobsen Salt','Baked by Melissa DTC','Compartés','Salt & Straw DTC'],
  'Home & Lifestyle':      ['Brooklinen','Parachute Home','Article','Tuft & Needle','Boll & Branch','Helix Sleep','Floyd','Snowe','Burrow','Hawkins NY','Eight Sleep','Albany Park','Joybird','Year & Day','Coyuchi'],
  'Jewelry & Accessories': ['Mejuri','Gorjana','Ana Luisa','Missoma','Studs','Aurate','Baublebar','MVMT','Alex and Ani','Monica Vinader','Catbird','Vrai','Olive & Piper'],
  'Pet':                   ["The Farmer's Dog",'BarkBox DTC','Ollie','Open Farm','Wild One','Spot & Tango','Sundays for Dogs','A Pup Above'],
  'Technology':            ['Shopify','BigCommerce','Klaviyo','Yotpo','Gorgias','Recharge','Attentive','Postscript','LoyaltyLion','Rebuy','Okendo','Northbeam','Triple Whale','Skio','Malomo'],
}

const INDUSTRY_SEEKING = {
  'Fashion & Apparel':     ['Returns Management','Personalization','Loyalty & Rewards','Shipping & Fulfillment','Analytics & Reporting','Search & Discovery','Subscription Management','Email Marketing'],
  'Beauty & Cosmetics':    ['Loyalty & Rewards','Email Marketing','Reviews & UGC','Personalization','Subscription Management','AI & Automation','Customer Support','SMS Marketing'],
  'Skincare':              ['Subscription Management','Loyalty & Rewards','Email Marketing','Customer Support','Reviews & UGC','Personalization','SMS Marketing'],
  'Health & Wellness':     ['Subscription Management','AI & Automation','Analytics & Reporting','Customer Support','Email Marketing','ERP / Operations','Inventory Management'],
  'Food & Beverage':       ['Subscription Management','Shipping & Fulfillment','Loyalty & Rewards','Email Marketing','Payment Processing','Analytics & Reporting','Inventory Management'],
  'Home & Lifestyle':      ['Returns Management','Shipping & Fulfillment','Search & Discovery','Headless Commerce','Personalization','Analytics & Reporting','Customer Support'],
  'Jewelry & Accessories': ['Returns Management','Personalization','Loyalty & Rewards','Customer Support','Reviews & UGC','Email Marketing','Subscription Management'],
  'Pet':                   ['Subscription Management','Shipping & Fulfillment','Customer Support','Loyalty & Rewards','Email Marketing','Reviews & UGC','AI & Automation'],
  'Technology':            ['AI & Automation','Analytics & Reporting','B2B Commerce','ERP / Operations','Marketplace Integration','Headless Commerce','Subscription Management'],
}

function pickTitle(k, levelIdx) {
  const pool = TITLE_POOLS[levelIdx]
  return pool[k % pool.length]
}

function pickSeeking(industry, k) {
  const pool = INDUSTRY_SEEKING[industry] || SOLUTIONS.slice(0, 6)
  const count = 2 + (k % 3)  // 2, 3, or 4 solutions
  const start = k % pool.length
  const result = []
  for (let i = 0; i < count; i++) {
    result.push(pool[(start + i) % pool.length])
  }
  return [...new Set(result)]
}

async function main() {
  const industries = Object.keys(INDUSTRY_COMPANIES)

  // ── Attendees ──────────────────────────────────────────────────────────────
  const attendees = await p.user.findMany({
    where: { role: 'ATTENDEE' },
    select: { id: true },
  })
  console.log(`Updating ${attendees.length} attendees with comprehensive coverage...`)

  // Group attendees by industry slot (i % industries.length)
  const groups = {}
  for (const industry of industries) groups[industry] = []
  for (let i = 0; i < attendees.length; i++) {
    groups[industries[i % industries.length]].push({ user: attendees[i], globalIdx: i })
  }

  for (const [industry, members] of Object.entries(groups)) {
    const companies = INDUSTRY_COMPANIES[industry]
    for (let j = 0; j < members.length; j++) {
      const k = j  // within-industry index
      const titleLevelIdx = k % 6
      const sizeIdx = Math.floor(k / 6) % 4
      const revenueIdx = Math.floor(k / 24) % 5
      const company = companies[k % companies.length]
      const title = pickTitle(k, titleLevelIdx)
      const size = COMPANY_SIZES[sizeIdx]
      const revenue = REVENUE_RANGES[revenueIdx]
      const seeking = pickSeeking(industry, k)
      const offering = [SOLUTIONS[(members[j].globalIdx * 5) % SOLUTIONS.length]]

      await p.user.update({
        where: { id: members[j].user.id },
        data: { company, jobTitle: title, companySize: size, annualRevenue: revenue,
                solutionsSeeking: JSON.stringify(seeking), solutionsOffering: JSON.stringify(offering) },
      })
    }
    console.log(`  ✓ ${industry}: ${members.length} attendees (${members.length} combos covered)`)
  }

  // ── Speakers ───────────────────────────────────────────────────────────────
  const speakers = await p.user.findMany({
    where: { role: 'SPEAKER' },
    select: { id: true },
  })
  console.log(`\nUpdating ${speakers.length} speakers...`)
  const speakerGroups = {}
  for (const industry of industries) speakerGroups[industry] = []
  for (let i = 0; i < speakers.length; i++) {
    speakerGroups[industries[i % industries.length]].push({ user: speakers[i], globalIdx: i })
  }
  for (const [industry, members] of Object.entries(speakerGroups)) {
    const companies = INDUSTRY_COMPANIES[industry]
    for (let j = 0; j < members.length; j++) {
      const k = j
      // Speakers: cycle through C-Suite and Founder/VP
      const titleLevelIdx = k % 3  // 0=Founder, 1=C-Suite, 2=SVP/VP
      const sizeIdx = k % 4
      const revenueIdx = k % 5
      const company = companies[k % companies.length]
      const title = pickTitle(k, titleLevelIdx)
      const size = COMPANY_SIZES[sizeIdx]
      const revenue = REVENUE_RANGES[revenueIdx]
      const seeking = pickSeeking(industry, k)
      const offering = [SOLUTIONS[(members[j].globalIdx * 3) % SOLUTIONS.length]]
      await p.user.update({
        where: { id: members[j].user.id },
        data: { company, jobTitle: title, companySize: size, annualRevenue: revenue,
                solutionsSeeking: JSON.stringify(seeking), solutionsOffering: JSON.stringify(offering) },
      })
    }
    console.log(`  ✓ ${industry}: ${members.length} speakers`)
  }

  // ── Verification ───────────────────────────────────────────────────────────
  console.log('\n=== Verification ===')
  const allUsers = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { role: true, company: true, jobTitle: true, companySize: true, annualRevenue: true, solutionsSeeking: true },
  })

  // Check key combos that were failing
  const FASHION_COMPANIES = new Set(INDUSTRY_COMPANIES['Fashion & Apparel'])
  function getTitleLevel(t) {
    if (!t) return 'Manager/Lead'
    const s = t.toLowerCase()
    if (s.startsWith('ceo')||s.startsWith('coo')||s.startsWith('cfo')||s.startsWith('cto')||s.startsWith('cmo')) return 'C-Suite'
    if (s.includes('founder')) return 'Founder/Co-Founder'
    if (s.startsWith('svp')||s.startsWith('vp ')||s.startsWith('vp,')) return 'SVP/VP'
    if (s.startsWith('director')) return 'Director'
    if (s.startsWith('head of')||s.startsWith('head,')) return 'Head of'
    return 'Manager/Lead'
  }

  const fashionAttendees = allUsers.filter(u => u.role === 'ATTENDEE' && FASHION_COMPANIES.has(u.company || ''))
  const fashionFounderSMB1M = fashionAttendees.filter(u =>
    getTitleLevel(u.jobTitle) === 'Founder/Co-Founder' && u.companySize === 'SMB' && u.annualRevenue === '1M-10M'
  )
  console.log(`Fashion & Apparel total attendees: ${fashionAttendees.length}`)
  console.log(`Fashion + Founder/Co-Founder + SMB + 1M-10M: ${fashionFounderSMB1M.length} (was 0 before)`)

  // Check each industry has speakers
  for (const [industry, companies] of Object.entries(INDUSTRY_COMPANIES)) {
    const set = new Set(companies)
    const count = allUsers.filter(u => set.has(u.company || '') && u.role === 'ATTENDEE').length
    const flag = count < 3 ? '⚠️ ' : '✓ '
    console.log(`${flag}${industry} attendees: ${count}`)
  }

  // Check solutions coverage
  console.log('\nSolutions seeking coverage:')
  const counts = {}
  for (const s of SOLUTIONS) counts[s] = 0
  for (const u of allUsers) {
    let seeking = []
    try { seeking = JSON.parse(u.solutionsSeeking || '[]') } catch {}
    for (const s of seeking) if (counts[s] !== undefined) counts[s]++
  }
  let allOk = true
  for (const [sol, count] of Object.entries(counts)) {
    if (count < 7) { console.log(`  ⚠️  ${sol}: ${count}`); allOk = false }
  }
  if (allOk) console.log('  ✓ All solutions have 7+ seekers')

  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
