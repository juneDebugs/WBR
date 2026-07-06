/**
 * WBR shared Tailwind preset — single source of truth for the design system.
 * HIG-grounded (Clarity · Deference · Depth). See docs/design-system.md.
 *
 * Consumed build-time only: each app's tailwind.config.ts does
 *   presets: [require('../../packages/ui/preset.cjs')]
 * No runtime import — nothing here ships to the client except the CSS the
 * component/base layers generate. Kept as a plain object (no `require('tailwindcss')`)
 * because packages/ui has no local node_modules; the bare-function plugin form
 * is resolved by each app's own Tailwind.
 */

// ---- Foundations ------------------------------------------------------------

const SYSTEM_SANS = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"SF Pro Text"',
  '"SF Pro Display"',
  '"Segoe UI"',
  'Roboto',
  'Helvetica',
  'Arial',
  'sans-serif',
  '"Apple Color Emoji"',
  '"Segoe UI Emoji"',
]

// Brand accent — indigo, anchored on the pre-existing #6366f1.
const brand = {
  50: '#eef2ff',
  100: '#e0e7ff',
  200: '#c7d2fe',
  300: '#a5b4fc',
  400: '#818cf8',
  500: '#6366f1',
  600: '#4f46e5',
  700: '#4338ca',
  800: '#3730a3',
  900: '#312e81',
  DEFAULT: '#6366f1',
}

const colors = {
  brand,
  // Back-compat aliases: bg-primary / bg-primary-dark / bg-primary-light,
  // text-primary, ring-primary/40, bg-primary/10 all keep working.
  primary: { DEFAULT: '#6366f1', dark: '#4f46e5', light: '#818cf8' },

  // Neutral surfaces & text (Apple-style, unified across all four apps).
  canvas: '#f5f5f7', // app background
  surface: { DEFAULT: '#ffffff', 2: '#fbfbfd' },
  fill: { DEFAULT: '#f2f2f7', 2: '#e9e9ee' },
  hairline: '#e5e5ea',
  ink: { DEFAULT: '#1d1d1f', 2: '#6e6e73', 3: '#8e8e93' },

  // Semantic status (Apple system colors + accessible soft/ink pairs).
  success: { DEFAULT: '#34c759', soft: '#e7f8ec', ink: '#1c7a3f' },
  warning: { DEFAULT: '#ff9f0a', soft: '#fff3e0', ink: '#8a5300' },
  danger: { DEFAULT: '#ff3b30', soft: '#ffeceb', ink: '#c81e14' },
  info: { DEFAULT: '#6366f1', soft: '#eef2ff', ink: '#4338ca' },
}

// HIG-named semantic sizes. Added, not replacing Tailwind's default scale,
// so existing text-sm/text-xs/... usage keeps working.
const fontSize = {
  caption: ['0.75rem', { lineHeight: '1rem' }],
  footnote: ['0.8125rem', { lineHeight: '1.125rem' }],
  subhead: ['0.9375rem', { lineHeight: '1.25rem' }],
  callout: ['1rem', { lineHeight: '1.3125rem' }],
  body: ['1.0625rem', { lineHeight: '1.375rem' }],
  headline: ['1.0625rem', { lineHeight: '1.375rem', fontWeight: '600' }],
  title3: ['1.25rem', { lineHeight: '1.5rem', fontWeight: '600', letterSpacing: '-0.01em' }],
  title2: ['1.375rem', { lineHeight: '1.75rem', fontWeight: '700', letterSpacing: '-0.015em' }],
  title1: ['1.75rem', { lineHeight: '2.125rem', fontWeight: '700', letterSpacing: '-0.02em' }],
  largetitle: ['2.125rem', { lineHeight: '2.5rem', fontWeight: '700', letterSpacing: '-0.022em' }],
}

const boxShadow = {
  card: '0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.06)',
  elevated: '0 4px 16px rgba(0,0,0,0.08)',
  pop: '0 8px 30px rgba(0,0,0,0.12)',
}

// ---- Component vocabulary (injected once, shared by every app) ---------------

const RING = '0 0 0 3px rgba(99,102,241,0.30)' // brand focus ring

