import { PrismaClient } from '@prisma/client'

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
      console.error('[seed-meetings] Turso adapter failed, using local:', e?.message)
    }
  }

  console.log('💾 Using local SQLite')
  return new PrismaClient()
}

const prisma = createPrismaClient()

async function main() {
  console.log('🌱 Seeding meeting requests...')

  await prisma.meetingRequest.deleteMany({})
  await prisma.sponsorMeeting.deleteMany({})
  await prisma.sessionBookmark.deleteMany({})

  // ── Attendee users ─────────────────────────────────────────────────────────
  const u = {
    SC: 'demo-attendee-steph',        // Steph Curry — Point Guard, Golden State
    JL: 'cmnf5o3zh0000o6gl8ph6p741', // Jordan Lee — VP Sales, Arhaus DTC
    MP: 'cmnf5o3zk0003o6gl1dkbwyba', // Maya Patel — Head of DTC, Urban Decay
    CN: 'cmnf5o3zm0006o6gljz3rs2fi', // Chris Nakamura — VP Customer Success, Noihsaf Bazaar
    AB: 'cmnf5o3zo0009o6gloybowz8b', // Aaliyah Brooks — VP Growth, Entireworld
    ST: 'cmnf5o3zq000co6gl2ahjeodc', // Sam Torres — VP Engineering, Boohoo DTC
    PS: 'cmnf5o3zt000fo6glimp8sdgg', // Priya Singh — Selfridges Digital
    DK: 'cmnf5o3zv000io6gldzpvj2ep', // Daniel Kim — Head of Finance, ColourPop
    ZA: 'cmnf5o3zx000lo6glvu1jfhtq', // Zoe Andersen — VP Revenue, Year & Day
    MB: 'cmnf5o3zy000oo6glzil6hssh', // Marcus Bell — Head of Retention, 4moms DTC
    LH: 'cmnf5o400000ro6glk0vwyxke', // Leila Hassan — COO, Roman Health
    TE: 'cmnf5o401000uo6gl5arc1yns', // Tom Eriksen — eCommerce Strategist, Olive & Piper
    NV: 'cmnf5o403000xo6glueacjfk4', // Nina Vasquez — Director of Marketplace, Oura
    KO: 'cmnf5o4050010o6gly4ukzmah', // Kwesi Owusu — CEO, SK-II DTC
    HS: 'cmnf5o4060013o6glxmcmr2r8', // Hana Suzuki — VP Growth, SSENSE
    FW: 'cmnf5o4080016o6glvytz0mcq', // Felix Wagner — Founder, Cedar & Moss
    AD: 'cmnf5o4090019o6gl06nnhzc0', // Amara Diallo — VP Revenue, Depop
    RO: 'cmnf5o40b001co6gl8j8dafx3', // Ryan O'Brien — COO, Beautycounter
    SM: 'cmnf5o40c001fo6gljtwj9gk5', // Sophie Müller — Co-Founder, Boohoo DTC
    JO: 'cmnf5o40e001io6glgvzi0wil', // James Osei — Director of Retail, Glossier
    CB: 'cmnf5o40g001lo6gld2txewt2', // Chloe Beaumont — Head of Wholesale, Kylie Cosmetics
  }

  // ── Sponsors ───────────────────────────────────────────────────────────────
  const s = {
    SHO: 'cmngb2h4h0000vm28ssjt1m0z', // Shopify — PLATINUM
    BC:  'cmngb2h4h0001vm2889slafvy', // BigCommerce — PLATINUM
    TER: 'cmngb2h4h0007vm28mbcpxjg5', // Tailor ERP — PLATINUM
    SS:  'cmngb2h4h0002vm28jsro8se9', // ShipStation — GOLD
    LR:  'cmngb2h4h0003vm281j76qc4e', // Loop Returns — GOLD
    KL:  'cmngb2h4h0004vm28nn3rme1o', // Klaviyo — GOLD
    GOR: 'cmngb2h4h0005vm28mg7g52fh', // Gorgias — GOLD
    RC:  'cmngb2h4h0006vm28enbuld34', // Recharge — GOLD
    YO:  'cmngb2h4h0008vm28i6338gp9', // Yotpo — SILVER
    ATT: 'cmngb2h4h0009vm28no2j8b6p', // Attentive — SILVER
    PSC: 'cmngb2h4h000avm28j2vs0j0k', // Postscript — SILVER
    NAR: 'cmngb2h4h000cvm28dh6mc5bh', // Narvar — SILVER
    EXT: 'cmngb2h4h000dvm289vmdaki3', // Extensiv — SILVER
    GC:  'cmngbix6w0001fwpj6dwlwyri', // Google Cloud — SILVER
    OK:  'cmngb2h4h000evm286epvlnxs', // Okendo — BRONZE
    OG:  'cmngb2h4h000fvm28fzk7rs4l', // Ordergroove — BRONZE
    SKI: 'cmngb2h4h000gvm28202yjuux', // Skio — BRONZE
    AS:  'cmngb2h4h000hvm28vn41ytgc', // AfterShip — BRONZE
    SR:  'cmngb2h4h000ivm281ido85fq', // Searchspring — BRONZE
    RE:  'cmngb2h4h000jvm28zwqqu86h', // Rebuy Engine — BRONZE
  }

  const tb = (d: number, slot: number) => `tb-d${d}-s${slot}`

  // ══════════════════════════════════════════════════════════════════════════
  // CONFIRMED sponsor meetings — each sponsor gets 10-15 confirmed meetings
  // Time blocks are shared across sponsors (capacity increased to 20)
  // Format: [requesterId, sponsorId, timeBlockId, message]
  // ══════════════════════════════════════════════════════════════════════════
  const confirmedSponsor: [string, string, string, string][] = [
    // ── Shopify (PLATINUM) — 15 confirmed ──
    [u.JL, s.SHO, tb(1,1), "Hi Shopify — Jordan from Arhaus DTC. We're on Plus and hitting scaling issues with our catalog. Would love 30 mins to discuss your enterprise roadmap."],
    [u.ST, s.SHO, tb(1,2), "Hey Shopify — Sam Torres, VP Engineering at Boohoo DTC. We want to talk headless architecture and the Hydrogen roadmap for our next replatform phase."],
    [u.LH, s.SHO, tb(1,3), "Hi Shopify — Leila Hassan, COO at Roman Health. Complex subscription and regulatory requirements. Need to talk compliance-ready commerce."],
    [u.NV, s.SHO, tb(1,4), "Hi Shopify — Nina Vasquez from Oura. We're launching a B2B marketplace component and want to understand your B2B commerce features."],
    [u.FW, s.SHO, tb(1,5), "Hey Shopify — Felix Wagner from Cedar & Moss. Migrating from WooCommerce and want to scope a Shopify Plus migration for furniture."],
    [u.SM, s.SHO, tb(1,6), "Hi Shopify — Sophie Müller, Co-Founder at Boohoo DTC EU. Scaling the European operation. Need to talk Markets, VAT, and multi-currency."],
    [u.MP, s.SHO, tb(2,1), "Hey Shopify — Maya from Urban Decay DTC. Revisiting what Plus can do for our next growth phase. Beauty-specific features are key."],
    [u.KO, s.SHO, tb(2,2), "Hi Shopify — Kwesi from SK-II DTC. Strategic review — maximizing Plus before committing to the next 3 years globally, especially APAC."],
    [u.CN, s.SHO, tb(2,3), "Hi Shopify — Chris from Noihsaf Bazaar. Custom marketplace on Shopify — is it the right fit for a curated multi-vendor model?"],
    [u.AB, s.SHO, tb(2,4), "Hey Shopify — Aaliyah from Entireworld. Growth-focused discussion around Shopify's acquisition and retention tools."],
    [u.PS, s.SHO, tb(2,5), "Hi Shopify — Priya from Selfridges Digital. Building a new digital brand and want a scalable platform from day one."],
    [u.DK, s.SHO, tb(2,6), "Hey Shopify — Daniel from ColourPop. Finance angle — total cost of ownership on Plus vs. enterprise headless alternatives."],
    [u.HS, s.SHO, tb(2,7), "Hi Shopify — Hana from SSENSE. Luxury fashion on Shopify — how do you support high-AOV, editorial-heavy storefronts?"],
    [u.RO, s.SHO, tb(2,8), "Hey Shopify — Ryan from Beautycounter. Clean beauty compliance on Shopify Plus — ingredient disclosures, regulatory flows."],
    [u.TE, s.SHO, tb(2,9), "Hi Shopify — Tom from Olive & Piper. Small brand, big ambitions. What does the growth path look like from Basic to Plus?"],

    // ── BigCommerce (PLATINUM) — 12 confirmed ──
    [u.PS, s.BC, tb(1,2), "Hi BigCommerce — Priya from Selfridges Digital. Scalable platform evaluation. API flexibility is our top priority."],
    [u.ST, s.BC, tb(1,4), "Hey BigCommerce — Sam from Boohoo DTC. Full platform evaluation for 2026. Composable commerce and API depth matter most."],
    [u.NV, s.BC, tb(1,6), "Hi BigCommerce — Nina from Oura. Your B2B capabilities are interesting for our wholesale expansion plans."],
    [u.SM, s.BC, tb(1,8), "Hey BigCommerce — Sophie from Boohoo DTC EU. Evaluating composable commerce for 2026. How does BC compare on headless?"],
    [u.LH, s.BC, tb(2,1), "Hi BigCommerce — Leila from Roman Health. MACH approach is interesting for our regulatory compliance use case."],
    [u.JL, s.BC, tb(2,3), "Hey BigCommerce — Jordan from Arhaus DTC. Due diligence on platform alternatives for large-format retail."],
    [u.ZA, s.BC, tb(2,5), "Hi BigCommerce — Zoe from Year & Day. Subscription-first commerce — how does BigCommerce handle recurring revenue natively?"],
    [u.CN, s.BC, tb(2,7), "Hey BigCommerce — Chris from Noihsaf Bazaar. Multi-vendor marketplace capabilities — is BC the right fit?"],
    [u.AD, s.BC, tb(2,2), "Hi BigCommerce — Amara from Depop. We're exploring platform options for our brand-direct side of the marketplace."],
    [u.FW, s.BC, tb(2,4), "Hey BigCommerce — Felix from Cedar & Moss. Small brand looking at enterprise-grade features without enterprise pricing."],
    [u.MB, s.BC, tb(2,6), "Hi BigCommerce — Marcus from 4moms. How does BC handle complex product configurations and bundles?"],
    [u.KO, s.BC, tb(2,8), "Hey BigCommerce — Kwesi from SK-II DTC. Global commerce needs — multi-currency, multi-language, regional tax compliance."],

    // ── Tailor ERP (PLATINUM) — 13 confirmed ──
    [u.DK, s.TER, tb(1,2), "Hi Tailor — Daniel from ColourPop. Our current ERP is holding us back. How does Tailor handle high-SKU beauty brands?"],
    [u.RO, s.TER, tb(1,1), "Hi Tailor — Ryan O'Brien, COO at Beautycounter. Complex compliance requirements — clean beauty cert plus FTC traceability."],
    [u.LH, s.TER, tb(1,5), "Hey Tailor — rebuilding our operations stack end-to-end. ERP is the backbone. Leila Hassan from Roman Health."],
    [u.ST, s.TER, tb(1,7), "Hi Tailor — Sam Torres from Boohoo DTC. Our ERP is legacy and we're starting the evaluation process for 2026."],
    [u.JL, s.TER, tb(2,1), "Hey Tailor — Jordan from Arhaus DTC. Furniture ERP is a pain point. How does Tailor handle large-format inventory and fulfillment?"],
    [u.KO, s.TER, tb(2,3), "Hi Tailor — Kwesi from SK-II DTC. Global brand, multi-currency, regional ops. Our current ERP can't keep up."],
    [u.NV, s.TER, tb(2,5), "Hey Tailor — Nina from Oura. Health tech inventory with serial numbers and warranty tracking. Can Tailor handle this?"],
    [u.MP, s.TER, tb(2,7), "Hi Tailor — Maya from Urban Decay. Beauty inventory with expiration dates, lot tracking, and regulatory holds."],
    [u.SM, s.TER, tb(2,9), "Hey Tailor — Sophie from Boohoo DTC EU. Multi-entity, multi-currency ERP for our EU operations. Current system is duct tape."],
    [u.CN, s.TER, tb(1,9), "Hi Tailor — Chris from Noihsaf Bazaar. Marketplace order management is chaotic. Need an ERP that handles multi-vendor financials."],
    [u.ZA, s.TER, tb(2,10), "Hey Tailor — Zoe from Year & Day. Subscription revenue recognition and inventory forecasting. Our spreadsheets aren't cutting it."],
    [u.FW, s.TER, tb(1,3), "Hi Tailor — Felix from Cedar & Moss. Small brand growing fast. When does it make sense to invest in a real ERP?"],
    [u.CB, s.TER, tb(2,4), "Hey Tailor — Chloe from Kylie Cosmetics. Wholesale + DTC on one ERP. How does Tailor unify those channels?"],

    // ── ShipStation (GOLD) — 12 confirmed ──
    [u.PS, s.SS, tb(1,4), "Hey ShipStation — Priya from Selfridges Digital. Shipping complexity is our biggest ops challenge. Multi-carrier at scale."],
    [u.DK, s.SS, tb(1,6), "Hi ShipStation — Daniel from ColourPop. Finance wants to understand total cost of ownership at our shipping volume."],
    [u.ST, s.SS, tb(1,8), "Hey ShipStation — Sam from Boohoo DTC. API depth and webhook reliability are engineering priorities for our integration."],
    [u.RO, s.SS, tb(2,1), "Hi ShipStation — Ryan from Beautycounter. Multi-carrier, multi-warehouse, direct + retail shipping management."],
    [u.JO, s.SS, tb(2,3), "Hey ShipStation — James from Glossier. Mix of DTC and wholesale. Multi-channel shipping is the pain point."],
    [u.JL, s.SS, tb(2,5), "Hi ShipStation — Jordan from Arhaus DTC. Large-format shipping is expensive and complex. Rate shopping is critical."],
    [u.SM, s.SS, tb(2,7), "Hey ShipStation — Sophie from Boohoo DTC EU. Cross-border shipping from UK warehouses to EU customers post-Brexit."],
    [u.AB, s.SS, tb(1,10), "Hi ShipStation — Aaliyah from Entireworld. Growing fast and our shipping setup is falling apart. Need a scalable solution."],
    [u.NV, s.SS, tb(2,9), "Hey ShipStation — Nina from Oura. Health devices require careful handling and tracking. How does ShipStation handle that?"],
    [u.LH, s.SS, tb(1,2), "Hi ShipStation — Leila from Roman Health. Regulated products shipping with temperature requirements. What can ShipStation do?"],
    [u.MP, s.SS, tb(2,2), "Hey ShipStation — Maya from Urban Decay. Hazmat cosmetics shipping is a real challenge. Who handles that well?"],
    [u.HS, s.SS, tb(2,4), "Hi ShipStation — Hana from SSENSE. Luxury fashion shipping with insurance and signature requirements. Let's talk."],

    // ── Loop Returns (GOLD) — 11 confirmed ──
    [u.FW, s.LR, tb(1,7), "Hi Loop Returns — Felix from Cedar & Moss. Large-format freight returns are complicated. Does Loop handle that?"],
    [u.JL, s.LR, tb(1,9), "Hey Loop Returns — Jordan from Arhaus DTC. Returns are a big ops cost for furniture. Curious about higher-AOV categories."],
    [u.DK, s.LR, tb(2,1), "Hi Loop Returns — Daniel from ColourPop. High return rates on some SKUs. Can Loop's analytics help us understand drivers?"],
    [u.KO, s.LR, tb(2,3), "Hey Loop Returns — Kwesi from SK-II DTC. Luxury returns need a premium experience. How does Loop handle high-end goods?"],
    [u.JO, s.LR, tb(2,5), "Hi Loop Returns — James from Glossier. Gift returns and exchanges are a big volume for us. How does Loop handle gifting flows?"],
    [u.MP, s.LR, tb(2,7), "Hey Loop Returns — Maya from Urban Decay. Beauty returns with health/safety considerations. What's your approach?"],
    [u.CB, s.LR, tb(1,5), "Hi Loop Returns — Chloe from Kylie Cosmetics. High volume of color-match returns. Need better exchange flow to retain revenue."],
    [u.AB, s.LR, tb(2,9), "Hey Loop Returns — Aaliyah from Entireworld. Turning returns into exchanges is our key metric. What's the typical uplift?"],
    [u.HS, s.LR, tb(1,3), "Hi Loop Returns — Hana from SSENSE. Luxury fashion returns are expensive. How does Loop help retain revenue?"],
    [u.AD, s.LR, tb(2,10), "Hey Loop Returns — Amara from Depop. Peer-to-peer return flows — can Loop integrate with marketplace models?"],
    [u.SM, s.LR, tb(2,8), "Hi Loop Returns — Sophie from Boohoo DTC EU. Cross-border returns from EU to UK warehouse. This is a nightmare. Help."],

    // ── Klaviyo (GOLD) — 14 confirmed ──
    [u.AB, s.KL, tb(1,1), "Hi Klaviyo — Aaliyah from Entireworld. Growth is our north star and owned channels are critical. What's working in 2025?"],
    [u.JL, s.KL, tb(1,3), "Hey Klaviyo — Jordan Lee from Arhaus DTC. Email flows drive huge revenue but segmentation needs work."],
    [u.KO, s.KL, tb(1,2), "Hi Klaviyo — Kwesi from SK-II DTC. Scaling owned channels globally, especially APAC markets. Can Klaviyo grow with us?"],
    [u.TE, s.KL, tb(1,5), "Hey Klaviyo — Tom from Olive & Piper. Email is our highest ROI channel but we're not fully leveraging AI personalization."],
    [u.HS, s.KL, tb(1,7), "Hi Klaviyo — Hana from SSENSE. Global suppression logic and inactive segment strategy are top priorities."],
    [u.ZA, s.KL, tb(2,1), "Hey Klaviyo — Zoe from Year & Day. Email performance has plateaued. Need fresh strategy eyes on our flows."],
    [u.CB, s.KL, tb(2,3), "Hi Klaviyo — Chloe from Kylie Cosmetics. Large subscriber list but engagement declining. List health and re-engagement."],
    [u.MB, s.KL, tb(2,5), "Hey Klaviyo — Marcus from 4moms DTC. Retention email is my domain. Want to see predictive churn modeling."],
    [u.SM, s.KL, tb(2,7), "Hi Klaviyo — Sophie from Boohoo DTC EU. Migrating from another ESP. Klaviyo is top of list. Migration support?"],
    [u.MP, s.KL, tb(2,9), "Hey Klaviyo — Maya from Urban Decay. Beauty brand email — what subject lines, send times, and segments work best?"],
    [u.DK, s.KL, tb(2,2), "Hi Klaviyo — Daniel from ColourPop. Finance wants to understand Klaviyo's attribution model and true revenue impact."],
    [u.PS, s.KL, tb(2,4), "Hey Klaviyo — Priya from Selfridges Digital. Building from scratch. What does a best-in-class email program look like day one?"],
    [u.RO, s.KL, tb(2,6), "Hi Klaviyo — Ryan from Beautycounter. Compliance-heavy email for regulated products. How does Klaviyo handle that?"],
    [u.AD, s.KL, tb(2,8), "Hey Klaviyo — Amara from Depop. Marketplace email — seller and buyer communications on one platform?"],

    // ── Gorgias (GOLD) — 11 confirmed ──
    [u.CN, s.GOR, tb(1,1), "Hi Gorgias — Chris from Noihsaf Bazaar. Scaling CS across multiple channels. Need clean integration with custom marketplace."],
    [u.JL, s.GOR, tb(1,5), "Hey Gorgias — Jordan from Arhaus DTC. Consolidating our CS stack and you're at the top of the list."],
    [u.KO, s.GOR, tb(1,4), "Hi Gorgias — Kwesi from SK-II DTC. High-touch CS model. How does your AI deflection maintain quality while scaling volume?"],
    [u.MP, s.GOR, tb(1,7), "Hey Gorgias — Maya from Urban Decay. Beauty CS is complex — product questions, shade matching, ingredient concerns."],
    [u.AD, s.GOR, tb(2,1), "Hi Gorgias — Amara from Depop. Support volume is high and current tool isn't scaling. Automation and macro capabilities?"],
    [u.RO, s.GOR, tb(2,3), "Hey Gorgias — Ryan from Beautycounter. Compliance-sensitive CS. How does Gorgias handle regulated product inquiries?"],
    [u.LH, s.GOR, tb(2,5), "Hi Gorgias — Leila from Roman Health. Health product CS with HIPAA-adjacent requirements. What can Gorgias offer?"],
    [u.HS, s.GOR, tb(2,7), "Hey Gorgias — Hana from SSENSE. Luxury CS — white glove, high-touch. Can Gorgias maintain premium feel at scale?"],
    [u.FW, s.GOR, tb(2,9), "Hi Gorgias — Felix from Cedar & Moss. Small team, big CS ambitions. How does Gorgias work for lean teams?"],
    [u.ZA, s.GOR, tb(2,2), "Hey Gorgias — Zoe from Year & Day. Revenue through support — upsells in tickets. Is that a real play with Gorgias?"],
    [u.CB, s.GOR, tb(2,4), "Hi Gorgias — Chloe from Kylie Cosmetics. Social DM support is exploding. How does Gorgias handle Instagram and TikTok?"],

    // ── Recharge (GOLD) — 12 confirmed ──
    [u.MP, s.RC, tb(1,3), "Hey Recharge — Maya from Urban Decay. Subscription boxes for bundles. Implementation timelines and LTV data?"],
    [u.ZA, s.RC, tb(1,2), "Hi Recharge — Zoe from Year & Day. Subscriptions are our highest-LTV segment. New analytics dashboard and data portability?"],
    [u.AD, s.RC, tb(1,1), "Hey Recharge — Amara from Depop. Launching a reseller subscription plan. How does Recharge handle marketplace-style subs?"],
    [u.MB, s.RC, tb(1,4), "Hi Recharge — Marcus from 4moms DTC. Baby gear subscriptions for lower-frequency, higher-AOV products. What works?"],
    [u.CB, s.RC, tb(1,6), "Hey Recharge — Chloe from Kylie Cosmetics. Beauty subscription boxes are huge for us. Customization and flexibility?"],
    [u.JL, s.RC, tb(2,1), "Hi Recharge — Jordan from Arhaus DTC. Home goods subscription — curated collections. Is that a use case you support?"],
    [u.KO, s.RC, tb(2,3), "Hey Recharge — Kwesi from SK-II DTC. Premium skincare subscriptions with personalization. How sophisticated can we get?"],
    [u.LH, s.RC, tb(2,5), "Hi Recharge — Leila from Roman Health. Health supplement subscriptions with compliance requirements. How does Recharge handle that?"],
    [u.TE, s.RC, tb(2,7), "Hey Recharge — Tom from Olive & Piper. Jewelry subscription model — is this a growing category on Recharge?"],
    [u.PS, s.RC, tb(2,9), "Hi Recharge — Priya from Selfridges Digital. Building subscriptions from scratch. Best practices for luxury retail?"],
    [u.HS, s.RC, tb(2,2), "Hey Recharge — Hana from SSENSE. Fashion subscription is tricky — how does Recharge handle style preferences and sizing?"],
    [u.NV, s.RC, tb(2,4), "Hi Recharge — Nina from Oura. Wearable subscription model for ongoing health insights. Is that a fit for Recharge?"],

    // ── Yotpo (SILVER) — 11 confirmed ──
    [u.CB, s.YO, tb(1,1), "Hi Yotpo — Chloe from Kylie Cosmetics. Massive review backlog — want to activate content more effectively. Visual UGC and loyalty."],
    [u.AD, s.YO, tb(1,3), "Hey Yotpo — Amara from Depop. Reviews and social proof are core to marketplace trust. Community features integration?"],
    [u.TE, s.YO, tb(2,1), "Hi Yotpo — Tom from Olive & Piper. Solid review volume but want to activate UGC across more touchpoints. Loyalty + reviews bundle."],
    [u.JL, s.YO, tb(2,3), "Hey Yotpo — Jordan from Arhaus DTC. Reviews are underutilized in our acquisition funnel. How does Yotpo change that?"],
    [u.CN, s.YO, tb(2,5), "Hi Yotpo — Chris from Noihsaf Bazaar. Marketplace social proof — seller reviews, product reviews, trust signals."],
    [u.MP, s.YO, tb(2,7), "Hey Yotpo — Maya from Urban Decay. Beauty UGC is gold for us. Photo reviews and video testimonials at scale."],
    [u.ZA, s.YO, tb(1,5), "Hi Yotpo — Zoe from Year & Day. Home goods reviews with room photos. How does visual UGC work for lifestyle brands?"],
    [u.KO, s.YO, tb(1,7), "Hey Yotpo — Kwesi from SK-II DTC. Premium skincare reviews need credibility. How does Yotpo handle verified purchases?"],
    [u.HS, s.YO, tb(2,9), "Hi Yotpo — Hana from SSENSE. Fashion reviews are different — fit, quality, styling. How does Yotpo handle attribute reviews?"],
    [u.RO, s.YO, tb(1,9), "Hey Yotpo — Ryan from Beautycounter. Clean beauty reviews with ingredient-focused attributes. Can Yotpo customize that?"],
    [u.MB, s.YO, tb(2,10), "Hi Yotpo — Marcus from 4moms DTC. Baby product reviews drive trust like nothing else. Loyalty program for parents?"],

    // ── Attentive (SILVER) — 11 confirmed ──
    [u.MP, s.ATT, tb(1,1), "Hi Attentive — Maya from Urban Decay DTC. SMS is growing and I want benchmarks for beauty brands."],
    [u.AB, s.ATT, tb(1,5), "Hey Attentive — Aaliyah from Entireworld. Heavy A/B tests on SMS. Need a platform that keeps up with experimentation."],
    [u.HS, s.ATT, tb(1,3), "Hi Attentive — Hana from SSENSE. SMS underperforming vs benchmarks for luxury fashion. Let's troubleshoot."],
    [u.JL, s.ATT, tb(2,1), "Hey Attentive — Jordan from Arhaus DTC. SMS for high-AOV products — what's the right approach? Furniture isn't impulse."],
    [u.CB, s.ATT, tb(2,3), "Hi Attentive — Chloe from Kylie Cosmetics. Drop alerts and limited edition SMS. How do you handle urgency campaigns?"],
    [u.KO, s.ATT, tb(2,5), "Hey Attentive — Kwesi from SK-II DTC. Premium SMS — how do you maintain brand voice in text messages?"],
    [u.ZA, s.ATT, tb(2,7), "Hi Attentive — Zoe from Year & Day. Low-frequency SMS for considered purchases. Quality over quantity approach."],
    [u.AD, s.ATT, tb(2,9), "Hey Attentive — Amara from Depop. Marketplace SMS for both sellers and buyers. Is that a use case you support?"],
    [u.LH, s.ATT, tb(1,7), "Hi Attentive — Leila from Roman Health. Compliance-heavy SMS for health products. TCPA and regulatory guardrails."],
    [u.DK, s.ATT, tb(1,9), "Hey Attentive — Daniel from ColourPop. Finance angle — what's the real ROI on SMS vs. email for beauty brands?"],
    [u.RO, s.ATT, tb(2,10), "Hi Attentive — Ryan from Beautycounter. Clean beauty SMS with ingredient education. Consultative selling via text."],

    // ── Postscript (SILVER) — 10 confirmed ──
    [u.AB, s.PSC, tb(1,3), "Hey Postscript — Aaliyah from Entireworld. Best-in-class for SMS. How would your flows move our repeat purchase rate?"],
    [u.HS, s.PSC, tb(1,5), "Hi Postscript — Hana from SSENSE. Luxury fashion SMS — compliance controls and tone guardrails for premium brands."],
    [u.MP, s.PSC, tb(1,7), "Hey Postscript — Maya from Urban Decay DTC. Adding SMS in Q4. Postscript came highly recommended."],
    [u.JL, s.PSC, tb(2,2), "Hi Postscript — Jordan from Arhaus DTC. Furniture SMS — is this even a viable channel? Show me the data."],
    [u.ZA, s.PSC, tb(2,4), "Hey Postscript — Zoe from Year & Day. Subscription renewal reminders via SMS. What's the opt-in and open rate?"],
    [u.TE, s.PSC, tb(2,6), "Hi Postscript — Tom from Olive & Piper. Small brand, lean marketing team. Is Postscript manageable without a dedicated SMS person?"],
    [u.CB, s.PSC, tb(2,8), "Hey Postscript — Chloe from Kylie Cosmetics. Flash sale SMS performance — what's the best practice for limited drops?"],
    [u.DK, s.PSC, tb(2,10), "Hi Postscript — Daniel from ColourPop. Revenue attribution for SMS — how transparent is your reporting?"],
    [u.KO, s.PSC, tb(1,9), "Hey Postscript — Kwesi from SK-II DTC. International SMS — do you support APAC markets with local compliance?"],
    [u.SM, s.PSC, tb(2,1), "Hi Postscript — Sophie from Boohoo DTC EU. EU SMS regulations are strict. How does Postscript handle GDPR?"],

    // ── Narvar (SILVER) — 10 confirmed ──
    [u.CN, s.NAR, tb(1,5), "Hi Narvar — Chris from Noihsaf Bazaar. Post-purchase is where we win or lose customers. Carrier network depth and EDD accuracy."],
    [u.JO, s.NAR, tb(1,1), "Hey Narvar — James from Glossier. Post-purchase is one of the most under-invested areas for us. What does good look like?"],
    [u.PS, s.NAR, tb(1,7), "Hi Narvar — Priya from Selfridges Digital. Delivery experience as a differentiator. Want to learn about your solution."],
    [u.RO, s.NAR, tb(2,1), "Hey Narvar — Ryan from Beautycounter. Post-purchase communication for regulated products — shipping updates and compliance."],
    [u.JL, s.NAR, tb(2,3), "Hi Narvar — Jordan from Arhaus DTC. Furniture delivery tracking — EDD for white glove service. Is Narvar set up for that?"],
    [u.MP, s.NAR, tb(2,5), "Hey Narvar — Maya from Urban Decay. Branded tracking pages that actually drive repeat purchases. Show me examples."],
    [u.KO, s.NAR, tb(2,7), "Hi Narvar — Kwesi from SK-II DTC. Premium unboxing communication — elevating the delivery experience for luxury."],
    [u.SM, s.NAR, tb(2,9), "Hey Narvar — Sophie from Boohoo DTC EU. Cross-border delivery tracking EU. Multiple carriers, multiple languages."],
    [u.FW, s.NAR, tb(1,9), "Hi Narvar — Felix from Cedar & Moss. Freight tracking for furniture. Customer anxiety is real on 8-week lead times."],
    [u.AD, s.NAR, tb(2,10), "Hey Narvar — Amara from Depop. Peer-to-peer shipping tracking. Can Narvar work for marketplace models?"],

    // ── Extensiv (SILVER) — 10 confirmed ──
    [u.ST, s.EXT, tb(1,6), "Hey Extensiv — Sam from Boohoo DTC. 3 warehouses, fragmented inventory ops. WMS capabilities walkthrough?"],
    [u.DK, s.EXT, tb(1,4), "Hi Extensiv — Daniel from ColourPop. Reviewing 3PL costs. Better WMS tooling is the key lever."],
    [u.RO, s.EXT, tb(1,8), "Hey Extensiv — Ryan from Beautycounter. Full ops audit in progress. 3PL and WMS priority for cost and speed."],
    [u.NV, s.EXT, tb(2,1), "Hi Extensiv — Nina from Oura. Scaling fulfillment and 3PL integrations are messy. Network and integration depth?"],
    [u.JL, s.EXT, tb(2,3), "Hey Extensiv — Jordan from Arhaus DTC. Large-format warehouse ops — how does Extensiv handle furniture fulfillment?"],
    [u.LH, s.EXT, tb(2,5), "Hi Extensiv — Leila from Roman Health. Regulated product warehousing — temperature, lot tracking, expiration."],
    [u.KO, s.EXT, tb(2,7), "Hey Extensiv — Kwesi from SK-II DTC. Global fulfillment network — APAC, NA, EU. Can Extensiv connect all three?"],
    [u.SM, s.EXT, tb(2,9), "Hi Extensiv — Sophie from Boohoo DTC EU. EU warehouse management. Fast fashion fulfillment at speed."],
    [u.MP, s.EXT, tb(2,2), "Hey Extensiv — Maya from Urban Decay. Beauty fulfillment with hazmat and fragile product handling requirements."],
    [u.HS, s.EXT, tb(2,4), "Hi Extensiv — Hana from SSENSE. Luxury fashion fulfillment — garment-on-hanger, tissue wrapping, premium packaging."],

    // ── Google Cloud (SILVER) — 10 confirmed ──
    [u.RO, s.GC, tb(1,3), "Hey Google Cloud — Ryan from Beautycounter. BigQuery and Vertex AI for demand forecasting use cases."],
    [u.LH, s.GC, tb(1,5), "Hi Google Cloud — Leila from Roman Health. Making infrastructure decisions for the next 3 years. GCP is shortlisted."],
    [u.ST, s.GC, tb(1,7), "Hey Google Cloud — Sam from Boohoo DTC. Cloud infrastructure for high-traffic ecommerce. Autoscaling and CDN."],
    [u.KO, s.GC, tb(2,1), "Hi Google Cloud — Kwesi from SK-II DTC. Global infrastructure — APAC-first with NA and EU presence. GCP regions matter."],
    [u.NV, s.GC, tb(2,3), "Hey Google Cloud — Nina from Oura. Health data infrastructure — compliance, encryption, HIPAA considerations."],
    [u.DK, s.GC, tb(2,5), "Hi Google Cloud — Daniel from ColourPop. Data warehouse costs — BigQuery vs alternatives for ecommerce analytics."],
    [u.JL, s.GC, tb(2,7), "Hey Google Cloud — Jordan from Arhaus DTC. Retail AI — product recommendations, visual search, demand forecasting."],
    [u.MP, s.GC, tb(2,9), "Hi Google Cloud — Maya from Urban Decay. Beauty AI — virtual try-on, shade matching, personalized recommendations."],
    [u.HS, s.GC, tb(2,2), "Hey Google Cloud — Hana from SSENSE. Fashion AI and visual search. How is GCP powering product discovery?"],
    [u.AB, s.GC, tb(2,4), "Hi Google Cloud — Aaliyah from Entireworld. Marketing analytics on BigQuery. Attribution modeling and customer segmentation."],

    // ── Okendo (BRONZE) — 10 confirmed ──
    [u.MP, s.OK, tb(1,5), "Hi Okendo — Maya from Urban Decay. Reviews and UGC core to conversion. AI review features for cosmetics catalog?"],
    [u.CB, s.OK, tb(1,3), "Hey Okendo — Chloe from Kylie Cosmetics. Attribute-based review flow impresses me. Migration from Bazaarvoice?"],
    [u.TE, s.OK, tb(1,7), "Hi Okendo — Tom from Olive & Piper. Reviews solid but not leveraging content enough. Latest UGC activation features?"],
    [u.AD, s.OK, tb(2,1), "Hey Okendo — Amara from Depop. Social proof in peer-to-peer marketplace. Attribute reviews for resale?"],
    [u.JL, s.OK, tb(2,3), "Hi Okendo — Jordan from Arhaus DTC. Furniture reviews with room photos. How does visual review content work?"],
    [u.ZA, s.OK, tb(2,5), "Hey Okendo — Zoe from Year & Day. Home goods reviews with lifestyle photography. Can Okendo facilitate that?"],
    [u.KO, s.OK, tb(2,7), "Hi Okendo — Kwesi from SK-II DTC. Premium skincare reviews — ingredient reviews, before/after photos."],
    [u.HS, s.OK, tb(2,9), "Hey Okendo — Hana from SSENSE. Fashion reviews with fit, quality, styling attributes. How granular can we get?"],
    [u.RO, s.OK, tb(2,2), "Hi Okendo — Ryan from Beautycounter. Clean beauty reviews focused on ingredient transparency and safety."],
    [u.MB, s.OK, tb(2,4), "Hey Okendo — Marcus from 4moms DTC. Baby product reviews — safety-focused attributes. Parents trust reviews above all."],

    // ── Ordergroove (BRONZE) — 10 confirmed ──
    [u.ZA, s.OG, tb(1,6), "Hi Ordergroove — Zoe from Year & Day. Embedded subscription model caught our eye. Pop-up vs embedded flows?"],
    [u.MB, s.OG, tb(1,8), "Hey Ordergroove — Marcus from 4moms DTC. Embedded subscriptions for baby products. Lower-frequency, higher-AOV."],
    [u.JL, s.OG, tb(2,1), "Hi Ordergroove — Jordan from Arhaus DTC. Home goods subscription — curated collections. Embedded subscription widget?"],
    [u.AD, s.OG, tb(2,3), "Hey Ordergroove — Amara from Depop. Marketplace subscription model. Can Ordergroove handle multi-seller subs?"],
    [u.KO, s.OG, tb(2,5), "Hi Ordergroove — Kwesi from SK-II DTC. Premium subscription experience. How does the embedded widget look for luxury?"],
    [u.MP, s.OG, tb(2,7), "Hey Ordergroove — Maya from Urban Decay. Beauty replenishment subscriptions. Auto-ship with customizable frequency."],
    [u.CB, s.OG, tb(2,9), "Hi Ordergroove — Chloe from Kylie Cosmetics. Subscription box model for limited edition collections."],
    [u.HS, s.OG, tb(1,10), "Hey Ordergroove — Hana from SSENSE. Fashion subscription — seasonal boxes or build-your-own. Is this viable?"],
    [u.LH, s.OG, tb(2,10), "Hi Ordergroove — Leila from Roman Health. Health supplement subscriptions with dosage tracking integration."],
    [u.TE, s.OG, tb(2,2), "Hey Ordergroove — Tom from Olive & Piper. Jewelry subscription for anniversaries and gifts. Niche but high-LTV."],

    // ── Skio (BRONZE) — 10 confirmed ──
    [u.ZA, s.SKI, tb(1,4), "Hey Skio — Zoe from Year & Day. Best Recharge alternative. Migration support and pricing conversation."],
    [u.MB, s.SKI, tb(1,6), "Hi Skio — Marcus from 4moms DTC. Cancellation flow tooling is what caught my attention. Churn is my #1 metric."],
    [u.JL, s.SKI, tb(2,2), "Hey Skio — Jordan from Arhaus DTC. Passwordless login for subscribers. Reducing friction in the sub portal."],
    [u.MP, s.SKI, tb(2,4), "Hi Skio — Maya from Urban Decay. Beauty subscription management UX. How does Skio's portal compare?"],
    [u.KO, s.SKI, tb(2,6), "Hey Skio — Kwesi from SK-II DTC. Subscription analytics and churn prediction. What data does Skio surface?"],
    [u.CB, s.SKI, tb(2,8), "Hi Skio — Chloe from Kylie Cosmetics. Subscriber management at scale. 100K+ subscribers — can Skio handle it?"],
    [u.AD, s.SKI, tb(2,10), "Hey Skio — Amara from Depop. Subscription model for resale membership. Is that a fit for Skio's platform?"],
    [u.HS, s.SKI, tb(1,8), "Hi Skio — Hana from SSENSE. Fashion subscription with style profile matching. Can Skio support that complexity?"],
    [u.LH, s.SKI, tb(1,10), "Hey Skio — Leila from Roman Health. Health subscriptions with regulatory compliance needs. Skip, pause, modify flows."],
    [u.TE, s.SKI, tb(2,1), "Hi Skio — Tom from Olive & Piper. Moving from Recharge to Skio. What does migration look like and timeline?"],

    // ── AfterShip (BRONZE) — 10 confirmed ──
    [u.CN, s.AS, tb(1,3), "Hey AfterShip — Chris from Noihsaf Bazaar. Post-purchase experience is a known pain point. Tracking and proactive notifications."],
    [u.JO, s.AS, tb(1,5), "Hi AfterShip — James from Glossier. Massive WISMO ticket volume. Can AfterShip deflect that and improve delivery experience?"],
    [u.PS, s.AS, tb(1,9), "Hey AfterShip — Priya from Selfridges Digital. Early stage, setting up post-purchase stack. AfterShip came recommended."],
    [u.FW, s.AS, tb(2,1), "Hi AfterShip — Felix from Cedar & Moss. Furniture tracking with long lead times. Proactive communication is critical."],
    [u.RO, s.AS, tb(2,3), "Hey AfterShip — Ryan from Beautycounter. Multi-carrier tracking with branded pages. Clean beauty aesthetic."],
    [u.JL, s.AS, tb(2,5), "Hi AfterShip — Jordan from Arhaus DTC. White glove delivery tracking. Customer anxiety management for big purchases."],
    [u.MP, s.AS, tb(2,7), "Hey AfterShip — Maya from Urban Decay. Branded tracking pages that drive product discovery and repurchase."],
    [u.KO, s.AS, tb(2,9), "Hi AfterShip — Kwesi from SK-II DTC. Premium delivery communication. Every touchpoint should feel luxury."],
    [u.SM, s.AS, tb(2,2), "Hey AfterShip — Sophie from Boohoo DTC EU. Cross-border tracking across 15+ carriers in EU markets."],
    [u.AD, s.AS, tb(2,4), "Hi AfterShip — Amara from Depop. Marketplace shipping tracking. Peer-to-peer with multiple carrier options."],

    // ── Searchspring (BRONZE) — 10 confirmed ──
    [u.NV, s.SR, tb(1,6), "Hey Searchspring — Nina from Oura. Product discovery experience is lagging. AI search with complex attribute filtering?"],
    [u.CN, s.SR, tb(1,8), "Hi Searchspring — Chris from Noihsaf Bazaar. Search relevancy lacking for marketplace catalog. Live demo of discovery features?"],
    [u.JL, s.SR, tb(2,2), "Hey Searchspring — Jordan from Arhaus DTC. Furniture search with room style matching. Visual search capabilities?"],
    [u.MP, s.SR, tb(2,4), "Hi Searchspring — Maya from Urban Decay. Beauty product search — shade finder, ingredient search, skin type matching."],
    [u.KO, s.SR, tb(2,6), "Hey Searchspring — Kwesi from SK-II DTC. Premium search experience — fast, accurate, visually stunning results."],
    [u.AB, s.SR, tb(2,8), "Hi Searchspring — Aaliyah from Entireworld. Search-driven merchandising. How does Searchspring handle seasonal collections?"],
    [u.HS, s.SR, tb(2,10), "Hey Searchspring — Hana from SSENSE. Fashion search with style, designer, and occasion attributes. How sophisticated?"],
    [u.DK, s.SR, tb(1,10), "Hi Searchspring — Daniel from ColourPop. Shade search and color matching AI. Beauty-specific search features?"],
    [u.TE, s.SR, tb(2,1), "Hey Searchspring — Tom from Olive & Piper. Small catalog but complex attributes. Is Searchspring overkill for us?"],
    [u.RO, s.SR, tb(2,3), "Hi Searchspring — Ryan from Beautycounter. Ingredient-based search for clean beauty. Safety-first product discovery."],

    // ── Rebuy Engine (BRONZE) — 10 confirmed ──
    [u.HS, s.RE, tb(1,7), "Hi Rebuy — Hana from SSENSE. Personalization at checkout for fashion and high-AOV retailers. What have you built?"],
    [u.AB, s.RE, tb(1,9), "Hey Rebuy — Aaliyah from Entireworld. Checkout personalization is the next lever. Approved and keen to explore."],
    [u.JL, s.RE, tb(2,2), "Hi Rebuy — Jordan from Arhaus DTC. Post-purchase upsells for furniture accessories. Room completion recommendations?"],
    [u.MP, s.RE, tb(2,4), "Hey Rebuy — Maya from Urban Decay. Beauty cart upsells — complementary products based on skin type and routine."],
    [u.KO, s.RE, tb(2,6), "Hi Rebuy — Kwesi from SK-II DTC. Premium upsell experience. How does Rebuy maintain luxury feel in recommendations?"],
    [u.CB, s.RE, tb(2,8), "Hey Rebuy — Chloe from Kylie Cosmetics. Cart bundles and smart add-ons. What's the typical AOV lift?"],
    [u.TE, s.RE, tb(2,10), "Hi Rebuy — Tom from Olive & Piper. Post-purchase personalization for accessories. Cross-sell jewelry pieces."],
    [u.ZA, s.RE, tb(1,5), "Hey Rebuy — Zoe from Year & Day. Subscription upsells and add-ons. Can Rebuy integrate with subscription platforms?"],
    [u.DK, s.RE, tb(1,1), "Hi Rebuy — Daniel from ColourPop. ROI on personalization — what's the measurable revenue impact for beauty brands?"],
    [u.AD, s.RE, tb(2,1), "Hey Rebuy — Amara from Depop. Marketplace-style recommendations. Can Rebuy work for peer-to-peer commerce?"],

    // ── Steph Curry — confirmed sponsor meetings ──
    [u.SC, s.SHO, tb(1,8), "Hi Shopify — Steph Curry from Golden State. We're launching a DTC merch line and need a platform that scales for drops and limited editions."],
    [u.SC, s.KL, tb(1,4), "Hey Klaviyo — Steph from Golden State. Email and SMS for athlete brand. How do you handle celebrity-scale subscriber lists?"],
    [u.SC, s.GOR, tb(1,6), "Hi Gorgias — Steph from Golden State. Customer support for merch drops is chaos. Need automation that still feels personal."],
    [u.SC, s.RC, tb(1,10), "Hey Recharge — Steph from Golden State. Subscription model for a monthly merch box. Premium tier for season ticket holders."],
    [u.SC, s.LR, tb(2,3), "Hi Loop Returns — Steph from Golden State. Jersey sizing returns are a huge volume. Exchange flow is critical to keep revenue."],
    [u.SC, s.YO, tb(2,5), "Hey Yotpo — Steph from Golden State. Fan reviews and UGC are our best marketing. How do you scale social proof for athlete brands?"],
    [u.SC, s.ATT, tb(2,7), "Hi Attentive — Steph from Golden State. Game day SMS campaigns. Real-time engagement tied to live events."],
    [u.SC, s.NAR, tb(2,9), "Hey Narvar — Steph from Golden State. Fans expect real-time tracking on limited drops. Post-purchase experience matters."],
  ]

  // ── APPROVED sponsor meetings (no time block yet) ──────────────────────────
  const approvedSponsor: [string, string, string][] = [
    [u.JL, s.YO,  "Hi Yotpo — Jordan from Arhaus DTC. Reviews are underutilized in our acquisition funnel."],
    [u.CN, s.SR,  "Hi Searchspring — Chris from Noihsaf Bazaar. Search relevancy is lacking for marketplace catalog."],
    [u.AB, s.RE,  "Hey Rebuy — Aaliyah from Entireworld. Checkout personalization is the next lever for us."],
    [u.PS, s.NAR, "Hey Narvar — Priya from Selfridges Digital. Delivery experience is a key differentiator."],
    [u.DK, s.SS,  "Hi ShipStation — Daniel from ColourPop. Total cost of ownership at our shipping volume."],
    [u.ZA, s.KL,  "Hey Klaviyo — Zoe from Year & Day. Email performance has plateaued. Need fresh strategy."],
    [u.MB, s.OG,  "Hi Ordergroove — Marcus from 4moms. Embedded subscriptions for baby product line."],
    [u.LH, s.GC,  "Hey Google Cloud — Leila from Roman Health. Infrastructure decisions for the next 3 years."],
    [u.TE, s.OK,  "Hi Okendo — Tom from Olive & Piper. Not leveraging review content enough. UGC activation."],
    [u.NV, s.BC,  "Hey BigCommerce — Nina from Oura. B2B capabilities for wholesale expansion."],
    [u.KO, s.SHO, "Hi Shopify — Kwesi from SK-II DTC. Strategic Plus review before the next 3-year commitment."],
    [u.HS, s.KL,  "Hey Klaviyo — Hana from SSENSE. Global suppression and inactive segment strategy."],
    [u.FW, s.AS,  "Hi AfterShip — Felix from Cedar & Moss. Large format shipping is complex. What can AfterShip simplify?"],
    [u.AD, s.OK,  "Hey Okendo — Amara from Depop. Social proof in P2P marketplace. Attribute reviews for resale."],
    [u.RO, s.SS,  "Hi ShipStation — Ryan from Beautycounter. Multi-carrier, multi-warehouse full stack review."],
    [u.SM, s.BC,  "Hey BigCommerce — Sophie from Boohoo DTC EU. Composable commerce evaluation for 2026."],
    [u.JO, s.SS,  "Hi ShipStation — James from Glossier. Multi-channel shipping management pain point."],
    [u.CB, s.KL,  "Hey Klaviyo — Chloe from Kylie Cosmetics. Large subscriber list, declining engagement."],
    [u.MP, s.GOR, "Hi Gorgias — Maya from Urban Decay. Beauty CS is complex. Shade matching, ingredients."],
    [u.ST, s.GC,  "Hey Google Cloud — Sam from Boohoo DTC. Cloud infrastructure for high-traffic ecommerce."],
    [u.SC, s.BC,   "Hi BigCommerce — Steph from Golden State. Evaluating headless commerce for our athlete brand platform."],
    [u.SC, s.TER,  "Hey Tailor — Steph from Golden State. Merch inventory across 50+ SKUs, seasonal drops, and arena retail. Need a real ERP."],
    [u.SC, s.SS,   "Hi ShipStation — Steph from Golden State. Multi-carrier shipping for game day merch — speed is everything."],
    [u.SC, s.OK,   "Hey Okendo — Steph from Golden State. Fan-generated content is gold. How do attribute reviews work for apparel?"],
  ]

  // ── PENDING sponsor meetings ───────────────────────────────────────────────
  const pendingSponsor: [string, string, string][] = [
    [u.JL, s.LR,  "Hi Loop Returns — Jordan from Arhaus DTC. Returns are a big ops cost for furniture."],
    [u.MP, s.RE,  "Hey Rebuy — Maya from Urban Decay. Post-add-to-cart upsells could help AOV."],
    [u.MP, s.PSC, "Hi Postscript — Maya from Urban Decay DTC. Adding SMS in Q4. Evaluating platforms."],
    [u.CN, s.YO,  "Hey Yotpo — Chris from Noihsaf Bazaar. Sellers need better social proof tools."],
    [u.AB, s.SR,  "Hi Searchspring — Aaliyah from Entireworld. Discovery is a big gap for us."],
    [u.ST, s.SS,  "Hey ShipStation — Sam from Boohoo DTC. Reviewing our shipping stack. API depth matters."],
    [u.PS, s.AS,  "Hi AfterShip — Priya from Selfridges Digital. Setting up post-purchase stack."],
    [u.DK, s.LR,  "Hey Loop Returns — Daniel from ColourPop. High return rates on some SKUs. Analytics help?"],
    [u.ZA, s.ATT, "Hi Attentive — Zoe from Year & Day. SMS list is small but high-intent."],
    [u.MB, s.KL,  "Hey Klaviyo — Marcus from 4moms DTC. Predictive churn modeling capabilities."],
    [u.LH, s.BC,  "Hi BigCommerce — Leila from Roman Health. Headless options for regulatory compliance."],
    [u.TE, s.RE,  "Hey Rebuy — Tom from Olive & Piper. Post-purchase personalization is a Q2 priority."],
    [u.NV, s.EXT, "Hi Extensiv — Nina from Oura. Scaling fulfillment, 3PL integrations are messy."],
    [u.KO, s.LR,  "Hey Loop Returns — Kwesi from SK-II DTC. Luxury returns need premium experience."],
    [u.KO, s.TER, "Hi Tailor — Kwesi from SK-II DTC. Global brand, multi-currency ERP. Exploring options."],
    [u.HS, s.OG,  "Hey Ordergroove — Hana from SSENSE. Subscription models for category leaders."],
    [u.AD, s.GOR, "Hi Gorgias — Amara from Depop. Support volume is high, current tool isn't scaling."],
    [u.RO, s.EXT, "Hey Extensiv — Ryan from Beautycounter. Full ops audit — 3PL and WMS priority."],
    [u.SM, s.KL,  "Hi Klaviyo — Sophie from Boohoo DTC EU. Migrating from another ESP. Timeline?"],
    [u.JO, s.LR,  "Hey Loop Returns — James from Glossier. Gift returns and exchanges. Gifting flows?"],
    [u.FW, s.TER, "Hi Tailor — Felix from Cedar & Moss. When does it make sense to invest in ERP?"],
    [u.CB, s.ATT, "Hey Attentive — Chloe from Kylie Cosmetics. Drop alert SMS for limited editions."],
    [u.CN, s.GC,  "Hi Google Cloud — Chris from Noihsaf Bazaar. Marketplace infrastructure on GCP."],
    [u.DK, s.YO,  "Hey Yotpo — Daniel from ColourPop. Beauty reviews driving conversion. ROI analysis."],
    [u.ZA, s.NAR, "Hi Narvar — Zoe from Year & Day. Home goods delivery tracking. Long lead times."],
    [u.SC, s.RE,   "Hi Rebuy — Steph from Golden State. Post-purchase upsells for merch. Jersey buyers should see matching shorts and accessories."],
    [u.SC, s.PSC,  "Hey Postscript — Steph from Golden State. SMS for game day flash sales. What's the best practice for time-sensitive drops?"],
    [u.SC, s.SR,   "Hi Searchspring — Steph from Golden State. Product discovery for a merch catalog. Size, color, player — lots of attributes."],
    [u.SC, s.SKI,  "Hey Skio — Steph from Golden State. Subscription model for exclusive merch drops. Passwordless login for fans."],
    [u.SC, s.EXT,  "Hi Extensiv — Steph from Golden State. Warehouse ops for seasonal merch surges. 3PL network flexibility matters."],
    [u.SC, s.GC,   "Hey Google Cloud — Steph from Golden State. AI-powered merch recommendations and demand forecasting for drops."],
  ]

  // ── REJECTED sponsor meetings ──────────────────────────────────────────────
  const rejectedSponsor: [string, string, string][] = [
    [u.JL, s.BC,  "Hi BigCommerce — Jordan from Arhaus DTC. Due diligence on alternatives though we're deep in Shopify."],
    [u.AB, s.OG,  "Hey Ordergroove — Aaliyah from Entireworld. Catalog isn't subscription-ready yet. Timing isn't right."],
    [u.MB, s.ATT, "Hi Attentive — Marcus from 4moms DTC. After initial call, Postscript is a better fit for our tier."],
    [u.ST, s.GOR, "Hey Gorgias — Sam from Boohoo DTC. CS team decided to stay with Zendesk given deep integration work."],
    [u.PS, s.SKI, "Hi Skio — Priya from Selfridges Digital. We've decided to go with Recharge for now. Maybe next year."],
    [u.FW, s.BC,  "Hey BigCommerce — Felix from Cedar & Moss. After evaluation, Shopify is a better fit for our size."],
    [u.CN, s.ATT, "Hi Attentive — Chris from Noihsaf Bazaar. Our marketplace model doesn't fit traditional SMS platforms."],
    [u.DK, s.GC,  "Hey Google Cloud — Daniel from ColourPop. Staying with AWS for now. Switching cost too high."],
    [u.SC, s.OG,   "Hi Ordergroove — Steph from Golden State. Looked into embedded subscriptions but our merch model is drop-based, not replenishment."],
    [u.SC, s.AS,   "Hey AfterShip — Steph from Golden State. Already using Narvar for tracking. Decided to stay with current setup."],
    [u.SC, s.GOR,  "Hi Gorgias — Steph from Golden State. Follow-up request — team decided Zendesk is a better fit for our scale."],
  ]

  // ── CONFIRMED peer meetings ────────────────────────────────────────────────
  const confirmedPeer: [string, string, string, string][] = [
    [u.JL, u.MP, tb(1,8), "Hey Maya — Jordan from Arhaus DTC. Both at similar inflection points. Would love to swap notes on what's working."],
    [u.CN, u.TE, tb(1,8), "Hi Tom — Chris from Noihsaf Bazaar. Marketplace vs DTC tradeoffs — let's compare notes."],
    [u.KO, u.AD, tb(1,10), "Hey Amara — Kwesi from SK-II DTC. Scaling DTC in very different verticals. Lots to learn from each other."],
    [u.AB, u.MB, tb(2,8), "Hi Marcus — Aaliyah from Entireworld. Growth and retention are two sides of the same coin. Coffee chat?"],
    [u.HS, u.CB, tb(2,8), "Hey Chloe — Hana from SSENSE. Both in beauty-adjacent luxury. Would love to talk retention strategies."],
    [u.ST, u.PS, tb(2,6), "Hi Priya — Sam from Boohoo DTC. Comparing tech stacks — are you building checkout or using off-the-shelf?"],
    [u.LH, u.RO, tb(2,6), "Hey Ryan — Leila from Roman Health. COO-to-COO on scaling ops in regulated industries."],
    [u.DK, u.ZA, tb(1,10), "Hi Zoe — Daniel from ColourPop. Finance meets revenue ops. Let's talk unit economics and LTV modeling."],
    [u.JO, u.FW, tb(2,10), "Hey Felix — James from Glossier. Retail and DTC hybrid models. Your furniture approach is interesting."],
    [u.SM, u.NV, tb(2,10), "Hi Nina — Sophie from Boohoo DTC EU. Both navigating international expansion challenges. Let's connect."],
    [u.SC, u.JL, tb(1,9), "Hey Jordan — Steph from Golden State. Both building DTC brands in very different categories. Would love to compare notes on scaling merch ops."],
    [u.SC, u.KO, tb(2,8), "Hi Kwesi — Steph from Golden State. Premium brand positioning in DTC — luxury skincare and athlete brands have more in common than you'd think."],
    [u.SC, u.MP, tb(2,4), "Hey Maya — Steph from Golden State. Urban Decay and athlete brands both rely on limited drops. Let's talk launch playbooks."],
  ]

  // ── APPROVED peer meetings ─────────────────────────────────────────────────
  const approvedPeer: [string, string, string][] = [
    [u.KO, u.HS, "Hey Hana — Kwesi from SK-II. Premium brand growth in global markets. Great conversation topic."],
    [u.AD, u.CB, "Hi Chloe — Amara from Depop. Beauty-adjacent DTC. Retention and UGC strategies to share."],
    [u.MP, u.ZA, "Hey Zoe — Maya from Urban Decay. Both subscription-curious. Let's talk about what we're learning."],
    [u.JL, u.RO, "Hi Ryan — Jordan from Arhaus DTC. Both in large-format DTC. Ops challenges are similar."],
    [u.CN, u.JO, "Hey James — Chris from Noihsaf Bazaar. Marketplace and retail — different models, shared learnings."],
    [u.SC, u.AB, "Hey Aaliyah — Steph from Golden State. Growth strategies for DTC brands with built-in audiences. Let's compare playbooks."],
    [u.SC, u.HS, "Hi Hana — Steph from Golden State. SSENSE and athlete brands both play in premium streetwear. Would love to connect."],
  ]

  // ── PENDING peer meetings ──────────────────────────────────────────────────
  const pendingPeer: [string, string, string][] = [
    [u.MP, u.CB, "Hey Chloe — Maya from Urban Decay. Both in beauty DTC. Let's talk about what's working at Kylie."],
    [u.HS, u.AD, "Hi Amara — Hana from SSENSE. The P2P resale model is fascinating from a growth standpoint."],
    [u.LH, u.NV, "Hey Nina — Leila from Roman Health. Health tech meets DTC. Interesting intersection."],
    [u.ST, u.DK, "Hi Daniel — Sam from Boohoo DTC. Engineering and finance alignment. Let's talk about it."],
    [u.FW, u.TE, "Hey Tom — Felix from Cedar & Moss. Both small brands punching above our weight. Let's swap stories."],
    [u.AB, u.SM, "Hi Sophie — Aaliyah from Entireworld. Growth strategies in crowded DTC markets."],
    [u.SC, u.CB, "Hey Chloe — Steph from Golden State. Both in the drop/limited edition game. Kylie and Curry Brand have parallel challenges."],
    [u.SC, u.AD, "Hi Amara — Steph from Golden State. Depop's resale model is interesting for authenticated athlete memorabilia."],
    [u.RO, u.SC, "Hey Steph — Ryan from Beautycounter. COO-to-founder chat on scaling ops when demand is unpredictable."],
  ]

  // ── Session bookmarks ──────────────────────────────────────────────────────
  const bookmarks: [string, string[]][] = [
    [u.JL, ['ses-1', 'cmnh270yl0001h91bl4e9zl10', 'cmnh270yq0009h91b4jhq9u1v', 'cmngg3us00003t4n0ljqh8sbi']],
    [u.MP, ['ses-1', 'cmngg3urz0001t4n0g8smxi6a', 'cmngg3us00003t4n0ljqh8sbi', 'cmnh270yy000xh91bcxnc435f', 'cmnh270z3001dh91b7a5s0lim']],
    [u.CN, ['ses-1', 'cmngg5zm8000151i7ehyoyds8', 'cmngg3us20007t4n0jg0oqkfv', 'cmnh270yw000rh91b5dzyhnk2']],
    [u.AB, ['ses-1', 'cmngg3us00003t4n0ljqh8sbi', 'cmnh270yq0009h91b4jhq9u1v', 'cmnh270yu000lh91brhwicofs', 'cmnh270z4001hh91bzjut9go0']],
    [u.ST, ['cmnh270yl0001h91bl4e9zl10', 'cmnh270yn0003h91borezl2iz', 'cmnh270ys000fh91bywugpunr', 'cmnh270z00013h91b5194dwop']],
    [u.PS, ['ses-1', 'cmnh270yn0003h91borezl2iz', 'cmngg5zmd000751i717stvy4u', 'cmnh270z10015h91b41bf1loz']],
    [u.DK, ['ses-1', 'cmngg5zmg000d51i7e49kjjt8', 'cmnh270yp0007h91bjas86199', 'cmngg5zmd000751i717stvy4u']],
    [u.ZA, ['ses-1', 'cmngg3urz0001t4n0g8smxi6a', 'cmnh270z3001dh91b7a5s0lim', 'cmnh270yq0009h91b4jhq9u1v', 'cmnh270yx000vh91blrcqitl0']],
    [u.MB, ['ses-1', 'cmngg3urz0001t4n0g8smxi6a', 'cmnh270yq0009h91b4jhq9u1v', 'cmnh270z3001dh91b7a5s0lim', 'cmnh270yx000vh91blrcqitl0']],
    [u.LH, ['ses-1', 'cmngg5zmd000751i717stvy4u', 'cmnh270ys000fh91bywugpunr', 'cmnh270yp0007h91bjas86199']],
    [u.TE, ['ses-1', 'cmnh270yl0001h91bl4e9zl10', 'cmnh270yq0009h91b4jhq9u1v', 'cmngg5zme000951i7twrmtzuj']],
    [u.NV, ['ses-1', 'cmnh270z00013h91b5194dwop', 'cmnh270z5001jh91bzeie8boj', 'cmnh270yn0003h91borezl2iz']],
    [u.KO, ['ses-1', 'cmnh270yl0001h91bl4e9zl10', 'cmngg5zmc000551i70g4bb30x', 'cmnh270z20019h91b274w032a', 'cmnh270yv000nh91be8levbsk']],
    [u.HS, ['ses-1', 'cmngg3us00003t4n0ljqh8sbi', 'cmnh270yy000xh91bcxnc435f', 'cmnh270z4001fh91b6vhbs383', 'cmnh270yu000lh91brhwicofs']],
    [u.FW, ['ses-1', 'cmnh270yl0001h91bl4e9zl10', 'cmngg3us20007t4n0jg0oqkfv', 'cmnh270z00013h91b5194dwop']],
    [u.AD, ['ses-1', 'cmngg3urz0001t4n0g8smxi6a', 'cmnh270yy000xh91bcxnc435f', 'cmnh270z3001bh91bi1l8mco7']],
    [u.RO, ['ses-1', 'cmngg5zmd000751i717stvy4u', 'cmnh270yp0007h91bjas86199', 'cmnh270yr000dh91bvfq2dbjz', 'cmngg5zmg000d51i7e49kjjt8']],
    [u.SM, ['ses-1', 'cmnh270yl0001h91bl4e9zl10', 'cmnh270z20019h91b274w032a', 'cmngg3us00003t4n0ljqh8sbi']],
    [u.JO, ['ses-1', 'cmngg5zmc000551i70g4bb30x', 'cmngg3us20007t4n0jg0oqkfv', 'cmnh270yw000rh91b5dzyhnk2', 'cmnh270yv000ph91bzjs4eat2']],
    [u.CB, ['ses-1', 'cmngg5zme000951i7twrmtzuj', 'cmnh270yy000xh91bcxnc435f', 'cmnh270z3001bh91bi1l8mco7']],
    [u.SC, ['ses-1', 'cmnh270yl0001h91bl4e9zl10', 'cmngg3us00003t4n0ljqh8sbi', 'cmnh270yq0009h91b4jhq9u1v', 'cmnh270z3001dh91b7a5s0lim', 'cmngg5zmc000551i70g4bb30x']],
  ]

  // ── Insert everything ──────────────────────────────────────────────────────
  console.log(`  Inserting ${confirmedSponsor.length} confirmed sponsor meetings...`)
  for (const [reqId, sponsorId, tbId, msg] of confirmedSponsor) {
    await prisma.meetingRequest.create({
      data: { requesterId: reqId, targetSponsorId: sponsorId, message: msg, status: 'CONFIRMED', timeBlockId: tbId },
    })
    await prisma.sponsorMeeting.create({
      data: { sponsorId, userId: reqId, timeBlockId: tbId, status: 'CONFIRMED' },
    })
  }

  console.log(`  Inserting ${approvedSponsor.length} approved sponsor meetings...`)
  for (const [reqId, sponsorId, msg] of approvedSponsor) {
    await prisma.meetingRequest.create({
      data: { requesterId: reqId, targetSponsorId: sponsorId, message: msg, status: 'APPROVED' },
    })
  }

  console.log(`  Inserting ${pendingSponsor.length} pending sponsor meetings...`)
  for (const [reqId, sponsorId, msg] of pendingSponsor) {
    await prisma.meetingRequest.create({
      data: { requesterId: reqId, targetSponsorId: sponsorId, message: msg, status: 'PENDING' },
    })
  }

  console.log(`  Inserting ${rejectedSponsor.length} rejected sponsor meetings...`)
  for (const [reqId, sponsorId, msg] of rejectedSponsor) {
    await prisma.meetingRequest.create({
      data: { requesterId: reqId, targetSponsorId: sponsorId, message: msg, status: 'REJECTED' },
    })
  }

  console.log(`  Inserting ${confirmedPeer.length} confirmed peer meetings...`)
  for (const [reqId, targetId, tbId, msg] of confirmedPeer) {
    await prisma.meetingRequest.create({
      data: { requesterId: reqId, targetUserId: targetId, message: msg, status: 'CONFIRMED', timeBlockId: tbId },
    })
  }

  console.log(`  Inserting ${approvedPeer.length} approved peer meetings...`)
  for (const [reqId, targetId, msg] of approvedPeer) {
    await prisma.meetingRequest.create({
      data: { requesterId: reqId, targetUserId: targetId, message: msg, status: 'APPROVED' },
    })
  }

  console.log(`  Inserting ${pendingPeer.length} pending peer meetings...`)
  for (const [reqId, targetId, msg] of pendingPeer) {
    await prisma.meetingRequest.create({
      data: { requesterId: reqId, targetUserId: targetId, message: msg, status: 'PENDING' },
    })
  }

  console.log(`  Inserting session bookmarks...`)
  for (const [userId, sessionIds] of bookmarks) {
    for (const sessionId of sessionIds) {
      await prisma.sessionBookmark.upsert({
        where: { userId_sessionId: { userId, sessionId } },
        update: {},
        create: { userId, sessionId },
      })
    }
  }

  const total =
    confirmedSponsor.length + approvedSponsor.length +
    pendingSponsor.length + rejectedSponsor.length +
    confirmedPeer.length + approvedPeer.length + pendingPeer.length

  console.log(`\n✅ Done! ${total} meeting requests created.`)
  console.log(`   Confirmed sponsor: ${confirmedSponsor.length} (+ SponsorMeeting records)`)
  console.log(`   Approved sponsor:  ${approvedSponsor.length}`)
  console.log(`   Pending sponsor:   ${pendingSponsor.length}`)
  console.log(`   Rejected sponsor:  ${rejectedSponsor.length}`)
  console.log(`   Confirmed peer:    ${confirmedPeer.length}`)
  console.log(`   Approved peer:     ${approvedPeer.length}`)
  console.log(`   Pending peer:      ${pendingPeer.length}`)
  console.log(`   Session bookmarks: ${bookmarks.reduce((n, [, ids]) => n + ids.length, 0)}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
