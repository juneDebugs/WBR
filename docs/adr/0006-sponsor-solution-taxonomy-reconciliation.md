# ADR 0006 — Sponsor solution taxonomy reconciliation to a single flat list

- **Status:** Proposed (2026-07-03). Pending BUG-002 landing.
- **Date:** 2026-07-03
- **Supersedes:** None
- **Superseded by:** None

## Context

Three competing solution taxonomies coexist in the sponsor app, and none of them agree on the strings used to identify the same business-solution category.

**Taxonomy #1 — filter chip labels.** Location: `apps/sponsor/components/SponsorBrowseView.tsx:8-68` (`SOLUTION_CATEGORIES`). Shape: 11 category headings with ~90 nested items. Verbose formal names (`"Email Marketing Solutions"`, `"Loyalty & Rewards (inc. Rebates) Solutions"`, `"BNPL, Customer Installment Lending & Financing Solutions"`). Appears to be pasted from the WBR conference's official industry taxonomy.

**Taxonomy #2 — the shared `SOLUTIONS` list.** Location: `apps/sponsor/lib/solutions.ts:28-47`. Shape: flat 18-item list. Concise names (`"Email Marketing"`, `"Loyalty & Rewards"`, `"Payment Processing"`). Attendee `solutionsSeeking` data already uses these strings. All visual styling infrastructure — `SOLUTION_COLORS`, `SolutionBadge`, `getBorderColorForSeeking`, `SOLUTION_CATEGORY_GROUPS` — is keyed off these strings.

**Taxonomy #3 — sponsor profile editor chip list.** Location: `apps/sponsor/components/ProfileEditor.tsx:4-10`. Shape: flat 18-item list, similar to #2 but subtly different strings (`"Loyalty & Retention"` vs #2's `"Loyalty & Rewards"`; `"Payments & Checkout"` vs #2's `"Payment Processing"`). Sponsor `solutionsOffering` data has been saved against these strings.

The three taxonomies were introduced independently as the sponsor app was built. They were never reconciled.

**BUG-002 is the observable symptom.** The Browse-attendees filter compares taxonomy-#1 strings (chip labels) against attendee `solutionsSeeking` values (taxonomy-#2 strings) via exact-string equality. Zero attendees match any chip. The filter returns an empty result set for every selection.

**Alternatives considered:**

1. **Keep taxonomy #1 as canonical.** Filter depth is maximized (~90 fine-grained categories). Requires re-migrating all attendee `solutionsSeeking` data + all sponsor `solutionsOffering` data + rewriting `SOLUTION_COLORS` and every downstream styling artifact. Highest total cost.
2. **Keep taxonomy #2 as canonical.** Attendee data needs no migration. All visual scaffolding is already keyed to #2. Sponsor `ProfileEditor` chip list swaps to imports from `lib/solutions.ts` — small change. Sponsor `solutionsOffering` DB rows using taxonomy-#3 strings require a one-time re-map to #2 equivalents (~20 rows).
3. **Keep taxonomy #3 as canonical.** Sponsor data needs no migration. Attendee data needs migration to #3. All visual scaffolding needs rewiring. Comparable cost to option 1.
4. **Introduce a translation layer.** Keep all three taxonomies alive; maintain a mapping table that translates between them at read time. Highest ongoing maintenance cost; leaves the fragmentation in place.

## Decision

**Taxonomy #2 (`apps/sponsor/lib/solutions.ts SOLUTIONS`) is the single canonical solutions taxonomy across the sponsor app.**

Load-bearing implementation subtasks:

- `apps/sponsor/components/SponsorBrowseView.tsx` filter chip taxonomy replaced with an import from `lib/solutions.ts`. The `SOLUTION_CATEGORIES` structure retained (category-grouped rendering is a UX concern independent of item vocabulary); items sourced from `SOLUTIONS`.
- `apps/sponsor/components/ProfileEditor.tsx` chip list replaced with an import from `lib/solutions.ts`. Local `const SOLUTIONS` deleted.
- `apps/sponsor/app/api/browse/route.ts` dead-code duplicate filter — deleted alongside the taxonomy reconciliation. The route was unused; its buggy filter logic no longer needs preserving.
- Existing sponsor `solutionsOffering` DB rows containing taxonomy-#3 strings require a one-time re-map to #2 equivalents. Approximate mapping (executor confirms + extends):
  - `"Loyalty & Retention"` → `"Loyalty & Rewards"`
  - `"Payments & Checkout"` → `"Payment Processing"`
  - `"Logistics & Fulfillment"` → `"Shipping & Fulfillment"`
  - `"Analytics & Data"` → `"Analytics & Reporting"`
  - `"SEO & Content"` → (no direct equivalent; retire or re-select)
  - `"Paid Advertising"` → (no direct equivalent; retire or re-select)
  - `"Social Commerce"` → (no direct equivalent; retire or re-select)
  - `"Influencer Marketing"` → (no direct equivalent; retire or re-select)
  - `"Personalization & AI"` → `"Personalization"` (and/or `"AI & Automation"` — executor call)
  - `"ERP & Operations"` → `"ERP / Operations"`
  - `"Returns & Exchanges"` → `"Returns Management"`
  - `"Tax & Compliance"` → (no direct equivalent; retire or re-select)
- Re-map execution shape (script vs. login-time prompt) is the executor's call. Both are one-hop.

The decision is scoped to the sponsor app. If admin-side surfaces (`apps/web`) or meetings-app surfaces (`apps/meetings`) later reference solutions strings, they consume `lib/solutions.ts SOLUTIONS` via a shared import or re-export.

## Consequences

**Easier:**

- **Filter matching works.** Attendee `solutionsSeeking` values match filter chip values exactly, no translation needed.
- **Zero visual-styling changes.** Colors, badges, borders, category groups already key off taxonomy #2 strings.
- **Zero attendee data migration.** Existing rows are already in #2 shape.
- **One source of truth going forward.** Future sponsor surfaces import `SOLUTIONS`; no drift.

**Harder:**

- **Filter depth drops from ~90 items to 18.** Sponsors can no longer filter for sub-solutions like `"Retargeting Solutions"` specifically. Post-demo work can expand taxonomy #2 (or overlay a two-level category structure) without changing this ADR's basic decision.
- **Sponsor `solutionsOffering` data re-map is load-bearing.** Skipping the re-map leaves existing sponsor offerings invisible to the filter and mis-colored on the badges. The re-map is small (~20 rows) but not optional.
- **The WBR-official conference taxonomy is not represented in code.** If WBR later requires alignment with their formal taxonomy for reporting or export purposes, an additional mapping layer (or taxonomy #2 expansion) becomes necessary. Not a demo-blocker.

## Follow-up work referenced elsewhere

- BUG-002 fix ships this decision. See engineer-local PRD § BUG-002.
- If filter depth becomes a stakeholder ask post-demo, taxonomy #2 expansion is the change path — no ADR update needed unless a second reconciliation choice arises.
- The dead-code filter in `apps/sponsor/app/api/browse/route.ts` is deleted as part of BUG-002; no separate cleanup PR.
