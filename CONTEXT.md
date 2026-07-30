# Glossary

Canonical terminology for the WBR conferencing app. This file is a glossary — pure term definitions with cross-references. Implementation details live elsewhere:

- Architectural decisions → `docs/adr/`
- Current-state system architecture → `docs/architecture.md`
- Sprint-grade decision index → `docs/decisions.md`
- Phase scope + acceptance criteria → engineer-local PRD (gitignored).

## Terms

### intro

An AI-drafted opener that a sponsor writes to a meeting recipient. Distinct from:

- **chat message** — real-time in-app conversation (`Message` model).
- **email log entry** — admin-app transactional email (`EmailLog` model).
- **sponsor reminder draft** — admin-app AI-drafted email to incomplete-profile sponsors (`apps/web/app/api/sponsors/remind/route.ts`).

Storage, lifecycle, and write-path semantics: see [ADR 0005](docs/adr/0005-ai-intros-via-meeting-request-message.md).

### `MeetingRequest.message`

The database field storing an `intro` attached to a meeting request. See [ADR 0005](docs/adr/0005-ai-intros-via-meeting-request-message.md) for the two parallel write paths (existing one-click Connect vs new Draft intro flow) and their semantics.

### intro draft modal

The sponsor-facing surface where an AI-drafted `intro` is reviewed and (optionally) edited before send. Contents, friction contract, provenance line, and failure UX are specified in the engineer-local PRD § Phase 12a (gitignored).

### solutions taxonomy

The canonical list of business-solution category names used across the sponsor app for filtering, profile editing, and matchmaking. Sourced from `apps/sponsor/lib/solutions.ts` (exported as `SOLUTIONS`). A flat 18-item list; strings are the shared vocabulary that attendee `solutionsSeeking` values, sponsor `solutionsOffering` values, filter chips in `SponsorBrowseView`, and the `SolutionBadge` + `SOLUTION_COLORS` styling all agree on.

Distinct from:

- **`INDUSTRIES`** (`lib/solutions.ts`) — retail industry categorization (e.g. "Fashion & Apparel", "Beauty & Cosmetics").
- **`JOB_FUNCTIONS`** (`lib/solutions.ts`) — attendee role/job-family taxonomy (e.g. "Marketing", "Ecommerce").

Storage, reconciliation history, and taxonomy-choice rationale: see [ADR 0006](docs/adr/0006-sponsor-solution-taxonomy-reconciliation.md).

### `solutionsSeeking` / `solutionsOffering`

Paired user-profile fields expressing the two sides of B2B matchmaking:

- **`solutionsSeeking`** — lives on attendee profiles (buyers). Lists the `solutions taxonomy` values the attendee is looking to buy at the conference.
- **`solutionsOffering`** — lives on sponsor profiles (sellers). Lists the `solutions taxonomy` values the sponsor sells.

Both are stored as JSON-encoded array strings in `String?` columns via Prisma (e.g. `"[\"Email Marketing\",\"Loyalty & Rewards\"]"`). Matchmaking pairs attendee-seeking against sponsor-offering. Inverting the role-to-field mapping (attendee showing "offering", sponsor showing "seeking") is a domain-logic defect, not a data-shape defect.

### profile completeness

The sponsor-portal metric shown on the sponsor dashboard — percentage of 18 predefined profile fields populated. Computed by `apps/sponsor/components/DashboardView.tsx completeness()`. Sponsor-only; not a system-wide concept. Fifteen scalar fields are checked with `!sponsor[k]`; three array fields (`solutionsOffering`, `solutionsSeeking`, `targetIndustries`) require parsing the JSON-encoded array to detect emptiness — `"[]"` is a truthy string but represents empty data.

Distinct from the **onboarding gate** (attendee-side) below: `profile completeness` is a soft *metric* (a percentage that nudges), whereas the onboarding gate is a hard *block*.

### onboarding gate

The attendee-app rule that blocks a signed-in attendee from navigating the app until a defined set of required profile fields is populated. Distinct from:

- **sponsor `profile completeness`** — a soft percentage metric that nudges but does not block.
- **the `setup` / Settings screen** (`apps/attendee/components/setup/SetupClient.tsx`) — the always-reachable edit surface for the same fields; the onboarding gate is a separate, blocking flow shown when required fields are missing.

The required-field set is a single source of truth read by both the gate check and the checklist UI. The gate stands alone on email/password sign-in and never assumes any OAuth provider. "Sign in with LinkedIn" is an **optional** additive layer wired in later: when used, it pre-fills `name` and `image` only (LinkedIn's API does not expose job title or company), so those remain manual checklist entries; when absent, the checklist is filled entirely by hand with no loss of function. Attendees are buyers, so the attendee checklist collects `solutionsSeeking` and never `solutionsOffering`.

### venue map

An uploaded floor-plan picture (raster image; a PDF is converted to an image on upload) belonging to a `Conference`, shown to attendees. A conference has several (3–4 typical) that switch in a fixed order to cover multiple buildings / floors. The picture itself carries no structure — see **pin**. Rationale and the rejected vector-map alternative: [ADR 0007](docs/adr/0007-floor-plan-human-authored-pins-over-raster.md).

### pin

A human-placed point marker on a `venue map`, positioned as x/y percentages of the image. Two kinds:

- **booth pin** — links to a `Sponsor` (reuses the existing `Sponsor.boothNumber`); tapping it on the attendee side opens a bottom-sheet card for that company over the map. A full attendee-facing company profile page is a deliberate fast-follow, not part of the demo — see [ADR 0007](docs/adr/0007-floor-plan-human-authored-pins-over-raster.md).
- **room pin** — carries a typed label (e.g. "Ballroom A"); marks a session/room location.

Pins are authored by WBR staff by tapping the spot and assigning it — never drawn, never auto-detected. Distinct from a drawn/shaded booth *area*, which is deliberately out of scope. See [ADR 0007](docs/adr/0007-floor-plan-human-authored-pins-over-raster.md).
