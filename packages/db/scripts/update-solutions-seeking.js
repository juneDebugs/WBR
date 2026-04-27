// Assigns each ATTENDEE/SPEAKER exactly 3-5 new-format solutions from solutionsSeeking,
// ensuring every solution has between 8 and 23 unique seekers.

const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

const ALL_SOLUTIONS = [
  'Affiliate Marketing Solutions','Consumer Sentiment & Reviews','Content Marketing Solutions',
  'Creative & Design Services','Digital Marketing Services','Email Marketing Solutions',
  'Influencer Marketing Solutions','Location Based Marketing Solutions','Loyalty & Rewards (inc. Rebates) Solutions',
  'Marketing Analytics','Marketing Automation Platforms','Marketing Campaign Management',
  'Marketing Personalization Solutions','Media Buying Services','Mobile, App & SMS Marketing Solutions',
  'Multichannel Marketing Platforms','Retargeting Solutions','Search Engine Optimization & Marketing (SEO & SEM)',
  'Social Media Marketing Solutions','Video Marketing Solutions',
  'Artificial Intelligence (inc. Machine Learning)','Business Intelligence Tools','Data Visualization Tools',
  'In-Store Analytics','Predictive Analytics','Product Data Management Solutions','Web & App Analytics',
  'B2B Ecommerce Platforms','Cross-Border Ecommerce Platforms','Ecommerce Platforms',
  'Marketplace Platforms','Mobile & App Commerce Platforms','Social Commerce Platforms',
  'Augmented Reality & Virtual Reality','Content Production Services & Solutions',
  'Product Information Management (PIM) Solutions','Shoppable Video & Livestreaming Solutions',
  'Site Personalization Solutions','Site Search Solutions',
  'Translation & Localization Services','Web Performance & Security Solutions',
  'Associate Mobility Solutions','Automated Retail Solutions','In-Store Solutions','POS Hardware & Peripherals',
  'BNPL, Customer Installment Lending & Financing Solutions','Fraud Detection & Risk Management Solutions',
  'Merchant Services Solutions','Mobile POS Solutions','Mobile Wallets & Payments Solutions',
  'POS Solutions','Subscription Management & Recurring Payment Solutions',
  'Clienteling Solutions','Customer Data Platforms','Customer Feedback Solutions',
  'Customer Relationship Management (CRM) Solutions','Live Chat, Chatbots & Virtual Assistants Solutions',
  'Loyalty Management Solutions',
  'Data Architecture & Infrastructure Solutions','Data Integrity & Cybersecurity Solutions','Data Management Platforms',
  'Category Management Solutions','Competitive Pricing Insights & Solutions',
  'Delivery (inc. Last Mile) & Pickup Solutions','Forecasting & Replenishment Solutions',
  'Fulfillment Solutions','Inventory Management Systems',
  'Inventory Planning & Optimization Tools','Merchandising Analytics',
  'Merchandising Assortment Planning & Management','Order Management Systems',
  'Price Optimization Solutions','Product Lifecycle Management (PLM) Solutions',
  'Returns Solutions','Sourcing Solutions & Services',
  'Supply Chain Management Software','Sustainability Solutions',
  'Third Party Logistics (3PL) Services','Warehouse & Distribution Center Management',
  'Consultancy & Advisory Services','Market Research & Analysis Services',
  'Back Office & Financial Solutions','HR & Payroll Solutions',
]

const TARGET_PER_SOLUTION = 15 // target 15 seekers per solution (range 8-23)
const SOLUTIONS_PER_USER = 4  // each user seeks ~4 solutions

async function main() {
  const users = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { id: true, company: true },
    orderBy: { id: 'asc' },
  })

  console.log(`${users.length} users, ${ALL_SOLUTIONS.length} solutions`)
  console.log(`Target: ${TARGET_PER_SOLUTION} seekers per solution`)

  // Total slots needed: 83 solutions × 15 = 1245 assignments
  // Each user gets ~4 solutions, so we need ~311 users assigned
  // With 2520 users, most will have empty solutionsSeeking (which is fine)

  // First clear all
  await p.user.updateMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    data: { solutionsSeeking: '[]' },
  })

  // Build assignment: for each solution, pick TARGET_PER_SOLUTION unique users
  const userAssignments = {} // userId -> [solutions]
  for (const u of users) userAssignments[u.id] = []

  const usedCompanies = {} // solution -> Set of companies (ensure unique brands)

  for (let si = 0; si < ALL_SOLUTIONS.length; si++) {
    const sol = ALL_SOLUTIONS[si]
    usedCompanies[sol] = new Set()
    let assigned = 0

    // Spread across users deterministically using prime offsets
    const start = (si * 31) % users.length
    for (let j = 0; j < users.length && assigned < TARGET_PER_SOLUTION; j++) {
      const idx = (start + j * 17) % users.length
      const u = users[idx]

      // Skip if user already has too many solutions
      if (userAssignments[u.id].length >= 6) continue
      // Skip if same company already assigned to this solution
      if (u.company && usedCompanies[sol].has(u.company)) continue

      userAssignments[u.id].push(sol)
      if (u.company) usedCompanies[sol].add(u.company)
      assigned++
    }
  }

  // Write to DB
  let updated = 0
  for (const [userId, solutions] of Object.entries(userAssignments)) {
    if (solutions.length === 0) continue
    await p.user.update({
      where: { id: userId },
      data: { solutionsSeeking: JSON.stringify(solutions) },
    })
    updated++
  }
  console.log(`Updated ${updated} users`)

  // Verify
  const finalUsers = await p.user.findMany({
    where: { role: { in: ['ATTENDEE', 'SPEAKER'] } },
    select: { solutionsSeeking: true },
  })

  const counts = {}
  for (const s of ALL_SOLUTIONS) counts[s] = 0
  for (const u of finalUsers) {
    try {
      for (const s of JSON.parse(u.solutionsSeeking || '[]')) {
        if (counts[s] !== undefined) counts[s]++
      }
    } catch {}
  }

  let ok = 0, fail = 0
  for (const [sol, count] of Object.entries(counts)) {
    if (count >= 8 && count <= 23) ok++
    else {
      console.log(`  ⚠️  ${sol}: ${count}`)
      fail++
    }
  }
  console.log(`\n✓ ${ok} solutions in range (8-23)`)
  if (fail > 0) console.log(`⚠️  ${fail} solutions out of range`)

  await p.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
