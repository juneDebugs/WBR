import { PrismaClient } from '../packages/db/node_modules/@prisma/client'

const prisma = new PrismaClient({
  datasources: { db: { url: 'file:/Users/june/WBR/packages/db/prisma/dev.db' } },
})

// Map speaker roles to session tracks
const ROLE_TO_TRACKS: Record<string, string[]> = {
  'AI & Data': ['AI & Machine Learning', 'Data & Analytics'],
  'Commerce & Platforms': ['Technology', 'Commerce', 'Enterprise & B2B'],
  'Marketing & Growth': ['Marketing', 'Retention & Subscriptions'],
  'Logistics & Fulfillment': ['Operations & Fulfillment', 'Customer Experience'],
  'Payments & Checkout': ['Payments & Checkout', 'International & Marketplace'],
  'Brand & Experience': ['Customer Experience', 'Retention & Subscriptions', 'Marketing'],
  'Security & Infrastructure': ['Technology', 'Security'],
  'ERP': ['Enterprise & B2B', 'Data & Analytics', 'Operations & Fulfillment'],
}

// Session templates per role for creating new sessions
const SESSION_TEMPLATES: Record<string, { titles: string[]; types: string[] }> = {
  'AI & Data': {
    titles: [
      'Machine Learning for Product Discovery: Patterns That Convert',
      'Building Real-Time Recommendation Engines for Commerce',
      'NLP in Commerce: From Search to Conversational Shopping',
      'Predictive Analytics for Customer Lifetime Value',
      'Computer Vision in Retail: Visual Search & Style Matching',
      'AI-Powered Pricing: Dynamic Strategies That Maximize Margin',
      'Voice Commerce & Conversational AI: The Next Frontier',
      'Data Pipelines for Real-Time Commerce Intelligence',
    ],
    types: ['TALK', 'TALK', 'WORKSHOP', 'TALK', 'TALK', 'WORKSHOP', 'TALK', 'TALK'],
  },
  'Commerce & Platforms': {
    titles: [
      'Composable Commerce: Architecting for Flexibility at Scale',
      'Headless Storefronts: Performance, SEO & Developer Experience',
      'Multi-Tenant Marketplace Architecture: Lessons Learned',
      'API-First Commerce: Building Blocks for Modern Retail',
      'Migrating to Headless: A Practical Playbook',
      'Commerce Platform Showdown: Choosing the Right Stack',
      'Accessibility in Commerce: Building Inclusive Shopping Experiences',
      'Progressive Web Apps for Commerce: Offline-First Shopping',
    ],
    types: ['TALK', 'TALK', 'TALK', 'WORKSHOP', 'TALK', 'PANEL', 'TALK', 'WORKSHOP'],
  },
  'Marketing & Growth': {
    titles: [
      'SMS Marketing at Scale: Automation That Feels Personal',
      'Influencer-Led Commerce: From Awareness to Conversion',
      'Lifecycle Email Campaigns That Drive 30%+ Revenue',
      'CRO Deep Dive: A/B Testing Frameworks for Ecommerce',
      'Retail Media Networks: Monetizing First-Party Data',
      'Loyalty Programs That Actually Drive Repeat Purchases',
      'Attribution in a Post-Cookie World: New Measurement Models',
      'Content Commerce: Building Shoppable Media Experiences',
    ],
    types: ['TALK', 'TALK', 'WORKSHOP', 'TALK', 'TALK', 'TALK', 'WORKSHOP', 'TALK'],
  },
  'Logistics & Fulfillment': {
    titles: [
      'Warehouse Robotics: Automating Pick, Pack & Ship',
      'Last-Mile Delivery Innovation: Speed vs. Cost Tradeoffs',
      'Returns Management: Turning Costs into Revenue',
      'Global Fulfillment Networks: Scaling Beyond Borders',
      'Real-Time Shipment Visibility & Customer Communication',
      'Omnichannel Fulfillment: BOPIS, Ship-from-Store & Same-Day',
      '3PL Selection & Optimization for High-Growth Brands',
      'Sustainable Shipping: Reducing Carbon in the Last Mile',
    ],
    types: ['TALK', 'TALK', 'TALK', 'WORKSHOP', 'TALK', 'TALK', 'WORKSHOP', 'TALK'],
  },
  'Payments & Checkout': {
    titles: [
      'One-Click Checkout: Reducing Friction to Zero',
      'Subscription Billing: Building Resilient Recurring Revenue',
      'Cross-Border Payments: Simplifying International Commerce',
      'Fraud Detection Without Customer Friction',
      'Buy Now Pay Later: Impact on Conversion & AOV',
      'Checkout Optimization: Recovering Abandoned Revenue',
      'Payment Orchestration: Multi-PSP Strategies for Global Brands',
      'Mobile Payments & Wallet Commerce: The Tap Economy',
    ],
    types: ['TALK', 'TALK', 'TALK', 'WORKSHOP', 'TALK', 'TALK', 'WORKSHOP', 'TALK'],
  },
  'Brand & Experience': {
    titles: [
      'Building Brand Communities That Drive Organic Growth',
      'Unboxing as Marketing: Packaging That Goes Viral',
      'UGC & Reviews: Leveraging Social Proof at Scale',
      'AR/VR in Commerce: Immersive Shopping Experiences',
      'Luxury Ecommerce: Translating High-Touch to Digital',
      'Storytelling for DTC: Emotional Branding That Converts',
      'Customer Experience Design: From Browse to Post-Purchase',
      'Social Proof Optimization: Reviews, Ratings & Beyond',
    ],
    types: ['TALK', 'TALK', 'TALK', 'WORKSHOP', 'TALK', 'TALK', 'WORKSHOP', 'TALK'],
  },
  'Security & Infrastructure': {
    titles: [
      'Zero Trust for Commerce: Securing Customer Data at Scale',
      'Performance Engineering: Sub-Second Page Loads for Commerce',
      'Bot Protection: Defending Against Scraping & Credential Stuffing',
      'CDN & Edge Computing for Global Commerce Performance',
      'Sustainable Commerce: Building Eco-Friendly Digital Infrastructure',
      'Social Commerce Security: Protecting Transactions in Social Platforms',
      'Compliance & Data Privacy in Cross-Border Commerce',
      'Incident Response for Ecommerce: Minimizing Downtime Impact',
    ],
    types: ['TALK', 'TALK', 'WORKSHOP', 'TALK', 'TALK', 'TALK', 'TALK', 'WORKSHOP'],
  },
  'ERP': {
    titles: [
      'Modern ERP Integration: Connecting Commerce to Back-Office',
      'Inventory Planning with Demand Forecasting Models',
      'PIM for Multi-Channel: Consistent Product Data Everywhere',
      'B2B Commerce Digitization: From Catalogs to Self-Service Portals',
      'Retail Analytics Dashboards: Real-Time Visibility for Merchants',
      'Localization at Scale: Language, Currency & Cultural Adaptation',
      'Cross-Border Compliance: Navigating Duties, Taxes & Regulations',
      'Composable ERP: Breaking the Monolith for Agile Operations',
    ],
    types: ['TALK', 'TALK', 'TALK', 'WORKSHOP', 'TALK', 'TALK', 'WORKSHOP', 'TALK'],
  },
}