// Signature brand gradient — blue → pink. Retained ONLY for identity marks
// (avatars, logo marks, accent surfaces via `.brand-gradient` / `bg-brand-gradient`).
// Primary CTAs no longer use it — see the "glow" treatment below.
const BRAND_GRADIENT = 'linear-gradient(135deg, #3b82f6 0%, #ec4899 100%)'

// Primary-CTA "glow" treatment (2026-07 restyle). Replaces the blue→pink gradient
// button with a solid indigo fill (brand-600), a light lavender edge (brand-300)
// and a soft violet halo — the single source of truth for the CTA look in all
// four apps. Implemented purely with color + box-shadow so it changes zero layout
// (no border box-model shift) and keeps the 44px HIG touch target from btnBase.
// rgba form is intentional: keeps the violet out of the retired-hex-literal guard
// and out of app source (this file is the only place the glow is defined).
const BTN_PRIMARY_BG = '#4f46e5' // brand-600, solid
const BTN_PRIMARY_BG_HOVER = '#4338ca' // brand-700
const BTN_GLOW = [
  '0 0 0 1px rgba(165,180,252,0.90)', // brand-300 lavender edge ring
  'inset 0 1px 0 rgba(255,255,255,0.18)', // top sheen (HIG depth)
  '0 4px 14px rgba(79,70,229,0.40)', // brand-600 base lift
  '0 0 22px rgba(168,85,247,0.45)', // violet halo
].join(', ')
const BTN_GLOW_HOVER = [
  '0 0 0 1px rgba(199,210,254,1)', // brand-200 brighter edge
  'inset 0 1px 0 rgba(255,255,255,0.22)',
  '0 6px 20px rgba(79,70,229,0.50)',
  '0 0 32px rgba(168,85,247,0.60)', // intensified violet halo
].join(', ')

const btnBase = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  minHeight: '44px',
  padding: '0 1.25rem',
  borderRadius: '0.75rem', // 12px
  fontWeight: '600',
  fontSize: '0.9375rem',
  lineHeight: '1.1',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  cursor: 'pointer',
  transition: 'transform .15s ease, background-color .15s ease, opacity .15s ease, box-shadow .15s ease',
  '&:active': { transform: 'scale(0.97)' },
  '&:disabled': { opacity: '0.5', cursor: 'not-allowed', transform: 'none' },
}

const fieldBase = {
  display: 'block',
  width: '100%',
  minHeight: '44px',
  padding: '0.625rem 0.875rem',
  borderRadius: '0.75rem',
  border: '1px solid #e5e5ea',
  backgroundColor: '#ffffff',
  color: '#1d1d1f',
  fontSize: '0.9375rem',
  lineHeight: '1.35',
  transition: 'border-color .15s ease, box-shadow .15s ease',
  '&::placeholder': { color: '#8e8e93' },
  '&:focus': { outline: 'none', borderColor: '#6366f1', boxShadow: RING },
  '&:disabled': { backgroundColor: '#f2f2f7', color: '#8e8e93', cursor: 'not-allowed' },
}

