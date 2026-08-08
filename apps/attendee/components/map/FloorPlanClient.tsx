'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ElementType } from 'react'
import { useFloorPlanData, useFloorPlanLiveUpdates } from '@/lib/hooks'
import type { FloorPlanMap, FloorPlanPin, FloorPlanSponsor } from '@/lib/floor-plan-data'

/**
 * The one width threshold this screen changes behaviour at: the styling
 * toolkit's `md`, 768 pixels.
 *
 * Written out here as well as used in class names because two things below need
 * it in JavaScript — whether the card claims to be a modal dialog, and whether
 * it traps Tab — and a second number that had to agree with `md` by hand is how
 * the two would drift apart. This supersedes the 600 pixels named during the
 * acceptance run: 600 matches no other rule in this codebase, and 768 also
 * covers a tablet held upright, which is a touch device with the same problem.
 */
const WIDE_SCREEN_QUERY = '(min-width: 768px)'

/**
 * True when the window is 768 pixels or wider.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` for one reason:
 * it takes a server snapshot, so the first render on the server and the first
 * render in the browser agree by construction and React has no hydration
 * mismatch to complain about. The server snapshot is `false` — narrow — because
 * this application is a phone-first installable app, so the narrow layout is the
 * one worth rendering first on a cold load.
 */
function useIsWideScreen(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(WIDE_SCREEN_QUERY)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(WIDE_SCREEN_QUERY).matches,
    () => false,
  )
}

/**
 * ── The map's height cap below 768 pixels: 38dvh ─────────────────────────────
 *
 * The value itself lives in one place only — the max-width class on the map
 * window, further down this file, because a Tailwind class has to be a literal
 * string and a constant here would be a second copy of the number with nothing
 * keeping the two in step. This note is where the number comes from.
 *
 * That class is deliberately NOT quoted here. Tailwind reads this file looking
 * for class names and does not know a comment from code, so an earlier version
 * of this note put a second, unused `max-width` rule into the built stylesheet —
 * with an ellipsis where the variable should be. Harmless, and still noise
 * shipped to every visitor.
 *
 * IT WAS MEASURED, NOT CHOSEN. The predecessor attempt chose 80% of the map
 * window without measuring anything, which on a 390-pixel phone gave the card
 * 220 pixels against the 317 the tallest company card needs, and put the website
 * link off the bottom for every company (UF-6). Every automated assertion passed,
 * because they all read the markup.
 *
 * Measured in the browser at 390 × 844, before the value was set:
 *
 *   map window top          114 px   (below the header and the map tabs)
 *   gap under the map        12 px
 *   tallest company card    317 px   (Shopify and BigCommerce, 7 offerings each)
 *   bottom bar top          779 px
 *
 * So the map may be at most 779 − 114 − 12 − 317 = 336 pixels tall for the
 * tallest card to be completely visible without the page scrolling. 38% of 844
 * is 321, clearing it by 15 pixels, and it scales with the screen rather than
 * being right on one phone and wrong on the next.
 *
 * `dvh` and not `vh`: on a phone `vh` is measured against the window with the
 * address bar hidden, so a map sized in `vh` is taller than the space the person
 * can actually see whenever that bar is showing. `dvh` is that visible space.
 */

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

