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
