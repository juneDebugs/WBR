import { getSession } from '@/lib/session'
import { requireCompleteProfile } from '@/lib/require-complete-profile'
import { subscribe } from '@/lib/floor-plan-events'

/**
 * A connection a delegate's phone holds open to be told when the venue map
 * changes.
 *
 * This is a server-sent events stream: ordinary HTTP that stays open, down which
 * the server writes a line whenever it has something to say. The browser's own
 * EventSource reconnects if it drops, so there is no reconnection logic on the
 * client.
 *
 * The phone is told only THAT something changed, never what. It then refetches
 * /api/data/map through the same cached, gated path it always uses. Sending the
 * new data down this connection instead would mean a second place that decides
 * what a delegate may see — and the map payload carries booth-card details for
 * every exhibiting company, so getting that wrong discloses more than a map.
 *
 * ── Gated identically to the data it announces ───────────────────────────────
 *
 * Session, then complete profile, in that order — the same two checks
 * /api/data/map makes. Without them this would tell a signed-out visitor, or a
 * delegate blocked from every screen, when an organizer is working. That leaks
 * activity rather than content, which is less serious and still nobody's
 * business.
 *
 * ── Why this route is declared dynamic ───────────────────────────────────────
 *
 * A response that never ends must not be treated as something that can be
 * produced ahead of time and reused.
 */
export const dynamic = 'force-dynamic'

/**
 * How often a comment line is written to keep the connection open.
 *
 * An idle connection is closed by intermediate network equipment and by phones
 * moving between networks, typically after a minute or so of silence. A comment
 * — a line beginning ':' — is ignored by the browser and resets that clock. 25
 * seconds sits comfortably inside the shortest timeouts commonly seen.
 */
const KEEPALIVE_MS = 25_000

export async function GET(req: Request) {
  const session = await getSession()
  if (!session?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const blocked = await requireCompleteProfile()
  if (blocked) return blocked

  const encoder = new TextEncoder()

  // Declared out here so cancel() can reach it. Assigned in start().
  let cleanup = () => {}

  const stream = new ReadableStream({
    start(controller) {
      let open = true
      let unsubscribe = () => {}
      let keepalive: ReturnType<typeof setInterval> | undefined

      // ── Idempotent, and called from BOTH ways a connection can end ──────────
      //
      // Raised by round 3 of Phase 10's adversarial review. The first version
      // cleaned up only from req.signal's abort event, and cancel() was an empty
      // comment. A runtime that discards the stream WITHOUT delivering that
      // abort — a path that exists — left the listener in the register and the
      // keepalive timer running forever. Every later publish() would then write
      // to a connection nobody is reading, and on a conference day, with phones
      // sleeping, switching networks and closing the app, that grows without
      // bound on an instance while reporting nothing.
      //
      // Idempotent because both paths can fire for the same connection, and
      // unsubscribing twice must not remove a different visit's listener.
      cleanup = () => {
        if (!open) return
        open = false
        if (keepalive) clearInterval(keepalive)
        unsubscribe()
        req.signal.removeEventListener('abort', onAbort)
      }

      function onAbort() {
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed by the runtime; nothing to do.
        }
      }

      const send = (text: string) => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          // The connection went away between the check and the write. Tidy up
          // rather than throwing into whoever called publish().
          cleanup()
        }
      }

      // An opening comment so the browser treats the connection as established
      // rather than as a request still waiting for its first byte.
      send(': connected\n\n')

      unsubscribe = subscribe(event => {
        send(`event: floor-plan\ndata: ${JSON.stringify(event)}\n\n`)
      })

      keepalive = setInterval(() => send(': keepalive\n\n'), KEEPALIVE_MS)

      // The phone closing the app, locking the screen, or losing signal arrives
      // here. `once` because cleanup removes the listener anyway and a duplicate
      // would be wasted work.
      req.signal.addEventListener('abort', onAbort, { once: true })
    },

    cancel() {
      // Reached when the consumer discards the stream, which can happen without
      // the abort event above ever firing. This is the second half of the fix
      // for the listener leak described in start().
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      // Never a shared cache: this is a per-delegate connection, and a shared
      // cache holding it would hand one person's stream to somebody else. The
      // same reasoning Phase 6 applied to the buyer directory.
      'Cache-Control': 'private, no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      // Tells reverse proxies not to buffer, which would hold each line until
      // enough bytes accumulated and defeat the point of streaming.
      'X-Accel-Buffering': 'no',
    },
  })
}