// Conference schedule time slots (Unix ms) - distribute across 2 days
const TIME_SLOTS = [
  // Day 1
  { start: 1807116300000, end: 1807119000000 }, // 9:45 AM - 10:30 AM
  { start: 1807118100000, end: 1807120800000 }, // 10:15 AM - 11:00 AM
  { start: 1807120800000, end: 1807123500000 }, // 11:00 AM - 11:45 AM
  { start: 1807128000000, end: 1807130700000 }, // 1:00 PM - 1:45 PM
  { start: 1807131600000, end: 1807134300000 }, // 2:00 PM - 2:45 PM
  { start: 1807134300000, end: 1807137000000 }, // 2:45 PM - 3:30 PM
  { start: 1807137000000, end: 1807139700000 }, // 3:30 PM - 4:15 PM
  // Day 2
  { start: 1807202700000, end: 1807205400000 }, // 9:45 AM - 10:30 AM
  { start: 1807204500000, end: 1807207200000 }, // 10:15 AM - 11:00 AM
  { start: 1807207200000, end: 1807209900000 }, // 11:00 AM - 11:45 AM
  { start: 1807214400000, end: 1807217100000 }, // 1:00 PM - 1:45 PM
  { start: 1807217100000, end: 1807219800000 }, // 1:45 PM - 2:30 PM
  { start: 1807220700000, end: 1807223400000 }, // 2:30 PM - 3:15 PM
  { start: 1807223400000, end: 1807226100000 }, // 3:15 PM - 4:00 PM
]

