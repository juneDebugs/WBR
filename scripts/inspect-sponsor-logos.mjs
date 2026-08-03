#!/usr/bin/env node
// Why a sponsor logo looks blank on the booth card.
//
//   node scripts/inspect-sponsor-logos.mjs [dir]
//
// Default dir: apps/attendee/public/sponsors
//
// The card draws each logo as a 48-by-48 image on a WHITE panel. A logo drawn in
// white or near-white therefore renders as an empty rounded square — the file is
// present, valid, and served with a 200, and a person still sees nothing. Every
// check that asks whether the image loaded passes.
//
// This decodes each PNG and reports two numbers:
//
//   visible%    the share of pixels that are not transparent
//   lightness   the average lightness of those visible pixels, 0 black to 255 white
//
// A logo with high lightness is invisible on white. A logo with very low visible%
// has almost nothing drawn in it at all.
//
// Written rather than eyeballed because the browser cannot open a local file here,
// and because a number can be put in a document and re-checked later.

import { readFileSync, readdirSync } from 'fs'
import { inflateSync } from 'zlib'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = process.argv[2] ?? join(ROOT, 'apps/attendee/public/sponsors')

/** Read a PNG into { width, height, rgba: Uint8Array } or throw. */
function decodePng(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('not a PNG')

  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0
  let palette = null, transparency = null
  const idat = []

  let off = 8
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.subarray(off + 4, off + 8).toString('ascii')
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'PLTE') {
      palette = data
    } else if (type === 'tRNS') {
      transparency = data
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }

  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} not handled`)
  if (interlace !== 0) throw new Error('interlaced not handled')

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`colour type ${colorType} not handled`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = new Uint8Array(width * height * 4)
  const prev = new Uint8Array(stride)
  const line = new Uint8Array(stride)

  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    for (let i = 0; i < stride; i++) line[i] = raw[p + i]
    p += stride

    // Undo the per-scanline filter. bpp is bytes per pixel for the filter's
    // "left neighbour" arithmetic.
    const bpp = channels
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      switch (filter) {
        case 0: break
        case 1: line[i] = (line[i] + a) & 0xff; break
        case 2: line[i] = (line[i] + b) & 0xff; break
        case 3: line[i] = (line[i] + ((a + b) >> 1)) & 0xff; break
        case 4: {
          const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
          line[i] = (line[i] + pred) & 0xff
          break
        }
        default: throw new Error(`filter ${filter} not handled`)
      }
    }

    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      if (colorType === 3) {
        const idx = line[x]
        out[o] = palette[idx * 3]
        out[o + 1] = palette[idx * 3 + 1]
        out[o + 2] = palette[idx * 3 + 2]
        out[o + 3] = transparency && idx < transparency.length ? transparency[idx] : 255
      } else if (colorType === 0) {
        out[o] = out[o + 1] = out[o + 2] = line[x]
        out[o + 3] = 255
      } else if (colorType === 4) {
        out[o] = out[o + 1] = out[o + 2] = line[x * 2]
        out[o + 3] = line[x * 2 + 1]
      } else if (colorType === 2) {
        out[o] = line[x * 3]; out[o + 1] = line[x * 3 + 1]; out[o + 2] = line[x * 3 + 2]; out[o + 3] = 255
      } else {
        out[o] = line[x * 4]; out[o + 1] = line[x * 4 + 1]; out[o + 2] = line[x * 4 + 2]; out[o + 3] = line[x * 4 + 3]
      }
    }
    prev.set(line)
  }
  return { width, height, rgba: out }
}

const files = readdirSync(DIR).filter(f => f.endsWith('.png')).sort()

console.log('\n════════════════════════════════════════════════════════════')
console.log('  Sponsor logos: how much shows, and how light it is')
console.log('════════════════════════════════════════════════════════════')
console.log('\n  The booth card draws these on WHITE. High lightness = invisible there.\n')
console.log('  logo                visible%   lightness   verdict')

const rows = []
for (const f of files) {
  let r
  try {
    r = decodePng(readFileSync(join(DIR, f)))
  } catch (err) {
    console.log(`  ${f.replace('.png', '').padEnd(20)} could not decode: ${err.message}`)
    continue
  }
  let visible = 0, sum = 0
  for (let i = 0; i < r.rgba.length; i += 4) {
    const a = r.rgba[i + 3]
    if (a < 128) continue
    visible++
    // Rec. 601 luma, the usual weighting for perceived lightness.
    sum += 0.299 * r.rgba[i] + 0.587 * r.rgba[i + 1] + 0.114 * r.rgba[i + 2]
  }
  const total = r.width * r.height
  const pct = (visible / total) * 100
  const light = visible === 0 ? 255 : sum / visible
  const verdict = visible === 0 ? 'FULLY TRANSPARENT'
    : light >= 235 ? 'WHITE — invisible on the card'
    : light >= 200 ? 'very light — barely visible'
    : 'has dark pixels — should be visible'
  rows.push({ name: f.replace('.png', ''), pct, light, verdict })
}

rows.sort((a, b) => b.light - a.light)
for (const r of rows) {
  console.log(`  ${r.name.padEnd(20)}${r.pct.toFixed(1).padStart(6)}%   ${r.light.toFixed(0).padStart(7)}     ${r.verdict}`)
}
console.log('')
