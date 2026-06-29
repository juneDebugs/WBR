// Console summary + markdown run-log writer.
//
// `summarize(results)` prints a section showing per-check pass/fail to stdout
// and returns `{ passed, failed, total }` for the caller's exit-code decision.
//
// `writeRunLog(filepath, results, meta)` writes a markdown file matching the
// docs/smoketests/runs/ convention so the "independent" second-opinion run
// lands alongside the primary human-driven run log for direct comparison.

import { writeFile } from 'node:fs/promises'

export function summarize(results) {
  const total = results.length
  const passed = results.filter((r) => r.pass).length
  const failed = total - passed

  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  Summary: ${passed}/${total} passed`)
  console.log(`${'═'.repeat(60)}`)
  for (const r of results) {
    const mark = r.pass ? '✓' : '✗'
    console.log(`  ${mark} [${r.type.padEnd(10)}] ${r.label}`)
    if (!r.pass && r.detail) {
      const indented = r.detail.split('\n').map((l) => `      ${l}`).join('\n')
      console.log(indented)
    }
  }
  console.log('')
  return { passed, failed, total }
}

export async function writeRunLog(filepath, results, meta) {
  const passed = results.filter((r) => r.pass).length
  const failed = results.length - passed
  const total = results.length

  const lines = [
    `# ${meta.phase} smoketest run log — ${meta.date} (independent)`,
    '',
    `Runner: AI agent (automated second-opinion via \`docs/smoketests/run/${meta.entrypoint}\`).`,
    `Environment tier: ${meta.tier}.`,
    `Branch: \`${meta.branch}\`.`,
    '',
    `## Summary`,
    '',
    `${passed}/${total} checks passed${failed > 0 ? ` (${failed} failed)` : ''}.`,
    '',
    `## Per-check results`,
    '',
    `| # | Type | Label | Expected | Actual | Status |`,
    `|---|---|---|---|---|---|`,
    ...results.map((r, i) =>
      `| ${i + 1} | ${r.type} | ${escapeCell(r.label)} | ${escapeCell(r.expected)} | ${escapeCell(r.actual)} | ${r.pass ? '✓ PASS' : '✗ FAIL'} |`,
    ),
    '',
  ]

  // Lighthouse-specific detail block when any check carries audit values.
  const lhResults = results.filter((r) => r.type === 'lighthouse' && r.audits)
  if (lhResults.length > 0) {
    lines.push('## Lighthouse audit detail', '')
    for (const r of lhResults) {
      lines.push(`### ${r.label}`)
      lines.push('')
      lines.push(`- finalDisplayedUrl: \`${r.finalDisplayedUrl}\``)
      lines.push(`- requestedUrl: \`${r.requestedUrl}\``)
      lines.push('')
      lines.push('| Audit | numericValue |')
      lines.push('|---|---|')
      for (const [k, v] of Object.entries(r.audits)) {
        const display = v === undefined || v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(2)
        lines.push(`| ${k} | ${display} |`)
      }
      lines.push('')
    }
  }

  if (failed > 0) {
    lines.push('## Failure details', '')
    for (const r of results.filter((r) => !r.pass)) {
      lines.push(`### ${r.label}`)
      lines.push('')
      lines.push('```')
      lines.push(r.detail ?? '(no detail captured)')
      lines.push('```')
      lines.push('')
    }
  }

  await writeFile(filepath, lines.join('\n'))
  console.log(`  Run log: ${filepath}`)
}

function escapeCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}
