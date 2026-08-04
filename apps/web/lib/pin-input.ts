/**
 * What a valid marker is, in one place.
 *
 * Phase 11. Three addresses write markers — create, move-or-edit, and delete —
 * and the organizer's screen applies the same rules before it sends anything.
 * Four copies of "a booth needs a company" is how two of them end up disagreeing,
 * which is the reasoning that produced the shared completeness policy in Phase 2.
 *
 * This module does no input or output. It is a plain function of its arguments so
 * that its branches can be checked directly rather than only through a browser,
 * the same shape as packages/db/src/onboarding-policy.ts.
 */

export type PinType = 'BOOTH' | 'ROOM'

export type ValidPin = {
  type: PinType
  x: number
  y: number
  /** Set for a booth whose company is chosen. Always null for a room. */
  sponsorId: string | null
  /** A room's name. A booth's fallback name, normally null. */
  label: string | null
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * The longest room name accepted.
 *
 * Room names are the first organizer-typed free text to reach the map. Phase 9's
 * review round 2 measured the booth card overflowing at 390 pixels when the
 * longest seeded company name is 12 characters, so a name a person types by hand
 * needs a stated limit rather than whatever the column happens to accept. 60
 * characters comfortably holds "General Session Ballroom — Level 2" and refuses a
 * paragraph pasted in by mistake.
 *
 * The limit is a refusal with a message, not a silent truncation: an organizer who
 * types a long name and gets a shorter one back has no way to tell what happened.
 */
export const MAX_LABEL_LENGTH = 60

/**
 * Positions are percentages of the picture's width and height, so a marker stays
 * on the right spot at any screen size. Two decimal places is 0.16 of a pixel on
 * a 1600-pixel map — finer than anyone can tap, and it keeps the stored value
 * readable when a person is looking at a row in the database.
 */
function roundPercent(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * A position, which must arrive as an actual JSON number.
 *
 * ── Why coercion is refused, found by adversarial review round 1 ─────────────
 *
 * This used to be `typeof raw === 'number' ? raw : Number(raw)`, and Number()
 * coerces far more than it looks like it does. Every one of these passed
 * validation and stored a real position the caller never sent as a number:
 *
 *   {"x": null}   -> 0      {"x": []}    -> 0
 *   {"x": true}   -> 1      {"x": [50]}  -> 50
 *   {"x": "  "}   -> 0      {"x": ""}    -> 0
 *
 * So a request with a null position saved a marker at the top-left corner of the
 * map, and both the organizer and every delegate then drew it there. Nothing
 * failed and nothing was logged: the marker is a valid row, at a position nobody
 * chose. Rejecting is the only honest answer, because there is no correct
 * position to guess.
 *
 * Strings are refused rather than parsed. The browser sends numbers, so accepting
 * "50" would widen the contract for no caller that exists.
 */
function readPercent(raw: unknown, axis: 'x' | 'y'): Validated<number> {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return {
      ok: false,
      error: `The marker's ${axis} position must be a number between 0 and 100.`,
    }
  }
  if (raw < 0 || raw > 100) {
    return { ok: false, error: `The marker's ${axis} position must be between 0 and 100.` }
  }
  // Adding zero turns -0 into 0. A stored -0 reads back as -0 in some tools and as
  // 0 in others, which is a difference nobody should have to think about.
  return { ok: true, value: roundPercent(raw) + 0 }
}

function readLabel(raw: unknown): Validated<string | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'The label must be text.' }
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: true, value: null }
  if (trimmed.length > MAX_LABEL_LENGTH) {
    return {
      ok: false,
      error: `That name is ${trimmed.length} characters. Keep a marker's name to ${MAX_LABEL_LENGTH} or fewer.`,
    }
  }
  return { ok: true, value: trimmed }
}

function readSponsorId(raw: unknown): Validated<string | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== 'string') return { ok: false, error: 'The company must be sent as an id.' }
  const trimmed = raw.trim()
  return { ok: true, value: trimmed.length === 0 ? null : trimmed }
}

/**
 * A whole new marker.
 *
 * A booth with neither a company nor a typed name is refused. Decided 2026-08-03:
 * apps/attendee/lib/floor-plan-data.ts drops any marker with
 * no name to show, so such a marker would sit on the organizer's screen and be
 * invisible to every delegate. That mismatch is exactly what reads as a failed
 * save during a demonstration.
 */
