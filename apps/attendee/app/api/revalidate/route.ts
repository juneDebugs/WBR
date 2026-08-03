import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { publish, listenerCount } from '@/lib/floor-plan-events'

/**
 * Cache invalidation from another application in this system.
 *
 * ── This route is the ONLY boundary, as of 2026-08-02 ────────────────────────
 *
 * The middleware used to refuse this address to anyone without a session
 * cookie, which meant no server-to-server caller ever reached it — finding
 * F-17. It now exempts exactly this path, so the secret comparison below is the
 * whole of the authentication and has to fail closed.
 *
 * Raised by Phase 10's adversarial review, round 1, and confirmed against the
 * code: the previous version compared `secret !== process.env.NEXTAUTH_SECRET`
 * and nothing else. With the environment variable unset, a body carrying no
 * secret at all made that `undefined !== undefined`, which is false — so the
 * request passed and any caller could invalidate any tag. Harmless while the
 * middleware blocked everyone; a hole the moment it stopped.
 */
export async function POST(req: Request) {
  const expected = process.env.NEXTAUTH_SECRET

  // No server secret configured means nothing can be authenticated, so nothing
  // is accepted. Refusing every caller is a cache that goes stale; accepting
  // every caller is an open endpoint.
  if (typeof expected !== 'string' || expected.length === 0) {
    console.error('[revalidate] NEXTAUTH_SECRET is not set; refusing all cache invalidation.')
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Expected a JSON body.' }, { status: 400 })
  }

  const { secret, tags } = body ?? {}

  // Checked for type and emptiness before comparison, so a missing key, a null,
  // or a non-string can never coincide with the expected value.
  if (typeof secret !== 'string' || secret.length === 0 || secret !== expected) {
    return NextResponse.json({ error: 'Invalid secret' }, { status: 401 })
  }

  if (!Array.isArray(tags) || tags.length === 0) {
    return NextResponse.json({ error: 'tags required' }, { status: 400 })
  }

  for (const tag of tags) {
    revalidateTag(tag)
  }

  // ── Tell the phones, not just the cache ─────────────────────────────────────
  //
  // Clearing the server's copy makes the next REQUEST correct. It does nothing
  // for a delegate already looking at the map, because their phone holds its own
  // copy and has no reason to ask again.
  //
  // Every writer that changes the map already calls this address — the three map
  // handlers in the admin app, the sponsor portal's profile save, and the admin
  // app's three sponsor actions. So this one line reaches all seven without any
  // of them changing.
  //
  // pushed is the number of connections THIS copy of the app holds. It is logged
  // rather than returned: the writer cannot act on it, and a number that looks
  // like a delivery count invites reading it as "every delegate was told", which
  // it is not. See lib/floor-plan-events.ts.
  let listenersOnThisInstance: number | undefined
  if (tags.includes('floor-plan')) {
    // Counted BEFORE publishing, and from the register rather than from the
    // result of writing.
    //
    // Found by negative control 5. publish() returns how many listeners it
    // successfully wrote to, which is not the same number as how many are
    // connected — they differ exactly when a write fails, which is the case
    // anyone reading this field would most want to distinguish. Returning the
    // delivery count under the name `listenersOnThisInstance` was wrong, and it
    // made the control that breaks delivery also break the count, so one control
    // failed two behaviours.
    listenersOnThisInstance = listenerCount()
    const delivered = publish()
    if (listenersOnThisInstance > 0) {
      console.log(
        `[revalidate] floor-plan change: ${listenersOnThisInstance} open connection(s) on this instance, ` +
          `${delivered} written to successfully`,
      )
    }
  }

  // ── The count is returned, and its name is doing deliberate work ────────────
  //
  // It was logged and not returned, on the grounds that a number in a response
  // invites being read as "every delegate was told", which it is not — it counts
  // only the connections THIS copy of the app holds.
  //
  // Round 3 of the adversarial review changed the balance: it found that a
  // stream discarded without an abort event left its listener in the register
  // forever, and observed that a leak nobody can count is a leak nobody can
  // test. So the count is returned, named for exactly what it is. Any caller
  // reading `listenersOnThisInstance` as a delivery guarantee is contradicted by
  // the field name.
  return NextResponse.json({ revalidated: tags, listenersOnThisInstance })
}
