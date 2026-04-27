// Creates users to ensure every Industry × Size × Revenue × Role combo
// has at least 8 users, each seeking diverse solutions.
// This guarantees any filter combination returns 7+ results.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SOLUTIONS = [
  'Email Marketing', 'SMS Marketing', 'Loyalty & Rewards', 'Subscription Management',
  'Returns Management', 'Customer Support', 'Shipping & Fulfillment', 'Inventory Management',
  'Analytics & Reporting', 'Payment Processing', 'Search & Discovery', 'ERP / Operations',
  'Personalization', 'Reviews & UGC', 'Marketplace Integration', 'B2B Commerce',
  'Headless Commerce', 'AI & Automation',
]

const COMPANY_SIZES = ['STARTUP', 'SMB', 'MIDMARKET', 'ENTERPRISE']
const REVENUE_RANGES = ['<1M', '1M-10M', '10M-50M', '50M-250M', '250M+']

// Companies per industry (used for getIndustry mapping)
const INDUSTRY_COMPANIES = {
  'Fashion & Apparel':     ['Everlane','Allbirds','Reformation','Vuori','Stitch Fix','Faherty Brand','Warby Parker',"Rothy's",'Rent the Runway','Outdoor Voices','True Classic','Quince','Cotopaxi','Buck Mason','Cuyana'],
  'Beauty & Cosmetics':    ['Glossier','ColourPop','Fenty Beauty DTC','Milk Makeup','Kosas','IL MAKIAGE','Saie Beauty','Tower 28','Haus Labs','Ilia Beauty','Tarte Cosmetics','NARS DTC','Charlotte Tilbury DTC','Morphe','Too Faced DTC'],
  'Skincare':              ['Tatcha','Drunk Elephant',"Paula's Choice",'Glow Recipe','Tula Skincare','Beautycounter','Biossance','Sunday Riley DTC','Herbivore Botanicals','CeraVe DTC','Versed','The Detox Market','COSRX','Ordinary DTC','SK-II DTC'],
  'Health & Wellness':     ['Peloton DTC','Whoop','Oura','Roman Health','Hims & Hers','AG1 (Athletic Greens)','Therabody','Calm','Eight Sleep','Hyperice','Tonal','Wahoo Fitness','NordicTrack DTC','Mirror DTC','Headspace DTC'],
  'Food & Beverage':       ['Magic Spoon','Poppi','Goldbelly','Brightland','Milk Bar DTC',"Jeni's Ice Cream",'Levain Bakery DTC','Burlap & Barrel','Sugarfina','Vosges','Diaspora Co','Jacobsen Salt','Baked by Melissa DTC','Compartés','Salt & Straw DTC'],
  'Home & Lifestyle':      ['Brooklinen','Parachute Home','Article','Tuft & Needle','Boll & Branch','Helix Sleep','Floyd','Snowe','Burrow','Hawkins NY','Albany Park','Joybird','Year & Day','Coyuchi','Schoolhouse'],
  'Jewelry & Accessories': ['Mejuri','Gorjana','Ana Luisa','Missoma','Studs','Aurate','Baublebar','MVMT','Alex and Ani','Monica Vinader','Catbird','Vrai','Olive & Piper','Pandora DTC','EyeBuyDirect'],
  'Pet':                   ["The Farmer's Dog",'BarkBox DTC','Ollie','Open Farm','Wild One','Spot & Tango','Sundays for Dogs','A Pup Above'],
  'Kids & Baby':           ['4moms DTC','BIBS','Ergobaby DTC','Kyte Baby','Little Sleepies'],
  'Technology':            ['Shopify','BigCommerce','Klaviyo','Yotpo','Gorgias','Recharge','Attentive','Postscript','LoyaltyLion','Rebuy','Okendo','Northbeam','Triple Whale','Skio','Malomo'],
}

const TITLE_POOLS = [
  ['Founder', 'Co-Founder', 'Founder & CEO'],
  ['CEO', 'COO', 'CMO', 'CTO', 'CFO'],
  ['VP of eCommerce', 'VP of Marketing', 'VP of Growth', 'SVP of Commerce', 'VP of Operations', 'VP of Product'],
  ['Director of eCommerce', 'Director of Marketing', 'Director of Operations', 'Director of Product', 'Director of Analytics'],
  ['Head of Marketing', 'Head of eCommerce', 'Head of DTC', 'Head of Partnerships', 'Head of Technology'],
  ['Sr. Manager of eCommerce', 'Manager of Digital Marketing', 'Sr. Manager of Operations', 'Manager of Analytics'],
]

