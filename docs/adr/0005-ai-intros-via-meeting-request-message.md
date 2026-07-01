# ADR 0005 — AI-drafted intros route through `MeetingRequest.message`

- **Status:** Accepted (Phase 12a, 2026-06-30). May be revisited if AI-driven matchmaking surfaces multiply (per Charter §3.2 recommendation-engine / auto-scheduling features).
- **Date:** 2026-06-30
- **Supersedes:** None
- **Superseded by:** None

## Context

The sponsor portal's `RecommendedAttendees` surface (`apps/sponsor/components/RecommendedAttendees.tsx`) renders cards per recommended attendee with a matchScore badge, matched solution tags, and a "Connect" CTA. Clicking Connect fires `POST /api/request-meeting` with `{ targetUserId }` — no message attached. A `MeetingRequest` record is created in `PENDING` status; the recipient eventually sees the request in their queue. *(The component's committed source contains a pre-existing typo POSTing to `/api/meeting-requests` — a non-existent route in `apps/sponsor`. Phase 12a corrects the client fetch call to point at the canonical `/api/request-meeting` endpoint.)*

The `MeetingRequest` schema (`packages/db/prisma/schema.prisma:357-383`) carries a `message String?` field. The field is in the schema today but is **not populated by the existing sponsor-portal Connect flow** — the route writes the request without it. The field exists but the UI doesn't surface a way to fill it.

Phase 12a introduces a new sponsor-portal AI surface — the "Draft intro" button — that generates a personalized 3-sentence opener from sponsor profile data + attendee profile data + matched solution tags. The AI output is a string. It needs a destination: somewhere to live between AI generation and the recipient seeing it.

Three storage paths were considered:

1. **Clipboard payload.** The AI output is shown in the modal; the sponsor copies it; the meeting request fires separately with no message attached; the sponsor pastes the intro into some other channel (email, LinkedIn, in-person at conference). No audit trail; the intro lives outside the system.
2. **`MeetingRequest.message` field.** The AI output is written to the existing field when the sponsor sends through the new flow. The intro lives alongside the meeting request itself; the recipient queue surfaces it without additional joins.
3. **New AI-output table.** A separate `AiIntro` (or similar) row per generated draft. The meeting request references the intro by foreign key. Maximum flexibility for future AI provenance tracking but introduces a table for a field that already exists.

The clipboard path was rejected for losing the message at the moment the system most benefits from having it (the meeting-request creation). The new-table path was rejected for adding schema weight for a use case the existing `message String?` field already covers. The `MeetingRequest.message` field path uses the schema as designed.

## Decision

AI-drafted intros write to **`MeetingRequest.message`** when the sponsor sends through the new Phase 12a Draft intro flow. The existing one-click Connect flow continues to leave the field null. Two parallel write paths to the same field; both schema-valid:

- **Connect flow (existing, unchanged in behavior; endpoint corrected).** `POST /api/request-meeting` with body `{ targetUserId }`. `MeetingRequest.message` is null after insert. *(Phase 12a corrects the pre-existing typo in `RecommendedAttendees.tsx` that had the fetch call targeting `/api/meeting-requests`.)*
- **Draft intro flow (new, Phase 12a).** `POST /api/recommendations/<attendeeId>/draft-intro` returns a Zod-validated structured draft. Sponsor reviews + (optionally) edits in the intro draft modal. On send, `POST /api/request-meeting` with body `{ targetUserId, message }`. `MeetingRequest.message` carries the sponsor-reviewed intro text after insert.

**Endpoint route path note.** The sponsor app's meeting-request route is `/api/request-meeting` (singular verb-noun), not `/api/meeting-requests` (which does not exist in `apps/sponsor` — the existing `RecommendedAttendees.tsx` component carries a pre-existing typo POSTing to the non-existent path; Phase 12a corrects this alongside adding the message-carrying flow).

The field's nullability is preserved. No schema change required. Existing `MeetingRequest` reads handle the null case correctly today.

Phase 12a code lives in the sponsor app (`apps/sponsor/...`). Future AI surfaces that also produce intros (e.g., admin-side outreach drafting in `apps/web`, if pursued) write to the same field through the same convention.

