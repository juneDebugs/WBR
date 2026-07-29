# ADR 0007 — Floor plan is human-placed pins over a plain image, never vector-dependent

- **Status:** Proposed (2026-07-21). Pending the floor-plan feature landing (targeted for the 2026-08-11 demo sprint).
- **Date:** 2026-07-21
- **Supersedes:** None
- **Superseded by:** None

## Context

The floor-plan / venue-map feature is entirely new. No map, region, or pin model exists in the schema today; `Conference` carries only a single `venue` string plus `venueLat` / `venueLon`, and `Sponsor.boothNumber` already stores a booth identifier string.

WBR (July 20 requirements call) asked for: several switchable maps per event (venues span multiple buildings and floors — 3–4 maps typical); highlighted, labelled rooms ("Ballroom A = general session"); and tappable booths that open the exhibiting company's profile in the app. WBR staff will author these maps themselves for roughly 50 events a year — the authoring flow has to be usable by a non-technical person, not just by an engineer.

The tension driving this decision: every polished trade-show map product (Expocad, Map Your Show, the PAX Nav app) renders booths as individually addressable **vector shapes** — a vector image being one described as a list of real shapes with coordinates, so a single booth is a distinct object the software can point at. Those clean vector maps are always an *input*, supplied as a CAD/SVG file drawn by a designer or the venue's architect. They are never generated from a photo.

WBR's stated reality is the opposite: "we usually just upload an image of the floor plan… a hotel floor plan." That is a **raster image** — a grid of coloured pixels (a `.jpg`, `.png`, or a `.pdf` export) in which the software sees no booths, only dots. Worse, the map often originates several hands away (the venue, a sponsor, a coordinator), and any design that *requires* one of those non-technical parties to understand or produce a specific file format will break the moment someone replies "I don't know what that is, here's a PDF." That failure is the default case, not an edge case.

**Alternatives considered:**

1. **Vector-native maps (venue supplies an SVG; admin clicks pre-existing shapes to assign them).** Elegant and closest to how commercial products behave. Rejected: it makes the whole feature depend on a non-technical chain reliably producing a vector file. When a raster JPG or a legacy PDF arrives instead — the likely case — there are no shapes to click and the feature is dead in the water.
2. **Automatically convert an uploaded raster image into clean, clickable shapes (image tracing / shape detection).** Would let WBR upload any photo and still get clickable booths. Rejected as infeasible on this timeline and at acceptable reliability: tracing a floor-plan photo yields a tangle of thousands of edge fragments, not discrete per-booth shapes, and turning that into "these 40 clusters are booths" is a research-grade computer-vision problem that varies per venue and cannot be built part-time against a demo deadline.
3. **Draw-box overlay editor over a raster image.** The admin uploads the picture and drags a rectangle over each booth. Robust to any image and no vector dependency. Rejected as the primary model: dragging, resizing, and correcting ~40 rectangles per hall is heavy, fiddly authoring for a non-technical self-service user. Retained as a possible later polish for anyone who specifically wants a booth *shaded* rather than pinned.
4. **Pin-drop overlay over a raster image (chosen).** The admin taps the spot on the picture where a booth sits and picks the company from a dropdown; a room is a tap plus a typed label. No drawing, no coordinates shown, no file-format knowledge required.

## Decision

**The floor plan is a set of human-placed point markers ("pins") overlaid on a plain raster image. The image is treated as inert pixels; the knowledge of what sits where comes entirely from a person tapping the spot. The feature never depends on vector input and never attempts automatic shape detection.**

Shape of the decision:

- **Input:** any raster image (`.jpg` / `.png`). A `.pdf` is accepted and its first page is converted to a PNG on upload (a standard server-side conversion), so the uploader never has to think about format. SVG/vector files are not required and are not treated specially — if one arrives it is used as a picture like any other.
- **Authoring (WBR self-service):** tap-to-drop-a-pin, then assign. A booth pin links to a `Sponsor` (the dropdown can surface the sponsor's existing `boothNumber`). A room pin carries a typed label and, optionally later, a highlighted area.
- **Data model (new):** a venue-map record per uploaded image (belongs to a `Conference`, has an ordering so 3–4 maps switch in a fixed sequence, holds the image) and a pin record per marker (belongs to a map; stores position as x/y **percentages** of the image so it survives any screen size; a type of booth or room; a label; and, for booths, a link to a `Sponsor`). Exact field names are settled in the engineer-local PRD.
- **Attendee view:** switch between the maps; tap a booth pin → company card → company profile; rooms shown labelled/highlighted.
- **Scope split for the 2026-08-11 demo:** the attendee viewing experience is built and polished, running on **seeded** map data (the engineer pre-places the demo venue's pins) so the on-stage experience is real. The self-service pin-placement admin tool is hardened before the **test-drive** phase, when WBR actually authors maps themselves; a minimal version may land in time for the demo but is not required for it.

## Consequences

**Easier:**

- **Robust to non-technical users and messy inputs.** Whatever picture arrives — JPG, PNG, PDF, a photo of a printed map — the feature works, because the only skill required of any human is "point at the booth."
- **Cheap, dummy-proof authoring.** "Tap the spot, pick the company" has no drawing, dragging, resizing, or vocabulary to learn. It is also far less engineering than a drawing editor, so a demo-ready version is realistic.
- **Rides on existing data.** `Sponsor.boothNumber` already exists, so booth pins link to real sponsor records with no new sponsor-side data entry.
- **Screen-size independent.** Percentage coordinates keep pins correctly placed on any phone.

**Harder:**

- **A pin marks a point, not an area.** The attendee taps the marker rather than anywhere inside the booth outline. Mitigated with a generous tap target; matches how consumer maps behave. Shading a whole booth outline is deliberately out of scope and would require the draw-box editor from alternative 3.
- **Maps are only as good as the human who placed the pins.** There is no automatic correctness check; a mis-placed pin is a human error to fix in the tool. Accepted — it is the price of not depending on file formats or detection.
- **No alignment with any official/vector venue map.** If WBR later needs precise vector fidelity or CAD alignment, that is a separate, larger effort and would revisit this ADR.
- **Image weight interacts with the pending image-optimization work.** Floor-plan images can be large, and images are currently stored base64-encoded in the database per [ADR 0004](0004-base64-images-in-db.md). Large map images amplify that cost. This feature follows the current base64 pattern for now and is a candidate to move to external blob storage when the separate image-optimization pipeline lands.

## Follow-up work referenced elsewhere

- Field-level data model, acceptance criteria, and the demo-seed vs self-service-tool sequencing live in the engineer-local floor-plan PRD (to be written from this grill session).
- **Agenda → map deep-link** (tap "Ballroom A" in the agenda, jump to the highlighted spot) was requested by WBR and is deferred to post-demo fast-follow; it does not change this decision.
- **Draw-box / shaded-area authoring** is a possible later addition for booths that need an outline rather than a pin; additive to this model, no ADR change required.
- Moving map images out of base64-in-DB is tracked with the broader image-optimization effort, not this ADR.
