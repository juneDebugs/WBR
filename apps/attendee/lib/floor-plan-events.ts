import 'server-only'

/**
 * Who is currently listening for floor-plan changes, in THIS copy of the app.
 *
 * ── What this is for ─────────────────────────────────────────────────────────
 *
 * A delegate viewing the venue map holds one long-lived connection open to this
 * app. When an organizer uploads, reorders or deletes a map, the admin app
 * notifies /api/revalidate, which clears the server-side cache and then calls
 * publish() here. Every open connection is written to, and each phone refetches
 * the map on its own. No polling, no tap, no navigation.
 *
 * ── The limitation, stated where the code is and not only in a document ──────
 *
 * This register is an ordinary variable. It lives in the memory of ONE running
 * copy of this app, and the hosting platform runs as many copies as load
 * requires, spreading people between them without telling anyone.
 *
 * The admin app sends ONE notification, so it arrives at ONE copy. That copy
 * writes to its own listeners. The other copies were never asked and cannot
 * report not having been asked: nothing errors, nothing is logged, and every
 * test passes, because a development machine and a lightly used deployment both
 * run exactly one copy.
 *
 * So the push is immediate for phones on the copy that received the
 * notification, and silent for the rest. The map screen therefore ALSO refreshes
 * on a slow timer — see useFloorPlanData in lib/hooks.ts — so a phone that never
 * hears anything still converges rather than waiting out the cache.
 *
 * Removing the limitation needs a shared channel every copy subscribes to, such
 * as the Redis product in the hosting platform's marketplace. That was weighed
 * on 2026-08-02 and deliberately not taken for the 2026-08-11 demonstration; the
 * reasoning and its four commitments are in CHANGELOG.md under "How quickly a
 * change reaches a delegate's phone".
 *
 * ── Why a module-level variable works at all ─────────────────────────────────
 *
 * Route handlers do not share ordinary state between requests, but they do share
 * a module instance within one process. The connection is opened by one request
 * that never finishes, and publish() runs in a different request on the same
 * process. globalThis is used so a hot reload in development does not orphan the
 * listeners belonging to a previous copy of this module.
 */

type Listener = (event: FloorPlanEvent) => void

export type FloorPlanEvent = {
  /** What changed. Only one kind today; named so a second kind is additive. */
  type: 'floor-plan-changed'
  /** Milliseconds since the epoch, so a client can ignore what it has seen. */
  at: number
}

const KEY = Symbol.for('wbr.floorPlanListeners')

function registry(): Set<Listener> {
  const g = globalThis as any
  if (!g[KEY]) g[KEY] = new Set<Listener>()
  return g[KEY] as Set<Listener>
}

/** Start listening. Returns the function that stops listening. */
export function subscribe(listener: Listener): () => void {
  const set = registry()
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}

/**
 * Tell every listener on THIS copy that the floor plan changed.
 *
 * A listener that throws must not stop the others being told — one phone whose
 * connection died mid-write should not cost every other phone its update.
 */
export function publish(): number {
  const set = registry()
  const event: FloorPlanEvent = { type: 'floor-plan-changed', at: Date.now() }
  let delivered = 0
  for (const listener of set) {
    try {
      listener(event)
      delivered++
    } catch {
      // Dropped deliberately: that connection is already gone, and its own
      // cancel handler removes it from the register.
    }
  }
  return delivered
}

/** How many connections this copy holds. Used by the Phase 10 suite. */
export function listenerCount(): number {
  return registry().size
}
