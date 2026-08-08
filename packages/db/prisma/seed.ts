import { PrismaClient } from '@prisma/client'
import { SPONSOR_DEFS, sponsorCreateFields, sponsorUpdateFields } from './seed-sponsors'
// Both are safe to import here even though this file builds its own Prisma
// client: ../src/gate-demo-sponsor.ts imports nothing at all, and
// ../src/meeting-engine.ts is self-contained by its own stated rule (type-only
// imports, client always injected by the caller).
import { GATE_DEMO_SPONSOR, GATE_DEMO_SPONSOR_ID } from '../src/gate-demo-sponsor'
import { saveMeetingRequirementSettings } from '../src/meeting-engine'
import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'util'

const scryptAsync = promisify(scrypt)
const SCRYPT_N = 2048
const SCRYPT_R = 8
const SCRYPT_P = 1

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const buf = (await (scryptAsync as any)(password, salt, 64, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })) as Buffer
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

// ── Professional headshot photos for attendee profiles ───────────────────────
// Curated Unsplash portraits — business professional, face in frame, diverse
const HEADSHOT_PHOTOS = [
  // Women
  'photo-1494790108377-be9c29b29330', 'photo-1438761681033-6461ffad8d80',
  'photo-1534528741775-53994a69daeb', 'photo-1544005313-94ddf0286df2',
  'photo-1580489944761-15a19d654956', 'photo-1573496359142-b8d87734a5a2',
  'photo-1573497019940-1c28c88b4f3e', 'photo-1573497491207-618cc224f243',
  'photo-1508214751196-bcfd4ca60f91', 'photo-1567532939604-b6b5b0db2604',
  'photo-1614644147798-f8c0fc9da7f6', 'photo-1611432579699-484f7990b127',
  'photo-1619369056679-87b6fbfac1be', 'photo-1608875848903-06eec0bd71e2',
  'photo-1581065178047-8ee15951ede6', 'photo-1632612721400-0a337458b7ed',
  'photo-1666983998531-622f19bca9a8', 'photo-1617554980793-009061cdbb4f',
  'photo-1607746882042-944635dfe10e', 'photo-1531746020798-e6953c6e8e04',
  'photo-1488426862026-3ee34a7d66df', 'photo-1529626455594-4ff0802cfb7e',
  'photo-1594744803329-e58b31239f44', 'photo-1598550874175-4d0ef436c909',
  'photo-1487412720507-e7ab37603c6f', 'photo-1558898479-33c0057a5d12',
  'photo-1609371497456-3a55a205d5eb', 'photo-1762522921456-cdfe882d36c3',
  'photo-1745434159123-5b99b94206ca', 'photo-1758518729459-235dcaadc611',
  'photo-1765005204268-631d9e0c6fe1', 'photo-1770058443069-e384cd001e9b',
  'photo-1758598306845-8630d064a244', 'photo-1758600587839-56ba05596c69',
  'photo-1758691737605-69a0e78bd193', 'photo-1758600432948-5cec2a3fecb9',
  'photo-1697083882499-f7fca7d2d713', 'photo-1668049221651-28a3fb151f19',
  'photo-1760543998147-117ae5649c5c', 'photo-1753120879121-678c3d42542e',
  'photo-1699899657680-421c2c2d5064', 'photo-1765005204058-10418f5123c5',
  'photo-1765005204227-bf58bcdd4449', 'photo-1745434159123-af6142c7862f',
  'photo-1758600588428-2cca8c96bfba', 'photo-1764971591006-b6eb67a8f0cb',
  'photo-1762522926157-bcc04bf0b10a', 'photo-1595152772835-219674b2a8e6',
  'photo-1552058544-f2b08422138a', 'photo-1589571894960-20bbe2828d0a',
  // Men
  'photo-1507003211169-0a1dd7228f2d', 'photo-1500648767791-00dcc994a43e',
  'photo-1472099645785-5658abf4ff4e', 'photo-1506794778202-cad84cf45f1d',
  'photo-1556157382-97eda2d62296', 'photo-1560250097-0b93528c311a',
  'photo-1519085360753-af0119f7cbe7', 'photo-1618077360395-f3068be8e001',
  'photo-1600878459108-617a253537e9', 'photo-1633625510483-c177f4308f33',
  'photo-1566492031773-4f4e44671857', 'photo-1539571696357-5a69c17a67c6',
  'photo-1633332755192-727a05c4013d', 'photo-1564564321837-a57b7070ac4f',
  'photo-1568602471122-7832951cc4c5', 'photo-1492562080023-ab3db95bfbce',
  'photo-1463453091185-61582044d556', 'photo-1596075780750-81249df16d19',
  'photo-1600486913747-55e5470d6f40', 'photo-1590086783191-a0694c7d1e6e',
  'photo-1651684215020-f7a5b6610f23', 'photo-1758600436605-7e43ac56f707',
  'photo-1741455620227-3b1c51e01419', 'photo-1758518729286-e8d94cc231f5',
  'photo-1738566061883-1b568c74b550', 'photo-1757744705465-ea08b0ddc38a',
  'photo-1758598304332-94b40ce7c7b4', 'photo-1769636929261-e913ed023c83',
  'photo-1614023342667-6f060e9d1e04', 'photo-1758600587815-b654d1405e83',
  'photo-1758518729058-b158e71c5a9b', 'photo-1764545973653-94c40d993495',
  'photo-1762522926262-d96de462ad54', 'photo-1770452603217-89b4f03e8271',
  'photo-1718392372850-84ccd5d36e7a', 'photo-1758598307313-bae7b2d84255',
  'photo-1762522928601-862bf2a04902', 'photo-1580411415491-a672219c801b',
  'photo-1769636929231-3cd7f853d038', 'photo-1639747279286-c07eecb47a0b',
  'photo-1646658104783-2eec2433c1d1', 'photo-1625850902501-cc6baef3e3b2',
  'photo-1679476819592-3e233227fd83', 'photo-1713947507130-227586ab3024',
  'photo-1653327876541-95133a48158c', 'photo-1650490323009-96fc950a959c',
  'photo-1600896997793-b8ed3459a17f', 'photo-1733231291455-3c4de1c24e20',
  'photo-1745434159123-4908d0b9df94', 'photo-1756699269843-eb2ea51f1adf',
  'photo-1504257432389-52343af06ae3', 'photo-1570295999919-56ceb5ecca61',
]

function attendeeHeadshot(index: number): string {
  const id = HEADSHOT_PHOTOS[index % HEADSHOT_PHOTOS.length]
  return `https://images.unsplash.com/${id}?w=400&h=400&q=80&fit=crop&crop=face`
}