const FIRST_NAMES = ['Alex','Sam','Jordan','Taylor','Morgan','Casey','Riley','Quinn','Avery','Cameron','Drew','Blake','Reese','Skyler','Dakota','Hayden','Peyton','Rowan','Sage','Finley','Emery','Kendall','Harper','Logan','Parker','Addison','Bailey','Charlie','Eden','Jamie','Jesse','Kai','Lee','Max','Nico','River','Shay','Tatum','Val','Wren']
const LAST_NAMES = ['Chen','Kim','Park','Singh','Patel','Garcia','Lopez','Martinez','Lee','Nguyen','Williams','Brown','Jones','Miller','Davis','Wilson','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Moore','Clark','Lewis','Walker','Hall','Young','Allen','King','Wright','Hill','Scott','Green','Adams','Baker','Nelson','Carter','Mitchell','Perez','Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins']

const MIN_PER_CELL = 12

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)] }

// For each user index in a cell (0-7), pick 3-4 solutions that rotate through all 18
function pickSeeking(cellUserIdx) {
  const count = 3 + (cellUserIdx % 2) // 3 or 4
  const start = (cellUserIdx * 3) % SOLUTIONS.length
  const result = []
  for (let i = 0; i < count; i++) {
    result.push(SOLUTIONS[(start + i) % SOLUTIONS.length])
  }
  return result
}

function pickOffering(cellUserIdx) {
  return [SOLUTIONS[(cellUserIdx * 7 + 5) % SOLUTIONS.length]]
}

