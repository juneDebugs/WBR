import 'server-only'

/**
 * Write a switch order onto a conference's venue maps.
 *
 * ── Why this is two passes and not one ───────────────────────────────────────
 *
 * VenueMap carries @@unique([conferenceId, position]), and SQLite checks a
 * unique constraint per statement rather than at the end of a transaction. So
 * swapping the maps at positions 4 and 5 by writing 5→4 and then 4→5 fails on
 * the first write: at that moment two rows would hold position 4. The schema
 * comment on that column already records this; it is written out here because
 * this is the code that has to obey it.
 *
 * Pass one moves every map to a negative position. Negatives cannot collide with
 * the positive positions still held by maps not yet moved, and cannot collide
 * with each other. Pass two writes the real positions into a range nothing
 * occupies any more.
 *
 * Both passes run inside one transaction supplied by the caller, so a failure
 * halfway cannot leave the order half-written — which for this table would mean
 * duplicate or missing positions rather than merely a wrong order.
 *
 * The caller is responsible for `orderedIds` being the COMPLETE set of maps for
 * the conference. Applying a partial list would renumber some maps into
 * positions others still hold.
 */
export async function applyOrder(tx: any, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await tx.venueMap.update({ where: { id: orderedIds[i] }, data: { position: -(i + 1) } })
  }
  for (let i = 0; i < orderedIds.length; i++) {
    await tx.venueMap.update({ where: { id: orderedIds[i] }, data: { position: i + 1 } })
  }
}

/**
 * True when `given` holds exactly the same ids as `expected`, once each.
 *
 * A reorder naming only some of a conference's maps would leave the rest holding
 * stale positions, which is how gaps and duplicate positions get created. A
 * reorder naming a map twice would silently drop another. Both are refused, and
 * this is the test that refuses them.
 */
export function isCompleteSet(given: string[], expected: string[]): boolean {
  if (given.length !== expected.length) return false
  if (new Set(given).size !== given.length) return false
  const want = new Set(expected)
  return given.every(id => want.has(id))
}
