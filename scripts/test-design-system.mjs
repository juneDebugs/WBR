#!/usr/bin/env node
/**
 * Design-system consistency test (pure Node, no server, no DB).
 *
 * Guards the core invariant of the cross-app redesign: all four apps
 * (web, attendee, meetings, sponsor) render from ONE source of truth —
 * packages/ui/preset.cjs — and nobody forks it or reintroduces the retired
 * rogue color systems.
 *
 * Run: node scripts/test-design-system.mjs      (alias: pnpm test:design)
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
const notes = []
function ok(cond, msg) {
  checks++
  if (!cond) failures.push(msg)
}
function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

// ── 1. The shared preset exists, is valid, and pins the canonical tokens ──────
const preset = require(join(ROOT, 'packages/ui/preset.cjs'))
ok(preset && preset.theme && preset.theme.extend, 'preset exports theme.extend')
const colors = (preset.theme && preset.theme.extend && preset.theme.extend.colors) || {}
ok(colors.canvas === '#f5f5f7', 'token canvas = #f5f5f7')
ok(colors.brand && colors.brand.DEFAULT === '#6366f1', 'token brand.DEFAULT = #6366f1')
ok(colors.ink && colors.ink.DEFAULT === '#1d1d1f', 'token ink.DEFAULT = #1d1d1f')
ok(colors.hairline === '#e5e5ea', 'token hairline = #e5e5ea')
ok(colors.success && colors.warning && colors.danger, 'status tokens (success/warning/danger) present')
ok(colors.surface && colors.fill, 'surface + fill tokens present')

// Font: system stack, and the phantom "Inter" (declared-but-never-loaded) is gone.
const sans = (preset.theme.extend.fontFamily && preset.theme.extend.fontFamily.sans || []).join(' ')
ok(/apple-system/.test(sans), 'font stack is the system stack (-apple-system…)')
ok(!/Inter/i.test(sans), 'no phantom Inter in the shared font stack')

// ── 2. The preset plugin injects the shared base + component vocabulary ───────
let baseObj = {}
let compObj = {}
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
const compSelectors = Object.keys(compObj).flatMap((k) => k.split(',').map((s) => s.trim()))
const REQUIRED_CLASSES = [
  '.card', '.card-flat', '.glass-card', '.material-bar',
  '.btn', '.btn-primary', '.btn-secondary', '.btn-danger', '.btn-ghost', '.icon-btn', '.btn-sm',
  '.input', '.textarea', '.select', '.label', '.form-input', '.form-label',
  '.badge', '.badge-success', '.badge-warning', '.badge-danger', '.badge-brand', '.badge-neutral',
  '.chip', '.chip-active', '.chip-inactive',
  '.section-title', '.tab-bar', '.tab-item', '.page-container', '.skeleton', '.empty-state',
]
for (const cls of REQUIRED_CLASSES) {
  ok(compSelectors.includes(cls), `preset defines component class ${cls}`)
}
const baseStr = JSON.stringify(baseObj)
ok(/focus-visible/.test(baseStr), 'base layer defines a :focus-visible ring (a11y)')
ok(/prefers-reduced-motion/.test(baseStr), 'base layer honors prefers-reduced-motion')
ok(/f5f5f7/.test(baseStr), 'base layer sets the canvas background')

// ── 3. Every app wires the shared preset and does NOT fork its own theme ──────
for (const app of APPS) {
  const cfg = read(`apps/${app}/tailwind.config.ts`)
  ok(/packages\/ui\/preset\.cjs/.test(cfg), `${app}: tailwind.config requires the shared preset`)
  ok(/presets:\s*\[\s*preset\s*\]/.test(cfg), `${app}: tailwind.config uses presets:[preset]`)
  ok(!/fontFamily/.test(cfg), `${app}: tailwind.config does not redefine fontFamily (comes from preset)`)
  ok(!/'#6366f1'|"#6366f1"/.test(cfg), `${app}: tailwind.config does not hardcode the brand hex (comes from preset)`)
}

// ── 4. Every app's globals.css is trimmed: no re-definition of shared classes ──
for (const app of APPS) {
  const g = read(`apps/${app}/app/globals.css`)
  ok(/@tailwind base/.test(g), `${app}: globals keeps @tailwind base`)
  ok(!/['"]Inter['"]/.test(g), `${app}: globals has no phantom Inter font-family`)
  ok(!/#f0ece4|#f8f8fc/.test(g), `${app}: globals has no retired background hex`)
  for (const cls of ['.btn-primary', '.card', '.chip', '.badge', '.input', '.section-title', '.tab-item']) {
    const re = new RegExp('\\' + cls + '\\s*\\{')
    ok(!re.test(g), `${app}: globals must not re-define ${cls} (it comes from the preset)`)
  }
}

// ── 5. Root layouts use the unified canvas, not a per-app background ───────────
for (const app of APPS) {
  const l = read(`apps/${app}/app/layout.tsx`)
  ok(!/bg-gray-50/.test(l), `${app}: layout <body> is not bg-gray-50`)
  ok(!/#f0ece4/.test(l), `${app}: layout <body> has no beige inline background`)
}

// ── 6. No app source reintroduces a retired rogue-color system ────────────────
// Retired literals the migration removed app-wide. Dark login screens are exempt
// (a deliberately-dark auth surface), as are genuine third-party brand hexes.
const RETIRED = [
  '#007aff', // iOS system blue (parallel accent system)
  '#ff2d55', // iOS pink
  '#f0ece4', '#f5f2ec', '#ede9e0', '#e5e1d9', // attendee beige family
  '#f8f8fc', // old portal background
  '#8b5cf6', // ad-hoc violet gradient secondary
]
const BRAND_ALLOW = /#0a66c2|#4285f4|#34a853|#fbbc05|#ea4335|#1a1a2e/i // LinkedIn, Google, dark-login navy
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
let retiredHits = 0
const hitSamples = []
for (const app of APPS) {
  const files = walk(join(ROOT, 'apps', app))
  for (const f of files) {
    // Exempt (not brand/neutral UI chrome):
    //  - dark auth surfaces (login),
    //  - hand-drawn third-party brand-logo illustrations (CompanyLogos),
    //  - the solution-category taxonomy palette (a categorical data-color map,
    //    which legitimately needs many distinct hues).
    if (/login/i.test(f) || /CompanyLogos/.test(f) || /solutions\.ts$/.test(f)) continue
    const src = readFileSync(f, 'utf8').toLowerCase()
    for (const lit of RETIRED) {
      let idx = src.indexOf(lit)
      while (idx !== -1) {
        // skip if part of an allowed brand hex context on the same short window
        const window = src.slice(Math.max(0, idx - 2), idx + lit.length + 2)
        if (!BRAND_ALLOW.test(window)) {
          retiredHits++
          if (hitSamples.length < 25) hitSamples.push(`${f.replace(ROOT + '/', '')} :: ${lit}`)
        }
        idx = src.indexOf(lit, idx + lit.length)
      }
    }
  }
}
ok(retiredHits === 0, `no retired rogue-color literals in app source (found ${retiredHits})`)
if (retiredHits > 0) notes.push('Retired-color hits:\n  ' + hitSamples.join('\n  '))

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\nDesign-system consistency — ${checks} checks`)
if (notes.length) console.log('\n' + notes.join('\n'))
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`\n✓ all ${checks} checks passed — 4 apps share one design system.`)
