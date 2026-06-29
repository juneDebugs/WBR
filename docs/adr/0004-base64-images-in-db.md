# ADR 0004 — Image content stored as base64 strings in the database

- **Status:** Accepted (current state, since 2026-06); architecturally superseded by the post-sprint Phase 16 migration to file storage (decision documented; implementation deferred).
- **Date:** 2026-06-08 (initial codebase recon — pattern was already established); architectural cost surfaced 2026-06-27 (Phase 1 tier-B verification).
- **Supersedes:** None
- **Superseded by:** A future ADR pinned to the Phase 16 file-storage migration (not yet authored — the migration target backend is not yet locked).

## Context

User avatars, sponsor logos, speaker photos, and similar small images are content the WBR data model needs to surface in every per-app data view. The original prototype chose to store these as **base64-encoded data URIs inside the owning row's `String?` field** — for example, `User.image`, `Sponsor.logoUrl`, `Speaker.photoUrl`. No separate file-storage backend was provisioned; no CDN was configured; no upload signing flow was wired.

The choice was made early for prototype velocity. The cost remained invisible until the 2026-06-22 demo sprint surfaced it.

Three alternative storage backends were considered (the same three remain available for the Phase 16 migration):

1. **Vercel Blob (`@vercel/blob`).** Natural fit given the rest of the stack is on Vercel; provisioned via env vars; CDN-edged. **Recommended fit for the Phase 16 migration.**
2. **Cloudinary.** Provides on-the-fly image transformations (responsive sizes, format conversion, optimization). Strong fit if image-transformation features become important; adds a third-party account dependency.
3. **S3 + CloudFront.** Maximum flexibility, lowest abstraction; deepest operational footprint. Strong fit if WBR leaves Vercel altogether.

The pattern of "store everything in the row" was retained at sprint kickoff under the assumption that it would not affect demo performance. That assumption was wrong, and the architectural cost surfaced in measurement during Phase 1 verification.

## Decision

WBR stores image content as **base64-encoded strings** in the owning row's existing `String?` field. The contents look like `data:image/jpeg;base64,<payload>`. No schema change is required (the fields are already `String?`); the data shape is what changes when Phase 16 ships.

The pattern applies to:

- `User.image` — attendee avatars (the largest by row count; ~1000+ rows at seed scale).
- `Sponsor.logoUrl` — sponsor company logos.
- `Speaker.photoUrl` — speaker photos.
- Any other `String?` field that holds image content; check the schema for additions.

Most `/api/data/*` route handlers serialize the field directly as part of its JSON response. Consumers render with `<img src={user.image} />` — no special handling needed.

**Exception, admin app speakers route.** `apps/web/app/api/data/speakers/route.ts` rewrites `photoUrl` data URIs to `/api/speakers/${id}/photo` URLs before returning JSON; the backing handler at `apps/web/app/api/speakers/[id]/photo/route.ts` decodes the base64 and serves the binary with a 1-hour `Cache-Control`. The DB still holds the data URI in `Speaker.photoUrl`; only the API response strips it. The attendee app's `/api/data/speakers` route does **not** carry this stripping and continues to ship the inline base64. The admin-side stripping was added in earlier work and stands as a partial precedent for the Phase 16 migration path.

**The decision is preserved for the demo sprint.** The architectural fix (Phase 16) is deferred to a post-demo sprint to keep the demo-prep scope tractable.

## Consequences

**Easier:**

- **Single read path.** `<img src={user.image} />` works whether the value is a data URI or a remote URL. No type changes for the components consuming images.
- **Single write path.** Forms that accept image uploads base64-encode in the browser and POST the string to the existing profile-update endpoint. No signed-URL flow, no separate upload service.
- **No third-party account provisioning.** No Vercel Blob token, no Cloudinary key, no AWS credentials. The data layer carries the bytes.
- **Atomic with the owning record.** A `Sponsor` row and its logo are inserted in a single transaction; there is no "row exists but image is missing" failure mode.

