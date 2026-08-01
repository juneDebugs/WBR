'use client'

import { useMemo, useState } from 'react'
import { useFloorPlanData } from '@/lib/hooks'
import type { FloorPlanMap, FloorPlanPin } from '@/lib/floor-plan-data'

/**
 * The participant's venue map: a picture with markers on top of it.
 *
 * ── The one layout rule everything else depends on ───────────────────────────
 *
 * Marker positions are stored as percentages of the picture, so the marker
 * layer has to be EXACTLY the picture's box. If the layer were larger — a
 * container with the picture letterboxed inside it — a marker at 50% would sit
 * at the middle of the container rather than the middle of the picture, and
 * every marker would drift by a different amount at every screen size.
 *
 * That is why the picture is `block w-full h-auto` and the layer is its direct
 * parent with no padding of its own: the parent's box is then the picture's box
 * by construction rather than by arithmetic. The Phase 8 browser check asserts
 * the two boxes match within a pixel, at three screen sizes.
 *
 * ── Why the label does not live in the marker's box ──────────────────────────
 *
 * A room marker shows its name. If that text were a normal child, it would make
 * the marker wider and shift the marker's centre away from the point it marks.
 * The label is therefore absolutely positioned against the marker, so it is
 * visible without being part of the marker's box.
 */

function Marker({ pin, index }: { pin: FloorPlanPin; index: number }) {
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
      style={{ left: `${pin.x}%`, top: `${pin.y}%`, zIndex: 10 + index }}
      // 44 by 44 is the smallest target a thumb hits reliably, and ADR 0007
      // accepts a generous target as the price of a marker being a point rather
      // than an area. The visible dot inside is smaller; the button is the part
      // that must be forgiving.
      className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center
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

  const maps: FloorPlanMap[] = useMemo(() => data?.maps ?? [], [data])
  // The first map in stored order is what a delegate sees on arrival; the
  // ordering itself is the database's, not this component's.
  const active = useMemo(
    () => maps.find(m => m.id === selectedId) ?? maps[0] ?? null,
    [maps, selectedId],
  )

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

  return (
    <div data-testid="floor-plan" className="flex min-h-full flex-col">
      <header className="px-4 pb-2 pt-4">
        <h1 className="text-lg font-semibold text-ink">Venue map</h1>
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
              onClick={() => setSelectedId(map.id)}
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
        {/* The marker layer IS the picture's box. Nothing may pad or size this
            element independently of the picture inside it. */}
        <div data-testid="map-canvas" className="relative mx-auto block w-full max-w-3xl">
          <img
            data-testid="map-image"
            src={active.imageUrl}
            alt={active.name}
            // A layout hint only, so the space is reserved before the picture
            // arrives. Once it loads, its real proportions win, because the
            // height is left to CSS.
            width={1600}
            height={1200}
            className="block h-auto w-full rounded-xl border border-black/10 bg-white"
          />
          {active.pins.map((pin, index) => (
            <Marker key={pin.id} pin={pin} index={index} />
          ))}
        </div>
      </div>
    </div>
  )
}