async function main() {
  const industries = Object.keys(INDUSTRY_COMPANIES)

  // ── Count existing users per cell ──────────────────────────────────────────
  // We need to map company → industry for existing users
  const companyToIndustry = {}
  for (const [industry, companies] of Object.entries(INDUSTRY_COMPANIES)) {
    for (const c of companies) companyToIndustry[c] = industry
  }

  const existingUsers = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] }, sponsorId: null },
    select: { id: true, role: true, company: true, companySize: true, annualRevenue: true, solutionsSeeking: true },
  })

  // Count per cell: industry × size × revenue (attendees only for main grid)
  const cellCounts = {} // key: `${industry}|${size}|${revenue}` → count
  for (const u of existingUsers) {
    if (u.role !== 'ATTENDEE') continue
    const industry = companyToIndustry[u.company] || 'Technology'
    const size = u.companySize || 'SMB'
    const revenue = u.annualRevenue || '1M-10M'
    const key = `${industry}|${size}|${revenue}`
    cellCounts[key] = (cellCounts[key] || 0) + 1
  }

  // ── Figure out how many users we need to create ────────────────────────────
  let totalNeeded = 0
  const cellsToFill = []

  for (const industry of industries) {
    for (const size of COMPANY_SIZES) {
      for (const revenue of REVENUE_RANGES) {
        const key = `${industry}|${size}|${revenue}`
        const have = cellCounts[key] || 0
        const need = Math.max(0, MIN_PER_CELL - have)
        if (need > 0) {
          cellsToFill.push({ industry, size, revenue, need, have })
          totalNeeded += need
        }
      }
    }
  }

  console.log(`Existing attendees: ${existingUsers.filter(u => u.role === 'ATTENDEE').length}`)
  console.log(`Cells needing fill: ${cellsToFill.length} of ${industries.length * COMPANY_SIZES.length * REVENUE_RANGES.length}`)
  console.log(`New users to create: ${totalNeeded}`)

  // ── Create missing users ───────────────────────────────────────────────────
  let created = 0
  for (const cell of cellsToFill) {
    const companies = INDUSTRY_COMPANIES[cell.industry]
    for (let i = 0; i < cell.need; i++) {
      const idx = cell.have + i
      const company = companies[idx % companies.length]
      const titlePool = TITLE_POOLS[idx % TITLE_POOLS.length]
      const title = titlePool[idx % titlePool.length]
      const firstName = FIRST_NAMES[(created * 7 + i) % FIRST_NAMES.length]
      const lastName = LAST_NAMES[(created * 3 + i) % LAST_NAMES.length]
      const name = `${firstName} ${lastName}`
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.r2.${created}@demo.wbr`
      const seeking = pickSeeking(idx)
      const offering = pickOffering(idx)

      await p.user.create({
        data: {
          name,
          email,
          role: 'ATTENDEE',
          company,
          jobTitle: title,
          companySize: cell.size,
          annualRevenue: cell.revenue,
          solutionsSeeking: JSON.stringify(seeking),
          solutionsOffering: JSON.stringify(offering),
        },
      })
      created++
    }
    if (created % 100 === 0 && created > 0) console.log(`  Created ${created}/${totalNeeded}...`)
  }
  console.log(`✓ Created ${created} new attendees`)

  // ── Also ensure SPEAKER coverage: at least 2 speakers per industry × size ──
  const speakerCells = {}
  for (const u of existingUsers) {
    if (u.role !== 'SPEAKER') continue
    const industry = companyToIndustry[u.company] || 'Technology'
    const size = u.companySize || 'SMB'
    const key = `${industry}|${size}`
    speakerCells[key] = (speakerCells[key] || 0) + 1
  }

  let speakersCreated = 0
  for (const industry of industries) {
    for (const size of COMPANY_SIZES) {
      const key = `${industry}|${size}`
      const have = speakerCells[key] || 0
      const need = Math.max(0, 2 - have)
      if (need === 0) continue
      const companies = INDUSTRY_COMPANIES[industry]
      for (let i = 0; i < need; i++) {
        const idx = have + i
        const company = companies[idx % companies.length]
        const title = rand(TITLE_POOLS[idx % 3]) // speakers get senior titles
        const firstName = FIRST_NAMES[(speakersCreated * 11 + 3) % FIRST_NAMES.length]
        const lastName = LAST_NAMES[(speakersCreated * 5 + 7) % LAST_NAMES.length]
        const revenue = REVENUE_RANGES[idx % REVENUE_RANGES.length]
        const seeking = pickSeeking(idx)

        await p.user.create({
          data: {
            name: `${firstName} ${lastName}`,
            email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}.spk.r2.${speakersCreated}@demo.wbr`,
            role: 'SPEAKER',
            company,
            jobTitle: title,
            companySize: size,
            annualRevenue: revenue,
            solutionsSeeking: JSON.stringify(seeking),
            solutionsOffering: JSON.stringify([SOLUTIONS[speakersCreated % SOLUTIONS.length]]),
          },
        })
        speakersCreated++
      }
    }
  }
  console.log(`✓ Created ${speakersCreated} new speakers`)

  // ── Verification ───────────────────────────────────────────────────────────
  console.log('\n=== Verification ===')
  const allUsers = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] }, sponsorId: null },
    select: { role: true, company: true, companySize: true, annualRevenue: true, solutionsSeeking: true },
  })

  const attendees = allUsers.filter(u => u.role === 'ATTENDEE')
  console.log(`Total attendees: ${attendees.length}`)
  console.log(`Total speakers: ${allUsers.filter(u => u.role === 'SPEAKER').length}`)

  // Check every Industry × Size × Revenue cell
  let failures = 0
  for (const industry of industries) {
    const indCompanies = new Set(INDUSTRY_COMPANIES[industry])
    for (const size of COMPANY_SIZES) {
      for (const revenue of REVENUE_RANGES) {
        const count = attendees.filter(u =>
          indCompanies.has(u.company) && u.companySize === size && u.annualRevenue === revenue
        ).length
        if (count < 7) {
          console.log(`  ⚠️  ${industry} | ${size} | ${revenue}: ${count}`)
          failures++
        }
      }
    }
  }

  if (failures === 0) console.log('✓ All Industry × Size × Revenue cells have 7+ attendees')
  else console.log(`⚠️  ${failures} cells still under 7`)

  // Check solutions coverage per industry
  let solFailures = 0
  for (const industry of industries) {
    const indCompanies = new Set(INDUSTRY_COMPANIES[industry])
    const indUsers = attendees.filter(u => indCompanies.has(u.company))
    for (const sol of SOLUTIONS) {
      const count = indUsers.filter(u => {
        try { return JSON.parse(u.solutionsSeeking || '[]').includes(sol) } catch { return false }
      }).length
      if (count < 3) {
        console.log(`  ⚠️  ${industry} seeking "${sol}": ${count}`)
        solFailures++
      }
    }
  }
  if (solFailures === 0) console.log('✓ Every industry has 3+ seekers for each solution')

  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