function Marker({
  pin,
  index,
  scale,
  onOpen,
}: {
  pin: FloorPlanPin
  index: number
  scale: number
  onOpen: (pin: FloorPlanPin) => void
}) {
  const isBooth = pin.type === 'BOOTH'

  // ── A marker is interactive only when tapping it will open something ─────────
  //
  // Found 2026-08-04 by tapping room markers on the deployed site. Every marker
  // was a button with a click handler, so every marker showed a pointer cursor
  // and reported a tap; `openMarker` below then discarded the tap for anything
  // that is not a booth with a company. The result was a control that looks
  // pressable, is pressable, and does nothing — the interface promising something
  // it does not deliver.
  //
  // A room marker has nothing to reveal. Its name is already printed under the
  // dot, permanently, by the label further down this function. So the fix is to
  // stop dressing it as a control, NOT to open a card repeating the name the
  // delegate is already reading.
  //
  // Three review rounds and thirteen negative controls on Phase 11 did not catch
  // this. It was found by a person clicking a marker, which is the same way F-29
  // was found after twelve controls missed it.
  const opensCard = isBooth && Boolean(pin.sponsor)

  // 'div' rather than 'button' when nothing opens: no pointer cursor, out of the
  // tab order, and announced as an image with its name rather than as a control.
  const Tag: ElementType = opensCard ? 'button' : 'div'

  // ── A blank booth number is the same thing as no booth number ────────────────
  //
  // Trimmed and emptied to null here, once, so that every reader below agrees
  // about what "has a booth number" means. Before this, the pill chose its width
  // by truthiness and its text by nullishness, and the two disagreed for the
  // empty string: a company stored with '' took the wide-pill branch and then
  // rendered nothing, which is the blank marker the comment beneath this exists
  // to have fixed.
  //
  // The empty string is not hypothetical. `apps/sponsor/components/ProfileEditor.tsx`
  // starts the booth-number field at `sponsor.boothNumber ?? ''` and sends it on
  // every save, and `apps/sponsor/app/api/profile/route.ts` stores a submitted
  // value as-is. So a company with no booth number is written as '' the first
  // time its representative saves their profile for any reason at all. Ten of
  // the twenty seeded exhibiting companies have no booth number, so that is the
  // majority of the population this fallback was written for.
  //
  // The booth card lower in this file was NOT already correct, contrary to what
  // this comment first claimed. Round 6 of the review found it reading the raw
  // field, so a whitespace-only booth number is truthy there and the card renders
  // "Stand" with nothing after it while the marker shows the company name. The
  // guarantee now lives at one boundary — `apps/attendee/lib/floor-plan-data.ts`
  // trims and empties to null when it builds this payload — so every reader gets
  // the same answer. The trim kept here is a second check that costs nothing and
  // keeps this component correct if it is ever handed unnormalised data.
  const boothNumber = pin.sponsor?.boothNumber?.trim() || null

  return (
    <Tag
      // Only a marker that opens a card gets a click handler. `openMarker` in the
      // parent still re-checks the type and the company, so a card cannot open
      // for a room even if this ever hands one a handler by mistake — the two
      // checks answer different questions and both are kept.
      {...(opensCard
        ? { type: 'button' as const, onClick: () => onOpen(pin) }
        : { role: 'img' as const })}
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
      // The cursor is stated rather than inherited. A <button> gets a pointer from
      // the global stylesheet and a <div> does not, so leaving it implicit would
      // make the affordance a side effect of the tag choice rather than a stated
      // rule, and a later refactor could reintroduce exactly the fault this fixes.
      className={`absolute h-11 w-11 flex items-center justify-center
                 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
                 ${opensCard ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {isBooth ? (
        // ── A booth with no booth number shows the company's name ──────────────
        //
        // This used to render a bullet when boothNumber was null, which put an
        // unlabelled dot on the map. Found on 2026-08-03 by placing a marker for a
        // company that has no booth number yet and looking at the delegate's screen:
        // the marker was a blank circle, and the only way to learn whose booth it
        // was, was to tap it.
        //
        // That case is not unusual — it is what an organiser produces whenever they
        // place an exhibitor before the booth numbers are assigned, which is the
        // normal order of events when a venue plan arrives before the floor sales
        // are final.
        //
        // The name is capped and truncated rather than allowed to run. Phase 9's
        // review measured the booth card overflowing at 390 pixels, and a name here
        // sits inside a 44-pixel tap target on a phone. Truncating loses nothing a
        // delegate cannot get by tapping, which opens the card with the full name;
        // an unbounded pill would cover the map itself. The full name is in the
        // marker's accessible label either way.
        <span
          className={`flex h-7 items-center justify-center rounded-full bg-primary px-1.5
                     text-[10px] font-semibold leading-none text-white shadow-md ring-2 ring-white
                     ${boothNumber ? 'min-w-7' : 'max-w-[6.5rem]'}`}
        >
          <span className="truncate">{boothNumber ?? pin.label}</span>
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
    </Tag>
  )
}

/**
 * The card that opens over the map when a delegate taps a booth marker.
 *
 * ── Why it renders inside the map's own wrapper ──────────────────────────────
 *
 * Its container is the element that also holds the map window, so the card is
 * positioned against the map rather than against the screen. A sheet anchored
 * to the bottom of the viewport would sit below the map on a tall screen and
 * beside it on a wide one; anchored here it always covers the lower part of the
 * map, which is what "opens over the map" means and what the Phase 9 check
 * measures — it compares the two rectangles.
 *
 * ── Why it takes no data of its own ──────────────────────────────────────────
 *
 * Every value comes from the marker that was tapped. The map response already
 * carries them, decided 2026-08-02 so that a tap shows a complete card with no
 * request in between. There is no loading state here because there is nothing
 * to load.
 */
function BoothCard({ sponsor, onClose }: { sponsor: FloorPlanSponsor; onClose: () => void }) {
  const headingId = `booth-card-name-${sponsor.id}`
  const cardRef = useRef<HTMLDivElement | null>(null)
  const returnFocusTo = useRef<Element | null>(null)

  // ── Below 768 pixels this is a card under the map, not a modal over it ──────
  //
  // The three things that make a dialog modal — the overlay, the claim
  // `aria-modal`, and Tab being held inside — are one decision, not three, and
  // they hold together only while the overlay is there.
  //
  // Below 768 the card sits beneath the map and the overlay is gone, so every
  // marker behind it stays reachable with a finger. Telling a screen reader that
  // everything outside the card is unavailable, while a sighted person taps a
  // second marker freely, describes the screen wrongly — and trapping Tab would
  // take away the keyboard route to the very markers the overlay no longer
  // blocks. So both are dropped there, and both are kept at 768 and above, where
  // the card still opens over the map with the overlay under it.
  //
  // What is NOT conditional: `role="dialog"`, the accessible name, moving focus
  // to the card when it opens, and returning focus to the marker when it closes.
  // A dialog without `aria-modal` is an ordinary non-modal dialog, and those
  // four are what make it announce itself either way.
  const wide = useIsWideScreen()

  // ── Making aria-modal true rather than merely claimed ────────────────────────
  //
  // Raised by Phase 9's adversarial review. The card announced itself as a modal
  // dialog and then did nothing a modal dialog does: focus stayed on the marker
  // behind the overlay, so a delegate using a keyboard or a screen reader was
  // told a dialog had opened and then had to tab through the whole map to reach
  // it — past controls the overlay had made unreachable with a finger. Claiming
  // the role without the behaviour is worse than not claiming it, because
  // assistive software changes how it presents the page on the strength of it.
  //
  // Three things, which is what the claim actually requires:
  //   1. focus moves into the card when it opens,
  //   2. Tab cycles within the card rather than escaping behind the overlay,
  //   3. focus returns to the marker that opened it when it closes.
  useEffect(() => {
    returnFocusTo.current = document.activeElement
    // preventScroll below 768. The card is in the page's flow there, and
    // focusing an element scrolls it into view — which would scroll the map,
    // and possibly the marker just tapped, off the top of the screen. The whole
    // point of the change is that the marker stays visible. The map height cap
    // is set so that nothing needs to scroll at all, so preventing the scroll
    // costs nothing and removes a way for that to stop being true.
    cardRef.current?.focus({ preventScroll: !wide })
    const opener = returnFocusTo.current
    const card = cardRef.current

    // ── Track whether this card holds focus, as focus moves ─────────────────
    //
    // It cannot be asked at the end. By the time this effect's cleanup runs,
    // React has already taken the card out of the page and the browser has
    // dropped focus to the document body, so "does the card have focus?" is
    // false however the card came to be closing. Measured: testing it there
    // suppressed every restore, including the ones that should happen.
    //
    // `focusout` carries where focus is GOING, which is the question that can
    // actually be answered. Focus moving to something outside the card means
    // the person has gone elsewhere. Focus going nowhere — which is what the
    // card being removed looks like — leaves the flag alone, so a close still
    // returns focus to the marker that opened it.
    const holdsFocus = { current: true }
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget
      if (next instanceof Node && card && !card.contains(next)) holdsFocus.current = false
    }
    const onFocusIn = () => { holdsFocus.current = true }
    card?.addEventListener('focusout', onFocusOut)
    card?.addEventListener('focusin', onFocusIn)

    return () => {
      card?.removeEventListener('focusout', onFocusOut)
      card?.removeEventListener('focusin', onFocusIn)

      // ── ONLY GIVE FOCUS BACK IF THIS CARD STILL HELD IT ───────────────────
      //
      // Two reasons, and the second was measured.
      //
      // If the person has moved focus somewhere else — which below 768 they may
      // do, because Tab deliberately leaves this card — then pulling it back to
      // a marker as the card closes takes them somewhere they did not ask to go.
      //
      // And switching straight from one marker's card to another's is now an
      // ordinary thing to do at that width, since the overlay no longer swallows
      // the second tap. React unmounts the old card and mounts the new one, in
      // that order, so without this test the OLD card's cleanup put focus back
      // on the old marker first, and the NEW card then recorded that old marker
      // as the one to return to. Measured: open the first marker, open the
      // second, press Escape — and focus landed on the first marker.
      if (!holdsFocus.current) return

      // Only if it is still on the page. A marker can disappear when the data
      // refreshes, and focusing a detached element throws focus to the body
      // silently, which is worse than leaving it where it is.
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus()
    }
  }, [])

  // ── Becoming modal has to collect the focus it is about to shut in ──────────
  //
  // Below 768 this card is not modal and Tab deliberately leaves it, so a person
  // using a keyboard can be somewhere else on the page with the card still open.
  // If the window then crosses 768 — TURNING A PHONE ON ITS SIDE does it, since
  // 844 is wider than 768 — the overlay appears and the card starts claiming
  // aria-modal, while focus is still behind that overlay on something the person
  // can no longer see or tap. The Tab trap cannot help, because it only fires on
  // keys pressed inside the card.
  //
  // So when this becomes modal, it takes focus, exactly as it would have done
  // had it opened at that width. Escape still closes it, which was the only way
  // out before. Going the other way needs nothing: dropping the overlay and the
  // claim gives freedom back rather than taking it away.
  //
  // Raised by adversarial review round 2.
  useEffect(() => {
    if (!wide) return
    const card = cardRef.current
    if (card && !card.contains(document.activeElement)) card.focus()
  }, [wide])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    // Only while this is genuinely modal. See the note above the `wide` read.
    if (!wide) return
    const card = cardRef.current
    if (!card) return
    const focusable = [
      ...card.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(el => el.offsetParent !== null)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      {/* Covers the map so a tap anywhere off the card dismisses it. It sits
          under the card and over the map, and it is a plain element rather than
          a button so that it never takes focus from the card.

          GONE BELOW 768 PIXELS. Its reach has nothing to do with where the card
          is drawn — it is `inset-0` on the map's own container (UF-7) — so once
          the card moves beneath the map, the overlay is the only thing left over
          the map, and a tap meant for a second marker is spent closing the first
          card instead. Removing it makes a second marker one tap. The card keeps
          its close control, which is how it is dismissed there. */}
      <div
        data-testid="booth-card-backdrop"
        onClick={onClose}
        className="absolute inset-0 z-20 hidden rounded-xl bg-black/30 md:block"
      />

      <div
        data-testid="booth-card"
        data-booth-card-sponsor={sponsor.id}
        ref={cardRef}
        role="dialog"
        // Claimed only where it is true. See the note above the `wide` read:
        // below 768 the overlay is gone and everything behind this card is
        // reachable, so announcing the rest of the screen as unavailable would
        // describe it wrongly.
        aria-modal={wide ? 'true' : undefined}
        aria-labelledby={headingId}
        // -1 so the card itself can hold focus when it opens without becoming a
        // stop on the ordinary Tab sequence.
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // The card holds focus on open, and the browser would otherwise draw its
        // own ring around the whole panel. The controls inside keep theirs.
        style={{ outline: 'none' }}
        // ── Below 768 pixels: in the page's flow, under the map ──────────────
        //
        // The reported fault was that tapping a marker low on the map opened
        // this card over the very spot just tapped, so the delegate could not
        // see what they had selected. How much it covered was decided by the
        // shape of whatever picture somebody uploaded, because the map window
        // takes its height from the picture's proportions (UF-5).
        //
        // The fix is the map's height, not this card's position. Capping the map
        // (see MAP_HEIGHT_CAP) makes the room under it the same whatever is
        // uploaded, and this card then takes that room as an ordinary block in
        // the page rather than an overlay. Nothing of the map is covered, so the
        // marker that was tapped stays visible — which is the whole criterion.
        //
        // No height limit and no inner scrolling below 768: the map cap is set
        // so the tallest company card fits, and if a longer one ever arrives the
        // page scrolls, which shows all of it, rather than the card scrolling
        // inside itself, which hides the website link at the end of it.
        //
        // ── At 768 and above: unchanged, deliberately ────────────────────────
        //
        // The same fault exists on a wide screen at a smaller scale and is being
        // left alone. Two reasons, both recorded: this application is used on a
        // phone at a venue, and a height limit expressed as a share of the
        // window would shrink a portrait floor plan to about half its current
        // size on a laptop, which is a loss on a screen that has the room.
        //
        // The wide-screen rules below are exactly what this card had before:
        // anchored at 45% of the map so it grows down into the page rather than
        // fighting the map's height. The predecessor pinned it to the map's
        // bottom and capped it at 80% of the map, which gave it 220 pixels
        // against the 317 the tallest card needs and put the website link off
        // the bottom for every company (UF-6). Every automated assertion passed,
        // because they all read the markup.
        className="relative mt-3 rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-black/10
                   md:absolute md:left-0 md:right-0 md:top-[45%] md:z-30 md:mt-0
                   md:max-h-[60vh] md:overflow-y-auto"
      >
        <div className="flex items-start gap-3">
          {sponsor.logoUrl ? (
            <img
              data-testid="booth-card-logo"
              src={sponsor.logoUrl}
              // Named rather than decorative. A delegate using a screen reader
              // gets the company from the heading; the logo repeating it is
              // noise, but an empty alt on a meaningful image is worse when the
              // picture fails to load, which is when the text matters most.
              alt={`${sponsor.name} logo`}
              className="h-12 w-12 shrink-0 rounded-lg object-contain ring-1 ring-black/5"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            {/* break-words on every text field, not just min-w-0 on the box
                around them. min-w-0 lets a flex child shrink below its content;
                it does not make an unbroken string wrap, so a long company name
                or a tagline containing a bare URL would still push past the
                card's edge at 390 pixels. Today's longest seeded company name
                is 12 characters, so no test would have found this — but Phase
                11 lets an organizer type these values. Raised by Phase 9's
                adversarial review round 2. */}
            <h2
              id={headingId}
              data-testid="booth-card-name"
              className="break-words text-base font-semibold text-ink"
            >
              {sponsor.name}
            </h2>
            {sponsor.boothNumber ? (
              <p data-testid="booth-card-booth" className="mt-0.5 text-xs font-medium text-primary">
                Stand {sponsor.boothNumber}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            data-testid="booth-card-close"
            onClick={onClose}
            aria-label={`Close ${sponsor.name}`}
            // 44 by 44, the same reason the markers are: it is the smallest
            // target a thumb hits reliably.
            className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full
                       text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        {sponsor.tagline ? (
          <p data-testid="booth-card-tagline" className="mt-3 break-words text-sm text-ink-2">
            {sponsor.tagline}
          </p>
        ) : null}

        {sponsor.solutions.length > 0 ? (
          <div className="mt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Offers</h3>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {sponsor.solutions.map((s, i) => (
                <li
                  // Keyed by POSITION as well as text. The offerings are
                  // free-form strings an organizer will type in Phase 11, so
                  // one company listing the same offering twice is an ordinary
                  // shape, and two identical keys make React's reconciliation
                  // undefined — it may drop a chip or reuse the wrong one.
                  // Raised by Phase 9's adversarial review round 2. Today's
                  // seeded data has no duplicates, which is exactly why nothing
                  // would have noticed.
                  key={`${i}-${s}`}
                  data-testid="booth-card-offering"
                  className="max-w-full break-words rounded-full bg-black/5 px-2.5 py-1 text-xs text-ink-2"
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {sponsor.website ? (
          <a
            data-testid="booth-card-website"
            href={sponsor.website}
            target="_blank"
            // noopener is the part that matters: without it the opened page can
            // reach back through window.opener and navigate this one.
            rel="noopener noreferrer"
            className="mt-4 inline-flex max-w-full items-center gap-1 break-all text-sm font-medium text-primary underline"
          >
            Visit website
          </a>
        ) : null}
      </div>
    </>
  )
}

export function FloorPlanClient() {
  const { data, isLoading, isError, error } = useFloorPlanData()

  // Hold a connection open while this screen is on, so an organizer's change
  // appears here without the delegate doing anything. Mounted here rather than
  // in the layout on purpose: a delegate reading the agenda has no need of a
  // connection about maps. See useFloorPlanLiveUpdates in lib/hooks.ts.
  useFloorPlanLiveUpdates()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [transform, setTransform] = useState<Transform>(AT_REST)
  const [aspect, setAspect] = useState<number>(FALLBACK_ASPECT)
  // Which marker's card is open, held as the MARKER's id rather than the
  // company's. Two markers for one company would otherwise be one card that
  // could not say which was tapped, and the card is looked up from the marker
  // list so it cannot show a company that is not on this map.
  const [openPinId, setOpenPinId] = useState<string | null>(null)

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

  // ── When the window's box changes, the pan offset in hand is out of date ────
  //
  // The pan limit is worked out from the window's measured box at the moment a
  // gesture happens: the map may not bring either edge inside the window, so how
  // far it may be dragged depends on how big that box is. Nothing recomputed it
  // when the box itself changed, so an offset that was legal for the old box
  // survived into the new one — and a person zoomed in and dragged to an edge
  // saw the map jump part or all of the way out of the window, with the markers
  // over there unreachable until they dragged again or pressed "Fit map".
  //
  // Two ways to reach it, and this one observer covers both:
  //
  //   - The window is resized. TURNING A PHONE ON ITS SIDE is the ordinary case,
  //     and it is worse than it used to be now that this screen has a rule that
  //     applies below 768 pixels and not above: crossing that width changes the
  //     box by more than the rotation alone.
  //   - The picture's proportions change under the person, because the window
  //     carries the picture's proportions. An organizer replacing the floor plan
  //     while a delegate is looking at it does exactly that, and this screen
  //     holds a live connection open so that such a change arrives immediately.
  //
  // Raised by adversarial review, which named the second. The first was found
  // while checking the first: there was no resize handling on this screen at all.
  //
  // Nothing happens at rest, because at scale 1 the map may not be dragged at
  // all and the clamp returns what it was given. The guard keeps that from
  // costing a render.
  // `active?.id` IS IN THE DEPENDENCIES, AND WITHOUT IT THIS DOES NOTHING.
  //
  // The map window is not rendered until the data has arrived — this component
  // returns a loading state before that — so on the first run of this effect the
  // ref is empty and there is nothing to observe. With only the two stable
  // callbacks as dependencies the effect never ran again, the observer was never
  // attached, and the fix was inert while looking complete. Measured: the check
  // for this failed identically with the fix present and with it removed, which
  // is how it was caught. Naming the active map makes the effect run again when
  // the window appears.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const current = transformRef.current
      const next = clamp(current)
      if (next.x !== current.x || next.y !== current.y || next.scale !== current.scale) {
        applyTransform(next)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [clamp, applyTransform, active?.id])

  // Switching maps starts the new one from the top, rather than dropping the
  // reader into a corner of a picture they have not seen yet.
  const chooseMap = (id: string) => {
    setSelectedId(id)
    applyTransform(AT_REST)
    pointers.current.clear()
    gesture.current = null
    panFrom.current = null
    // A card belongs to a marker on the map that was showing. Leaving it open
    // across a switch would put one map's company over another map's picture.
    setOpenPinId(null)
  }

  /**
   * Open the card for a tapped marker.
   *
   * A room marker and a booth marker whose company row has been deleted both
   * land here and both open nothing. There is no company to show in either
   * case, and a card that appears empty is worse than no card.
   *
   * Nothing in here touches the zoom or the offset. That is what makes
   * dismissing return to the same place — not a saved-and-restored position,
   * which could restore the wrong one, but a position that was never disturbed.
   */
  const openMarker = (pin: FloorPlanPin) => {
    if (pin.type !== 'BOOTH' || !pin.sponsor) return
    setOpenPinId(pin.id)
  }

  const closeCard = useCallback(() => setOpenPinId(null), [])

  // Escape closes the card. Bound only while one is open, so this component
  // does not answer for a key press at any other time.
  useEffect(() => {
    if (openPinId === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCard()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openPinId, closeCard])

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

  // Resolved from the markers on the active map. A card whose marker is not on
  // this map cannot be shown, which makes a stale open card impossible rather
  // than merely unlikely.
  const openCard =
    openPinId === null ? null : (active.pins.find(p => p.id === openPinId)?.sponsor ?? null)

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
            style={{
              aspectRatio: String(aspect),
              // The picture's proportions, handed to CSS so the height cap below
              // can be expressed as a width. Unitless on purpose — it is
              // multiplied by a length in the class below.
              ['--map-aspect' as string]: String(aspect),
              touchAction: 'none',
              overflow: 'hidden',
            }}
            // NO BORDER ON THIS ELEMENT. A border sits outside the content box,
            // so the picture inside would be two pixels narrower than the
            // viewport and the two boxes would no longer be the same thing —
            // which is the invariant every marker position depends on. The
            // outline is drawn with a ring instead, which is a shadow and takes
            // no space. The first version used a border and was caught by the
            // browser check at 364 against 366.
            //
            // ── THE HEIGHT CAP IS APPLIED AS A WIDTH, AND THAT IS THE POINT ──
            //
            // A `max-height` here would have been the obvious way to write it
            // and would have been a defect. This window is `overflow: hidden`,
            // and the picture inside takes its height from its own proportions
            // rather than from this box — so capping the height would not shrink
            // a tall picture, it would CUT ITS BOTTOM OFF, and every marker down
            // there would become unreachable at rest. On a portrait floor plan
            // that is the lower third of the hall.
            //
            // Capping the width instead scales the whole picture down: height is
            // width ÷ proportions, so a width of cap × proportions is exactly a
            // height of the cap, with the picture complete and this box still
            // EXACTLY the picture's box — the invariant every marker position
            // depends on, kept by construction rather than by arithmetic.
            //
            // A landscape picture is unaffected, which is correct: at 390 pixels
            // it is already 275 tall, well under the cap. The cap bites on the
            // portrait pictures, which are the ones that left no room for the
            // company card. Above 768 there is no cap at all.
            className="relative mx-auto w-full max-w-[calc(38dvh*var(--map-aspect))]
                       rounded-xl bg-white ring-1 ring-black/10 md:max-w-none"
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
                <Marker
                  key={pin.id}
                  pin={pin}
                  index={index}
                  scale={transform.scale}
                  onOpen={openMarker}
                />
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

          {/* Looked up from the markers currently on screen, not held as its own
              copy of a company. If the data refreshes and the marker is gone,
              the card goes with it rather than showing a company that is no
              longer on this map.

              KEYED BY THE MARKER, and this became necessary in this phase.
              Below 768 the overlay is gone, so tapping a second marker switches
              the card in one tap rather than closing it — which is the point.
              Without a key that switch reuses the same card: the effect that
              moves focus into it and records which marker to give focus back to
              runs once, on the first open. So the card changed under a keyboard
              or screen-reader user with nothing announced, and closing it
              afterwards sent focus back to the FIRST marker rather than the one
              they had opened. Keying it by the marker makes each open a real
              open. Raised by adversarial review round 2. */}
          {openCard ? <BoothCard key={openPinId} sponsor={openCard} onClose={closeCard} /> : null}
        </div>
      </div>
    </div>
  )
}
