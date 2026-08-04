import { NextResponse, type NextRequest } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@conference/db'
import { roleHasPermission } from '@/lib/api-permission'

/**
 * The picture for one venue map, for the organizer who is placing markers on it.
 *
 * Phase 11, finding F-19. Before this address existed the admin app could show no
 * map picture at all, and tapping a picture is the whole of user story FP 25.
 * Three separate reasons, each enough on its own:
 *
 *   The map list screen computed a thumbnail address and never rendered it.
 *
 *   A seeded map stores a path such as /maps/exhibit-hall.png, and those files are
 *   committed under apps/attendee/public/maps — which only the participant app
 *   serves. This app answered 404 for all three.
 *
 *   An uploaded map stores the picture itself as base64 text, and the list screen
 *   deliberately sends null instead, because putting that into a page for a
 *   thumbnail is what finding F-14 exists to prevent.
 *
 * ── Why the participant app's picture address cannot be reused ────────────────
 *
 * apps/attendee/app/api/data/map/[id]/image requires a participant session and a
 * complete profile, and refuses everything else — correctly, and that is what
 * Phase 10's review round 1 fixed. An organizer's browser holds an admin session,
 * and the two apps are separate deployments on separate addresses.
 *
 * ── Guarded exactly like its three sibling map addresses ──────────────────────
 *
 * A session, then the admin roles, then the floorPlan permission key, then a
 * lookup scoped to the active conference. Same four checks in the same order as
 * ../route.ts and ../../[id]/route.ts. Phase 10's review round 2 found those
 * addresses checking only the caller's role, so a role with the key switched off
 * could still upload, reorder and delete by calling them directly; round 3 found
 * a destructive path unscoped after round 1 had scoped its symmetrical twin. Both
 * mistakes are avoided here by copying the finished shape rather than a partial
 * one.
 *
 * A consequence stated so it is not misread: a role with floorPlan switched off
 * gets no pictures either. That is intended and matches the three write
 * addresses. A blank map area is an easy thing to mistake for a broken upload.
 */

const ADMIN_ROLES = ['STAFF', 'ORGANIZER', 'ADMIN']

/**
 * Where the seeded pictures live in this app.
 *
 * assets/ rather than public/ deliberately. A file under public/ is routable, and
 * middleware.ts decides what skips the signed-in check by naming folders
 * explicitly — its comment records that public/ holds only icons/ and sponsors/,
 * and that naming folders rather than file extensions is what closed a Phase 6.5
 * weakness. Keeping the pictures outside public/ means they are reachable only
 * through this guarded address, and that matcher needs no change.
 *
 * Nothing imports these files, so next.config.js names them under
 * outputFileTracingIncludes. Without that they would be absent from the deployed
 * function while working here.
 */
const ASSETS_DIR = path.join(process.cwd(), 'assets')

/**
 * The seeded picture paths this app will serve, as an explicit shape.
 *
 * The value comes from this app's own database rather than from a request, and an
 * uploaded map takes the other branch below because its value begins "data:". The
 * check is here anyway: a stored string is turned into a filesystem path, and the
 * cost of being wrong about that is reading a file outside the assets folder.
 */
const SEEDED_PICTURE = /^\/maps\/[a-z0-9][a-z0-9-]*\.png$/i

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const me = session.user as any
  if (!ADMIN_ROLES.includes(me.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!(await roleHasPermission(me.role, 'floorPlan'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  // Scoped to the active conference, like every other floor-plan surface in this
  // app. A map outside it answers exactly as a map that does not exist, so this
  // cannot be used to find out which old ids are real.
  const conference = await prisma.conference.findFirst({
    where: { active: true },
    select: { id: true },
  })
  if (!conference) return new NextResponse(null, { status: 404 })

  const map = await prisma.venueMap.findFirst({
    where: { id, conferenceId: conference.id },
    select: { imageUrl: true },
  })
  if (!map?.imageUrl) return new NextResponse(null, { status: 404 })

  const stored = map.imageUrl

  // ── An uploaded map: the picture is in the column ──────────────────────────
  if (stored.startsWith('data:')) {
    const match = stored.match(/^data:(image\/[\w+.-]+);base64,([\s\S]+)$/)
    if (!match) return new NextResponse(null, { status: 404 })

    const [, contentType, b64] = match
    const buffer = Buffer.from(b64, 'base64')

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.length),
        // `private`, never `public`. This picture is behind a permission check,
        // and `public` invites a shared cache to store it and hand it to somebody
        // else, which is how a guarded address gets served past its guard. Phase
        // 6 changed the buyer directory for this reason and it is the precedent.
        //
        // 60 seconds, matching the participant app's picture address. Replacing a
        // map's picture does not change this address, because the id does not
        // change, so a long window would leave an organizer placing markers on
        // the previous picture.
        'Cache-Control': 'private, max-age=60',
      },
    })
  }

  // ── A seeded map: the picture is a committed file ──────────────────────────
  if (!SEEDED_PICTURE.test(stored)) return new NextResponse(null, { status: 404 })

  // path.join collapses any "..", and the result is then checked against the
  // assets folder rather than trusted. The pattern above already refuses a
  // traversal; this refuses one that gets past it.
  const filePath = path.join(ASSETS_DIR, stored)
  if (!filePath.startsWith(ASSETS_DIR + path.sep)) return new NextResponse(null, { status: 404 })

  // ── Why the bytes are copied into a fresh array ────────────────────────────
  //
  // readFile hands back a Buffer whose backing store TypeScript describes loosely,
  // and neither that Buffer nor a Uint8Array wrapped around it satisfies the
  // response body type — unlike the Buffer.from result used in the branch above.
  // Allocating a fixed length and copying into it produces the exact type.
  //
  // Copying 34 KB once per request is cheap, and the alternative is an error left
  // in place. This app builds with typescript.ignoreBuildErrors set, so an error
  // here would not have stopped the build — which is precisely why it gets fixed
  // rather than tolerated.
  // The backing type is named explicitly: a bare `Uint8Array` widens to the loose
  // form and reintroduces the same error the copy above exists to avoid.
  let buffer: Uint8Array<ArrayBuffer>
  try {
    const raw = await readFile(filePath)
    buffer = new Uint8Array(raw.byteLength)
    buffer.set(raw)
  } catch {
    // Reached when the picture is missing from the deployed function — the exact
    // failure outputFileTracingIncludes exists to prevent. Logged rather than
    // silent, because F-17's whole cost was a failure that nothing reported.
    console.warn(`[floor-plan/maps/${id}/image] seeded picture not readable at ${filePath}`)
    return new NextResponse(null, { status: 404 })
  }

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=60',
    },
  })
}