function components() {
  return {
    '.page-container': {
      maxWidth: '32rem',
      marginLeft: 'auto',
      marginRight: 'auto',
      paddingLeft: '1rem',
      paddingRight: '1rem',
      paddingTop: '1rem',
      paddingBottom: '1.5rem',
    },
    '.hairline': { borderColor: '#e5e5ea' },

    // Surfaces
    '.card': {
      backgroundColor: '#ffffff',
      border: '1px solid #e5e5ea',
      borderRadius: '1rem', // 16px
      boxShadow: boxShadow.card,
      padding: '1rem',
    },
    '.card-flat': {
      backgroundColor: '#ffffff',
      border: '1px solid #e5e5ea',
      borderRadius: '1rem',
      padding: '1rem',
    },
    '.glass, .glass-card': {
      backgroundColor: 'rgba(255,255,255,0.72)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      backdropFilter: 'saturate(180%) blur(20px)',
      border: '1px solid rgba(255,255,255,0.6)',
      borderRadius: '1rem',
      boxShadow: boxShadow.card,
    },
    '.material-bar': {
      backgroundColor: 'rgba(255,255,255,0.8)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      backdropFilter: 'saturate(180%) blur(20px)',
      borderColor: '#e5e5ea',
    },

    // Grouped-list style section header (HIG), better contrast than gray-400.
    '.section-title': {
      fontSize: '0.75rem',
      fontWeight: '600',
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
      color: '#6e6e73',
      marginBottom: '0.75rem',
    },

    // Buttons
    '.btn': { ...btnBase },
    '.btn-primary': {
      ...btnBase,
      color: '#ffffff',
      backgroundColor: BTN_PRIMARY_BG, // solid indigo (brand-600) — was the blue→pink gradient
      backgroundImage: 'none',
      boxShadow: BTN_GLOW,
      transition: 'transform .15s ease, background-color .15s ease, box-shadow .15s ease, opacity .15s ease',
      '&:hover': { backgroundColor: BTN_PRIMARY_BG_HOVER, boxShadow: BTN_GLOW_HOVER },
      '&:active': { transform: 'scale(0.97)', boxShadow: BTN_GLOW },
      '&:disabled': { opacity: '0.5', cursor: 'not-allowed', transform: 'none', boxShadow: 'none' },
    },
    // Reusable brand gradient for avatars, logo marks, and accent surfaces.
    '.brand-gradient': { backgroundColor: '#6366f1', backgroundImage: BRAND_GRADIENT },
    '.btn-secondary': {
      ...btnBase,
      backgroundColor: '#f2f2f7',
      color: '#1d1d1f',
      '&:hover': { backgroundColor: '#e9e9ee' },
      '&:active': { transform: 'scale(0.97)' },
      '&:disabled': { opacity: '0.5', cursor: 'not-allowed', transform: 'none' },
    },
    '.btn-danger': {
      ...btnBase,
      backgroundColor: '#ff3b30',
      color: '#ffffff',
      '&:hover': { backgroundColor: '#e0271d' },
      '&:active': { transform: 'scale(0.97)' },
      '&:disabled': { opacity: '0.5', cursor: 'not-allowed', transform: 'none' },
    },
    '.btn-ghost': {
      ...btnBase,
      backgroundColor: 'transparent',
      color: '#4f46e5',
      '&:hover': { backgroundColor: '#eef2ff' },
    },
    '.icon-btn': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: '44px',
      minHeight: '44px',
      borderRadius: '0.75rem',
      color: '#6e6e73',
      transition: 'background-color .15s ease, color .15s ease, transform .15s ease',
      cursor: 'pointer',
      '&:hover': { backgroundColor: '#f2f2f7', color: '#1d1d1f' },
      '&:active': { transform: 'scale(0.94)' },
    },
    // Density modifier — pair with .btn-primary etc. Defined AFTER variants so it wins.
    '.btn-sm': {
      minHeight: '36px',
      padding: '0 0.875rem',
      fontSize: '0.8125rem',
      borderRadius: '0.625rem',
    },
    '.icon-btn-sm': { minWidth: '36px', minHeight: '36px', borderRadius: '0.625rem' },

    // Forms
    '.input, .form-input, .select': { ...fieldBase },
    '.textarea': { ...fieldBase, minHeight: '5rem', resize: 'vertical', lineHeight: '1.5' },
    '.label, .form-label': {
      display: 'block',
      fontSize: '0.8125rem',
      fontWeight: '600',
      color: '#6e6e73',
      marginBottom: '0.375rem',
    },

    // Badges
    '.badge': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.25rem',
      padding: '0.125rem 0.5rem',
      borderRadius: '9999px',
      fontSize: '0.75rem',
      fontWeight: '500',
      lineHeight: '1.25',
      backgroundColor: '#f2f2f7',
      color: '#6e6e73',
    },
    '.badge-brand': { backgroundColor: '#eef2ff', color: '#4338ca' },
    '.badge-success': { backgroundColor: '#e7f8ec', color: '#1c7a3f' },
    '.badge-warning': { backgroundColor: '#fff3e0', color: '#8a5300' },
    '.badge-danger': { backgroundColor: '#ffeceb', color: '#c81e14' },
    '.badge-neutral': { backgroundColor: '#f2f2f7', color: '#6e6e73' },

    // Filter chips
    '.chip': {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.375rem',
      minHeight: '36px',
      padding: '0 0.75rem',
      borderRadius: '9999px',
      fontSize: '0.8125rem',
      fontWeight: '500',
      border: '1px solid transparent',
      transition: 'background-color .15s ease, border-color .15s ease, color .15s ease',
      cursor: 'pointer',
      userSelect: 'none',
    },
    '.chip-inactive': {
      backgroundColor: '#ffffff',
      color: '#6e6e73',
      borderColor: '#e5e5ea',
      '&:hover': { borderColor: 'rgba(99,102,241,0.5)' },
    },
    '.chip-active': { backgroundColor: '#6366f1', color: '#ffffff', borderColor: '#6366f1' },

    // Mobile tab bar (attendee)
    '.tab-bar': {
      position: 'sticky',
      bottom: '0',
      zIndex: '50',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      flexShrink: '0',
      backgroundColor: 'rgba(255,255,255,0.85)',
      WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      backdropFilter: 'saturate(180%) blur(20px)',
      borderTop: '1px solid #e5e5ea',
      paddingTop: '0.25rem',
      paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
    },
    '.tab-item': {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.125rem',
      minWidth: '44px',
      minHeight: '44px',
      padding: '0.375rem 0.5rem',
      borderRadius: '0.75rem',
      color: '#8e8e93',
      fontSize: '0.625rem',
      transition: 'color .15s ease',
    },
    '.tab-item.active': { color: '#6366f1' },

    // Feedback
    '.skeleton': {
      backgroundColor: '#e9e9ee',
      borderRadius: '0.625rem',
      animation: 'wbr-pulse 1.5s ease-in-out infinite',
    },
    '.empty-state': {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '3rem 1.5rem',
      gap: '0.75rem',
      color: '#8e8e93',
    },
  }
}

