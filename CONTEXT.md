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
