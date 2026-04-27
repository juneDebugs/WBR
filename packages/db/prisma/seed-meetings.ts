import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding meeting requests...')

  await prisma.meetingRequest.deleteMany({})
  await prisma.sponsorMeeting.deleteMany({})
  await prisma.sessionBookmark.deleteMany({})

  const u = {
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
    FW: 'cmnf5o4080016o6glvytz0mcq', // Felix Wagner — Cedar & Moss
    AD: 'cmnf5o4090019o6gl06nnhzc0', // Amara Diallo — VP Revenue, Depop
    RO: 'cmnf5o40b001co6gl8j8dafx3', // Ryan O'Brien — COO, Beautycounter
    SM: 'cmnf5o40c001fo6gljtwj9gk5', // Sophie Müller — Co-Founder, Boohoo DTC
    JO: 'cmnf5o40e001io6glgvzi0wil', // James Osei — Director of Retail, Glossier
    CB: 'cmnf5o40g001lo6gld2txewt2', // Chloe Beaumont — Head of Wholesale, Kylie Cosmetics
  }

  const s = {
    SHO: 'cmngb2h4h0000vm28ssjt1m0z', // Shopify — PLATINUM
    BC:  'cmngb2h4h0001vm2889slafvy', // BigCommerce — PLATINUM
    SS:  'cmngb2h4h0002vm28jsro8se9', // ShipStation — GOLD
    LR:  'cmngb2h4h0003vm281j76qc4e', // Loop Returns — GOLD
    KL:  'cmngb2h4h0004vm28nn3rme1o', // Klaviyo — GOLD
    GOR: 'cmngb2h4h0005vm28mg7g52fh', // Gorgias — GOLD
    RC:  'cmngb2h4h0006vm28enbuld34', // Recharge — GOLD
    TER: 'cmngb2h4h0007vm28mbcpxjg5', // Tailor ERP — PLATINUM
    YO:  'cmngb2h4h0008vm28i6338gp9', // Yotpo — SILVER
    ATT: 'cmngb2h4h0009vm28no2j8b6p', // Attentive — SILVER
    PSC: 'cmngb2h4h000avm28j2vs0j0k', // Postscript — SILVER
    NAR: 'cmngb2h4h000cvm28dh6mc5bh', // Narvar — SILVER
    EXT: 'cmngb2h4h000dvm289vmdaki3', // Extensiv — SILVER
    OK:  'cmngb2h4h000evm286epvlnxs', // Okendo — BRONZE
    OG:  'cmngb2h4h000fvm28fzk7rs4l', // Ordergroove — BRONZE
    SKI: 'cmngb2h4h000gvm28202yjuux', // Skio — BRONZE
    AS:  'cmngb2h4h000hvm28vn41ytgc', // AfterShip — BRONZE
    SR:  'cmngb2h4h000ivm281ido85fq', // Searchspring — BRONZE
    RE:  'cmngb2h4h000jvm28zwqqu86h', // Rebuy Engine — BRONZE
    GC:  'cmngbix6w0001fwpj6dwlwyri', // Google Cloud — SILVER
  }

  const tb = (d: number, slot: number) => `tb-d${d}-s${slot}`

  // ── CONFIRMED sponsor meetings ─────────────────────────────────────────────
  // Each entry: [requesterId, sponsorId, timeBlockId, message]
  // Time blocks assigned so no person or sponsor has two meetings at the same slot.
  const confirmedSponsor: [string, string, string, string][] = [
    // Jordan Lee
    [u.JL, s.SHO, tb(1,1), "Hi Shopify team — Jordan from Arhaus DTC here. We're on Plus and hitting some scaling issues with our catalog. Would love 30 mins to talk through your enterprise roadmap."],
    [u.JL, s.KL,  tb(1,3), "Hey Klaviyo — Jordan Lee, VP Sales at Arhaus DTC. Our email flows drive a huge chunk of revenue but segmentation needs work. Let's talk about what's working best right now."],
    [u.JL, s.GOR, tb(1,5), "Hi Gorgias — we're consolidating our CS stack and you're at the top of the list. Looking forward to connecting at WBR."],
    // Maya Patel
    [u.MP, s.ATT, tb(1,1), "Hi Attentive — Maya from Urban Decay DTC. SMS is a growing channel for us and I'm curious about your benchmarks for beauty brands."],
    [u.MP, s.RC,  tb(1,3), "Hey Recharge — exploring subscription boxes for our bundles. Maya Patel, Head of DTC. Would love to walk through implementation timelines and LTV data."],
    [u.MP, s.OK,  tb(1,5), "Hi Okendo — reviews and UGC are core to our conversion strategy. Let's discuss your AI review features and how they'd work for a cosmetics catalog."],
    // Chris Nakamura
    [u.CN, s.GOR, tb(1,1), "Hi Gorgias — Chris from Noihsaf Bazaar. We're scaling CS across multiple channels and need a solution that integrates cleanly with our custom marketplace stack."],
    [u.CN, s.AS,  tb(1,3), "Hey AfterShip — our post-purchase experience is a known pain point. Chris Nakamura, VP Customer Success. Let's talk tracking and proactive notification flows."],
    [u.CN, s.NAR, tb(1,5), "Hi Narvar — post-purchase is where we win or lose customers. Excited to learn about your carrier network depth and EDD accuracy."],
    // Aaliyah Brooks
    [u.AB, s.KL,  tb(1,1), "Hi Klaviyo — Aaliyah from Entireworld. Growth is our north star and owned channels are critical. Let's swap notes on what's working in 2025."],
    [u.AB, s.PSC, tb(1,3), "Hey Postscript — heard you're best-in-class for SMS. Aaliyah, VP Growth at Entireworld. Would love to see how your flows would move our repeat purchase rate."],
    [u.AB, s.ATT, tb(1,5), "Hi Attentive — Aaliyah from Entireworld. We run heavy a/b tests on SMS campaigns and need a platform that can keep up with our experimentation pace."],
    // Sam Torres
    [u.ST, s.SHO, tb(1,2), "Hey Shopify — Sam Torres, VP Engineering at Boohoo DTC. We're on Plus and want to talk headless architecture and the Hydrogen roadmap for our next replatform phase."],
    [u.ST, s.BC,  tb(1,4), "Hi BigCommerce — Sam from Boohoo DTC. We're doing a full platform evaluation for 2026. Let's talk composable commerce and API flexibility in depth."],
    [u.ST, s.EXT, tb(1,6), "Hey Extensiv — we manage 3 warehouses and our inventory ops are fragmented. Sam Torres, VP Engineering. Would love a walkthrough of your WMS capabilities."],
    // Priya Singh
    [u.PS, s.BC,  tb(1,2), "Hi BigCommerce — Priya from Selfridges Digital. We're building a new digital-native brand and want a scalable platform from day one. Excited to learn more."],
    [u.PS, s.SS,  tb(1,4), "Hey ShipStation — Priya Singh from Selfridges Digital. Shipping complexity is our biggest ops challenge. Looking forward to seeing how you handle multi-carrier at scale."],
    // Daniel Kim
    [u.DK, s.TER, tb(1,2), "Hi Tailor — Daniel from ColourPop. Our current ERP is holding us back operationally. Would love to understand how Tailor handles high-SKU, high-velocity beauty brands."],
    [u.DK, s.EXT, tb(1,4), "Hey Extensiv — Daniel Kim, Head of Finance at ColourPop. We're reviewing our 3PL costs and think better WMS tooling is the key lever. Let's connect."],
    // Zoe Andersen
    [u.ZA, s.RC,  tb(1,2), "Hi Recharge — Zoe from Year & Day. Subscriptions are our highest-LTV segment. Let's talk about your new analytics dashboard and the data portability story."],
    [u.ZA, s.SKI, tb(1,4), "Hey Skio — Zoe Andersen, VP Revenue. I've heard you're the best alternative to Recharge. Let's have an honest conversation about migration support and pricing."],
    [u.ZA, s.OG,  tb(1,6), "Hi Ordergroove — Zoe from Year & Day. Your embedded subscription model caught our eye. Let's dig into how it performs vs. pop-up subscription flows."],
    // Marcus Bell
    [u.MB, s.RC,  tb(1,4), "Hey Recharge — Marcus from 4moms DTC. Baby gear subscriptions are a growing segment for us. What does Recharge offer for lower-frequency, higher-AOV products?"],
    [u.MB, s.SKI, tb(1,6), "Hi Skio — Marcus Bell, Head of Retention. Your cancellation flow tooling is what caught my attention. Churn is my number one metric right now."],
    // Leila Hassan
    [u.LH, s.SHO, tb(1,3), "Hi Shopify — Leila Hassan, COO at Roman Health. We're scaling a health DTC brand with complex subscription and regulatory requirements. Need to talk compliance-ready commerce."],
    [u.LH, s.TER, tb(1,5), "Hey Tailor — rebuilding our operations stack end-to-end. Leila Hassan from Roman Health. ERP is the backbone and we want to make the right call in 2025."],
    // Tom Eriksen
    [u.TE, s.KL,  tb(1,5), "Hi Klaviyo — Tom Eriksen from Olive & Piper. Email is still our highest ROI channel but we're not fully leveraging segmentation. Talk me through your AI personalization roadmap."],
    [u.TE, s.YO,  tb(2,1), "Hey Yotpo — Tom from Olive & Piper. We have solid review volume but want to activate that UGC across more touchpoints. Interested in your loyalty + reviews bundle."],
    // Nina Vasquez
    [u.NV, s.SHO, tb(1,4), "Hi Shopify — Nina Vasquez, Director of Marketplace at Oura. We're launching a B2B marketplace component and want to understand your B2B commerce features in depth."],
    [u.NV, s.SR,  tb(1,6), "Hey Searchspring — Nina from Oura. Our product discovery experience is lagging. How would your AI search work on a health tech catalog with complex attribute filtering?"],
    // Kwesi Owusu
    [u.KO, s.KL,  tb(1,2), "Hi Klaviyo — Kwesi Owusu, CEO at SK-II DTC. As we scale owned channels I want to make sure Klaviyo can grow with us globally, especially APAC markets."],
    [u.KO, s.GOR, tb(1,4), "Hey Gorgias — Kwesi from SK-II DTC. We have a high-touch CS model. Let's talk about how your AI deflection maintains quality while scaling volume."],
    // Hana Suzuki
    [u.HS, s.ATT, tb(1,3), "Hi Attentive — Hana Suzuki, VP Growth at SSENSE. SMS is underperforming vs. benchmarks for us. Let's troubleshoot and talk strategy for luxury fashion."],
    [u.HS, s.PSC, tb(1,5), "Hey Postscript — Hana from SSENSE. Luxury fashion SMS is a different game. I want to understand your compliance controls and tone guardrails for premium brands."],
    [u.HS, s.RE,  tb(1,7), "Hi Rebuy — Hana from SSENSE. Personalization at checkout is a huge untapped lever for us. What have you built specifically for fashion and high-AOV retailers?"],
    // Felix Wagner
    [u.FW, s.SHO, tb(1,5), "Hey Shopify — Felix Wagner from Cedar & Moss. We're a small-batch furniture brand migrating from WooCommerce. Want to scope a Shopify Plus migration and talk about your furniture/large-format capabilities."],
    [u.FW, s.LR,  tb(1,7), "Hi Loop Returns — Felix from Cedar & Moss. Returns are complicated for us — large format, freight-based. Does Loop have a solution for that, or is this not your sweet spot?"],
    // Amara Diallo
    [u.AD, s.RC,  tb(1,1), "Hi Recharge — Amara Diallo from Depop. We're launching a reseller subscription plan and want to understand how Recharge handles marketplace-style subscription models."],
    [u.AD, s.YO,  tb(1,3), "Hey Yotpo — Amara from Depop. Reviews and social proof are core to our marketplace trust model. Let's talk about integrating Yotpo with our community features."],
    // Ryan O'Brien
    [u.RO, s.TER, tb(1,1), "Hi Tailor — Ryan O'Brien, COO at Beautycounter. Our compliance requirements are complex — clean beauty certification plus FTC. Need an ERP with strong traceability and regulatory reporting."],
    [u.RO, s.GC,  tb(1,3), "Hey Google Cloud — Ryan from Beautycounter. Evaluating cloud infrastructure for our data platform. Interested in BigQuery and Vertex AI for demand forecasting use cases."],
    // Sophie Müller
    [u.SM, s.SHO, tb(1,6), "Hi Shopify — Sophie Müller, Co-Founder at Boohoo DTC EU. We're scaling the European operation and need to talk Shopify Markets, VAT handling, and multi-currency checkout."],
    // James Osei
    [u.JO, s.NAR, tb(1,1), "Hi Narvar — James Osei from Glossier. Post-purchase is one of the most under-invested areas for us. What does good look like at our scale?"],
    [u.JO, s.AS,  tb(1,5), "Hey AfterShip — James from Glossier. We get massive ticket volume on 'where is my order'. Can AfterShip deflect that and meaningfully improve the delivery experience?"],
    // Chloe Beaumont
    [u.CB, s.YO,  tb(1,1), "Hi Yotpo — Chloe Beaumont from Kylie Cosmetics. We have a massive review backlog and want to activate that content more effectively. Let's talk visual UGC and loyalty."],
    [u.CB, s.OK,  tb(1,3), "Hey Okendo — Chloe from Kylie Cosmetics. I've been impressed by your attribute-based review flow. Let's talk about what a migration from Bazaarvoice looks like."],
  ]

  // ── APPROVED sponsor meetings ──────────────────────────────────────────────
  const approvedSponsor: [string, string, string][] = [
    [u.JL, s.YO,  "Hi Yotpo — Jordan from Arhaus DTC. Reviews are underutilized in our acquisition funnel. Looking forward to connecting at WBR."],
    [u.MP, s.SHO, "Hey Shopify — Maya from Urban Decay DTC. We've been on Shopify for a while and want to revisit what Plus can do for our next growth phase."],
    [u.CN, s.SR,  "Hi Searchspring — Chris from Noihsaf Bazaar. Our search relevancy is lacking for a marketplace catalog. Would love a live demo of your product discovery features."],
    [u.AB, s.RE,  "Hey Rebuy — Aaliyah from Entireworld. Personalization at checkout is the next lever for us. Approved and keen to explore fit."],
    [u.ST, s.TER, "Hi Tailor — Sam Torres from Boohoo DTC. Our ERP is a legacy system and we're starting the evaluation process. Good timing to connect."],
    [u.PS, s.NAR, "Hey Narvar — Priya from Selfridges Digital. Delivery experience is a key differentiator we want to invest in. Looking forward to learning about your solution."],
    [u.DK, s.SS,  "Hi ShipStation — Daniel from ColourPop. Finance perspective: I want to understand total cost of ownership and how you drive efficiency at our shipping volume."],
    [u.ZA, s.KL,  "Hey Klaviyo — Zoe from Year & Day. Our email performance has plateaued and I think it's a strategy problem, not a tool problem. Keen to get fresh eyes on it."],
    [u.MB, s.OG,  "Hi Ordergroove — Marcus from 4moms DTC. Let's explore whether embedded subscriptions make sense for our product line. Happy to go into the data."],
    [u.LH, s.GC,  "Hey Google Cloud — Leila from Roman Health. Making infrastructure decisions that define the next 3 years. GCP is on the short list."],
    [u.TE, s.OK,  "Hi Okendo — Tom from Olive & Piper. Our reviews are solid but we're not leveraging the content enough. Let's talk about your latest UGC activation features."],
    [u.NV, s.BC,  "Hey BigCommerce — Nina from Oura. Platform evaluation is live right now. Your B2B capabilities are interesting for our wholesale expansion."],
    [u.KO, s.SHO, "Hi Shopify — Kwesi from SK-II DTC. We're on Shopify but want a strategic review. Making sure we're maximizing Plus before committing to the next 3 years."],
    [u.HS, s.KL,  "Hey Klaviyo — Hana from SSENSE. Global suppression logic and inactive segment strategy are my priorities. Let's talk."],
    [u.FW, s.AS,  "Hi AfterShip — Felix from Cedar & Moss. Shipping is complex for us (large format, white glove). Looking forward to seeing what AfterShip can simplify."],
    [u.AD, s.OK,  "Hey Okendo — Amara from Depop. Social proof in a peer-to-peer marketplace is tricky. Want to explore how your attribute reviews translate to resale."],
    [u.RO, s.SS,  "Hi ShipStation — Ryan from Beautycounter. We're multi-carrier, multi-warehouse, direct + retail. Want to see the full stack."],
    [u.SM, s.BC,  "Hey BigCommerce — Sophie from Boohoo DTC. Evaluating platform options for our next phase. Composable commerce is on our radar for 2026."],
    [u.JO, s.SS,  "Hi ShipStation — James from Glossier. We do a mix of DTC and wholesale. Multi-carrier, multi-channel shipping management is the pain point."],
    [u.CB, s.KL,  "Hey Klaviyo — Chloe from Kylie Cosmetics. We have a large subscriber list but engagement is declining. Let's talk list health and re-engagement flows."],
  ]

  // ── PENDING sponsor meetings ───────────────────────────────────────────────
  const pendingSponsor: [string, string, string][] = [
    [u.JL, s.LR,  "Hi Loop Returns — Jordan from Arhaus DTC. Returns are a big ops cost for furniture. Curious if Loop has a solution for higher-AOV categories."],
    [u.MP, s.RE,  "Hey Rebuy — Maya from Urban Decay. Post-add-to-cart upsells could really help our AOV. Want to learn more about your checkout personalization."],
    [u.MP, s.PSC, "Hi Postscript — Maya from Urban Decay DTC. Adding SMS to our marketing mix in Q4. Evaluating platforms and Postscript came highly recommended."],
    [u.CN, s.YO,  "Hey Yotpo — Chris from Noihsaf Bazaar. Our sellers need better social proof tools. How does Yotpo work for marketplace-style models?"],
    [u.AB, s.SR,  "Hi Searchspring — Aaliyah from Entireworld. Discovery is a big gap for us. Evaluating search tools for a Q1 implementation."],
    [u.ST, s.SS,  "Hey ShipStation — Sam from Boohoo DTC. Reviewing our shipping stack. Engineering wants to understand your API depth and webhook reliability."],
    [u.PS, s.AS,  "Hi AfterShip — Priya from Selfridges Digital. We're early stage and setting up our post-purchase stack. AfterShip came highly recommended."],
    [u.DK, s.LR,  "Hey Loop Returns — Daniel from ColourPop. We have high return rates on some SKUs. Can Loop's analytics help us understand the drivers?"],
    [u.ZA, s.ATT, "Hi Attentive — Zoe from Year & Day. Our SMS list is small but high-intent. Attentive was recommended for list growth. Let's talk strategy."],
    [u.MB, s.KL,  "Hey Klaviyo — Marcus from 4moms DTC. Retention email is my domain. Want to see your predictive churn modeling capabilities in action."],
    [u.LH, s.BC,  "Hi BigCommerce — Leila from Roman Health. Evaluating headless options. BigCommerce's MACH approach is interesting for our regulatory compliance use case."],
    [u.TE, s.RE,  "Hey Rebuy — Tom from Olive & Piper. Post-purchase personalization is a Q2 priority. Putting Rebuy on the evaluation list."],
    [u.NV, s.EXT, "Hi Extensiv — Nina from Oura. We're scaling fulfillment and our 3PL integrations are messy. Want to see Extensiv's network and integration depth."],
    [u.KO, s.LR,  "Hey Loop Returns — Kwesi from SK-II DTC. Luxury returns need a premium experience. Let's talk about how Loop handles high-end consumer goods."],
    [u.KO, s.TER, "Hi Tailor — Kwesi from SK-II DTC. We're a global brand and our ERP doesn't handle multi-currency or regional ops well. Exploring options."],
    [u.HS, s.OG,  "Hey Ordergroove — Hana from SSENSE. Testing subscription models for some of our category leaders. Looking for a flexible, API-first platform."],
    [u.AD, s.GOR, "Hi Gorgias — Amara from Depop. Our support volume is high and our current tool isn't scaling. Want to see your automation and macro capabilities."],
    [u.RO, s.EXT, "Hey Extensiv — Ryan from Beautycounter. Full ops audit in progress. 3PL and WMS are a priority to optimize for cost and speed."],
    [u.SM, s.KL,  "Hi Klaviyo — Sophie from Boohoo DTC. Migrating from another ESP and Klaviyo is at the top of our list. Want to understand migration support and timeline."],
    [u.JO, s.LR,  "Hey Loop Returns — James from Glossier. We get a lot of gift returns and exchanges. How does Loop handle gifting flows and store credit?"],
  ]

  // ── REJECTED sponsor meetings ──────────────────────────────────────────────
  const rejectedSponsor: [string, string, string][] = [
    [u.JL, s.BC,  "Hi BigCommerce — Jordan from Arhaus DTC. Doing due diligence on platform alternatives, though we're deep in the Shopify ecosystem."],
    [u.AB, s.OG,  "Hey Ordergroove — Aaliyah from Entireworld. We're interested in subscriptions but our catalog isn't subscription-ready yet. Timing isn't right."],
    [u.MB, s.ATT, "Hi Attentive — Marcus from 4moms DTC. After an initial call we determined Postscript is a better fit for our volume and budget tier."],
    [u.ST, s.GOR, "Hey Gorgias — Sam from Boohoo DTC. Our CS team evaluated this but decided to stay with Zendesk for now given our deep integration work already done."],
  ]

  // ── CONFIRMED peer meetings ────────────────────────────────────────────────
  // d1s7 is shared by JL↔MP and CN↔TE — different pairs, fine to use same block
  const confirmedPeer: [string, string, string, string][] = [
    [u.JL, u.MP, tb(1,7), "Hey Maya — Jordan here from Arhaus DTC. I saw you're leading DTC at Urban Decay and we're at a similar inflection point. Would love to swap notes on what's working."],
    [u.CN, u.TE, tb(1,7), "Hi Tom — Chris from Noihsaf Bazaar. Your eCommerce strategy work at Olive & Piper sounds interesting. Would love to compare notes on marketplace vs. DTC tradeoffs."],
    [u.KO, u.AD, tb(1,6), "Hey Amara — Kwesi from SK-II DTC. Both of us are scaling DTC in very different verticals. Think there's a lot we can learn from each other's playbooks."],
  ]

  // ── APPROVED peer meetings ─────────────────────────────────────────────────
  const approvedPeer: [string, string, string][] = [
    [u.AB, u.MB, "Hi Marcus — Aaliyah from Entireworld. Growth and retention are two sides of the same coin. Would love to swap frameworks over coffee."],
    [u.KO, u.HS, "Hey Hana — Kwesi from SK-II. Premium brand growth in global markets is something we're both navigating. This would be a great conversation."],
    [u.AD, u.CB, "Hi Chloe — Amara from Depop. We're both in beauty-adjacent DTC. Would love to share what we're seeing on the retention and UGC side."],
  ]

  // ── PENDING peer meetings ──────────────────────────────────────────────────
  const pendingPeer: [string, string, string][] = [
    [u.ST, u.PS, "Hey Priya — Sam from Boohoo DTC engineering. Would love to compare tech stacks. Are you building your own checkout layer or using something off the shelf?"],
    [u.LH, u.RO, "Hi Ryan — Leila from Roman Health. COO-to-COO on scaling ops in regulated industries would be super valuable. Hope we can find 30 minutes."],
    [u.MP, u.CB, "Hey Chloe — Maya from Urban Decay. Both in beauty. Would love to talk about what's working on the DTC side at Kylie right now."],
    [u.HS, u.AD, "Hi Amara — Hana from SSENSE. I follow Depop closely. The peer-to-peer resale model is fascinating from a growth strategy standpoint. Let's connect!"],
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
  console.log(`   Confirmed: ${confirmedSponsor.length + confirmedPeer.length}`)
  console.log(`   Approved:  ${approvedSponsor.length + approvedPeer.length}`)
  console.log(`   Pending:   ${pendingSponsor.length + pendingPeer.length}`)
  console.log(`   Rejected:  ${rejectedSponsor.length}`)
  console.log(`   Session bookmarks: ${bookmarks.reduce((n, [, ids]) => n + ids.length, 0)}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