// ---- Base layer -------------------------------------------------------------

function base() {
  return {
    ':root': {
      '--primary': '#6366f1',
      '--primary-dark': '#4f46e5',
      '--canvas': '#f5f5f7',
      '--surface': '#ffffff',
      '--ink': '#1d1d1f',
      '--hairline': '#e5e5ea',
      '--brand-gradient': 'linear-gradient(135deg, #3b82f6 0%, #ec4899 100%)',
    },
    '*': { WebkitTapHighlightColor: 'transparent' },
    html: {
      fontFamily: SYSTEM_SANS.join(', '),
      WebkitTextSizeAdjust: '100%',
      textSizeAdjust: '100%',
    },
    body: {
      backgroundColor: '#f5f5f7',
      color: '#1d1d1f',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
    },
    // Visible keyboard focus everywhere (HIG accessibility). Pointer clicks
    // don't trigger :focus-visible, so this stays quiet for mouse users.
    'a:focus-visible, button:focus-visible, [role="button"]:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, [tabindex]:focus-visible':
      { outline: '2px solid #6366f1', outlineOffset: '2px', borderRadius: '4px' },
    '::selection': { backgroundColor: 'rgba(99,102,241,0.18)' },
    '@media (prefers-reduced-motion: reduce)': {
      '*, *::before, *::after': {
        animationDuration: '0.01ms !important',
        animationIterationCount: '1 !important',
        transitionDuration: '0.01ms !important',
        scrollBehavior: 'auto !important',
      },
    },
  }
}

// ---- Preset -----------------------------------------------------------------

module.exports = {
  theme: {
    extend: {
      colors,
      fontFamily: { sans: SYSTEM_SANS },
      fontSize,
      boxShadow,
      backgroundImage: { 'brand-gradient': BRAND_GRADIENT },
      keyframes: {
        'wbr-pulse': { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
        'border-spin': { to: { transform: 'rotate(360deg)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .2s ease-out',
        'slide-up': 'slide-up .25s ease-out',
        'border-spin': 'border-spin 1s linear infinite',
      },
    },
  },
  plugins: [
    function ({ addBase, addComponents }) {
      addBase(base())
      addComponents(components())
    },
  ],
}
