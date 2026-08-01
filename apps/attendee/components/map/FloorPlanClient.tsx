'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFloorPlanData } from '@/lib/hooks'
import type { FloorPlanMap, FloorPlanPin } from '@/lib/floor-plan-data'

/**
 * The participant's venue map: a picture with markers on top of it, which the
 * delegate can zoom and pan.
 *
 * ── The one layout rule everything else depends on ───────────────────────────
 *
 * Marker positions are stored as percentages of the picture, so the marker
 * layer has to be EXACTLY the picture's box. If the layer were larger — a
 * container with the picture letterboxed inside it — a marker at 50% would sit
 * at the middle of the container rather than the middle of the picture, and
 * every marker would drift by a different amount at every screen size.
 *
 * That is why the moving layer carries the picture's own proportions and the
 * picture fills it completely: the layer's box IS the picture's box by
 * construction rather than by arithmetic. The Phase 8 browser check asserts the
 * two match within a pixel, at three screen sizes and at more than one zoom
 * level.
 *
 * ── Why the markers do not scale with the map (finding F-9) ──────────────────
 *
 * The pictures are 1600 pixels wide and are shown at 366 on a phone, so the
 * text drawn into the map renders at about 4.6 pixels and cannot be read. The
 * marker labels therefore carry the meaning and are sized for a person, which
 * on a 366-pixel picture makes a label about as wide as the room it names.
 * Measured: 6 of 15 room labels sat on top of something else at that width.
 *
 * Scaling the markers along with the picture would have magnified the problem
 * rather than solved it — a label would cover the same share of the map at
 * every zoom level. So the moving layer is scaled and each marker is scaled
 * back by the same factor, which keeps it a constant size on screen while the
 * map grows underneath it. That is what makes zooming declutter.
 *
 * ── Why the label does not live in the marker's box ──────────────────────────
 *
 * A room marker shows its name. If that text were a normal child, it would make
 * the marker wider and shift the marker's centre away from the point it marks.
 * The label is therefore absolutely positioned against the marker, so it is
 * visible without being part of the marker's box.
 */

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2

/**
 * How far a finger may travel and still count as a tap rather than a drag.
 * Below this the map does not move and the tap reaches whatever is under it.
 */
const TAP_SLOP = 8

/** The maps are drawn 4:3; this is only the placeholder until one loads. */
const FALLBACK_ASPECT = 4 / 3

type Transform = { scale: number; x: number; y: number }
const AT_REST: Transform = { scale: 1, x: 0, y: 0 }

function Marker({ pin, index, scale }: { pin: FloorPlanPin; index: number; scale: number }) {
  const isBooth = pin.type === 'BOOTH'
  const boothNumber = pin.sponsor?.boothNumber ?? null

  return (
    <button
      type="button"
      data-testid="pin"
      data-pin-type={pin.type}
      data-pin-label={pin.label}
      data-pin-x={pin.x}
      data-pin-y={pin.y}
      data-pin-sponsor={pin.sponsor?.id ?? ''}
      aria-label={isBooth ? `Booth: ${pin.label}` : `Room: ${pin.label}`}
      style={{
        left: `${pin.x}%`,
        top: `${pin.y}%`,
        zIndex: 10 + index,
        // Scaled back by exactly the factor the map is scaled by, so the marker
        // is the same size on screen at every zoom level. The translate is
        // applied in the element's own unscaled units, so the centre lands on
        // the point regardless of the scale beside it.
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
      }}
      // 44 by 44 is the smallest target a thumb hits reliably, and ADR 0007
      // accepts a generous target as the price of a marker being a point rather
      // than an area. The visible dot inside is smaller; the button is the part
      // that must be forgiving.
      className="absolute h-11 w-11 flex items-center justify-center
                 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {isBooth ? (
        <span
          className="flex h-7 min-w-7 items-center justify-center rounded-full bg-primary px-1.5
                     text-[10px] font-semibold leading-none text-white shadow-md ring-2 ring-white"
        >
          {boothNumber ?? '•'}
        </span>
      ) : (
        <span className="h-3.5 w-3.5 rounded-full bg-ink shadow-md ring-2 ring-white" />
      )}

      {!isBooth && (
        <span
          data-testid="pin-label"
          // Absolutely positioned so it does not widen the button. Kept on one
          // line so a two-word room name cannot wrap and overlap its neighbour.
          className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap
                     rounded bg-white/95 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-ink shadow-sm"
        >
          {pin.label}
        </span>
      )}
    </button>
  )
}

