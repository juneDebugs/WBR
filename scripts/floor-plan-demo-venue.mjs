// The demonstration venue: three maps, their drawn shapes, and their pins.
//
// ── Why one module rather than a drawing and a seed that agree by hand ───────
//
// ADR 0007 accepts, as the price of not depending on file formats, that "maps
// are only as good as the human who placed the pins" and that a mis-placed pin
// is a human error with no automatic check. That is true of a map an organizer
// authors by tapping. It does not have to be true of the seeded demonstration
// venue, where the picture and the pins are both produced by us.
//
// So both come from here. scripts/build-floor-plan-maps.mjs draws the shapes
// below into PNG files; scripts/seed-floor-plan.mjs writes pins at the same
// coordinates. A block and its marker cannot disagree, because there is only
// one number.
//
// Positions are percentages of the picture's width and height, 0 to 100 —
// never pixels — so a pin stays on its block at any screen size. The drawing
// converts them to its own coordinate space at the last moment.
//
// ── Where the names come from ────────────────────────────────────────────────
//
// No label here is invented. Meeting-table names are read from MEETING_ROOMS in
// packages/db/src/meeting-engine.ts, the same constant the meetings product
// uses to place a booking. Ballroom-level names are rooms that seeded agenda
// sessions actually run in. Booth identity is not named here at all: the seed
// reads the exhibiting companies that carry a booth number straight from the
// database and lays them out in booth-number order, because the seed file and
// the database have already drifted apart on booth numbers while ids have not.

export const PICTURE_WIDTH = 1600
export const PICTURE_HEIGHT = 1200

// ─── Map 1: the exhibit hall ──────────────────────────────────────────────────
//
// Laid out from whatever companies carry a booth number, rather than from a
// fixed list of ten. Grouped by the first character of the booth number, which
// is the sponsorship tier in this dataset — P before G before S before B — so
// the largest stands sit nearest the entrance, as they do at a real show.
// Anything with an unrecognised prefix still gets a stand, in a final row,
// instead of being silently dropped.

const TIER_ORDER = ['P', 'G', 'S', 'B']
const TIER_SIZE = {
  P: { w: 20, h: 13 },
  G: { w: 17, h: 11 },
  S: { w: 14, h: 9 },
  B: { w: 14, h: 9 },
  OTHER: { w: 14, h: 9 },
}
const MAX_STANDS_PER_ROW = 3
const HALL_TOP = 20
const HALL_BOTTOM = 88

function tierOf(boothNumber) {
  const first = String(boothNumber ?? '').trim().charAt(0).toUpperCase()
  return TIER_ORDER.includes(first) ? first : 'OTHER'
}

/**
 * Turn the exhibiting companies that carry a booth number into stands on the
 * hall picture. Input must already be ordered by booth number; the caller reads
 * it from the database so this module never hard-codes a company.
 *
 * Returns one entry per company: its tier, the centre of its stand as
 * percentages, and the stand's size, which the drawing uses and the seed
 * ignores.
 */
export function layoutBooths(sponsors) {
  const groups = []
  for (const tier of [...TIER_ORDER, 'OTHER']) {
    const items = sponsors.filter(s => tierOf(s.boothNumber) === tier)
    if (items.length > 0) groups.push({ tier, items })
  }

  // Break each tier into rows of at most three stands.
  const rows = []
  for (const group of groups) {
    for (let i = 0; i < group.items.length; i += MAX_STANDS_PER_ROW) {
      rows.push({ tier: group.tier, items: group.items.slice(i, i + MAX_STANDS_PER_ROW) })
    }
  }

  const out = []
  rows.forEach((row, rowIndex) => {
    const size = TIER_SIZE[row.tier]
    const y = HALL_TOP + ((HALL_BOTTOM - HALL_TOP) * (rowIndex + 0.5)) / rows.length
    const gap = size.w + 6
    row.items.forEach((sponsor, columnIndex) => {
      const offset = columnIndex - (row.items.length - 1) / 2
      out.push({
        sponsor,
        tier: row.tier,
        x: Math.round((50 + offset * gap) * 10) / 10,
        y: Math.round(y * 10) / 10,
        w: size.w,
        h: size.h,
      })
    })
  })
  return out
}

// ─── Map 2: the ballroom level ────────────────────────────────────────────────
//
// Every name below is a room that seeded agenda sessions run in. The check
// script asserts that against the database rather than trusting this comment,
// so a room disappearing from the agenda fails the phase instead of leaving a
// marker pointing at nothing.

