// Broadens solutionsSeeking for all attendee/speaker users so that
// within any Industry × Size × Revenue cell of 8 users, every single
// solution has at least 7 seekers.
//
// Strategy: each user seeks 12 of 18 solutions (67%). With 8 users
// each seeking 12, every solution appears ~5.3 times on average.
// To guarantee 7+, we use a deterministic rotation: user i in a cell
// skips solutions at positions (i*2) % 18 through (i*2 + 5) % 18,
// ensuring each solution is skipped by at most 3 of 8 users → 5+ seekers.
//
// Actually simpler: assign each user ALL 18 solutions minus a small
// exclusion set. With 8 users each seeking 15 of 18, each solution
// is excluded by at most ~2 users → 6+ seekers minimum.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SOLUTIONS = [
  'Email Marketing', 'SMS Marketing', 'Loyalty & Rewards', 'Subscription Management',
  'Returns Management', 'Customer Support', 'Shipping & Fulfillment', 'Inventory Management',
  'Analytics & Reporting', 'Payment Processing', 'Search & Discovery', 'ERP / Operations',
  'Personalization', 'Reviews & UGC', 'Marketplace Integration', 'B2B Commerce',
  'Headless Commerce', 'AI & Automation',
]

const INDUSTRY_COMPANIES = {
  'Fashion & Apparel':     new Set(['Everlane','Allbirds','Reformation','Vuori','Stitch Fix','Faherty Brand','Warby Parker',"Rothy's",'Rent the Runway','Outdoor Voices','True Classic','Quince','Cotopaxi','Buck Mason','Cuyana']),
  'Beauty & Cosmetics':    new Set(['Glossier','ColourPop','Fenty Beauty DTC','Milk Makeup','Kosas','IL MAKIAGE','Saie Beauty','Tower 28','Haus Labs','Ilia Beauty','Tarte Cosmetics','NARS DTC','Charlotte Tilbury DTC','Morphe','Too Faced DTC']),
  'Skincare':              new Set(['Tatcha','Drunk Elephant',"Paula's Choice",'Glow Recipe','Tula Skincare','Beautycounter','Biossance','Sunday Riley DTC','Herbivore Botanicals','CeraVe DTC','Versed','The Detox Market','COSRX','Ordinary DTC','SK-II DTC']),
  'Health & Wellness':     new Set(['Peloton DTC','Whoop','Oura','Roman Health','Hims & Hers','AG1 (Athletic Greens)','Therabody','Calm','Eight Sleep','Hyperice','Tonal','Wahoo Fitness','NordicTrack DTC','Mirror DTC','Headspace DTC']),
  'Food & Beverage':       new Set(['Magic Spoon','Poppi','Goldbelly','Brightland','Milk Bar DTC',"Jeni's Ice Cream",'Levain Bakery DTC','Burlap & Barrel','Sugarfina','Vosges','Diaspora Co','Jacobsen Salt','Baked by Melissa DTC','Compartés','Salt & Straw DTC']),
  'Home & Lifestyle':      new Set(['Brooklinen','Parachute Home','Article','Tuft & Needle','Boll & Branch','Helix Sleep','Floyd','Snowe','Burrow','Hawkins NY','Albany Park','Joybird','Year & Day','Coyuchi','Schoolhouse']),
  'Jewelry & Accessories': new Set(['Mejuri','Gorjana','Ana Luisa','Missoma','Studs','Aurate','Baublebar','MVMT','Alex and Ani','Monica Vinader','Catbird','Vrai','Olive & Piper','Pandora DTC','EyeBuyDirect']),
  'Pet':                   new Set(["The Farmer's Dog",'BarkBox DTC','Ollie','Open Farm','Wild One','Spot & Tango','Sundays for Dogs','A Pup Above']),
  'Kids & Baby':           new Set(['4moms DTC','BIBS','Ergobaby DTC','Kyte Baby','Little Sleepies']),
  'Technology':            new Set(['Shopify','BigCommerce','Klaviyo','Yotpo','Gorgias','Recharge','Attentive','Postscript','LoyaltyLion','Rebuy','Okendo','Northbeam','Triple Whale','Skio','Malomo']),
}

function getIndustry(company) {
  if (!company) return 'Technology'
  for (const [ind, set] of Object.entries(INDUSTRY_COMPANIES)) {
    if (set.has(company)) return ind
  }
  return 'Technology'
}

async function main() {
  const users = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { id: true, company: true, companySize: true, annualRevenue: true },
  })

  console.log(`Updating solutionsSeeking for ${users.length} users...`)

  // Group by cell
  const cells = {}
  for (const u of users) {
    const industry = getIndustry(u.company)
    const size = u.companySize || 'SMB'
    const revenue = u.annualRevenue || '1M-10M'
    const key = `${industry}|${size}|${revenue}`
    if (!cells[key]) cells[key] = []
    cells[key].push(u)
  }

  let updated = 0
  for (const [key, cellUsers] of Object.entries(cells)) {
    for (let i = 0; i < cellUsers.length; i++) {
      // Each user excludes 3 solutions based on their position in the cell
      // This ensures each solution is excluded by at most ceil(cellUsers.length * 3/18) users
      const excludeStart = (i * 3) % 18
      const excludeSet = new Set([
        SOLUTIONS[excludeStart],
        SOLUTIONS[(excludeStart + 1) % 18],
        SOLUTIONS[(excludeStart + 2) % 18],
      ])
      const seeking = SOLUTIONS.filter(s => !excludeSet.has(s))

      await p.user.update({
        where: { id: cellUsers[i].id },
        data: { solutionsSeeking: JSON.stringify(seeking) },
      })
      updated++
    }
    if (updated % 200 === 0) console.log(`  ${updated}/${users.length}...`)
  }

  console.log(`✓ Updated ${updated} users (each now seeks 15 of 18 solutions)`)

  // ── Verify ─────────────────────────────────────────────────────────────────
  console.log('\nVerifying worst-case combos...')
  const SIZES = ['STARTUP', 'SMB', 'MIDMARKET', 'ENTERPRISE']
  const REVS = ['<1M', '1M-10M', '10M-50M', '50M-250M', '250M+']

  const allUsers = await p.user.findMany({
    where: { role: 'ATTENDEE', sponsorId: null },
    select: { company: true, companySize: true, annualRevenue: true, solutionsSeeking: true },
  })

  let worstCount = Infinity
  let worstCombo = ''
  let failures = 0

  for (const [industry, companySet] of Object.entries(INDUSTRY_COMPANIES)) {
    for (const size of SIZES) {
      for (const rev of REVS) {
        const cellUsers = allUsers.filter(u => companySet.has(u.company) && u.companySize === size && u.annualRevenue === rev)
        for (const sol of SOLUTIONS) {
          const count = cellUsers.filter(u => {
            try { return JSON.parse(u.solutionsSeeking || '[]').includes(sol) } catch { return false }
          }).length
          if (count < worstCount) {
            worstCount = count
            worstCombo = `${industry} | ${size} | ${rev} | ${sol}`
          }
          if (count < 7) failures++
        }
      }
    }
  }

  console.log(`Worst combo: ${worstCombo} → ${worstCount} results`)
  console.log(failures === 0
    ? '✓ All Industry × Size × Revenue × Solution combos have 7+ attendees'
    : `⚠️  ${failures} combos still under 7`)

  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
