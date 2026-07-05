#!/usr/bin/env node
/**
 * Enforces the shared HealthProgress design across all four apps.
 *
 * Because a runtime workspace package would need a lockfile change the frozen
 * Vercel install can't take, the component + its color module are REPLICATED into
 * each app. This test guarantees they stay byte-identical to the canonical source
 * in packages/ui/health-progress, and that every app actually renders it.
 *
 * Run: node scripts/test-health-progress.mjs   (alias: pnpm test:health-progress)
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPS = ['web', 'attendee', 'meetings', 'sponsor']
const CANON_HC = join(ROOT, 'packages/ui/health-progress/health-color.ts')
const CANON_HP = join(ROOT, 'packages/ui/health-progress/HealthProgress.tsx')

let checks = 0
const failures = []
const ok = (c, m) => { checks++; if (!c) failures.push(m) }
const read = (p) => readFileSync(p, 'utf8')

// ── 1. Canonical files exist and describe the reference design ────────────────
ok(existsSync(CANON_HC), 'canonical health-color.ts exists')
ok(existsSync(CANON_HP), 'canonical HealthProgress.tsx exists')
const hp = read(CANON_HP)
ok(/'use client'/.test(hp), 'HealthProgress is a client component')
ok(/TrendArrow/.test(hp), 'HealthProgress renders a trend arrow')
ok(/healthTextColor/.test(hp), 'HealthProgress colors the % with healthTextColor')
ok(/healthBarFill/.test(hp), 'HealthProgress defaults the bar to the health gradient')
ok(/tooltip/.test(hp) && /caption/.test(hp), 'HealthProgress supports caption + hover tooltip')
ok(/role="tooltip"/.test(hp), 'HealthProgress tooltip has role="tooltip"')
ok(/delta/.test(hp) && /deltaPeriod/.test(hp), 'HealthProgress accepts a week-over-week delta prop')
ok(/vs last week/.test(hp), 'HealthProgress delta is labelled "vs last week"')
ok(/dir === 'flat'|dir: 'up' \| 'down' \| 'flat'/.test(hp), 'trend arrow supports up/down/flat')

// ── 2. Every app has byte-identical copies (single source of truth) ───────────
const canonHC = read(CANON_HC)
const canonHP = read(CANON_HP)
for (const app of APPS) {
  const hcPath = join(ROOT, `apps/${app}/lib/health-color.ts`)
  const hpPath = join(ROOT, `apps/${app}/components/HealthProgress.tsx`)
  ok(existsSync(hcPath) && read(hcPath) === canonHC, `${app}: lib/health-color.ts matches canonical`)
  ok(existsSync(hpPath) && read(hpPath) === canonHP, `${app}: components/HealthProgress.tsx matches canonical`)
}

// ── 3. Apps with progress bars actually render HealthProgress ─────────────────
// attendee is exempt: it has no horizontal progress bar — its only completion
// visual is a circular SVG ring on a dark tile (HomeScreen ProfileTile), which
// is a different form on a dark surface and shouldn't be forced into this row.
import { readdirSync, statSync } from 'node:fs'
function walk(dir, acc = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue
    const full = join(dir, n)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx$/.test(n) && !/HealthProgress\.tsx$/.test(n)) acc.push(full)
  }
  return acc
}
const RENDER_REQUIRED = ['web', 'meetings', 'sponsor']
for (const app of RENDER_REQUIRED) {
  const used = walk(join(ROOT, 'apps', app)).some((f) => /<HealthProgress[\s/>]/.test(read(f)))
  ok(used, `${app}: renders <HealthProgress> in at least one view`)
}

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\nHealthProgress shared-design test — ${checks} checks`)
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`\n✓ all ${checks} checks passed — HealthProgress is shared + identical across 4 apps.`)