export const BALLROOM_ROOMS = [
  { label: 'Grand Ballroom', x: 30, y: 30, w: 34, h: 22 },
  { label: 'Main Stage', x: 30, y: 58, w: 34, h: 20 },
  { label: 'Hall A', x: 70, y: 25, w: 24, h: 16 },
  { label: 'Hall B', x: 70, y: 45, w: 24, h: 16 },
  { label: 'Atrium', x: 50, y: 80, w: 26, h: 14 },
  { label: 'Dining Hall', x: 80, y: 72, w: 22, h: 18 },
]

// ─── Map 3: the meeting-room floor ────────────────────────────────────────────
//
// Generated from MEETING_ROOMS so the map cannot name a table the meetings
// product does not have, and cannot omit one it does. A delegate whose booking
// says Table 5 can find Table 5.

/**
 * Lay the real meeting tables out on a square-ish grid, largest capacity last
 * so the lounge does not sit in the middle of the tables.
 */
export function layoutMeetingRooms(meetingRooms) {
  const items = [...meetingRooms].sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name))
  const columns = Math.ceil(Math.sqrt(items.length))
  const rows = Math.ceil(items.length / columns)

  const LEFT = 20
  const RIGHT = 80
  const TOP = 22
  // A room label hangs BELOW its marker rather than sitting on it, so the
  // spacing here is bounded from two directions at once, and the picture's
  // height decides both.
  //
  // Below, a label must clear the drawn floor's edge and the title block. Above,
  // consecutive rows must be far enough apart that one row's labels do not land
  // on the next row's rooms.
  //
  // Both were measured rather than reasoned. On a 1600x1000 picture a label
  // extends roughly 18 percentage points below its marker, which is more than
  // half the gap between rows: at BOTTOM 82 the bottom labels ran off the
  // picture, at 76 they covered the title block, and at 66 — where they finally
  // cleared it — the tighter rows put SEVEN of nine labels onto the next row's
  // rooms. Trading one collision for more is not a fix.
  //
  // The constraint was the height, so the picture is 1600x1400 rather than
  // 1600x1000: taller than the other two rather than shorter, which keeps it a
  // different shape — the point of it — while a label now extends only about 13
  // points, and 27 points between rows leaves room at both ends.
  const BOTTOM = 76

  return items.map((room, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = columns === 1 ? 50 : LEFT + ((RIGHT - LEFT) * column) / (columns - 1)
    const y = rows === 1 ? 50 : TOP + ((BOTTOM - TOP) * row) / (rows - 1)
    // A four-person lounge is drawn larger than a one-person table.
    const large = room.capacity > 1
    return {
      label: room.name,
      capacity: room.capacity,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      w: large ? 18 : 12,
      h: large ? 13 : 9,
    }
  })
}

// ─── The three maps ───────────────────────────────────────────────────────────

// Each map carries its own pixel dimensions, and THEY ARE DELIBERATELY NOT ALL
// THE SAME SHAPE. Raised by adversarial review of the zoom work: the window the
// map moves inside takes its proportions from the picture, and a stale ratio
// would stretch the map and feed a wrong height to the pan limit. With three
// identically-shaped pictures that defect is invisible, and it becomes live the
// moment Phase 10 lets an organizer upload a plan of any shape.
//
// A venue sending plans of different shapes is the normal case, not a contrived
// one — ADR 0007 is built around whatever picture happens to arrive. Marker
// positions are percentages, so nothing about the layout depends on these.
export const MAPS = [
  {
    slug: 'exhibit-hall',
    name: 'Exhibit Hall',
    position: 1,
    subtitle: 'Level 1 · Halls 1–3',
    width: 1600,
    height: 1200,
  },
  {
    slug: 'ballroom-level',
    name: 'Ballroom Level',
    position: 2,
    subtitle: 'Level 2 · Sessions & dining',
    width: 1600,
    height: 1200,
  },
  {
    slug: 'meeting-rooms',
    name: 'Meeting Rooms',
    position: 3,
    subtitle: 'Level 3 · 1-on-1 meeting tables',
    // TALLER than the other two, on purpose, and taller rather than shorter for
    // a measured reason. This is the map the switch-to-a-different-shape
    // assertion is aimed at, so it has to differ — but a room label hangs about
    // 18 percentage points below its marker, and on a SHORTER picture that put
    // every row of labels onto the next row of rooms: measured at 1600x1000,
    // seven of nine labels landed on something drawn. Height is what the labels
    // need, and a tall plan is exactly as representative of what a venue sends
    // as a wide one.
    width: 1600,
    height: 1400,
  },
]

export const imagePathFor = (slug) => `/maps/${slug}.png`
