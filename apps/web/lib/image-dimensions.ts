/**
 * Read a picture's pixel dimensions out of its header.
 *
 * Phase 10 stores an uploaded floor plan at up to 2400 pixels on its long edge.
 * The organizer's screen resizes before uploading, but a limit enforced only in
 * a browser is not a limit — a request that did not come from that screen would
 * walk straight past it. This is what lets the request handler check.
 *
 * Header-only, and deliberately so. This repository has no image library and
 * adding one is not in Phase 10's scope. Dimensions live in a fixed place near
 * the start of both formats the upload accepts, so reading them needs no decode.
 * Nothing here validates that the rest of the file is a well-formed picture, and
 * nothing here should be read as doing so.
 *
 * Returns null when the buffer is not a PNG or JPEG this can read. A caller must
 * treat null as "refuse", never as "allow" — the reason F-6 was recorded in this
 * project is a guard that failed open.
 */
export type ImageSize = { width: number; height: number; format: 'png' | 'jpeg' }

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Markers that introduce a frame and therefore carry the picture's size.
 * C4, C8 and CC sit in the same numeric range and are NOT frame headers — C4 is
 * a Huffman table, CC an arithmetic-coding table — so they are excluded by name
 * rather than by a range test that would read the wrong bytes.
 */
const JPEG_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
])

function readPng(buf: Buffer): ImageSize | null {
  // Signature, then a chunk length, then "IHDR", then width and height.
  if (buf.length < 24) return null
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  if (width === 0 || height === 0) return null
  return { width, height, format: 'png' }
}

function readJpeg(buf: Buffer): ImageSize | null {
  if (buf.length < 4) return null
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null

  let offset = 2
  // Walk the segment chain. Every step is bounds-checked: a truncated or hostile
  // file must end this loop, never run past the end of the buffer.
  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = buf[offset + 1]

    // Padding and the standalone markers carry no length field.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }

    const length = buf.readUInt16BE(offset + 2)
    if (length < 2) return null

    if (JPEG_FRAME_MARKERS.has(marker)) {
      // length(2) precision(1) height(2) width(2)
      if (offset + 9 >= buf.length) return null
      const height = buf.readUInt16BE(offset + 5)
      const width = buf.readUInt16BE(offset + 7)
      if (width === 0 || height === 0) return null
      return { width, height, format: 'jpeg' }
    }

    offset += 2 + length
  }

  return null
}

export function readImageSize(buf: Buffer): ImageSize | null {
  return readPng(buf) ?? readJpeg(buf)
}
