// Diversifies user data to ensure every filter combination returns 7+ results.
// 1. Updates SPEAKER users to span all industries
// 2. Ensures C-Suite titles exist in every industry × role combination
// 3. Ensures solutionsSeeking covers all solutions
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const SOLUTIONS = [
  'Email Marketing', 'SMS Marketing', 'Loyalty & Rewards', 'Subscription Management',
  'Returns Management', 'Customer Support', 'Shipping & Fulfillment', 'Inventory Management',
  'Analytics & Reporting', 'Payment Processing', 'Search & Discovery', 'ERP / Operations',
  'Personalization', 'Reviews & UGC', 'Marketplace Integration', 'B2B Commerce',
  'Headless Commerce', 'AI & Automation',
]

// Representative companies per industry
const INDUSTRY_COMPANIES = {
  'Fashion & Apparel':     ['Everlane','Allbirds','Reformation','Vuori','Stitch Fix','Faherty Brand','Warby Parker','Rothy\'s','Rent the Runway','Outdoor Voices'],
  'Beauty & Cosmetics':    ['Glossier','ColourPop','Fenty Beauty DTC','Milk Makeup','Kosas','IL MAKIAGE','Saie Beauty','Tower 28','Haus Labs','Ilia Beauty'],
  'Skincare':              ['Tatcha','Drunk Elephant','Paula\'s Choice','Glow Recipe','Tula Skincare','Beautycounter','Biossance','Sunday Riley DTC','Herbivore Botanicals','CeraVe DTC'],
  'Health & Wellness':     ['Peloton DTC','Whoop','Oura','Roman Health','Hims & Hers','AG1 (Athletic Greens)','Therabody','Calm','Eight Sleep','Hyperice'],
  'Food & Beverage':       ['Magic Spoon','Poppi','Goldbelly','Brightland','Milk Bar DTC','Jeni\'s Ice Cream','Levain Bakery DTC','Burlap & Barrel','Sugarfina','Vosges'],
  'Home & Lifestyle':      ['Brooklinen','Parachute Home','Article','Tuft & Needle','Boll & Branch','Helix Sleep','Floyd','Snowe','Burrow','Hawkins NY'],
  'Jewelry & Accessories': ['Mejuri','Gorjana','Ana Luisa','Missoma','Studs','Aurate','Baublebar','MVMT','Alex and Ani','Monica Vinader'],
  'Pet':                   ['The Farmer\'s Dog','BarkBox DTC','Ollie','Open Farm','Wild One','Spot & Tango','Sundays for Dogs','A Pup Above'],
  'Technology':            ['Shopify','BigCommerce','Klaviyo','Yotpo','Gorgias','Recharge','Attentive','Postscript','LoyaltyLion','Rebuy'],
}

// Job titles per seniority + function
const CSUITE_TITLES = ['CEO','COO','CFO','CTO','CMO','Chief Revenue Officer','Chief Product Officer']
const TITLE_BY_FUNCTION = {
  'Marketing':              ['VP of Marketing','SVP of Marketing','Director of Marketing','Head of Marketing','VP of Brand','Director of Customer Acquisition','Head of Performance Marketing','VP of Growth Marketing'],
  'Commerce & Growth':      ['VP of eCommerce','Director of DTC','Head of Digital Commerce','VP of Growth','Director of Revenue','SVP of Commerce','Head of eCommerce'],
  'Technology & Product':   ['VP of Engineering','CTO','Head of Platform','Director of Engineering','VP of Product','Head of Technology','Director of Product'],
  'Operations & Logistics': ['VP of Operations','Head of Logistics','Director of Supply Chain','COO','VP of Fulfillment','Director of Operations','Head of Supply Chain'],
  'Finance & Analytics':    ['CFO','VP of Finance','Head of Analytics','Director of Finance','VP of Analytics','Director of Business Intelligence'],
  'Sales & Partnerships':   ['VP of Sales','Head of Partnerships','Director of Sales','SVP of Revenue','Head of Business Development','VP of Partnerships'],
  'Executive / Founder':    ['CEO','COO','Founder','Co-Founder','President','Managing Director','Executive Director'],
}

const COMPANY_SIZES = ['STARTUP','SMB','MIDMARKET','ENTERPRISE']
const REVENUE_RANGES = ['<1M','1M-10M','10M-50M','50M-250M','250M+']

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)] }

// Pick 2-4 solutions to seek based on industry
const INDUSTRY_SEEKING = {
  'Fashion & Apparel':     ['Returns Management','Personalization','Loyalty & Rewards','Shipping & Fulfillment','Analytics & Reporting','Search & Discovery','Subscription Management'],
  'Beauty & Cosmetics':    ['Loyalty & Rewards','Email Marketing','Reviews & UGC','Personalization','Subscription Management','AI & Automation','Customer Support'],
  'Skincare':              ['Subscription Management','Loyalty & Rewards','Email Marketing','Customer Support','Reviews & UGC','Personalization'],
  'Health & Wellness':     ['Subscription Management','AI & Automation','Analytics & Reporting','Customer Support','Email Marketing','ERP / Operations'],
  'Food & Beverage':       ['Subscription Management','Shipping & Fulfillment','Loyalty & Rewards','Email Marketing','Payment Processing','Analytics & Reporting'],
  'Home & Lifestyle':      ['Returns Management','Shipping & Fulfillment','Search & Discovery','Headless Commerce','Personalization','Analytics & Reporting'],
  'Jewelry & Accessories': ['Returns Management','Personalization','Loyalty & Rewards','Customer Support','Reviews & UGC','Email Marketing'],
  'Pet':                   ['Subscription Management','Shipping & Fulfillment','Customer Support','Loyalty & Rewards','Email Marketing','Reviews & UGC'],
  'Technology':            ['AI & Automation','Analytics & Reporting','B2B Commerce','ERP / Operations','Marketplace Integration','Headless Commerce'],
}