export function FloorPlanClient() {
  const { data, isLoading, isError, error } = useFloorPlanData()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [transform, setTransform] = useState<Transform>(AT_REST)
  const [aspect, setAspect] = useState<number>(FALLBACK_ASPECT)

  const viewportRef = useRef<HTMLDivElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  // Live pointers, keyed by the browser's pointer id, so one finger pans and
  // two pinch without the two paths interfering.
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const gesture = useRef<{ distance: number; scale: number; midX: number; midY: number } | null>(null)
  const panFrom = useRef<{ x: number; y: number; tx: number; ty: number; dragging: boolean } | null>(null)
  // The current transform, mirrored outside React state. The gesture handlers
  // need to read it and write it in the same tick; doing that through a state
  // updater meant putting side effects inside the updater, which is how the
  // first version came to throw.
  const transformRef = useRef<Transform>(AT_REST)

  const applyTransform = useCallback((next: Transform) => {
    transformRef.current = next
    setTransform(next)
  }, [])

  const maps: FloorPlanMap[] = useMemo(() => data?.maps ?? [], [data])
  // The first map in stored order is what a delegate sees on arrival; the
  // ordering itself is the database's, not this component's.
  const active = useMemo(
    () => maps.find(m => m.id === selectedId) ?? maps[0] ?? null,
    [maps, selectedId],
  )

  /**
   * Keep the map covering the viewport. Because the smallest scale is exactly
   * fit-to-width, the picture is never smaller than the space it is given, so
   * the rule is simply that neither edge may come inside the viewport.
   */
  const clamp = useCallback((next: Transform): Transform => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next.scale))
    const box = viewportRef.current?.getBoundingClientRect()
    if (!box) return { scale, x: 0, y: 0 }
    const overflowX = box.width * (scale - 1)
    const overflowY = box.height * (scale - 1)
    return {
      scale,
      x: Math.min(0, Math.max(-overflowX, next.x)),
      y: Math.min(0, Math.max(-overflowY, next.y)),
    }
  }, [])

  /** Zoom to `nextScale` while holding the point under the fingers still. */
  const zoomAround = useCallback((nextScale: number, clientX: number, clientY: number) => {
    const box = viewportRef.current?.getBoundingClientRect()
    if (!box) return
    const current = transformRef.current
    const px = clientX - box.left
    const py = clientY - box.top
    // Where that screen point sits on the map, before the zoom.
    const worldX = (px - current.x) / current.scale
    const worldY = (py - current.y) / current.scale
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
    applyTransform(clamp({ scale, x: px - worldX * scale, y: py - worldY * scale }))
  }, [clamp, applyTransform])

  // Native listeners rather than React's, so the element itself owns the
  // gestures and `passive: false` can be set — without it the browser scrolls
  // the page instead and preventDefault is ignored.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    // Both of these return null rather than assuming two pointers are present.
    // The first version destructured the map's values unconditionally, and a
    // pointer removed between one event and the next left the second undefined,
    // which threw in the page. Caught by the browser check's page-error
    // assertion, not by anything failing to work.
    const midpoint = () => {
      const all = [...pointers.current.values()]
      if (all.length < 2) return null
      return { x: (all[0].x + all[1].x) / 2, y: (all[0].y + all[1].y) / 2 }
    }
    const spread = () => {
      const all = [...pointers.current.values()]
      if (all.length < 2) return null
      return Math.hypot(all[0].x - all[1].x, all[0].y - all[1].y)
    }

    const capture = (pointerId: number) => {
      try {
        if (!el.hasPointerCapture(pointerId)) el.setPointerCapture(pointerId)
      } catch {
        // Capture can be refused for a pointer that is already gone. Losing it
        // is not fatal — the gesture behaves as it did before capture existed.
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      // DELIBERATELY NOT CAPTURED HERE. Capturing on the way down retargets the
      // eventual click to this element, which would swallow taps meant for the
      // marker buttons inside it — and tapping a booth marker is the whole of
      // Phase 9. Raised by adversarial review round 2 as a high finding.
      //
      // Capture is taken at the moment a gesture becomes a real drag or a
      // pinch, which is the only time it is needed: to keep receiving events
      // from a finger that has crossed the edge of this clipped window. A tap
      // never reaches that point, so a tap is never intercepted.
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.current.size === 1) {
        const current = transformRef.current
        panFrom.current = { x: e.clientX, y: e.clientY, tx: current.x, ty: current.y, dragging: false }
        gesture.current = null
      } else if (pointers.current.size === 2) {
        panFrom.current = null
        const mid = midpoint()
        const distance = spread()
        gesture.current =
          mid && distance !== null
            ? { distance, scale: transformRef.current.scale, midX: mid.x, midY: mid.y }
            : null
        // Two fingers is unambiguously a pinch, never a tap, so capture both
        // straight away.
        if (gesture.current) for (const id of pointers.current.keys()) capture(id)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.current.size >= 2 && gesture.current) {
        e.preventDefault()
        const start = gesture.current
        const now = spread()
        if (now !== null && start.distance > 0) {
          zoomAround((now / start.distance) * start.scale, start.midX, start.midY)
        }
        return
      }

      if (pointers.current.size === 1 && panFrom.current) {
        const from = panFrom.current
        const travelled = Math.hypot(e.clientX - from.x, e.clientY - from.y)

        // A TAP IS NOT A DRAG. Below this distance nothing happens: the map does
        // not move, preventDefault is not called, and no capture is taken, so
        // the click reaches whatever was tapped — which for a booth marker is
        // the whole of Phase 9. Raised by adversarial review round 2: without a
        // threshold, a single pixel of wobble during a tap entered the drag path
        // and cancelled the tap.
        if (!from.dragging && travelled < TAP_SLOP) return

        if (!from.dragging) {
          from.dragging = true
          capture(e.pointerId)
        }

        e.preventDefault()
        applyTransform(
          clamp({
            scale: transformRef.current.scale,
            x: from.tx + (e.clientX - from.x),
            y: from.ty + (e.clientY - from.y),
          }),
        )
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      try {
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
      } catch {
        // Releasing a capture that is already gone is not an error worth acting on.
      }
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) gesture.current = null
      if (pointers.current.size === 0) panFrom.current = null
    }

    // If a lift is missed entirely — the browser hands the pointer to something
    // else, or the element is removed mid-gesture — the pointer would otherwise
    // stay in the map for ever and the next touch would be read as a second
    // finger. This is the only cleanup path that cannot be skipped.
    const onLostCapture = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) gesture.current = null
      if (pointers.current.size === 0) panFrom.current = null
    }

    // A trackpad pinch arrives as a wheel event with the control key set. Plain
    // wheel is left alone so the page still scrolls normally over the map.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoomAround(transformRef.current.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX, e.clientY)
    }

    const onDoubleClick = (e: MouseEvent) => {
      e.preventDefault()
      zoomAround(
        transformRef.current.scale > 1 ? MIN_SCALE : DOUBLE_TAP_SCALE,
        e.clientX,
        e.clientY,
      )
    }

    // NOTE: pointerleave is deliberately NOT treated as a lift. With the pointer
    // captured, a finger crossing the edge of the window keeps sending events
    // here, and ending the gesture on leave would cancel exactly the drag the
    // capture exists to preserve. A finger that genuinely goes away arrives as
    // pointerup, pointercancel, or lostpointercapture.
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('lostpointercapture', onLostCapture)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('dblclick', onDoubleClick)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('lostpointercapture', onLostCapture)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('dblclick', onDoubleClick)
      // Leaving stale pointers behind would make the next touch read as a
      // second finger and start a pinch that never ends.
      pointers.current.clear()
      gesture.current = null
      panFrom.current = null
    }
  }, [clamp, zoomAround, active?.id])

  // ── The window has to take the shape of the picture that is in it ──────────
  //
  // The window carries the picture's proportions, which is what makes its box
  // the picture's box. Those proportions come from the picture's own dimensions
  // when it loads.
  //
  // The load event alone is not enough, and this is the case adversarial review
  // named: a picture already in the browser's cache can finish loading before
  // this component attaches its handler, so the event never arrives and the
  // window keeps the previous picture's shape. Every seeded map is 4:3 today so
  // nothing looks wrong — but Phase 10 lets an organizer upload a plan of any
  // shape, and then a stale ratio stretches the map and feeds a wrong height to
  // the pan limit.
  //
  // So the picture is also asked directly whenever the map changes, which
  // covers the cached case, and the load handler covers the rest.
  useEffect(() => {
    const img = imageRef.current
    if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setAspect(img.naturalWidth / img.naturalHeight)
    }
  }, [active?.imageUrl])

  // Switching maps starts the new one from the top, rather than dropping the
  // reader into a corner of a picture they have not seen yet.
  const chooseMap = (id: string) => {
    setSelectedId(id)
    applyTransform(AT_REST)
    pointers.current.clear()
    gesture.current = null
    panFrom.current = null
  }

  if (isLoading) {
    return (
      <div data-testid="floor-plan" className="p-4">
        <div className="mb-3 h-9 w-full animate-pulse rounded-lg bg-black/5" />
        <div className="aspect-[4/3] w-full animate-pulse rounded-xl bg-black/5" />
      </div>
    )
  }

  if (isError) {
    return (
      <div data-testid="floor-plan" className="p-6">
        <h1 className="mb-2 text-lg font-semibold text-ink">Venue map</h1>
        <p className="text-sm text-ink-3">
          The venue map could not be loaded. Pull down to try again.
        </p>
        <p className="mt-2 text-xs text-ink-3">{String((error as Error)?.message ?? '')}</p>
      </div>
    )
  }

  if (!active) {
    return (
      <div data-testid="floor-plan" className="p-6">
        <h1 className="mb-2 text-lg font-semibold text-ink">Venue map</h1>
        <p className="text-sm text-ink-3">No maps have been published for this event yet.</p>
      </div>
    )
  }

  const zoomed = transform.scale > 1

  return (
    <div data-testid="floor-plan" className="flex min-h-full flex-col">
      <header className="px-4 pb-2 pt-4">
        <h1 className="text-lg font-semibold text-ink">Venue map</h1>
        <p className="mt-0.5 text-xs text-ink-3">Pinch or double-tap to zoom. Drag to move around.</p>
      </header>

      {/* The switcher. Rendered in the order the data arrives, which the data
          layer has already sorted by the stored switch position. */}
      <nav
        data-testid="map-switcher"
        aria-label="Choose a map"
        className="flex gap-2 overflow-x-auto px-4 pb-3"
      >
        {maps.map(map => {
          const isActive = map.id === active.id
          return (
            <button
              key={map.id}
              type="button"
              data-testid="map-tab"
              data-map-position={map.position}
              data-active={isActive ? 'true' : 'false'}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => chooseMap(map.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-primary text-white' : 'bg-black/5 text-ink-2'
              }`}
            >
              {map.name}
            </button>
          )
        })}
      </nav>

      <div className="flex-1 px-3 pb-6">
        <div className="relative mx-auto w-full max-w-3xl">
          {/* The window the map moves inside. It carries the picture's own
              proportions, so at rest the picture fills it exactly and the
              moving layer's box is the picture's box. */}
          <div
            ref={viewportRef}
            data-testid="map-viewport"
            data-map-scale={transform.scale}
            style={{ aspectRatio: String(aspect), touchAction: 'none', overflow: 'hidden' }}
            // NO BORDER ON THIS ELEMENT. A border sits outside the content box,
            // so the picture inside would be two pixels narrower than the
            // viewport and the two boxes would no longer be the same thing —
            // which is the invariant every marker position depends on. The
            // outline is drawn with a ring instead, which is a shadow and takes
            // no space. The first version used a border and was caught by the
            // browser check at 364 against 366.
            className="relative w-full rounded-xl bg-white ring-1 ring-black/10"
          >
            {/* The moving layer. Nothing may pad or size this independently of
                the picture inside it. */}
            <div
              data-testid="map-canvas"
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: '100%',
                // Height comes from the picture, NOT from the window. Raised by
                // adversarial review round 2: forcing the picture to the
                // window's height meant that a map of a different shape was
                // visibly stretched from the moment it was selected until it
                // finished loading and the window caught up. Letting the picture
                // decide means it is never distorted — at worst the window is
                // briefly the wrong height around it — and it keeps this layer's
                // box identical to the picture's box, which is the invariant
                // every marker position depends on.
                transformOrigin: '0 0',
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              }}
            >
              <img
                ref={imageRef}
                data-testid="map-image"
                src={active.imageUrl}
                alt={active.name}
                onLoad={e => {
                  const img = e.currentTarget
                  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setAspect(img.naturalWidth / img.naturalHeight)
                  }
                }}
                draggable={false}
                // The picture is given a shape to occupy BEFORE it has decoded.
                // Raised by adversarial review round 3: with an automatic height
                // and no dimensions known, a picture that has not loaded is zero
                // pixels tall, the layer around it collapses with it, and every
                // marker's percentage resolves against nothing — so a cold map
                // switch would briefly show a blank window with the markers
                // piled along the top edge.
                //
                // This is the same value the window uses, so the two agree, and
                // it is corrected the moment the picture reports its real
                // dimensions. Storing each map's size alongside it would be
                // better still and would make this exact on the first frame;
                // that belongs with Phase 10, where uploads make the dimensions
                // worth keeping anyway.
                style={{ aspectRatio: String(aspect) }}
                className="block h-auto w-full select-none"
              />
              {active.pins.map((pin, index) => (
                <Marker key={pin.id} pin={pin} index={index} scale={transform.scale} />
              ))}
            </div>
          </div>

          {zoomed && (
            <button
              type="button"
              data-testid="map-zoom-reset"
              onClick={() => applyTransform(AT_REST)}
              className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium
                         text-ink shadow-md ring-1 ring-black/10"
            >
              Fit map
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
