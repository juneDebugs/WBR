// `runGrep` + `runPlaywright` — the two contract-tier check shapes.
//
// `runGrep({ cmd, expect, label })`:
//   - exec the shell command, parse stdout as an integer,
//   - compare against `expect`, which is one of:
//       - a number → exact match
//       - `">=N"` → at least N
//       - `">N"`  → strictly greater than N
//       - `"==N"` → exact match (explicit form)
//   - returns `{ type: 'grep', label, expected, actual, pass, detail }`.
//   - handles the BSD/GNU grep convention that `grep -c` exits 1 when count is 0.
//
// `runPlaywright({ script, env })`:
//   - spawns `node <script>` with the provided env merged into process.env,
//   - streams stdout/stderr live so the runner sees per-step progress,
//   - parses the trailing `Results: N passed, M failed` line for the contract
//     count (every WBR Playwright contract emits that line),
//   - returns `{ type: 'playwright', label, expected, actual, pass, passed,
//     failed, detail }`.

import { exec, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

function matchExpectation(actual, expect) {
  if (typeof expect === 'number') return actual === expect
  if (typeof expect === 'string') {
    if (expect.startsWith('>=')) return actual >= parseInt(expect.slice(2), 10)
    if (expect.startsWith('==')) return actual === parseInt(expect.slice(2), 10)
    if (expect.startsWith('>')) return actual > parseInt(expect.slice(1), 10)
    if (expect.startsWith('<')) return actual < parseInt(expect.slice(1), 10)
  }
  throw new Error(`unknown expect form: ${expect}`)
}

export async function runGrep({ cmd, expect, label }) {
  try {
    const { stdout } = await execAsync(cmd)
    const actual = parseInt(stdout.trim(), 10)
    const pass = matchExpectation(actual, expect)
    return {
      type: 'grep',
      label,
      expected: String(expect),
      actual: String(actual),
      pass,
      detail: pass ? null : `expected ${expect}, got ${actual}`,
    }
  } catch (err) {
    // `grep -c` exits 1 when the count is 0 (no matches). Treat that as
    // a 0-count result rather than a setup error.
    if (err.code === 1 && typeof err.stdout === 'string') {
      const actual = parseInt(err.stdout.trim(), 10) || 0
      const pass = matchExpectation(actual, expect)
      return {
        type: 'grep',
        label,
        expected: String(expect),
        actual: String(actual),
        pass,
        detail: pass ? null : `expected ${expect}, got ${actual}`,
      }
    }
    return {
      type: 'grep',
      label,
      expected: String(expect),
      actual: 'ERROR',
      pass: false,
      detail: err.message,
    }
  }
}

export function runPlaywright({ script, env = {}, label }) {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    const p = spawn('node', [script], { env: { ...process.env, ...env } })
    p.stdout.on('data', (d) => {
      process.stdout.write(d)
      stdout += d.toString()
    })
    p.stderr.on('data', (d) => {
      process.stderr.write(d)
      stderr += d.toString()
    })
    p.on('exit', (code) => {
      const match = stdout.match(/Results:\s*(\d+)\s*passed,\s*(\d+)\s*failed/)
      const passed = match ? parseInt(match[1], 10) : null
      const failed = match ? parseInt(match[2], 10) : null
      const pass = code === 0 && failed === 0
      resolve({
        type: 'playwright',
        label: label ?? script.split('/').pop(),
        expected: 'exit 0 with 0 failed',
        actual: match ? `${passed} passed, ${failed} failed (exit ${code})` : `exit ${code}, no Results line`,
        pass,
        passed,
        failed,
        detail: pass ? null : stderr.split('\n').slice(-8).join('\n').trim() || stdout.split('\n').slice(-8).join('\n').trim(),
      })
    })
    p.on('error', (err) => {
      resolve({
        type: 'playwright',
        label: label ?? script.split('/').pop(),
        expected: 'exit 0 with 0 failed',
        actual: 'spawn error',
        pass: false,
        detail: err.message,
      })
    })
  })
}