export function validateNewPin(body: unknown): Validated<ValidPin> {
  const raw = (body ?? {}) as Record<string, unknown>

  const type = raw.type
  if (type !== 'BOOTH' && type !== 'ROOM') {
    return { ok: false, error: 'Choose whether this marker is a booth or a room.' }
  }

  const x = readPercent(raw.x, 'x')
  if (!x.ok) return x
  const y = readPercent(raw.y, 'y')
  if (!y.ok) return y

  const label = readLabel(raw.label)
  if (!label.ok) return label

  const sponsorId = readSponsorId(raw.sponsorId)
  if (!sponsorId.ok) return sponsorId

  if (type === 'ROOM') {
    if (!label.value) return { ok: false, error: 'Type the room’s name.' }
    // A room never links to a company. Sending one is a mistake in the caller
    // rather than something to store quietly.
    if (sponsorId.value) {
      return { ok: false, error: 'A room marker cannot be linked to a company.' }
    }
    return { ok: true, value: { type, x: x.value, y: y.value, sponsorId: null, label: label.value } }
  }

  if (!sponsorId.value && !label.value) {
    return { ok: false, error: 'Choose the company at this booth, or type a name for the marker.' }
  }

  return {
    ok: true,
    value: { type, x: x.value, y: y.value, sponsorId: sponsorId.value, label: label.value },
  }
}

/** The marker as it is stored, as much of it as an update has to reason about. */
export type ExistingPin = {
  type: string
  x: number
  y: number
  sponsorId: string | null
  label: string | null
}

export type PinChanges = {
  x?: number
  y?: number
  sponsorId?: string | null
  label?: string | null
}

/**
 * A change to a marker that already exists.
 *
 * Only the fields present in the request are changed, so moving a marker does not
 * have to resend its company and renaming it does not have to resend its position.
 *
 * The result is checked as a WHOLE afterwards, against the marker the change would
 * produce rather than against the fields that arrived. Clearing a booth's company
 * when it has no typed name has to be refused, and a check that only looked at the
 * arriving fields would see one empty string and allow it.
 *
 * The marker's type cannot be changed. A booth carries a company link and a room
 * carries a name; letting one become the other means every caller has to handle a
 * marker whose two halves disagree, for a case an organizer can reach by deleting
 * the marker and placing another.
 */
export function validatePinUpdate(existing: ExistingPin, body: unknown): Validated<PinChanges> {
  const raw = (body ?? {}) as Record<string, unknown>

  if (raw.type !== undefined && raw.type !== existing.type) {
    return {
      ok: false,
      error: 'A marker cannot change between a booth and a room. Delete it and place a new one.',
    }
  }

  const changes: PinChanges = {}

  if (raw.x !== undefined || raw.y !== undefined) {
    // Both or neither. A marker moved on one axis only is not something the
    // screen can produce, and accepting it would let a caller shift a marker
    // sideways off the picture in two steps that each looked reasonable.
    if (raw.x === undefined || raw.y === undefined) {
      return { ok: false, error: 'Send both the x and y positions when moving a marker.' }
    }
    const x = readPercent(raw.x, 'x')
    if (!x.ok) return x
    const y = readPercent(raw.y, 'y')
    if (!y.ok) return y
    changes.x = x.value
    changes.y = y.value
  }

  if (raw.label !== undefined) {
    const label = readLabel(raw.label)
    if (!label.ok) return label
    changes.label = label.value
  }

  if (raw.sponsorId !== undefined) {
    if (existing.type === 'ROOM') {
      return { ok: false, error: 'A room marker cannot be linked to a company.' }
    }
    const sponsorId = readSponsorId(raw.sponsorId)
    if (!sponsorId.ok) return sponsorId
    changes.sponsorId = sponsorId.value
  }

  if (Object.keys(changes).length === 0) {
    return { ok: false, error: 'Nothing was sent to change.' }
  }

  // The whole marker as it would be after the change.
  const after = {
    type: existing.type,
    sponsorId: changes.sponsorId !== undefined ? changes.sponsorId : existing.sponsorId,
    label: changes.label !== undefined ? changes.label : existing.label,
  }

  if (after.type === 'ROOM' && !after.label) {
    return { ok: false, error: 'Type the room’s name.' }
  }
  if (after.type === 'BOOTH' && !after.sponsorId && !after.label) {
    return { ok: false, error: 'Choose the company at this booth, or type a name for the marker.' }
  }

  return { ok: true, value: changes }
}