**Harder — and the reason Phase 16 supersedes this:**

- **Lighthouse lantern-model amplification distorts simulated LCP 2–10×.** Surfaced during Phase 1's tier-B Vercel-preview verification on 2026-06-27. The chat-data prefetch endpoint shipped ~4.2 MB of base64 avatars on a CHANNEL-type room with hundreds of auto-enrolled members; Lighthouse's lantern model projects this post-load chain into the page's critical path, inflating simulated LCP for `/people` 2.5× between identical-code runs.
- **Observed LCP became the primary AC metric.** PRD §4 was amended on 2026-06-27 to gate on observed LCP (actual paint time during the Lighthouse run) instead of simulated LCP. Simulated LCP is retained as a supplementary signal for the perf delta report. The full simulated-LCP reduction unlocks post-Phase-16.
- **/api/data/* endpoint payloads dominated by image bytes.** Phase 15 trimmed `/api/data/chat` from ~4.2 MB to 1.5 KB by omitting unused member-avatar joins, but the other four prefetched endpoints (`/api/data/home`, `/api/data/setup`, `/api/data/speakers`, `/api/data/schedule`) remain in the same shape. Combined post-Phase-15 these still total ~3.6 MB at typical seed scale.
- **No CDN edge caching for individual images.** Each user's avatar is part of the response that includes that user; there is no per-image cache hit possible.
- **No browser-level lazy loading or responsive-size selection.** A 1024×1024 sponsor logo loads at full resolution on a 64×64 list rendering. `<img loading="lazy">` is irrelevant when the byte is already in the JSON response.
- **DB storage scales linearly with image volume × user volume.** At 1000 users × ~10 KB average avatar, the `User` table carries ~10 MB just for avatars. Manageable now; not great as scale rises.
- **Repeat visits are not cheaper.** Every page that re-fetches a `/api/data/*` endpoint pays the full byte cost again (modulo HTTP-level caching, which is short-TTL by default).
- **Phase-15-shape API trims are whack-a-mole.** Each affected endpoint can be patched to drop the avatar field, but the structural choice is what needs to change. Phase 16 generalizes Phase 15 by fixing the storage layer once.

**Neutral but worth knowing:**

- **The conference-WiFi tier is the high-value win.** Per the network-tier analysis from the 2026-06-27 sprint decision conversation: LCP on conference WiFi / slow 4G is currently 5–12 s; post-Phase-16 estimate is 1.5–3 s. This is the network attendees actually use during the WBR event itself (post-demo).
- **Phase 16 acceptance is documented in the sprint PRD §6 Phase 16.** Summary: every `User.image` / `Sponsor.logoUrl` / `Speaker.photoUrl` value carries a URL string instead of a data URI; every `/api/data/*` endpoint payload drops below ~100 KB combined; attendee simulated LCP clears the original Phase 1 AC bar (`< 3 s` on all four landing pages on Vercel-preview Lighthouse) once the migration lands.
- **The Phase 16 migration script is idempotent.** Decoded → re-uploaded → URL written back; safe to re-run.

## References

- Engineer-local sprint PRD (gitignored) §6 Phase 16 — the deferred migration plan.
- [`smoketests/phase-1-prefetch-fanout-gate.md`](../smoketests/phase-1-prefetch-fanout-gate.md) — the tier-B verification run where the lantern-model interaction surfaced.
- [`smoketests/phase-15-chat-payload-trim.md`](../smoketests/phase-15-chat-payload-trim.md) — the Phase-15-shape API trim that demonstrated the per-endpoint pattern works but does not generalize.
- [`decisions.md` → Architecture](../decisions.md#architecture) — index entry.
- [`architecture.md` → Known limitations](../architecture.md#known-limitations-and-operational-gaps) — current-state limitation list.
- [ADR 0003](0003-turso-libsql-data-layer.md) — the data layer that carries the base64 payloads.
