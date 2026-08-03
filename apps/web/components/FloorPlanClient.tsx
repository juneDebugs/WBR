'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The organizer's venue-map screen. Phase 10.
 *
 * ── Where the rules live ─────────────────────────────────────────────────────
 *
 * Every limit applied here is applied again by the request handler. This is
 * where a person gets a message they can act on; that is where the rule is
 * enforced. A guard that lives only in a browser is not a guard, and the Phase
 * 10 suite checks the handler by sending requests that never came from here.
 *
 * ── Why the picture is resized before it is sent ─────────────────────────────
 *
 * A venue's own floor plan is commonly several megabytes. Stored at that size it
 * would sit in the database as base64, a third larger again. The agreed limits,
 * settled by the project owner on 2026-08-02: accept up to 10 MB, store at up to
 * 2400 pixels on the longest side, re-encoded as JPEG at quality 0.8.
 *
 * This follows the shape of the existing upload in SpeakersClient.tsx — reject a
 * non-image, reject an oversized file, draw into a canvas, call toDataURL — but
 * NOT its numbers. That one scales to 400 pixels at quality 0.65, which suits a
 * speaker's headshot and would make a floor plan unreadable. Finding F-9 already
 * records that a 1600-pixel map shown at 366 CSS pixels cannot be read.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_LONG_EDGE = 2400
const JPEG_QUALITY = 0.8

type MapRow = {
  id: string
  name: string
  position: number
  markerCount: number
  previewUrl: string | null
}