const ROOMS = ['Main Stage', 'Hall A', 'Hall B', 'Workshop Room A', 'Workshop Room B', 'Room C']

async function main() {
  const conferenceId = 'conf-2025'

  // Get speakers without sessions
  const speakersWithoutSessions = await prisma.speaker.findMany({
    where: {
      conferenceId,
      confSessions: { none: {} },
    },
    select: { id: true, name: true, role: true, bio: true },
    orderBy: { name: 'asc' },
  })

  console.log(`Found ${speakersWithoutSessions.length} speakers without sessions`)

  // Get unassigned non-break sessions
  const unassignedSessions = await prisma.confSession.findMany({
    where: {
      conferenceId,
      speakerId: null,
      type: { not: 'BREAK' },
    },
    orderBy: { startsAt: 'asc' },
  })

  console.log(`Found ${unassignedSessions.length} unassigned sessions`)

  // Step 1: Assign existing unassigned sessions to matching speakers
  const assignedSpeakerIds = new Set<string>()
  const assignedSessionIds = new Set<string>()

  for (const session of unassignedSessions) {
    if (!session.track) continue

    // Find a speaker whose role matches this session's track
    const matchingSpeaker = speakersWithoutSessions.find(s => {
      if (assignedSpeakerIds.has(s.id)) return false
      const tracks = ROLE_TO_TRACKS[s.role ?? ''] ?? []
      return tracks.includes(session.track!)
    })

    if (matchingSpeaker) {
      await prisma.confSession.update({
        where: { id: session.id },
        data: { speakerId: matchingSpeaker.id },
      })
      assignedSpeakerIds.add(matchingSpeaker.id)
      assignedSessionIds.add(session.id)
      console.log(`Assigned "${session.title}" to ${matchingSpeaker.name}`)
    }
  }

  console.log(`\nAssigned ${assignedSpeakerIds.size} existing sessions`)

  // Step 2: Create new sessions for remaining speakers
  const remainingSpeakers = speakersWithoutSessions.filter(s => !assignedSpeakerIds.has(s.id))
  console.log(`\nCreating sessions for ${remainingSpeakers.length} remaining speakers`)

  const templateCounters: Record<string, number> = {}
  let slotIndex = 0

  for (const speaker of remainingSpeakers) {
    const role = speaker.role ?? 'Commerce & Platforms'
    const templates = SESSION_TEMPLATES[role] ?? SESSION_TEMPLATES['Commerce & Platforms']

    if (!templateCounters[role]) templateCounters[role] = 0
    const idx = templateCounters[role] % templates.titles.length
    templateCounters[role]++

    const slot = TIME_SLOTS[slotIndex % TIME_SLOTS.length]
    const room = ROOMS[slotIndex % ROOMS.length]
    slotIndex++

    const tracks = ROLE_TO_TRACKS[role] ?? ['Technology']
    const track = tracks[idx % tracks.length]

    // Generate description from speaker bio
    const desc = `Join ${speaker.name} for an in-depth exploration of ${templates.titles[idx].toLowerCase().replace(/:/g, ' —')}. ${speaker.bio ?? ''}`

    await prisma.confSession.create({
      data: {
        conferenceId,
        title: templates.titles[idx],
        description: desc,
        speakerId: speaker.id,
        room,
        startsAt: new Date(slot.start),
        endsAt: new Date(slot.end),
        track,
        type: templates.types[idx],
      },
    })

    console.log(`Created "${templates.titles[idx]}" for ${speaker.name} (${role})`)
  }

  // Verify
  const finalCount = await prisma.speaker.count({
    where: {
      conferenceId,
      confSessions: { none: {} },
    },
  })

  console.log(`\nDone! Speakers still without sessions: ${finalCount}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
