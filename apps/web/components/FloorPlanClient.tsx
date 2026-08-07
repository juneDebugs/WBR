'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MAX_LABEL_LENGTH } from '@/lib/pin-input'
import { MAX_BOOTH_NUMBER_LENGTH, validateBoothNumber } from '@/lib/booth-number-input'

/**
 * The organizer's venue-map screen. Phases 10 and 11.
 *
 * Phase 10 built the upload, the switch order and the delete. Phase 11 adds marker
 * placement on top, which is what Phase 10's screen was shaped expecting.
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
 * settled 2026-08-02: accept up to 10 MB, store at up to
 * 2400 pixels on the longest side, re-encoded as JPEG at quality 0.8.
 *
 * This follows the shape of the existing upload in SpeakersClient.tsx — reject a
 * non-image, reject an oversized file, draw into a canvas, call toDataURL — but
 * NOT its numbers. That one scales to 400 pixels at quality 0.65, which suits a
 * speaker's headshot and would make a floor plan unreadable. Finding F-9 already
 * records that a 1600-pixel map shown at 366 CSS pixels cannot be read.
 *
 * ── How a marker is placed and moved, and why it is not a drag ───────────────
 *
 * Decided 2026-08-03, recorded in the requirements document and the plan. Clicking empty space on the picture starts a new marker there.
 * Clicking an existing marker selects it, and the next click on the picture moves
 * the selected marker to that spot.
 *
 * A press-move-release gesture was rejected. The same surface has to accept a
 * plain click to create a marker, so a drag would have to be told apart from a
 * click by timing and distance — the least reliable kind of interaction for this
 * repository's browser scripts to drive. A script that intermittently creates a
 * marker instead of moving one measures nothing either way.
 *
 * ── No coordinates are shown to the organizer ────────────────────────────────
 *
 * A stated product principle: the organizer taps a spot and never sees a number.
 * The percentages appear in data attributes for the browser scripts and nowhere a
 * person can read them.
 */

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_LONG_EDGE = 2400
const JPEG_QUALITY = 0.8

type AdminPin = {
  id: string
  type: 'BOOTH' | 'ROOM'
  x: number
  y: number
  label: string | null
  sponsorId: string | null
  sponsorName: string | null
  sponsorBoothNumber: string | null
}

type MapRow = {
  id: string
  name: string
  position: number
  markerCount: number
  /**
   * This app's own address for the map's picture. Finding F-19: before Phase 11
   * there was no such address, and neither an uploaded nor a seeded map could be
   * displayed here at all.
   */
  pictureUrl: string
  pins: AdminPin[]
}

type SponsorOption = {
  id: string
  name: string
  boothNumber: string | null
}

/** A marker being placed, before anything has been written. */
type Draft = {
  mapId: string
  x: number
  y: number
  type: 'BOOTH' | 'ROOM'
  sponsorId: string
  label: string
  /**
   * The booth number for the chosen company, typed while the marker is placed.
   *
   * It is NOT part of the marker. It is stored on the company record and written
   * by its own address, so a company pinned on two maps carries one number. It
   * rides along in this draft because the organizer is thinking about one stand
   * at one moment, and making them place a marker and then hunt for a second
   * screen is the gap this phase exists to close.
   *
   * Empty means "leave whatever the company already has" on save, not "clear it".
   * Clearing is done from the selected-marker form, where the current value is
   * visible and an organizer can see what they are removing.
   */
  boothNumber: string
}

/** What a marker shows on this screen. Mirrors the participant app's rule. */
function markerName(pin: AdminPin): string {
  return pin.sponsorName ?? pin.label ?? ''
}

