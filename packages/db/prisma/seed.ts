import { PrismaClient } from '@prisma/client'
import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)
const SCRYPT_N = 4096
const SCRYPT_R = 8
const SCRYPT_P = 1

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const buf = (await scryptAsync(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })) as Buffer
  return `${buf.toString('hex')}.${salt}.${SCRYPT_N}`
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
  // 6 topics, 12 speakers each = 72 speakers
  const TOPICS = [
    'Commerce & Platforms',
    'Marketing & Growth',
    'Logistics & Operations',
    'AI & Data',
    'Payments & Security',
    'Brand & Experience',
  ] as const

  const speakerDefs: { id: string; name: string; bio: string; company: string; jobTitle: string; role: string; twitterHandle?: string; linkedinUrl?: string; photoUrl: string }[] = [
    // ── Commerce & Platforms (12) ──────────────────────────────────────────────
    { id: 'spk-1', name: 'Sarah Chen', bio: 'Principal engineer with 12 years of experience building distributed systems. Frequent conference speaker and open-source contributor.', company: 'CloudScale Inc.', jobTitle: 'Principal Engineer', role: TOPICS[0], twitterHandle: '@sarahchen', photoUrl: 'https://i.pravatar.cc/150?img=47' },
    { id: 'spk-5', name: 'Elena Rodriguez', bio: 'Expert in omnichannel retail strategy with a decade of experience transforming brick-and-mortar brands into digital-first powerhouses.', company: 'Shopify', jobTitle: 'VP of Commerce Strategy', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=5' },
    { id: 'spk-6', name: 'David Park', bio: 'Pioneering headless commerce architectures that power some of the fastest-growing DTC brands in North America.', company: 'BigCommerce', jobTitle: 'Director of Engineering', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=11' },
    { id: 'spk-12', name: 'Thomas Bergström', bio: 'Builds modern ERP systems that connect commerce, inventory, and finance for high-growth brands.', company: 'Tailor ERP', jobTitle: 'Head of Solutions', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=52' },
    { id: 'spk-25', name: 'Alex Nguyen', bio: 'Full-stack commerce developer and educator teaching brands how to build composable storefronts.', company: 'Shopify', jobTitle: 'Staff Developer Advocate', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=33' },
    { id: 'spk-32', name: 'Nathan Brooks', bio: 'Marketplace operations expert scaling multi-vendor platforms from startup to $100M+ GMV.', company: 'Faire', jobTitle: 'VP of Operations', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=56' },
    { id: 'spk-40', name: 'Chris Bennett', bio: 'Headless CMS pioneer enabling brands to deliver content-rich commerce experiences across every channel.', company: 'Contentful', jobTitle: 'Head of Commerce', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=63' },
    { id: 'spk-43', name: 'Ingrid Larsson', bio: 'B2B commerce strategist helping wholesale brands digitize their ordering and expand into DTC.', company: 'Centra', jobTitle: 'VP of Sales', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=37' },
    { id: 'spk-48', name: 'Finn O\'Connor', bio: 'Accessibility advocate ensuring ecommerce experiences are inclusive and WCAG-compliant.', company: 'Shopify', jobTitle: 'Accessibility Lead', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=67' },
    { id: 'spk-52', name: 'Victor Onyeka', bio: 'Marketplace integration specialist connecting brands to Amazon, Walmart, and emerging retail platforms.', company: 'ChannelAdvisor', jobTitle: 'VP of Partnerships', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=69' },
    { id: 'spk-58', name: 'Brian Foster', bio: 'Composable commerce architect helping enterprise brands break free from monolithic platforms.', company: 'commercetools', jobTitle: 'Solutions Architect', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=8' },
    { id: 'spk-68', name: 'Adrian Pope', bio: 'API-first commerce builder helping brands create custom storefronts with maximum flexibility.', company: 'Medusa', jobTitle: 'Co-Founder', role: TOPICS[0], photoUrl: 'https://i.pravatar.cc/150?img=20' },

    // ── Marketing & Growth (12) ────────────────────────────────────────────────
    { id: 'spk-9', name: 'Mei Lin Zhang', bio: 'Data scientist turned marketer, building predictive models that drive personalized customer journeys at scale.', company: 'Klaviyo', jobTitle: 'Senior Data Scientist', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=9' },
    { id: 'spk-14', name: 'Jamal Washington', bio: 'SMS and mobile marketing strategist who has driven $500M+ in attributable revenue for DTC brands.', company: 'Attentive', jobTitle: 'VP of Strategy', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=59' },
    { id: 'spk-21', name: 'Lucas Wright', bio: 'Social proof and customer marketing leader driving authentic brand advocacy through review programs.', company: 'Okendo', jobTitle: 'Director of Marketing', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=51' },
    { id: 'spk-23', name: 'Marco Rossi', bio: 'SMS marketing automation expert helping Shopify merchants achieve 25x+ ROI on text campaigns.', company: 'Postscript', jobTitle: 'Head of Growth', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=13' },
    { id: 'spk-26', name: 'Hannah Becker', bio: 'Conversion rate optimization expert who has run 10,000+ A/B tests across leading ecommerce brands.', company: 'BigCommerce', jobTitle: 'Head of CRO', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=27' },
    { id: 'spk-42', name: 'Tyler Robinson', bio: 'Loyalty and rewards program architect who has designed programs with 10M+ active members.', company: 'LoyaltyLion', jobTitle: 'Co-Founder', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=64' },
    { id: 'spk-45', name: 'Lena Fischer', bio: 'Influencer commerce strategist building scalable creator programs that drive authentic brand growth.', company: 'Grin', jobTitle: 'VP of Strategy', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=38' },
    { id: 'spk-47', name: 'Aaliyah Davis', bio: 'Email marketing automation specialist driving 30%+ of revenue through lifecycle campaigns.', company: 'Klaviyo', jobTitle: 'Head of Email Strategy', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=39' },
    { id: 'spk-50', name: 'Jordan Taylor', bio: 'Social commerce strategist building seamless shopping experiences within social media platforms.', company: 'Meta', jobTitle: 'Commerce Product Lead', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=68' },
    { id: 'spk-54', name: 'Daniel Okafor', bio: 'Performance marketing expert driving efficient customer acquisition through paid social and search.', company: 'Triple Whale', jobTitle: 'Head of Product', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=70' },
    { id: 'spk-60', name: 'Sean Murphy', bio: 'Retail media network builder helping brands monetize their first-party data through on-site advertising.', company: 'Criteo', jobTitle: 'Head of Retail Media', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=10' },
    { id: 'spk-67', name: 'Lily Hartwell', bio: 'Customer segmentation expert using machine learning to identify high-value cohorts for targeted campaigns.', company: 'Attentive', jobTitle: 'Director of Data Science', role: TOPICS[1], photoUrl: 'https://i.pravatar.cc/150?img=6' },

    // ── Logistics & Operations (12) ────────────────────────────────────────────
    { id: 'spk-7', name: 'Amira Hassan', bio: 'Supply chain optimization expert helping brands reduce fulfillment costs while improving delivery speed.', company: 'ShipStation', jobTitle: 'Head of Product', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=23' },
    { id: 'spk-8', name: 'Ryan Cooper', bio: 'Turned returns from a cost center into a growth engine for over 200 Shopify Plus brands.', company: 'Loop Returns', jobTitle: 'Co-Founder & CEO', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=53' },
    { id: 'spk-15', name: 'Sophie Dubois', bio: 'Post-purchase experience designer focused on turning shipping anxiety into brand loyalty moments.', company: 'Narvar', jobTitle: 'Head of Experience Design', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=32' },
    { id: 'spk-16', name: 'Kenji Tanaka', bio: 'Fulfillment network architect connecting brands with optimal 3PL partners across global markets.', company: 'Extensiv', jobTitle: 'CTO', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=60' },
    { id: 'spk-20', name: 'Nadia Petrova', bio: 'Shipment tracking and logistics expert helping brands deliver transparency and trust at every touchpoint.', company: 'AfterShip', jobTitle: 'Head of Product', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=26' },
    { id: 'spk-34', name: 'Samuel Adeyemi', bio: 'Cross-border commerce expert helping brands navigate international expansion, taxes, and logistics.', company: 'Global-e', jobTitle: 'Head of Strategy', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=58' },
    { id: 'spk-36', name: 'Andre Williams', bio: 'Warehouse automation specialist deploying robotics and AI to transform fulfillment center efficiency.', company: 'ShipBob', jobTitle: 'CTO', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=61' },
    { id: 'spk-46', name: 'Michael Chang', bio: 'Product information management expert enabling brands to sell consistently across 50+ channels.', company: 'Salsify', jobTitle: 'Director of Engineering', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=66' },
    { id: 'spk-49', name: 'Priyanka Sharma', bio: 'Warehouse management systems expert optimizing pick, pack, and ship operations for high-volume brands.', company: 'ShipStation', jobTitle: 'Director of Solutions', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=40' },
    { id: 'spk-56', name: 'Kevin Wu', bio: 'Inventory planning and demand forecasting expert helping brands eliminate stockouts and overstock.', company: 'Inventory Planner', jobTitle: 'CEO', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=7' },
    { id: 'spk-66', name: 'Omar Bakari', bio: 'Warehouse robotics engineer deploying autonomous systems that triple pick-and-pack throughput.', company: 'Locus Robotics', jobTitle: 'Head of Integrations', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=19' },
    { id: 'spk-71', name: 'Chiara Bianchi', bio: 'Omnichannel fulfillment strategist helping brands offer BOPIS, ship-from-store, and same-day delivery.', company: 'Manhattan Associates', jobTitle: 'Director of Product', role: TOPICS[2], photoUrl: 'https://i.pravatar.cc/150?img=36' },

    // ── AI & Data (12) ─────────────────────────────────────────────────────────
    { id: 'spk-2', name: 'Marcus Williams', bio: 'Leads the AI/ML platform team and has published research on large language models. Previously at Google Brain and OpenAI.', company: 'DeepTech Labs', jobTitle: 'Head of AI Platform', role: TOPICS[3], linkedinUrl: 'https://linkedin.com/in/marcuswilliams', photoUrl: 'https://i.pravatar.cc/150?img=12' },
    { id: 'spk-3', name: 'Priya Patel', bio: 'CTO of a fast-growing fintech startup passionate about developer experience, platform engineering, and engineering cultures that scale.', company: 'FinFlow', jobTitle: 'CTO', role: TOPICS[3], twitterHandle: '@priyapatel_dev', photoUrl: 'https://i.pravatar.cc/150?img=48' },
    { id: 'spk-17', name: 'Ava Mitchell', bio: 'Personalization expert using AI to create unique shopping experiences that increase AOV and lifetime value.', company: 'Rebuy Engine', jobTitle: 'Head of AI', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=45' },
    { id: 'spk-18', name: 'Ibrahim Koné', bio: 'Site search and merchandising specialist who has optimized product discovery for 500+ online retailers.', company: 'Searchspring', jobTitle: 'VP of Engineering', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=57' },
    { id: 'spk-24', name: 'Diana Okonkwo', bio: 'Cloud infrastructure strategist helping commerce brands scale globally with resilient architectures.', company: 'Google Cloud', jobTitle: 'Commerce Solutions Lead', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=43' },
    { id: 'spk-30', name: 'Patrick O\'Sullivan', bio: 'Retail analytics leader using data to predict trends, optimize inventory, and reduce markdowns.', company: 'SSENSE', jobTitle: 'Director of Analytics', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=55' },
    { id: 'spk-39', name: 'Zara Patel', bio: 'Customer data platform expert unifying first-party data to power hyper-personalized marketing.', company: 'Segment', jobTitle: 'Commerce Solutions Lead', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=35' },
    { id: 'spk-41', name: 'Naomi Watanabe', bio: 'Visual merchandising technologist using AI to optimize product imagery and increase click-through rates.', company: 'Cloudinary', jobTitle: 'Director of Product', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=36' },
    { id: 'spk-59', name: 'Ananya Gupta', bio: 'Voice commerce researcher exploring how conversational AI is reshaping how consumers discover and buy products.', company: 'Google Cloud', jobTitle: 'AI Research Lead', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=1' },
    { id: 'spk-62', name: 'Jake Morrison', bio: 'Headless commerce performance engineer obsessed with sub-second page loads and Core Web Vitals.', company: 'Vercel', jobTitle: 'Commerce DX Lead', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=16' },
    { id: 'spk-69', name: 'Samira Youssef', bio: 'Product recommendation engine architect using collaborative filtering to boost cross-sell revenue.', company: 'Nosto', jobTitle: 'Head of Engineering', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=21' },
    { id: 'spk-70', name: 'Ben Gallagher', bio: 'Retail analytics dashboard builder giving merchants real-time visibility into sales and inventory.', company: 'Looker', jobTitle: 'Commerce Analytics Lead', role: TOPICS[3], photoUrl: 'https://i.pravatar.cc/150?img=22' },

    // ── Payments & Security (12) ───────────────────────────────────────────────
    { id: 'spk-4', name: 'James Okafor', bio: 'Security researcher and ethical hacker who helps companies find and fix vulnerabilities. Runs a popular security podcast.', company: 'SecureFoundry', jobTitle: 'Security Researcher', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=15' },
    { id: 'spk-11', name: 'Fatima Al-Rashid', bio: 'Subscription commerce pioneer with deep expertise in recurring revenue models for consumer brands.', company: 'Recharge', jobTitle: 'VP of Growth', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=24' },
    { id: 'spk-19', name: 'Rachel Kim', bio: 'Subscription management innovator building the infrastructure that powers millions of recurring orders.', company: 'Skio', jobTitle: 'Co-Founder', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=25' },
    { id: 'spk-22', name: 'Aisha Johnson', bio: 'Relationship commerce strategist transforming one-time buyers into lifelong subscribers.', company: 'Ordergroove', jobTitle: 'VP of Customer Success', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=41' },
    { id: 'spk-28', name: 'Yuki Sato', bio: 'Payment systems architect with expertise in global payment orchestration and checkout optimization.', company: 'Stripe', jobTitle: 'Commerce Lead', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=17' },
    { id: 'spk-38', name: 'Oscar Hernandez', bio: 'Mobile commerce architect who has built apps driving 60%+ of revenue for major DTC brands.', company: 'Tapcart', jobTitle: 'VP of Engineering', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=62' },
    { id: 'spk-44', name: 'Rafael Santos', bio: 'Fraud prevention expert protecting ecommerce brands from chargebacks while maintaining frictionless checkout.', company: 'Signifyd', jobTitle: 'Head of Data Science', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=65' },
    { id: 'spk-53', name: 'Chloe Martin', bio: 'Customer retention strategist using behavioral data to reduce churn and increase lifetime value.', company: 'Recharge', jobTitle: 'Head of Retention', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=46' },
    { id: 'spk-57', name: 'Tamara Novak', bio: 'Checkout optimization specialist who has recovered millions in abandoned cart revenue for DTC brands.', company: 'Bold Commerce', jobTitle: 'VP of Product', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=50' },
    { id: 'spk-61', name: 'Rosa Fernandez', bio: 'Localization expert helping global brands adapt their storefronts for language, culture, and currency.', company: 'Weglot', jobTitle: 'Head of Commerce', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=2' },
    { id: 'spk-63', name: 'Ling Wei', bio: 'Cross-border payments specialist simplifying international transactions for commerce brands.', company: 'Adyen', jobTitle: 'VP of Commerce', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=3' },
    { id: 'spk-72', name: 'Derek Huang', bio: 'Commerce security expert protecting brands from account takeover, bot attacks, and payment fraud.', company: 'Signifyd', jobTitle: 'VP of Engineering', role: TOPICS[4], photoUrl: 'https://i.pravatar.cc/150?img=37' },

    // ── Brand & Experience (12) ────────────────────────────────────────────────
    { id: 'spk-10', name: 'Carlos Mendoza', bio: 'Customer experience strategist who has helped ecommerce brands achieve 95%+ CSAT scores through automation and empathy.', company: 'Gorgias', jobTitle: 'Head of CX Strategy', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=14' },
    { id: 'spk-13', name: 'Olivia Thompson', bio: 'Review and UGC expert helping brands leverage social proof to increase conversion rates by 30%+.', company: 'Yotpo', jobTitle: 'Director of Product', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=44' },
    { id: 'spk-27', name: 'Darius Jackson', bio: 'Brand storytelling strategist helping DTC companies build emotional connections that drive repeat purchases.', company: 'Glossier', jobTitle: 'VP of Brand', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=54' },
    { id: 'spk-29', name: 'Grace Obi', bio: 'Community commerce expert building the playbook for brands that turn customers into co-creators.', company: 'Depop', jobTitle: 'Head of Community', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=28' },
    { id: 'spk-31', name: 'Leila Ahmadi', bio: 'Beauty tech innovator building AR try-on experiences that have increased online beauty sales by 40%.', company: 'Kylie Cosmetics', jobTitle: 'Head of Digital Innovation', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=29' },
    { id: 'spk-33', name: 'Camille Laurent', bio: 'Luxury ecommerce strategist bridging the gap between high-touch retail and digital-first experiences.', company: 'Selfridges Digital', jobTitle: 'Head of Digital Commerce', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=30' },
    { id: 'spk-35', name: 'Emma Johansson', bio: 'Sustainability in commerce advocate helping brands build transparent, eco-friendly supply chains.', company: 'Allbirds', jobTitle: 'VP of Sustainability', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=31' },
    { id: 'spk-37', name: 'Mia Chen', bio: 'Content commerce expert building shoppable content strategies that blur the line between media and retail.', company: 'TikTok Shop', jobTitle: 'Head of Commerce Partnerships', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=34' },
    { id: 'spk-51', name: 'Esme Delacroix', bio: 'Luxury packaging and unboxing experience designer helping premium brands create memorable first impressions.', company: 'Packlane', jobTitle: 'Creative Director', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=42' },
    { id: 'spk-55', name: 'Isabella Moretti', bio: 'Product photography and visual commerce expert building immersive 3D and video shopping experiences.', company: 'Bambuser', jobTitle: 'Head of Live Commerce', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=49' },
    { id: 'spk-64', name: 'Hassan El-Amin', bio: 'Customer service AI builder creating chatbots that resolve 70%+ of support tickets without human intervention.', company: 'Gorgias', jobTitle: 'Head of AI', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=18' },
    { id: 'spk-65', name: 'Victoria Strand', bio: 'Sustainable fashion technologist building circular commerce platforms for resale and rental.', company: 'ThredUp', jobTitle: 'VP of Engineering', role: TOPICS[5], photoUrl: 'https://i.pravatar.cc/150?img=4' },
  ]

  console.log(`  Creating ${speakerDefs.length} speakers...`)
  const speakers = await Promise.all(
    speakerDefs.map(s =>
      prisma.speaker.upsert({
        where: { id: s.id },
        update: { role: s.role },
        create: {
          id: s.id,
          conferenceId: conf.id,
          name: s.name,
          bio: s.bio,
          company: s.company,
          jobTitle: s.jobTitle,
          role: s.role,
          twitterHandle: s.twitterHandle,
          linkedinUrl: s.linkedinUrl,
          photoUrl: s.photoUrl,
        },
      })
    )
  )

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
  const stephHash = await hashPassword('stephcurry')

  const demoUsers: { id: string; email: string; name: string; role: string; password: string; sponsorId?: string; company?: string; jobTitle?: string }[] = [
    { id: 'demo-admin-june', email: 'june@tailor.tech', name: 'June Cho', role: 'ORGANIZER', password: adminHash, sponsorId: 'cmngb2h4h0007vm28mbcpxjg5', company: 'Tailor', jobTitle: 'CEO' },
    { id: 'demo-attendee-steph', email: 'steph@curry.com', name: 'Steph Curry', role: 'ATTENDEE', password: stephHash, company: 'Golden State', jobTitle: 'Point Guard' },
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
  console.log(`   Demo accounts: ${demoUsers.length} (steph@curry.com/stephcurry, june@tailor.tech/admin123, staff@wbr.com/staff123, sponsor@shopify.com/sponsor123)`)
  console.log(`   Attendee users: ${attendeeUsers.length} (jordan@demo.com/demo123, etc.)`)
  console.log(`   Chat: General channel + members`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
