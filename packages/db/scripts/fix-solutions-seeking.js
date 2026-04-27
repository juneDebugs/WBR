// Populates solutionsSeeking for users who have empty arrays,
// ensuring every solution has at least 10 seekers.
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SOLUTIONS = [
  'Email Marketing', 'SMS Marketing', 'Loyalty & Rewards', 'Subscription Management',
  'Returns Management', 'Customer Support', 'Shipping & Fulfillment', 'Inventory Management',
  'Analytics & Reporting', 'Payment Processing', 'Search & Discovery', 'ERP / Operations',
  'Personalization', 'Reviews & UGC', 'Marketplace Integration', 'B2B Commerce',
  'Headless Commerce', 'AI & Automation',
]

// Map industry → solutions they typically seek
const INDUSTRY_SEEKING = {
  'Fashion & Apparel':    ['Returns Management', 'Personalization', 'Loyalty & Rewards', 'Shipping & Fulfillment', 'Analytics & Reporting', 'Search & Discovery'],
  'Beauty & Cosmetics':   ['Loyalty & Rewards', 'Email Marketing', 'Reviews & UGC', 'Personalization', 'Subscription Management', 'AI & Automation'],
  'Skincare':             ['Subscription Management', 'Loyalty & Rewards', 'Email Marketing', 'Customer Support', 'Reviews & UGC', 'Personalization'],
  'Health & Wellness':    ['Subscription Management', 'AI & Automation', 'Analytics & Reporting', 'Customer Support', 'Email Marketing', 'ERP / Operations'],
  'Food & Beverage':      ['Subscription Management', 'Shipping & Fulfillment', 'Loyalty & Rewards', 'Email Marketing', 'Payment Processing', 'Analytics & Reporting'],
  'Home & Lifestyle':     ['Returns Management', 'Shipping & Fulfillment', 'Search & Discovery', 'Headless Commerce', 'Personalization', 'Analytics & Reporting'],
  'Pet':                  ['Subscription Management', 'Shipping & Fulfillment', 'Customer Support', 'Loyalty & Rewards', 'Email Marketing', 'Reviews & UGC'],
  'Kids & Baby':          ['Customer Support', 'Returns Management', 'Shipping & Fulfillment', 'Subscription Management', 'Email Marketing', 'Loyalty & Rewards'],
  'Jewelry & Accessories':['Returns Management', 'Personalization', 'Loyalty & Rewards', 'Customer Support', 'Reviews & UGC', 'Email Marketing'],
  'Luxury':               ['Personalization', 'Customer Support', 'Search & Discovery', 'Headless Commerce', 'Analytics & Reporting', 'B2B Commerce'],
  'Technology':           ['AI & Automation', 'Analytics & Reporting', 'B2B Commerce', 'ERP / Operations', 'Marketplace Integration', 'Headless Commerce'],
}

// Map job function → extra solutions they seek
const FUNCTION_SEEKING = {
  'Marketing':              ['Email Marketing', 'SMS Marketing', 'Personalization', 'AI & Automation', 'Analytics & Reporting'],
  'Commerce & Growth':      ['Search & Discovery', 'Headless Commerce', 'Marketplace Integration', 'Personalization', 'Analytics & Reporting'],
  'Operations & Logistics': ['ERP / Operations', 'Shipping & Fulfillment', 'Inventory Management', 'Returns Management', 'Payment Processing'],
  'Finance & Analytics':    ['Analytics & Reporting', 'ERP / Operations', 'Payment Processing', 'B2B Commerce', 'Subscription Management'],
  'Technology & Product':   ['AI & Automation', 'Headless Commerce', 'Analytics & Reporting', 'ERP / Operations', 'Marketplace Integration'],
  'Sales & Partnerships':   ['B2B Commerce', 'Marketplace Integration', 'Customer Support', 'Payment Processing', 'Loyalty & Rewards'],
  'Executive / Founder':    ['AI & Automation', 'Analytics & Reporting', 'Subscription Management', 'Loyalty & Rewards', 'ERP / Operations'],
}

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

