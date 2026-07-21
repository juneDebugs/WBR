#!/usr/bin/env node
/**
 * Toggle-style test (pure Node, no server, no DB).
 *
 * Guards the 2026-07 toggle restyle: every switch in the admin app is rendered by
 * ONE shared control — apps/web/components/Toggle.tsx — that reproduces the
 * reference "squishy" toggle (rounded-square thumb that squash-stretches across a
 * rounded-rectangle track, with the thumb icon morphing ✓ → – → ✕), styled on the
 * WBR indigo `brand` scale.
 *
 * Invariants locked in here:
 *   1. Toggle.tsx exists and carries the reference design + animation:
 *      rounded-SQUARE thumb (not a pill), the squash-stretch (both left & right
 *      insets transition, driven by a transient "stretching" state), and the
 *      ✓/–/✕ icon morph — on the brand-600 (on) / brand-300 (off) palette.
 *   2. Toggle.tsx keeps every HIG affordance carried by the switches it replaces:
 *      role="switch", aria-checked, a ≥44px touch target, a focus-visible ring, a
 *      disabled state, and the locked variant (aria-disabled + title + padlock).
 *   3. The bespoke, drifted per-file switches are gone: ChatSettingsPanel and
 *      RolesPermissionsPanel delegate to <Toggle> and no longer hand-roll a
 *      track/thumb (no translate-x thumb, no bg-success/bg-primary track spans).
 *   4. There is exactly ONE switch implementation in the app: Toggle.tsx is the
 *      only source that renders role="switch". No app re-introduces a bespoke one.
 *   5. Motion degrades under prefers-reduced-motion (CSS transitions, which the
 *      shared preset neutralizes) and the brand scale the toggle paints with is
 *      actually defined in the shared preset.
 *
 * Run: node scripts/test-toggle-style.mjs      (alias: pnpm test:toggle)
 * Exits 0 on all-pass, 1 on failure.
 */
import { createRequire } from 'node:module'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
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

const TOGGLE_PATH = join(ROOT, 'apps/web/components/Toggle.tsx')

// ── 1. Toggle.tsx exists and carries the reference design + animation ─────────
ok(existsSync(TOGGLE_PATH), 'apps/web/components/Toggle.tsx exists')
const toggle = existsSync(TOGGLE_PATH) ? readFileSync(TOGGLE_PATH, 'utf8') : ''

ok(/export\s+(function|const)\s+Toggle\b/.test(toggle), 'Toggle is exported')

// Squash-stretch: the thumb is absolutely positioned and BOTH horizontal insets
// animate, driven by a transient "stretching" state that tucks both in mid-toggle.
ok(/stretching/.test(toggle), 'Toggle drives a transient "stretching" state (squash-stretch)')
ok(/setStretching\(true\)/.test(toggle) && /setStretching\(false\)/.test(toggle),
  'stretching is toggled on for the travel and released to settle')
ok(/transition:\s*`?left\b[^`'"]*right\b/.test(toggle) || (/transition[\s\S]{0,80}left/.test(toggle) && /right/.test(toggle)),
  'thumb animates BOTH left and right insets (the elongate/contract effect)')
ok(/setTimeout\(\s*\(\)\s*=>\s*setStretching\(false\)/.test(toggle),
  'stretch is released after a short hold so elongate → contract flows')

// Rounded-SQUARE thumb, not a circle/pill. The thumb span paints white with a
// small (non-9999) corner radius.
ok(/borderRadius:\s*dim\.thumbRadius\b/.test(toggle) && /thumbRadius:\s*8\b/.test(toggle),
  'thumb uses a rounded-SQUARE corner (thumbRadius 8 at base), not a pill')
ok(!/rounded-full[^\n]*bg-white/.test(toggle) && !/bg-white[^\n]*rounded-full/.test(toggle),
  'thumb is NOT a rounded-full circle')

// Icon morph ✓ → – → ✕ (+ padlock for the locked variant).
ok(/CheckIcon/.test(toggle), 'Toggle renders a check glyph (on state)')
ok(/CrossIcon/.test(toggle), 'Toggle renders a cross glyph (off state)')
ok(/DashIcon/.test(toggle), 'Toggle renders a dash glyph (mid-travel)')
ok(/LockIcon/.test(toggle), 'Toggle renders a padlock glyph (locked state)')
ok(/transition-opacity/.test(toggle), 'the glyphs cross-fade (transition-opacity)')

// Brand palette (matches the reference blue while staying on-brand indigo).
ok(/bg-brand-600/.test(toggle), 'ON track is brand-600')
ok(/bg-brand-300/.test(toggle), 'OFF track is pale brand-300')

// Size variant: 'lg' is a clean 1.5× of 'md' (the prominent master switch).
ok(/size\?:\s*ToggleSize/.test(toggle) || /size:\s*ToggleSize/.test(toggle), 'Toggle accepts a size prop')
const mdW = (toggle.match(/md:\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+)/) || [])
const lgW = (toggle.match(/lg:\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+)/) || [])
ok(mdW[1] === '52' && mdW[2] === '32', "md geometry is 52×32 (the base toggle)")
ok(lgW[1] === '78' && lgW[2] === '48', "lg geometry is 78×48 — exactly 1.5× the base")
ok(mdW[1] && lgW[1] && Number(lgW[1]) === Number(mdW[1]) * 1.5 && Number(lgW[2]) === Number(mdW[2]) * 1.5,
  'lg is a precise 1.5× scale of md')

