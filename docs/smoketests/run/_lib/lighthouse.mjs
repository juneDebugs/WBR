// `runLighthouse({ url, cookie, formFactor, expectedUrl, thresholds })`:
//   - spawn `npx --yes lighthouse@latest <url> ...` with cookie injection,
//   - parse the JSON report,
//   - verify finalDisplayedUrl matches expectedUrl (catches the silent-redirect-
//     to-/login class of methodology defect — see PRD §6 Phase 5 background),
//   - check each named audit against its `{ max?, min? }` threshold,
//   - return `{ pass, finalDisplayedUrl, requestedUrl, audits: {...}, failures }`.
//
// Audits exposed:
//   - `total-byte-weight`     — page document + asset byte count
//   - `observed-lcp`          — actual paint time during the run (Phase 1 amendment metric)
//   - `simulated-lcp`         — lantern-model projection (supplementary per Phase 1)
//   - `speed-index`           — visual progress score
//   - `total-blocking-time`   — main-thread blocking aggregate
//
// All values are numericValue (ms for timing, bytes for size). Thresholds use
// the same units.

import { spawn } from 'node:child_process'
import { readFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

function runLighthouseCli({ url, cookieHeader, formFactor, outputPath }) {
  return new Promise((resolve, reject) => {
    const args = [
      '--yes', 'lighthouse@latest', url,
      '--output=json', `--output-path=${outputPath}`,
      '--quiet',
      '--chrome-flags=--headless=new --no-sandbox',
      `--form-factor=${formFactor}`,
      '--only-categories=performance',
    ]
    if (cookieHeader) {
      args.push(`--extra-headers=${JSON.stringify({ Cookie: cookieHeader })}`)
    }
    const p = spawn('npx', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    p.stderr.on('data', (d) => { stderr += d.toString() })
    p.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`lighthouse exited ${code}: ${stderr.split('\n').slice(-5).join(' ').trim()}`))
    })
    p.on('error', reject)
  })
}

export async function runLighthouse({
  url,
  cookie = null,
  formFactor = 'mobile',
  expectedUrl = null,
  thresholds = {},
  outputPath = null,
}) {
  const out = outputPath ?? path.join(await mkdtemp(path.join(tmpdir(), 'wbr-lh-')), 'report.json')
  const cookieHeader = cookie ? `${cookie.name}=${cookie.value}` : null

  await runLighthouseCli({ url, cookieHeader, formFactor, outputPath: out })

  const lh = JSON.parse(await readFile(out, 'utf8'))
  const audits = {
    'total-byte-weight': lh.audits['total-byte-weight']?.numericValue,
    'observed-lcp': lh.audits.metrics?.details?.items?.[0]?.observedLargestContentfulPaint,
    'simulated-lcp': lh.audits['largest-contentful-paint']?.numericValue,
    'speed-index': lh.audits['speed-index']?.numericValue,
    'total-blocking-time': lh.audits['total-blocking-time']?.numericValue,
  }

  const failures = []
  let pass = true

  if (expectedUrl && lh.finalDisplayedUrl !== expectedUrl) {
    pass = false
    failures.push(`finalDisplayedUrl=${lh.finalDisplayedUrl} ≠ expected ${expectedUrl} (silent redirect — cookie may not have survived)`)
  }

  for (const [auditKey, bounds] of Object.entries(thresholds)) {
    const val = audits[auditKey]
    if (val === undefined || val === null) {
      pass = false
      failures.push(`audit '${auditKey}' missing from Lighthouse report`)
      continue
    }
    if (bounds.max !== undefined && val > bounds.max) {
      pass = false
      failures.push(`${auditKey}=${val} > max ${bounds.max}`)
    }
    if (bounds.min !== undefined && val < bounds.min) {
      pass = false
      failures.push(`${auditKey}=${val} < min ${bounds.min}`)
    }
  }

  return {
    pass,
    finalDisplayedUrl: lh.finalDisplayedUrl,
    requestedUrl: lh.requestedUrl,
    audits,
    failures,
    reportPath: out,
  }
}