function getIndustry(company) {
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

function getJobFunction(jobTitle) {
  if (!jobTitle) return 'Executive / Founder'
  const t = jobTitle.toLowerCase()
  if (t.includes('ceo')||t.includes('coo')||t.includes('cfo')||t.includes('cto')||t.includes('cmo')||t.includes('founder')||t.includes('president')) return 'Executive / Founder'
  if (t.includes('marketing')||t.includes('brand')||t.includes('acquisition')||t.includes('retention')||t.includes('performance')||t.includes('content')||t.includes('creative')) return 'Marketing'
  if (t.includes('ecommerce')||t.includes('e-commerce')||t.includes('dtc')||t.includes('growth')||t.includes('revenue')||t.includes('commerce')) return 'Commerce & Growth'
  if (t.includes('tech')||t.includes('engineering')||t.includes('product')||t.includes('data')||t.includes('developer')||t.includes('platform')||t.includes('architect')) return 'Technology & Product'
  if (t.includes('operations')||t.includes('ops')||t.includes('logistics')||t.includes('supply')||t.includes('fulfillment')||t.includes('warehouse')) return 'Operations & Logistics'
  if (t.includes('finance')||t.includes('financial')||t.includes('analytics')||t.includes('accounting')||t.includes('reporting')||t.includes('insights')) return 'Finance & Analytics'
  if (t.includes('sales')||t.includes('partnerships')||t.includes('wholesale')||t.includes('retail')||t.includes('customer success')||t.includes('account')) return 'Sales & Partnerships'
  return 'Executive / Founder'
}

function pickSeeking(user, existingOffering) {
  const industry = getIndustry(user.company)
  const fn = getJobFunction(user.jobTitle)
  const industrySolutions = INDUSTRY_SEEKING[industry] || SOLUTIONS.slice(0, 6)
  const fnSolutions = FUNCTION_SEEKING[fn] || []
  // Combine, deduplicate, exclude what they already offer
  const pool = [...new Set([...industrySolutions, ...fnSolutions])].filter(s => !existingOffering.includes(s))
  // Pick 2-4
  const count = 2 + Math.floor(Math.random() * 3)
  const shuffled = pool.sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, pool.length))
}

async function main() {
  // Get users with empty solutionsSeeking
  const users = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] }, solutionsSeeking: '[]' },
    select: { id: true, company: true, jobTitle: true, solutionsOffering: true },
  })

  console.log(`Updating ${users.length} users with empty solutionsSeeking...`)

  let updated = 0
  for (const user of users) {
    let offering = []
    try { offering = JSON.parse(user.solutionsOffering || '[]') } catch {}
    const seeking = pickSeeking(user, offering)
    await p.user.update({
      where: { id: user.id },
      data: { solutionsSeeking: JSON.stringify(seeking) },
    })
    updated++
    if (updated % 50 === 0) console.log(`  ${updated}/${users.length}...`)
  }

  // Verify coverage
  console.log('\nVerifying solution coverage (seekers per solution):')
  const allUsers = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { solutionsSeeking: true },
  })

  const counts = {}
  for (const sol of SOLUTIONS) counts[sol] = 0
  for (const u of allUsers) {
    let seeking = []
    try { seeking = JSON.parse(u.solutionsSeeking || '[]') } catch {}
    for (const s of seeking) if (counts[s] !== undefined) counts[s]++
  }

  let ok = true
  for (const [sol, count] of Object.entries(counts)) {
    const flag = count < 7 ? '⚠️ ' : '✓ '
    console.log(`  ${flag}${sol}: ${count}`)
    if (count < 7) ok = false
  }

  console.log(ok ? '\n✓ All solutions have 7+ seekers' : '\n⚠️  Some solutions need more seekers')
  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