// The control must never be squeezed by a flex parent (the master-switch bug):
// the track has a fixed px size, so the button + track are shrink-0.
ok((toggle.match(/shrink-0/g) || []).length >= 2, 'the button and track are shrink-0 (no flex squeeze)')
ok(/minWidth:\s*dim\.w/.test(toggle), 'track pins minWidth to its fixed width')

// ── 2. HIG affordances preserved on the shared control ────────────────────────
ok(/role="switch"/.test(toggle), 'Toggle is a role="switch"')
ok(/aria-checked=\{checked\}/.test(toggle), 'Toggle exposes aria-checked')
ok(/min-h-\[44px\]/.test(toggle) && /min-w-\[44px\]/.test(toggle), 'Toggle keeps the 44px HIG touch target')
ok(/focus-visible:ring-2/.test(toggle), 'Toggle keeps a focus-visible ring')
ok(/disabled=\{disabled\s*&&\s*!locked\}/.test(toggle), 'locked stays focusable; only true disabled uses the disabled attr')
ok(/aria-disabled=\{locked/.test(toggle), 'locked is exposed via aria-disabled')
ok(/title=\{title\}/.test(toggle), 'Toggle forwards a title (used to explain a locked control)')
ok(/aria-labelledby=\{labelledBy\}/.test(toggle) && /aria-describedby=\{describedBy\}/.test(toggle),
  'Toggle wires aria-labelledby / aria-describedby')
ok(/motion-reduce:transition-none/.test(toggle), 'Toggle honors reduced motion on its color/opacity transitions')

// ── 3. The drifted per-file switches are gone (delegate to <Toggle>) ──────────
const consumers = {
  'apps/web/components/ChatSettingsPanel.tsx': ['bg-success'],
  'apps/web/components/RolesPermissionsPanel.tsx': ['bg-primary'],
}
for (const [rel, retiredTrack] of Object.entries(consumers)) {
  const src = readFileSync(join(ROOT, rel), 'utf8')
  ok(/from '@\/components\/Toggle'/.test(src), `${rel} imports the shared Toggle`)
  ok(/<Toggle\b/.test(src), `${rel} renders <Toggle>`)
  if (rel.endsWith('ChatSettingsPanel.tsx')) {
    // The master "Vendor messaging" switch is the prominent 1.5× (lg) control.
    ok(/labelledBy="vendor-global-label"[^>]*size="lg"|size="lg"[^>]*labelledBy="vendor-global-label"/.test(src),
      `${rel}: master vendor switch renders at size="lg"`)
  }
  ok(!/role="switch"/.test(src), `${rel} no longer hand-rolls a role="switch"`)
  ok(!/translate-x-\[22px\]/.test(src), `${rel} no longer hand-rolls a translate-x thumb`)
  for (const cls of retiredTrack) {
    // The old bespoke track color must be gone from the switch markup. (These
    // tokens may still legitimately appear elsewhere, but not on a switch — and
    // since the switch is the only place they gated a toggle, and the toggle is
    // gone, they should not remain paired with a rounded-full track span.)
    ok(!new RegExp(`${cls}[^\\n]*rounded-full`).test(src) && !new RegExp(`rounded-full[^\\n]*${cls}`).test(src),
      `${rel} no longer paints a "${cls}" toggle track`)
  }
}

// ── 4. Exactly one switch implementation in the whole app ─────────────────────
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) walk(full, acc)
    else if (/\.(tsx?|jsx?)$/.test(name)) acc.push(full)
  }
  return acc
}
const switchFiles = []
for (const app of APPS) {
  for (const f of walk(join(ROOT, 'apps', app))) {
    if (/role="switch"/.test(readFileSync(f, 'utf8'))) switchFiles.push(f.replace(ROOT + '/', ''))
  }
}
ok(switchFiles.length === 1 && switchFiles[0] === 'apps/web/components/Toggle.tsx',
  `exactly one switch implementation — Toggle.tsx (found: ${switchFiles.join(', ') || 'none'})`)

// ── 5. Reduced motion + the brand scale the toggle paints with is real ────────
const preset = require(join(ROOT, 'packages/ui/preset.cjs'))
const brand = preset.theme?.extend?.colors?.brand || {}
ok(brand[600] && brand[300], 'preset defines brand-600 and brand-300 (the toggle palette)')
// The preset's reduced-motion rule is what neutralizes the toggle's CSS motion.
let baseObj = {}
for (const p of preset.plugins || []) {
  const api = { addBase: (o) => Object.assign(baseObj, o), addComponents: () => {}, addUtilities: () => {} }
  if (typeof p === 'function') p(api)
  else if (p && typeof p.handler === 'function') p.handler(api)
}
ok(/prefers-reduced-motion/.test(JSON.stringify(baseObj)),
  'shared preset still ships a prefers-reduced-motion rule (neutralizes the travel)')

// Every app still consumes the preset (so the brand palette resolves).
for (const app of APPS) {
  const cfg = readFileSync(join(ROOT, `apps/${app}/tailwind.config.ts`), 'utf8')
  ok(/packages\/ui\/preset\.cjs/.test(cfg), `${app}: still consumes the shared preset`)
}

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\nToggle-style (squash-stretch switch) — ${checks} checks`)
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`\n✓ all ${checks} checks passed — one shared squash-stretch Toggle across the admin app.`)