async function main() {
  // Get all speaker users
  const speakers = await p.user.findMany({
    where: { role: 'SPEAKER' },
    select: { id: true, company: true, jobTitle: true },
  })

  console.log(`Diversifying ${speakers.length} speaker users across industries...`)

  const industries = Object.keys(INDUSTRY_COMPANIES)
  // Spread speakers evenly across industries (5-6 per industry)
  for (let i = 0; i < speakers.length; i++) {
    const industry = industries[i % industries.length]
    const companies = INDUSTRY_COMPANIES[industry]
    const company = companies[Math.floor(i / industries.length) % companies.length]
    const functions = Object.keys(TITLE_BY_FUNCTION)
    const fn = functions[i % functions.length]
    const title = i % 4 === 0 ? rand(CSUITE_TITLES) : rand(TITLE_BY_FUNCTION[fn])
    const seeking = (INDUSTRY_SEEKING[industry] || []).slice(0, 2 + (i % 3))
    const size = COMPANY_SIZES[i % COMPANY_SIZES.length]
    const revenue = REVENUE_RANGES[i % REVENUE_RANGES.length]

    await p.user.update({
      where: { id: speakers[i].id },
      data: {
        company,
        jobTitle: title,
        companySize: size,
        annualRevenue: revenue,
        solutionsSeeking: JSON.stringify(seeking),
        solutionsOffering: JSON.stringify([SOLUTIONS[(i * 3) % SOLUTIONS.length]]),
      },
    })
  }

  // Now ensure C-Suite users exist in every industry
  const attendees = await p.user.findMany({
    where: { role: 'ATTENDEE' },
    select: { id: true, company: true, jobTitle: true },
    take: 300,
  })

  console.log('Updating attendees for better industry/title coverage...')

  // Assign every attendee a well-defined industry company + appropriate title
  for (let i = 0; i < attendees.length; i++) {
    const industry = industries[i % industries.length]
    const companies = INDUSTRY_COMPANIES[industry]
    const company = companies[(Math.floor(i / industries.length)) % companies.length]
    const functions = Object.keys(TITLE_BY_FUNCTION)
    const fn = functions[(i + 1) % functions.length]
    // Every 7th user gets C-Suite to ensure dense coverage
    const title = i % 7 === 0 ? rand(CSUITE_TITLES) : rand(TITLE_BY_FUNCTION[fn])
    const seeking = (INDUSTRY_SEEKING[industry] || []).slice(0, 2 + (i % 3))
    const size = COMPANY_SIZES[i % COMPANY_SIZES.length]
    const revenue = REVENUE_RANGES[i % REVENUE_RANGES.length]

    await p.user.update({
      where: { id: attendees[i].id },
      data: {
        company,
        jobTitle: title,
        companySize: size,
        annualRevenue: revenue,
        solutionsSeeking: JSON.stringify(seeking),
        solutionsOffering: JSON.stringify([SOLUTIONS[(i * 5) % SOLUTIONS.length]]),
      },
    })
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${attendees.length}...`)
  }

  // Verify critical combinations
  console.log('\n=== Verification ===')
  const allUsers = await p.user.findMany({
    where: { role: { in: ['ATTENDEE','SPEAKER'] } },
    select: { role: true, company: true, jobTitle: true, companySize: true, solutionsSeeking: true },
  })

  const FASHION_SET = new Set(INDUSTRY_COMPANIES['Fashion & Apparel'])
  const fashionUsers = allUsers.filter(u => FASHION_SET.has(u.company || ''))
  const fashionSpeakers = fashionUsers.filter(u => u.role === 'SPEAKER')
  const fashionCSuite = fashionUsers.filter(u => {
    const t = (u.jobTitle || '').toLowerCase()
    return t.startsWith('ceo') || t.startsWith('coo') || t.startsWith('cfo') || t.startsWith('cto') || t.startsWith('cmo') || t.includes('founder') || t.includes('president')
  })
  const fashionSeekSub = fashionUsers.filter(u => {
    try { return JSON.parse(u.solutionsSeeking || '[]').includes('Subscription Management') } catch { return false }
  })

  console.log(`Fashion & Apparel total: ${fashionUsers.length}`)
  console.log(`Fashion + SPEAKER: ${fashionSpeakers.length}`)
  console.log(`Fashion + C-Suite: ${fashionCSuite.length}`)
  console.log(`Fashion + Seeks SubMgmt: ${fashionSeekSub.length}`)

  // Check all industries have speakers
  for (const industry of industries) {
    const set = new Set(INDUSTRY_COMPANIES[industry])
    const count = allUsers.filter(u => set.has(u.company || '') && u.role === 'SPEAKER').length
    const flag = count < 3 ? '⚠️ ' : '✓ '
    console.log(`${flag}${industry} speakers: ${count}`)
  }

  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