export default function FloorPlanClient({
  maps,
  sponsors,
  conferenceName,
  crossAppLinkConfigured,
}: {
  maps: MapRow[]
  sponsors: SponsorOption[]
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
   * Markers as this browser knows them, for the same reason as removedIds above.
   *
   * A marker placed on the picture has to appear under the organizer's cursor
   * immediately; waiting for router.refresh() to come back looks exactly like the
   * click having missed.
   *
   * ── Each override remembers which server data it was built on ───────────────
   *
   * Raised by adversarial review round 1, as the most serious finding of the round.
   * This was `Record<string, AdminPin[]>` read as `pinEdits[map.id] ?? map.pins`,
   * so the first local write to a map shadowed the server's version of that map
   * FOREVER. Everything the server said afterwards was ignored: a second organizer
   * adding or deleting a marker never appeared, the marker count and the delete
   * warning could both undercount what actually existed, and trying to move a
   * marker somebody else had deleted showed an error while leaving the marker on
   * screen.
   *
   * `basedOn` holds the exact props array the override was computed from. The page
   * builds a fresh array on every server render, so the moment router.refresh()
   * delivers new data the identity differs, the override is ignored, and the server
   * wins. Until then the override applies, which is the whole point of having one.
   *
   * Nothing has to be cleaned up or expired: the reconciliation is the comparison.
   */
  const [pinEdits, setPinEdits] = useState<Record<string, { basedOn: AdminPin[]; pins: AdminPin[] }>>({})

  /**
   * Booth numbers changed in this browser, by company id, shown straight away.
   *
   * Same reason as pinEdits above: the server props are re-read on refresh, and
   * between the save landing and the refresh arriving the organizer would still
   * be reading the old number in the company picker — which looks exactly like a
   * save that did not take.
   *
   * Keyed by company rather than by marker on purpose. The number lives on the
   * company, so a company pinned on two maps must show the new value on both the
   * moment it changes. Keying by marker would update the one that was edited and
   * leave its twin disagreeing with it on the same screen.
   *
   * `null` is a real value here, not an absence — it means the organizer cleared
   * the number.
   *
   * ── It carries the value it replaced, and retires against it ─────────────────
   *
   * `basedOn` is what the server said this company's number was at the moment the
   * override was made. The override applies only while the server still says that.
   * As soon as the server says anything else the server wins — whether that is
   * this browser's own write arriving, or a second organizer's newer value.
   *
   * Review round 3 found the first version applying forever: it held the value
   * alone, so once an entry existed no refresh could ever replace it. Organizer A
   * sets Tailor ERP to `Z-01`, organizer B changes it to `P-03`, and A's screen
   * kept showing `Z-01` after every refresh until the page was reloaded — then
   * offered A a Save button comparing against the number A could see rather than
   * the one stored, which is how A would overwrite B without knowing. Recorded as
   * UF-27.
   *
   * Same shape and same reasoning as pinEdits above: nothing has to be cleaned up
   * or expired, because the reconciliation is the comparison.
   */
  const [boothEdits, setBoothEdits] = useState<
    Record<string, { basedOn: string | null; value: string | null }>
  >({})
  const pinsFor = (map: MapRow): AdminPin[] => {
    const override = pinEdits[map.id]
    return override && override.basedOn === map.pins ? override.pins : map.pins
  }
  const setPinsFor = (map: MapRow, next: AdminPin[]) =>
    setPinEdits(current => ({ ...current, [map.id]: { basedOn: map.pins, pins: next } }))

  const [editingMapId, setEditingMapId] = useState<string | null>(null)
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pinError, setPinError] = useState('')

  /**
   * What the organizer is told after a save, built from what ACTUALLY happened.
   *
   * ── Why this is not decided by whether ATTENDEE_APP_URL is set ─────────────
   *
   * It used to be. The screen read a flag meaning "the address is configured" and
   * said "Delegates can see it now" whenever it was true — regardless of whether
   * the notification had reached the participant app. With the address set and the
   * call timing out after three seconds, which is the one plausible bad-network
   * case, the organizer was told delegates could see a change that had not reached
   * them. On a stage that is a claim made to a room.
   *
   * Every write path now answers `delegatesNotified`, and this uses it.
   *
   * Neither wording mentions configuration or an error, because neither is the
   * organizer's problem: the save succeeded in both cases, and the only difference
   * is whether phones already have it. "Within a few minutes" is the honest
   * description of the 300-second cache the participant map read sits behind.
   */
  function reachNotice(what: string, delegatesNotified: boolean) {
    return delegatesNotified
      ? `${what} Delegates can see the change now.`
      : `${what} Delegates will see the change within a few minutes.`
  }

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
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'The map could not be saved.')
        return
      }
      setName('')
      if (fileRef.current) fileRef.current.value = ''
      setNotice(reachNotice('Map uploaded.', Boolean(body.delegatesNotified)))
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
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'The order could not be saved.')
        return
      }
      setNotice(reachNotice('Order saved.', Boolean(body.delegatesNotified)))
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
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'The map could not be deleted.')
        return
      }
      setRemovedIds(ids => [...ids, map.id])
      if (editingMapId === map.id) closeEditor()
      setNotice(reachNotice(`"${map.name}" deleted.`, Boolean(body.delegatesNotified)))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  // ── Marker placement, Phase 11 ─────────────────────────────────────────────

  function closeEditor() {
    setEditingMapId(null)
    setSelectedPinId(null)
    setDraft(null)
    setPinError('')
  }

  function openEditor(map: MapRow) {
    setError('')
    setNotice('')
    setPinError('')
    setSelectedPinId(null)
    setDraft(null)
    setEditingMapId(current => (current === map.id ? null : map.id))
  }

  /** Where on the picture the click landed, as a percentage of its size. */
  function positionFromClick(e: React.MouseEvent<HTMLElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    // Clamped rather than refused. A click one pixel outside the picture is a
    // person aiming at its edge, and the handler refuses anything beyond 0 to 100
    // anyway.
    return {
      x: Math.min(100, Math.max(0, x)),
      y: Math.min(100, Math.max(0, y)),
    }
  }

  async function onCanvasClick(map: MapRow, e: React.MouseEvent<HTMLElement>) {
    if (busy) return
    const at = positionFromClick(e)

    // A marker is selected, so this click moves it. The decision of 2026-08-03:
    // select, then tap the destination.
    if (selectedPinId) {
      await movePin(map, selectedPinId, at)
      return
    }

    setPinError('')
    setDraft({ mapId: map.id, x: at.x, y: at.y, type: 'BOOTH', sponsorId: '', label: '', boothNumber: '' })
  }

  async function movePin(map: MapRow, pinId: string, at: { x: number; y: number }) {
    setPinError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/floor-plan/maps/${map.id}/pins/${pinId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: at.x, y: at.y }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPinError(body.error ?? 'The marker could not be moved.')
        // A 404 means the marker is gone — deleted by somebody else, or its map was.
        // Showing the message and leaving it drawn is what round 1 objected to: the
        // organizer keeps looking at, and clicking, something that does not exist.
        // Reloading is what makes the screen tell the truth again.
        if (res.status === 404) {
          setSelectedPinId(null)
          router.refresh()
        }
        return
      }
      if (!body?.pin) {
        // A success with no marker in it should not be read as one. Reading
        // body.pin.x here would throw inside the click handler and leave the screen
        // stuck with the busy flag set.
        setPinError('The marker moved, but the app could not read the result. Reload to see where it is.')
        router.refresh()
        return
      }
      setPinsFor(map, pinsFor(map).map(p => (p.id === pinId ? { ...p, x: body.pin.x, y: body.pin.y } : p)))
      setSelectedPinId(null)
      setNoticeForPins(map, 'Marker moved.', Boolean(body.delegatesNotified))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  function setNoticeForPins(_map: MapRow, message: string, delegatesNotified: boolean) {
    setNotice(reachNotice(message, delegatesNotified))
  }

  async function saveDraft(map: MapRow) {
    if (!draft) return
    setPinError('')

    // The same rule the handler applies. Checked here so the organizer gets a
    // message before a request goes out, and there so a request that did not come
    // from this screen is refused too.
    if (draft.type === 'ROOM' && !draft.label.trim()) {
      setPinError('Type the room’s name.')
      return
    }
    if (draft.type === 'BOOTH' && !draft.sponsorId && !draft.label.trim()) {
      setPinError('Choose the company at this booth, or type a name for the marker.')
      return
    }

    // Held until after this function releases `busy`, because the booth number is
    // a second, separate write. See the note where it is applied, below.
    let pendingBooth: { sponsorId: string; value: string } | null = null

    setBusy(true)
    try {
      const res = await fetch(`/api/floor-plan/maps/${map.id}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: draft.type,
          x: draft.x,
          y: draft.y,
          sponsorId: draft.type === 'BOOTH' ? draft.sponsorId || null : null,
          label: draft.label.trim() || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPinError(body.error ?? 'The marker could not be saved.')
        // The map was removed while the marker was being saved. Nothing to draw and
        // nothing to keep the form open for.
        if (res.status === 404) {
          setDraft(null)
          router.refresh()
        }
        return
      }
      // ── Decided here, above the read-back branch, and deliberately so ────────
      //
      // Everything below this line is past the `!res.ok` guard, so the marker
      // PERSISTED. The booth number is a write against the company and needs
      // nothing from the saved marker — not its id, not its position — so it must
      // be applied on every path where the marker landed, including the one where
      // the response could not be read back.
      //
      // Adversarial review round 2 found it assigned after that branch's early
      // return, so a 2xx carrying no `pin` cleared the draft, told the organizer
      // the marker was saved, and dropped the booth number typed with it without
      // saying so. Recorded as UF-22.
      //
      // Only when something was typed. An empty box means "leave the number this
      // company already has", not "clear it" — clearing is done from the selected
      // marker, where the current value is on screen and the organizer can see
      // what they are removing.
      if (draft.type === 'BOOTH' && draft.sponsorId && draft.boothNumber.trim()) {
        pendingBooth = { sponsorId: draft.sponsorId, value: draft.boothNumber }
      }

      // ── if/else rather than an early return, and that is the whole point ──────
      //
      // Review round 3 caught the first attempt at UF-22 being no fix at all.
      // Recording `pendingBooth` above a `return` changes nothing, because a
      // `return` inside this `try` leaves the FUNCTION once `finally` has run — so
      // the booth-number write at the end of the function was still skipped on
      // exactly the path the fix was meant to cover. Branching instead of
      // returning lets both paths reach it.
      if (!body?.pin) {
        setPinError('The marker was saved, but the app could not read it back. Reload to see it.')
        setDraft(null)
        router.refresh()
      } else {
        const saved: AdminPin = {
          id: body.pin.id,
          type: body.pin.type === 'ROOM' ? 'ROOM' : 'BOOTH',
          x: body.pin.x,
          y: body.pin.y,
          label: body.pin.label ?? null,
          sponsorId: body.pin.sponsorId ?? null,
          sponsorName: body.pin.sponsor?.name ?? null,
          sponsorBoothNumber: body.pin.sponsor?.boothNumber ?? null,
        }
        setPinsFor(map, [...pinsFor(map), saved])
        setDraft(null)
        setNoticeForPins(map, draft.type === 'ROOM' ? 'Room marker placed.' : 'Booth marker placed.', Boolean(body.delegatesNotified))
        router.refresh()
      }
    } finally {
      setBusy(false)
    }

    // ── Two writes, in sequence, deliberately not nested ────────────────────
    //
    // The marker and the booth number are separate records with separate
    // addresses: the marker belongs to a map, the number belongs to the company.
    // Folding them into one request would mean a marker address that edits a
    // company, and a company pinned on two maps would then have two markers each
    // able to claim its number.
    //
    // Applied after the block above has released `busy`, because the booth-number
    // save sets and clears `busy` itself. Calling it inside would have the inner
    // clear run first and leave the screen interactive while the outer save was
    // still in flight.
    //
    // If this second write fails it says so and the marker stays. That is the
    // right way round: the marker is placed and correct, and the number can be
    // supplied from the marker that is now on screen. The reverse — discarding a
    // placed marker because a stand number was rejected — would throw away work
    // the organizer had already completed.
    if (pendingBooth) {
      await saveBoothNumber(pendingBooth.sponsorId, pendingBooth.value)
    }
  }

  /**
   * The companies, with any booth number changed in this browser applied.
   *
   * Everything below reads this rather than the `sponsors` prop, so the picker,
   * the selected-marker form and the draft form cannot disagree about a number
   * one of them just changed.
   */
  const sponsorsNow: SponsorOption[] = sponsors.map(s => {
    const edit = boothEdits[s.id]
    if (!edit) return s
    // The server has moved on from the value this override replaced, so it knows
    // something this browser does not. Show the server's answer.
    if (edit.basedOn !== (s.boothNumber ?? null)) return s
    return { ...s, boothNumber: edit.value }
  })

  /**
   * Set or clear one company's booth number.
   *
   * Returns whether it landed, so a caller placing a marker can decide what to do
   * next rather than guessing.
   *
   * ── Why this is its own address and not part of the marker save ─────────────
   *
   * The number is on the company, not the marker. Folding it into the marker
   * write would mean a marker address that edits a company, and a company pinned
   * twice would then have two markers each able to claim the number.
   */
  async function saveBoothNumber(sponsorId: string, raw: string): Promise<boolean> {
    const checked = validateBoothNumber(raw)
    if (!checked.ok) {
      setPinError(checked.error)
      return false
    }

    setBusy(true)
    try {
      const res = await fetch(`/api/floor-plan/sponsors/${sponsorId}/booth-number`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothNumber: checked.value }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPinError(body.error ?? 'The booth number could not be saved.')
        return false
      }

      const saved: string | null = body.sponsor?.boothNumber ?? null
      // The value the server stored, not the value that was typed. They differ
      // whenever trimming applied, and showing what was typed would tell the
      // organizer something the database does not say.
      //
      // `basedOn` reads the server prop rather than the override-applied list, so
      // it records what the SERVER last said and the override retires the moment
      // that changes. Reading sponsorsNow here would compare an override against
      // itself and never retire.
      const serverValue = sponsors.find(s => s.id === sponsorId)?.boothNumber ?? null
      setBoothEdits(current => ({
        ...current,
        [sponsorId]: { basedOn: serverValue, value: saved },
      }))
      setNotice(
        reachNotice(
          saved ? `Booth number set to ${saved}.` : 'Booth number cleared.',
          Boolean(body.delegatesNotified),
        ),
      )
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function editPin(map: MapRow, pin: AdminPin, changes: { sponsorId?: string | null; label?: string | null }) {
    setPinError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/floor-plan/maps/${map.id}/pins/${pin.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPinError(body.error ?? 'The marker could not be changed.')
        if (res.status === 404) {
          setSelectedPinId(null)
          router.refresh()
        }
        return
      }
      if (!body?.pin) {
        setPinError('The change was saved, but the app could not read it back. Reload to see it.')
        setSelectedPinId(null)
        router.refresh()
        return
      }
      setPinsFor(
        map,
        pinsFor(map).map(p =>
          p.id === pin.id
            ? {
                ...p,
                label: body.pin.label ?? null,
                sponsorId: body.pin.sponsorId ?? null,
                sponsorName: body.pin.sponsor?.name ?? null,
                sponsorBoothNumber: body.pin.sponsor?.boothNumber ?? null,
              }
            : p,
        ),
      )
      setNoticeForPins(map, 'Marker updated.', Boolean(body.delegatesNotified))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function deletePin(map: MapRow, pin: AdminPin) {
    setPinError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/floor-plan/maps/${map.id}/pins/${pin.id}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPinError(body.error ?? 'The marker could not be deleted.')
        // Already gone. The organizer asked for it to not exist and it does not, so
        // the screen should agree rather than keep showing it beside an error.
        if (res.status === 404) {
          setSelectedPinId(null)
          router.refresh()
        }
        return
      }
      setPinsFor(map, pinsFor(map).filter(p => p.id !== pin.id))
      setSelectedPinId(null)
      setNoticeForPins(map, 'Marker deleted.', Boolean(body.delegatesNotified))
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
            {visibleMaps.map((m, i) => {
              const pins = pinsFor(m)
              const count = pins.length
              return (
                <li key={m.id} data-testid="map-row" data-map-id={m.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-sm tabular-nums text-gray-400">{m.position}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900" data-testid="map-row-name">{m.name}</p>
                      <p className="text-xs text-gray-500" data-testid="map-row-markers">
                        {count === 0 ? 'No markers yet' : `${count} marker${count === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {/* ── Why this button says "Show map" and not "Markers" ──────────
                        The picture of the venue is not on this screen; it is inside
                        the panel this button opens. So the button's job is to reveal
                        the map, and its old label named the thing an organizer would
                        do NEXT rather than what pressing it does.

                        Renamed 2026-08-04. The old label named a task rather than
                        an action, and there is no picture anywhere else on this
                        screen, so a reader who does not recognise the label never
                        reaches a map at all.

                        The closed and open words are a matched pair, "Show map" and
                        "Hide map", set on the same date. It read "Done" while open,
                        which describes finishing rather than what the press does and
                        left the two halves of one button speaking differently. Both
                        words now name the same action in opposite directions.

                        The accessible name is kept in step with the visible text on
                        purpose. Someone driving the screen by voice says the words
                        they can see, so an accessible name that said "Place markers"
                        while the button read "Show map" would not respond to either. */}
                    <button
                      type="button"
                      data-testid="edit-markers"
                      onClick={() => openEditor(m)}
                      disabled={busy}
                      className="rounded border border-gray-200 px-2 py-1 text-xs disabled:opacity-40"
                      aria-label={editingMapId === m.id ? `Hide map for ${m.name}` : `Show map for ${m.name}`}
                    >
                      {editingMapId === m.id ? 'Hide map' : 'Show map'}
                    </button>
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
                    <DeleteButton map={m} markerCount={count} busy={busy} onConfirm={() => remove(m)} />
                  </div>

                  {editingMapId === m.id && (
                    <MarkerEditor
                      map={m}
                      pins={pins}
                      // The override-applied list, not the server prop, so a
                      // number changed a moment ago is already shown here.
                      sponsors={sponsorsNow}
                      busy={busy}
                      selectedPinId={selectedPinId}
                      draft={draft && draft.mapId === m.id ? draft : null}
                      pinError={pinError}
                      onCanvasClick={e => onCanvasClick(m, e)}
                      onSelectPin={id => {
                        setPinError('')
                        setDraft(null)
                        setSelectedPinId(current => (current === id ? null : id))
                      }}
                      onDraftChange={next => setDraft(next)}
                      onDraftCancel={() => {
                        setDraft(null)
                        setPinError('')
                      }}
                      onDraftSave={() => saveDraft(m)}
                      onEditPin={(pin, changes) => editPin(m, pin, changes)}
                      onDeletePin={pin => deletePin(m, pin)}
                      onSetBoothNumber={saveBoothNumber}
                    />
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}

function DeleteButton({
  map,
  markerCount,
  busy,
  onConfirm,
}: {
  map: MapRow
  markerCount: number
  busy: boolean
  onConfirm: () => void
}) {
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
        {markerCount > 0 ? `Delete with ${markerCount} marker${markerCount === 1 ? '' : 's'}?` : 'Delete?'}
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

/**
 * The picture with its markers, and the form for whichever marker is in hand.
 *
 * Phase 11. The picture comes from this app's own guarded address — finding F-19
 * records that before that address existed nothing could be shown here.
 */
function MarkerEditor({
  map,
  pins,
  sponsors,
  busy,
  selectedPinId,
  draft,
  pinError,
  onCanvasClick,
  onSelectPin,
  onDraftChange,
  onDraftCancel,
  onDraftSave,
  onEditPin,
  onDeletePin,
  onSetBoothNumber,
}: {
  map: MapRow
  pins: AdminPin[]
  sponsors: SponsorOption[]
  busy: boolean
  selectedPinId: string | null
  draft: Draft | null
  pinError: string
  onCanvasClick: (e: React.MouseEvent<HTMLElement>) => void
  onSelectPin: (id: string) => void
  onDraftChange: (next: Draft) => void
  onDraftCancel: () => void
  onDraftSave: () => void
  onEditPin: (pin: AdminPin, changes: { sponsorId?: string | null; label?: string | null }) => void
  onDeletePin: (pin: AdminPin) => void
  /** Set or clear a company's booth number. Resolves to whether it landed. */
  onSetBoothNumber: (sponsorId: string, value: string) => Promise<boolean>
}) {
  const selected = pins.find(p => p.id === selectedPinId) ?? null

  /**
   * The company chosen in the draft form, or null when there is none.
   *
   * Resolved once rather than looked up separately for the placeholder and the
   * helper line. Adversarial review round 2 found the two lookups could disagree
   * with each other's assumptions: both fell back when the id matched nothing,
   * and the form then offered a booth-number box for a company deleted in
   * another tab, telling the organizer it "has no booth number yet" about a
   * company that no longer exists. Null here means the box is not offered at
   * all, which is the same rule as having chosen nothing. Recorded as UF-21.
   */
  const draftCompany = draft?.sponsorId ? sponsors.find(s => s.id === draft.sponsorId) ?? null : null

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3" data-testid="marker-editor" data-map-id={map.id}>
      <p className="text-xs text-gray-600" data-testid="marker-instructions">
        {selected
          ? 'Click the map to move this marker, or change it below.'
          : draft
            ? 'Fill in the marker below, then save it.'
            : 'Click the map to place a marker. Click a marker to select it.'}
      </p>

      <div
        data-testid="marker-canvas"
        onClick={onCanvasClick}
        className="relative mt-2 w-full cursor-crosshair overflow-hidden rounded border border-gray-300 bg-white"
      >
        {/* A plain img tag, not next/image. The address is dynamic, behind a
            permission check, and answers a private cache instruction; the
            optimizer adds a second fetch path and a second cache for no gain
            here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={map.pictureUrl}
          alt={`${map.name} floor plan`}
          data-testid="marker-image"
          className="block w-full select-none"
          draggable={false}
        />

        {pins.map(pin => {
          const isSelected = pin.id === selectedPinId
          return (
            <button
              key={pin.id}
              type="button"
              data-testid="admin-pin"
              data-pin-id={pin.id}
              data-pin-type={pin.type}
              data-pin-x={pin.x}
              data-pin-y={pin.y}
              data-pin-label={markerName(pin)}
              data-pin-selected={isSelected ? 'true' : 'false'}
              aria-label={`${pin.type === 'BOOTH' ? 'Booth' : 'Room'} marker: ${markerName(pin)}`}
              onClick={e => {
                // Without this the click also reaches the picture underneath,
                // which would select the marker and immediately move it to where
                // it already is.
                e.stopPropagation()
                onSelectPin(pin.id)
              }}
              style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2 py-0.5 text-[10px] font-semibold shadow ${
                isSelected
                  ? 'border-blue-700 bg-blue-600 text-white'
                  : pin.type === 'BOOTH'
                    ? 'border-primary bg-white text-primary'
                    : 'border-gray-500 bg-white text-gray-700'
              }`}
            >
              {/* break-all so a long unbroken room name wraps inside the marker
                  rather than stretching it across the map. Phase 9's review round 2
                  measured the booth card overflowing at 390 pixels, and a room name
                  is the first organizer-typed text to reach this screen. */}
              <span className="block max-w-[9rem] break-all">{markerName(pin)}</span>
            </button>
          )
        })}

        {draft && (
          <span
            data-testid="draft-pin"
            data-pin-x={draft.x}
            data-pin-y={draft.y}
            style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-amber-600 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900"
          >
            New
          </span>
        )}
      </div>

      {pinError && (
        <p data-testid="pin-error" className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
          {pinError}
        </p>
      )}

      {draft && (
        <div className="mt-3 rounded border border-gray-200 bg-white p-3" data-testid="draft-form">
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="draft-type-booth"
              onClick={() => onDraftChange({ ...draft, type: 'BOOTH' })}
              className={`rounded border px-2 py-1 text-xs ${
                draft.type === 'BOOTH' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200'
              }`}
            >
              Booth
            </button>
            <button
              type="button"
              data-testid="draft-type-room"
              // The chosen company is KEPT when switching to Room, and this is
              // deliberate. It used to be cleared here, which meant picking a
              // company, glancing at Room, and coming back lost the choice with
              // no warning — reported during the 2026-08-05 acceptance run.
              //
              // Nothing incorrect reaches the database as a result: saveDraft
              // already sends `sponsorId` as null for a room marker, and the
              // validator refuses a room that arrives carrying a company. So the
              // clearing was protecting nothing and costing the organizer their
              // work. Switching back to Booth now finds the company still
              // selected, and the typed room name is likewise still there — the
              // Booth direction never cleared it, which is what made the old
              // behaviour feel arbitrary rather than like a rule.
              onClick={() => onDraftChange({ ...draft, type: 'ROOM' })}
              className={`rounded border px-2 py-1 text-xs ${
                draft.type === 'ROOM' ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200'
              }`}
            >
              Room
            </button>
          </div>

          {draft.type === 'BOOTH' ? (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600">Company at this booth</label>
              <select
                data-testid="draft-sponsor"
                value={draft.sponsorId}
                // Changing the company CLEARS the typed booth number, and this is
                // the opposite of the Booth/Room toggle above, which keeps what was
                // entered. The difference is what the value belongs to. A room name
                // belongs to the marker, so it survives; a booth number belongs to
                // the company, so it cannot follow the picker to a different one.
                //
                // Adversarial review round 2 found this as the draft-form twin of
                // round 1's UF-19: choose company A, type `A-01`, switch the picker
                // to company B, press Save marker, and `A-01` was written onto
                // company B. Recorded as UF-20.
                onChange={e => onDraftChange({ ...draft, sponsorId: e.target.value, boothNumber: '' })}
                className="form-input mt-1 w-full text-sm"
              >
                <option value="">Choose a company…</option>
                {sponsors.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.boothNumber ? `${s.name} — booth ${s.boothNumber}` : `${s.name} — no booth number yet`}
                  </option>
                ))}
              </select>

              {/* Only once a company is chosen, because there is nowhere to put
                  a number without one: it is stored on the company record, and a
                  booth marker may legitimately have a typed name and no company.
                  Showing an always-present box would invite an organizer to type
                  a number that had nothing to attach to. */}
              {draftCompany && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600">
                    Booth number
                  </label>
                  <input
                    data-testid="draft-booth-number"
                    value={draft.boothNumber}
                    maxLength={MAX_BOOTH_NUMBER_LENGTH}
                    onChange={e => onDraftChange({ ...draft, boothNumber: e.target.value })}
                    placeholder={draftCompany.boothNumber ?? 'B-01'}
                    className="form-input mt-1 w-full text-sm"
                  />
                  {/* Two different sentences, because the two situations lead an
                      organizer to different actions. With a number already set,
                      leaving this empty keeps it — so say so, or they will retype
                      a value they did not need to. With none set, this is the one
                      place the gap gets closed. */}
                  <p className="mt-1 text-xs text-gray-500">
                    {draftCompany.boothNumber
                      ? 'Leave empty to keep the number this company already has.'
                      : 'This company has no booth number yet. Delegates will see its name instead.'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600">Room name</label>
              <input
                data-testid="draft-label"
                value={draft.label}
                maxLength={MAX_LABEL_LENGTH}
                onChange={e => onDraftChange({ ...draft, label: e.target.value })}
                placeholder="Ballroom A"
                className="form-input mt-1 w-full text-sm"
              />
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              data-testid="draft-save"
              onClick={onDraftSave}
              disabled={busy}
              className="btn-primary text-xs disabled:opacity-40"
            >
              {busy ? 'Working…' : 'Save marker'}
            </button>
            <button
              type="button"
              data-testid="draft-cancel"
              onClick={onDraftCancel}
              className="rounded border border-gray-200 px-2 py-1 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {selected && !draft && (
        // key on the marker's id AND its company: this form keeps the room name
        // and the booth number in its own state, and without a key React would
        // reuse the instance when a different marker is selected, leaving the
        // previous marker's values in the inputs.
        //
        // The company is part of the key, not just the marker id. Adversarial
        // review round 1 found that keying on the id alone let a booth number
        // survive a change of company on the SAME marker: select a marker for
        // company A showing A-01, switch the dropdown to company B which has no
        // number, press Save, and A-01 is written onto company B. The marker id
        // never changed, so React kept the state, and the number followed the
        // form rather than the company it belonged to.
        <SelectedPinForm
          key={`${selected.id}:${selected.sponsorId ?? ''}`}
          pin={selected}
          sponsors={sponsors}
          busy={busy}
          onEdit={changes => onEditPin(selected, changes)}
          onDelete={() => onDeletePin(selected)}
          onSetBoothNumber={onSetBoothNumber}
        />
      )}
    </div>
  )
}

function SelectedPinForm({
  pin,
  sponsors,
  busy,
  onEdit,
  onDelete,
  onSetBoothNumber,
}: {
  pin: AdminPin
  sponsors: SponsorOption[]
  busy: boolean
  onEdit: (changes: { sponsorId?: string | null; label?: string | null }) => void
  onDelete: () => void
  onSetBoothNumber: (sponsorId: string, value: string) => Promise<boolean>
}) {
  const [label, setLabel] = useState(pin.label ?? '')
  const [armed, setArmed] = useState(false)

  /**
   * The company this marker points at, read from the list rather than from the
   * marker.
   *
   * The marker carries a copy of the booth number from when the page was
   * rendered. The list carries any change made since. Reading the marker's copy
   * would show the old number straight after the organizer changed it, which
   * reads as a save that did not take — the same misreading the pinEdits override
   * in the parent exists to prevent.
   */
  const company = pin.sponsorId ? sponsors.find(s => s.id === pin.sponsorId) ?? null : null

  // Seeded from the stored value so the box shows what is there, and reset by the
  // `key` on this component whenever a different marker is selected.
  const [boothNumber, setBoothNumberField] = useState(company?.boothNumber ?? '')

  return (
    <div className="mt-3 rounded border border-blue-200 bg-white p-3" data-testid="selected-pin-form" data-pin-id={pin.id}>
      <p className="text-xs font-medium text-gray-900" data-testid="selected-pin-name">
        {pin.type === 'BOOTH' ? 'Booth marker' : 'Room marker'}: {markerName(pin)}
      </p>

      {pin.type === 'BOOTH' ? (
        <div className="mt-2">
          <label className="block text-xs font-medium text-gray-600">Company at this booth</label>
          <select
            data-testid="selected-pin-sponsor"
            value={pin.sponsorId ?? ''}
            disabled={busy}
            onChange={e => onEdit({ sponsorId: e.target.value || null })}
            className="form-input mt-1 w-full text-sm"
          >
            <option value="">Choose a company…</option>
            {sponsors.map(s => (
              <option key={s.id} value={s.id}>
                {s.boothNumber ? `${s.name} — booth ${s.boothNumber}` : `${s.name} — no booth number yet`}
              </option>
            ))}
          </select>
          {/* ── The gap this phase closes ──────────────────────────────────
              A marker could be saved with a company that has no booth number,
              and the organizer had no screen to supply one — the number was
              editable only inside that company's own portal. Reported during the
              2026-08-05 acceptance run.

              Saved by its own button rather than on every keystroke. This writes
              a company record that several screens read, so a save per character
              would put a dozen half-typed stand numbers on delegates' phones on
              the way to the real one. */}
          {company && (
            <div className="mt-2" data-testid="selected-pin-booth">
              <label className="block text-xs font-medium text-gray-600">Booth number</label>
              <div className="mt-1 flex gap-2">
                <input
                  data-testid="selected-pin-booth-input"
                  value={boothNumber}
                  maxLength={MAX_BOOTH_NUMBER_LENGTH}
                  disabled={busy}
                  onChange={e => setBoothNumberField(e.target.value)}
                  placeholder="B-01"
                  className="form-input w-full text-sm"
                />
                <button
                  type="button"
                  data-testid="selected-pin-booth-save"
                  // Compared after trimming, because the stored value is trimmed.
                  // Without this, a trailing space would look like a change, send
                  // a request, and store exactly what was already there.
                  disabled={busy || boothNumber.trim() === (company.boothNumber ?? '')}
                  onClick={() => onSetBoothNumber(company.id, boothNumber)}
                  className="btn-primary shrink-0 text-xs disabled:opacity-40"
                >
                  Save
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {company.boothNumber
                  ? 'Delegates see this number on the map.'
                  : 'No booth number yet — delegates see the company name instead.'}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <label className="block text-xs font-medium text-gray-600">Room name</label>
          <div className="mt-1 flex gap-2">
            <input
              data-testid="selected-pin-label"
              value={label}
              maxLength={MAX_LABEL_LENGTH}
              disabled={busy}
              onChange={e => setLabel(e.target.value)}
              className="form-input w-full text-sm"
            />
            <button
              type="button"
              data-testid="selected-pin-label-save"
              onClick={() => onEdit({ label })}
              disabled={busy}
              className="btn-primary shrink-0 text-xs disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        {!armed ? (
          <button
            type="button"
            data-testid="delete-pin"
            onClick={() => setArmed(true)}
            disabled={busy}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-40"
          >
            Delete marker
          </button>
        ) : (
          <span className="flex items-center gap-1">
            <span className="text-xs text-gray-500">Delete this marker?</span>
            <button
              type="button"
              data-testid="delete-pin-confirm"
              onClick={onDelete}
              disabled={busy}
              className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-40"
            >
              Yes
            </button>
            <button
              type="button"
              data-testid="delete-pin-cancel"
              onClick={() => setArmed(false)}
              className="rounded border border-gray-200 px-2 py-1 text-xs"
            >
              No
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
