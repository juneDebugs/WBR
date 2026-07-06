#!/usr/bin/env node
/**
 * Primary-CTA button-style test (pure Node, no server, no DB).
 *
 * Guards the 2026-07 button restyle: the retired blue→pink GRADIENT CTA is
 * replaced — everywhere, in all four apps at once — by the shared `.btn-primary`
 * "glow" treatment (solid indigo brand-600 fill + lavender edge + soft violet
 * halo) defined ONCE in packages/ui/preset.cjs.
 *
 * Invariants locked in here:
 *   1. .btn-primary no longer paints a gradient; it uses the solid glow recipe.
 *   2. The glow keeps every HIG affordance (44px target, tap-scale, focusable,
 *      disabled state) and its color/shadow values.
 *   3. No app source re-hardcodes the old blue→pink CTA gradient, and no
 *      *interactive* element paints the brand gradient (buttons must go through
 *      .btn-primary). The gradient survives ONLY on decorative identity marks
 *      (.brand-gradient / bg-brand-gradient: avatars, logo squares).
 *
 * Run: node scripts/test-button-style.mjs      (alias: pnpm test:buttons)
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPS = ['web', 'attendee', 'meetings', 'sponsor']

let checks = 0
const failures = []
function ok(cond, msg) {
  checks++
  if (!cond) failures.push(msg)
}

// ── Load the preset the same way Tailwind does ────────────────────────────────
const preset = require(join(ROOT, 'packages/ui/preset.cjs'))
let compObj = {}
let baseObj = {}
const api = {
  addBase: (o) => Object.assign(baseObj, o),
  addComponents: (o) => Object.assign(compObj, o),
  addUtilities: () => {},
  theme: () => ({}),
}
for (const p of preset.plugins || []) {
  if (typeof p === 'function') p(api)
  else if (p && typeof p.handler === 'function') p.handler(api)
}

// ── 1. .btn-primary is the new SOLID glow, not a gradient ─────────────────────
const btn = compObj['.btn-primary']
ok(!!btn, '.btn-primary is defined in the preset')
ok(btn && btn.backgroundColor === '#4f46e5', '.btn-primary fill is solid brand-600 #4f46e5')
ok(btn && (btn.backgroundImage === 'none' || btn.backgroundImage == null),
  '.btn-primary paints NO background-image (gradient removed)')
ok(btn && !/linear-gradient/i.test(JSON.stringify(btn)),
  '.btn-primary contains no linear-gradient anywhere (incl. hover/active)')

// ── 2. The glow keeps its color recipe + all HIG affordances ──────────────────
const shadow = (btn && btn.boxShadow) || ''
ok(/rgba\(168,\s*85,\s*247/.test(shadow), '.btn-primary glow has the violet halo (rgba 168,85,247)')
ok(/rgba\(165,\s*180,\s*252/.test(shadow), '.btn-primary glow has the lavender edge ring (brand-300)')
ok(/rgba\(79,\s*70,\s*229/.test(shadow), '.btn-primary glow has the brand-600 base lift')
const hover = (btn && btn['&:hover']) || {}
ok(hover.backgroundColor === '#4338ca', '.btn-primary hover darkens to brand-700 #4338ca')
ok(typeof hover.boxShadow === 'string' && hover.boxShadow !== shadow,
  '.btn-primary hover intensifies the glow')
ok(btn && btn.minHeight === '44px', '.btn-primary keeps the 44px HIG touch target')
ok(btn && btn['&:active'] && /scale\(0\.97\)/.test(btn['&:active'].transform),
  '.btn-primary keeps the tap-scale feedback')
ok(btn && btn['&:disabled'] && btn['&:disabled'].opacity === '0.5',
  '.btn-primary keeps a disabled state')
// Focus ring still delivered by the base layer (accessibility).
ok(/focus-visible/.test(JSON.stringify(baseObj)), 'base layer still ships a :focus-visible ring')

// ── 3. Decorative identity gradient (.brand-gradient) is PRESERVED ─────────────
const brandGrad = compObj['.brand-gradient']
ok(brandGrad && /linear-gradient/.test(brandGrad.backgroundImage || ''),
  '.brand-gradient identity mark still uses the blue→pink gradient (avatars/logos)')
ok(preset.theme.extend.backgroundImage &&
  /linear-gradient/.test(preset.theme.extend.backgroundImage['brand-gradient'] || ''),
  'bg-brand-gradient utility still resolves to the gradient (for decorative marks)')

// ── 4. No app source re-hardcodes the old CTA gradient or paints it on a button ──
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(full)
  }
  return acc
}
// The exact retired CTA gradient string must live ONLY in the preset now.
const OLD_CTA_GRADIENT = 'linear-gradient(135deg, #3b82f6 0%, #ec4899 100%)'
let hardcodedCta = 0
const ctaSamples = []
// An interactive <button …> must NOT paint any gradient of its OWN — buttons go
// through .btn-primary (solid glow). We inspect only each button's OPENING TAG so
// decorative gradient CHILDREN (e.g. an avatar inside a card-button) don't count.
// Arrow operators (`=>`) contain a '>' that would truncate the tag scan, so we
// neutralize them first. The categorical `chip` selector (solution-category
// colors — a deliberate data-color system, exempted in test:design) is allowed.
let brandGradButtons = 0
let inlineGradButtons = 0
const bgButtonSamples = []
const inlineButtonSamples = []
for (const app of APPS) {
  for (const f of walk(join(ROOT, 'apps', app))) {
    const src = readFileSync(f, 'utf8')
    const rel = f.replace(ROOT + '/', '')
    if (src.includes(OLD_CTA_GRADIENT)) {
      hardcodedCta++
      ctaSamples.push(rel)
    }
    const openTags = src.replace(/=>/g, '==').match(/<button\b[^>]*>/g) || []
    for (const tag of openTags) {
      const isChip = /\bchip\b/.test(tag)
      if (/\bbg-brand-gradient\b/.test(tag)) {
        brandGradButtons++
        bgButtonSamples.push(rel)
      }
      if (/linear-gradient/.test(tag) && !isChip) {
        inlineGradButtons++
        inlineButtonSamples.push(rel)
      }
    }
  }
}
ok(hardcodedCta === 0,
  `no app source hardcodes the retired CTA gradient (found ${hardcodedCta}${ctaSamples.length ? ': ' + ctaSamples.join(', ') : ''})`)
ok(brandGradButtons === 0,
  `no <button> paints the brand gradient directly (found ${brandGradButtons}${bgButtonSamples.length ? ': ' + bgButtonSamples.join(', ') : ''})`)
ok(inlineGradButtons === 0,
  `no <button> paints an inline linear-gradient fill (found ${inlineGradButtons}${inlineButtonSamples.length ? ': ' + inlineButtonSamples.join(', ') : ''})`)

// ── 5. Every app still resolves .btn-primary from the shared preset ───────────
for (const app of APPS) {
  const cfg = readFileSync(join(ROOT, `apps/${app}/tailwind.config.ts`), 'utf8')
  ok(/packages\/ui\/preset\.cjs/.test(cfg), `${app}: still consumes the shared preset (gets the new .btn-primary)`)
  const g = readFileSync(join(ROOT, `apps/${app}/app/globals.css`), 'utf8')
  ok(!/\.btn-primary\s*\{/.test(g), `${app}: globals does not override .btn-primary`)
}

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\nButton-style (glow CTA) — ${checks} checks`)
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`\n✓ all ${checks} checks passed — the blue→pink gradient CTA is retired; one glow button across 4 apps.`)
