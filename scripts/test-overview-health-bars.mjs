#!/usr/bin/env node
/**
 * Verifies the Admin Overview readiness bars use the red→yellow→green health
 * scale (red = bad, yellow = ok, green = excellent). Pure Node — imports the
 * real color module (Node strips the TS types) and inspects the component source.
 *
 * Run: node scripts/test-overview-health-bars.mjs   (alias: pnpm test:overview-bars)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MOD = join(ROOT, 'apps/web/lib/health-color.ts')
const COMPONENT = join(ROOT, 'apps/web/components/SponsorReadinessClient.tsx')

let checks = 0
const failures = []
function ok(cond, msg) {
  checks++
  if (!cond) failures.push(msg)
}

const h = await import(pathToFileURL(MOD).href)

// ── 1. Text color thresholds: bad→red, ok→amber, excellent→green ──────────────
const RED = '#c81e14', AMBER = '#8a5300', GREEN = '#1c7a3f'
ok(h.healthTextColor(0) === RED, 'healthTextColor(0) is red (bad)')
ok(h.healthTextColor(20) === RED, 'healthTextColor(20) is red (bad)')
ok(h.healthTextColor(49) === RED, 'healthTextColor(49) is red (bad, just under ok)')
ok(h.healthTextColor(50) === AMBER, 'healthTextColor(50) is amber (ok boundary)')
ok(h.healthTextColor(65) === AMBER, 'healthTextColor(65) is amber (ok)')
ok(h.healthTextColor(79) === AMBER, 'healthTextColor(79) is amber (ok, just under excellent)')
ok(h.healthTextColor(80) === GREEN, 'healthTextColor(80) is green (excellent boundary)')
ok(h.healthTextColor(100) === GREEN, 'healthTextColor(100) is green (excellent)')

// ── 2. Solid fill: red / yellow / green by band ───────────────────────────────
ok(h.healthSolid(10) === '#ff3b30', 'healthSolid(10) is red')
ok(h.healthSolid(60) === '#ffcc00', 'healthSolid(60) is yellow')
ok(h.healthSolid(95) === '#34c759', 'healthSolid(95) is green')

// ── 3. Gradient is red → yellow → green in that order ─────────────────────────
const g = h.HEALTH_GRADIENT
const iRed = g.indexOf('#ff3b30'), iYellow = g.indexOf('#ffcc00'), iGreen = g.indexOf('#34c759')
ok(iRed >= 0 && iYellow >= 0 && iGreen >= 0, 'HEALTH_GRADIENT contains red, yellow, and green')
ok(iRed < iYellow && iYellow < iGreen, 'HEALTH_GRADIENT orders red → yellow → green')

// ── 4. Bar fill clips the full-track gradient to the score ────────────────────
const f50 = h.healthBarFill(50)
ok(f50.width === '50%', 'healthBarFill(50) width is 50%')
ok(f50.backgroundSize === '200% 100%', 'healthBarFill(50) scales gradient to full track (200%)')
ok(String(f50.backgroundImage).includes('#ff3b30') && String(f50.backgroundImage).includes('#34c759'), 'healthBarFill uses the health gradient')
ok(h.healthBarFill(25).backgroundSize === '400% 100%', 'healthBarFill(25) scales to 400%')
ok(h.healthBarFill(100).backgroundSize === '100% 100%', 'healthBarFill(100) scales to 100%')
ok(h.healthBarFill(0).backgroundSize === '100% 100%', 'healthBarFill(0) has no divide-by-zero')
ok(h.healthBarFill(120).width === '100%' && h.healthBarFill(-5).width === '0%', 'healthBarFill clamps out-of-range pct')

// ── 5. The Overview component actually uses the health scale (not old indigo) ──
const src = readFileSync(COMPONENT, 'utf8')
ok(/@\/lib\/health-color/.test(src), 'SponsorReadinessClient imports the health-color module')
ok(/healthBarFill\(/.test(src), 'readiness bars use healthBarFill')
ok(/healthTextColor\(/.test(src), 'score text uses healthTextColor')
ok(!/scoreColor|barGradient/.test(src), 'old indigo scoreColor/barGradient removed')
ok(!/#818cf8|#a5b4fc|#c7d2fe|#4f46e5/.test(src), 'old brand-indigo bar hexes removed')

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\nOverview health-bar test — ${checks} checks`)
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`\n✓ all ${checks} checks passed — Overview bars are red=bad / yellow=ok / green=excellent.`)