async function main() {
  // ── Conference ──────────────────────────────────────────────────────────────
  const conf = await prisma.conference.upsert({
    where: { id: 'conf-2025' },
    update: {
      startDate: new Date('2027-04-06T09:00:00Z'),
      endDate: new Date('2027-04-07T18:00:00Z'),
    },
    create: {
      id: 'conf-2025',
      name: 'WBR 2027',
      description: 'The premier technology conference of the year.',
      startDate: new Date('2027-04-06T09:00:00Z'),
      endDate: new Date('2027-04-07T18:00:00Z'),
      venue: 'Convention Center, San Francisco',
      active: true,
    },
  })

  // ── Speakers ───────────────────────────────────────────────────────────────
  // 8 topics, 9 speakers each = 72 speakers
  const TOPICS = [
    'ERP',
    'Commerce & Platforms',
    'Marketing & Growth',
    'Logistics & Fulfillment',
    'AI & Data',
    'Payments & Checkout',
    'Brand & Experience',
    'Security & Infrastructure',
  ] as const

  const speakerDefs: { id: string; name: string; bio: string; company: string; jobTitle: string; role: string; twitterHandle?: string; linkedinUrl?: string; photoUrl: string; photoPosition?: string }[] = [
    // ── ERP (9) ───────────────────────────────────────────────────────────────
    { id: 'spk-12', name: 'Thomas Bergström', bio: 'Builds modern ERP systems that connect commerce, inventory, and finance for high-growth brands.', company: 'Tailor ERP', jobTitle: 'Head of Solutions', role: TOPICS[0], photoUrl: 'https://images.unsplash.com/photo-1651684215020-f7a5b6610f23?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-3', name: 'Priya Patel', bio: 'CTO of a fast-growing fintech startup passionate about developer experience, platform engineering, and engineering cultures that scale.', company: 'FinFlow', jobTitle: 'CTO', role: TOPICS[0], twitterHandle: '@priyapatel_dev', photoUrl: 'https://images.unsplash.com/photo-1758600436605-7e43ac56f707?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-30', name: 'Patrick O\'Sullivan', bio: 'Retail analytics leader using data to predict trends, optimize inventory, and reduce markdowns.', company: 'SSENSE', jobTitle: 'Director of Analytics', role: TOPICS[0], photoUrl: 'https://images.unsplash.com/photo-1741455620227-3b1c51e01419?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-46', name: 'Michael Chang', bio: 'Product information management expert enabling brands to sell consistently across 50+ channels.', company: 'Salsify', jobTitle: 'Director of Engineering', role: TOPICS[0], photoUrl: 'https://images.unsplash.com/photo-1758518729286-e8d94cc231f5?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-56', name: 'Kevin Wu', bio: 'Inventory planning and demand forecasting expert helping brands eliminate stockouts and overstock.', company: 'Inventory Planner', jobTitle: 'CEO', role: TOPICS[0], photoUrl: 'https://images.unsplash.com/photo-1738566061883-1b568c74b550?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 30%' },
    { id: 'spk-70', name: 'Ben Gallagher', bio: 'Retail analytics dashboard builder giving merchants real-time visibility into sales and inventory.', company: 'Looker', jobTitle: 'Commerce Analytics Lead', role: TOPICS[0], photoUrl: 'https://images.unsplash.com/photo-1757744705465-ea08b0ddc38a?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-34', name: 'Samuel Adeyemi', bio: 'Cross-border commerce expert helping brands navigate international expansion, taxes, and logistics.', company: 'Global-e', jobTitle: 'Head of Strategy', role: TOPICS[0], photoUrl: 'https://images.unsplash.com/photo-1762522926157-bcc04bf0b10a?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-61', name: 'Rosa Fernandez', bio: 'Localization expert helping global brands adapt their storefronts for language, culture, and currency.', company: 'Weglot', jobTitle: 'Head of Commerce', role: TOPICS[0], photoUrl: 'https://images.unsplash.com/photo-1609371497456-3a55a205d5eb?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 30%' },
    { id: 'spk-43', name: 'Ingrid Larsson', bio: 'B2B commerce strategist helping wholesale brands digitize their ordering and expand into DTC.', company: 'Centra', jobTitle: 'VP of Sales', role: TOPICS[0], photoUrl: 'https://images.unsplash.com/photo-1762522921456-cdfe882d36c3?w=3840&q=100&fit=crop&crop=face' },

    // ── Commerce & Platforms (9) ──────────────────────────────────────────────
    { id: 'spk-5', name: 'Elena Rodriguez', bio: 'Expert in omnichannel retail strategy with a decade of experience transforming brick-and-mortar brands into digital-first powerhouses.', company: 'Shopify', jobTitle: 'VP of Commerce Strategy', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1745434159123-5b99b94206ca?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-6', name: 'David Park', bio: 'Pioneering headless commerce architectures that power some of the fastest-growing DTC brands in North America.', company: 'BigCommerce', jobTitle: 'Director of Engineering', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1758598304332-94b40ce7c7b4?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 35%' },
    { id: 'spk-25', name: 'Alex Nguyen', bio: 'Full-stack commerce developer and educator teaching brands how to build composable storefronts.', company: 'Shopify', jobTitle: 'Staff Developer Advocate', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-32', name: 'Nathan Brooks', bio: 'Marketplace operations expert scaling multi-vendor platforms from startup to $100M+ GMV.', company: 'Faire', jobTitle: 'VP of Operations', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1769636929261-e913ed023c83?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 25%' },
    { id: 'spk-40', name: 'Chris Bennett', bio: 'Headless CMS pioneer enabling brands to deliver content-rich commerce experiences across every channel.', company: 'Contentful', jobTitle: 'Head of Commerce', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1614023342667-6f060e9d1e04?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-52', name: 'Victor Onyeka', bio: 'Marketplace integration specialist connecting brands to Amazon, Walmart, and emerging retail platforms.', company: 'ChannelAdvisor', jobTitle: 'VP of Partnerships', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1758600587815-b654d1405e83?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-58', name: 'Brian Foster', bio: 'Composable commerce architect helping enterprise brands break free from monolithic platforms.', company: 'commercetools', jobTitle: 'Solutions Architect', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1758518729058-b158e71c5a9b?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 30%' },
    { id: 'spk-68', name: 'Adrian Pope', bio: 'API-first commerce builder helping brands create custom storefronts with maximum flexibility.', company: 'Medusa', jobTitle: 'Co-Founder', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1764545973653-94c40d993495?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-48', name: 'Finn O\'Connor', bio: 'Accessibility advocate ensuring ecommerce experiences are inclusive and WCAG-compliant.', company: 'Shopify', jobTitle: 'Accessibility Lead', role: TOPICS[1], photoUrl: 'https://images.unsplash.com/photo-1556157382-97eda2d62296?w=3840&q=100&fit=crop&crop=face' },

    // ── Marketing & Growth (9) ────────────────────────────────────────────────
    { id: 'spk-9', name: 'Mei Lin Zhang', bio: 'Data scientist turned marketer, building predictive models that drive personalized customer journeys at scale.', company: 'Klaviyo', jobTitle: 'Senior Data Scientist', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1760543998147-117ae5649c5c?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 15%' },
    { id: 'spk-14', name: 'Jamal Washington', bio: 'SMS and mobile marketing strategist who has driven $500M+ in attributable revenue for DTC brands.', company: 'Attentive', jobTitle: 'VP of Strategy', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1762522926262-d96de462ad54?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-23', name: 'Marco Rossi', bio: 'SMS marketing automation expert helping Shopify merchants achieve 25x+ ROI on text campaigns.', company: 'Postscript', jobTitle: 'Head of Growth', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1770452603217-89b4f03e8271?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-26', name: 'Hannah Becker', bio: 'Conversion rate optimization expert who has run 10,000+ A/B tests across leading ecommerce brands.', company: 'BigCommerce', jobTitle: 'Head of CRO', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1608875848903-06eec0bd71e2?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-42', name: 'Tyler Robinson', bio: 'Loyalty and rewards program architect who has designed programs with 10M+ active members.', company: 'LoyaltyLion', jobTitle: 'Co-Founder', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1633625510483-c177f4308f33?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 30%' },
    { id: 'spk-45', name: 'Lena Fischer', bio: 'Influencer commerce strategist building scalable creator programs that drive authentic brand growth.', company: 'Grin', jobTitle: 'VP of Strategy', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1758518729459-235dcaadc611?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-47', name: 'Aaliyah Davis', bio: 'Email marketing automation specialist driving 30%+ of revenue through lifecycle campaigns.', company: 'Klaviyo', jobTitle: 'Head of Email Strategy', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1632612721400-0a337458b7ed?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 25%' },
    { id: 'spk-54', name: 'Daniel Okafor', bio: 'Performance marketing expert driving efficient customer acquisition through paid social and search.', company: 'Triple Whale', jobTitle: 'Head of Product', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1718392372850-84ccd5d36e7a?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-60', name: 'Sean Murphy', bio: 'Retail media network builder helping brands monetize their first-party data through on-site advertising.', company: 'Criteo', jobTitle: 'Head of Retail Media', role: TOPICS[2], photoUrl: 'https://images.unsplash.com/photo-1758598307313-bae7b2d84255?w=3840&q=100&fit=crop&crop=face' },

    // ── Logistics & Fulfillment (9) ───────────────────────────────────────────
    { id: 'spk-7', name: 'Amira Hassan', bio: 'Supply chain optimization expert helping brands reduce fulfillment costs while improving delivery speed.', company: 'ShipStation', jobTitle: 'Head of Product', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1762522928601-862bf2a04902?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-8', name: 'Ryan Cooper', bio: 'Turned returns from a cost center into a growth engine for over 200 Shopify Plus brands.', company: 'Loop Returns', jobTitle: 'Co-Founder & CEO', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1580411415491-a672219c801b?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-15', name: 'Sophie Dubois', bio: 'Post-purchase experience designer focused on turning shipping anxiety into brand loyalty moments.', company: 'Narvar', jobTitle: 'Head of Experience Design', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-16', name: 'Kenji Tanaka', bio: 'Fulfillment network architect connecting brands with optimal 3PL partners across global markets.', company: 'Extensiv', jobTitle: 'CTO', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-20', name: 'Nadia Petrova', bio: 'Shipment tracking and logistics expert helping brands deliver transparency and trust at every touchpoint.', company: 'AfterShip', jobTitle: 'Head of Product', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1765005204268-631d9e0c6fe1?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 15%' },
    { id: 'spk-36', name: 'Andre Williams', bio: 'Warehouse automation specialist deploying robotics and AI to transform fulfillment center efficiency.', company: 'ShipBob', jobTitle: 'CTO', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1769636929231-3cd7f853d038?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 25%' },
    { id: 'spk-49', name: 'Priyanka Sharma', bio: 'Warehouse management systems expert optimizing pick, pack, and ship operations for high-volume brands.', company: 'ShipStation', jobTitle: 'Director of Solutions', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1697063882499-f7fca7d2d713?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-66', name: 'Omar Bakari', bio: 'Warehouse robotics engineer deploying autonomous systems that triple pick-and-pack throughput.', company: 'Locus Robotics', jobTitle: 'Head of Integrations', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1639747279286-c07eecb47a0b?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-71', name: 'Chiara Bianchi', bio: 'Omnichannel fulfillment strategist helping brands offer BOPIS, ship-from-store, and same-day delivery.', company: 'Manhattan Associates', jobTitle: 'Director of Product', role: TOPICS[3], photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=3840&q=100&fit=crop&crop=face' },

    // ── AI & Data (9) ─────────────────────────────────────────────────────────
    { id: 'spk-2', name: 'Marcus Williams', bio: 'Leads the AI/ML platform team and has published research on large language models. Previously at Google Brain and OpenAI.', company: 'DeepTech Labs', jobTitle: 'Head of AI Platform', role: TOPICS[4], linkedinUrl: 'https://linkedin.com/in/marcuswilliams', photoUrl: 'https://images.unsplash.com/photo-1646658104783-2eec2433c1d1?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-17', name: 'Ava Mitchell', bio: 'Personalization expert using AI to create unique shopping experiences that increase AOV and lifetime value.', company: 'Rebuy Engine', jobTitle: 'Head of AI', role: TOPICS[4], photoUrl: 'https://images.unsplash.com/photo-1765005204058-10418f5123c5?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-18', name: 'Ibrahim Koné', bio: 'Site search and merchandising specialist who has optimized product discovery for 500+ online retailers.', company: 'Searchspring', jobTitle: 'VP of Engineering', role: TOPICS[4], photoUrl: 'https://images.unsplash.com/photo-1625850902501-cc6baef3e3b2?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-39', name: 'Zara Patel', bio: 'Customer data platform expert unifying first-party data to power hyper-personalized marketing.', company: 'Segment', jobTitle: 'Commerce Solutions Lead', role: TOPICS[4], photoUrl: 'https://images.unsplash.com/photo-1581065178047-8ee15951ede6?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-59', name: 'Ananya Gupta', bio: 'Voice commerce researcher exploring how conversational AI is reshaping how consumers discover and buy products.', company: 'Google Cloud', jobTitle: 'AI Research Lead', role: TOPICS[4], photoUrl: 'https://images.unsplash.com/photo-1614644147798-f8c0fc9da7f6?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-69', name: 'Samira Youssef', bio: 'Product recommendation engine architect using collaborative filtering to boost cross-sell revenue.', company: 'Nosto', jobTitle: 'Head of Engineering', role: TOPICS[4], photoUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-41', name: 'Naomi Watanabe', bio: 'Visual merchandising technologist using AI to optimize product imagery and increase click-through rates.', company: 'Cloudinary', jobTitle: 'Director of Product', role: TOPICS[4], photoUrl: 'https://images.unsplash.com/photo-1668049221651-28a3fb151f19?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-67', name: 'Lily Hartwell', bio: 'Customer segmentation expert using machine learning to identify high-value cohorts for targeted campaigns.', company: 'Attentive', jobTitle: 'Director of Data Science', role: TOPICS[4], photoUrl: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-64', name: 'Hassan El-Amin', bio: 'Customer service AI builder creating chatbots that resolve 70%+ of support tickets without human intervention.', company: 'Gorgias', jobTitle: 'Head of AI', role: TOPICS[4], photoUrl: 'https://images.unsplash.com/photo-1679476819592-3e233227fd83?w=3840&q=100&fit=crop&crop=face' },

    // ── Payments & Checkout (9) ───────────────────────────────────────────────
    { id: 'spk-11', name: 'Fatima Al-Rashid', bio: 'Subscription commerce pioneer with deep expertise in recurring revenue models for consumer brands.', company: 'Recharge', jobTitle: 'VP of Growth', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1745434159123-af6142c7862f?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 10%' },
    { id: 'spk-19', name: 'Rachel Kim', bio: 'Subscription management innovator building the infrastructure that powers millions of recurring orders.', company: 'Skio', jobTitle: 'Co-Founder', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1770058443069-e384cd001e9b?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-22', name: 'Aisha Johnson', bio: 'Relationship commerce strategist transforming one-time buyers into lifelong subscribers.', company: 'Ordergroove', jobTitle: 'VP of Customer Success', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1758598306845-8630d064a244?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-28', name: 'Yuki Sato', bio: 'Payment systems architect with expertise in global payment orchestration and checkout optimization.', company: 'Stripe', jobTitle: 'Commerce Lead', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1713947507130-227586ab3024?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-44', name: 'Rafael Santos', bio: 'Fraud prevention expert protecting ecommerce brands from chargebacks while maintaining frictionless checkout.', company: 'Signifyd', jobTitle: 'Head of Data Science', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1653327876541-95133a48158c?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-53', name: 'Chloe Martin', bio: 'Customer retention strategist using behavioral data to reduce churn and increase lifetime value.', company: 'Recharge', jobTitle: 'Head of Retention', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1758600587839-56ba05596c69?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-57', name: 'Tamara Novak', bio: 'Checkout optimization specialist who has recovered millions in abandoned cart revenue for DTC brands.', company: 'Bold Commerce', jobTitle: 'VP of Product', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1619369056679-87b6fbfac1be?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 30%' },
    { id: 'spk-63', name: 'Ling Wei', bio: 'Cross-border payments specialist simplifying international transactions for commerce brands.', company: 'Adyen', jobTitle: 'VP of Commerce', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1764971591006-b6eb67a8f0cb?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-38', name: 'Oscar Hernandez', bio: 'Mobile commerce architect who has built apps driving 60%+ of revenue for major DTC brands.', company: 'Tapcart', jobTitle: 'VP of Engineering', role: TOPICS[5], photoUrl: 'https://images.unsplash.com/photo-1618077360395-f3068be8e001?w=3840&q=100&fit=crop&crop=face' },

    // ── Brand & Experience (9) ────────────────────────────────────────────────
    { id: 'spk-10', name: 'Carlos Mendoza', bio: 'Customer experience strategist who has helped ecommerce brands achieve 95%+ CSAT scores through automation and empathy.', company: 'Gorgias', jobTitle: 'Head of CX Strategy', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1600878459108-617a253537e9?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-13', name: 'Olivia Thompson', bio: 'Review and UGC expert helping brands leverage social proof to increase conversion rates by 30%+.', company: 'Yotpo', jobTitle: 'Director of Product', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1666983998531-622f19bca9a8?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-21', name: 'Lucas Wright', bio: 'Social proof and customer marketing leader driving authentic brand advocacy through review programs.', company: 'Okendo', jobTitle: 'Director of Marketing', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1756699269843-eb2ea51f1adf?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-27', name: 'Darius Jackson', bio: 'Brand storytelling strategist helping DTC companies build emotional connections that drive repeat purchases.', company: 'Glossier', jobTitle: 'VP of Brand', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1758600588428-2cca8c96bfba?w=2160&h=2808&fit=crop&crop=face&q=100' },
    { id: 'spk-29', name: 'Grace Obi', bio: 'Community commerce expert building the playbook for brands that turn customers into co-creators.', company: 'Depop', jobTitle: 'Head of Community', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1617554980793-009061cdbb4f?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 25%' },
    { id: 'spk-31', name: 'Leila Ahmadi', bio: 'Beauty tech innovator building AR try-on experiences that have increased online beauty sales by 40%.', company: 'Kylie Cosmetics', jobTitle: 'Head of Digital Innovation', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-33', name: 'Camille Laurent', bio: 'Luxury ecommerce strategist bridging the gap between high-touch retail and digital-first experiences.', company: 'Selfridges Digital', jobTitle: 'Head of Digital Commerce', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1753120879121-678c3d42542e?w=2160&h=2808&fit=crop&crop=face&q=100' },
    { id: 'spk-37', name: 'Mia Chen', bio: 'Content commerce expert building shoppable content strategies that blur the line between media and retail.', company: 'TikTok Shop', jobTitle: 'Head of Commerce Partnerships', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1573497491207-618cc224f243?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-51', name: 'Esme Delacroix', bio: 'Luxury packaging and unboxing experience designer helping premium brands create memorable first impressions.', company: 'Packlane', jobTitle: 'Creative Director', role: TOPICS[6], photoUrl: 'https://images.unsplash.com/photo-1611432579699-484f7990b127?w=3840&q=100&fit=crop&crop=face' },

    // ── Security & Infrastructure (9) ─────────────────────────────────────────
    { id: 'spk-1', name: 'Sarah Chen', bio: 'Principal engineer with 12 years of experience building distributed systems. Frequent conference speaker and open-source contributor.', company: 'CloudScale Inc.', jobTitle: 'Principal Engineer', role: TOPICS[7], twitterHandle: '@sarahchen', photoUrl: 'https://images.unsplash.com/photo-1699899657680-421c2c2d5064?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-4', name: 'James Okafor', bio: 'Security researcher and ethical hacker who helps companies find and fix vulnerabilities. Runs a popular security podcast.', company: 'SecureFoundry', jobTitle: 'Security Researcher', role: TOPICS[7], photoUrl: 'https://images.unsplash.com/photo-1733231291455-3c4de1c24e20?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-24', name: 'Diana Okonkwo', bio: 'Cloud infrastructure strategist helping commerce brands scale globally with resilient architectures.', company: 'Google Cloud', jobTitle: 'Commerce Solutions Lead', role: TOPICS[7], photoUrl: 'https://images.unsplash.com/photo-1765005204227-bf58bcdd4449?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 20%' },
    { id: 'spk-50', name: 'Jordan Taylor', bio: 'Social commerce strategist building seamless shopping experiences within social media platforms.', company: 'Meta', jobTitle: 'Commerce Product Lead', role: TOPICS[7], photoUrl: 'https://images.unsplash.com/photo-1745434159123-4908d0b9df94?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-55', name: 'Isabella Moretti', bio: 'Product photography and visual commerce expert building immersive 3D and video shopping experiences.', company: 'Bambuser', jobTitle: 'Head of Live Commerce', role: TOPICS[7], photoUrl: 'https://images.unsplash.com/photo-1758691737605-69a0e78bd193?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-62', name: 'Jake Morrison', bio: 'Headless commerce performance engineer obsessed with sub-second page loads and Core Web Vitals.', company: 'Vercel', jobTitle: 'Commerce DX Lead', role: TOPICS[7], photoUrl: 'https://images.unsplash.com/photo-1650490323009-96fc950a959c?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-65', name: 'Victoria Strand', bio: 'Sustainable fashion technologist building circular commerce platforms for resale and rental.', company: 'ThredUp', jobTitle: 'VP of Engineering', role: TOPICS[7], photoUrl: 'https://images.unsplash.com/photo-1758600432948-5cec2a3fecb9?w=3840&q=100&fit=crop&crop=face' },
    { id: 'spk-72', name: 'Derek Huang', bio: 'Commerce security expert protecting brands from account takeover, bot attacks, and payment fraud.', company: 'Signifyd', jobTitle: 'VP of Engineering', role: TOPICS[7], photoUrl: 'https://images.unsplash.com/photo-1600896997793-b8ed3459a17f?w=3840&q=100&fit=crop&crop=face', photoPosition: '50% 30%' },
    { id: 'spk-35', name: 'Emma Johansson', bio: 'Sustainability in commerce advocate helping brands build transparent, eco-friendly supply chains.', company: 'Allbirds', jobTitle: 'VP of Sustainability', role: TOPICS[7], photoUrl: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=3840&q=100&fit=crop&crop=face' },
  ]

  // Remove speakers not in seed list (clean up old data)
  const seedIds = speakerDefs.map(s => s.id)
  const { count: deletedCount } = await prisma.speaker.deleteMany({
    where: { conferenceId: conf.id, id: { notIn: seedIds } },
  })
  if (deletedCount > 0) console.log(`  Removed ${deletedCount} old speakers`)

  // Batch speakers in groups of 7 with 5-minute intervals between batches
  const BATCH_SIZE = 7
  const BATCH_INTERVAL_MS = parseInt(process.env.SEED_BATCH_INTERVAL_MS ?? String(5 * 60 * 1000), 10) // default 5 minutes
  const totalBatches = Math.ceil(speakerDefs.length / BATCH_SIZE)
  console.log(`  Creating ${speakerDefs.length} speakers in ${totalBatches} batches of ${BATCH_SIZE}...`)

  const speakers: Awaited<ReturnType<typeof prisma.speaker.upsert>>[] = []
  for (let i = 0; i < speakerDefs.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const batch = speakerDefs.slice(i, i + BATCH_SIZE)
    console.log(`  Batch ${batchNum}/${totalBatches}: upserting ${batch.length} speakers...`)

    const batchResults = await Promise.all(
      batch.map(s =>
        prisma.speaker.upsert({
          where: { id: s.id },
          update: {
            name: s.name,
            bio: s.bio,
            company: s.company,
            jobTitle: s.jobTitle,
            role: s.role,
            twitterHandle: s.twitterHandle ?? null,
            linkedinUrl: s.linkedinUrl ?? null,
            photoUrl: s.photoUrl,
            photoPosition: s.photoPosition ?? '50% 50%',
          },
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
            photoPosition: s.photoPosition ?? '50% 50%',
          },
        })
      )
    )
    speakers.push(...batchResults)

    // Wait between batches (skip wait after the last batch)
    if (i + BATCH_SIZE < speakerDefs.length) {
      console.log(`  Waiting ${(BATCH_INTERVAL_MS / 1000 / 60).toFixed(1)} minutes before next batch...`)
      await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL_MS))
    }
  }
  console.log(`  All ${speakers.length} speakers created successfully.`)

  // ── Sessions — Day 1 & 2 ──────────────────────────────────────────────────
  const day1 = '2027-04-06'
  const day2 = '2027-04-07'

  const sessions = await Promise.all([
    prisma.confSession.upsert({
      where: { id: 'ses-1' },
      update: { startsAt: new Date(`${day1}T09:00:00Z`), endsAt: new Date(`${day1}T10:00:00Z`) },
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
      update: { startsAt: new Date(`${day1}T10:30:00Z`), endsAt: new Date(`${day1}T11:30:00Z`) },
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
      update: { startsAt: new Date(`${day1}T10:30:00Z`), endsAt: new Date(`${day1}T11:30:00Z`) },
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
      update: { startsAt: new Date(`${day1}T12:00:00Z`), endsAt: new Date(`${day1}T13:00:00Z`) },
      create: {
        id: 'ses-4', conferenceId: conf.id,
        title: 'Lunch Break', room: 'Atrium',
        startsAt: new Date(`${day1}T12:00:00Z`), endsAt: new Date(`${day1}T13:00:00Z`),
        type: 'BREAK',
      },
    }),
    prisma.confSession.upsert({
      where: { id: 'ses-5' },
      update: { startsAt: new Date(`${day1}T13:00:00Z`), endsAt: new Date(`${day1}T15:00:00Z`) },
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
      update: { startsAt: new Date(`${day2}T09:00:00Z`), endsAt: new Date(`${day2}T10:00:00Z`) },
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
      update: { startsAt: new Date(`${day2}T10:30:00Z`), endsAt: new Date(`${day2}T11:30:00Z`) },
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
      update: { startsAt: new Date(`${day2}T10:30:00Z`), endsAt: new Date(`${day2}T11:30:00Z`) },
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
  const tbDays = ['2027-04-06', '2027-04-07']
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
          create: { id, conferenceId: conf.id, startsAt, endsAt, location: 'Networking Lounge', capacity: 20 },
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
  //
  // The definitions live in ./seed-sponsors.ts rather than inline. Two reasons,
  // both from finding F-10 (2026-08-02):
  //
  //   1. The definitions had drifted from the database — eight booth numbers in
  //      `P1` form against the database's ten in `P-01` form, different
  //      taglines, and no offerings on any exhibiting company. A database built
  //      from nothing produced a hall with the wrong companies in the wrong
  //      rows. The create branch below now carries the full set.
  //   2. scripts/test-booth-card-data.mjs imports those definitions and compares
  //      them against the database. Inline definitions in this file could not be
  //      imported without running the whole seed.
  //
  // ── The two branches are deliberately NOT the same set ─────────────────────
  //
  // Create writes everything; update writes only name, tier and logoUrl. This
  // file can connect to the SHARED production database — createPrismaClient()
  // above prefers TURSO_DATABASE_URL over DATABASE_URL — so an update branch
  // carrying taglines and descriptions would let one stray `pnpm db:seed`
  // overwrite an organizer's edits. See ./seed-sponsors.ts for the full reason
  // and for what replaces the self-correction that is given up.
  const sponsorDefs = SPONSOR_DEFS

  console.log(`  Creating ${sponsorDefs.length} sponsors...`)

  // ── Say plainly when an existing row is left stale ──────────────────────────
  //
  // Raised by Phase 9's adversarial review round 3. The narrow update branch
  // protects an organizer's edits, but it also means a seed re-run against a
  // database that ALREADY holds these rows never brings tagline, website, booth
  // number or offerings up to date — and the run prints "Creating 20 sponsors"
  // and looks like it did. Someone rebuilding locally would reasonably believe
  // the seed had refreshed everything.
  //
  // So the drift is counted and named, with the command that repairs it. This
  // reports; it does not decide. Repair stays an explicit act.
  const staleCardFields: string[] = []

  for (const s of sponsorDefs) {
    const existing = await prisma.sponsor.findUnique({
      where: { id: s.id },
      select: { tagline: true, website: true, boothNumber: true, solutionsOffering: true },
    })
    if (existing) {
      const full = sponsorCreateFields(s)
      const drifted = (['tagline', 'website', 'boothNumber', 'solutionsOffering'] as const).filter(
        f => (existing[f] ?? null) !== (full[f] ?? null),
      )
      if (drifted.length > 0) staleCardFields.push(`${s.name} (${drifted.join(', ')})`)
    }

    await prisma.sponsor.upsert({
      where: { id: s.id },
      update: sponsorUpdateFields(s),
      create: { id: s.id, conferenceId: conf.id, ...sponsorCreateFields(s) },
    })
  }

  if (staleCardFields.length > 0) {
    console.log(
      `  NOTE: ${staleCardFields.length} existing sponsor row(s) differ from the seed definitions\n` +
        `        on booth-card fields, and were NOT changed. The update branch is deliberately\n` +
        `        narrow so a seed run cannot overwrite an organizer's edits.\n` +
        staleCardFields.map(l => `          - ${l}`).join('\n') +
        `\n        To inspect: node scripts/migrate-sponsor-card-fields.mjs\n` +
        `        To repair:  node scripts/migrate-sponsor-card-fields.mjs --apply`,
    )
  }

  // ── The sponsor-side gate demonstration company ────────────────────────────
  //
  // Upserted separately from the twenty above, and with a WIDE update branch
  // where theirs is deliberately narrow. Both differences are on purpose.
  //
  // Separate, because ./seed-sponsors.ts holds the real exhibitor roster —
  // "generated from the working database, which is the content the
  // demonstration shows" — and this is a test prop. Keeping it out leaves
  // scripts/test-booth-card-data.mjs and scripts/migrate-sponsor-card-fields.mjs
  // reading SPONSOR_DEFS as exactly the roster of real exhibitors, unchanged.
  //
  // Wide, because the reason the roster's update branch is narrow does not
  // apply here. That narrowness exists so a stray `pnpm db:seed` — which can
  // reach the shared production database, since createPrismaClient() prefers
  // the Turso variables — cannot overwrite an organizer's real edits to a real
  // company (finding F-10). Nobody edits this row for real: every value it
  // should hold is defined in ../src/gate-demo-sponsor.ts and its entire
  // purpose is to be in one known state. A reseed therefore returns it to that
  // state, including putting a hand-completed contact back to empty (UF-61).
  console.log(`  Creating the gate demonstration company (${GATE_DEMO_SPONSOR.name})...`)
  {
    const { id, ...fields } = GATE_DEMO_SPONSOR
    await prisma.sponsor.upsert({
      where: { id },
      // `conferenceId` is in the update branch as well as the create, so a row
      // that ended up on the wrong conference is corrected rather than left
      // there. Without it, a company created against a previous event stays
      // invisible to every screen that filters by the current one, while this
      // seed reports having recreated it.
      update: { conferenceId: conf.id, ...fields },
      create: { id, conferenceId: conf.id, ...fields },
    })
  }

  // Its meeting requirement is pinned to zero through the existing per-company
  // override, so a prop nobody will ever book a meeting with does not drag down
  // the fill-rate figures on the showtime screens.
  //
  // Through saveMeetingRequirementSettings() rather than raw SQL written here.
  // That table is created defensively at runtime rather than by a migration —
  // see the MeetingRequirementSetting model comment in ./schema.prisma, which
  // requires the column shape to match the DDL in ../src/meeting-engine.ts
  // EXACTLY. A second copy of that DDL in this file is the drift that warning
  // is about, and the function already runs CREATE TABLE IF NOT EXISTS itself,
  // so the case this was meant to defend against — seeding a database where the
  // table does not exist yet — is covered by calling it.
  //
  // Zero survives the write: normalizeRequiredCount clamps to [0, 99], so a
  // requested 0 is stored as 0 rather than falling back to the default.
  await saveMeetingRequirementSettings(prisma, {
    sponsorOverrides: [{ sponsorId: GATE_DEMO_SPONSOR_ID, required: 0 }],
  })

  // ── Test accounts (login page accounts) ────────────────────────────────────
  // The 3 canonical accounts shown on each app's login page, plus the 2 gate
  // demonstration accounts that are deliberately blocked. Per-app sign-in
  // access is enforced by packages/db/src/app-access.ts (single source of
  // truth). Roles map to the access tiers:
  //   WBR     → ORGANIZER (full admin; access to every app)
  //   BRAND   → BRAND     (meetings + mobile)
  //   SPONSOR → SPONSOR   (sponsor portal + mobile; linked to Tailor ERP)
  // The two demonstration accounts are ATTENDEE (blocked on its own profile)
  // and SPONSOR (blocked on the Gate Demo Exhibitor company it is attached to).
  // All five share the password `password123`.

  const testHash = await hashPassword('password123')
  const demoHash = await hashPassword('demo123')

  // The Brand-tier account is Steph Curry (restored from the old
  // demo-attendee-steph seed user), now mapped onto the Brand login.
  // ── Attendee onboarding gate: every attendee-facing account needs the full
  // required set, or it lands on the onboarding checklist instead of the app.
  //
  // Required set (packages/db/src/onboarding-policy.ts,
  // DELEGATE_REQUIRED_FIELDS): name, jobTitle,
  // company, companySize, annualRevenue, and >=1 solutionsSeeking. Before this
  // was added, the seed set neither companySize nor annualRevenue at all, so a
  // reseed produced ~1000 attendees blocked on two fields each.
  const COMPANY_SIZES = ['STARTUP', 'SMB', 'MIDMARKET', 'ENTERPRISE'] as const
  const REVENUE_RANGES = ['<1M', '1M-10M', '10M-50M', '50M-250M', '250M+'] as const

  const demoUsers: { id: string; email: string; name: string; role: string; password: string; sponsorId?: string; company?: string; jobTitle?: string; bio?: string; image?: string; companySize?: string; annualRevenue?: string; solutionsSeeking?: string; solutionsOffering?: string }[] = [
    { id: 'test-wbr', email: 'wbr@test.com', name: 'WBR', role: 'ORGANIZER', password: testHash, company: 'WBR', jobTitle: 'Conference Organizer', companySize: 'SMB', annualRevenue: '1M-10M', solutionsSeeking: JSON.stringify(['Analytics & Reporting','AI & Automation']) },
    { id: 'test-brand', email: 'stephcurry@test.com', name: 'Steph Curry', role: 'BRAND', password: testHash, company: 'Golden State Warriors', jobTitle: 'Point Guard', bio: 'Point guard for the Golden State Warriors. At WBR to scout commerce, brand, and loyalty tooling for the next signature drop.', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&q=80&fit=crop&crop=face', companySize: 'ENTERPRISE', annualRevenue: '250M+', solutionsSeeking: JSON.stringify(['AI & Automation','Personalization','Analytics & Reporting']), solutionsOffering: JSON.stringify(['Email Marketing','Loyalty & Rewards']) },
    { id: 'test-sponsor', email: 'sponsor@test.com', name: 'Sponsor', role: 'SPONSOR', password: testHash, sponsorId: 'cmngb2h4h0007vm28mbcpxjg5', company: 'Tailor ERP', jobTitle: 'Partner Manager', companySize: 'MIDMARKET', annualRevenue: '10M-50M', solutionsSeeking: JSON.stringify(['B2B Commerce','Marketplace Integration']) },
    // Deliberately INCOMPLETE — the one account that is meant to hit the
    // onboarding gate, so the gate can be demonstrated on cue instead of being
    // discovered by accident on someone else's login. Complete in every field
    // except solutionsSeeking, which is an explicitly empty array. Do not
    // "fix" this account; it is doing its job when it is blocked.
    { id: 'test-onboarding-demo', email: 'onboarding-demo@test.com', name: 'Onboarding Gate Demo', role: 'ATTENDEE', password: testHash, company: 'Gate Demo Co', jobTitle: 'Head of eCommerce', companySize: 'MIDMARKET', annualRevenue: '10M-50M', solutionsSeeking: JSON.stringify([]) },
    // The SPONSOR-side counterpart of the account above, and the one the
    // sponsor portal's gate can actually stop. It exists because the account
    // documented as reaching all four apps is wbr@test.com, which holds
    // ORGANIZER, and the gate releases every WBR-side role before asking any
    // completeness question — so that portal's gate had nothing to demonstrate
    // on (UF-8).
    //
    // THIS PERSON'S OWN SIX FIELDS ARE COMPLETE, deliberately. What is
    // incomplete is the Gate Demo Exhibitor COMPANY it is attached to, which
    // holds no contact. Leaving the person's fields short would also block this
    // account in the attendee app, which admits the SPONSOR role — a second,
    // unintended gate demonstration on a screen nobody meant to show.
    { id: 'test-sponsor-onboarding-demo', email: 'sponsor-onboarding-demo@test.com', name: 'Sponsor Gate Demo', role: 'SPONSOR', password: testHash, sponsorId: GATE_DEMO_SPONSOR_ID, company: 'Gate Demo Exhibitor', jobTitle: 'Exhibitor Manager', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&h=400&q=80&fit=crop&crop=face', companySize: 'SMB', annualRevenue: '1M-10M', solutionsSeeking: JSON.stringify(['Analytics & Reporting']) },
  ]

  // Helper: upsert user by email, handling existing IDs gracefully
  async function upsertUser(data: { id: string; email: string; name: string; role: string; password?: string; sponsorId?: string; company?: string; jobTitle?: string; bio?: string; image?: string; companySize?: string; annualRevenue?: string; solutionsSeeking?: string; solutionsOffering?: string }) {
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
          ...(data.bio ? { bio: data.bio } : {}),
          ...(data.image ? { image: data.image } : {}),
          ...(data.companySize ? { companySize: data.companySize } : {}),
          ...(data.annualRevenue ? { annualRevenue: data.annualRevenue } : {}),
          ...(data.solutionsSeeking ? { solutionsSeeking: data.solutionsSeeking } : {}),
          ...(data.solutionsOffering ? { solutionsOffering: data.solutionsOffering } : {}),
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
          ...(data.bio ? { bio: data.bio } : {}),
          ...(data.image ? { image: data.image } : {}),
          ...(data.companySize ? { companySize: data.companySize } : {}),
          ...(data.annualRevenue ? { annualRevenue: data.annualRevenue } : {}),
          ...(data.solutionsSeeking ? { solutionsSeeking: data.solutionsSeeking } : {}),
          ...(data.solutionsOffering ? { solutionsOffering: data.solutionsOffering } : {}),
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
        bio: data.bio,
        image: data.image,
        companySize: data.companySize,
        annualRevenue: data.annualRevenue,
        solutionsSeeking: data.solutionsSeeking,
        solutionsOffering: data.solutionsOffering,
      },
    })
  }

  console.log(`  Creating ${demoUsers.length} demo accounts...`)
  for (let i = 0; i < demoUsers.length; i++) {
    // Respect an explicit image on the demo user (e.g. Steph's headshot);
    // otherwise fall back to a deterministic headshot by index.
    await upsertUser({ ...demoUsers[i], image: demoUsers[i].image ?? attendeeHeadshot(i) })
  }

  // ── Attendee users (for seed-meetings data) ────────────────────────────────
  // These users are referenced by hardcoded IDs in seed-meetings.ts.
  // They must exist before running seed-meetings.

  const attendeeUsers: { id: string; email: string; name: string; company: string; jobTitle: string; solutionsSeeking: string; solutionsOffering: string }[] = [
    { id: 'cmnf5o3zh0000o6gl8ph6p741', email: 'jordan@demo.com', name: 'Jordan Lee', company: 'Arhaus DTC', jobTitle: 'VP Sales', solutionsSeeking: JSON.stringify(['AI & Automation','Analytics & Reporting','Personalization']), solutionsOffering: JSON.stringify(['Email Marketing','Loyalty & Rewards']) },
    { id: 'cmnf5o3zk0003o6gl1dkbwyba', email: 'maya.patel@urbandecay.com', name: 'Maya Patel', company: 'Urban Decay', jobTitle: 'Head of DTC', solutionsSeeking: JSON.stringify(['Personalization','Customer Support','AI & Automation']), solutionsOffering: JSON.stringify(['SMS Marketing','Loyalty & Rewards']) },
    { id: 'cmnf5o3zm0006o6gljz3rs2fi', email: 'chris.nakamura@noihsaf.com', name: 'Chris Nakamura', company: 'Noihsaf Bazaar', jobTitle: 'VP Customer Success', solutionsSeeking: JSON.stringify(['Search & Discovery','Headless Commerce']), solutionsOffering: JSON.stringify(['Customer Support','Returns Management']) },
    { id: 'cmnf5o3zo0009o6gloybowz8b', email: 'aaliyah.brooks@entireworld.com', name: 'Aaliyah Brooks', company: 'Entireworld', jobTitle: 'VP Growth', solutionsSeeking: JSON.stringify(['B2B Commerce','Marketplace Integration','AI & Automation']), solutionsOffering: JSON.stringify(['Analytics & Reporting','Subscription Management']) },
    { id: 'cmnf5o3zq000co6gl2ahjeodc', email: 'sam.torres@boohoo.com', name: 'Sam Torres', company: 'Boohoo DTC', jobTitle: 'VP Engineering', solutionsSeeking: JSON.stringify(['Headless Commerce','AI & Automation','ERP / Operations']), solutionsOffering: JSON.stringify(['Loyalty & Rewards','Inventory Management']) },
    { id: 'cmnf5o3zt000fo6glimp8sdgg', email: 'priya.singh@selfridges.com', name: 'Priya Singh', company: 'Selfridges Digital', jobTitle: 'Digital Lead', solutionsSeeking: JSON.stringify(['Analytics & Reporting','Personalization']), solutionsOffering: JSON.stringify(['Inventory Management','Search & Discovery']) },
    { id: 'cmnf5o3zv000io6gldzpvj2ep', email: 'daniel.kim@colourpop.com', name: 'Daniel Kim', company: 'ColourPop', jobTitle: 'Head of Finance', solutionsSeeking: JSON.stringify(['Payment Processing','ERP / Operations','Analytics & Reporting']), solutionsOffering: JSON.stringify(['Personalization','Email Marketing']) },
    { id: 'cmnf5o3zx000lo6glvu1jfhtq', email: 'zoe.andersen@yearandday.com', name: 'Zoe Andersen', company: 'Year & Day', jobTitle: 'VP Revenue', solutionsSeeking: JSON.stringify(['AI & Automation','Subscription Management','SMS Marketing']), solutionsOffering: JSON.stringify(['Analytics & Reporting','Loyalty & Rewards']) },
    { id: 'cmnf5o3zy000oo6glzil6hssh', email: 'marcus.bell@4moms.com', name: 'Marcus Bell', company: '4moms DTC', jobTitle: 'Head of Retention', solutionsSeeking: JSON.stringify(['Loyalty & Rewards','Customer Support','AI & Automation']), solutionsOffering: JSON.stringify(['Returns Management','Subscription Management']) },
    { id: 'cmnf5o400000ro6glk0vwyxke', email: 'leila.hassan@romanhealth.com', name: 'Leila Hassan', company: 'Roman Health', jobTitle: 'COO', solutionsSeeking: JSON.stringify(['Payment Processing','Shipping & Fulfillment','Analytics & Reporting']), solutionsOffering: JSON.stringify(['AI & Automation','Customer Support']) },
    { id: 'cmnf5o401000uo6gl5arc1yns', email: 'tom.eriksen@oliveandpiper.com', name: 'Tom Eriksen', company: 'Olive & Piper', jobTitle: 'eCommerce Strategist', solutionsSeeking: JSON.stringify(['Marketplace Integration','Headless Commerce']), solutionsOffering: JSON.stringify(['Search & Discovery','Personalization']) },
    { id: 'cmnf5o403000xo6glueacjfk4', email: 'nina.vasquez@ouraring.com', name: 'Nina Vasquez', company: 'Oura', jobTitle: 'Director of Marketplace', solutionsSeeking: JSON.stringify(['SMS Marketing','Email Marketing','AI & Automation']), solutionsOffering: JSON.stringify(['Analytics & Reporting','Reviews & UGC']) },
    { id: 'cmnf5o4050010o6gly4ukzmah', email: 'kwesi.owusu@skii.com', name: 'Kwesi Owusu', company: 'SK-II DTC', jobTitle: 'CEO', solutionsSeeking: JSON.stringify(['Shipping & Fulfillment','Inventory Management','AI & Automation']), solutionsOffering: JSON.stringify(['Personalization','B2B Commerce']) },
    { id: 'cmnf5o4060013o6glxmcmr2r8', email: 'hana.suzuki@ssense.com', name: 'Hana Suzuki', company: 'SSENSE', jobTitle: 'VP Growth', solutionsSeeking: JSON.stringify(['Personalization','Search & Discovery','Analytics & Reporting']), solutionsOffering: JSON.stringify(['ERP / Operations','Headless Commerce']) },
    { id: 'cmnf5o4080016o6glvytz0mcq', email: 'felix.wagner@cedarandmoss.com', name: 'Felix Wagner', company: 'Cedar & Moss', jobTitle: 'Founder', solutionsSeeking: JSON.stringify(['B2B Commerce','Subscription Management']), solutionsOffering: JSON.stringify(['Email Marketing','SMS Marketing']) },
    { id: 'cmnf5o4090019o6gl06nnhzc0', email: 'amara.diallo@depop.com', name: 'Amara Diallo', company: 'Depop', jobTitle: 'VP Revenue', solutionsSeeking: JSON.stringify(['Marketplace Integration','AI & Automation','Reviews & UGC']), solutionsOffering: JSON.stringify(['Subscription Management','Payment Processing']) },
    { id: 'cmnf5o40b001co6gl8j8dafx3', email: 'ryan.obrien@beautycounter.com', name: "Ryan O'Brien", company: 'Beautycounter', jobTitle: 'COO', solutionsSeeking: JSON.stringify(['Analytics & Reporting','Customer Support','AI & Automation']), solutionsOffering: JSON.stringify(['Loyalty & Rewards','Personalization']) },
    { id: 'cmnf5o40c001fo6gljtwj9gk5', email: 'sophie.muller@boohoo-eu.com', name: 'Sophie Müller', company: 'Boohoo DTC', jobTitle: 'Co-Founder', solutionsSeeking: JSON.stringify(['Headless Commerce','AI & Automation']), solutionsOffering: JSON.stringify(['Reviews & UGC','SMS Marketing']) },
    { id: 'cmnf5o40e001io6glgvzi0wil', email: 'james.osei@glossier.com', name: 'James Osei', company: 'Glossier', jobTitle: 'Director of Retail', solutionsSeeking: JSON.stringify(['Personalization','Loyalty & Rewards','AI & Automation']), solutionsOffering: JSON.stringify(['Email Marketing','Analytics & Reporting']) },
    { id: 'cmnf5o40g001lo6gld2txewt2', email: 'chloe.beaumont@kyliecosmetics.com', name: 'Chloe Beaumont', company: 'Kylie Cosmetics', jobTitle: 'Head of Wholesale', solutionsSeeking: JSON.stringify(['B2B Commerce','Inventory Management','Payment Processing']), solutionsOffering: JSON.stringify(['Customer Support','Shipping & Fulfillment']) },
  ]

  console.log(`  Creating ${attendeeUsers.length} attendee users...`)
  for (let i = 0; i < attendeeUsers.length; i++) {
    await upsertUser({ ...attendeeUsers[i], role: 'ATTENDEE', password: demoHash, image: attendeeHeadshot(i + demoUsers.length) })
  }

  // ── Generated attendees (fill to 1,000 total ATTENDEE users) ─────────────
  // Distributed equally across 4 industry categories for the People page
  const FIRST_NAMES = ['Alex','Anna','Ben','Beth','Blake','Brooke','Caleb','Cara','Chase','Clara','Cole','Dana','Dean','Diana','Drew','Elena','Eli','Emma','Evan','Faye','Finn','Gina','Grant','Grace','Hank','Hope','Hugo','Iris','Ivan','Jade','Jake','Jane','Jay','Jess','Joel','Julia','Kai','Kate','Kyle','Lana','Leo','Lily','Luke','Luna','Mara','Mark','Mila','Nate','Nell','Noah','Nora','Omar','Owen','Paige','Paul','Quinn','Ray','Reed','Remy','Rosa','Ruby','Ryan','Sara','Sean','Skye','Tara','Tess','Theo','Tina','Troy','Uma','Vera','Wade','Will','Wren','Xena','Yara','Zane','Zara','Zoe']
  const LAST_NAMES = ['Adams','Baker','Brown','Clark','Cohen','Cruz','Davis','Diaz','Ellis','Evans','Flores','Fox','Garcia','Grant','Green','Hall','Harris','Hill','Hunt','James','Jones','Kelly','Khan','Kim','King','Lane','Lee','Lewis','Lin','Lopez','Lowe','Mann','Mason','Meyer','Mills','Moore','Nash','Ngo','Novak','Park','Patel','Perry','Price','Quinn','Rao','Reed','Reyes','Rice','Ross','Roy','Ryan','Scott','Shah','Sharp','Silva','Singh','Smith','Stone','Sun','Tran','Vega','Wade','Walsh','Wang','Ward','Webb','West','White','Wolf','Wong','Wood','Wright','Wu','Xu','Yang','York','Young','Zhao','Zhou']

  const ALL_SOLUTIONS = [
    'Email Marketing','SMS Marketing','Loyalty & Rewards','Subscription Management',
    'Returns Management','Customer Support','Shipping & Fulfillment','Inventory Management',
    'Analytics & Reporting','Payment Processing','Search & Discovery','ERP / Operations',
    'Personalization','Reviews & UGC','Marketplace Integration','B2B Commerce',
    'Headless Commerce','AI & Automation',
  ]

  // Deterministic pick of N solutions from an array, seeded by index
  function pickSolutions(index: number, count: number): string[] {
    const picked: string[] = []
    const pool = [...ALL_SOLUTIONS]
    let seed = index * 7 + 13
    for (let i = 0; i < count && pool.length > 0; i++) {
      seed = (seed * 31 + 17) % 997
      const idx = seed % pool.length
      picked.push(pool[idx])
      pool.splice(idx, 1)
    }
    return picked
  }

  const SEED_CATEGORIES = [
    {
      companies: [
        'Charlotte Tilbury DTC','ColourPop','Fenty Beauty DTC','Florence by Mills','Glossier',
        'Haus Labs','Huda Beauty DTC','IL MAKIAGE','Ilia Beauty','Jones Road','Kosas',
        'Kylie Cosmetics','Milk Makeup','Morphe','NARS DTC','Saie Beauty','Summer Fridays',
        'Tarte Cosmetics','Too Faced DTC','Tower 28','Victoria Beckham Beauty','Westman Atelier',
        'Beautycounter','Biossance','COSRX','CeraVe DTC','Drunk Elephant','Glow Recipe',
        'Herbivore Botanicals','Tatcha','Tula Skincare','Versed',
        'AG1 (Athletic Greens)','Hims & Hers','Oura','Peloton DTC','Therabody','Whoop',
      ],
      jobTitles: ['VP Marketing','Head of Brand','Director of DTC','VP Growth','Head of Product','Director of Ecommerce','VP Beauty','Head of Partnerships','Director of Operations','VP Customer Experience','Head of Retention','Director of Innovation','Head of Digital','VP Merchandising','Director of Marketing'],
    },
    {
      companies: [
        'Albany Park','Apt2B','Arhaus DTC','Article','Bear Mattress','Boll & Branch',
        'Brooklinen','Brooklyn Bedding','Buffy','Burrow','Cedar & Moss','Coyuchi',
        'Design Within Reach DTC','Eight Sleep','Floyd','Hawkins NY','Helix Sleep',
        'Interior Define','Interior Icons','Joybird','Parachute Home','Purple Innovation',
        'Rejuvenation','Room & Board DTC','Schoolhouse','Snowe','Tuft & Needle',
        'Visual Comfort DTC','Year & Day',
      ],
      jobTitles: ['VP Marketing','Head of Product','Director of Ecommerce','VP Operations','Head of Growth','Director of Sales','VP Supply Chain','Head of Design','Director of DTC','VP Customer Experience','Head of Merchandising','Director of Brand','VP Logistics','Head of Analytics','Director of Retail'],
    },
    {
      companies: [
        'Baked by Melissa DTC','Brightland','Burlap & Barrel','Compartés','Diaspora Co',
        'Goldbelly','Jacobsen Salt',"Jeni's Ice Cream",'Levain Bakery DTC','Magic Spoon',
        'Milk Bar DTC','Poppi','Salt & Straw DTC','Sugarfina','Vosges',
        'A Pup Above','BarkBox DTC','Ollie','Open Farm','Spot & Tango',
        'Sundays for Dogs',"The Farmer's Dog",'Wild One',
        '4moms DTC','BIBS','Ergobaby DTC','Kyte Baby','Little Sleepies',
      ],
      jobTitles: ['VP Marketing','Head of Growth','Director of Brand','VP Ecommerce','Head of Product','Director of Operations','VP Sales','Head of DTC','Director of Partnerships','VP Customer Experience','Head of Supply Chain','Director of Digital','VP Innovation','Head of Analytics','Director of Merchandising'],
    },
    {
      companies: [
        'Stripe Commerce','Vercel DTC','Twilio Engage','Segment CDP','Amplitude Analytics',
        'LaunchDarkly','Datadog Commerce','Snowflake Retail','Fivetran','dbt Labs',
        'Algolia Search','Contentful CMS','Sanity CMS','Builder.io','Netlify Commerce',
        'Cloudflare Edge','Sentry','PlanetScale','Supabase','Braze',
        'Iterable','Heap Analytics','Mixpanel','FullStory','Hotjar',
        'Optimizely','Split.io','Census','Rudderstack','Statsig',
      ],
      jobTitles: ['VP Engineering','Head of Platform','Director of Data','VP Product','Head of Infrastructure','Director of Engineering','VP Technology','Head of AI','Director of Analytics','VP Architecture','Head of DevOps','Director of SRE','VP Data Science','Head of Security','Director of Product'],
    },
  ]

  const TARGET_ATTENDEES = 1000
  const existingAttendees = demoUsers.filter(u => u.role === 'ATTENDEE').length + attendeeUsers.length
  const toGenerate = TARGET_ATTENDEES - existingAttendees
  const perCategory = Math.floor(toGenerate / SEED_CATEGORIES.length)
  const remainder = toGenerate % SEED_CATEGORIES.length

  console.log(`  Generating ${toGenerate} additional attendees (target: ${TARGET_ATTENDEES}, ${SEED_CATEGORIES.length} categories)...`)
  let genIdx = 0
  for (let catIdx = 0; catIdx < SEED_CATEGORIES.length; catIdx++) {
    const cat = SEED_CATEGORIES[catIdx]
    const count = perCategory + (catIdx < remainder ? 1 : 0)
    for (let j = 0; j < count; j++) {
      const first = FIRST_NAMES[genIdx % FIRST_NAMES.length]
      const last = LAST_NAMES[Math.floor(genIdx / FIRST_NAMES.length) % LAST_NAMES.length]
      const suffix = Math.floor(genIdx / (FIRST_NAMES.length * LAST_NAMES.length))
      const nameSuffix = suffix > 0 ? ` ${suffix}` : ''
      const emailSuffix = suffix > 0 ? `${suffix}` : ''
      const company = cat.companies[j % cat.companies.length]
      const jobTitle = cat.jobTitles[j % cat.jobTitles.length]
      const email = `${first.toLowerCase()}.${last.toLowerCase()}${emailSuffix}@demo.com`
      const id = `gen-attendee-${String(genIdx).padStart(4, '0')}`

      const seeking = pickSolutions(genIdx, 2 + (genIdx % 2))      // 2–3 solutions seeking
      const offering = pickSolutions(genIdx + 500, 1 + (genIdx % 2)) // 1–2 solutions offering

      await upsertUser({
        id,
        email,
        name: `${first} ${last}${nameSuffix}`,
        role: 'ATTENDEE',
        password: demoHash,
        company,
        jobTitle,
        image: attendeeHeadshot(genIdx + demoUsers.length + attendeeUsers.length),
        // Required by the attendee onboarding gate — without these two, every
        // generated attendee lands on the onboarding checklist instead of the app.
        companySize: COMPANY_SIZES[genIdx % COMPANY_SIZES.length],
        annualRevenue: REVENUE_RANGES[genIdx % REVENUE_RANGES.length],
        solutionsSeeking: JSON.stringify(seeking),
        solutionsOffering: JSON.stringify(offering),
      })
      genIdx++
    }
  }

  // ── Clean up users not in seed ──────────────────────────────────────────
  //
  // ⚠️ DESTRUCTIVE ON A LIVE DEMO DATABASE. This deletes every user whose id is
  // not in the list below. As of 2026-07-29 the working demo dataset was NOT
  // produced by this script — its ~560 loginable accounts carry cuid-style ids
  // and real vendor-domain emails, none of the `gen-attendee-*` ids generated
  // here — so running this seed against it wipes the entire demo population and
  // replaces it with freshly generated accounts.
  //
  // To repair specific profile fields without destroying accounts, use
  // scripts/backfill-onboarding-required-fields.mjs instead.
  const allSeededIds = [
    ...demoUsers.map(u => u.id),
    ...attendeeUsers.map(u => u.id),
    ...Array.from({ length: toGenerate }, (_, i) => `gen-attendee-${String(i).padStart(4, '0')}`),
  ]
  const { count: deletedUsers } = await prisma.user.deleteMany({
    where: { id: { notIn: allSeededIds } },
  })
  if (deletedUsers > 0) console.log(`  Removed ${deletedUsers} non-seeded users`)

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
  console.log(`   Test accounts: ${demoUsers.length} (wbr@test.com, stephcurry@test.com, sponsor@test.com — all password123)`)
  console.log(`   Gate demonstration accounts (deliberately blocked, password123):`)
  console.log(`     - onboarding-demo@test.com        blocked on its own profile (solutionsSeeking empty)`)
  console.log(`     - sponsor-onboarding-demo@test.com blocked on ${GATE_DEMO_SPONSOR.name} (no contact name or email)`)
  console.log(`   Attendee users: ${attendeeUsers.length} (jordan@demo.com/demo123, etc.)`)
  console.log(`   Chat: General channel + members`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