The decision applies only to the **storage destination** for the AI-drafted intro string. It does not commit to a particular AI model, prompt shape, surface placement, or UX — those are PRD-level Phase 12a decisions, not architectural.

## Consequences

**Easier:**

- **Closes an existing schema loop.** The `message` field has been in the schema waiting for a use case; Phase 12a is the first consumer. No dead schema fields and no parallel storage paths.
- **Audit trail co-located with the meeting request.** A future operator inspecting a `MeetingRequest` row sees the intro that accompanied it. No join, no separate table, no lookup.
- **Cascade-delete is automatic on row deletion.** If a `MeetingRequest` row is deleted, the intro is co-deleted with it. Note: the current schema models the request lifecycle via status transitions (`PENDING | APPROVED | REJECTED | CONFIRMED`) rather than row deletion — declined / rejected requests remain as rows with an updated `status`, so the intro remains readable. The co-deletion consequence applies only to actual row deletes (admin cleanup, GDPR erasure, test-fixture teardown).
- **Recipient queue surfacing is one field-read away.** The meetings app already reads `MeetingRequest` rows; adding `message` to the rendered view is a UI-only change in `apps/meetings` (out of scope for Phase 12a but unblocked for follow-up).
- **No new table, no new migration for Phase 12a.** The pre-flight gate / HITL UI / prompt grounding can ship without touching the schema.

**Harder:**

- **Two parallel write paths to one field.** Readers of `MeetingRequest.message` need to know that the field is populated through two flows (existing Connect leaves it null; new Draft intro populates). Reduces to "field is nullable" semantically — readers must already handle null — but the two-flow nature is non-obvious to a future engineer.
- **No AI-provenance tracking inside the field.** A `MeetingRequest.message` value of `"Hi Sarah — saw your work on..."` doesn't carry metadata about whether the AI drafted it, what model produced it, or whether the sponsor edited it before sending. If Phase 12b+ work wants to track AI provenance, that's a separate table or schema columns — *not* a reversal of this decision.
- **Migration cost if reversed.** If a future decision moves intros to a separate table, backfill is hard — we'd have to identify which past `MeetingRequest.message` values originated from AI vs. were sponsor-typed in a future direct-input UI. Solvable (timestamp-based + null-history heuristics) but not free.
- **Field length is unbounded.** `String?` in SQLite/Turso accepts arbitrary length. Phase 12a's Zod schema caps the AI output at ~400 chars body + 80 greeting + 60 signoff, but a future direct-input UI on the same field could exceed that. Worth knowing; not a blocker.

**Neutral but worth knowing:**

- **Phase 12b's `AiCallLog` table is for call accounting, not message storage.** The two persistence concerns are separable: `MeetingRequest.message` stores the sponsor-shipped intro text; `AiCallLog` (Phase 12b) stores the per-call cost / rate-limit / audit metadata regardless of whether the resulting intro was ever sent. The two tables do not duplicate each other.
- **The field's existence pre-dates Phase 12a.** This ADR doesn't justify the field's addition (that decision happened earlier and is undocumented); it justifies the choice to use the field for AI output. If the field had not existed, the decision space would have been different.
- **Future flows that produce intros write to the same field.** Admin-side outreach drafting (not Phase 12a scope) would extend the convention. The two-flow nature becomes N-flow if AI surfaces multiply.

## References

- Engineer-local sprint PRD (gitignored) §6 Phase 12a — the surface that produces the writes.
- Engineer-local Phase 12 audit + Grip mapping doc (gitignored) — Q1 of the grill that locked this decision (terminology + storage destination).
- [`CONTEXT.md`](../../CONTEXT.md) — glossary entries for `intro`, `MeetingRequest.message`, and `intro draft modal`.
- [`schema.prisma`](../../packages/db/prisma/schema.prisma) — `MeetingRequest` model at line 357; `message` field at line 362.
- [`RecommendedAttendees.tsx`](../../apps/sponsor/components/RecommendedAttendees.tsx) — the surface the AI button extends.
- [ADR 0003](0003-turso-libsql-data-layer.md) — the data layer that carries the field.
- [`decisions.md` → AI](../decisions.md#ai) — index entry (Phase 12a will add a new sub-section).
