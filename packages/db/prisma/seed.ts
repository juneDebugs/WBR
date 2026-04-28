import { PrismaClient } from '@prisma/client'
import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const buf = (await scryptAsync(password, salt, 64)) as Buffer
  return `${buf.toString('hex')}.${salt}`
}

function createPrismaClient(): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (tursoUrl && tursoToken && tursoUrl.startsWith('libsql://')) {
    try {
      const { PrismaLibSQL } = require('@prisma/adapter-libsql')
      const { createClient: createLibsql } = require('@libsql/client')
      const libsql = createLibsql({ url: tursoUrl, authToken: tursoToken })
      const adapter = new PrismaLibSQL(libsql)
      console.log('🌐 Connected to Turso (production)')
      return new PrismaClient({ adapter } as any)
    } catch (e: any) {
      console.error('[seed] Turso adapter failed, using local:', e?.message)
    }
  }

  console.log('💾 Using local SQLite')
  return new PrismaClient()
}

const prisma = createPrismaClient()

async function main() {
  // ── Conference ──────────────────────────────────────────────────────────────
  const conf = await prisma.conference.upsert({
    where: { id: 'conf-2025' },
    update: {},
    create: {
      id: 'conf-2025',
      name: 'WBR 2027',
      description: 'The premier technology conference of the year.',
      startDate: new Date('2027-04-07T09:00:00Z'),
      endDate: new Date('2027-04-08T18:00:00Z'),
      venue: 'Convention Center, San Francisco',
      active: true,
    },
  })

  // ── Speakers ───────────────────────────────────────────────────────────────
  const speakers = await Promise.all([
    prisma.speaker.upsert({
      where: { id: 'spk-1' },
      update: {},
      create: {
        id: 'spk-1',
        conferenceId: conf.id,
        name: 'Sarah Chen',
        bio: 'Sarah is a principal engineer at a major cloud provider with 12 years of experience building distributed systems. She is a frequent speaker at industry conferences and a contributor to several open-source projects.',
        company: 'CloudScale Inc.',
        jobTitle: 'Principal Engineer',
        twitterHandle: '@sarahchen',
        photoUrl: 'https://i.pravatar.cc/150?img=47',
      },
    }),
    prisma.speaker.upsert({
      where: { id: 'spk-2' },
      update: {},
      create: {
        id: 'spk-2',
        conferenceId: conf.id,
        name: 'Marcus Williams',
        bio: 'Marcus leads the AI/ML platform team and has published research on large language models. Previously at Google Brain and OpenAI.',
        company: 'DeepTech Labs',
        jobTitle: 'Head of AI Platform',
        linkedinUrl: 'https://linkedin.com/in/marcuswilliams',
        photoUrl: 'https://i.pravatar.cc/150?img=12',
      },
    }),
    prisma.speaker.upsert({
      where: { id: 'spk-3' },
      update: {},
      create: {
        id: 'spk-3',
        conferenceId: conf.id,
        name: 'Priya Patel',
        bio: 'Priya is the CTO of a fast-growing fintech startup. She is passionate about developer experience, platform engineering, and building engineering cultures that scale.',
        company: 'FinFlow',
        jobTitle: 'CTO',
        twitterHandle: '@priyapatel_dev',
        photoUrl: 'https://i.pravatar.cc/150?img=48',
      },
    }),
    prisma.speaker.upsert({
      where: { id: 'spk-4' },
      update: {},
      create: {
        id: 'spk-4',
        conferenceId: conf.id,
        name: 'James Okafor',
        bio: 'James is a security researcher and ethical hacker who helps companies find and fix vulnerabilities before attackers do. He runs a popular security podcast.',
        company: 'SecureFoundry',
        jobTitle: 'Security Researcher',
        photoUrl: 'https://i.pravatar.cc/150?img=15',
      },
    }),
  ])

  // ── Sessions — Day 1 & 2 ──────────────────────────────────────────────────
  const day1 = '2025-09-15'
  const day2 = '2025-09-16'

  const sessions = await Promise.all([
    prisma.confSession.upsert({
      where: { id: 'ses-1' },
      update: {},
      create: {
        id: 'ses-1', conferenceId: conf.id,
        title: 'Opening Keynote: The Future of Cloud-Native Development',
        description: 'A look at where distributed systems are heading and what developers need to know.',
        speakerId: speakers[0].id, room: 'Main Hall',
        startsAt: new Date(`${day1}T09:00:00Z`), endsAt: new Date(`${day1}T10:00:00Z`),
        type: 'KEYNOTE', track: 'Platform',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-2' },
      update: {},
      create: {
        id: 'ses-2', conferenceId: conf.id,
        title: 'Building LLM Applications at Scale',
        description: 'Practical patterns for integrating large language models into production systems.',
        speakerId: speakers[1].id, room: 'Room A',
        startsAt: new Date(`${day1}T10:30:00Z`), endsAt: new Date(`${day1}T11:30:00Z`),
        type: 'TALK', track: 'AI/ML',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-3' },
      update: {},
      create: {
        id: 'ses-3', conferenceId: conf.id,
        title: 'Platform Engineering: From Pain to Product',
        description: 'How to turn your internal developer platform into something teams actually want to use.',
        speakerId: speakers[2].id, room: 'Room B',
        startsAt: new Date(`${day1}T10:30:00Z`), endsAt: new Date(`${day1}T11:30:00Z`),
        type: 'TALK', track: 'Platform',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-4' },
      update: {},
      create: {
        id: 'ses-4', conferenceId: conf.id,
        title: 'Lunch Break', room: 'Atrium',
        startsAt: new Date(`${day1}T12:00:00Z`), endsAt: new Date(`${day1}T13:00:00Z`),
        type: 'BREAK',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-5' },
      update: {},
      create: {
        id: 'ses-5', conferenceId: conf.id,
        title: 'Attacking Modern Web Applications',
        description: 'A hands-on workshop covering OWASP Top 10 and modern attack vectors.',
        speakerId: speakers[3].id, room: 'Workshop Room',
        startsAt: new Date(`${day1}T13:00:00Z`), endsAt: new Date(`${day1}T15:00:00Z`),
        type: 'WORKSHOP', track: 'Security',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-6' },
      update: {},
      create: {
        id: 'ses-6', conferenceId: conf.id,
        title: 'Day 2 Keynote: Engineering at Scale',
        description: 'Lessons learned from scaling a fintech platform to millions of users.',
        speakerId: speakers[2].id, room: 'Main Hall',
        startsAt: new Date(`${day2}T09:00:00Z`), endsAt: new Date(`${day2}T10:00:00Z`),
        type: 'KEYNOTE', track: 'Platform',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-7' },
      update: {},
      create: {
        id: 'ses-7', conferenceId: conf.id,
        title: 'Zero Trust Architecture in Practice',
        description: 'Implementing zero-trust security models without grinding your engineering team to a halt.',
        speakerId: speakers[3].id, room: 'Room A',
        startsAt: new Date(`${day2}T10:30:00Z`), endsAt: new Date(`${day2}T11:30:00Z`),
        type: 'TALK', track: 'Security',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-8' },
      update: {},
      create: {
        id: 'ses-8', conferenceId: conf.id,
        title: 'Fine-Tuning LLMs for Domain-Specific Tasks',
        description: 'A deep-dive into fine-tuning strategies, evaluation, and deployment.',
        speakerId: speakers[1].id, room: 'Room B',
        startsAt: new Date(`${day2}T10:30:00Z`), endsAt: new Date(`${day2}T11:30:00Z`),
        type: 'TALK', track: 'AI/ML',
      },
    }),
  ])

  // ── Time blocks ────────────────────────────────────────────────────────────
  const tbDays = ['2025-09-15', '2025-09-16']
  const tbSlots: [number, number][] = [
    [18, 0], [18, 30],
    [19, 0], [19, 30],
    [20, 0], [20, 30],
    [21, 0], [21, 30],
    [22, 0], [22, 30],
  ]

  await prisma.timeBlock.deleteMany({ where: { conferenceId: conf.id } })

  const timeBlocks = await Promise.all(
    tbDays.flatMap((day, dayIdx) =>
      tbSlots.map(([h, m], slotIdx) => {
        const id = `tb-d${dayIdx + 1}-s${slotIdx + 1}`
        const pad = (n: number) => String(n).padStart(2, '0')
        const endM = m + 30
        const endH = endM >= 60 ? h + 1 : h
        const startsAt = new Date(`${day}T${pad(h)}:${pad(m)}:00.000Z`)
        const endsAt   = new Date(`${day}T${pad(endH)}:${pad(endM % 60)}:00.000Z`)
        return prisma.timeBlock.upsert({
          where: { id },
          update: { startsAt, endsAt },
          create: { id, conferenceId: conf.id, startsAt, endsAt, location: 'Networking Lounge', capacity: 1 },
        })
      })
    )
  )

  // ── General chat channel ───────────────────────────────────────────────────
  await prisma.chatRoom.upsert({
    where: { id: 'room-general' },
    update: {},
    create: { id: 'room-general', name: 'General', type: 'CHANNEL' },
  })

  // ── Sponsors ───────────────────────────────────────────────────────────────
  const sponsorDefs: { id: string; name: string; tier: string; website?: string; tagline?: string; description?: string; boothNumber?: string }[] = [
    { id: 'cmngb2h4h0000vm28ssjt1m0z', name: 'Shopify', tier: 'PLATINUM', website: 'https://shopify.com', tagline: 'Making commerce better for everyone', description: 'Shopify is a leading global commerce company providing trusted tools to start, grow, market, and manage a retail business of any size.', boothNumber: 'P1' },
    { id: 'cmngb2h4h0001vm2889slafvy', name: 'BigCommerce', tier: 'PLATINUM', website: 'https://bigcommerce.com', tagline: 'The open SaaS ecommerce platform', description: 'BigCommerce is the open SaaS ecommerce platform that empowers merchants and manufacturers to innovate and grow.', boothNumber: 'P2' },
    { id: 'cmngb2h4h0007vm28mbcpxjg5', name: 'Tailor ERP', tier: 'PLATINUM', website: 'https://tailor.tech', tagline: 'Modern ERP for DTC brands', description: 'Tailor is a modern ERP platform purpose-built for high-growth DTC and commerce brands.', boothNumber: 'P3' },
    { id: 'cmngb2h4h0002vm28jsro8se9', name: 'ShipStation', tier: 'GOLD', website: 'https://shipstation.com', tagline: 'Shipping made easy', description: 'ShipStation helps ecommerce retailers import, organize, and ship orders efficiently from any channel.', boothNumber: 'G1' },
    { id: 'cmngb2h4h0003vm281j76qc4e', name: 'Loop Returns', tier: 'GOLD', website: 'https://loopreturns.com', tagline: 'Returns that drive growth', description: 'Loop Returns helps Shopify brands retain more revenue by turning returns into exchanges.', boothNumber: 'G2' },
    { id: 'cmngb2h4h0004vm28nn3rme1o', name: 'Klaviyo', tier: 'GOLD', website: 'https://klaviyo.com', tagline: 'The smart marketing automation platform', description: 'Klaviyo powers smarter digital relationships with intelligent marketing automation for email, SMS, and more.', boothNumber: 'G3' },
    { id: 'cmngb2h4h0005vm28mg7g52fh', name: 'Gorgias', tier: 'GOLD', website: 'https://gorgias.com', tagline: 'Customer service for ecommerce', description: 'Gorgias is the helpdesk built for ecommerce merchants, centralizing all support conversations.', boothNumber: 'G4' },
    { id: 'cmngb2h4h0006vm28enbuld34', name: 'Recharge', tier: 'GOLD', website: 'https://rechargepayments.com', tagline: 'Powering subscriptions for DTC', description: 'Recharge is the leading subscription payments platform helping ecommerce brands turn transactions into relationships.', boothNumber: 'G5' },
    { id: 'cmngb2h4h0008vm28i6338gp9', name: 'Yotpo', tier: 'SILVER', website: 'https://yotpo.com', tagline: 'eCommerce retention marketing', description: 'Yotpo is an eCommerce retention marketing platform with solutions for reviews, loyalty, SMS, email, and subscriptions.' },
    { id: 'cmngb2h4h0009vm28no2j8b6p', name: 'Attentive', tier: 'SILVER', website: 'https://attentive.com', tagline: 'Personalized mobile messaging', description: 'Attentive is the most comprehensive personalized text messaging solution for innovative brands and organizations.' },
    { id: 'cmngb2h4h000avm28j2vs0j0k', name: 'Postscript', tier: 'SILVER', website: 'https://postscript.io', tagline: 'SMS marketing for Shopify', description: 'Postscript makes SMS marketing easy for Shopify merchants with powerful automation and segmentation.' },
    { id: 'cmngb2h4h000cvm28dh6mc5bh', name: 'Narvar', tier: 'SILVER', website: 'https://narvar.com', tagline: 'Post-purchase experience platform', description: 'Narvar drives customer loyalty with a post-purchase platform that covers shipping, tracking, and returns.' },
    { id: 'cmngb2h4h000dvm289vmdaki3', name: 'Extensiv', tier: 'SILVER', website: 'https://extensiv.com', tagline: 'Omnichannel fulfillment platform', description: 'Extensiv is an omnichannel fulfillment platform connecting brands with a network of 3PLs and warehouses.' },
    { id: 'cmngbix6w0001fwpj6dwlwyri', name: 'Google Cloud', tier: 'SILVER', website: 'https://cloud.google.com', tagline: 'Cloud computing services', description: 'Google Cloud provides a suite of cloud computing services for data analytics, machine learning, and infrastructure.' },
    { id: 'cmngb2h4h000evm286epvlnxs', name: 'Okendo', tier: 'BRONZE', website: 'https://okendo.io', tagline: 'Customer review platform', description: 'Okendo is a customer review platform that helps brands capture and display high-impact social proof.' },
    { id: 'cmngb2h4h000fvm28fzk7rs4l', name: 'Ordergroove', tier: 'BRONZE', website: 'https://ordergroove.com', tagline: 'Relationship commerce', description: 'Ordergroove powers recurring revenue through its relationship commerce platform for subscriptions.' },
    { id: 'cmngb2h4h000gvm28202yjuux', name: 'Skio', tier: 'BRONZE', website: 'https://skio.com', tagline: 'Subscriptions for Shopify', description: 'Skio is a modern subscription management platform designed for Shopify brands.' },
    { id: 'cmngb2h4h000hvm28vn41ytgc', name: 'AfterShip', tier: 'BRONZE', website: 'https://aftership.com', tagline: 'Shipment tracking platform', description: 'AfterShip provides shipment tracking and delivery updates for ecommerce businesses worldwide.' },
    { id: 'cmngb2h4h000ivm281ido85fq', name: 'Searchspring', tier: 'BRONZE', website: 'https://searchspring.com', tagline: 'Site search & merchandising', description: 'Searchspring powers site search, merchandising, and personalization for ecommerce retailers.' },
    { id: 'cmngb2h4h000jvm28zwqqu86h', name: 'Rebuy Engine', tier: 'BRONZE', website: 'https://rebuyengine.com', tagline: 'Personalization for Shopify', description: 'Rebuy Engine provides AI-powered personalization for Shopify stores to increase AOV and conversion.' },
  ]

  console.log(`  Creating ${sponsorDefs.length} sponsors...`)
  for (const s of sponsorDefs) {
    await prisma.sponsor.upsert({
      where: { id: s.id },
      update: { name: s.name, tier: s.tier },
      create: {
        id: s.id,
        conferenceId: conf.id,
        name: s.name,
        tier: s.tier,
        website: s.website,
        tagline: s.tagline,
        description: s.description,
        boothNumber: s.boothNumber,
      },
    })
  }

  // ── Demo users (login page accounts) ───────────────────────────────────────
  // These are the accounts shown on each app's login page.
  // Web app requires password + STAFF/ORGANIZER role.
  // Other apps use email-only but users still need correct roles/sponsorId.

  const adminHash = await hashPassword('admin123')
  const staffHash = await hashPassword('staff123')
  const demoHash = await hashPassword('demo123')
  const sponsorHash = await hashPassword('sponsor123')

  const demoUsers: { id: string; email: string; name: string; role: string; password: string; sponsorId?: string; company?: string; jobTitle?: string }[] = [
    { id: 'demo-admin-june', email: 'june@tailor.tech', name: 'June Cho', role: 'ORGANIZER', password: adminHash, sponsorId: 'cmngb2h4h0007vm28mbcpxjg5', company: 'Tailor', jobTitle: 'CEO' },
    { id: 'demo-staff', email: 'staff@wbr.com', name: 'WBR Staff', role: 'STAFF', password: staffHash, company: 'WBR', jobTitle: 'Event Coordinator' },
    { id: 'demo-sponsor-shopify', email: 'sponsor@shopify.com', name: 'Shopify Rep', role: 'ATTENDEE', password: sponsorHash, sponsorId: 'cmngb2h4h0000vm28ssjt1m0z', company: 'Shopify', jobTitle: 'Partner Manager' },
    { id: 'demo-sponsor-klaviyo', email: 'sponsor@klaviyo.com', name: 'Klaviyo Rep', role: 'ATTENDEE', password: sponsorHash, sponsorId: 'cmngb2h4h0004vm28nn3rme1o', company: 'Klaviyo', jobTitle: 'Account Executive' },
  ]

  // Helper: upsert user by email, handling existing IDs gracefully
  async function upsertUser(data: { id: string; email: string; name: string; role: string; password?: string; sponsorId?: string; company?: string; jobTitle?: string }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      await prisma.user.update({
        where: { email: data.email },
        data: {
          name: data.name,
          role: data.role,
          ...(data.password ? { password: data.password } : {}),
          ...(data.sponsorId !== undefined ? { sponsorId: data.sponsorId } : {}),
          ...(data.company ? { company: data.company } : {}),
          ...(data.jobTitle ? { jobTitle: data.jobTitle } : {}),
        },
      })
      return
    }
    // No user with this email — check if the ID is taken
    const byId = await prisma.user.findUnique({ where: { id: data.id } })
    if (byId) {
      // ID exists with a different email — update it
      await prisma.user.update({
        where: { id: data.id },
        data: {
          email: data.email,
          name: data.name,
          role: data.role,
          ...(data.password ? { password: data.password } : {}),
          ...(data.sponsorId !== undefined ? { sponsorId: data.sponsorId } : {}),
          ...(data.company ? { company: data.company } : {}),
          ...(data.jobTitle ? { jobTitle: data.jobTitle } : {}),
        },
      })
      return
    }
    // Neither exists — create
    await prisma.user.create({
      data: {
        id: data.id,
        email: data.email,
        name: data.name,
        role: data.role,
        password: data.password,
        sponsorId: data.sponsorId,
        company: data.company,
        jobTitle: data.jobTitle,
      },
    })
  }

  console.log(`  Creating ${demoUsers.length} demo accounts...`)
  for (const u of demoUsers) {
    await upsertUser(u)
  }

  // ── Attendee users (for seed-meetings data) ────────────────────────────────
  // These users are referenced by hardcoded IDs in seed-meetings.ts.
  // They must exist before running seed-meetings.

  const attendeeUsers: { id: string; email: string; name: string; company: string; jobTitle: string }[] = [
    { id: 'cmnf5o3zh0000o6gl8ph6p741', email: 'jordan@demo.com', name: 'Jordan Lee', company: 'Arhaus DTC', jobTitle: 'VP Sales' },
    { id: 'cmnf5o3zk0003o6gl1dkbwyba', email: 'maya.patel@urbandecay.com', name: 'Maya Patel', company: 'Urban Decay', jobTitle: 'Head of DTC' },
    { id: 'cmnf5o3zm0006o6gljz3rs2fi', email: 'chris.nakamura@noihsaf.com', name: 'Chris Nakamura', company: 'Noihsaf Bazaar', jobTitle: 'VP Customer Success' },
    { id: 'cmnf5o3zo0009o6gloybowz8b', email: 'aaliyah.brooks@entireworld.com', name: 'Aaliyah Brooks', company: 'Entireworld', jobTitle: 'VP Growth' },
    { id: 'cmnf5o3zq000co6gl2ahjeodc', email: 'sam.torres@boohoo.com', name: 'Sam Torres', company: 'Boohoo DTC', jobTitle: 'VP Engineering' },
    { id: 'cmnf5o3zt000fo6glimp8sdgg', email: 'priya.singh@selfridges.com', name: 'Priya Singh', company: 'Selfridges Digital', jobTitle: 'Digital Lead' },
    { id: 'cmnf5o3zv000io6gldzpvj2ep', email: 'daniel.kim@colourpop.com', name: 'Daniel Kim', company: 'ColourPop', jobTitle: 'Head of Finance' },
    { id: 'cmnf5o3zx000lo6glvu1jfhtq', email: 'zoe.andersen@yearandday.com', name: 'Zoe Andersen', company: 'Year & Day', jobTitle: 'VP Revenue' },
    { id: 'cmnf5o3zy000oo6glzil6hssh', email: 'marcus.bell@4moms.com', name: 'Marcus Bell', company: '4moms DTC', jobTitle: 'Head of Retention' },
    { id: 'cmnf5o400000ro6glk0vwyxke', email: 'leila.hassan@romanhealth.com', name: 'Leila Hassan', company: 'Roman Health', jobTitle: 'COO' },
    { id: 'cmnf5o401000uo6gl5arc1yns', email: 'tom.eriksen@oliveandpiper.com', name: 'Tom Eriksen', company: 'Olive & Piper', jobTitle: 'eCommerce Strategist' },
    { id: 'cmnf5o403000xo6glueacjfk4', email: 'nina.vasquez@ouraring.com', name: 'Nina Vasquez', company: 'Oura', jobTitle: 'Director of Marketplace' },
    { id: 'cmnf5o4050010o6gly4ukzmah', email: 'kwesi.owusu@skii.com', name: 'Kwesi Owusu', company: 'SK-II DTC', jobTitle: 'CEO' },
    { id: 'cmnf5o4060013o6glxmcmr2r8', email: 'hana.suzuki@ssense.com', name: 'Hana Suzuki', company: 'SSENSE', jobTitle: 'VP Growth' },
    { id: 'cmnf5o4080016o6glvytz0mcq', email: 'felix.wagner@cedarandmoss.com', name: 'Felix Wagner', company: 'Cedar & Moss', jobTitle: 'Founder' },
    { id: 'cmnf5o4090019o6gl06nnhzc0', email: 'amara.diallo@depop.com', name: 'Amara Diallo', company: 'Depop', jobTitle: 'VP Revenue' },
    { id: 'cmnf5o40b001co6gl8j8dafx3', email: 'ryan.obrien@beautycounter.com', name: "Ryan O'Brien", company: 'Beautycounter', jobTitle: 'COO' },
    { id: 'cmnf5o40c001fo6gljtwj9gk5', email: 'sophie.muller@boohoo-eu.com', name: 'Sophie Müller', company: 'Boohoo DTC', jobTitle: 'Co-Founder' },
    { id: 'cmnf5o40e001io6glgvzi0wil', email: 'james.osei@glossier.com', name: 'James Osei', company: 'Glossier', jobTitle: 'Director of Retail' },
    { id: 'cmnf5o40g001lo6gld2txewt2', email: 'chloe.beaumont@kyliecosmetics.com', name: 'Chloe Beaumont', company: 'Kylie Cosmetics', jobTitle: 'Head of Wholesale' },
  ]

  console.log(`  Creating ${attendeeUsers.length} attendee users...`)
  for (const u of attendeeUsers) {
    await upsertUser({ ...u, role: 'ATTENDEE', password: demoHash })
  }

  // Add all attendee users to General chat
  const general = await prisma.chatRoom.findFirst({ where: { type: 'CHANNEL', name: 'General' } })
  if (general) {
    const allUserEmails = [...demoUsers.map(u => u.email), ...attendeeUsers.map(u => u.email)]
    const allUsers = await prisma.user.findMany({ where: { email: { in: allUserEmails } }, select: { id: true } })
    for (const u of allUsers) {
      await prisma.chatMember.upsert({
        where: { roomId_userId: { roomId: general.id, userId: u.id } },
        update: {},
        create: { roomId: general.id, userId: u.id },
      }).catch(() => {}) // ignore if already exists
    }
  }

  console.log('✅ Seed complete')
  console.log(`   Conference: ${conf.name}`)
  console.log(`   Speakers: ${speakers.length}`)
  console.log(`   Sessions: ${sessions.length}`)
  console.log(`   Time blocks: ${timeBlocks.length}`)
  console.log(`   Sponsors: ${sponsorDefs.length}`)
  console.log(`   Demo accounts: ${demoUsers.length} (june@tailor.tech/admin123, staff@wbr.com/staff123, sponsor@shopify.com/sponsor123, sponsor@klaviyo.com/sponsor123)`)
  console.log(`   Attendee users: ${attendeeUsers.length} (jordan@demo.com/demo123, etc.)`)
  console.log(`   Chat: General channel + members`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
