#!/usr/bin/env node
// Runs the per-app access-matrix e2e (scripts/e2e-app-access.mjs) for all four
// apps in sequence, each on its own high port (to dodge the 3000/3100 ports
// taken by unrelated local apps), booting and tearing down each `next dev`.
//
//   node scripts/e2e-app-access-all.mjs
//
// Exit code is non-zero if any app fails its matrix.

import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPS = [
  { app: 'web', port: 3200 },
  { app: 'attendee', port: 3201 },
  { app: 'meetings', port: 3202 },
  { app: 'sponsor', port: 3203 },
]

function runOne({ app, port }) {
  return new Promise((resolve) => {
    const p = spawn('node', ['scripts/e2e-app-access.mjs', '--app', app, '--port', String(port), '--start'], {
      cwd: ROOT,
      stdio: 'inherit',
    })
    p.on('exit', (code) => resolve(code ?? 1))
  })
}

let failed = 0
for (const a of APPS) {
  const code = await runOne(a)
  if (code !== 0) failed++
}
console.log(`\n${'═'.repeat(48)}\n${failed === 0 ? '✅ ALL APPS PASS the access matrix' : `❌ ${failed} app(s) FAILED`}`)
process.exit(failed === 0 ? 0 : 1)
