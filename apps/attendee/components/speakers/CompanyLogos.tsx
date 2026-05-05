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

export const COMPANY_LOGO_NAMES = new Set([
  'Google Cloud', 'Robinhood', 'OpenAI', 'Palo Alto Networks', 'DeepMind',
  'Meta AI', 'Stripe', 'Anthropic', 'Notion', 'Cloudflare', 'Shopify',
  'Vercel', 'Spotify', 'GitHub', 'Crowdstrike', 'Plaid', 'Palantir',
  'Figma', 'Linear', 'Loom', 'Raycast', 'Supabase',
])

const LOGOS: Record<string, React.ReactNode> = {
  // Google Cloud — four-color cloud
  'Google Cloud': (
    <g>
      <path d="M37.5 20h-11l-2.8 4.8L26.5 30h11l2.8-5.1z" fill="#4285F4"/>
      <path d="M26.5 20l-8 13.8 5 8.7L37.5 20z" fill="#34A853"/>
      <path d="M18.5 33.8L13.5 42.5h16l5-8.7H23.6z" fill="#FBBC05"/>
      <path d="M40.3 24.8L37.5 30h-3l-5 12.5h16l-5-17.7z" fill="#EA4335"/>
      <circle cx="32" cy="32" r="26" stroke="#4285F4" strokeWidth="2" fill="none" opacity="0.15"/>
    </g>
  ),

  // Robinhood — green feather
  'Robinhood': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#00C805"/>
      <path d="M22 42c0-12 8-22 20-24-2 4-3 9-3 14 0 5-3 10-8 10H22z" fill="white"/>
    </g>
  ),

  // OpenAI — hexagonal knot
  'OpenAI': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#000"/>
      <path d="M32 14c-2.5 0-4.8 1.3-6.1 3.4l-6 10.4c-1.3 2.1-1.3 4.7 0 6.8l6 10.4c1.3 2.1 3.6 3.4 6.1 3.4s4.8-1.3 6.1-3.4l6-10.4c1.3-2.1 1.3-4.7 0-6.8l-6-10.4C36.8 15.3 34.5 14 32 14z" fill="none" stroke="white" strokeWidth="2.5"/>
      <path d="M32 22v20M23 27l18 10M41 27L23 37" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
    </g>
  ),

  // Palo Alto Networks — stylized shield
  'Palo Alto Networks': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#FA582D"/>
      <path d="M32 16l-14 8v16l14 8 14-8V24z" fill="none" stroke="white" strokeWidth="3"/>
      <path d="M32 24v16M24 28l16 8M40 28L24 36" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
    </g>
  ),

  // DeepMind — neural/geometric pattern
  'DeepMind': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#4285F4"/>
      <circle cx="32" cy="20" r="4" fill="white"/>
      <circle cx="22" cy="32" r="4" fill="white"/>
      <circle cx="42" cy="32" r="4" fill="white"/>
      <circle cx="32" cy="44" r="4" fill="white"/>
      <path d="M32 24v16M26 32h12M32 20l-10 12M32 20l10 12M22 32l10 12M42 32l-10 12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    </g>
  ),

  // Meta AI — infinity loop
  'Meta AI': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#0081FB"/>
      <path d="M18 32c0-6 3-12 7-12s6 6 7 12c1 6 3 12 7 12s7-6 7-12" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <path d="M46 32c0 6-3 12-7 12s-6-6-7-12c-1-6-3-12-7-12s-7 6-7 12" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
    </g>
  ),

  // Stripe — bold italic S
  'Stripe': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#635BFF"/>
      <path d="M30 22c-4 0-6 2-6 4.5 0 6 16 4 16 13 0 4-3.5 6.5-9 6.5-4 0-8-1.5-10-3.5" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <path d="M34 42c4 0 6-2 6-4.5 0-6-16-4-16-13 0-4 3.5-6.5 9-6.5 4 0 8 1.5 10 3.5" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"/>
    </g>
  ),

  // Anthropic — starburst / asterisk
  'Anthropic': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#D4A27F"/>
      <path d="M32 16v32M16 32h32M20 20l24 24M44 20L20 44" stroke="white" strokeWidth="4" strokeLinecap="round"/>
    </g>
  ),

  // Notion — N in a box
  'Notion': (
    <g>
      <rect x="6" y="6" width="52" height="52" rx="12" fill="white" stroke="#000" strokeWidth="3"/>
      <path d="M22 18v28l20-28v28" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
    </g>
  ),

  // Cloudflare — cloud with rays
  'Cloudflare': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#F48120"/>
      <path d="M42 38H20a8 8 0 01-.5-16A12 12 0 0143 24a8 8 0 01-1 14z" fill="white"/>
      <rect x="38" y="30" width="14" height="6" rx="3" fill="#FAAD3F"/>
    </g>
  ),

  // Shopify — shopping bag
  'Shopify': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#96BF48"/>
      <path d="M24 22l4-6h8l4 6v22H24z" fill="white" stroke="white" strokeWidth="1"/>
      <path d="M28 22v-3a4 4 0 018 0v3" fill="none" stroke="#96BF48" strokeWidth="2.5" strokeLinecap="round"/>
    </g>
  ),

  // Vercel — triangle
  'Vercel': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#000"/>
      <path d="M32 18l16 28H16z" fill="white"/>
    </g>
  ),

  // Spotify — circle with waves
  'Spotify': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#1DB954"/>
      <path d="M20 26c8-3 18-2 24 2" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M22 33c6-2.5 14-1.5 20 1.5" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"/>
      <path d="M24 40c5-2 11-1.5 16 1" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
    </g>
  ),

  // GitHub — octocat silhouette
  'GitHub': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#24292F"/>
      <path d="M32 14a18 18 0 00-5.7 35.1c.9.2 1.2-.4 1.2-.9v-3.1c-5 1.1-6-2.4-6-2.4-.8-2.1-2-2.6-2-2.6-1.7-1.1.1-1.1.1-1.1 1.8.1 2.8 1.9 2.8 1.9 1.6 2.8 4.3 2 5.3 1.5.2-1.2.6-2 1.1-2.4-4-.5-8.2-2-8.2-8.9 0-2 .7-3.6 1.9-4.9-.2-.5-.8-2.3.2-4.8 0 0 1.5-.5 5 1.9a17.4 17.4 0 019.2 0c3.5-2.4 5-1.9 5-1.9 1 2.5.4 4.3.2 4.8 1.2 1.3 1.9 2.9 1.9 4.9 0 7-4.2 8.4-8.3 8.9.7.6 1.2 1.7 1.2 3.5v5.2c0 .5.3 1.1 1.2.9A18 18 0 0032 14z" fill="white"/>
    </g>
  ),

  // Crowdstrike — falcon/hawk
  'Crowdstrike': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#EB2027"/>
      <path d="M20 44c4-8 8-18 20-26-4 6-4 12-2 18-6-2-10 0-12 4l-2 6z" fill="white"/>
      <path d="M34 22c4-2 8-2 12 0-2 4-6 10-12 14" fill="white" opacity="0.7"/>
    </g>
  ),

  // Plaid — geometric grid
  'Plaid': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#000"/>
      <rect x="18" y="18" width="8" height="8" rx="1" fill="white"/>
      <rect x="28" y="18" width="8" height="8" rx="1" fill="white"/>
      <rect x="38" y="18" width="8" height="8" rx="1" fill="white"/>
      <rect x="18" y="28" width="8" height="8" rx="1" fill="white"/>
      <rect x="28" y="28" width="8" height="8" rx="1" fill="white"/>
      <rect x="18" y="38" width="8" height="8" rx="1" fill="white"/>
      <rect x="28" y="38" width="8" height="8" rx="1" fill="white"/>
      <rect x="38" y="38" width="8" height="8" rx="1" fill="white"/>
    </g>
  ),

  // Palantir — concentric circles/eye
  'Palantir': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#101010"/>
      <circle cx="32" cy="32" r="18" fill="none" stroke="white" strokeWidth="2.5"/>
      <circle cx="32" cy="32" r="11" fill="none" stroke="white" strokeWidth="2.5"/>
      <circle cx="32" cy="32" r="4" fill="white"/>
    </g>
  ),

  // Figma — colored shapes
  'Figma': (
    <g>
      <rect x="20" y="14" width="12" height="12" rx="6" fill="#F24E1E"/>
      <rect x="32" y="14" width="12" height="12" rx="6" fill="#FF7262"/>
      <rect x="20" y="26" width="12" height="12" rx="6" fill="#A259FF"/>
      <circle cx="38" cy="32" r="6" fill="#1ABCFE"/>
      <rect x="20" y="38" width="12" height="12" rx="6" fill="#0ACF83"/>
    </g>
  ),

  // Linear — rounded arrow/chevron
  'Linear': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#5E6AD2"/>
      <path d="M16 48L16 30a16 16 0 0116-16h2" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none"/>
      <path d="M24 48L24 36a8 8 0 018-8h2" stroke="white" strokeWidth="5" strokeLinecap="round" fill="none"/>
    </g>
  ),

  // Loom — gradient segments
  'Loom': (
    <g>
      <circle cx="32" cy="32" r="28" fill="#625DF5"/>
      <circle cx="32" cy="32" r="6" fill="white"/>
      <path d="M32 14v12" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path d="M32 38v12" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path d="M17.4 23l10.4 6" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path d="M36.2 35l10.4 6" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path d="M17.4 41l10.4-6" stroke="white" strokeWidth="5" strokeLinecap="round"/>
      <path d="M36.2 29l10.4-6" stroke="white" strokeWidth="5" strokeLinecap="round"/>
    </g>
  ),

  // Raycast — ray/beam
  'Raycast': (
    <g>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="#FF6363"/>
      <path d="M18 46l10-10M22 36l6 6M28 18l-10 10M36 22l-6-6" stroke="white" strokeWidth="4" strokeLinecap="round"/>
      <rect x="28" y="28" width="12" height="12" rx="2" fill="white" transform="rotate(-45 34 34)"/>
    </g>
  ),

  // Supabase — green diamond/arrow
  'Supabase': (
    <g>
      <path d="M34 50c-1 2-4 1-4-1V30h18c3 0 4 3 2 5L34 50z" fill="#3ECF8E"/>
      <path d="M30 14c1-2 4-1 4 1v19H16c-3 0-4-3-2-5L30 14z" fill="#3ECF8E" opacity="0.6"/>
    </g>
  ),
}