export default function FloorPlanClient({
  maps,
  conferenceName,
  crossAppLinkConfigured,
}: {
  maps: MapRow[]
  conferenceName: string | null
  crossAppLinkConfigured: boolean
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  /**
   * Maps deleted in this browser, hidden straight away.
   *
   * The list comes from the server, and router.refresh() re-renders it — but
   * that is a round trip, and until it lands the organizer is still looking at a
   * map they just deleted. Measured during Phase 10's review cycle: the row was
   * still on screen after the database row was gone, intermittently, which is
   * the worst version of it — it works when you check and not when you demand.
   *
   * Only applied after the handler answers success, so this hides nothing that
   * is still there. The refresh behind it remains the source of truth: anything
   * this set is wrong about is corrected the moment the server responds.
   */
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const visibleMaps = maps.filter(m => !removedIds.includes(m.id))

  /**
   * Read the picture, scale it so its longest side is at most MAX_LONG_EDGE, and
   * return it as a JPEG data URL.
   *
   * Scaling is skipped when the picture is already small enough — re-encoding a
   * 1200-pixel plan at quality 0.8 would throw away detail for nothing.
   */
  function prepare(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const longest = Math.max(img.width, img.height)
        const scale = Math.min(1, MAX_LONG_EDGE / longest)
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('no canvas context'))
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('could not decode'))
      }
      img.src = url
    })
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')

    const file = fileRef.current?.files?.[0]
    if (!file) {
      setError('Choose a picture of the floor plan to upload.')
      return
    }
    if (!name.trim()) {
      setError('Give the map a name, for example "Exhibit Hall".')
      return
    }

    // The PDF case is answered before the general one, so the organizer is told
    // what to do rather than only that something was wrong. Decision F-15: the
    // app converts nothing, and this message is the whole of the fallback if a
    // PDF turns up on the day.
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    if (isPdf) {
      setError('This app does not accept PDFs. Open the PDF, save the page as a JPG or PNG, and upload that instead.')
      return
    }
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Only JPG and PNG pictures can be uploaded. Save the floor plan in one of those formats and try again.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('That picture is larger than 10 MB. Save it at a smaller size and upload it again.')
      return
    }

    setBusy(true)
    try {
      const imageDataUrl = await prepare(file)
      const res = await fetch('/api/floor-plan/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), imageDataUrl }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'The map could not be saved.')
        return
      }
      setName('')
      if (fileRef.current) fileRef.current.value = ''
      setNotice(
        crossAppLinkConfigured
          ? 'Map uploaded. Delegates can see it now.'
          : 'Map uploaded and saved. Delegates may not see it for up to five minutes, because the link to the attendee app is not configured on this deployment.',
      )
      router.refresh()
    } catch {
      setError('That picture could not be read. Upload a JPG or PNG of the floor plan.')
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= visibleMaps.length) return
    setError('')
    setNotice('')
    // Built from what is on screen, which is what the database now holds. The
    // handler refuses a list that does not name every map exactly once, and the
    // server prop can still include a map deleted a moment ago until the refresh
    // behind it lands — sending that would be refused, correctly, and look to
    // the organizer like reordering was broken.
    const orderedIds = visibleMaps.map(m => m.id)
    ;[orderedIds[index], orderedIds[target]] = [orderedIds[target], orderedIds[index]]

    setBusy(true)
    try {
      // The complete list is sent every time. The handler refuses a partial one:
      // renumbering some maps into positions others still hold is how duplicate
      // and missing positions get created.
      const res = await fetch('/api/floor-plan/maps', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'The order could not be saved.')
        return
      }
      setNotice(
        crossAppLinkConfigured
          ? 'Order saved. Delegates can see it now.'
          : 'Order saved. Delegates may not see it for up to five minutes, because the link to the attendee app is not configured on this deployment.',
      )
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function remove(map: MapRow) {
    setError('')
    setNotice('')
    setBusy(true)
    try {
      const res = await fetch(`/api/floor-plan/maps/${map.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'The map could not be deleted.')
        return
      }
      setRemovedIds(ids => [...ids, map.id])
      setNotice(
        crossAppLinkConfigured
          ? `"${map.name}" deleted. Delegates can see the change now.`
          : `"${map.name}" deleted. Delegates may not see the change for up to five minutes, because the link to the attendee app is not configured on this deployment.`,
      )
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6" data-testid="floor-plan-admin">
      {!crossAppLinkConfigured && (
        <div
          data-testid="cross-app-warning"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">Changes here may take up to five minutes to reach delegates.</p>
          <p className="mt-1">
            The link to the attendee app is not configured on this deployment, so this app cannot tell it
            when a map changes. Maps still save correctly. Set <code>ATTENDEE_APP_URL</code> on this app to
            the attendee app’s address to make changes appear immediately.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">Upload a map</h2>
        <p className="mt-1 text-sm text-gray-500">
          JPG or PNG, up to 10 MB. Larger pictures are reduced to 2400 pixels on the longest side.
          {conferenceName ? ` Maps belong to ${conferenceName}.` : ''}
        </p>

        <form onSubmit={onUpload} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600">Map name</label>
            <input
              name="mapName"
              data-testid="map-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Exhibit Hall"
              className="form-input mt-1 w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600">Picture</label>
            <input
              ref={fileRef}
              type="file"
              name="mapPicture"
              data-testid="map-picture"
              accept="image/png,image/jpeg"
              className="mt-1 block w-full text-sm"
            />
          </div>
          <button type="submit" data-testid="upload-map" disabled={busy} className="btn-primary text-sm">
            {busy ? 'Working…' : 'Upload map'}
          </button>
        </form>

        {error && (
          <p data-testid="upload-error" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {notice && (
          <p data-testid="upload-notice" className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800">
            {notice}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          Maps, in the order delegates switch through them
        </h2>

        {visibleMaps.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500" data-testid="no-maps">
            No maps yet. Upload one above.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-gray-100" data-testid="map-list">
            {visibleMaps.map((m, i) => (
              <li key={m.id} data-testid="map-row" data-map-id={m.id} className="flex items-center gap-3 py-3">
                <span className="w-6 text-sm tabular-nums text-gray-400">{m.position}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900" data-testid="map-row-name">{m.name}</p>
                  <p className="text-xs text-gray-500">
                    {m.markerCount === 0
                      ? 'No markers yet'
                      : `${m.markerCount} marker${m.markerCount === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="move-up"
                  onClick={() => move(i, -1)}
                  disabled={busy || i === 0}
                  className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-40"
                  aria-label={`Move ${m.name} earlier`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  data-testid="move-down"
                  onClick={() => move(i, 1)}
                  disabled={busy || i === visibleMaps.length - 1}
                  className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-40"
                  aria-label={`Move ${m.name} later`}
                >
                  ↓
                </button>
                {/* No window.confirm: a browser dialog blocks the page and this
                    project's automation cannot dismiss one. Two clicks instead. */}
                <DeleteButton map={m} busy={busy} onConfirm={() => remove(m)} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function DeleteButton({ map, busy, onConfirm }: { map: MapRow; busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <button
        type="button"
        data-testid="delete-map"
        onClick={() => setArmed(true)}
        disabled={busy}
        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-40"
        aria-label={`Delete ${map.name}`}
      >
        Delete
      </button>
    )
  }
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-gray-500">
        {map.markerCount > 0 ? `Delete with ${map.markerCount} marker${map.markerCount === 1 ? '' : 's'}?` : 'Delete?'}
      </span>
      <button
        type="button"
        data-testid="delete-map-confirm"
        onClick={onConfirm}
        disabled={busy}
        className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-40"
      >
        Yes
      </button>
      <button
        type="button"
        data-testid="delete-map-cancel"
        onClick={() => setArmed(false)}
        className="rounded border border-gray-200 px-2 py-1 text-xs"
      >
        No
      </button>
    </span>
  )
}
