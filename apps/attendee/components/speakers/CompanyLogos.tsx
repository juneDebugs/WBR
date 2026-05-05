// Inline SVG logos for speaker companies — no external dependencies, always crisp
export function CompanyLogo({ company, size = 28 }: { company: string; size?: number }) {
  const logo = LOGOS[company]
  if (!logo) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="flex-shrink-0"
    >
      {logo}
    </svg>
  )
}

// Brand colors reference for e-commerce / tech companies
const LOGOS: Record<string, React.ReactNode> = {

  // ── Well-known brands with recognizable marks ─────────────────────────────

  // Shopify — shopping bag with S
  'Shopify': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#95BF47"/>
      <path d="M38 18c0 0-.5.1-.5.2 0 0-1-.3-2.2-.4-.2-1.1-.7-2.1-.7-2.1h-.1c-.8 1.2-1.8 1.7-2.6 1.8-.1-.4-.5-.7-.9-.7-1.3 0-2.6 1.6-3.2 3.9l-2.2.7c0 0 0 0 0 .1l-4.4 13.8L32 48l14.5-3.1L41 22c0 0-2.6-1-3-1z" fill="white" opacity="0.9"/>
      <path d="M35.2 18c-1.1 0-2.2.4-3 1.2-.6.5-1 1.3-1.3 2.2l-2.8.9c.6-2.4 2-4.5 3.9-4.5.3 0 .6.1.8.2h.1c.4 0 .8.1 1.2.2.3 0 .6.1.9.2 0-.2.1-.3.2-.4z" fill="#95BF47"/>
      <path d="M36 20c-.8-.3-1.7-.5-2.5-.5-2 0-3.4 1.5-4 3.8l-1.6.5c.5-2.8 2.2-5.2 4.7-5.2.5 0 1 .1 1.4.3 0 0 .3.1.5.2l1.5.9z" fill="#5E8E3E"/>
    </g>
  ),

  // Klaviyo — K mark
  'Klaviyo': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <path d="M22 44V20h6v10l10-10h8L36 30l11 14h-8l-7-9-4 4v5h-6z" fill="#2EFF82"/>
    </g>
  ),

  // Google Cloud — GC cloud mark
  'Google Cloud': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="white"/>
      <path d="M38.7 25.3l2.2-2.2.1-1c-3.2-3-7.5-4.5-12-3.9-4.4.6-8.2 3.4-10.2 7.3l.9.1 4.4-.7.3-.3c2.3-2.5 5.8-3.5 9.1-2.7l.3.1z" fill="#EA4335"/>
      <path d="M45 28.5c-.8-2.8-2.4-5.3-4.6-7.2l-3.2 3.2c1.5 1.2 2.5 3 2.8 5h.7c1.8 0 3.2 1.4 3.2 3.2v.8c0 1.8-1.4 3.2-3.2 3.2H33l-.8.8v5l.8.7h7.7c4.2 0 7.6-3.4 7.6-7.6 0-3.1-1-5.5-3.3-7.1z" fill="#4285F4"/>
      <path d="M25.3 43.2h7.7v-4.4h-7.7c-.5 0-1-.1-1.4-.3l-1 .3-1.2 1.2-.2 1c1 .7 2.4 1.3 3.8 1.3z" fill="#34A853"/>
      <path d="M25.3 28c-4.2 0-7.6 3.4-7.6 7.6 0 2.6 1.3 4.9 3.3 6.3l2.5-2.5c-1.3-.7-2.2-2-2.2-3.5 0-2.2 1.7-3.9 3.9-3.9.8 0 1.6.3 2.2.7l2.5-2.5C29.6 28.8 27.6 28 25.3 28z" fill="#FBBC05"/>
    </g>
  ),

  // Meta — infinity loop
  'Meta': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#0081FB"/>
      <path d="M18 32c0-6 3-12 7-12s6 6 7 12c1 6 3 12 7 12s7-6 7-12" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <path d="M46 32c0 6-3 12-7 12s-6-6-7-12c-1-6-3-12-7-12s-7 6-7 12" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
    </g>
  ),

  // Vercel — triangle
  'Vercel': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <path d="M32 18l16 28H16z" fill="white"/>
    </g>
  ),

  // TikTok Shop — TikTok note
  'TikTok Shop': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <path d="M40 16c0 4.2 3.4 7.5 7.5 7.5v5c-2.6 0-5-.8-7-2.1v9.6c0 7-5.7 12.5-12.5 12.5S15.5 43 15.5 36s5.7-12.5 12.5-12.5v5c-4.1 0-7.5 3.4-7.5 7.5s3.4 7.5 7.5 7.5 7.5-3.4 7.5-7.5V16h5z" fill="white"/>
      <path d="M40 16c0 4.2 3.4 7.5 7.5 7.5v5c-2.6 0-5-.8-7-2.1v9.6c0 7-5.7 12.5-12.5 12.5" fill="none" stroke="#FE2C55" strokeWidth="1.5" opacity="0.7"/>
      <path d="M15.5 36c0-6.9 5.6-12.5 12.5-12.5v5c-4.1 0-7.5 3.4-7.5 7.5s3.4 7.5 7.5 7.5" fill="none" stroke="#25F4EE" strokeWidth="1.5" opacity="0.7"/>
    </g>
  ),

  // BigCommerce — BC logo
  'BigCommerce': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#121118"/>
      <path d="M16 24l16-8 16 8v16l-16 8-16-8z" fill="none" stroke="white" strokeWidth="3"/>
      <path d="M25 29h14M25 35h10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // Contentful — circle cluster
  'Contentful': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#FAE501"/>
      <circle cx="24" cy="24" r="5" fill="#0C46A0"/>
      <circle cx="24" cy="40" r="5" fill="#EC5B2A"/>
      <circle cx="38" cy="32" r="5" fill="#50C2A7"/>
      <path d="M28 26l7 4M28 38l7-4" stroke="#0C46A0" strokeWidth="2"/>
    </g>
  ),

  // Segment — green lines
  'Segment': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#52BD95"/>
      <path d="M18 26h22M18 34h16M18 42h10" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="44" cy="20" r="4" fill="white"/>
    </g>
  ),

  // Criteo — orange C wave
  'Criteo': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#F47A20"/>
      <path d="M40 22c-6-4-14-2-18 4s-2 14 4 18" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="40" cy="22" r="4" fill="white"/>
      <circle cx="26" cy="44" r="4" fill="white"/>
    </g>
  ),

  // Adyen — green tech
  'Adyen': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#0ABF53"/>
      <path d="M20 38l8-12h8l-8 12h12v6H20v-6z" fill="white"/>
      <path d="M28 26l8 0 8-6h-8z" fill="white" opacity="0.7"/>
    </g>
  ),

  // ── E-commerce SaaS / Marketing ───────────────────────────────────────────

  // Attentive — A with signal waves
  'Attentive': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <path d="M24 44l8-24 8 24" fill="none" stroke="#FFD700" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M27 36h10" stroke="#FFD700" strokeWidth="3" strokeLinecap="round"/>
      <path d="M42 22c3 3 4 7 4 12" fill="none" stroke="#FFD700" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M46 18c5 5 7 11 7 18" fill="none" stroke="#FFD700" strokeWidth="2" strokeLinecap="round" opacity="0.6"/>
    </g>
  ),

  // Postscript — PS text bubble
  'Postscript': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#6C2BD9"/>
      <rect x="14" y="16" width="36" height="26" rx="8" fill="white"/>
      <path d="M24 42l-4 8 10-8" fill="white"/>
      <text x="22" y="35" fontFamily="system-ui" fontWeight="800" fontSize="16" fill="#6C2BD9">PS</text>
    </g>
  ),

  // Recharge — circular arrows (subscription)
  'Recharge': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#5235D0"/>
      <path d="M40 22A12 12 0 0122 34" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <path d="M24 42A12 12 0 0142 30" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <path d="M18 34l4 0 0-4" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M46 30l-4 0 0 4" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  ),

  // Yotpo — speech bubble star
  'Yotpo': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#263C72"/>
      <rect x="14" y="16" width="36" height="24" rx="6" fill="white"/>
      <path d="M22 40l-2 8 8-8" fill="white"/>
      <path d="M32 22l2 5h5l-4 3 1.5 5L32 32l-4.5 3L29 30l-4-3h5z" fill="#263C72"/>
    </g>
  ),

  // Okendo — star/review
  'Okendo': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1A1A2E"/>
      <path d="M32 16l5 10h11l-9 7 3 11-10-7-10 7 3-11-9-7h11z" fill="#6C63FF"/>
    </g>
  ),

  // LoyaltyLion — crown/lion
  'LoyaltyLion': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#F15B2A"/>
      <path d="M16 38l6-14 10 8 10-8 6 14z" fill="white"/>
      <circle cx="22" cy="24" r="3" fill="white"/>
      <circle cx="42" cy="24" r="3" fill="white"/>
      <path d="M20 42h24" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // Grin — smile face
  'Grin': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#2D2D6B"/>
      <circle cx="32" cy="32" r="18" fill="none" stroke="#50E3C2" strokeWidth="3"/>
      <circle cx="26" cy="28" r="2.5" fill="#50E3C2"/>
      <circle cx="38" cy="28" r="2.5" fill="#50E3C2"/>
      <path d="M24 36c3 4 9 4 12 0" fill="none" stroke="#50E3C2" strokeWidth="2.5" strokeLinecap="round"/>
    </g>
  ),

  // Triple Whale — whale tail
  'Triple Whale': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1B1464"/>
      <path d="M16 36c4-8 8-14 16-14s12 6 16 14" fill="none" stroke="#4FC3F7" strokeWidth="4" strokeLinecap="round"/>
      <path d="M24 36c0-6 4-10 8-10s8 4 8 10" fill="none" stroke="#4FC3F7" strokeWidth="3" strokeLinecap="round"/>
      <path d="M28 36c0-3 2-5 4-5s4 2 4 5" fill="none" stroke="#4FC3F7" strokeWidth="2.5" strokeLinecap="round"/>
    </g>
  ),

  // Salsify — leaf/data
  'Salsify': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#00263E"/>
      <path d="M20 44c0-16 12-28 24-28-4 8-6 18-6 28z" fill="#0096D6"/>
      <path d="M24 42c2-10 6-18 12-22" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M26 38c2-6 5-12 8-16" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    </g>
  ),

  // Faire — handshake/marketplace
  'Faire': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#004D40"/>
      <text x="15" y="42" fontFamily="system-ui" fontWeight="700" fontSize="28" fill="white">faire</text>
    </g>
  ),

  // commercetools — CT
  'commercetools': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1A2233"/>
      <circle cx="32" cy="32" r="16" fill="none" stroke="#6359FF" strokeWidth="4"/>
      <path d="M28 26l12 0" stroke="#6359FF" strokeWidth="4" strokeLinecap="round"/>
      <path d="M34 20v24" stroke="#6359FF" strokeWidth="4" strokeLinecap="round"/>
    </g>
  ),

  // Medusa — open-source logo
  'Medusa': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <circle cx="32" cy="32" r="10" fill="#7C3AED"/>
      <path d="M32 14v8M32 42v8M14 32h8M42 32h8M19 19l6 6M39 39l6 6M45 19l-6 6M25 39l-6 6" stroke="#7C3AED" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // ChannelAdvisor — CA arrows
  'ChannelAdvisor': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#0054A6"/>
      <path d="M20 32h24M36 24l8 8-8 8" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M20 22h10M20 42h10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // ── Shipping / Logistics ──────────────────────────────────────────────────

  // ShipStation — star in box
  'ShipStation': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#62B345"/>
      <rect x="14" y="20" width="36" height="28" rx="4" fill="white"/>
      <path d="M32 24l3 6h7l-5.5 4 2 7L32 36l-6.5 5 2-7L22 30h7z" fill="#62B345"/>
      <path d="M20 20l4-6h16l4 6" fill="white"/>
    </g>
  ),

  // Loop Returns — loop arrow
  'Loop Returns': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#5046E5"/>
      <circle cx="32" cy="32" r="12" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray="60 16"/>
      <path d="M38 20l0 8-8 0" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  ),

  // Narvar — location/delivery pin
  'Narvar': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#FF5252"/>
      <path d="M32 14c-8 0-14 6-14 14 0 10 14 22 14 22s14-12 14-22c0-8-6-14-14-14z" fill="white"/>
      <circle cx="32" cy="28" r="6" fill="#FF5252"/>
    </g>
  ),

  // Extensiv — grid/warehouse
  'Extensiv': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1E3A5F"/>
      <rect x="14" y="28" width="10" height="16" rx="2" fill="#4FC3F7"/>
      <rect x="27" y="20" width="10" height="24" rx="2" fill="#4FC3F7" opacity="0.8"/>
      <rect x="40" y="24" width="10" height="20" rx="2" fill="#4FC3F7" opacity="0.6"/>
    </g>
  ),

  // AfterShip — tracking arrow
  'AfterShip': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#3E21CF"/>
      <path d="M18 32h20" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <path d="M32 22l12 10-12 10" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="18" cy="32" r="3" fill="white"/>
    </g>
  ),

  // ── Search / Personalization ──────────────────────────────────────────────

  // Searchspring — magnifying glass with S
  'Searchspring': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#FF6B35"/>
      <circle cx="28" cy="28" r="12" fill="none" stroke="white" strokeWidth="4"/>
      <path d="M37 37l10 10" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <path d="M25 24c0-2 1.5-3 3-3s3 1 3 3c0 3-6 3-6 6 0 2 1.5 3 3 3s3-1 3-3" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </g>
  ),

  // Rebuy Engine — RE gear
  'Rebuy Engine': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1F4B3F"/>
      <circle cx="32" cy="32" r="14" fill="none" stroke="white" strokeWidth="3"/>
      <circle cx="32" cy="32" r="6" fill="white"/>
      <path d="M32 14v6M32 44v6M14 32h6M44 32h6M18.7 18.7l4.2 4.2M41.1 41.1l4.2 4.2M45.3 18.7l-4.2 4.2M22.9 41.1l-4.2 4.2" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // Nosto — N personalization
  'Nosto': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#2B2B2B"/>
      <path d="M22 44V20l20 24V20" fill="none" stroke="#47D7AC" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  ),

  // ── Analytics / Data ──────────────────────────────────────────────────────

  // Looker — L eye
  'Looker': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="white" stroke="#E8E8E8" strokeWidth="2"/>
      <path d="M32 20c-10 0-18 12-18 12s8 12 18 12 18-12 18-12-8-12-18-12z" fill="none" stroke="#4285F4" strokeWidth="3"/>
      <circle cx="32" cy="32" r="6" fill="#4285F4"/>
    </g>
  ),

  // Inventory Planner — chart/plan
  'Inventory Planner': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#3B5998"/>
      <path d="M16 44l10-14 8 8 14-18" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="48" cy="20" r="3" fill="#4FC3F7"/>
    </g>
  ),

  // ── International / Localization ──────────────────────────────────────────

  // Global-e — globe
  'Global-e': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#002D72"/>
      <circle cx="32" cy="32" r="16" fill="none" stroke="white" strokeWidth="3"/>
      <ellipse cx="32" cy="32" rx="8" ry="16" fill="none" stroke="white" strokeWidth="2"/>
      <path d="M16 32h32M18 24h28M18 40h28" stroke="white" strokeWidth="1.5"/>
    </g>
  ),

  // Weglot — W translate
  'Weglot': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#3575D3"/>
      <path d="M16 22l6 20 6-14 6 14 6-20" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M44 22l4 0" stroke="white" strokeWidth="4" strokeLinecap="round"/>
    </g>
  ),

  // ── Platform / Infrastructure ─────────────────────────────────────────────

  // Centra — C
  'Centra': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <path d="M40 20c-4-3-10-3-14 0s-6 10-4 16 8 10 14 8 10-8 8-14" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
    </g>
  ),

  // Cloudinary — cloud with code
  'Cloudinary': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#3448C5"/>
      <path d="M42 38H22c-5 0-8-4-8-8s3-8 8-8c0-5 4-10 10-10 5 0 9 3 10 7 4 0 8 4 8 8s-4 8-8 8z" fill="white"/>
    </g>
  ),

  // ── DTC / Retail Brands ───────────────────────────────────────────────────

  // Glossier — G minimal
  'Glossier': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#FFC0CB"/>
      <text x="18" y="46" fontFamily="Georgia, serif" fontWeight="700" fontSize="38" fill="white">G</text>
    </g>
  ),

  // Depop — bolt/tag
  'Depop': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#FF2300"/>
      <path d="M26 16v14c0 6 3 10 8 10s8-4 8-10V22" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <circle cx="26" cy="16" r="3" fill="white"/>
    </g>
  ),

  // Kylie Cosmetics — drip/lips
  'Kylie Cosmetics': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <path d="M22 30c4-8 8-12 10-12s6 4 10 12c3 6 2 12-2 15s-10 3-14 0-6-9-4-15z" fill="none" stroke="white" strokeWidth="3"/>
      <path d="M28 34c2-3 3-4 4-4s2 1 4 4" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </g>
  ),

  // Selfridges Digital — S ribbon
  'Selfridges Digital': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#F4E04D"/>
      <text x="18" y="46" fontFamily="Georgia, serif" fontWeight="700" fontSize="38" fill="#1A1A1A">S</text>
    </g>
  ),

  // Allbirds — bird foot/tree
  'Allbirds': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#264653"/>
      <path d="M32 48V28" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <path d="M32 28c-8-6-16-4-16 2" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M32 28c8-6 16-4 16 2" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M32 22c-4-6-2-12 4-12" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <path d="M32 22c4-6 2-12-4-12" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // ThredUp — recycle/hanger
  'ThredUp': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#00A651"/>
      <path d="M26 24l6-6 6 6" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M32 18v4" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <path d="M20 44h24l-4-18H24z" fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M28 36h8M28 40h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </g>
  ),

  // Packlane — box
  'Packlane': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#E85D26"/>
      <path d="M12 24l20-8 20 8v20l-20 8-20-8z" fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M12 24l20 8 20-8M32 32v20" stroke="white" strokeWidth="3" strokeLinejoin="round"/>
    </g>
  ),

  // ── Fraud / Security ──────────────────────────────────────────────────────

  // Signifyd — shield check
  'Signifyd': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#5B35B5"/>
      <path d="M32 12c-8 4-16 6-16 6s0 16 4 24c3 6 8 8 12 10 4-2 9-4 12-10 4-8 4-24 4-24s-8-2-16-6z" fill="none" stroke="white" strokeWidth="3"/>
      <path d="M24 32l5 5 10-10" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  ),

  // ── Video / Live Commerce ─────────────────────────────────────────────────

  // Bambuser — play/live
  'Bambuser': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <circle cx="32" cy="32" r="16" fill="none" stroke="#FF2D55" strokeWidth="3"/>
      <path d="M28 24l14 8-14 8z" fill="#FF2D55"/>
      <circle cx="46" cy="16" r="4" fill="#FF2D55"/>
    </g>
  ),

  // ── Customer Support ──────────────────────────────────────────────────────

  // Gorgias — chat bubble G
  'Gorgias': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1F2937"/>
      <path d="M16 20h32v20c0 2-2 4-4 4H26l-6 6v-6h-4V20z" fill="#5850EC" rx="4"/>
      <path d="M24 28h16M24 34h10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // ── Tapcart — mobile commerce ─────────────────────────────────────────────

  'Tapcart': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#2563EB"/>
      <rect x="22" y="12" width="20" height="36" rx="4" fill="none" stroke="white" strokeWidth="3"/>
      <path d="M28 42h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <path d="M18 28l8-6v12z" fill="white"/>
    </g>
  ),

  // Bold Commerce — B bold
  'Bold Commerce': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <path d="M22 16h12c5 0 8 3 8 7s-2 6-5 7c4 1 7 4 7 8s-3 8-9 8H22z" fill="none" stroke="white" strokeWidth="0"/>
      <path d="M26 20h8c3 0 4 2 4 4s-1 4-4 4h-8zM26 32h9c3 0 5 2 5 4s-2 4-5 4h-9z" fill="white"/>
    </g>
  ),

  // ── Placeholder brands (startup/generic) ──────────────────────────────────

  // SSENSE — fashion tech
  'SSENSE': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#000"/>
      <text x="9" y="41" fontFamily="system-ui" fontWeight="900" fontSize="18" fill="white" letterSpacing="-1">SSENSE</text>
    </g>
  ),

  // Tailor ERP — scissors/thread
  'Tailor ERP': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#2D3748"/>
      <circle cx="24" cy="40" r="6" fill="none" stroke="#F6AD55" strokeWidth="3"/>
      <circle cx="24" cy="24" r="6" fill="none" stroke="#F6AD55" strokeWidth="3"/>
      <path d="M29 27l15 17M29 37l15-17" stroke="#F6AD55" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // FinFlow — flow chart
  'FinFlow': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#0E7C61"/>
      <circle cx="20" cy="20" r="6" fill="white"/>
      <circle cx="44" cy="20" r="6" fill="white"/>
      <circle cx="32" cy="44" r="6" fill="white"/>
      <path d="M24 24l6 16M40 24l-6 16" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    </g>
  ),

  // DeepTech Labs — circuit/lab
  'DeepTech Labs': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#1A1A2E"/>
      <circle cx="32" cy="32" r="6" fill="#00D4FF"/>
      <path d="M32 14v12M32 38v12M14 32h12M38 32h12" stroke="#00D4FF" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="32" cy="14" r="3" fill="#00D4FF"/>
      <circle cx="32" cy="50" r="3" fill="#00D4FF"/>
      <circle cx="14" cy="32" r="3" fill="#00D4FF"/>
      <circle cx="50" cy="32" r="3" fill="#00D4FF"/>
    </g>
  ),

  // CloudScale Inc. — cloud + scale
  'CloudScale Inc.': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#0F172A"/>
      <path d="M42 34H22c-4 0-7-3-7-7s3-7 7-7c0-5 4-8 9-8 4 0 7 2 8 6 4 0 7 3 7 7s-3 7-7 7z" fill="#38BDF8"/>
      <path d="M20 42l8-4 8 4 8-4" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  ),

  // SecureFoundry — lock/anvil
  'SecureFoundry': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#7C2D12"/>
      <rect x="20" y="28" width="24" height="18" rx="4" fill="white"/>
      <path d="M26 28v-6a6 6 0 0112 0v6" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <circle cx="32" cy="38" r="3" fill="#7C2D12"/>
    </g>
  ),
}

export const COMPANY_LOGO_NAMES = new Set(Object.keys(LOGOS))
