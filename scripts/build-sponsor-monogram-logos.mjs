#!/usr/bin/env node
// Builds placeholder logo tiles for exhibiting companies that have none.
//
//   node scripts/build-sponsor-monogram-logos.mjs [--write]
//
// Without --write it prints what it would do and creates nothing.
//
// ── Why these exist, and what they are not ───────────────────────────────────
//
// Nine companies' logo files were placeholder artwork from the repository's first
// commit — 128-pixel palette PNGs that share identical encoder bytes, so they were
// produced in a batch rather than being anyone's real mark. Tailor ERP's was
// replaced later with the real favicon, which is why that one looks right and the
// others do not. Found 2026-08-03 by decoding all twenty and comparing.
//
// These tiles are NOT the companies' logos and must never be described as such.
// They are a neutral stand-in that reads as deliberate rather than broken: one or
// two letters, set in type, on a coloured square.
//
// ── Why a monogram rather than the company's name in full ────────────────────
//
// The booth card draws the logo in a 48-by-48 box, and the company's name already
// sits immediately beside it. A name set across 48 pixels is unreadable, and
// repeating text the card already shows adds nothing. One or two large letters is
// legible at that size and is the honest shape for a stand-in.
//
// ── Why PNG rather than SVG ──────────────────────────────────────────────────
//
// The database points at `/sponsors/<name>.png`, and the card reads that value
// directly. Producing PNGs with the existing filenames means no row changes — the
// files are simply replaced. An SVG would have meant editing nine rows in the
// deployed database to change the extension, which is a bigger and more reversible-
// sounding-than-it-is change for no gain.
//
// Rendered from SVG through qlmanage, which is present on macOS by default. That
// gives real typography instead of letters drawn from rectangles.

import { writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, renameSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WRITE = process.argv.includes('--write')
// Scratch space for the intermediate SVG and the raw qlmanage output, outside the
// repository so a half-finished run leaves nothing behind to commit.
const WORK = join(tmpdir(), 'wbr-sponsor-logo-build')

// The nine that still carry first-commit placeholder artwork. `file` matches what
// Sponsor.logoUrl already points at, so nothing in the database changes.
//
// Colours are chosen only to be distinguishable from each other and to carry white
// text at a readable contrast. They are deliberately not any company's brand
// colour: a stand-in that imitates a brand is worse than one that plainly does not.
const TILES = [
  { file: 'shopify',      mark: 'S',  bg: '#3F6F52' },
  { file: 'bigcommerce',  mark: 'BC', bg: '#2C3E63' },
  // Changed from #4A5D4E on 2026-08-03: it sat within a few shades of Shopify's
  // green, and on a map where a delegate taps one booth then another the two tiles
  // read as the same one. A warm tone is unmistakable against every other tile here.
  { file: 'klaviyo',      mark: 'K',  bg: '#B4531F' },
  { file: 'loop-returns', mark: 'LR', bg: '#5B4CE0' },
  { file: 'shipstation',  mark: 'SS', bg: '#1F5673' },
  { file: 'yotpo',        mark: 'Y',  bg: '#3D4A8C' },
  { file: 'postscript',   mark: 'P',  bg: '#6B4A7A' },
  { file: 'google-cloud', mark: 'GC', bg: '#4A5568' },
  { file: 'aftership',    mark: 'AS', bg: '#2F6B6B' },
]

// Both apps serve their own copy of the public folder, so a file present in one and
// absent in the other renders in one app and not the other. That is the same fault
// as finding F-19, and it is why both are written here rather than one.
const TARGETS = [
  join(ROOT, 'apps/attendee/public/sponsors'),
  join(ROOT, 'apps/web/public/sponsors'),
]

/** A square tile with the mark centred. Two letters get a smaller size to fit. */
function svgFor({ mark, bg }) {
  const size = mark.length === 1 ? 138 : 96
  // letter-spacing pulls a two-letter mark together so it reads as one unit.
  const spacing = mark.length === 1 ? 0 : -2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="${bg}"/>
  <text x="128" y="132" text-anchor="middle" dominant-baseline="central"
        font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="600"
        font-size="${size}" letter-spacing="${spacing}" fill="#ffffff">${mark}</text>
</svg>`
}

console.log('\n════════════════════════════════════════════════════════════')
console.log(`  Placeholder logo tiles — ${WRITE ? 'WRITING' : 'dry run, nothing will be written'}`)
console.log('════════════════════════════════════════════════════════════\n')

for (const t of TARGETS) {
  if (!existsSync(t)) {
    console.error(`  target folder missing: ${t}`)
    process.exit(2)
  }
}

if (!WRITE) {
  for (const tile of TILES) {
    console.log(`  ${tile.file.padEnd(14)} mark "${tile.mark}"  ${tile.bg}`)
  }
  console.log(`\n  would replace ${TILES.length} file(s) in each of:`)
  for (const t of TARGETS) console.log(`    ${t.replace(ROOT + '/', '')}`)
  console.log('\n  re-run with --write to create them\n')
  process.exit(0)
}

rmSync(WORK, { recursive: true, force: true })
mkdirSync(WORK, { recursive: true })

let made = 0
for (const tile of TILES) {
  const svgPath = join(WORK, `${tile.file}.svg`)
  writeFileSync(svgPath, svgFor(tile))

  // qlmanage names its output "<input>.png" and refuses to overwrite, so the work
  // folder is cleared above rather than reused.
  execFileSync('qlmanage', ['-t', '-s', '256', '-o', WORK, svgPath], { stdio: 'ignore' })

  const produced = join(WORK, `${tile.file}.svg.png`)
  if (!existsSync(produced)) {
    console.error(`  ✗ ${tile.file}: qlmanage produced nothing`)
    continue
  }
  const png = join(WORK, `${tile.file}.png`)
  renameSync(produced, png)

  for (const target of TARGETS) copyFileSync(png, join(target, `${tile.file}.png`))
  console.log(`  ✓ ${tile.file.padEnd(14)} "${tile.mark}"  written to both apps`)
  made++
}

console.log(`\n  ${made} of ${TILES.length} tiles written.`)
console.log('  These are stand-ins, not the companies\' logos.\n')
