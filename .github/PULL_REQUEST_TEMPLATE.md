<!--
Solo-engineer PR template for the WBR project. Filled in by the engineer of
record at PR creation time. When the project moves to a multi-engineer
review model, this template is the right place to add reviewer-facing
sections (test instructions for the reviewer, what to look for, etc.).

Title guidance: imperative mood, specific, self-explanatory. The title is
the durable artifact of this PR in history.
  GOOD: "Gate attendee BackgroundPrefetch fan-out behind requestIdleCallback"
  BAD:  "Phase 1 perf fix", "Fix bug", "Performance work", "WIP"
-->

## Why

<!--
1–3 sentences. Plain English; readable by non-engineers (PM, manager, CEO).
- What problem is this solving?
- What's the measured baseline if applicable?
- What's the expected outcome?
-->

## What changed

<!--
Architectural-level summary of the change. Not a paraphrase of the diff —
the diff itself shows WHAT in detail. Focus on the SHAPE of the change:
which files / which subsystems / what behavior moved.
-->

## Validation

<!-- Fill out what applies; remove lines that don't. -->

- Smoketest: `docs/smoketests/<short-title>.md`
- Codex adversarial review log: `docs/codex-reviews/<short-title>.md` — N rounds, X AC-failing findings → 0
- Local performance measurement (if perf-related):
- Real-device verification (if applicable):
- Production verification path after merge (Vercel preview / production smoke check):

## Rejected alternatives

<!--
Optional. Brief — 2–5 alternatives max, one line of reasoning each.
Captures rationale at PR time before context fades. If the call is
consequential (architectural, hard to reverse, or with broad downstream
impact), promote the entry to `docs/decisions.md`.
-->

## Risks and mitigations

<!--
Optional. Include only for consequential PRs (Phase 1, 9, 12 scale).
- What could go wrong?
- How would we detect it?
- What's the rollback path?
-->

## AI involvement

<!--
Audit trail for AI-assisted work. Be specific — exact model identifiers
matter for post-incident review. Keep this short; the goal is honesty,
not exhaustive logging.
-->

- Primary engineering: Claude Code
- Model identifier: <e.g., claude-opus-4-7>
- Adversarial review: Codex via `codex:rescue` skill
- Approximate proportion AI-assisted: <e.g., 100% AI-drafted, engineer-reviewed; Codex-validated to convergence>

## Links

<!--
Optional. PRD section reference, related PRs (this branch's parent or
follow-ups), ADR entries in `docs/decisions.md`, kickoff Slack threads.
-->
